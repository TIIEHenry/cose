import { injectUtils } from './common.js'

// 微信公众号平台配置
const WechatPlatform = {
  id: 'wechat',
  name: 'WeChat',
  icon: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico',
  url: 'https://mp.weixin.qq.com',
  // 先打开草稿箱，再自动点击新建
  publishUrl:
    'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10',
  title: '微信公众号',
  type: 'wechat',
}

function getEditorArea(editor) {
  return (editor?.clientHeight || 0) * (editor?.clientWidth || 0)
}

// 扩展的标题编辑器选择器列表（按优先级排序）
const TITLE_EDITOR_SELECTORS = [
  '.title-editor__input .ProseMirror',
  '.publish_title_editor .ProseMirror',
  '.article-title-editor .ProseMirror',
  '[class*="title-editor"] .ProseMirror',
  '[class*="title_editor"] .ProseMirror',
  '[class*="titleEditor"] .ProseMirror',
]

function isWechatTitleEditor(editor, titleEditor) {
  if (!editor) return false
  if (editor === titleEditor) return true

  // 检查是否在任意已知的标题编辑器容器内
  for (const selector of TITLE_EDITOR_SELECTORS) {
    if (editor.closest?.(selector.split(' .ProseMirror')[0])) return true
  }

  return false
}

function findTitleEditor() {
  for (const selector of TITLE_EDITOR_SELECTORS) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

function findTitleInput() {
  return (
    document.querySelector('#title') ||
    document.querySelector('input[placeholder*="标题"]') ||
    document.querySelector('textarea[placeholder*="标题"]') ||
    document.querySelector('input[id*="title"]') ||
    document.querySelector('textarea[id*="title"]')
  )
}

function pickWechatBodyProseMirrorCandidate(nodes, { titleInput, titleEditor } = {}) {
  const bodyCandidates = nodes.filter(editor => !isWechatTitleEditor(editor, titleEditor))
  if (bodyCandidates.length === 0) return null
  if (bodyCandidates.length === 1) return bodyCandidates[0]

  const byPlaceholder = bodyCandidates.find(editor =>
    (editor.textContent || '').includes('从这里开始写正文')
  )
  if (byPlaceholder) return byPlaceholder

  // 按位置筛选：位于标题输入框下方的 editor
  if (titleInput) {
    const band = titleInput.getBoundingClientRect()
    const belowTitle = bodyCandidates.filter(editor => {
      const rect = editor.getBoundingClientRect()
      return rect.top >= band.bottom - 8
    })
    if (belowTitle.length > 0) {
      return belowTitle.sort((a, b) => getEditorArea(b) - getEditorArea(a))[0]
    }
  }

  // 最后兜底：排除靠近页面顶部的 editor（通常是标题编辑器）
  const pageTop = 50
  const notAtTop = bodyCandidates.filter(editor => {
    const rect = editor.getBoundingClientRect()
    return rect.top > pageTop
  })
  if (notAtTop.length > 0) {
    return notAtTop.sort((a, b) => getEditorArea(b) - getEditorArea(a))[0]
  }

  return bodyCandidates.sort((a, b) => getEditorArea(b) - getEditorArea(a))[0]
}

// 微信公众号内容填充函数（在页面主世界中执行）
// 注意：需要先调用 injectUtils 注入 window.waitFor
async function fillWechatContent(title, htmlBody) {
  /**
   * 后台改版后可能存在多个 `.ProseMirror`（标题区也可能是 ProseMirror），
   * `querySelector('.ProseMirror')` 常会命中标题编辑器，导致正文 HTML 被贴进标题。
   * 另外，正文编辑器有时会比标题编辑器晚挂载，这时也要继续等待，不能把唯一节点误判成正文。
   */
  // 标题编辑器选择器列表（与外部保持同步）
  const TITLE_SELECTORS = [
    '.title-editor__input .ProseMirror',
    '.publish_title_editor .ProseMirror',
    '.article-title-editor .ProseMirror',
    '[class*="title-editor"] .ProseMirror',
    '[class*="title_editor"] .ProseMirror',
    '[class*="titleEditor"] .ProseMirror',
  ]
  function findTitleEditor() {
    for (const sel of TITLE_SELECTORS) {
      const el = document.querySelector(sel)
      if (el) return el
    }
    return null
  }
  function findTitleInput() {
    return (
      document.querySelector('#title') ||
      document.querySelector('input[placeholder*="标题"]') ||
      document.querySelector('textarea[placeholder*="标题"]') ||
      document.querySelector('input[id*="title"]') ||
      document.querySelector('textarea[id*="title"]')
    )
  }
  function pickWechatBodyProseMirror() {
    function getEditorArea(editor) {
      return (editor?.clientHeight || 0) * (editor?.clientWidth || 0)
    }
    function isTitleEditor(editor) {
      if (!editor) return false
      for (const sel of TITLE_SELECTORS) {
        const containerSel = sel.split(' .ProseMirror')[0]
        if (editor.closest?.(containerSel)) return true
      }
      return false
    }
    function pickCandidate(nodes, { titleInput } = {}) {
      const bodyCandidates = nodes.filter(editor => !isTitleEditor(editor))
      if (bodyCandidates.length === 0) return null
      if (bodyCandidates.length === 1) return bodyCandidates[0]

      const byPlaceholder = bodyCandidates.find(editor =>
        (editor.textContent || '').includes('从这里开始写正文')
      )
      if (byPlaceholder) return byPlaceholder

      if (titleInput) {
        const band = titleInput.getBoundingClientRect()
        const belowTitle = bodyCandidates.filter(editor => {
          const rect = editor.getBoundingClientRect()
          return rect.top >= band.bottom - 8
        })
        if (belowTitle.length > 0) {
          return belowTitle.sort((a, b) => getEditorArea(b) - getEditorArea(a))[0]
        }
      }

      // 兜底：排除靠近页面顶部的 editor（通常是标题编辑器）
      const notAtTop = bodyCandidates.filter(editor => {
        const rect = editor.getBoundingClientRect()
        return rect.top > 50
      })
      if (notAtTop.length > 0) {
        return notAtTop.sort((a, b) => getEditorArea(b) - getEditorArea(a))[0]
      }

      return bodyCandidates.sort((a, b) => getEditorArea(b) - getEditorArea(a))[0]
    }

    const nodes = [...document.querySelectorAll('.ProseMirror')]
    if (nodes.length === 0) return null

    const titleInput = findTitleInput()
    return pickCandidate(nodes, { titleInput })
  }

  async function waitForBodyEditor(timeout = 15000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const el = pickWechatBodyProseMirror()
      if (el) return el
      await new Promise(r => setTimeout(r, 100))
    }
    return pickWechatBodyProseMirror()
  }

  try {
    const titleInput = findTitleInput()
    // 优先用 waitFor 等待标题输入框出现，不限于 #title
    const waitTitleInput = await window.waitFor(
      '#title, input[placeholder*="标题"], textarea[placeholder*="标题"], input[id*="title"]',
      15000
    )

    // 填充标题（优先于正文，避免焦点停留在标题区的 ProseMirror）
    if (title) {
      const input = waitTitleInput || titleInput
      const titleEditorEl = findTitleEditor()

      // 判断 input 是否可见（微信改版后 #title 是隐藏的 textarea，只是数据同步用）
      const isInputVisible = input && input.offsetHeight > 0 && input.style?.visibility !== 'hidden'

      // 方式1（优先）：ProseMirror 标题编辑器 — 微信改版后的实际可见标题区
      if (titleEditorEl) {
        titleEditorEl.focus()
        // ProseMirror 需要先全选再替换，确保触发内部状态更新
        document.execCommand('selectAll', false, null)
        document.execCommand('insertText', false, title)
        titleEditorEl.dispatchEvent(new Event('input', { bubbles: true }))
        console.log('[COSE] 微信标题已填充 (ProseMirror):', title)
      }
      // 方式2：传统可见 input/textarea 元素
      else if (isInputVisible) {
        input.focus()
        const nativeSetter =
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(input, title)
        } else {
          input.value = title
        }
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        console.log('[COSE] 微信标题已填充 (input):', title)
      }
      // 方式3：隐藏的表单字段兜底（至少同步数据）
      else if (input) {
        const nativeSetter =
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(input, title)
        } else {
          input.value = title
        }
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        console.log('[COSE] 微信标题已填充 (hidden input 兜底):', title)
      } else {
        console.warn('[COSE] 未找到标题输入元素，跳过标题填充')
      }
    }

    await new Promise(r => setTimeout(r, 300))

    // 剥离正文中的第一个 h1 标题——标题已单独填入标题输入框，
    // 保留在正文中会导致 ProseMirror 节点错乱且无法正常删除
    if (title) {
      htmlBody = htmlBody.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')
    }

    const editor = await waitForBodyEditor(15000)
    if (!editor) {
      return { success: false, error: '未找到正文编辑器' }
    }

    // 填充正文内容
    if (editor && htmlBody) {
      editor.focus()

      // 清空现有占位符内容
      if (editor.textContent.includes('从这里开始写正文')) {
        editor.innerHTML = ''
      }

      const plainText = htmlBody.replace(/<[^>]*>/g, '')
      const hasImageInSource = /<img\b/i.test(htmlBody)
      let injected = false
      let injectError = ''

      // 优先使用微信编辑器 JSAPI。合成 Ctrl+V 事件不会触发真实粘贴；
      // 直接写 innerHTML 也不会可靠同步到 ProseMirror 的文档模型。
      if (window.__MP_Editor_JSAPI__ && typeof window.__MP_Editor_JSAPI__.invoke === 'function') {
        injected = await new Promise(resolve => {
          let done = false
          const finish = (ok, err) => {
            if (done) return
            done = true
            if (err) injectError = err.message || String(err)
            resolve(ok)
          }

          try {
            window.__MP_Editor_JSAPI__.invoke({
              apiName: 'mp_editor_set_content',
              apiParam: { content: htmlBody },
              sucCb: () => finish(true),
              errCb: err => finish(false, err),
            })
          } catch (err) {
            finish(false, err)
          }

          setTimeout(() => finish(false, new Error('mp_editor_set_content 调用超时')), 5000)
        })

        if (injected) {
          console.log('[COSE] 微信内容已通过 mp_editor_set_content 注入')
          await new Promise(r => setTimeout(r, 800))
        } else {
          console.warn('[COSE] mp_editor_set_content 注入失败:', injectError)
        }
      }

      if (!injected) {
        if (hasImageInSource) {
          console.warn('[COSE] 正文包含图片，但微信 JSAPI 不可用；paste 兜底可能无法保留图片')
        }

        const dt = new DataTransfer()
        dt.setData('text/html', htmlBody)
        dt.setData('text/plain', plainText)

        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        })

        editor.dispatchEvent(pasteEvent)
        console.log('[COSE] 微信内容已通过 paste 事件注入（兜底方案）')

        // 等待内容渲染
        await new Promise(r => setTimeout(r, 800))
      }

      // 验证内容是否注入成功
      const wordCount = editor.textContent?.trim().length || 0
      const imageCount = editor.querySelectorAll?.('img').length || 0
      const hasEditorContent = wordCount > 0 || imageCount > 0 || injected

      const titleEditorEl = findTitleEditor()
      return {
        success: hasEditorContent,
        error: hasEditorContent ? undefined : injectError || '正文注入后未检测到有效内容',
        wordCount,
        imageCount,
        titleFilled:
          waitTitleInput?.value === title || titleEditorEl?.textContent?.trim() === title,
      }
    }

    return { success: false, error: '内容为空' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function isWechatEditorUrl(url) {
  return typeof url === 'string' && url.includes('appmsg_edit')
}

export function wechatEditorUrl(token, appMsgId) {
  const params = new URLSearchParams({
    t: 'media/appmsg_edit_v2',
    action: 'edit',
    type: '10',
    appmsgid: String(appMsgId),
    token: String(token),
    lang: 'zh_CN',
  })
  return `https://mp.weixin.qq.com/cgi-bin/appmsg?${params}`
}

/** 封面：裁切 data URL 直接上传；公网图优先用已下载缓存，没有缓存时仍把原 URL 交给编辑器。 */
export function coverImageForWechat(content, imageCache) {
  const thumb = String(content?.thumb || '').trim()
  if (!thumb) return null
  if (thumb.startsWith('data:image/')) {
    const mime = thumb.slice(5, thumb.indexOf(';')) || 'image/jpeg'
    const ext = mime.includes('png') ? 'png' : 'jpg'
    return { dataUrl: thumb, url: '', filename: `cover.${ext}`, mimeType: mime }
  }
  if (!/^https?:\/\//i.test(thumb)) return null
  const cached = imageCache?.[thumb]
  if (cached?.dataUrl) {
    return {
      dataUrl: cached.dataUrl,
      url: thumb,
      filename: cached.filename || 'cover.jpg',
      mimeType: cached.mimeType || 'image/jpeg',
    }
  }
  return { dataUrl: '', url: thumb, filename: 'cover.jpg', mimeType: 'image/jpeg' }
}

async function focusWechatTab(chrome, tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true })
  } catch (err) {
    console.log('[COSE] 激活公众号文章页失败:', err?.message || err)
  }
}

/**
 * 在公众号编辑页主世界上传封面并调用 mp_editor_change_cover。
 * 函数会整段注入页面，不能引用本模块的其它函数。
 */
async function applyWechatCoverInPage(image) {
  if (!image || (!image.dataUrl && !image.url)) {
    return { success: false, error: '没有封面' }
  }

  const setCover = cdnUrl =>
    new Promise(resolve => {
      const api = window.__MP_Editor_JSAPI__
      if (!api || typeof api.invoke !== 'function') {
        resolve({ success: false, error: '编辑器还不能设置封面' })
        return
      }
      let done = false
      let timer = 0
      const finish = (ok, err) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(
          ok ? { success: true, url: cdnUrl } : { success: false, error: err || '设置封面失败' }
        )
      }
      timer = setTimeout(() => finish(false, '设置封面超时'), 20000)
      try {
        api.invoke({
          apiName: 'mp_editor_change_cover',
          apiParam: { oriImgUrl: cdnUrl },
          sucCb: () => finish(true),
          errCb: err => finish(false, (err && (err.message || err.err_msg)) || '设置封面失败'),
        })
      } catch (err) {
        finish(false, err.message || '设置封面失败')
      }
    })

  const readMeta = () => {
    const chunks = []
    for (const script of document.querySelectorAll('script:not([src])')) {
      if (script.textContent) chunks.push(script.textContent)
    }
    const html = chunks.join('\n')
    const pick = re => html.match(re)?.[1] || ''
    const globals = [window.wx && window.wx.commonData, window.wx && window.wx.data, window.cgiData]
    let ticket = ''
    let userName = ''
    let svrTime = ''
    for (const item of globals) {
      if (!item) continue
      ticket = ticket || item.ticket || ''
      userName = userName || item.user_name || item.userName || ''
      svrTime = svrTime || item.time || item.svrTime || ''
    }
    return {
      ticket: ticket || pick(/ticket:\s*["']([^"']+)["']/) || pick(/"ticket"\s*:\s*"([^"]+)"/),
      userName:
        userName || pick(/user_name:\s*["']([^"']+)["']/) || pick(/"user_name"\s*:\s*"([^"]+)"/),
      svrTime: String(
        svrTime ||
          pick(/\btime:\s*["'](\d+)["']/) ||
          pick(/"time"\s*:\s*"?(\d+)"?/) ||
          Math.floor(Date.now() / 1000)
      ),
    }
  }

  let cdnUrl = ''
  if (image.dataUrl) {
    const meta = readMeta()
    const token = new URL(window.location.href).searchParams.get('token') || ''
    if (meta.ticket && meta.userName && token) {
      try {
        const blob = await (await fetch(image.dataUrl)).blob()
        const form = new FormData()
        const filename = image.filename || 'cover.jpg'
        form.append('type', image.mimeType || blob.type || 'image/jpeg')
        form.append('id', String(Date.now()))
        form.append('name', filename)
        form.append('lastModifiedDate', new Date().toString())
        form.append('size', String(blob.size))
        form.append('file', blob, filename)
        const seq = Date.now()
        const uploadUrl =
          'https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1' +
          `&ticket_id=${encodeURIComponent(meta.userName)}&ticket=${encodeURIComponent(meta.ticket)}` +
          `&svr_time=${encodeURIComponent(meta.svrTime)}&token=${encodeURIComponent(token)}&lang=zh_CN&seq=${seq}&t=${Math.random()}`
        const res = await fetch(uploadUrl, { method: 'POST', credentials: 'include', body: form })
        const data = await res.json()
        cdnUrl = data && data.cdn_url ? String(data.cdn_url) : ''
        if (!cdnUrl && !image.url) {
          return {
            success: false,
            error: (data && data.base_resp && data.base_resp.err_msg) || '封面上传失败',
          }
        }
      } catch (err) {
        if (!image.url) return { success: false, error: err.message || '封面上传失败' }
      }
    } else if (!image.url) {
      return { success: false, error: '公众号页面缺少封面上传凭证' }
    }
  }

  if (!cdnUrl && image.url && /^https?:\/\//i.test(image.url)) cdnUrl = image.url
  if (!cdnUrl) return { success: false, error: '没有可用的封面地址' }
  if (cdnUrl.startsWith('http://')) cdnUrl = `https://${cdnUrl.slice('http://'.length)}`
  return setCover(cdnUrl)
}

/** 记下保存草稿接口返回的 appMsgId，刷新后仍能从 sessionStorage 读到。 */
function armWechatSaveCaptureInPage() {
  if (window.__coseWechatSaveArmed) return { success: true }
  window.__coseWechatSaveArmed = true
  window.__coseWechatSaveCapture = { appMsgId: '' }
  try {
    sessionStorage.removeItem('cose-wechat-appmsgid')
  } catch {
    // 页面禁止存储时仍靠内存记下 id
  }

  const remember = (url, text) => {
    if (!url || !String(url).includes('operate_appmsg')) return
    try {
      const data = JSON.parse(text)
      const id = data && (data.appMsgId || data.appmsgid)
      if (!id) return
      const value = String(id)
      window.__coseWechatSaveCapture.appMsgId = value
      try {
        sessionStorage.setItem('cose-wechat-appmsgid', value)
      } catch {
        // ignore
      }
    } catch {
      // 非 JSON 响应忽略
    }
  }

  const origFetch = window.fetch
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      return Promise.resolve(origFetch.apply(this, args)).then(res => {
        const input = args[0]
        const url = typeof input === 'string' ? input : (input && input.url) || ''
        res
          .clone()
          .text()
          .then(text => remember(url, text))
          .catch(() => {})
        return res
      })
    }
  }

  const proto = XMLHttpRequest.prototype
  const origOpen = proto.open
  const origSend = proto.send
  proto.open = function (method, url, ...rest) {
    this.__coseUrl = url
    return origOpen.call(this, method, url, ...rest)
  }
  proto.send = function (...args) {
    this.addEventListener('load', () => remember(this.__coseUrl, this.responseText))
    return origSend.apply(this, args)
  }
  return { success: true }
}

function readWechatSavedAppMsgIdInPage() {
  const fromWindow = window.__coseWechatSaveCapture && window.__coseWechatSaveCapture.appMsgId
  if (fromWindow) return String(fromWindow)
  try {
    return sessionStorage.getItem('cose-wechat-appmsgid') || ''
  } catch {
    return ''
  }
}

/**
 * 把摘要写进公众号编辑页。不填时，保存会抓正文前 54 字，题眼、导读和正文会粘成一段。
 * 函数会整段注入页面，不能引用本模块的其它函数。
 */
function applyWechatDigestInPage(desc) {
  const value = String(desc || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const clipped = Array.from(value).slice(0, 120).join('')
  if (!clipped) return { success: false, error: '没有摘要' }

  const isTitle = el => {
    if (!el || el.id === 'title') return Boolean(el)
    const hint = `${el.getAttribute?.('placeholder') || ''} ${el.id || ''} ${el.name || ''}`
    if (hint.includes('标题') || /(^|[_\-\s])title([_\-\s]|$)/i.test(hint)) return true
    return Boolean(
      el.closest?.(
        '.title-editor__input, .publish_title_editor, .article-title-editor, [class*="title-editor"], [class*="title_editor"], [class*="titleEditor"]'
      )
    )
  }

  const isBody = el => {
    const editor = el?.closest?.('.ProseMirror')
    if (!editor) return false
    return (editor.clientHeight || 0) > 200
  }

  const hostsDigest = el => {
    let parent = el.parentElement
    for (let i = 0; i < 5 && parent; i += 1) {
      const text = (parent.innerText || parent.textContent || '').replace(/\s+/g, ' ').trim()
      if (text.length > 500) break
      if (/\/\s*120/.test(text)) return true
      parent = parent.parentElement
    }
    return false
  }

  const fields = []
  const push = el => {
    if (!el || fields.includes(el) || isTitle(el) || isBody(el)) return
    fields.push(el)
  }

  document
    .querySelectorAll('#js_description, textarea.js_desc, #js_desc, textarea[name="digest"]')
    .forEach(push)
  document.querySelectorAll('textarea[maxlength="120"]').forEach(push)
  document.querySelectorAll('textarea, [contenteditable="true"]').forEach(el => {
    if (hostsDigest(el)) push(el)
  })

  if (!fields.length) return { success: false, error: '未找到摘要输入框' }

  const writeControl = el => {
    const tag = (el.tagName || '').toUpperCase()
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const proto =
        tag === 'TEXTAREA'
          ? window.HTMLTextAreaElement?.prototype
          : window.HTMLInputElement?.prototype
      const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set
      if (setter) setter.call(el, clipped)
      else el.value = clipped
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    el.focus?.()
    const selection = window.getSelection?.()
    if (selection && document.createRange) {
      const range = document.createRange()
      range.selectNodeContents(el)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    let wrote = false
    try {
      wrote = document.execCommand?.('insertText', false, clipped) === true
    } catch {
      wrote = false
    }
    if (!wrote || (el.textContent || '').replace(/\s+/g, ' ').trim() !== clipped) {
      el.textContent = clipped
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  fields.forEach(writeControl)
  return { success: true, length: Array.from(clipped).length }
}

// 微信公众号保存草稿函数（在页面主世界中执行）
function saveWechatDraft() {
  const saveDraftBtn = Array.from(document.querySelectorAll('button')).find(b =>
    b.textContent.includes('保存为草稿')
  )
  if (saveDraftBtn) {
    saveDraftBtn.click()
    console.log('[COSE] 已点击保存为草稿')
    return { success: true }
  }
  return { success: false, error: '未找到保存按钮' }
}

/**
 * 微信公众号同步处理器
 * @param {object} tab - Chrome tab 对象（初始为首页）
 * @param {object} content - 内容对象 { title, body, markdown, wechatHtml }
 * @param {object} helpers - 帮助函数 { chrome, waitForTab, addTabToSyncGroup, PLATFORMS }
 * @returns {Promise<{success: boolean, message?: string, tabId?: number}>}
 */
async function syncWechatContent(tab, content, helpers) {
  const { chrome, waitForTab } = helpers

  // 步骤1：等待首页加载完成
  console.log('[COSE] 微信公众号等待页面加载')
  await waitForTab(tab.id)

  // 注入公共工具函数（waitFor, setInputValue）
  await injectUtils(chrome, tab.id)

  // 步骤2：使用 MutationObserver 监听获取 token
  console.log('[COSE] 开始检测 token...')
  const [tokenResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      return new Promise(resolve => {
        // 先检查当前页面是否已有 token
        const checkToken = () => {
          const urlMatch = window.location.href.match(/token=(\d+)/)
          if (urlMatch) return urlMatch[1]

          const links = document.querySelectorAll('a[href*="token"]')
          for (const link of links) {
            const match = link.href?.match(/token=(\d+)/)
            if (match) return match[1]
          }

          const scripts = document.querySelectorAll('script:not([src])')
          for (const script of scripts) {
            const content = script.textContent
            const match = content.match(/token["']?\s*[:=]\s*["']?(\d+)["']?/i)
            if (match && match[1]) return match[1]
          }
          return null
        }

        const existing = checkToken()
        if (existing) return resolve(existing)

        // 使用 MutationObserver 监听 DOM 变化
        const observer = new MutationObserver(() => {
          const token = checkToken()
          if (token) {
            observer.disconnect()
            resolve(token)
          }
        })
        observer.observe(document.documentElement, { childList: true, subtree: true })

        // 超时保护
        setTimeout(() => {
          observer.disconnect()
          resolve(checkToken())
        }, 10000)
      })
    },
    world: 'MAIN',
  })

  const token = tokenResult?.result

  if (!token) {
    console.error('[COSE] 无法从页面获取 token')
    return { success: false, message: '无法获取微信公众号 token，请确保已登录', tabId: tab.id }
  }

  // 步骤3：跳转到编辑器页面
  const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=${token}&lang=zh_CN`
  console.log('[COSE] 获取到 token:', token, '跳转到编辑器')

  await chrome.tabs.update(tab.id, { url: editorUrl, active: true })
  await waitForTab(tab.id)
  await focusWechatTab(chrome, tab.id)

  // 使用剪贴板 HTML（带完整样式）或降级到 body
  const htmlContent = content.wechatHtml || content.body
  console.log('[COSE] 微信 HTML 内容长度:', htmlContent?.length || 0)

  // 步骤4：使用 MutationObserver 监听编辑器出现
  console.log('[COSE] 正在等待编辑器...')
  const [editorResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      return new Promise(resolve => {
        const existing = document.querySelector('.ProseMirror')
        if (existing) return resolve(true)

        const observer = new MutationObserver(() => {
          if (document.querySelector('.ProseMirror')) {
            observer.disconnect()
            resolve(true)
          }
        })
        observer.observe(document.documentElement, { childList: true, subtree: true })

        setTimeout(() => {
          observer.disconnect()
          resolve(!!document.querySelector('.ProseMirror'))
        }, 15000)
      })
    },
    world: 'MAIN',
  })

  if (!editorResult?.result) {
    console.error('[COSE] 编辑器等待超时')
    return { success: false, message: '编辑器加载超时', tabId: tab.id }
  }

  console.log('[COSE] 编辑器已就绪，开始注入内容...')

  // 页面跳转后需要重新注入工具函数（waitFor, setInputValue）
  await injectUtils(chrome, tab.id)

  // 步骤5：填充内容
  let result
  try {
    result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillWechatContent,
      args: [content.title, htmlContent],
      world: 'MAIN',
    })
  } catch (e) {
    console.error('[COSE] executeScript 执行失败:', e)
    return { success: false, message: '脚本执行失败: ' + e.message, tabId: tab.id }
  }

  const fillResult = result?.[0]?.result
  console.log('[COSE] 微信填充结果:', JSON.stringify(fillResult, null, 2))

  if (!fillResult?.success) {
    console.error('[COSE] 微信内容填充失败:', fillResult?.error)
    return { success: false, message: fillResult?.error || '内容填充失败', tabId: tab.id }
  }

  console.log('[COSE] 微信内容填充成功，字数:', fillResult.wordCount)

  // 步骤6：写摘要。留空时公众号会抓正文前 54 字。
  const digest = (content?.desc || '').trim()
  let digestError = ''
  if (digest) {
    try {
      const [digestResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: applyWechatDigestInPage,
        args: [digest],
        world: 'MAIN',
      })
      const applied = digestResult?.result
      if (applied?.success) {
        console.log('[COSE] 微信摘要已写入:', applied.length)
      } else {
        digestError = applied?.error || '摘要未写入'
        console.warn('[COSE] 微信摘要未写入:', digestError)
      }
    } catch (err) {
      digestError = err?.message || '摘要未写入'
      console.warn('[COSE] 微信摘要脚本失败:', digestError)
    }
  }

  // 步骤7：先写封面。保存草稿会把编辑器状态落盘，封面必须在点击之前设好。
  const coverImage = coverImageForWechat(content, helpers.imageCache)
  let coverError = ''
  if ((content?.thumb || '').trim()) {
    if (!coverImage) {
      coverError = '封面地址不是可上传的图片'
    } else {
      try {
        const [coverResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: applyWechatCoverInPage,
          args: [coverImage],
          world: 'MAIN',
        })
        const applied = coverResult?.result
        if (applied?.success) {
          console.log('[COSE] 微信封面已设置:', applied.url)
        } else {
          coverError = applied?.error || '封面未写入'
          console.warn('[COSE] 微信封面未写入:', coverError)
        }
      } catch (err) {
        coverError = err?.message || '封面未写入'
        console.warn('[COSE] 微信封面脚本失败:', coverError)
      }
    }
  }

  // 步骤8：保存草稿。保存后若离开编辑页，用 appMsgId 再打开这篇文章。
  await new Promise(resolve => setTimeout(resolve, 500))
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: armWechatSaveCaptureInPage,
      world: 'MAIN',
    })
  } catch (err) {
    console.log('[COSE] 安装公众号保存监听失败:', err?.message || err)
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: saveWechatDraft,
    world: 'MAIN',
  })

  let appMsgId = ''
  const saveClickedAt = Date.now()
  const deadline = saveClickedAt + 8000
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 400))
    let currentUrl = ''
    try {
      currentUrl = (await chrome.tabs.get(tab.id)).url || ''
    } catch {
      break
    }
    try {
      const [read] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readWechatSavedAppMsgIdInPage,
        world: 'MAIN',
      })
      if (read?.result) appMsgId = String(read.result)
    } catch {
      // 保存导致跳转时，注入会失败，继续看地址栏
    }
    if (isWechatEditorUrl(currentUrl)) {
      if (/[?&]appmsgid=\d+/.test(currentUrl) || Date.now() - saveClickedAt > 2000) break
    } else if (appMsgId) {
      break
    }
  }

  let finalUrl = editorUrl
  try {
    finalUrl = (await chrome.tabs.get(tab.id)).url || editorUrl
  } catch {
    finalUrl = editorUrl
  }
  if (appMsgId && !isWechatEditorUrl(finalUrl)) {
    finalUrl = wechatEditorUrl(token, appMsgId)
    await chrome.tabs.update(tab.id, { url: finalUrl, active: true })
    await waitForTab(tab.id)
  }
  await focusWechatTab(chrome, tab.id)
  try {
    finalUrl = (await chrome.tabs.get(tab.id)).url || finalUrl
  } catch {
    // 标签已关时保留上一次地址
  }

  const notes = []
  if ((content?.thumb || '').trim()) {
    notes.push(coverError ? `封面未写入：${coverError}` : '封面已写入')
  }
  if (digest) notes.push(digestError ? `摘要未写入：${digestError}` : '摘要已写入')
  const message = notes.length ? `已打开文章页。${notes.join('。')}` : '已打开文章页'

  return {
    success: true,
    message,
    tabId: tab.id,
    editResp: { draftLink: isWechatEditorUrl(finalUrl) ? finalUrl : '' },
  }
}

// 导出
export {
  WechatPlatform,
  fillWechatContent,
  pickWechatBodyProseMirrorCandidate,
  syncWechatContent,
  applyWechatCoverInPage,
  applyWechatDigestInPage,
}
