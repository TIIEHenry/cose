# COSE 项目上下文

> 本文用于在后续开发、排障和评审中快速恢复项目背景。内容基于 2026-08-24 的仓库状态；当架构、平台列表或构建方式发生变化时，应同步更新本文。

## 1. 项目定位

COSE（Create Once, Sync Everywhere）是配合 [doocs/md](https://md.doocs.org) 使用的浏览器扩展。用户在 doocs/md 中编辑和渲染文章后，可以检测多个内容平台的登录状态，并将标题、Markdown 或渲染后的 HTML 自动填入各平台创作页面。

项目完全在浏览器本地运行，没有自建服务端或数据库，也不负责自动执行最终发布操作。核心能力包括：

- 编辑一次，同步到多个内容平台。
- 检测各平台登录状态并展示用户信息。
- 自动创建、加载并填充平台创作页面。
- 将同一批同步标签页放入统一的浏览器标签组。
- 微信公众号同步时保留 doocs/md 的渲染样式并生成草稿。
- 构建 Chromium、Firefox 和 Safari 扩展。

当前平台注册表包含约 31 个平台，覆盖媒体平台、博客平台和云厂商开发者社区。权威列表以 `packages/core/src/platforms/index.js` 中的 `PLATFORMS` 为准。

## 2. Monorepo 结构

项目使用 `pnpm workspace`：

```text
doocs-cose/
├── apps/
│   └── extension/            浏览器扩展、Manifest 和构建 CLI
├── packages/
│   ├── core/                 平台元数据、内容填充和同步逻辑
│   └── detection/            平台登录状态检测
├── tests/                    Node.js 自动化测试
├── assets/                   README 使用的项目资源
├── .github/                  CI、Issue 和 PR 模板
├── package.json              根级脚本和开发依赖
└── pnpm-workspace.yaml       Workspace 配置
```

### `apps/extension`

浏览器扩展运行层，负责 Chrome/WebExtensions API、跨上下文消息、标签页调度和构建。

- `src/background.js`：Manifest V3 service worker，是当前核心编排器。
- `src/content.js`：页面与扩展后台之间的消息桥；也会在部分平台页面获取并缓存用户信息。
- `src/inject.js`：注入页面 MAIN world，向 doocs/md 暴露 `window.$cose`。
- `src/offscreen.js`：在 document context 中执行带 Cookie 的请求和 DOM 解析。
- `src/popup.js`：扩展弹窗，仅负责打开 doocs/md。
- `manifest.json`：权限、站点访问范围、content script 和 service worker 配置。
- `vite.config.js`：扩展入口打包配置。
- `scripts/cli.ts`：多浏览器构建、资源复制和 Manifest 生成。

### `packages/core`

平台发布适配层。

- `src/platforms/index.js` 汇总平台元数据，并维护 hostname 映射和 `SYNC_HANDLERS`。
- 每个平台文件声明 `id`、名称、图标、首页和发布页等信息。
- 一部分平台还提供 `fillXxxContent` 或完整的 `syncXxxContent`。
- `src/utils.js` 提供 `waitFor`、原生 input setter 和脚本注入等通用工具。

### `packages/detection`

登录状态适配层。

- `src/detect.js` 根据平台 ID 分发检测器。
- `src/configs.js` 保存可配置的通用 API 检测规则。
- `src/platforms/*.js` 处理各平台的特殊登录检测。
- `src/utils.js` 提供 Cookie 检测、API 检测和头像 Base64 转换。

## 3. 核心运行链路

典型同步链路为：

```text
doocs/md 页面
    ↓ window.$cose
inject.js
    ↓ window.postMessage
content.js
    ↓ chrome.runtime.sendMessage
background.js
    ├── 检测登录状态
    ├── 创建平台标签页
    ├── 加入本批次标签组
    ├── 等待页面和编辑器加载
    └── chrome.scripting.executeScript
             ↓
       平台页面 MAIN world
             ↓
       填充标题和正文
```

`window.$cose` 对 doocs/md 提供的主要能力包括：

- 获取平台列表。
- 批量检查登录状态。
- 渐进式接收单个平台的检测结果。
- 开始新的同步批次。
- 将文章同步到指定平台。

同步内容可能包含多种表示：

- `markdown`：供 Markdown 编辑器使用。
- `body`：一般正文或 HTML 内容。
- `wechatHtml`：带完整渲染样式的 HTML，主要供微信及其他富文本编辑器使用。宿主若直接放在 `post.wechatHtml`，扩展用这份内容，不再点复制按钮、不再读剪贴板。没给时才点复制按钮并读取剪贴板，读操作限时，超时后改用 `post.content`，避免再次同步停在「等待中」。

## 4. 平台同步策略

目前的平台同步实现尚未完全统一，分为三类。

### 完整同步处理器

以下平台已经注册到 `SYNC_HANDLERS`，标签页等待和内容注入主要封装在 `packages/core`：

- CSDN
- 掘金
- 微信公众号
- 知乎。解析弹窗把正文写进草稿、编辑器仍是空的时，按稿件 id 打开 `https://zhuanlan.zhihu.com/p/{id}/edit`。没弹出解析框时，不再先清空编辑器，改用 `insertText` 写入正文。
- 今日头条
- 网易号
- 腾讯云。写文章页是 `https://cloud.tencent.com/developer/article/write`。先切到 Markdown，再写入 Cherry 的 CodeMirror 6（`.cm-content` 上的编辑器视图）。旧页仍尝试 CodeMirror 5 和 Monaco。找不到编辑器，或读回的正文对不上，就返回失败。

### 通用内容填充器

一些平台在独立文件中提供 `fillXxxContent`，由后台注入执行，例如博客园、51CTO、InfoQ、简书、Medium、少数派、思否、阿里云和百家号。

这些填充器通常通过以下方式适配 React、Vue 和富文本编辑器：

- `MutationObserver` 等待元素出现。
- 调用原生 `value` setter。
- 派发 `input` 和 `change` 事件。
- 操作 `contenteditable`、ProseMirror、CodeMirror 或 UEditor。

### `background.js` 特殊分支

大量平台的完整流程仍直接位于 `background.js`：

- InfoQ 先调用 API 创建草稿并取得 ID。
- 简书先获取文集，再创建文章。
- 小红书先点击“新的创作”并等待编辑器。
- 百度千帆使用动态 `declarativeNetRequest` 规则处理导航。
- 某些编辑器依赖剪贴板、页面私有 API、iframe 或 `chrome.debugger` 模拟粘贴。

因此，平台模块化目前只完成了一部分。新增或修复平台时，不能假设全部逻辑都在对应的平台文件中，必须同时检查 `background.js`。

## 5. 登录检测

登录检测主要采用以下策略：

1. 调用平台用户 API。
2. 通过 `chrome.cookies` 读取指定 Cookie。
3. 在 offscreen document 中发起携带凭证的请求。
4. 在目标站点标签页的 MAIN world 中发起同源请求。
5. 从平台页面 DOM 获取信息并缓存到 `chrome.storage.local`。

选择不同策略的主要原因是 Manifest V3 service worker 没有 DOM，且跨站 Cookie、SameSite、CORS 和 ORB 会限制后台直接请求。

登录检测支持并行执行，也支持渐进式返回：单个平台完成后，后台会立即经 content script 通知 doocs/md，全部完成后再发送完成事件。

部分平台还会：

- 缓存用户名、头像和用户 ID。
- 把头像转为 Base64，规避跨域或 ORB 限制。
- 临时创建后台标签页执行同源检测，完成后关闭。

## 6. 技术栈

### 运行与语言

- JavaScript ES Modules
- 少量 TypeScript，用于构建 CLI
- Node.js 22（CI 环境）
- pnpm 10 workspace

### 浏览器能力

- WebExtensions / Manifest V3
- `chrome.runtime`
- `chrome.tabs`、`chrome.tabGroups`
- `chrome.scripting`
- `chrome.cookies`
- `chrome.storage`
- `chrome.offscreen`
- `chrome.declarativeNetRequest`
- `chrome.debugger`

### 工程工具

- Vite 8
- TypeScript 5.9
- `tsx`
- `cac`
- `execa`
- `web-ext`
- Prettier
- simple-git-hooks
- lint-staged

### 测试与 CI

- Node.js 内置 `node:test`
- GitHub Actions
- Chromium 构建及产物检查
- Firefox 构建与 `web-ext lint`
- Safari 通过 `xcrun safari-web-extension-converter` 生成 Xcode 工程

## 7. 构建方式

根目录主要命令：

```bash
pnpm build
pnpm build:firefox
pnpm build:safari
pnpm dev
pnpm test
pnpm format:check
```

Vite 将扩展入口输出到 `apps/extension/dist/bundles`。构建 CLI 还会复制图标、平台脚本、`popup.html` 和 `offscreen.html`，并根据目标浏览器生成 `dist/manifest.json`。

开发者模式加载扩展时，应选择构建后的 `apps/extension/dist`。

## 8. 工程评价与主要风险

### 优点

- 产品边界明确，扩展 UI 很轻，没有不必要的应用框架。
- 平台元数据、同步逻辑和登录检测已经开始分层。
- 对复杂第三方编辑器和认证限制做了大量实际兼容。
- 支持 Chromium、Firefox 和 Safari 构建。
- 登录检测支持并行和渐进式反馈。
- 微信同步包含官方编辑器 JSAPI 和 paste fallback。

### 风险与技术债

- `apps/extension/src/background.js` 超过 4,000 行，是复杂度和回归风险最集中的文件。
- 一部分同步逻辑位于 `core`，另一部分仍位于后台，职责边界不一致。
- 第三方平台的 DOM 选择器、私有 API 和编辑器结构可能随时改变。
- Manifest 权限和 `host_permissions` 范围较大，需要持续关注最小权限和商店审核要求。
- 自动化测试覆盖较少，目前主要覆盖微信公众号编辑器选择和内容注入。
- 故障大量依赖日志和真实平台页面，稳定的端到端测试较难建立。
- README 的开发者模式说明可能未完全跟上 monorepo，加载路径应以构建产物为准。

## 9. 当前验证基线

截至 2026-08-24，直接执行以下测试成功：

```bash
node --test tests/wechat.test.mjs
```

结果为 5 个测试通过、0 个失败，覆盖：

- 避免将正文写入标题编辑器。
- 标题和正文编辑器同时存在时选择正文。
- 单编辑器场景兼容。
- 优先通过微信 `mp_editor_set_content` JSAPI 注入含图 HTML。
- JSAPI 不可用时使用 paste 事件兜底。

当时未完成完整 `pnpm test && pnpm build`，原因是本地依赖未完整安装且执行环境无法访问 npm registry，出现 `ENOTFOUND`。这属于验证环境限制，不代表代码构建失败。仓库 CI 已定义完整的格式检查、Chromium 构建、测试、Firefox 构建和扩展 lint 流程。

## 10. 后续工作的默认判断框架

后续分析问题时，默认采用以下基线：

- 这是一个纯本地、多平台内容同步浏览器扩展。
- `background.js` 是当前核心编排器和主要技术债区域。
- `packages/core` 是发布适配层，`packages/detection` 是登录状态适配层。
- 新增平台通常需要同时处理平台注册、登录检测、Manifest 域名权限和内容注入。
- 修复同步问题时，先判断问题属于登录检测、标签页编排、页面加载、编辑器定位、内容格式转换还是事件模拟。
- 平台页面和私有 API 都是外部不稳定依赖；修改选择器或请求流程时，应尽量使用真实页面验证。
- 涉及平台行为时，以当前代码和实际页面为准，本文只作为快速恢复上下文的起点。
