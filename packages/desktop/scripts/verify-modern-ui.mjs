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
const preview = readFileSync(`${root}/src/renderer/main.tsx`, 'utf8')
const desktopMain = readFileSync(`${root}/src/main/index.ts`, 'utf8')
const desktopPackage = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))

const localServerBuild = 'pnpm --filter @wechatsync/local-server build'
assert.equal(desktopPackage.scripts['build:local-server'], localServerBuild, 'desktop lacks a local-server build prerequisite')
assert.ok(desktopPackage.scripts.typecheck.startsWith('pnpm build:local-server && '), 'desktop typecheck skips declaration generation')
assert.ok(desktopPackage.scripts.build.startsWith('pnpm build:local-server && '), 'desktop build skips declaration generation')

assert.ok(sidebar.includes('className="workflow-sidebar"'), 'sidebar lacks canonical styling hook')
assert.ok(sidebar.includes('>R</span>'), 'brand monogram is not modernized')
assert.ok(app.includes('>R</span>'), 'window titlebar monogram is not modernized')
assert.ok(app.includes("platform === 'darwin' ? ' is-darwin' : ''"), 'macOS titlebar does not reserve traffic-light space')
assert.ok(css.includes('.titlebar.is-darwin'), 'macOS titlebar spacing rule is missing')
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
assert.ok(css.toLowerCase().includes('--muted: #676d78'), 'small muted text token lacks 4.5:1 contrast across app surfaces')
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

assert.ok(!/kami|纸感|纸面|羊皮纸|好纸/i.test(preview), 'legacy paper preview copy remains')
assert.ok(preview.includes('publish: { connected: true }'), 'preview does not exercise connected publish service')
for (const copy of [
  '2026 年主流 AI Agent 框架对比',
  '本文从架构设计、工具调用、状态管理与生产部署四个维度进行比较。',
  '生产选型应优先考虑可观测性与故障恢复。',
]) {
  assert.ok(preview.includes(copy), `missing neutral preview copy: ${copy}`)
}
const previewSse = preview.match(/startResearchSse:[\s\S]*?\n\s*},/)?.[0] ?? ''
const progressEvents = previewSse.match(/type: 'progress'/g) ?? []
assert.ok(progressEvents.length >= 2, 'preview SSE needs at least two progress events')
assert.ok(previewSse.includes('await delay('), 'preview SSE progress is not asynchronous')
assert.ok(
  previewSse.lastIndexOf("type: 'progress'") < previewSse.indexOf("type: 'done'"),
  'preview SSE must emit progress before done',
)

assert.ok(!desktopMain.includes('KAMI_'), 'legacy KAMI native chrome constants remain')
assert.ok(desktopMain.includes("'#FBFAF7'"), 'native window background is not approved warm white')
assert.ok(desktopMain.includes("'#6F7580'"), 'native overlay symbol is not approved secondary text color')

const loadReport = research.slice(research.indexOf('async function loadReport'), research.indexOf('async function pollUntilDone'))
const pollReport = research.slice(research.indexOf('async function pollUntilDone'), research.indexOf('async function startResearch'))
const finalReviewChecks = [
  ['macOS keeps the native application and editing menus', /Menu\.setApplicationMenu\(\s*isMac\s*\? Menu\.buildFromTemplate\(\[\s*\{ role: 'appMenu' \},\s*\{ role: 'editMenu' \},?\s*\]\)\s*: null/.test(desktopMain)],
  ['preview fixtures are installed only in development', /if \(import\.meta\.env\.DEV\) \{\s*installDevPreviewApi\(\)\s*\}/.test(preview)],
  ['report completion is assigned only after successful parsing', (research.match(/doneRef\.current = true/g) ?? []).length === 1 && /const report = res\.ok \? parseResearchReport\(res\.data\) : null[\s\S]*?if \(!report\) return false[\s\S]*?doneRef\.current = true[\s\S]*?onComplete\(report\)/.test(loadReport)],
  ['SSE done uses the shared recovery path', /if \(ev\.type === 'done'\) \{\s*void pollUntilDone\(ev\.jobId, true\)/.test(research)],
  ['recovery deduplicates before making requests', /if \([^\n]*pollingRef\.current === id[^\n]*\) return\s*pollingRef\.current = id/.test(pollReport)],
  ['an unsuccessful report load falls through to bounded status polling', /if \(tryReportFirst && await loadReport\(id\)\) return\s*for \(let i = 0; i < 30; i\+\+\)/.test(pollReport)],
  ['platform entries are validated before sorting', /const list = res\.ok \? parsePlatforms\(res\.data\) : null\s*if \(!list\)/.test(publish)],
  ['service errors are checked before replacing known booleans', /const status = parseServiceStatus\(await window\.desktopApi\.getServiceStatus\(\)\)\s*if \(!status\.ok\) throw new Error\(status\.error\)\s*setPublishConnected\(status\.publishConnected\)/.test(app)],
]
assert.deepEqual(finalReviewChecks.filter(([, passed]) => !passed).map(([message]) => message), [], 'final review safeguards failed')

console.log('Modern UI source verification passed')
