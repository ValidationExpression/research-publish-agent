# Modern Research Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing Electron renderer as the approved modern light research workspace while preserving all research, review, and publish APIs and behavior.

**Architecture:** Keep `App` as the workflow/data owner, extract presentation-only shell components, and keep async research and publishing operations inside their existing pages. Add small pure view-model helpers for state derivation so workflow, research, and publishing rules can be unit-tested without introducing a browser test dependency. Replace the current paper design with one coherent responsive CSS system and validate it through unit tests, typechecking, production builds, source-level design assertions, and browser screenshots.

**Tech Stack:** React 18, TypeScript 5, Vite 6, Electron 33, Vitest 1.6, plain CSS, inline SVG icons.

## Global Constraints

- Preserve the existing `window.desktopApi` contract and the research/publish endpoint paths.
- Preserve the three-step flow: `research → review → publish`.
- Do not add research-history persistence, uploads, research-depth controls, source selectors, account UI, external fonts, icon libraries, or image assets.
- Use warm white `#FBFAF7`, stone `#F1F0EC`, graphite `#17191C`, cobalt `#315CF5`, and the semantic status colors from the design spec.
- Use a modern Chinese sans-serif system stack, 8px spacing rhythm, restrained 8–10px radii, fine borders, and minimal shadow.
- Preserve unrelated user changes. Stage only explicitly listed files at each commit.
- All async actions need idle, loading, success, and error presentation; keyboard focus must remain visible.

---

### Task 1: Add testable workflow state and the shared application shell

**Files:**
- Modify: `packages/desktop/package.json`
- Create: `packages/desktop/src/renderer/workflow.ts`
- Create: `packages/desktop/src/renderer/workflow.test.ts`
- Create: `packages/desktop/src/renderer/components/WorkflowSidebar.tsx`
- Create: `packages/desktop/src/renderer/components/PageHeader.tsx`
- Modify: `packages/desktop/src/renderer/components/Icons.tsx`
- Modify: `packages/desktop/src/renderer/App.tsx`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `type AppStep = 'research' | 'review' | 'publish'` from `workflow.ts`.
- Produces `getWorkflowSteps(current, article): WorkflowStepView[]`.
- Produces `WorkflowSidebarProps` with `currentStep`, `article`, `publishConnected`, `researchOk`, and `onStepChange`.
- Produces `PageHeaderProps` with `eyebrow`, `title`, `description`, and optional `status`/`actions`.
- `App.tsx` remains the only owner of `step`, `article`, and service status.

- [ ] **Step 1: Add a failing workflow state test**

Add a `test` script and Vitest dev dependency to `packages/desktop/package.json`:

```json
"scripts": {
  "test": "vitest run",
  "dev": "pnpm --filter @wechatsync/local-server build && pnpm build:main && concurrently -k \"vite\" \"wait-on http://127.0.0.1:5173 && cross-env NODE_ENV=development electron .\"",
  "build:main": "tsup",
  "build:renderer": "vite build",
  "build": "pnpm build:main && pnpm build:renderer",
  "typecheck": "tsc --noEmit"
},
"devDependencies": {
  "@types/node": "^20.10.0",
  "@types/react": "^18.3.12",
  "@types/react-dom": "^18.3.1",
  "@vitejs/plugin-react": "^4.3.4",
  "concurrently": "^9.1.0",
  "cross-env": "^7.0.3",
  "electron": "^33.2.0",
  "tsup": "^8.0.1",
  "typescript": "^5.3.0",
  "vite": "^6.0.3",
  "vitest": "^1.6.1",
  "wait-on": "^8.0.1"
}
```

Create `workflow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getWorkflowSteps } from './workflow'

describe('getWorkflowSteps', () => {
  it('locks later steps before a report exists', () => {
    const steps = getWorkflowSteps('research', { title: '', markdown: '' })
    expect(steps.map(({ state }) => state)).toEqual(['active', 'locked', 'locked'])
  })

  it('unlocks review after research completes', () => {
    const steps = getWorkflowSteps('review', { title: '标题', markdown: '# 报告' })
    expect(steps.map(({ state }) => state)).toEqual(['complete', 'active', 'available'])
  })

  it('marks previous steps complete on publish', () => {
    const steps = getWorkflowSteps('publish', { title: '标题', markdown: '# 报告' })
    expect(steps.map(({ state }) => state)).toEqual(['complete', 'complete', 'active'])
  })
})
```

- [ ] **Step 2: Install the existing locked Vitest version and verify the test fails**

Run: `pnpm install --lockfile-only && pnpm --filter @research-publish-agent/desktop test`

Expected: FAIL because `./workflow` does not exist.

- [ ] **Step 3: Implement the pure workflow model**

Create `workflow.ts`:

```ts
export type AppStep = 'research' | 'review' | 'publish'
export type WorkflowState = 'active' | 'complete' | 'available' | 'locked'

export interface WorkflowArticle {
  title: string
  markdown: string
}

export interface WorkflowStepView {
  id: AppStep
  index: string
  title: string
  description: string
  state: WorkflowState
}

const STEP_COPY: Omit<WorkflowStepView, 'state'>[] = [
  { id: 'research', index: '01', title: '研究', description: '联网检索并生成报告' },
  { id: 'review', index: '02', title: '审阅', description: '调整标题与正文' },
  { id: 'publish', index: '03', title: '发布', description: '同步草稿到各平台' },
]

export function getWorkflowSteps(current: AppStep, article: WorkflowArticle): WorkflowStepView[] {
  const currentIndex = STEP_COPY.findIndex(({ id }) => id === current)
  const unlocked = new Set<AppStep>(['research'])
  if (article.markdown.trim()) unlocked.add('review')
  if (article.title.trim() && article.markdown.trim()) unlocked.add('publish')

  return STEP_COPY.map((step, index) => ({
    ...step,
    state: step.id === current
      ? 'active'
      : index < currentIndex
        ? 'complete'
        : unlocked.has(step.id)
          ? 'available'
          : 'locked',
  }))
}
```

- [ ] **Step 4: Run the workflow test**

Run: `pnpm --filter @research-publish-agent/desktop test -- workflow.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Build the shell components and wire them into `App`**

Implement `WorkflowSidebar` as a semantic `<aside>`/`<nav>` that maps `getWorkflowSteps`, uses real `<button>` elements, applies `aria-current="step"`, and disables only `locked` steps. Give locked controls an accessible description explaining the prerequisite. Render the brand, connected service rows, and the existing icon components. Implement `PageHeader` as a reusable header with `eyebrow`, `title`, `description`, optional status, and optional actions.

Update `App.tsx` to import `AppStep` from `workflow.ts`, render the shell components, keep the existing service polling and page routing, and change page copy to the block below. Wrap `getServiceStatus()` in `try/catch`; on refresh failure, leave the prior `publishConnected` and `researchOk` values unchanged so the status does not flicker to a false failure state.

```ts
const PAGE_META = {
  research: {
    eyebrow: 'RESEARCH / 01',
    title: '今天想研究什么？',
    description: '输入主题，Agent 将联网检索资料并整理成可发表的 Markdown 报告。',
  },
  review: {
    eyebrow: 'REVIEW / 02',
    title: '审阅并完善报告',
    description: '调整标题与正文，并通过实时预览确认最终呈现。',
  },
  publish: {
    eyebrow: 'PUBLISH / 03',
    title: '选择发布平台',
    description: '将确认后的内容安全同步为各平台草稿。',
  },
} satisfies Record<AppStep, { eyebrow: string; title: string; description: string }>
```

- [ ] **Step 6: Typecheck and commit the shell**

Run: `pnpm --filter @research-publish-agent/desktop typecheck`

Expected: PASS with no TypeScript errors.

Commit:

```bash
git add packages/desktop/package.json pnpm-lock.yaml packages/desktop/src/renderer/workflow.ts packages/desktop/src/renderer/workflow.test.ts packages/desktop/src/renderer/components/WorkflowSidebar.tsx packages/desktop/src/renderer/components/PageHeader.tsx packages/desktop/src/renderer/components/Icons.tsx packages/desktop/src/renderer/App.tsx
git commit -m "feat(desktop): build modern workflow shell"
```

### Task 2: Rebuild the research composer and progress experience

**Files:**
- Create: `packages/desktop/src/renderer/research-view-model.ts`
- Create: `packages/desktop/src/renderer/research-view-model.test.ts`
- Modify: `packages/desktop/src/renderer/pages/ResearchPage.tsx`
- Modify: `packages/desktop/src/renderer/components/Icons.tsx`

**Interfaces:**
- Produces `RESEARCH_SUGGESTIONS: readonly string[]`.
- Produces `canStartResearch(topic, running): boolean`.
- Produces `classifyResearchLog(line): 'default' | 'progress' | 'done' | 'error'`.
- `ResearchPage` retains `onComplete(draft: ArticleDraft): void` and all current API paths.

- [ ] **Step 1: Write failing research view-model tests**

```ts
import { describe, expect, it } from 'vitest'
import { canStartResearch, classifyResearchLog } from './research-view-model'

describe('research view model', () => {
  it('starts only with non-empty text while idle', () => {
    expect(canStartResearch('  ', false)).toBe(false)
    expect(canStartResearch('AI Agent 框架对比', true)).toBe(false)
    expect(canStartResearch('AI Agent 框架对比', false)).toBe(true)
  })

  it('maps transport logs to semantic tones', () => {
    expect(classifyResearchLog('[error] 网络中断')).toBe('error')
    expect(classifyResearchLog('[done] 报告已生成')).toBe('done')
    expect(classifyResearchLog('[progress] 正在检索')).toBe('progress')
    expect(classifyResearchLog('任务已创建')).toBe('default')
  })
})
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm --filter @research-publish-agent/desktop test -- research-view-model.test.ts`

Expected: FAIL because `research-view-model.ts` does not exist.

- [ ] **Step 3: Implement the research helpers**

```ts
export const RESEARCH_SUGGESTIONS = [
  '2026 年主流 AI Agent 框架的能力与适用场景对比',
  '中国新能源汽车出海的机会、风险与区域差异',
  '大模型推理成本的构成与工程优化路径',
] as const

export function canStartResearch(topic: string, running: boolean): boolean {
  return !running && topic.trim().length > 0
}

export function classifyResearchLog(line: string): 'default' | 'progress' | 'done' | 'error' {
  if (line.includes('[error]')) return 'error'
  if (line.includes('[done]')) return 'done'
  if (line.includes('[progress]')) return 'progress'
  return 'default'
}
```

- [ ] **Step 4: Run the research tests**

Run: `pnpm --filter @research-publish-agent/desktop test -- research-view-model.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Implement the approved composer layout**

Update `ResearchPage.tsx` to use a `<textarea maxLength={2000}>`, a live counter, suggestion buttons, `Ctrl/Cmd + Enter`, and the integrated arrow submit button. Keep `/research`, `/research/:id/status`, `/research/:id/report`, SSE handling, fallback polling, and automatic review navigation unchanged. Replace technical log styling with semantic timeline rows while preserving the exact messages.

Add this keyboard handler to the textarea:

```ts
function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canStartResearch(topic, running)) {
    e.preventDefault()
    void startResearch()
  }
}
```

Render the real three-stage explanation after the composer:

```tsx
<ol className="research-stages" aria-label="研究流程">
  <li><IconGlobe /><strong>联网检索</strong><span>从公开网页获取相关资料</span></li>
  <li><IconLayers /><strong>资料分析</strong><span>阅读、筛选并交叉验证</span></li>
  <li><IconReport /><strong>生成报告</strong><span>输出可继续编辑的 Markdown</span></li>
</ol>
```

- [ ] **Step 6: Verify and commit the research page**

Run:

```bash
pnpm --filter @research-publish-agent/desktop test
pnpm --filter @research-publish-agent/desktop typecheck
```

Expected: all tests PASS and typecheck exits 0.

Commit:

```bash
git add packages/desktop/src/renderer/research-view-model.ts packages/desktop/src/renderer/research-view-model.test.ts packages/desktop/src/renderer/pages/ResearchPage.tsx packages/desktop/src/renderer/components/Icons.tsx
git commit -m "feat(desktop): redesign research composer"
```

### Task 3: Improve review and publish interaction states

**Files:**
- Create: `packages/desktop/src/renderer/publish-view-model.ts`
- Create: `packages/desktop/src/renderer/publish-view-model.test.ts`
- Modify: `packages/desktop/src/renderer/pages/ReviewPage.tsx`
- Modify: `packages/desktop/src/renderer/pages/PublishPage.tsx`
- Modify: `packages/desktop/src/renderer/components/Icons.tsx`

**Interfaces:**
- Produces `sortPlatforms(platforms): Platform[]` and `reconcileSelection(platforms, selected): Set<string>`.
- `ReviewPage` keeps `article`, `onChange`, and `onNext` props.
- `PublishPage` keeps `article` and all `/platforms`, `/sync`, `/sync/:id` behavior.

- [ ] **Step 1: Write failing platform-state tests**

```ts
import { describe, expect, it } from 'vitest'
import { reconcileSelection, sortPlatforms } from './publish-view-model'

const platforms = [
  { id: 'zhihu', name: '知乎', loggedIn: false },
  { id: 'csdn', name: 'CSDN', loggedIn: true },
  { id: 'weixin', name: '微信公众号', loggedIn: true },
]

describe('publish view model', () => {
  it('puts logged-in platforms first', () => {
    expect(sortPlatforms(platforms).map(({ id }) => id)).toEqual(['csdn', 'weixin', 'zhihu'])
  })

  it('removes unavailable platforms from selection', () => {
    expect([...reconcileSelection(platforms, new Set(['csdn', 'zhihu']))]).toEqual(['csdn'])
  })
})
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm --filter @research-publish-agent/desktop test -- publish-view-model.test.ts`

Expected: FAIL because `publish-view-model.ts` does not exist.

- [ ] **Step 3: Implement platform state helpers**

```ts
export interface PublishPlatform {
  id: string
  name: string
  loggedIn: boolean
}

export function sortPlatforms(platforms: PublishPlatform[]): PublishPlatform[] {
  return [...platforms].sort((a, b) => {
    if (a.loggedIn !== b.loggedIn) return a.loggedIn ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

export function reconcileSelection(platforms: PublishPlatform[], selected: Set<string>): Set<string> {
  const available = new Set(platforms.filter(({ loggedIn }) => loggedIn).map(({ id }) => id))
  return new Set([...selected].filter((id) => available.has(id)))
}
```

- [ ] **Step 4: Run platform-state tests**

Run: `pnpm --filter @research-publish-agent/desktop test -- publish-view-model.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Rebuild the review layout**

Update `ReviewPage.tsx` so the page begins with a compact document toolbar containing the live character count and “进入发布” action. Keep labeled title and Markdown fields in the left pane and the `marked` preview in the right pane. Add a nearby validation hint when either value is empty; do not change how `onChange` or `onNext` works.

Use this validity rule:

```ts
const canContinue = article.title.trim().length > 0 && article.markdown.trim().length > 0
```

- [ ] **Step 6: Rebuild the publish layout and error states**

Update `PublishPage.tsx` to track `loadingPlatforms` and `platformError`, disable checkbox selection for logged-out platforms, reconcile the selection after each refresh, and present retryable load errors. Use a compact list with a header summary, a sticky action footer, and an `aria-live="polite"` result region. Preserve the existing sync payload exactly.

Use this load failure branch:

```ts
if (!res.ok || !res.data || typeof res.data !== 'object') {
  setPlatformError('无法读取平台状态，请确认 Cookie 插件已连接后重试。')
  setLoadingPlatforms(false)
  return
}
```

- [ ] **Step 7: Verify and commit review/publish behavior**

Run:

```bash
pnpm --filter @research-publish-agent/desktop test
pnpm --filter @research-publish-agent/desktop typecheck
```

Expected: all tests PASS and typecheck exits 0.

Commit:

```bash
git add packages/desktop/src/renderer/publish-view-model.ts packages/desktop/src/renderer/publish-view-model.test.ts packages/desktop/src/renderer/pages/ReviewPage.tsx packages/desktop/src/renderer/pages/PublishPage.tsx packages/desktop/src/renderer/components/Icons.tsx
git commit -m "feat(desktop): refine review and publishing flow"
```

### Task 4: Replace the paper theme with the approved responsive visual system

**Files:**
- Create: `packages/desktop/scripts/verify-modern-ui.mjs`
- Modify: `packages/desktop/package.json`
- Modify: `packages/desktop/src/renderer/styles.css`
- Modify: `packages/desktop/src/renderer/index.html`

**Interfaces:**
- Adds `pnpm --filter @research-publish-agent/desktop verify:ui`.
- CSS consumes the class names produced by Tasks 1–3 and exposes no JavaScript API.

- [ ] **Step 1: Add a failing source-level design verification**

Add `"verify:ui": "node scripts/verify-modern-ui.mjs"` to the desktop scripts and create:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(`${root}/src/renderer/styles.css`, 'utf8')
const app = readFileSync(`${root}/src/renderer/App.tsx`, 'utf8')

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

console.log('Modern UI source verification passed')
```

- [ ] **Step 2: Run the source verification and confirm failure**

Run: `pnpm --filter @research-publish-agent/desktop verify:ui`

Expected: FAIL on the first missing approved token or selector.

- [ ] **Step 3: Implement the complete visual system**

Replace `styles.css` with a single modern workspace stylesheet organized in this order:

1. Approved color, type, spacing, radius, shadow, and motion tokens.
2. Reset, typography, selection, focus-visible, reduced motion.
3. Window title bar and two-column application shell.
4. Brand, connected workflow rail, workflow states, and service rows.
5. Page header and common controls.
6. Research composer, suggestion buttons, stages, and progress timeline.
7. Review toolbar, editor pane, preview pane, and Markdown content styles.
8. Publish summary, platform rows, checkbox states, action footer, and result feedback.
9. `@media (max-width: 1100px)` for denser desktop windows.
10. `@media (max-width: 900px)` for top workflow navigation and stacked content.

The stylesheet must implement these exact foundational tokens:

```css
:root {
  --canvas: #fbfaf7;
  --sidebar: #f1f0ec;
  --surface: #ffffff;
  --ink: #17191c;
  --muted: #6f7580;
  --border: #e4e2dc;
  --primary: #315cf5;
  --primary-soft: #eef2ff;
  --success: #1f9d6a;
  --warning: #c77a16;
  --danger: #c8473b;
  --font-sans: Inter, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --shadow-composer: 0 18px 45px rgba(32, 38, 52, 0.08);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --transition: 160ms ease;
}
```

Update `index.html` to set `lang="zh-CN"`, the title `Research Publish`, and a matching `theme-color` of `#FBFAF7` without external font requests.

- [ ] **Step 4: Run static, type, and build verification**

Run:

```bash
pnpm --filter @research-publish-agent/desktop verify:ui
pnpm --filter @research-publish-agent/desktop typecheck
pnpm --filter @research-publish-agent/desktop build
```

Expected: source verification prints `Modern UI source verification passed`; typecheck and build exit 0.

- [ ] **Step 5: Commit the visual system**

```bash
git add packages/desktop/package.json packages/desktop/scripts/verify-modern-ui.mjs packages/desktop/src/renderer/styles.css packages/desktop/src/renderer/index.html
git commit -m "style(desktop): apply modern research workspace theme"
```

### Task 5: Update preview fixtures and perform end-to-end visual QA

**Files:**
- Modify: `packages/desktop/src/renderer/main.tsx`
- Modify if defects are found: `packages/desktop/src/renderer/App.tsx`
- Modify if defects are found: `packages/desktop/src/renderer/pages/ResearchPage.tsx`
- Modify if defects are found: `packages/desktop/src/renderer/pages/ReviewPage.tsx`
- Modify if defects are found: `packages/desktop/src/renderer/pages/PublishPage.tsx`
- Modify if defects are found: `packages/desktop/src/renderer/styles.css`

**Interfaces:**
- Development preview continues to provide the complete `DesktopApi` interface.
- Preview fixtures must exercise connected services, research progress/completion, mixed platform login states, and mixed publish outcomes.

- [ ] **Step 1: Update preview-only fixture copy and timing**

Change the sample article to a neutral modern-workspace report and make SSE progress asynchronous enough to inspect the progress UI:

```ts
const sample = {
  title: '2026 年主流 AI Agent 框架对比',
  markdown: [
    '# 2026 年主流 AI Agent 框架对比',
    '',
    '本文从架构设计、工具调用、状态管理与生产部署四个维度进行比较。',
    '',
    '## 核心结论',
    '',
    '- 不同框架面向的工程阶段并不相同。',
    '- 生产选型应优先考虑可观测性与故障恢复。',
    '',
    '> 框架能力只是起点，可靠的运行机制决定最终效果。',
  ].join('\n'),
}
```

Emit at least two `progress` events before `done`; do not change the production preload bridge.

- [ ] **Step 2: Start the development renderer and inspect all states**

Run: `pnpm --filter @research-publish-agent/desktop exec vite --host 127.0.0.1`

Expected: Vite reports a local URL and remains running.

Inspect at 1600×1000, 1280×800, and 820×900:

- Research idle: composer is the dominant element; action is disabled until text exists.
- Research running: input is locked; progress events are readable; layout does not jump.
- Review: edit and preview columns align; narrow viewport stacks them.
- Publish: logged-out rows cannot be selected; refresh, loading, empty/error, publishing, and result states are visually distinct.
- Keyboard: tab order is logical, focus ring is visible, and `Ctrl/Cmd + Enter` submits only valid research text.
- No horizontal overflow, clipped action, unreadable muted text, or inaccessible contrast.

- [ ] **Step 3: Fix only defects found during visual inspection**

Keep fixes within the files listed for this task. Do not add features beyond the design spec. Re-run the exact affected state after each fix.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
pnpm --filter @research-publish-agent/desktop test
pnpm --filter @research-publish-agent/desktop verify:ui
pnpm --filter @research-publish-agent/desktop typecheck
pnpm --filter @research-publish-agent/desktop build
git diff --check
```

Expected: all tests pass, UI verification prints its success line, typecheck/build exit 0, and `git diff --check` prints nothing.

- [ ] **Step 5: Commit preview and QA fixes**

```bash
git add packages/desktop/src/renderer/main.tsx packages/desktop/src/renderer/App.tsx packages/desktop/src/renderer/pages/ResearchPage.tsx packages/desktop/src/renderer/pages/ReviewPage.tsx packages/desktop/src/renderer/pages/PublishPage.tsx packages/desktop/src/renderer/styles.css
git commit -m "test(desktop): verify modern workspace states"
```

### Task 6: Final regression review

**Files:**
- Review only: all files changed in Tasks 1–5

**Interfaces:**
- No new interfaces; this task confirms the assembled renderer meets the approved spec.

- [ ] **Step 1: Confirm only intended files changed**

Run: `git status --short && git diff --stat 0836a9a..HEAD`

Expected: no unrelated files are staged; the diff is limited to desktop renderer/test files, the desktop package manifest, and lockfile.

- [ ] **Step 2: Confirm the API contract is unchanged**

Run:

```bash
git diff 0836a9a..HEAD -- packages/desktop/src/preload/index.ts packages/desktop/src/main/index.ts
rg -n "researchFetch\('/research|publishFetch\('/platforms|publishFetch\('/sync" packages/desktop/src/renderer
```

Expected: no preload/main contract diff; the existing research and publish endpoint calls remain present.

- [ ] **Step 3: Record final verification evidence**

Run:

```bash
pnpm --filter @research-publish-agent/desktop test
pnpm --filter @research-publish-agent/desktop verify:ui
pnpm --filter @research-publish-agent/desktop typecheck
pnpm --filter @research-publish-agent/desktop build
```

Expected: every command exits 0. Include counts and build artifact summary in the handoff.
