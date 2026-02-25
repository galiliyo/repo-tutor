// packages/core/src/languages/registry.ts

import type { LanguagePlugin } from './plugin';

export class LanguageRegistry {
  private plugins: Map<string, LanguagePlugin> = new Map();
  private extensionMap: Map<string, LanguagePlugin> = new Map();

  register(plugin: LanguagePlugin): void {
    this.plugins.set(plugin.id, plugin);
    for (const ext of plugin.extensions) {
      this.extensionMap.set(ext, plugin);
    }
  }

  get(id: string): LanguagePlugin | undefined {
    return this.plugins.get(id);
  }

  getByExtension(ext: string): LanguagePlugin | undefined {
    return this.extensionMap.get(ext);
  }

  getAll(): LanguagePlugin[] {
    return Array.from(this.plugins.values());
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }
}
