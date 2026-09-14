import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/main/index.ts' },
    format: ['cjs'],
    outDir: 'dist/main',
    platform: 'node',
    external: ['electron', '@wechatsync/local-server', /^@wechatsync\//],
    treeshake: false,
  },
  {
    entry: { index: 'src/preload/index.ts' },
    format: ['cjs'],
    outDir: 'dist/preload',
    platform: 'node',
    external: ['electron'],
  },
])
