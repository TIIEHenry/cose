// 腾讯云开发者平台配置
const TencentCloudPlatform = {
  id: 'tencentcloud',
  name: 'TencentCloud',
  icon: 'https://cloudcache.tencent-cloud.com/qcloud/favicon.ico',
  url: 'https://cloud.tencent.com/developer',
  publishUrl: 'https://cloud.tencent.com/developer/article/write',
  title: '腾讯云开发者社区',
  type: 'tencentcloud',
}

/** True when this control switches the rich-text editor into Markdown. */
export function isTencentSwitchToMarkdown(text, className = '') {
  const value = String(text || '').replace(/\s+/g, '')
  if (value.includes('富文本')) return false
  if (
    value.includes('切换') &&
    (value.includes('MD') || value.toLowerCase().includes('markdown'))
  ) {
    return true
  }
  const cls = String(className || '')
  return cls.includes('switch-editor') && value.length <= 40
}

/** The editor accepted the article when a prefix of the source is present. */
export function tencentEditorFilled(actual, expected) {
  const got = String(actual || '').replace(/\s+/g, '')
  const want = String(expected || '').replace(/\s+/g, '')
  if (!want) return true
  if (!got) return false
  return got.includes(want.slice(0, Math.min(48, want.length)))
}

/** CodeMirror 6 view hanging off `.cm-content` or `.cm-editor`. */
export function tencentCodeMirror6View(node) {
  const attached = node?.cmView
  if (attached?.dispatch && attached?.state?.doc) return attached
  const view = attached?.rootView?.view || attached?.view || attached?.root?.view || null
  if (view?.dispatch && view?.state?.doc) return view
  return null
}

/**
 * 在腾讯云写文章页主世界填充标题和 Markdown。
 * 函数会整段注入页面，不能引用本模块的其它函数。
 * 当前编辑器是 Cherry Markdown（CodeMirror 6，`.cm-content`）。
 * 旧页仍可能是 CodeMirror 5 或 Monaco。
 */
async function fillTencentCloudContent(title, markdown) {
  const contentToFill = markdown || ''

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function compact(text) {
    return String(text || '').replace(/\s+/g, '')
  }

  function isSwitch(el) {
    const text = compact(el.textContent)
    if (text.includes('富文本')) return false
    if (text.length > 40) return false
    if (text.includes('切换') && (text.includes('MD') || text.toLowerCase().includes('markdown'))) {
      return true
    }
    const cls = typeof el.className === 'string' ? el.className : ''
    return cls.includes('switch-editor')
  }

  function cm6From(node) {
    const attached = node?.cmView
    if (attached?.dispatch && attached?.state?.doc) return attached
    const view = attached?.rootView?.view || attached?.view || attached?.root?.view || null
    if (view?.dispatch && view?.state?.doc) return view
    return null
  }

  function findCm6() {
    for (const node of document.querySelectorAll('.cm-content, .cm-editor')) {
      const view = cm6From(node)
      if (view) return view
    }
    return null
  }

  function findCm5() {
    const el = document.querySelector('.CodeMirror')
    return el?.CodeMirror?.setValue ? el.CodeMirror : null
  }

  function findMonaco() {
    const models = window.monaco?.editor?.getModels?.() || []
    return (
      models.find(model => String(model.getLanguageId?.() || '').includes('markdown')) ||
      models[0] ||
      null
    )
  }

  function readBody() {
    const cm6 = findCm6()
    if (cm6) return cm6.state.doc.toString()
    const cm5 = findCm5()
    if (cm5?.getValue) return cm5.getValue()
    const model = findMonaco()
    if (model?.getValue) return model.getValue()
    return document.querySelector('.cm-content')?.innerText || ''
  }

  function accepted(actual) {
    const got = compact(actual)
    const want = compact(contentToFill)
    if (!want) return true
    if (!got) return false
    return got.includes(want.slice(0, Math.min(48, want.length)))
  }

  function setTitle() {
    const titleInput =
      document.querySelector('textarea[placeholder*="标题"]') ||
      document.querySelector('input[placeholder*="标题"]')
    if (!titleInput || !title) return
    titleInput.focus()
    const proto =
      titleInput instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (nativeSetter) nativeSetter.call(titleInput, title)
    else titleInput.value = title
    titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    titleInput.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async function switchToMarkdown() {
    const controls = document.querySelectorAll('a, button, .header-btn, .switch-editor')
    for (const el of controls) {
      if (!isSwitch(el)) continue
      if (el.tagName === 'A') {
        el.addEventListener('click', event => event.preventDefault(), { capture: true, once: true })
      }
      el.click()
      console.log('[COSE] TencentCloud 切换到 Markdown 编辑器')
      await sleep(1200)
      return true
    }
    return false
  }

  async function waitForSurface() {
    const start = Date.now()
    while (Date.now() - start < 8000) {
      if (
        findCm6() ||
        findCm5() ||
        findMonaco() ||
        document.querySelector('.cm-content, .cherry-editor, .CodeMirror')
      ) {
        return true
      }
      await sleep(200)
    }
    return false
  }

  console.log('[COSE] TencentCloud 开始同步...')
  await sleep(800)
  await switchToMarkdown()
  if (!(await waitForSurface())) {
    return { success: false, error: '未找到腾讯云 Markdown 编辑器' }
  }

  setTitle()

  const cm6 = findCm6()
  if (cm6) {
    cm6.focus?.()
    cm6.dispatch({
      changes: { from: 0, to: cm6.state.doc.length, insert: contentToFill },
    })
    const actual = cm6.state.doc.toString()
    if (accepted(actual)) {
      console.log('[COSE] TencentCloud CodeMirror 6 已写入', actual.length)
      return { success: true, mode: 'cm6', length: actual.length }
    }
  }

  const cm5 = findCm5()
  if (cm5) {
    cm5.setValue(contentToFill)
    cm5.refresh?.()
    const actual = cm5.getValue?.() || ''
    if (accepted(actual)) {
      console.log('[COSE] TencentCloud CodeMirror 5 已写入', actual.length)
      return { success: true, mode: 'cm5', length: actual.length }
    }
  }

  const model = findMonaco()
  if (model?.setValue) {
    model.setValue(contentToFill)
    const actual = model.getValue() || ''
    if (accepted(actual)) {
      console.log('[COSE] TencentCloud Monaco 已写入', actual.length)
      return { success: true, mode: 'monaco', length: actual.length }
    }
  }

  const fileInput = document.querySelector(
    'input[type="file"][accept*=".md"], input[type="file"][accept*="markdown"]'
  )
  if (fileInput && contentToFill) {
    try {
      const file = new File([contentToFill], 'article.md', { type: 'text/markdown' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      fileInput.files = transfer.files
      fileInput.dispatchEvent(new Event('input', { bubbles: true }))
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      const started = Date.now()
      while (Date.now() - started < 3000) {
        await sleep(200)
        const actual = readBody()
        if (accepted(actual)) {
          console.log('[COSE] TencentCloud 导入 Markdown 已写入')
          return { success: true, mode: 'file', length: compact(actual).length }
        }
      }
    } catch (err) {
      console.log('[COSE] TencentCloud 导入 Markdown 失败:', err.message || err)
    }
  }

  const editable =
    document.querySelector('.cm-content') ||
    [...document.querySelectorAll('[contenteditable="true"]')].at(-1)
  if (editable && contentToFill) {
    editable.focus()
    try {
      const dt = new DataTransfer()
      dt.setData('text/plain', contentToFill)
      editable.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        })
      )
    } catch (err) {
      console.log('[COSE] TencentCloud 粘贴失败:', err.message || err)
    }
    await sleep(400)
    const actual = readBody()
    if (accepted(actual)) {
      console.log('[COSE] TencentCloud 粘贴已写入')
      return { success: true, mode: 'paste', length: compact(actual).length }
    }
  }

  console.error('[COSE] TencentCloud 编辑器没有接住正文')
  return { success: false, error: '腾讯云编辑器没有接住正文' }
}

async function syncTencentCloudContent(tab, content, helpers) {
  const { waitForTab } = helpers
  if (!tab?.id) return { success: false, message: '无效的标签页' }

  try {
    await waitForTab(tab.id)

    try {
      const current = await chrome.tabs.get(tab.id)
      if (current?.url && (current.url.includes('/login') || current.url.includes('signin'))) {
        return { success: false, message: '腾讯云未登录或登录已过期', tabId: tab.id }
      }
    } catch (err) {
      console.log('[COSE] 检查腾讯云 URL 失败:', err.message || err)
    }

    try {
      await chrome.tabs.update(tab.id, { active: true })
      await new Promise(resolve => setTimeout(resolve, 400))
    } catch (err) {
      console.log('[COSE] 激活腾讯云标签页失败:', err.message || err)
    }

    const [result] = await globalThis.chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillTencentCloudContent,
      args: [content?.title || '', content?.markdown || content?.body || ''],
      world: 'MAIN',
    })
    const filled = result?.result
    if (!filled?.success) {
      return {
        success: false,
        message: filled?.error || '未找到腾讯云 Markdown 编辑器',
        tabId: tab.id,
      }
    }
    return { success: true, message: '已写入腾讯云 Markdown 编辑器', tabId: tab.id }
  } catch (err) {
    console.error('[COSE] 腾讯云同步异常:', err)
    return {
      success: false,
      message: '腾讯云同步失败: ' + (err.message || String(err)),
      tabId: tab.id,
    }
  }
}

export { TencentCloudPlatform, fillTencentCloudContent, syncTencentCloudContent }
