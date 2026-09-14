import { defineConfig } from 'tsup'

// 精简插件构建：把 background / popup 两个 TS 入口编译为 ESM，
// 由 onSuccess 脚本把 manifest.json 与 popup.html 复制到 dist。
export default defineConfig({
  entry: {
    background: 'src/background.ts',
    popup: 'src/popup.ts',
  },
  format: ['esm'],
  target: 'chrome110',
  outDir: 'dist',
  clean: true,
  minify: false,
  onSuccess: 'node scripts/copy-assets.mjs',
})
