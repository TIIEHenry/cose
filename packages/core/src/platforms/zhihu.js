// 知乎平台配置
const ZhihuPlatform = {
  id: 'zhihu',
  name: 'Zhihu',
  icon: 'https://static.zhihu.com/heifetz/favicon.ico',
  url: 'https://www.zhihu.com',
  publishUrl: 'https://zhuanlan.zhihu.com/write',
  title: '知乎',
  type: 'zhihu',
}

import { injectUtils } from './common.js'

/** Column editor for a saved draft. Empty when `id` is not a Zhihu article id. */
export function zhihuDraftEditUrl(id) {
  const clean = String(id || '').trim()
  if (!/^\d+$/.test(clean)) return ''
  return `https://zhuanlan.zhihu.com/p/${clean}/edit`
}

/** Article id from a column edit URL. A public `/p/{id}` link is not an editor. */
export function zhihuArticleIdFromUrl(url) {
  const match = String(url || '').match(/zhuanlan\.zhihu\.com\/p\/(\d+)\/edit(?:[?#]|$)/)
  return match?.[1] || ''
}

/**
 * Reopen the draft only when the visible editor has no body.
 * Zhihu can store the parsed article on the draft while the editor stays blank.
 */
export function zhihuEditorLooksEmpty(text) {
  const normalized = String(text || '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, '')
  if (!normalized) return true
  return normalized === '请输入正文' || normalized === '请输入正文...' || normalized === '写点什么'
}

export function zhihuEditorRecovery({ editorText, articleId, pageUrl } = {}) {
  const id = String(articleId || '').trim() || zhihuArticleIdFromUrl(pageUrl)
  const draftLink = zhihuDraftEditUrl(id)
  if (!draftLink || !zhihuEditorLooksEmpty(editorText)) {
    return { draftLink, reopen: false }
  }
  return { draftLink, reopen: true }
}

/** Read the editor after fill. Runs in the page; must not close over module helpers. */
function readZhihuEditorStateInPage() {
  const editor =
    document.querySelector('.public-DraftEditor-content') ||
    document.querySelector('.DraftEditor-root [contenteditable="true"]') ||
    document.querySelector('[contenteditable="true"]')
  const editorText = (editor?.innerText || '').replace(/\u200b/g, '').trim()
  let articleId = window.__coseZhihuArticleId || ''
  if (!articleId) {
    const fromLoc = location.href.match(/zhuanlan\.zhihu\.com\/p\/(\d+)\/edit/)
    if (fromLoc) articleId = fromLoc[1]
  }
  if (!articleId) {
    const entries = performance.getEntriesByType?.('resource') || []
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const name = entries[i].name || ''
      if (/\/images|upload\.zhihu|\/upload/i.test(name)) continue
      const match = name.match(/\/api\/(?:v4\/)?articles\/(\d+)(?:\/|$|\?)/)
      if (match) {
        articleId = match[1]
        break
      }
    }
  }
  return { editorText, articleId, href: location.href }
}

// 知乎内容填充函数（在页面主世界中执行）
// 知乎现在支持直接粘贴 Markdown，然后弹窗提示转换
// 注意：需要先调用 injectUtils 注入 window.waitFor
function fillZhihuContent(title, markdown) {
  // 等待满足条件的元素出现（使用 MutationObserver）
  function waitForElement(predicate, timeout = 10000) {
    return new Promise(resolve => {
      const el = predicate()
      if (el) return resolve(el)

      const observer = new MutationObserver(() => {
        const el = predicate()
        if (el) {
          observer.disconnect()
          resolve(el)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })

      setTimeout(() => {
        observer.disconnect()
        resolve(predicate())
      }, timeout)
    })
  }

  function noteZhihuArticleUrl(url) {
    const text = String(url || '')
    if (/\/images|upload\.zhihu|\/upload/i.test(text)) return
    const match = text.match(/\/api\/(?:v4\/)?articles\/(\d+)(?:\/|$|\?)/)
    if (match) window.__coseZhihuArticleId = match[1]
  }

  function noteZhihuDraftBody(url, bodyText) {
    noteZhihuArticleUrl(url)
    if (window.__coseZhihuArticleId) return
    if (!/\/articles\/drafts(?:\?|$)/.test(String(url || ''))) return
    try {
      const data = JSON.parse(bodyText || '')
      const id = data?.id ?? data?.data?.id
      if (id != null && /^\d+$/.test(String(id))) window.__coseZhihuArticleId = String(id)
    } catch {
      // 创建草稿的响应不是 JSON 时，后面的更新请求仍会带上 id
    }
  }

  function installZhihuTrafficHook() {
    if (window.__coseZhihuTrafficHooked) return
    window.__coseZhihuTrafficHooked = true
    const originalFetch = window.fetch
    window.fetch = function (...args) {
      const input = args[0]
      const url = typeof input === 'string' ? input : input?.url || ''
      return originalFetch.apply(this, args).then(response => {
        noteZhihuArticleUrl(url)
        if (!window.__coseZhihuArticleId && /\/articles\/drafts(?:\?|$)/.test(url)) {
          response
            .clone()
            .text()
            .then(text => noteZhihuDraftBody(url, text))
            .catch(() => {})
        }
        return response
      })
    }
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__coseZhihuUrl = url
      return originalOpen.apply(this, [method, url, ...rest])
    }
    XMLHttpRequest.prototype.send = function (...args) {
      const url = this.__coseZhihuUrl
      if (url) {
        this.addEventListener('loadend', () => {
          noteZhihuDraftBody(url, this.responseText)
        })
      }
      return originalSend.apply(this, args)
    }
  }

  function zhihuEditorElement() {
    return (
      document.querySelector('.public-DraftEditor-content') ||
      document.querySelector('.DraftEditor-root [contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]')
    )
  }

  function zhihuEditorPlainText() {
    return (zhihuEditorElement()?.innerText || '').replace(/\u200b/g, '').trim()
  }

  function zhihuArticleIdFromPage() {
    if (window.__coseZhihuArticleId) return String(window.__coseZhihuArticleId)
    const fromLoc = location.href.match(/zhuanlan\.zhihu\.com\/p\/(\d+)\/edit/)
    if (fromLoc) return fromLoc[1]
    const entries = performance.getEntriesByType?.('resource') || []
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const name = entries[i].name || ''
      if (/\/images|upload\.zhihu|\/upload/i.test(name)) continue
      const match = name.match(/\/api\/(?:v4\/)?articles\/(\d+)(?:\/|$|\?)/)
      if (match) return match[1]
    }
    return ''
  }

  // 等待按钮出现并点击。textMatcher 收到去掉空白后的按钮文字。
  async function waitAndClickButton(textMatcher, timeout = 5000) {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const buttons = [...document.querySelectorAll('button, [role="button"]')]
      const matches = buttons.filter(btn =>
        textMatcher((btn.textContent || '').replace(/\s+/g, ''), btn)
      )
      const inDialog = matches.find(btn =>
        btn.closest('[role="dialog"], [class*="Modal"], [class*="modal"]')
      )
      const btn = inDialog || matches[0]
      if (btn) {
        btn.click()
        console.log('[COSE] 已点击按钮:', (btn.textContent || '').replace(/\s+/g, ''))
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    return false
  }

  async function fillContent() {
    installZhihuTrafficHook()

    // 第一步：等待知乎编辑器完全加载（避免"草稿加载中"提示）
    await new Promise(resolve => setTimeout(resolve, 2000))

    // 第二步：填充标题
    async function fillTitle() {
      const titleInput = await window.waitFor('textarea[placeholder*="标题"]')
      if (titleInput && title) {
        titleInput.focus()
        // 使用 nativeInputValueSetter 确保 React 识别变更
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set
        if (nativeSetter) {
          nativeSetter.call(titleInput, title)
        } else {
          titleInput.value = title
        }
        titleInput.dispatchEvent(new Event('input', { bubbles: true }))
        titleInput.dispatchEvent(new Event('change', { bubbles: true }))
        console.log('[COSE] 知乎标题填充成功')
      }
    }

    // 先填充标题
    await fillTitle()

    // 再等待一下确保标题已保存
    await new Promise(resolve => setTimeout(resolve, 500))

    // 第三步：找到并激活知乎编辑器
    const editor = zhihuEditorElement()

    if (!editor) {
      console.log('[COSE] 未找到知乎编辑器')
      return { success: false, error: 'Editor not found' }
    }

    // 激活编辑器：模拟真实点击序列
    const rect = editor.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // 触发鼠标事件序列激活编辑器
    for (const eventType of ['mousedown', 'mouseup', 'click']) {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        button: 0,
      })
      editor.dispatchEvent(event)
    }

    // 聚焦编辑器。先不清空：粘贴没落到 Draft.js 时，清空会把已加载的草稿从画面上抹掉。
    editor.focus()

    // 第三步：通过剪贴板 + 键盘事件模拟真实粘贴
    // 这是触发知乎 Markdown 检测弹窗的关键方法
    const contentToFill = markdown || ''
    let parsed = false

    if (!contentToFill) {
      console.log('[COSE] 没有 Markdown 内容需要填充')
      await fillTitle()
      return { success: true, method: 'empty' }
    }

    try {
      // 使用 ClipboardEvent 模拟粘贴 - 这是触发 Markdown 检测弹窗的关键
      // execCommand('insertText') 不会触发弹窗

      // 检查浏览器兼容性
      if (typeof DataTransfer === 'undefined' || typeof ClipboardEvent === 'undefined') {
        throw new Error('浏览器不支持 DataTransfer 或 ClipboardEvent')
      }

      const dt = new DataTransfer()
      dt.setData('text/plain', contentToFill)

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      })

      editor.focus()
      const dispatched = editor.dispatchEvent(pasteEvent)
      console.log('[COSE] 已触发 ClipboardEvent，dispatched:', dispatched)

      // 等待 Markdown 检测弹窗出现并点击"确认并解析"
      await new Promise(resolve => setTimeout(resolve, 500))

      parsed = await waitAndClickButton(text => text.includes('确认并解析'), 5000)

      if (parsed) {
        console.log('[COSE] 已点击"确认并解析"')

        // 等待解析完成并点击"确认"
        await new Promise(resolve => setTimeout(resolve, 500))

        const confirmClicked = await waitAndClickButton((text, btn) => {
          if (text !== '确认' && text !== '确定') return false
          const dialog = btn.closest('[role="dialog"], [class*="Modal"], [class*="modal"]')
          if (!dialog) return true
          const hint = (dialog.textContent || '').replace(/\s+/g, '')
          return (
            hint.includes('解析') ||
            hint.includes('Markdown') ||
            hint.includes('markdown') ||
            hint.includes('富文本')
          )
        }, 5000)

        if (confirmClicked) {
          console.log('[COSE] 已点击"确认"，Markdown 解析完成')
        }
      } else {
        console.log('[COSE] 未检测到 Markdown 弹窗')
      }
    } catch (err) {
      console.log('[COSE] 内容插入失败:', err.message || err)
    }

    // 弹窗没出现时，Draft.js 经常丢掉非可信 paste。这时再写入正文，避免编辑器被留空。
    if (!parsed) {
      editor.focus()
      document.execCommand('selectAll', false)
      document.execCommand('delete', false)
      await new Promise(resolve => setTimeout(resolve, 50))
      const inserted = document.execCommand('insertText', false, contentToFill)
      console.log('[COSE] 知乎未解析 Markdown，已 insertText:', inserted)
    }

    // 等待内容渲染
    await new Promise(resolve => setTimeout(resolve, 300))

    return {
      success: true,
      method: parsed ? 'paste-markdown' : 'insert-text',
      parsed,
      articleId: zhihuArticleIdFromPage(),
      editorText: zhihuEditorPlainText(),
      href: location.href,
    }
  }

  return fillContent()
}

/**
 * 知乎同步处理器
 * 知乎现在支持直接粘贴 Markdown，然后弹窗提示转换
 * @param {object} tab - Chrome tab 对象
 * @param {object} content - 内容对象 { title, body, markdown }
 * @param {object} helpers - 帮助函数 { chrome, waitForTab, addTabToSyncGroup }
 * @returns {Promise<{success: boolean, message?: string, tabId?: number}>}
 */
async function syncZhihuContent(tab, content, helpers) {
  const { waitForTab } = helpers

  try {
    if (!tab?.id) {
      return { success: false, message: '无效的标签页' }
    }

    // 等待页面加载完成（waitForTab 使用 chrome.tabs.onUpdated 监听）
    await waitForTab(tab.id)

    // 检查是否被重定向到登录页
    try {
      const currentTab = await chrome.tabs.get(tab.id)
      if (
        currentTab?.url &&
        (currentTab.url.includes('signin') || currentTab.url.includes('login'))
      ) {
        return {
          success: false,
          message: '知乎未登录或登录已过期，请在知乎页面登录后重试',
          tabId: tab.id,
        }
      }
    } catch (e) {
      console.log('[COSE] 检查知乎 URL 失败:', e.message)
    }

    // 激活知乎标签页（避免后台标签页限制导致填充失败）
    try {
      await chrome.tabs.update(tab.id, { active: true })
      console.log('[COSE] 已激活知乎标签页')
      // 等待标签页激活完成
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (err) {
      console.log('[COSE] 激活标签页失败:', err.message || err)
    }

    // 先注入公共工具函数（waitFor 使用 MutationObserver）
    await injectUtils(globalThis.chrome, tab.id)

    // 在页面中执行内容填充
    const result = await globalThis.chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillZhihuContent,
      args: [content.title, content.markdown],
      world: 'MAIN',
    })

    const fillResult = result?.[0]?.result
    if (!fillResult?.success) {
      const errorMsg =
        fillResult?.error === 'Editor not found'
          ? '未找到知乎专栏编辑器（可能未登录或被滑块验证拦截）'
          : fillResult?.error || '知乎内容同步失败'
      return { success: false, message: errorMsg, tabId: tab.id }
    }

    let articleId = fillResult.articleId || ''
    let editorText = fillResult.editorText || ''
    let pageUrl = fillResult.href || ''
    let reopened = false

    // 画面仍是空的、草稿里还有正文：尽快打开该草稿，避免空编辑器的自动保存把草稿盖掉。
    if (zhihuEditorLooksEmpty(editorText)) {
      await new Promise(resolve => setTimeout(resolve, 800))
      try {
        const [read] = await globalThis.chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: readZhihuEditorStateInPage,
          world: 'MAIN',
        })
        const state = read?.result || {}
        articleId = state.articleId || articleId
        editorText = state.editorText ?? editorText
        pageUrl = state.href || pageUrl
      } catch (err) {
        console.log('[COSE] 读取知乎编辑器失败:', err.message || err)
      }

      const recovery = zhihuEditorRecovery({ editorText, articleId, pageUrl })
      if (recovery.reopen && recovery.draftLink) {
        try {
          const current = (await chrome.tabs.get(tab.id)).url || ''
          const same = current.split(/[?#]/)[0] === recovery.draftLink
          if (same) await chrome.tabs.reload(tab.id)
          else await chrome.tabs.update(tab.id, { url: recovery.draftLink, active: true })
          await waitForTab(tab.id)
          pageUrl = recovery.draftLink
          reopened = true
          console.log('[COSE] 知乎编辑器为空，已打开草稿', recovery.draftLink)
        } catch (err) {
          console.log('[COSE] 打开知乎草稿失败:', err.message || err)
        }
      }
    } else {
      // 等待内容在编辑器中稳定并触发知乎草稿保存
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 重新打开草稿后，这一页的上传监听已经不在了；有正文时才等图片。
    const hasImages =
      /!\[.*?\]\(.*?\)/.test(content.markdown || '') || /<img/i.test(content.body || '')
    if (hasImages && !reopened) {
      console.log('[COSE] 检测到 Markdown 包含图片，开始监听图片上传请求...')
      try {
        await waitForImageUploadComplete(tab.id, 8000)
      } catch (err) {
        console.log('[COSE] 等待图片上传异常 (非致命):', err.message || err)
      }
    }

    const draftLink =
      zhihuDraftEditUrl(articleId) || zhihuDraftEditUrl(zhihuArticleIdFromUrl(pageUrl))
    return {
      success: true,
      message: reopened ? '已写入知乎草稿，并重新打开编辑器' : '已写入知乎专栏草稿',
      tabId: tab.id,
      editResp: draftLink ? { draftLink } : undefined,
    }
  } catch (err) {
    console.error('[COSE] 知乎同步异常:', err)
    return {
      success: false,
      message: '知乎同步失败: ' + (err.message || String(err)),
      tabId: tab.id,
    }
  }
}

/**
 * 等待图片上传完成
 * @param {number} tabId - 标签页 ID
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<boolean>}
 */
async function waitForImageUploadComplete(tabId, timeout = 8000) {
  // 在页面中注入监听脚本
  const result = await globalThis.chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: listenTimeout => {
      return new Promise(resolve => {
        const pendingUploads = new Set()
        let hasUploadRequests = false
        let lastUploadTime = 0
        let reqSeq = 0

        const isUploadUrl = url => {
          if (!url || typeof url !== 'string') return false
          // 排除心跳、打点、草稿保存等常规 POST，避免误判
          if (
            url.includes('/api/v4/draft') ||
            url.includes('/api/v4/reporter') ||
            url.includes('/api/v4/growth') ||
            url.includes('/api/v4/tracking') ||
            url.includes('/api/v4/me') ||
            url.includes('/api/v4/messages')
          ) {
            return false
          }
          return (
            url.includes('/api/v4/images') ||
            url.includes('/api/v4/upload') ||
            url.includes('upload.zhihu.com')
          )
        }

        // 监听 fetch 请求
        const originalFetch = window.fetch
        window.fetch = function (...args) {
          const url = args[0]
          const isImageUpload = isUploadUrl(url)
          let uploadId

          if (isImageUpload) {
            hasUploadRequests = true
            lastUploadTime = Date.now()
            uploadId = ++reqSeq
            pendingUploads.add(uploadId)
            console.log('[COSE] 检测到图片上传请求:', url, uploadId)
          }

          return originalFetch
            .apply(this, args)
            .then(response => {
              if (uploadId) {
                console.log('[COSE] 图片上传请求完成:', url, response.status)
                pendingUploads.delete(uploadId)
              }
              return response
            })
            .catch(error => {
              if (uploadId) {
                console.log('[COSE] 图片上传请求失败:', url, error)
                pendingUploads.delete(uploadId)
              }
              throw error
            })
        }

        // 监听 XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open
        const originalSend = XMLHttpRequest.prototype.send

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
          this._url = url
          this._method = method
          return originalOpen.apply(this, [method, url, ...rest])
        }

        XMLHttpRequest.prototype.send = function (...args) {
          const isImageUpload = isUploadUrl(this._url)
          let uploadId

          if (isImageUpload) {
            hasUploadRequests = true
            lastUploadTime = Date.now()
            uploadId = ++reqSeq
            pendingUploads.add(uploadId)
            console.log('[COSE] 检测到图片上传 XHR:', this._url, uploadId)

            this.addEventListener('loadend', () => {
              console.log('[COSE] 图片上传 XHR 完成:', this._url, this.status)
              pendingUploads.delete(uploadId)
            })
          }

          return originalSend.apply(this, args)
        }

        // 定期检查是否所有上传都完成
        const checkTimer = setInterval(() => {
          if (!hasUploadRequests) {
            return
          }
          if (pendingUploads.size === 0 && Date.now() - lastUploadTime > 1500) {
            console.log('[COSE] 所有图片上传请求已完成')
            clearInterval(checkTimer)
            resolve(true)
          }
        }, 400)

        // 2.5 秒内未检测到任何上传请求，说明无需等待
        setTimeout(() => {
          if (!hasUploadRequests) {
            console.log('[COSE] 2.5秒内未检测到图片上传请求，结束等待')
            clearInterval(checkTimer)
            resolve(true)
          }
        }, 2500)

        // 超时保底返回
        setTimeout(() => {
          clearInterval(checkTimer)
          resolve(true)
        }, listenTimeout)
      })
    },
    args: [timeout],
    world: 'MAIN',
  })

  return result?.[0]?.result !== false
}

// 导出
export { ZhihuPlatform, fillZhihuContent, syncZhihuContent }
