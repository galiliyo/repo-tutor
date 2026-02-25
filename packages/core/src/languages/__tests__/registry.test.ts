// packages/core/src/languages/__tests__/registry.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageRegistry } from '../registry';
import type { LanguagePlugin } from '../plugin';

describe('LanguageRegistry', () => {
  let registry: LanguageRegistry;

  beforeEach(() => {
    registry = new LanguageRegistry();
  });

  it('should register and retrieve a plugin by id', () => {
    const mockPlugin: LanguagePlugin = {
      id: 'test',
      extensions: ['.test'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    registry.register(mockPlugin);
    expect(registry.get('test')).toBe(mockPlugin);
  });

  it('should find plugin by file extension', () => {
    const mockPlugin: LanguagePlugin = {
      id: 'test',
      extensions: ['.test', '.tst'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    registry.register(mockPlugin);
    expect(registry.getByExtension('.test')).toBe(mockPlugin);
    expect(registry.getByExtension('.tst')).toBe(mockPlugin);
    expect(registry.getByExtension('.unknown')).toBeUndefined();
  });

  it('should list all registered plugins', () => {
    const plugin1: LanguagePlugin = {
      id: 'lang1',
      extensions: ['.l1'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    const plugin2: LanguagePlugin = {
      id: 'lang2',
      extensions: ['.l2'],
      parseFile: async () => ({ type: 'root', children: [] }),
      getImports: () => [],
      getExports: () => [],
      getSymbols: () => [],
    };

    registry.register(plugin1);
    registry.register(plugin2);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map(p => p.id)).toContain('lang1');
    expect(all.map(p => p.id)).toContain('lang2');
  });
});
