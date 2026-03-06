// packages/core/src/analysis/__tests__/analyzer.test.ts

import { describe, it, expect, afterEach } from 'vitest';
import { Analyzer } from '../analyzer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Analyzer', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true }).catch(() => {});
      tmpDir = null;
    }
  });

  it('should analyze a simple TypeScript project', async () => {
    // Create temp project
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));

    await fs.writeFile(path.join(tmpDir, 'index.ts'), `
      import { helper } from './utils';
      export function main() {
        return helper();
      }
    `);

    await fs.writeFile(path.join(tmpDir, 'utils.ts'), `
      export function helper() {
        return 'hello';
      }
    `);

    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      main: 'index.ts'
    }));

    const analyzer = new Analyzer();
    const result = await analyzer.analyze(tmpDir, {
      preset: 'standard',
      neverSend: [],
      skipAnalysis: ['node_modules'],
      confirmBeforeSend: false,
      maxCodeContextChars: 25000,
      strictMode: false,
    });

    expect(result.repoPath).toBe(tmpDir);
    expect(result.languages).toContain('typescript');
    expect(result.entryPoints.length).toBeGreaterThan(0);
    expect(result.dependencyGraph.nodes.length).toBe(2);
    expect(result.dependencyGraph.edges.length).toBe(1);
  });

  it('should discover Python files for modules and track detection', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));

    // Create a FastAPI-like project
    await fs.mkdir(path.join(tmpDir, 'app'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'app', 'static'), { recursive: true });

    await fs.writeFile(path.join(tmpDir, 'app', 'main.py'),
      "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/')\ndef root(): return {'hello': 'world'}");
    await fs.writeFile(path.join(tmpDir, 'app', 'models.py'),
      "from sqlalchemy import Column\nclass User:\n    pass");
    await fs.writeFile(path.join(tmpDir, 'app', 'static', 'app.js'),
      "document.querySelector('#app').innerHTML = 'hello';");

    const analyzer = new Analyzer();
    const result = await analyzer.analyze(tmpDir, {
      preset: 'standard',
      neverSend: [],
      skipAnalysis: ['node_modules'],
      confirmBeforeSend: false,
      maxCodeContextChars: 25000,
      strictMode: false,
    });

    // Modules should include 'app' (from Python files)
    const moduleNames = result.modules.map(m => m.name);
    expect(moduleNames).toContain('app');

    // app module should count Python files
    const appModule = result.modules.find(m => m.name === 'app')!;
    expect(appModule.fileCount).toBeGreaterThanOrEqual(2);

    // Languages should include python
    expect(result.languages).toContain('python');
  });

  it('should classify test directories with role "test"', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));

    await fs.mkdir(path.join(tmpDir, 'app'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });

    await fs.writeFile(path.join(tmpDir, 'app', 'main.py'), "print('hello')");
    await fs.writeFile(path.join(tmpDir, 'app', 'utils.py'), "def helper(): pass");
    await fs.writeFile(path.join(tmpDir, 'tests', 'test_main.py'), "def test_main(): pass");
    await fs.writeFile(path.join(tmpDir, 'tests', 'test_utils.py'), "def test_utils(): pass");

    const analyzer = new Analyzer();
    const result = await analyzer.analyze(tmpDir, {
      preset: 'standard',
      neverSend: [],
      skipAnalysis: ['node_modules'],
      confirmBeforeSend: false,
      maxCodeContextChars: 25000,
      strictMode: false,
    });

    const appModule = result.modules.find(m => m.name === 'app')!;
    const testsModule = result.modules.find(m => m.name === 'tests')!;
    expect(appModule.role).toBe('source');
    expect(testsModule.role).toBe('test');
  });

  it('should detect Python entry points', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-tutor-test-'));

    await fs.writeFile(path.join(tmpDir, 'main.py'),
      "if __name__ == '__main__':\n    print('hi')");
    await fs.writeFile(path.join(tmpDir, 'app.py'),
      "from flask import Flask\napp = Flask(__name__)");

    const analyzer = new Analyzer();
    const result = await analyzer.analyze(tmpDir, {
      preset: 'standard',
      neverSend: [],
      skipAnalysis: ['node_modules'],
      confirmBeforeSend: false,
      maxCodeContextChars: 25000,
      strictMode: false,
    });

    const epPaths = result.entryPoints.map(ep => ep.path);
    expect(epPaths).toContain('main.py');
    expect(epPaths).toContain('app.py');
  });
});
