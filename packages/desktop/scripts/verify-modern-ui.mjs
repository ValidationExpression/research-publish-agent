import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(`${root}/src/renderer/styles.css`, 'utf8')
const app = readFileSync(`${root}/src/renderer/App.tsx`, 'utf8')
const sidebar = readFileSync(`${root}/src/renderer/components/WorkflowSidebar.tsx`, 'utf8')
const review = readFileSync(`${root}/src/renderer/pages/ReviewPage.tsx`, 'utf8')
const research = readFileSync(`${root}/src/renderer/pages/ResearchPage.tsx`, 'utf8')
const publish = readFileSync(`${root}/src/renderer/pages/PublishPage.tsx`, 'utf8')
const html = readFileSync(`${root}/src/renderer/index.html`, 'utf8')

assert.ok(sidebar.includes('className="workflow-sidebar"'), 'sidebar lacks canonical styling hook')
assert.ok(sidebar.includes('>R</span>'), 'brand monogram is not modernized')
assert.ok(app.includes('>R</span>'), 'window titlebar monogram is not modernized')
assert.ok(css.includes('.research-timeline-row.is-done'), 'completed research log is not styled')
assert.ok(review.includes('className="review-workspace"'), 'review lacks canonical styling hook')
assert.ok(!review.includes('纸面'), 'legacy paper preview copy remains')
assert.ok(publish.includes('platform-row'), 'platform rows lack canonical styling hook')
assert.ok(publish.includes('publish-feedback'), 'publish feedback lacks semantic styling hook')
assert.ok(research.includes("running ? '研究进行中' : '研究进度'"), 'running research lacks a visible text status')
assert.ok(research.includes('(running || logs.length > 0) && ('), 'initial POST wait hides the research status')
for (const state of ['is-loading', 'is-success', 'is-error']) {
  assert.ok(publish.includes(state), `missing publish feedback state ${state}`)
}

for (const token of ['#fbfaf7', '#f1f0ec', '#17191c', '#315cf5']) {
  assert.ok(css.toLowerCase().includes(token), `missing approved token ${token}`)
}
for (const selector of ['.workflow-sidebar', '.research-composer', '.review-workspace', '.platform-row']) {
  assert.ok(css.includes(selector), `missing selector ${selector}`)
}
assert.ok(css.includes('@media (max-width: 900px)'), 'missing narrow-window layout')
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'missing reduced-motion support')
assert.ok(app.includes('WorkflowSidebar'), 'App is not using WorkflowSidebar')
assert.ok(!css.includes("'Noto Serif SC'"), 'legacy serif stack remains')
assert.ok(/--font-mono:[^;]*"PingFang SC",\s*"Microsoft YaHei",\s*monospace;/.test(css), 'Markdown editor lacks Chinese sans fallbacks')
assert.ok(html.includes('lang="zh-CN"'), 'document language is not set')
assert.ok(html.includes('<title>Research Publish</title>'), 'document title is not set')
assert.ok(/name="theme-color" content="#fbfaf7"/i.test(html), 'document theme color does not match')
assert.ok(!html.includes('fonts.googleapis.com'), 'external font request remains')

console.log('Modern UI source verification passed')
