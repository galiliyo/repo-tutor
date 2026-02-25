// packages/core/src/languages/javascript/__tests__/parser.test.ts

import { describe, it, expect } from 'vitest';
import { JavaScriptPlugin } from '../index';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('JavaScriptPlugin', () => {
  const plugin = new JavaScriptPlugin();

  it('should have correct id and extensions', () => {
    expect(plugin.id).toBe('javascript');
    expect(plugin.extensions).toContain('.js');
    expect(plugin.extensions).toContain('.ts');
    expect(plugin.extensions).toContain('.tsx');
  });

  it('should extract imports from a file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    await fs.writeFile(testFile, `
      import { foo } from './foo';
      import bar from 'bar';
      import * as baz from '../baz';
    `);

    const ast = await plugin.parseFile(testFile);
    const imports = plugin.getImports(ast);

    expect(imports).toHaveLength(3);
    expect(imports[0].source).toBe('./foo');
    expect(imports[0].specifiers).toContain('foo');
    expect(imports[0].isRelative).toBe(true);

    expect(imports[1].source).toBe('bar');
    expect(imports[1].isRelative).toBe(false);

    expect(imports[2].source).toBe('../baz');
    expect(imports[2].isRelative).toBe(true);

    await fs.rm(tmpDir, { recursive: true });
  });

  it('should extract symbols from a file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    await fs.writeFile(testFile, `
      function hello() {}

      class MyClass {
        method() {}
      }

      const myVar = 42;

      interface MyInterface {
        prop: string;
      }

      type MyTypeAlias = string | number;
    `);

    const ast = await plugin.parseFile(testFile);
    const symbols = plugin.getSymbols(ast);

    const names = symbols.map(s => s.name);
    expect(names).toContain('hello');
    expect(names).toContain('MyClass');
    expect(names).toContain('myVar');
    expect(names).toContain('MyInterface');
    expect(names).toContain('MyTypeAlias');

    // Verify type alias has correct kind
    const typeAlias = symbols.find(s => s.name === 'MyTypeAlias');
    expect(typeAlias?.kind).toBe('type');

    await fs.rm(tmpDir, { recursive: true });
  });

  it('should extract exports from a file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));
    const testFile = path.join(tmpDir, 'test.ts');

    await fs.writeFile(testFile, `
      export function myFunc() {}
      export class MyClass {}
      export const myVar = 42;
      export interface MyInterface {}
      export type MyType = string;
      export default function defaultFunc() {}
    `);

    const ast = await plugin.parseFile(testFile);
    const exports = plugin.getExports(ast);

    const names = exports.map(e => e.name);
    expect(names).toContain('myFunc');
    expect(names).toContain('MyClass');
    expect(names).toContain('myVar');
    expect(names).toContain('MyInterface');
    expect(names).toContain('MyType');
    expect(names).toContain('default');

    const funcExport = exports.find(e => e.name === 'myFunc');
    expect(funcExport?.kind).toBe('function');

    const classExport = exports.find(e => e.name === 'MyClass');
    expect(classExport?.kind).toBe('class');

    const varExport = exports.find(e => e.name === 'myVar');
    expect(varExport?.kind).toBe('variable');

    const interfaceExport = exports.find(e => e.name === 'MyInterface');
    expect(interfaceExport?.kind).toBe('type');

    const typeExport = exports.find(e => e.name === 'MyType');
    expect(typeExport?.kind).toBe('type');

    const defaultExport = exports.find(e => e.name === 'default');
    expect(defaultExport?.kind).toBe('default');

    await fs.rm(tmpDir, { recursive: true });
  });
});
