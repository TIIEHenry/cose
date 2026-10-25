import assert from 'node:assert/strict'
import test from 'node:test'

import {
  zhihuArticleIdFromUrl,
  zhihuDraftEditUrl,
  zhihuEditorLooksEmpty,
  zhihuEditorRecovery,
} from '../packages/core/src/platforms/zhihu.js'

test('zhihu draft edit url keeps only a numeric article id', () => {
  assert.equal(zhihuDraftEditUrl('123'), 'https://zhuanlan.zhihu.com/p/123/edit')
  assert.equal(zhihuDraftEditUrl(''), '')
  assert.equal(zhihuDraftEditUrl('12a'), '')
})

test('zhihu article id comes from the editor url', () => {
  assert.equal(zhihuArticleIdFromUrl('https://zhuanlan.zhihu.com/p/456/edit?utm=1'), '456')
  assert.equal(zhihuArticleIdFromUrl('https://zhuanlan.zhihu.com/p/456'), '')
  assert.equal(zhihuArticleIdFromUrl('https://zhuanlan.zhihu.com/write'), '')
})

test('zhihu treats a placeholder editor as empty', () => {
  assert.equal(zhihuEditorLooksEmpty(''), true)
  assert.equal(zhihuEditorLooksEmpty(' \u200b '), true)
  assert.equal(zhihuEditorLooksEmpty('请输入正文'), true)
  assert.equal(zhihuEditorLooksEmpty('第一段'), false)
})

test('empty zhihu editor reopens the saved draft', () => {
  assert.deepEqual(
    zhihuEditorRecovery({
      editorText: '',
      articleId: '89',
      pageUrl: 'https://zhuanlan.zhihu.com/write',
    }),
    { draftLink: 'https://zhuanlan.zhihu.com/p/89/edit', reopen: true }
  )
})

test('zhihu editor that already shows the article stays put', () => {
  assert.deepEqual(
    zhihuEditorRecovery({
      editorText: '正文还在',
      articleId: '89',
      pageUrl: 'https://zhuanlan.zhihu.com/p/89/edit',
    }),
    { draftLink: 'https://zhuanlan.zhihu.com/p/89/edit', reopen: false }
  )
})

test('zhihu recovery can read the id from the edit url', () => {
  assert.deepEqual(
    zhihuEditorRecovery({
      editorText: '请输入正文',
      articleId: '',
      pageUrl: 'https://zhuanlan.zhihu.com/p/77/edit',
    }),
    { draftLink: 'https://zhuanlan.zhihu.com/p/77/edit', reopen: true }
  )
})

test('zhihu recovery does nothing without an article id', () => {
  assert.deepEqual(
    zhihuEditorRecovery({
      editorText: '',
      articleId: '',
      pageUrl: 'https://zhuanlan.zhihu.com/write',
    }),
    { draftLink: '', reopen: false }
  )
})
