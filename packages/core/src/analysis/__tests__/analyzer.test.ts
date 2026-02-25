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
    expect(result.languages).toContain('javascript');
    expect(result.entryPoints.length).toBeGreaterThan(0);
    expect(result.dependencyGraph.nodes.length).toBe(2);
    expect(result.dependencyGraph.edges.length).toBe(1);
  });
});
