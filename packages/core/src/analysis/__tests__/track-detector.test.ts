// packages/core/src/analysis/__tests__/track-detector.test.ts

import { describe, it, expect } from 'vitest';
import { detectTracks, classifyFileTrack, classifyFile, inferDirectoryTracks, fileMatchesDir } from '../track-detector';
import type { AnalysisResult, TrackId } from '../../types';

function stubAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    repoPath: '/fake',
    languages: ['javascript'],
    entryPoints: [],
    dependencyGraph: { nodes: [], edges: [] },
    modules: [],
    patterns: [],
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('detectTracks', () => {
  it('always detects architecture track with confidence > 0', async () => {
    const { tracks } = await detectTracks('/fake', ['src/index.ts'], stubAnalysis(), new Map());
    const arch = tracks.find(t => t.id === 'architecture');
    expect(arch).toBeDefined();
    expect(arch!.confidence).toBeGreaterThan(0);
  });

  it('detects frontend from React imports', async () => {
    const files = ['src/App.tsx'];
    const contents = new Map([
      ['src/App.tsx', "import React from 'react';\nexport default function App() { return <div/>; }"],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects frontend from DOM usage', async () => {
    const files = ['src/main.tsx'];
    const contents = new Map([
      ['src/main.tsx', "const el = document.querySelector('#app');\nel.textContent = 'hi';"],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    // DOM APIs (+0.2) + .tsx file (+0.1) = 0.3
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects frontend from directory conventions', async () => {
    const files = ['src/components/Button.tsx', 'src/hooks/useAuth.ts', 'src/pages/Home.tsx'];
    const contents = new Map<string, string>();
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const fe = tracks.find(t => t.id === 'frontend');
    expect(fe).toBeDefined();
    expect(fe!.confidence).toBeGreaterThanOrEqual(0.2);
  });

  it('detects backend from Express imports', async () => {
    const files = ['src/server.ts'];
    const contents = new Map([
      ['src/server.ts', "import express from 'express';\nconst app = express();\napp.listen(3000);"],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const be = tracks.find(t => t.id === 'backend');
    expect(be).toBeDefined();
    expect(be!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects backend from directory conventions', async () => {
    const files = ['src/routes/users.ts', 'src/controllers/auth.ts', 'src/middleware/logger.ts'];
    // Add http analysis to push over 0.3 threshold (dirs +0.2, http +0.2)
    const analysis = stubAnalysis({ http: { framework: 'express', routes: [], middleware: [] } });
    const contents = new Map<string, string>();
    const { tracks } = await detectTracks('/fake', files, analysis, contents);
    const be = tracks.find(t => t.id === 'backend');
    expect(be).toBeDefined();
    expect(be!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects infra from Dockerfile', async () => {
    const files = ['Dockerfile', 'src/index.ts'];
    const contents = new Map<string, string>();
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const infra = tracks.find(t => t.id === 'infra');
    expect(infra).toBeDefined();
    expect(infra!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('returns all 4 tracks even when confidence is low', async () => {
    const { tracks } = await detectTracks('/fake', [], stubAnalysis(), new Map());
    expect(tracks).toHaveLength(4);
    // FE/BE/infra should have 0 confidence with no signals
    const fe = tracks.find(t => t.id === 'frontend')!;
    const be = tracks.find(t => t.id === 'backend')!;
    const infra = tracks.find(t => t.id === 'infra')!;
    expect(fe.confidence).toBe(0);
    expect(be.confidence).toBe(0);
    expect(infra.confidence).toBe(0);
  });

  it('detects backend from Python/FastAPI', async () => {
    const files = ['app/main.py'];
    const contents = new Map([
      ['app/main.py', "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/health')\ndef health(): return {'ok': True}"],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const be = tracks.find(t => t.id === 'backend')!;
    expect(be.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects backend from Java/Spring', async () => {
    const files = ['src/main/java/com/example/App.java'];
    const contents = new Map([
      ['src/main/java/com/example/App.java', 'import org.springframework.boot.SpringApplication;\n@SpringBootApplication\npublic class App {}'],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const be = tracks.find(t => t.id === 'backend')!;
    expect(be.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects backend from Go/Gin', async () => {
    const files = ['cmd/server/main.go'];
    const contents = new Map([
      ['cmd/server/main.go', 'import "github.com/gin-gonic/gin"\nfunc main() { r := gin.Default(); r.GET("/ping", handler); r.Run() }'],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const be = tracks.find(t => t.id === 'backend')!;
    expect(be.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects backend from PHP/Laravel', async () => {
    const files = ['app/Http/Controllers/UserController.php'];
    const contents = new Map([
      ['app/Http/Controllers/UserController.php', "<?php\nuse Illuminate\\Http\\Request;\nclass UserController {}"],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const be = tracks.find(t => t.id === 'backend')!;
    expect(be.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('detects backend from Ruby/Rails', async () => {
    const files = ['app/controllers/users_controller.rb'];
    const contents = new Map([
      ['app/controllers/users_controller.rb', "require 'rails'\nclass UsersController < ApplicationController\nend"],
    ]);
    const { tracks } = await detectTracks('/fake', files, stubAnalysis(), contents);
    const be = tracks.find(t => t.id === 'backend')!;
    expect(be.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('infers app/ as backend from sampled Python files', async () => {
    const files = ['app/main.py', 'app/utils.py', 'app/models.py', 'static/app.js'];
    const contents = new Map([
      ['app/main.py', "from flask import Flask\napp = Flask(__name__)\n@app.route('/')\ndef index(): return 'hi'"],
      ['static/app.js', "document.querySelector('#app').innerHTML = '<h1>Hello</h1>';"],
    ]);
    const { fileTrackMap } = await detectTracks('/fake', files, stubAnalysis(), contents);
    // app/main.py classified by content, app/utils.py + app/models.py inferred
    expect(fileTrackMap['app/main.py']).toBe('backend');
    expect(fileTrackMap['app/utils.py']).toBe('backend');
    expect(fileTrackMap['app/models.py']).toBe('backend');
    // static/app.js correctly frontend
    expect(fileTrackMap['static/app.js']).toBe('frontend');
  });

  it('architecture confidence scales with module count', async () => {
    const fewModules = stubAnalysis({
      modules: [
        { name: 'src', path: 'src', fileCount: 5 },
      ],
    });
    const manyModules = stubAnalysis({
      modules: [
        { name: 'auth', path: 'auth', fileCount: 5 },
        { name: 'api', path: 'api', fileCount: 5 },
        { name: 'db', path: 'db', fileCount: 5 },
        { name: 'utils', path: 'utils', fileCount: 5 },
        { name: 'core', path: 'core', fileCount: 5 },
      ],
    });

    const { tracks: tracksFew } = await detectTracks('/fake', ['src/a.ts'], fewModules, new Map());
    const { tracks: tracksMany } = await detectTracks('/fake', ['a.ts'], manyModules, new Map());

    const archFew = tracksFew.find(t => t.id === 'architecture')!;
    const archMany = tracksMany.find(t => t.id === 'architecture')!;

    expect(archMany.confidence).toBeGreaterThan(archFew.confidence);
  });
});

describe('classifyFileTrack', () => {
  it('classifies frontend directories', () => {
    expect(classifyFileTrack('src/components/Button.tsx')).toBe('frontend');
    expect(classifyFileTrack('src/pages/Home.tsx')).toBe('frontend');
    expect(classifyFileTrack('src/hooks/useAuth.ts')).toBe('frontend');
    expect(classifyFileTrack('src/stores/counter.ts')).toBe('frontend');
  });

  it('classifies backend directories', () => {
    expect(classifyFileTrack('src/routes/users.ts')).toBe('backend');
    expect(classifyFileTrack('src/controllers/auth.ts')).toBe('backend');
    expect(classifyFileTrack('src/middleware/logger.ts')).toBe('backend');
    expect(classifyFileTrack('src/models/User.ts')).toBe('backend');
  });

  it('classifies infra directories', () => {
    expect(classifyFileTrack('.github/workflows/ci.yml')).toBe('infra');
    expect(classifyFileTrack('terraform/main.tf')).toBe('infra');
    expect(classifyFileTrack('k8s/deployment.yaml')).toBe('infra');
  });

  it('classifies shared directories', () => {
    expect(classifyFileTrack('src/shared/types.ts')).toBe('shared');
    expect(classifyFileTrack('src/utils/helpers.ts')).toBe('shared');
    expect(classifyFileTrack('src/lib/logger.ts')).toBe('shared');
  });

  it('returns shared for ambiguous paths', () => {
    expect(classifyFileTrack('src/index.ts')).toBe('shared');
    expect(classifyFileTrack('README.md')).toBe('shared');
  });

  it('handles backslash paths (Windows)', () => {
    expect(classifyFileTrack('src\\components\\Button.tsx')).toBe('frontend');
    expect(classifyFileTrack('src\\routes\\users.ts')).toBe('backend');
  });

  it('uses fileTrackMap when provided', () => {
    const map: Record<string, TrackId> = { 'lib/unknown.ts': 'frontend' };
    expect(classifyFileTrack('lib/unknown.ts', map)).toBe('frontend');
  });

  it('falls back to directory matching when map has no entry', () => {
    const map: Record<string, TrackId> = {};
    expect(classifyFileTrack('src/components/Foo.tsx', map)).toBe('frontend');
  });

  it('falls back to directory matching when no map provided', () => {
    expect(classifyFileTrack('src/routes/api.ts')).toBe('backend');
  });

  it('returns shared for unknown files without map', () => {
    expect(classifyFileTrack('lib/utils.ts')).toBe('shared');
  });

  it('returns shared for unknown files not in map', () => {
    const map: Record<string, TrackId> = {};
    expect(classifyFileTrack('lib/utils.ts', map)).toBe('shared');
  });
});

describe('inferDirectoryTracks', () => {
  it('infers backend for app/ when sampled files are backend', () => {
    const files = ['app/main.py', 'app/utils.py', 'app/helpers.py'];
    const map: Record<string, TrackId> = { 'app/main.py': 'backend' };
    inferDirectoryTracks(files, map);
    expect(map['app/utils.py']).toBe('backend');
    expect(map['app/helpers.py']).toBe('backend');
  });

  it('infers frontend for static/ when sampled files are frontend', () => {
    const files = ['static/app.js', 'static/styles.css', 'static/logo.png'];
    const map: Record<string, TrackId> = { 'static/app.js': 'frontend' };
    inferDirectoryTracks(files, map);
    expect(map['static/styles.css']).toBe('frontend');
    expect(map['static/logo.png']).toBe('frontend');
  });

  it('does not override already-classified files', () => {
    const files = ['app/main.py', 'app/client.tsx'];
    const map: Record<string, TrackId> = {
      'app/main.py': 'backend',
      'app/client.tsx': 'frontend',
    };
    inferDirectoryTracks(files, map);
    expect(map['app/client.tsx']).toBe('frontend');
  });

  it('does not infer when dir is mixed below threshold', () => {
    const files = ['mixed/a.py', 'mixed/b.tsx', 'mixed/c.ts'];
    // 1 backend, 1 frontend — 50% each, below 60% threshold
    const map: Record<string, TrackId> = {
      'mixed/a.py': 'backend',
      'mixed/b.tsx': 'frontend',
    };
    inferDirectoryTracks(files, map);
    expect('mixed/c.ts' in map).toBe(false);
  });

  it('skips root-level files', () => {
    const files = ['README.md', 'app/main.py'];
    const map: Record<string, TrackId> = { 'app/main.py': 'backend' };
    inferDirectoryTracks(files, map);
    expect('README.md' in map).toBe(false);
  });
});

describe('fileMatchesDir', () => {
  it('matches top-level dir', () => {
    expect(fileMatchesDir('static/app.js', 'static/')).toBe(true);
    expect(fileMatchesDir('src/components/Button.tsx', 'src/components')).toBe(true);
  });

  it('matches nested dir segment', () => {
    expect(fileMatchesDir('app/static/app.js', 'static/')).toBe(true);
    expect(fileMatchesDir('server/public/index.html', 'public/')).toBe(true);
  });

  it('does not match partial segment names', () => {
    expect(fileMatchesDir('app/statistics/data.py', 'static/')).toBe(false);
  });

  it('handles backslashes', () => {
    expect(fileMatchesDir('app\\static\\app.js', 'static/')).toBe(true);
  });
});

describe('classifyFile', () => {
  it('classifies by FE directory', () => {
    expect(classifyFile('src/components/Button.tsx')).toBe('frontend');
  });

  it('classifies nested static/ as frontend', () => {
    expect(classifyFile('app/static/app.js')).toBe('frontend');
    expect(classifyFile('server/public/index.html')).toBe('frontend');
  });

  it('classifies by BE directory', () => {
    expect(classifyFile('src/routes/api.ts')).toBe('backend');
  });

  it('classifies .tsx as frontend', () => {
    expect(classifyFile('app/layout.tsx')).toBe('frontend');
  });

  it('classifies .module.css as frontend', () => {
    expect(classifyFile('styles/main.module.css')).toBe('frontend');
  });

  it('classifies by FE import content', () => {
    expect(classifyFile('app/page.ts', "import { useState } from 'react';")).toBe('frontend');
  });

  it('classifies by DOM API content', () => {
    expect(classifyFile('lib/dom.ts', "document.querySelector('#app')")).toBe('frontend');
  });

  it('classifies by BE import content', () => {
    expect(classifyFile('app/server.ts', "import express from 'express';")).toBe('backend');
  });

  it('classifies by DB import content', () => {
    expect(classifyFile('lib/db.ts', "import { Pool } from 'pg';")).toBe('backend');
  });

  it('returns null for ambiguous files', () => {
    expect(classifyFile('src/utils/logger.ts', "export function log(msg: string) {}")).toBeNull();
  });

  it('returns null when no content for unknown dir', () => {
    expect(classifyFile('lib/shared/helpers.ts')).toBeNull();
  });
});
