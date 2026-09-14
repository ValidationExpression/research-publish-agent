/**
 * 注册所有公开平台适配器到 core 的 adapterRegistry。
 *
 * core 本身不自动注册（由使用方负责，参见 extension 的 initAdapters）。
 * 这里复刻同样逻辑，但用静态导入遍历 core 导出的适配器类
 * （tsup/esbuild 不支持 extension 使用的 import.meta.glob 动态加载）。
 */
import { registerAdapter } from '@wechatsync/core/adapters'
import type { AdapterRegistryEntry, PlatformAdapter } from '@wechatsync/core/adapters'
import * as core from '@wechatsync/core'

let registered = false

export function registerAllPlatforms(): void {
  if (registered) return
  for (const exported of Object.values(core)) {
    // 仅处理名称以 Adapter 结尾的类
    if (typeof exported !== 'function' || !exported.name?.endsWith('Adapter')) continue
    try {
      const Cls = exported as new () => PlatformAdapter
      const instance = new Cls()
      const meta = instance.meta
      if (meta?.id) {
        const entry: AdapterRegistryEntry = {
          meta,
          factory: () => new Cls(),
          preprocessConfig: (instance as { preprocessConfig?: AdapterRegistryEntry['preprocessConfig'] }).preprocessConfig,
        }
        registerAdapter(entry)
      }
    } catch {
      // 抽象基类等实例化失败，跳过
    }
  }
  registered = true
}
