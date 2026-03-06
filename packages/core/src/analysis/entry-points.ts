// packages/core/src/analysis/entry-points.ts

import type { FileReference } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function detectEntryPoints(repoPath: string): Promise<FileReference[]> {
  const entryPoints: FileReference[] = [];

  // Check package.json
  try {
    const pkgPath = path.join(repoPath, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

    if (pkg.main) {
      entryPoints.push({ path: pkg.main, reason: 'package.json main' });
    }
    if (pkg.module) {
      entryPoints.push({ path: pkg.module, reason: 'package.json module' });
    }
    if (typeof pkg.bin === 'string') {
      entryPoints.push({ path: pkg.bin, reason: 'package.json bin' });
    } else if (typeof pkg.bin === 'object') {
      for (const [name, binPath] of Object.entries(pkg.bin)) {
        entryPoints.push({ path: binPath as string, reason: `package.json bin.${name}` });
      }
    }
  } catch {
    // No package.json
  }

  // Check common entry file names (all languages)
  const commonEntries = [
    'index.ts', 'index.js', 'main.ts', 'main.js',
    'app.ts', 'app.js', 'server.ts', 'server.js',
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
    // Python
    'main.py', 'app.py', 'manage.py', 'wsgi.py', 'asgi.py',
    // Go
    'main.go', 'cmd/main.go',
    // Ruby
    'config.ru', 'Rakefile',
    // Java
    'src/main/java/Main.java',
    // Rust
    'src/main.rs', 'src/lib.rs',
  ];

  for (const entry of commonEntries) {
    try {
      await fs.access(path.join(repoPath, entry));
      if (!entryPoints.some(e => e.path === entry)) {
        entryPoints.push({ path: entry, reason: 'common entry filename' });
      }
    } catch {
      // File doesn't exist
    }
  }

  return entryPoints;
}
