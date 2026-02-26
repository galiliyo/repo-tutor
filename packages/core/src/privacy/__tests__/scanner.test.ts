// packages/core/src/privacy/__tests__/scanner.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scanner } from '../scanner';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Scanner', () => {
  const scanner = new Scanner();
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scanner-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('scanFile', () => {
    it('should detect secrets in a file', async () => {
      const testFile = path.join(tempDir, 'secrets.ts');
      await fs.writeFile(
        testFile,
        `const API_KEY = "sk-1234567890abcdefghijklmnop";`
      );

      const result = await scanner.scanFile(testFile);

      expect(result.file).toBe(testFile);
      expect(result.hasSecrets).toBe(true);
      expect(result.redactionTypes).toContain('api_key');
    });

    it('should report no secrets in clean file', async () => {
      const testFile = path.join(tempDir, 'clean.ts');
      await fs.writeFile(testFile, `function hello() { return "world"; }`);

      const result = await scanner.scanFile(testFile);

      expect(result.file).toBe(testFile);
      expect(result.hasSecrets).toBe(false);
      expect(result.redactionTypes).toHaveLength(0);
    });

    it('should detect multiple secret types', async () => {
      const testFile = path.join(tempDir, 'multi.ts');
      await fs.writeFile(
        testFile,
        `
const config = {
  awsKey: "AKIAIOSFODNN7EXAMPLE",
  dbUrl: "postgres://user:pass@localhost/db"
};
`
      );

      const result = await scanner.scanFile(testFile);

      expect(result.hasSecrets).toBe(true);
      expect(result.redactionTypes).toContain('aws_key');
      expect(result.redactionTypes).toContain('connection_string');
    });
  });

  describe('scanDirectory', () => {
    it('should scan all matching files in directory', async () => {
      // Create files with and without secrets
      await fs.writeFile(
        path.join(tempDir, 'secret1.ts'),
        `const KEY = "sk-abcdefghij1234567890abcd";`
      );
      await fs.writeFile(
        path.join(tempDir, 'secret2.js'),
        `const TOKEN = "AKIAIOSFODNN7EXAMPLE";`
      );
      await fs.writeFile(
        path.join(tempDir, 'clean.ts'),
        `function clean() { return true; }`
      );

      const results = await scanner.scanDirectory(tempDir);

      // Should only return files with secrets
      expect(results.length).toBe(2);
      expect(results.map((r) => path.basename(r.file))).toContain('secret1.ts');
      expect(results.map((r) => path.basename(r.file))).toContain('secret2.js');
    });

    it('should scan subdirectories recursively', async () => {
      const subDir = path.join(tempDir, 'subdir');
      await fs.mkdir(subDir);
      await fs.writeFile(
        path.join(subDir, 'nested.ts'),
        `const KEY = "sk-nestedkey1234567890abcd";`
      );

      const results = await scanner.scanDirectory(tempDir);

      expect(results.length).toBe(1);
      expect(results[0].file).toContain('nested.ts');
    });

    it('should skip node_modules directory', async () => {
      const nodeModules = path.join(tempDir, 'node_modules');
      await fs.mkdir(nodeModules);
      await fs.writeFile(
        path.join(nodeModules, 'dep.js'),
        `const KEY = "sk-moduleskey123456789abc";`
      );

      const results = await scanner.scanDirectory(tempDir);

      expect(results.length).toBe(0);
    });

    it('should skip hidden directories', async () => {
      const hiddenDir = path.join(tempDir, '.hidden');
      await fs.mkdir(hiddenDir);
      await fs.writeFile(
        path.join(hiddenDir, 'secret.ts'),
        `const KEY = "sk-hiddenkey12345678901abc";`
      );

      const results = await scanner.scanDirectory(tempDir);

      expect(results.length).toBe(0);
    });

    it('should only scan files with specified extensions', async () => {
      await fs.writeFile(
        path.join(tempDir, 'config.yaml'),
        `api_key: "sk-yamlkey123456789012345abc"`
      );
      await fs.writeFile(
        path.join(tempDir, 'secret.ts'),
        `const KEY = "sk-tskey1234567890123456abc";`
      );

      // Default extensions don't include .yaml
      const results = await scanner.scanDirectory(tempDir);

      expect(results.length).toBe(1);
      expect(results[0].file).toContain('secret.ts');
    });

    it('should allow custom extensions', async () => {
      await fs.writeFile(
        path.join(tempDir, 'config.yaml'),
        `api_key: sk-yamlkey123456789012345abc`
      );

      const results = await scanner.scanDirectory(tempDir, ['.yaml']);

      expect(results.length).toBe(1);
      expect(results[0].file).toContain('config.yaml');
    });

    it('should scan .env files by default', async () => {
      await fs.writeFile(
        path.join(tempDir, '.env'),
        `DATABASE_URL=postgres://user:pass@localhost/db`
      );

      const results = await scanner.scanDirectory(tempDir);

      expect(results.length).toBe(1);
      expect(results[0].redactionTypes).toContain('connection_string');
    });
  });
});
