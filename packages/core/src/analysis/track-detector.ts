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

export const FE_FRAMEWORK_IMPORTS = [
  'react', 'vue', 'angular', 'svelte', 'solid-js', 'preact', 'lit', 'next', 'nuxt', 'remix',
];

export const FE_DIRS = [
  'frontend/', 'client/', 'web/',
  'src/components', 'src/pages', 'src/views', 'src/hooks', 'src/stores', 'public/', 'static/',
];

const FE_DOM_APIS = [
  'document.querySelector', 'getElementById', 'addEventListener',
  'innerHTML', 'createElement', 'window.', 'localStorage', 'sessionStorage',
];

const FE_BUILD_TOOLS = ['webpack', 'vite', 'parcel', 'next', 'nuxt', 'remix'];

export const BE_FRAMEWORK_IMPORTS = [
  // JS/TS
  'express', 'fastify', 'koa', '@nestjs/core', 'hapi', 'hono', 'elysia',
  // Python
  'django', 'flask', 'fastapi', 'starlette', 'tornado',
  // Java
  'org.springframework', 'javax.servlet', 'io.quarkus', 'io.micronaut', 'io.javalin',
  // Go
  'github.com/gin-gonic/gin', 'github.com/labstack/echo', 'github.com/gofiber/fiber', 'github.com/go-chi/chi',
  // PHP
  'Illuminate\\Http', 'Symfony\\Component', 'Slim\\App',
  // Ruby
  'rails', 'sinatra', 'hanami', 'grape',
];

export const BE_DIRS = [
  'backend/', 'server/', 'api/',
  'src/routes', 'src/controllers', 'src/middleware', 'src/models',
  'src/services', 'src/api', 'src/handlers',
  // Python
  'views/', 'serializers/', 'management/',
  // Java
  'src/main/java', 'src/main/resources',
  // Go
  'cmd/', 'internal/', 'pkg/',
  // PHP
  'app/Http', 'app/Models', 'database/migrations',
  // Ruby
  'app/controllers', 'app/models', 'db/migrate',
];

const BE_SERVER_PATTERNS = [
  'app.listen', 'createServer', 'router.get', 'router.post', 'router.put', 'router.delete',
  // Python
  'app.run(', 'uvicorn.run', '@app.route', '@app.get', '@app.post', 'urlpatterns', 'INSTALLED_APPS',
  // Java
  '@RestController', '@RequestMapping', '@GetMapping', '@PostMapping', '@SpringBootApplication',
  // Go
  'http.ListenAndServe', 'http.HandleFunc', 'r.GET(', 'r.POST(', 'e.GET(', 'app.Listen(',
  // PHP
  'Route::get', 'Route::post', '$app->run', '->middleware(',
  // Ruby
  'Rails.application', 'resources :',
];

export const BE_DB_IMPORTS = [
  'pg', 'mysql2', 'mongoose', 'prisma', '@prisma/client', 'sequelize', 'typeorm', 'drizzle-orm', 'knex',
  // Python
  'sqlalchemy', 'django.db', 'peewee', 'psycopg2', 'pymongo',
  // Java
  'javax.persistence', 'org.hibernate', 'org.jooq',
  // Go
  'database/sql', 'gorm.io', 'github.com/jmoiron/sqlx', 'github.com/jackc/pgx',
  // PHP
  'Doctrine', 'Illuminate\\Database',
  // Ruby
  'activerecord', 'sequel', 'mongoid',
];

const BE_AUTH_IMPORTS = [
  'passport', 'bcrypt', 'bcryptjs', 'jsonwebtoken', 'jose', 'next-auth',
  // Python
  'flask_login', 'django.contrib.auth', 'passlib', 'authlib',
  // Java
  'org.springframework.security',
  // Go
  'golang.org/x/crypto', 'github.com/golang-jwt',
  // PHP
  'tymon/jwt-auth', 'laravel/sanctum',
  // Ruby
  'devise', 'omniauth',
];

const BE_QUEUE_IMPORTS = [
  'bull', 'bullmq', 'amqplib', 'kafkajs', 'ioredis',
  // Python
  'celery', 'rq', 'dramatiq',
  // Java
  'javax.jms', 'org.springframework.kafka',
  // Go
  'github.com/Shopify/sarama',
  // Ruby
  'sidekiq', 'resque', 'delayed_job',
];

export const ARCH_SHARED_DIRS = ['src/shared', 'src/common', 'src/lib', 'src/utils', 'packages/'];

const ARCH_MONOREPO_TOOLS = ['workspaces', 'lerna', 'nx', 'turbo'];

const INFRA_FILES = [
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
  'Jenkinsfile', 'Procfile', 'vercel.json', 'netlify.toml', 'fly.toml', 'render.yaml',
];

export const INFRA_DIRS = [
  '.github/workflows', '.gitlab-ci', '.circleci', 'terraform', 'k8s', 'helm', '.changeset',
];

// ── Helpers ──

const SOURCE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rb', '.php',
]);

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
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns: RegExp[] = [
    // JS/TS: from 'pkg' | require('pkg') (+ sub-paths)
    new RegExp(`['"]${escaped}(?:/[^'"]*)?['"]`),
    // Python: import pkg | from pkg import ...
    new RegExp(`^\\s*(?:import|from)\\s+${escaped}\\b`, 'm'),
    // Java: import [static] pkg.Something;
    new RegExp(`import\\s+(?:static\\s+)?${escaped}\\..*?;`),
    // Go: "pkg" or "pkg/sub"
    new RegExp(`"${escaped}(?:/[^"]*)?"`),
    // PHP: use Pkg\Something;
    new RegExp(`use\\s+${escaped}\\\\.*?;`),
    // Ruby: require 'pkg' | gem 'pkg'
    new RegExp(`(?:require|gem)\\s+['"]${escaped}['"]`),
  ];
  return patterns.some(re => re.test(content));
}

function containsAny(content: string, patterns: string[]): boolean {
  return patterns.some(p => content.includes(p));
}

export function fileMatchesDir(file: string, dir: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  const normalizedDir = dir.replace(/\\/g, '/');
  // Normalize to "dir/" form
  const segment = normalizedDir.endsWith('/') ? normalizedDir : normalizedDir + '/';
  // Match as prefix (top-level) or as nested segment ("/static/" inside "app/static/app.js")
  return normalized.startsWith(segment) || normalized.includes('/' + segment);
}

export function classifyFile(filePath: string, content?: string): TrackId | null {
  // Tier 1: Directory match
  if (FE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'frontend';
  if (BE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'backend';
  if (INFRA_DIRS.some(d => fileMatchesDir(filePath, d))) return 'infra';

  // Tier 2: Extension-based
  if (/\.(jsx|tsx)$/.test(filePath) || /\.module\.(css|scss)$/.test(filePath)) return 'frontend';

  // Tier 3: Content-based
  if (content) {
    if (FE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'frontend';
    if (containsAny(content, FE_DOM_APIS)) return 'frontend';
    if (BE_FRAMEWORK_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'backend';
    if (BE_DB_IMPORTS.some(pkg => matchesImport(content, pkg))) return 'backend';
    if (containsAny(content, BE_SERVER_PATTERNS)) return 'backend';
  }

  return null;
}

export function classifyFileTrack(
  filePath: string,
  fileTrackMap?: Map<string, TrackId>,
): TrackId | 'shared' {
  if (fileTrackMap) {
    const track = fileTrackMap.get(filePath);
    if (track) return track;
  }
  // Fallback to directory-based for cases where map wasn't provided
  if (FE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'frontend';
  if (BE_DIRS.some(d => fileMatchesDir(filePath, d))) return 'backend';
  if (INFRA_DIRS.some(d => fileMatchesDir(filePath, d))) return 'infra';
  if (ARCH_SHARED_DIRS.some(d => fileMatchesDir(filePath, d))) return 'shared';
  return 'shared'; // ambiguous files included in all tracks
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

// ── Directory inference ──

/** Minimum fraction of classified files in a dir that must agree for inference. */
const DIR_INFERENCE_THRESHOLD = 0.6;
/** Minimum number of classified files needed to infer a directory's track. */
const DIR_INFERENCE_MIN_FILES = 1;

function getTopDir(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const firstSlash = normalized.indexOf('/');
  if (firstSlash < 0) return null; // root-level file
  return normalized.slice(0, firstSlash);
}

/**
 * Groups classified files by top-level directory, infers a dominant track
 * per directory, then fills in unclassified files from that directory.
 * Mutates fileTrackMap in place.
 */
export function inferDirectoryTracks(
  files: string[],
  fileTrackMap: Map<string, TrackId>,
): void {
  // Count track occurrences per top-level dir (only from already-classified files)
  const dirCounts = new Map<string, Map<TrackId, number>>();
  for (const [file, track] of fileTrackMap) {
    const dir = getTopDir(file);
    if (!dir) continue;
    let counts = dirCounts.get(dir);
    if (!counts) {
      counts = new Map();
      dirCounts.set(dir, counts);
    }
    counts.set(track, (counts.get(track) ?? 0) + 1);
  }

  // Determine dominant track per directory
  const dirTrackMap = new Map<string, TrackId>();
  for (const [dir, counts] of dirCounts) {
    let total = 0;
    let best: TrackId = 'architecture';
    let bestCount = 0;
    for (const [track, count] of counts) {
      total += count;
      if (count > bestCount) {
        bestCount = count;
        best = track;
      }
    }
    if (total >= DIR_INFERENCE_MIN_FILES && bestCount / total >= DIR_INFERENCE_THRESHOLD) {
      dirTrackMap.set(dir, best);
    }
  }

  // Apply inferred directory tracks to unclassified files
  for (const file of files) {
    if (fileTrackMap.has(file)) continue;
    const dir = getTopDir(file);
    if (!dir) continue;
    const inferred = dirTrackMap.get(dir);
    if (inferred) fileTrackMap.set(file, inferred);
  }
}

// ── Main ──

export async function detectTracks(
  repoPath: string,
  files: string[],
  analysis: AnalysisResult,
  fileContents?: Map<string, string>,
): Promise<{ tracks: Track[]; fileTrackMap: Map<string, TrackId> }> {
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

  // Build file-to-track map from content-classified files
  const fileTrackMap = new Map<string, TrackId>();
  for (const file of files) {
    const track = classifyFile(file, contents.get(file));
    if (track) fileTrackMap.set(file, track);
  }

  // Infer directory tracks from classified files, then apply to unclassified ones
  inferDirectoryTracks(files, fileTrackMap);

  // Build all tracks — UI decides which to suggest (>= 0.3) vs show dimmed
  return {
    tracks: TRACK_DEFS
      .map(def => ({
        id: def.id,
        label: def.label,
        description: def.description,
        focusTypes: def.focusTypes,
        confidence: scores[def.id],
        suggestedOrder: def.suggestedOrder,
      }))
      .sort((a, b) => a.suggestedOrder - b.suggestedOrder),
    fileTrackMap,
  };
}
