import assert from 'node:assert/strict'
import test from 'node:test'

import { extractAllImageUrls } from '../packages/core/src/image-utils.js'
import {
  applyWechatCoverInPage,
  applyWechatDigestInPage,
  coverImageForWechat,
  fillWechatContent,
  isWechatEditorUrl,
  pickWechatBodyProseMirrorCandidate,
  wechatEditorUrl,
} from '../packages/core/src/platforms/wechat.js'

function createEditor({ textContent = '', top = 0, height = 120, width = 640, classes = [] } = {}) {
  const classSet = new Set(classes)
  const rect = {
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
  }

  return {
    textContent,
    clientHeight: height,
    clientWidth: width,
    getBoundingClientRect: () => rect,
    closest: selector => {
      const selectors = selector.split(',').map(item => item.trim().replace(/^\./, ''))
      return selectors.some(item => classSet.has(item)) ? { selector } : null
    },
  }
}

function createTitleInput({ top = 0, height = 48 } = {}) {
  return {
    getBoundingClientRect: () => ({
      top,
      bottom: top + height,
      left: 0,
      right: 640,
      width: 640,
      height,
    }),
  }
}

function createInputElement() {
  return {
    value: '',
    focus() {},
    dispatchEvent() {},
  }
}

function createProseMirrorElement({ textContent = '', classes = [], onDispatchEvent } = {}) {
  const classSet = new Set(classes)
  let html = ''
  let text = textContent
  let imageCount = 0
  const innerHTMLWrites = []

  return {
    clientHeight: 480,
    clientWidth: 720,
    innerHTMLWrites,
    focus() {},
    dispatchEvent(event) {
      onDispatchEvent?.(event)
      return true
    },
    get textContent() {
      return text
    },
    set textContent(value) {
      text = value
    },
    get innerHTML() {
      return html
    },
    set innerHTML(value) {
      innerHTMLWrites.push(value)
      html = value
      if (value === '') {
        text = ''
        imageCount = 0
      }
    },
    setRenderedContent(value) {
      html = value
      text = value.replace(/<[^>]*>/g, '')
      imageCount = (value.match(/<img\b/gi) || []).length
    },
    querySelectorAll(selector) {
      if (selector === 'img') return Array.from({ length: imageCount }, () => ({}))
      return []
    },
    getBoundingClientRect: () => ({
      top: classSet.has('title-editor__input') ? 8 : 180,
      bottom: classSet.has('title-editor__input') ? 48 : 660,
      left: 0,
      right: 720,
      width: 720,
      height: classSet.has('title-editor__input') ? 40 : 480,
    }),
    closest: selector => {
      const selectors = selector.split(',').map(item => item.trim().replace(/^\./, ''))
      return selectors.some(item => classSet.has(item)) ? { selector } : null
    },
  }
}

async function withWechatFillEnvironment({ jsapiInvoke, bodyEditor, callback }) {
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    ClipboardEvent: globalThis.ClipboardEvent,
    DataTransfer: globalThis.DataTransfer,
    setTimeout: globalThis.setTimeout,
  }

  const titleInput = createInputElement()
  const titleEditor = createProseMirrorElement({ classes: ['title-editor__input'] })

  class TestEvent {
    constructor(type, init = {}) {
      this.type = type
      Object.assign(this, init)
    }
  }

  class TestDataTransfer {
    constructor() {
      this.data = new Map()
    }

    setData(type, value) {
      this.data.set(type, value)
    }

    getData(type) {
      return this.data.get(type)
    }
  }

  globalThis.Event = TestEvent
  globalThis.ClipboardEvent = TestEvent
  globalThis.DataTransfer = TestDataTransfer
  globalThis.setTimeout = fn => {
    fn()
    return 0
  }

  globalThis.window = {
    waitFor: async selector => {
      if (selector === '#title') return titleInput
      if (selector === '.title-editor__input .ProseMirror') return titleEditor
      return null
    },
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    HTMLInputElement: class HTMLInputElement {},
  }

  if (jsapiInvoke) {
    globalThis.window.__MP_Editor_JSAPI__ = {
      invoke: jsapiInvoke,
    }
  }

  globalThis.document = {
    querySelectorAll: selector => (selector === '.ProseMirror' ? [titleEditor, bodyEditor] : []),
    querySelector: selector => {
      if (selector === '#title') return titleInput
      if (selector === '.title-editor__input .ProseMirror') return titleEditor
      return null
    },
    execCommand: (cmd, showUI, value) => {
      if (cmd === 'insertText' && document.activeElement) {
        document.activeElement.textContent = value
      }
      return true
    },
    activeElement: null,
  }

  try {
    return await callback({ titleInput, titleEditor })
  } finally {
    for (const [key, value] of Object.entries(previousGlobals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
}

test('只有标题编辑器时返回 null，避免把正文贴到标题', () => {
  const titleInput = createTitleInput()
  const titleEditor = createEditor({
    top: 8,
    height: 40,
    width: 640,
    classes: ['title-editor__input'],
  })

  const picked = pickWechatBodyProseMirrorCandidate([titleEditor], { titleInput, titleEditor })
  assert.equal(picked, null)
})

test('标题和正文同时存在时优先选择正文编辑器', () => {
  const titleInput = createTitleInput()
  const titleEditor = createEditor({
    top: 8,
    height: 40,
    width: 640,
    classes: ['title-editor__input'],
  })
  const bodyEditor = createEditor({
    textContent: '从这里开始写正文',
    top: 180,
    height: 520,
    width: 720,
  })

  const picked = pickWechatBodyProseMirrorCandidate([titleEditor, bodyEditor], {
    titleInput,
    titleEditor,
  })
  assert.equal(picked, bodyEditor)
})

test('没有标题编辑器时保留单编辑器场景的兼容性', () => {
  const bodyEditor = createEditor({
    textContent: '正文内容',
    top: 120,
    height: 480,
    width: 720,
  })

  const picked = pickWechatBodyProseMirrorCandidate([bodyEditor], {})
  assert.equal(picked, bodyEditor)
})

test('封面地址优先用已下载的图片，并保留原图 URL', () => {
  const got = coverImageForWechat(
    { thumb: 'https://taokdao.com/media/a.jpg' },
    {
      'https://taokdao.com/media/a.jpg': {
        dataUrl: 'data:image/jpeg;base64,YQ==',
        filename: 'a.jpg',
        mimeType: 'image/jpeg',
      },
    }
  )
  assert.equal(got.dataUrl, 'data:image/jpeg;base64,YQ==')
  assert.equal(got.url, 'https://taokdao.com/media/a.jpg')
  assert.equal(got.filename, 'a.jpg')
})

test('裁切后的 data URL 封面不再回落到外链', () => {
  const got = coverImageForWechat({ thumb: 'data:image/png;base64,YQ==' })
  assert.equal(got.mimeType, 'image/png')
  assert.equal(got.filename, 'cover.png')
  assert.equal(got.url, '')
  assert.equal(coverImageForWechat({ thumb: '/media/a.jpg' }), null)
})

test('保存后的文章地址仍是编辑页', () => {
  const url = wechatEditorUrl('99', '123')
  assert.equal(isWechatEditorUrl(url), true)
  assert.match(url, /appmsgid=123/)
  assert.match(url, /token=99/)
  assert.equal(isWechatEditorUrl('https://mp.weixin.qq.com/'), false)
})

test('封面图地址会和正文图片一起下载', () => {
  const urls = extractAllImageUrls({
    markdown: '![a](https://cdn.example/a.png)',
    body: '',
    wechatHtml: '',
    thumb: 'https://cdn.example/cover.jpg',
  })
  assert.ok(urls.includes('https://cdn.example/a.png'))
  assert.ok(urls.includes('https://cdn.example/cover.jpg'))
  assert.deepEqual(
    extractAllImageUrls({ markdown: '', body: '', thumb: 'data:image/jpeg;base64,YQ==' }),
    []
  )
})

test('摘要写入 120 字输入框，不改动正文编辑器', async () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
  }
  const written = []
  class TestEvent {
    constructor(type) {
      this.type = type
    }
  }
  class TextAreaProto {}
  Object.defineProperty(TextAreaProto.prototype, 'value', {
    set(value) {
      written.push(value)
      this.current = value
    },
  })
  const digest = {
    tagName: 'TEXTAREA',
    id: 'js_description',
    parentElement: null,
    getAttribute: () => '',
    closest: () => null,
    dispatchEvent() {},
  }
  const body = {
    tagName: 'DIV',
    clientHeight: 480,
    className: 'ProseMirror',
    textContent: '正文很长',
    parentElement: null,
    getAttribute: () => null,
    closest(selector) {
      return selector.includes('ProseMirror') ? body : null
    },
    dispatchEvent() {},
  }
  const card = {
    innerText: '0/120',
    textContent: '0/120',
    parentElement: null,
  }
  const visible = {
    tagName: 'DIV',
    parentElement: card,
    textContent: '',
    getAttribute: name => (name === 'contenteditable' ? 'true' : ''),
    closest: () => null,
    focus() {},
    dispatchEvent() {},
  }
  globalThis.Event = TestEvent
  globalThis.window = { HTMLTextAreaElement: TextAreaProto, getSelection: () => null }
  globalThis.document = {
    createRange: null,
    execCommand: () => false,
    querySelectorAll(selector) {
      if (selector.includes('#js_description')) return [digest]
      if (selector.includes('maxlength')) return []
      if (selector.includes('contenteditable')) return [body, visible]
      return []
    },
  }

  try {
    const lead = '信息、行动与自身维持的组织关系'
    const result = await applyWechatDigestInPage(`  ${lead}  `)
    assert.equal(result.success, true)
    assert.equal(written[0], lead)
    assert.equal(visible.textContent, lead)
    assert.equal(body.textContent, '正文很长')
    assert.equal(result.length, [...lead].length)
    const clipped = await applyWechatDigestInPage('字'.repeat(130))
    assert.equal([...(clipped && written.at(-1))].length, 120)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})

test('编辑页凭证齐全时上传封面并调用改封面接口', async () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  }
  const calls = []
  globalThis.window = {
    location: new URL('https://mp.weixin.qq.com/cgi-bin/appmsg?token=77&lang=zh_CN'),
    __MP_Editor_JSAPI__: {
      invoke(params) {
        calls.push(params)
        params.sucCb({ ok: true })
      },
    },
  }
  globalThis.document = {
    querySelectorAll: () => [
      {
        textContent: 'var cgi = { ticket: "tk", user_name: "gh_test", time: "1700000000" }',
      },
    ],
  }
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.startsWith('data:')) {
      return { blob: async () => new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' }) }
    }
    assert.equal(init.method, 'POST')
    assert.match(url, /ticket_id=gh_test/)
    assert.match(url, /token=77/)
    return {
      json: async () => ({
        cdn_url: 'http://mmbiz.qpic.cn/mmbiz_jpg/cover',
        base_resp: { err_msg: 'ok' },
      }),
    }
  }

  try {
    const result = await applyWechatCoverInPage({
      dataUrl: 'data:image/jpeg;base64,YQ==',
      url: '',
      filename: 'cover.jpg',
      mimeType: 'image/jpeg',
    })
    assert.equal(result.success, true)
    assert.equal(result.url, 'https://mmbiz.qpic.cn/mmbiz_jpg/cover')
    assert.equal(calls[0].apiName, 'mp_editor_change_cover')
    assert.deepEqual(calls[0].apiParam, { oriImgUrl: 'https://mmbiz.qpic.cn/mmbiz_jpg/cover' })
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})

test('正文填充优先使用微信编辑器 JSAPI 注入含图 HTML', async () => {
  const htmlBody = '<p>正文</p><img src="https://example.com/a.png">'
  const bodyEditor = createProseMirrorElement({
    textContent: '从这里开始写正文',
  })
  const calls = []

  const result = await withWechatFillEnvironment({
    bodyEditor,
    jsapiInvoke: params => {
      calls.push(params)
      bodyEditor.setRenderedContent(params.apiParam.content)
      params.sucCb({})
    },
    callback: () => fillWechatContent('测试标题', htmlBody),
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].apiName, 'mp_editor_set_content')
  assert.deepEqual(calls[0].apiParam, { content: htmlBody })
  assert.equal(result.success, true)
  assert.equal(result.wordCount, 2)
  assert.equal(result.imageCount, 1)
})

test('微信 JSAPI 不可用时使用 paste 事件兜底而不是直接写 innerHTML', async () => {
  const htmlBody = '<p>正文</p>'
  let pasteEvent
  const bodyEditor = createProseMirrorElement({
    textContent: '从这里开始写正文',
    onDispatchEvent: event => {
      if (event.type === 'paste') {
        pasteEvent = event
        bodyEditor.setRenderedContent(event.clipboardData.getData('text/html'))
      }
    },
  })

  const result = await withWechatFillEnvironment({
    bodyEditor,
    callback: () => fillWechatContent('测试标题', htmlBody),
  })

  assert.equal(pasteEvent?.type, 'paste')
  assert.equal(pasteEvent.clipboardData.getData('text/html'), htmlBody)
  assert.equal(bodyEditor.innerHTML, htmlBody)
  assert.deepEqual(bodyEditor.innerHTMLWrites, [''])
  assert.equal(result.success, true)
  assert.equal(result.wordCount, 2)
})
