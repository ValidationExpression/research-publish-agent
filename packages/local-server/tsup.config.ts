import { defineConfig } from 'tsup'

// 把 local-server 与 @wechatsync/core 的 TS 源码一起打包为自包含 ESM。
// 原因：core 以 TS 源码发布（exports 指向 src/*.ts），Node 原生 ESM 在
// Windows+中文路径下无法解析 core 内部无扩展名的相对导入；打包后运行时
// 不再依赖 core 的 .ts 解析，且彻底自包含（仅外部化 Node 内置模块）。
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'publish-runtime': 'src/publish-runtime.ts',
    smoke: 'scripts/smoke.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  dts: true,
  clean: false,
  // 仅打包 @wechatsync/core 的 TS 源码（连同 local-server 自己的源码）；
  // npm 依赖（js-md5、linkedom、marked…）保持 external，由 Node 运行时解析。
  noExternal: [/@wechatsync\/core/],
  skipNodeModulesBundle: true,
  // 保留副作用：各平台文件顶层的 registerAdapter(...) 是注册核心，
  // 其导出未被直接引用，开启 tree-shake 会被摇掉导致适配器为空。
  treeshake: false,
})
