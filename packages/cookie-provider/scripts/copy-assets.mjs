// 构建后将静态资源复制到 dist，使 Chrome 可直接加载 dist/ 作为扩展。
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })
copyFileSync('manifest.json', 'dist/manifest.json')
copyFileSync('public/popup.html', 'dist/popup.html')
console.log('[cookie-provider] copied manifest.json + popup.html -> dist/')
