import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isTencentSwitchToMarkdown,
  tencentCodeMirror6View,
  tencentEditorFilled,
} from '../packages/core/src/platforms/tencentcloud.js'

test('tencent switch matches markdown controls and skips the way back to rich text', () => {
  assert.equal(isTencentSwitchToMarkdown('切换 MD 编辑器'), true)
  assert.equal(isTencentSwitchToMarkdown('切换到 Markdown 编辑器'), true)
  assert.equal(isTencentSwitchToMarkdown('切换 富文本 编辑器'), false)
  assert.equal(isTencentSwitchToMarkdown('Markdown', 'header-link switch-editor'), true)
  assert.equal(isTencentSwitchToMarkdown('去发布'), false)
})

test('tencent editor fill requires a prefix of the source', () => {
  assert.equal(tencentEditorFilled('# 标题\n\n正文', '# 标题\n\n正文'), true)
  assert.equal(tencentEditorFilled('', '# 标题'), false)
  assert.equal(tencentEditorFilled('别的文章', '# 标题\n\n正文'), false)
  assert.equal(tencentEditorFilled('', ''), true)
})

test('tencent code mirror 6 view comes from the content node', () => {
  const view = {
    dispatch() {},
    state: { doc: { length: 0, toString: () => '' } },
  }
  assert.equal(tencentCodeMirror6View({ cmView: view }), view)
  assert.equal(tencentCodeMirror6View({ cmView: { view } }), view)
  assert.equal(tencentCodeMirror6View({ cmView: { rootView: { view } } }), view)
  assert.equal(tencentCodeMirror6View({ cmView: {} }), null)
  assert.equal(tencentCodeMirror6View(null), null)
})
