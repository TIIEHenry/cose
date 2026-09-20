// 短观点（opinion）原生处理器
//
// 与文章处理器的区别：不进各平台的文章 / 专栏编辑器，而是直接把短文本
// 填进平台的信息流发布框（发微博 / 掘金沸点 / 知乎想法）。填充完成后
// 停在发布框上，由用户确认后手动点击发布（与文章「填草稿」模型一致）。
//
// 每个处理器导出 { entryUrl, sync }：
// - entryUrl：打开的落地页（与该平台文章的 publishUrl 不同）
// - sync(tab, content, helpers)：与 SYNC_HANDLERS 同签名

// ---------- 页面主世界填充函数（chrome.scripting.executeScript 注入） ----------

// 微博：首页顶部「有什么新鲜事想分享给大家」输入框（React 应用，需原生 setter）
function fillWeiboOpinion(text) {
  async function fill() {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

    async function findComposer(timeout = 15000) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const byPlaceholder = Array.from(document.querySelectorAll('textarea')).find(el =>
          (el.placeholder || '').includes('新鲜事')
        )
        if (byPlaceholder) return byPlaceholder
        const byClass = document.querySelector('textarea[class*="Form_input"]')
        if (byClass) return byClass
        const anyVisible = Array.from(document.querySelectorAll('textarea')).find(
          el => el.offsetParent !== null
        )
        if (anyVisible) return anyVisible
        await sleep(300)
      }
      return null
    }

    const composer = await findComposer()
    if (!composer) {
      return { success: false, error: '未找到微博发布框（请确认已登录 weibo.com）' }
    }

    composer.focus()
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set
    if (nativeSetter) {
      nativeSetter.call(composer, text)
    } else {
      composer.value = text
    }
    composer.dispatchEvent(new Event('input', { bubbles: true }))
    composer.dispatchEvent(new Event('change', { bubbles: true }))
    composer.scrollIntoView({ block: 'center' })
    console.log('[COSE] 微博发布框填充成功')
    return { success: true }
  }
  return fill()
}

// 掘金沸点：/pin 页顶部富文本输入框（contenteditable，用 insertText 触发框架更新）
function fillJuejinPinOpinion(text) {
  async function fill() {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

    async function findEditor(timeout = 15000) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const rich =
          document.querySelector('.rich-input[contenteditable="true"]') ||
          document.querySelector('[class*="rich-input"][contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"]')
        if (rich) return rich
        await sleep(300)
      }
      return null
    }

    const editor = await findEditor()
    if (!editor) {
      return { success: false, error: '未找到沸点输入框（请确认已登录掘金）' }
    }

    editor.focus()
    // contenteditable 用 insertText，能同时触发掘金的输入监听
    const inserted = document.execCommand('insertText', false, text)
    if (!inserted) {
      editor.textContent = text
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }))
    }
    editor.scrollIntoView({ block: 'center' })
    console.log('[COSE] 掘金沸点输入框填充成功')
    return { success: true }
  }
  return fill()
}

// 知乎想法：首页顶部发布器，必要时先点「写想法」tab，再填 Draft.js 编辑器
function fillZhihuThoughtOpinion(text) {
  async function fill() {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

    // 顶部发布器可能默认停在「写回答 / 写文章」，先切到「写想法」
    async function clickThoughtEntry(timeout = 8000) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const candidates = Array.from(
          document.querySelectorAll('button, [role="tab"], a, div')
        ).filter(el => el.childElementCount <= 2 && (el.textContent || '').trim() === '写想法')
        if (candidates.length > 0) {
          candidates[0].click()
          console.log('[COSE] 已点击「写想法」入口')
          return true
        }
        // 有的版本入口文案是「分享你此刻的想法」占位框，点击即展开
        const placeholderBox = Array.from(document.querySelectorAll('div, span')).find(
          el => (el.textContent || '').includes('分享你此刻的想法') && el.childElementCount === 0
        )
        if (placeholderBox) {
          placeholderBox.click()
          console.log('[COSE] 已点击想法占位框')
          return true
        }
        await sleep(300)
      }
      return false
    }

    async function findEditor(timeout = 10000) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        // 知乎想法编辑器基于 Draft.js
        const draft =
          document.querySelector('.public-DraftEditor-content[contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"]')
        if (draft && draft.offsetParent !== null) return draft
        await sleep(300)
      }
      return null
    }

    await clickThoughtEntry()
    const editor = await findEditor()
    if (!editor) {
      return { success: false, error: '未找到知乎想法输入框（请确认已登录知乎）' }
    }

    editor.focus()
    const inserted = document.execCommand('insertText', false, text)
    if (!inserted) {
      editor.textContent = text
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }))
    }
    editor.scrollIntoView({ block: 'center' })
    console.log('[COSE] 知乎想法输入框填充成功')
    return { success: true }
  }
  return fill()
}

// ---------- 后台侧同步入口 ----------

function opinionText(content) {
  return content.markdown || content.body || content.desc || ''
}

function makeOpinionHandler(platformTitle, fillFunc) {
  return async function syncOpinion(tab, content, helpers) {
    const { chrome } = helpers

    // 等待落地页渲染（信息流首页普遍是重前端应用）
    await new Promise(resolve => setTimeout(resolve, 3000))

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillFunc,
      args: [opinionText(content)],
      world: 'MAIN',
    })

    const fillResult = result?.[0]?.result
    if (fillResult?.success) {
      return { success: true, message: `已填充${platformTitle}发布框，请确认后发布`, tabId: tab.id }
    }
    return {
      success: false,
      message: fillResult?.error || `${platformTitle}填充失败`,
      tabId: tab.id,
    }
  }
}

// 平台 id → 短观点处理器
const OPINION_HANDLERS = {
  weibo: {
    entryUrl: 'https://weibo.com',
    sync: makeOpinionHandler('微博', fillWeiboOpinion),
  },
  juejin: {
    entryUrl: 'https://juejin.cn/pin',
    sync: makeOpinionHandler('掘金沸点', fillJuejinPinOpinion),
  },
  zhihu: {
    entryUrl: 'https://www.zhihu.com',
    sync: makeOpinionHandler('知乎想法', fillZhihuThoughtOpinion),
  },
}

export { OPINION_HANDLERS }
