# Cookie Provider 插件（InkFlow 登录态助手）

墨流 InkFlow 的「登录态供给」轻量 Chrome 插件：**只读取你已登录平台的 Cookie 并经 WebSocket 提供给本地服务，不执行任何发稿逻辑**。

## 构建

```bash
pnpm --filter @wechatsync/cookie-provider build
```

产物在 `dist/`。在 `chrome://extensions` 开启「开发者模式」后加载该目录即可。

## 使用

1. 打开 popup，填入本地服务地址（默认 `ws://localhost:9527`）与 Token（需与本地服务 `WECHATSYNC_TOKEN` 一致）。
2. 保存后插件自动连接本地服务；本地服务发稿时按需请求对应域名 Cookie，仅在内存中使用，不落盘。

## 安全

- 仅监听本地回环地址、Token 鉴权；Cookie 仅在内存中使用，进程退出即清。
- 需要 `host_permissions: <all_urls>` 才能读取各平台 Cookie，请仅在可信环境使用。
- 本插件不读取、不上传任何文章内容。

## 与现有 extension 的区别

现有 `packages/extension` 既读 Cookie 又执行发稿；本插件是精简的独立供给方，发稿全部由本地 `packages/local-server` 完成。
