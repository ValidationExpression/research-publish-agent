# 本地发稿服务 (local-server)

墨流 InkFlow 的「本地大脑」：实现 Node 版 `RuntimeInterface`，原样复用 `@wechatsync/core` 的 23 个平台适配器，对外暴露 REST API，配合独立的 **Cookie Provider 插件**完成多平台发文。

## 架构

```
浏览器(已登录各平台)
   │  chrome.cookies
   ▼
[Cookie Provider 插件]  ──WebSocket(ws://localhost:9527) + Token──►  [本服务 local-server]
   │                                                          │
   │ 只供给 Cookie，不发稿                                      ├─ NodeRuntime.fetch 注入 Cookie ─► 各平台官方 Web API
   │                                                          └─ REST(127.0.0.1) + Token ─► 前端/脚本
```

- 插件仅负责读 Cookie 并经 WebSocket 供给本服务；发稿逻辑全部在本服务 Node 环境完成，不依赖插件转发请求。
- 安全：仅监听 `127.0.0.1`、Token 鉴权、Cookie 仅内存不落盘。

## 构建

```bash
pnpm --filter @wechatsync/local-server build
# 产物 dist/index.js（自包含：含 @wechatsync/core 源码与适配器注册）
```

## 启动

```bash
WECHATSYNC_TOKEN=你的随机串 pnpm --filter @wechatsync/local-server start
```

环境变量：

| 变量 | 说明 | 默认 |
|------|------|------|
| `WECHATSYNC_TOKEN` | REST/WS 鉴权 Token（必填，建议随机串），需与插件 popup 中填写一致 | 空（无鉴权，仍仅本地回环） |
| `WECHATSYNC_WS_PORT` | 插件连接的 WebSocket 端口 | `9527` |
| `WECHATSYNC_HTTP_PORT` | REST API 端口 | `8787` |

启动后：
- 插件连接：`ws://localhost:9527`
- REST API：`http://127.0.0.1:8787`

## REST API（均 127.0.0.1 + Token）

所有请求需带 Token：`?token=xxx` 或 `Authorization: Bearer xxx`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/status` | 插件连接状态 + 已持有 Cookie 的域名 |
| GET | `/platforms` | 所有平台元信息 + 本地登录态（是否持有该域 Cookie） |
| POST | `/sync` | 发起同步，返回 `{ syncId }` |
| GET | `/sync/:syncId` | 查询同步任务状态/结果 |

`POST /sync` 请求体：

```json
{
  "platforms": ["zhihu", "juejin"],
  "article": {
    "title": "文章标题",
    "html": "<h1>正文 HTML</h1><p>...</p>",
    "markdown": "# 可选 markdown",
    "cover": "https://.../cover.png 可选"
  },
  "draftOnly": true
}
```

默认 `draftOnly: true`（发草稿，需人工确认发布）。

调用示例：

```bash
# 查询平台与登录态
curl "http://127.0.0.1:8787/platforms?token=xxx"

# 发起同步（知乎发草稿）
curl -X POST "http://127.0.0.1:8787/sync?token=xxx" \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["zhihu"],"article":{"title":"测试","html":"<h1>你好</h1><p>正文</p>"},"draftOnly":true}'

# 查询同步状态
curl "http://127.0.0.1:8787/sync/<syncId>?token=xxx"
```

## 完整使用流程

1. 构建并加载 Cookie Provider 插件（`packages/cookie-provider`）：`chrome://extensions` 开开发者模式，加载 `packages/cookie-provider/dist`。
2. 打开插件 popup，填写本服务地址（默认 `ws://localhost:9527`）与相同 `WECHATSYNC_TOKEN`。
3. 在浏览器登录目标平台（知乎/掘金/CSDN 等）。
4. 启动本服务：`WECHATSYNC_TOKEN=xxx pnpm --filter @wechatsync/local-server start`。
5. 调用 `POST /sync` 选择平台发草稿；本服务按需通过插件拉取对应域名 Cookie，注入 `NodeRuntime.fetch` 后调平台官方接口。
6. 到各平台后台确认/发布草稿。

## 实现要点

- **NodeRuntime**（`src/runtime/node-runtime.ts`）：实现 `RuntimeInterface`，`fetch` 注入 Cookie + 应用适配器注册的 Header 规则（如知乎 `x-requested-with`）、真实浏览器 UA；`dom` 用 linkedom；Cookie/storage/session 内存实现。适配器业务代码零改动。
- **调度**（`src/sync.ts`）：遍历平台 → 取 `meta.homepage` 域名 → 缺失 Cookie 时向插件请求 → 按 `preprocessConfig` 预处理 HTML → `getAdapter().publish(草稿)`；平台间间隔 3s 降风控。
- **预处理**（`src/preprocess.ts`）：用 linkedom 按各平台 `preprocessConfig` 清洗（懒加载图、特殊标签、代码块、section→div 等），等价于原 Content Script。
- **Cookie 桥**（`src/ws-server.ts`）：WebSocket 服务端，仅 127.0.0.1，等插件连入，按需请求 Cookie 写入内存。

## 说明

- 复用 core 适配器，默认草稿优先；Cookie 仅内存、不落盘。
- 真实发文需用户在浏览器加载插件并提供对应平台登录态；无浏览器/账号无法自动化验证。
- 仅监听本地回环地址，请仅在可信环境使用。
