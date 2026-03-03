// packages/core/src/analysis/track-detector.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import type { AnalysisResult, Track, TrackId, ChapterFocus } from '../types';

// ── Track definitions ──

interface TrackDef {
  id: TrackId;
  label: string;
  description: string;
  focusTypes: ChapterFocus[];
  suggestedOrder: number;
}

const TRACK_DEFS: TrackDef[] = [
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'Overall structure, modules, and data flow',
    focusTypes: ['structure', 'data-flow', 'bootstrap', 'module'],
    suggestedOrder: 1,
  },
  {
    id: 'frontend',
    label: 'Frontend',
    description: 'UI components, state management, and client-side patterns',
    focusTypes: ['state-management', 'pattern', 'entry-point'],
    suggestedOrder: 2,
  },
  {
    id: 'backend',
    label: 'Backend',
    description: 'HTTP layer, database, auth, and server-side patterns',
    focusTypes: ['http', 'database', 'auth', 'error-handling', 'entry-point'],
    suggestedOrder: 3,
  },
  {
    id: 'infra',
    label: 'Infrastructure',
    description: 'CI/CD, containers, deployment, and infrastructure-as-code',
    focusTypes: [],
    suggestedOrder: 4,
  },
];

// ── Signal constants ──

const FE_FRAMEWORK_IMPORTS = [
  'react', 'vue', 'angular', 'svelte', 'solid-js', 'preact', 'lit', 'next', 'nuxt', 'remix',
];

const FE_DIRS = [
  'src/components', 'src/pages', 'src/views', 'src/hooks', 'src/stores', 'public/', 'static/',
];

const FE_DOM_APIS = [
  'document.querySelector', 'getElementById', 'addEventListener',
  'innerHTML', 'createElement', 'window.', 'localStorage', 'sessionStorage',
];

const FE_BUILD_TOOLS = ['webpack', 'vite', 'parcel', 'next', 'nuxt', 'remix'];

const BE_FRAMEWORK_IMPORTS = [
  'express', 'fastify', 'koa', '@nestjs/core', 'hapi', 'hono', 'elysia',
];

const BE_DIRS = [
  'src/routes', 'src/controllers', 'src/middleware', 'src/models',
  'src/services', 'src/api', 'src/handlers',
];

const BE_SERVER_PATTERNS = [
  'app.listen', 'createServer', 'router.get', 'router.post', 'router.put', 'router.delete',
];

const BE_DB_IMPORTS = [
  'pg', 'mysql2', 'mongoose', 'prisma', '@prisma/client', 'sequelize', 'typeorm', 'drizzle-orm', 'knex',
];

const BE_AUTH_IMPORTS = ['passport', 'bcrypt', 'bcryptjs', 'jsonwebtoken', 'jose', 'next-auth'];

const BE_QUEUE_IMPORTS = ['bull', 'bullmq', 'amqplib', 'kafkajs', 'ioredis'];

const ARCH_SHARED_DIRS = ['src/shared', 'src/common', 'src/lib', 'src/utils', 'packages/'];

const ARCH_MONOREPO_TOOLS = ['workspaces', 'lerna', 'nx', 'turbo'];

const INFRA_FILES = [
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
  'Jenkinsfile', 'Procfile', 'vercel.json', 'netlify.toml', 'fly.toml', 'render.yaml',
];

const INFRA_DIRS = [
  '.github/workflows', '.gitlab-ci', '.circleci', 'terraform', 'k8s', 'helm', '.changeset',
];

// ── Helpers ──

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function isSourceFile(f: string): boolean {
  return SOURCE_EXTS.has(path.extname(f));
}

function cap(n: number): number {
  return Math.min(n, 1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function matchesImport(content: string, pkg: string): boolean {
  // Match: from 'pkg' | from "pkg" | require('pkg') | require("pkg")
  // Also handles sub-paths like 'pkg/foo'
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`['"]${escaped}(?:/[^'"]*)?['"]`);
  return re.test(content);
}

function containsAny(content: string, patterns: string[]): boolean {
  return patterns.some(p => content.includes(p));
}

function fileMatchesDir(file: string, dir: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  const normalizedDir = dir.replace(/\\/g, '/');
  // "public/" matches files under public/
  if (normalizedDir.endsWith('/')) {
    return normalized.startsWith(normalizedDir) || normalized.startsWith(normalizedDir.slice(0, -1) + '/');
  }
  return normalized.startsWith(normalizedDir + '/');
}

async function getFileContents(
  repoPath: string,
  files: string[],
  provided?: Map<string, string>,
): Promise<Map<string, string>> {
  const sourceFiles = files.filter(isSourceFile).slice(0, 50);
  const result = new Map<string, string>();

  for (const f of sourceFiles) {
    if (provided && provided.has(f)) {
      result.set(f, provided.get(f)!);
    } else if (!provided) {
      try {
        const content = await fs.readFile(path.join(repoPath, f), 'utf-8');
        result.set(f, content);
      } catch {
        // skip unreadable files
      }
    }
  }

  return result;
}

// ── Scoring functions ──

function scoreFrontend(files: string[], contents: Map<string, string>): number {
  let score = 0;

  // Framework imports (+0.3)
  for (const content of contents.values()) {
    if (FE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) {
      score += 0.3;
      break;
    }
  }

  // Directory conventions (+0.2)
  if (files.some(f => FE_DIRS.some(d => fileMatchesDir(f, d)))) {
    score += 0.2;
  }

  // .jsx/.tsx files (+0.1)
  if (files.some(f => f.endsWith('.jsx') || f.endsWith('.tsx'))) {
    score += 0.1;
  }

  // DOM APIs (+0.2)
  for (const content of contents.values()) {
    if (containsAny(content, FE_DOM_APIS)) {
      score += 0.2;
      break;
    }
  }

  // FE build tools in package.json (+0.1)
  const pkgJson = contents.get('package.json');
  if (pkgJson) {
    if (containsAny(pkgJson, FE_BUILD_TOOLS)) {
      score += 0.1;
    }
  }

  // CSS modules (+0.1)
  if (files.some(f => f.endsWith('.module.css') || f.endsWith('.module.scss'))) {
    score += 0.1;
  }

  return cap(score);
}

function scoreBackend(
  files: string[],
  contents: Map<string, string>,
  analysis: AnalysisResult,
): number {
  let score = 0;

  // Framework imports (+0.3)
  for (const content of contents.values()) {
    if (BE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) {
      score += 0.3;
      break;
    }
  }

  // Directory conventions (+0.2)
  if (files.some(f => BE_DIRS.some(d => fileMatchesDir(f, d)))) {
    score += 0.2;
  }

  // Server patterns (+0.2)
  for (const content of contents.values()) {
    if (containsAny(content, BE_SERVER_PATTERNS)) {
      score += 0.2;
      break;
    }
  }

  // DB imports (+0.2)
  for (const content of contents.values()) {
    if (BE_DB_IMPORTS.some(pkg => matchesImport(content, pkg))) {
      score += 0.2;
      break;
    }
  }

  // Auth imports (+0.1)
  for (const content of contents.values()) {
    if (BE_AUTH_IMPORTS.some(pkg => matchesImport(content, pkg))) {
      score += 0.1;
      break;
    }
  }

  // Queue imports (+0.1)
  for (const content of contents.values()) {
    if (BE_QUEUE_IMPORTS.some(pkg => matchesImport(content, pkg))) {
      score += 0.1;
      break;
    }
  }

  // AnalysisResult.http framework (+0.2)
  if (analysis.http && analysis.http.framework !== 'none' && analysis.http.framework !== 'unknown') {
    score += 0.2;
  }

  return cap(score);
}

function scoreArchitecture(files: string[], analysis: AnalysisResult): number {
  let score = 0.3; // base

  // Module count: +0.1 per module beyond 1, max +0.4
  const extraModules = Math.max(0, analysis.modules.length - 1);
  score += Math.min(extraModules * 0.1, 0.4);

  // Shared dirs (+0.1)
  if (files.some(f => ARCH_SHARED_DIRS.some(d => fileMatchesDir(f, d)))) {
    score += 0.1;
  }

  // Monorepo tools in package.json - we check file contents if available,
  // but also check file list for packages/ dir
  // We'll check this via contents in the main function, but here
  // we just use the files list for the packages/ dir convention
  // The monorepo check is done via contents in the caller

  // Dependency graph layers > 3 (+0.1)
  if (analysis.dependencyGraph.layers && analysis.dependencyGraph.layers.length > 3) {
    score += 0.1;
  }

  return cap(score);
}

function scoreInfra(files: string[]): number {
  let score = 0;

  // Known infra files (+0.3)
  const fileNames = files.map(f => {
    const parts = f.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
  });
  if (INFRA_FILES.some(inf => fileNames.includes(inf))) {
    score += 0.3;
  }

  // Infra dirs (+0.2)
  if (files.some(f => INFRA_DIRS.some(d => fileMatchesDir(f, d)))) {
    score += 0.2;
  }

  // Infra file patterns: .tf files, bitbucket-pipelines.yml (+0.1)
  if (files.some(f => f.endsWith('.tf') || f.replace(/\\/g, '/').endsWith('bitbucket-pipelines.yml'))) {
    score += 0.1;
  }

  return cap(score);
}

// ── Main ──

export async function detectTracks(
  repoPath: string,
  files: string[],
  analysis: AnalysisResult,
  fileContents?: Map<string, string>,
): Promise<Track[]> {
  const contents = await getFileContents(repoPath, files, fileContents);

  // Check monorepo tools for architecture
  let hasMonorepoTools = false;
  const pkgJson = contents.get('package.json');
  if (pkgJson) {
    hasMonorepoTools = containsAny(pkgJson, ARCH_MONOREPO_TOOLS);
  }

  const scores: Record<TrackId, number> = {
    frontend: round2(scoreFrontend(files, contents)),
    backend: round2(scoreBackend(files, contents, analysis)),
    architecture: round2(cap(scoreArchitecture(files, analysis) + (hasMonorepoTools ? 0.1 : 0))),
    infra: round2(scoreInfra(files)),
  };

  // Build all tracks — UI decides which to suggest (>= 0.3) vs show dimmed
  return TRACK_DEFS
    .map(def => ({
      id: def.id,
      label: def.label,
      description: def.description,
      focusTypes: def.focusTypes,
      confidence: scores[def.id],
      suggestedOrder: def.suggestedOrder,
    }))
    .sort((a, b) => a.suggestedOrder - b.suggestedOrder);
}
