# Multi-Track Learning Design

## Problem

The planner skews toward frontend concepts. Full-stack repos need balanced coverage across domains. Users should learn the parts they care about.

## Solution

Introduce **tracks** — independent learning paths scoped to a domain. 3 core tracks + 1 optional:

- **Frontend** — components, state management, routing, UI patterns
- **Backend** — routes, middleware, database, auth, error handling
- **Architecture** — repo structure, data flow, bootstrap, module relationships
- **Infra** (optional) — CI/CD, containers, deployment, IaC

## Track Type

```typescript
interface Track {
  id: string;              // "frontend", "backend", "architecture", "infra"
  label: string;           // "Frontend", "Backend", etc.
  description: string;     // What this track covers
  focusTypes: ChapterFocus[];
  confidence: number;      // 0-1, how strongly the analyzer detected this track
  suggestedOrder: number;  // Recommended learning order across tracks
}
```

`Chapter` gains `trackId: string`.

Focus type mapping:

- **Frontend**: `state-management`, `pattern`, `entry-point` (FE entries)
- **Backend**: `http`, `database`, `auth`, `error-handling`, `entry-point` (BE entries)
- **Architecture**: `structure`, `data-flow`, `bootstrap`, `module`
- **Infra**: new focus types TBD

Some focus types (entry-point, pattern) can belong to multiple tracks — the analyzer decides based on actual files.

## Track Detection (Analyzer)

File-presence heuristics, no LLM calls. Each matched signal adds weight, capped at 1.0. Tracks below 0.3 confidence aren't suggested but can be requested.

### Frontend signals

- Framework imports: React, Vue, Angular, Svelte, Solid, Preact, Lit, Stencil
- DOM APIs: `document.querySelector`, `getElementById`, `addEventListener`, `innerHTML`, `createElement`
- HTML files with `<script>` tags, `.jsx`/`.tsx` files
- CSS-in-JS: styled-components, emotion, CSS modules (`.module.css`)
- Frontend routing: react-router, vue-router, @angular/router, next/router
- Build tools in package.json: webpack, vite, parcel, esbuild (devDep), next, nuxt, remix
- Directory conventions: `src/components`, `src/pages`, `src/views`, `src/hooks`, `src/stores`, `public/`, `static/`
- Browser globals: `window.`, `localStorage`, `sessionStorage`, `fetch` in client context
- Package.json scripts with known FE tool names

### Backend signals

- Framework imports: Express, Fastify, Koa, Nest, Hapi, Hono, Elysia, Django, Flask, FastAPI, Spring, Rails, Gin, Echo
- Server patterns: `app.listen`, `createServer`, `router.get/post/put/delete`, middleware chains
- DB clients: pg, mysql2, mongoose, prisma, sequelize, typeorm, drizzle, knex, SQLAlchemy, ActiveRecord
- Auth libraries: passport, bcrypt, jsonwebtoken, jose, oauth, next-auth
- Server entry points: `server.ts`, `app.ts`, `main.ts` with listen calls
- Directory conventions: `src/routes`, `src/controllers`, `src/middleware`, `src/models`, `src/services`, `src/api`, `src/handlers`
- Env/config: `process.env`, dotenv, config files loading secrets
- Queue/worker imports: bull, bullmq, amqplib, kafka, Redis pub/sub

### Architecture signals (always present, confidence scales)

- Monorepo tooling: workspaces, lerna, nx, turborepo
- Module count (more = higher confidence)
- Dependency graph depth
- Shared directories: `src/shared`, `src/common`, `src/lib`, `src/utils`, `packages/`
- Type definitions: `src/types`, shared interfaces/contracts
- Inter-package dependencies

### Infra signals

- Containers: `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- CI/CD: `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/`, `bitbucket-pipelines.yml`
- IaC: `terraform/`, `*.tf`, `k8s/`, kubernetes manifests, `helm/`, CloudFormation
- Deploy configs: `vercel.json`, `netlify.toml`, `fly.toml`, `render.yaml`, `Procfile`
- Scripts: `scripts/deploy*`, `scripts/build*`, Makefiles with deploy/build targets
- Release: `.changeset/`, `release.config.js`, semantic-release
- Monitoring: sentry, datadog, newrelic, prometheus configs

### Confidence scoring

- Framework import match: +0.3
- Directory convention match: +0.2
- Individual file/pattern match: +0.1
- Capped at 1.0
- Suggestion threshold: 0.3

## Planner Changes

- Planner runs **once per selected track**
- Receives track parameter: id, label, relevant focus types, filtered files/modules/layers
- Prompt scopes chapters to the track's perspective
- 5-8 chapters per track
- Prerequisites only reference chapters within the same track
- `relatedTracks` context tells planner what other tracks exist (for cross-cutting awareness)

API change:

```typescript
// Before
planChapters(analysis: AnalysisResult, userContext: UserContext): Promise<Chapter[]>

// After
planChapters(analysis: AnalysisResult, userContext: UserContext, track: Track): Promise<Chapter[]>
```

Orchestration flow:

```
analyze() -> AnalysisResult (includes detectedTracks)
  |
user selects tracks
  |
planChapters() called per track -> Chapter[] per track
```

## Cross-cutting Concepts

Each track gets its own chapter for shared concepts (e.g. authentication), scoped to that domain's perspective:

- BE track: "Authentication Flow" — passport middleware, JWT signing, session store, DB user lookup
- FE track: "Authentication Flow" — login form, token storage, auth context, protected routes
- Architecture track: "Authentication Flow" — end-to-end sequence, FE/BE boundary, token lifecycle

No explicit linking. Planner prompt for each track includes `relatedTracks` context so it knows other tracks will cover cross-cutting topics from their perspective.

## UI Changes

### Track selection screen (after analysis, before chapters)

- Detected tracks shown as cards: label, description, confidence badge
- Architecture track pre-selected as recommended starting point
- Low-confidence tracks shown dimmed ("Limited content detected")
- User checks tracks, clicks "Start Learning"

### Learning view

- Sidebar gets track tabs/collapsible groups at top of chapter list
- Chapter list filters by selected track tab
- "Next Chapter" at end of track offers jump to next track
- All existing behavior (nav, quiz, Q&A) unchanged within a track

### Message contract additions

- `{ type: 'tracks:detected', tracks: Track[] }` — extension to webview
- `{ type: 'tracks:selected', trackIds: string[] }` — webview to extension
- `init` message gains `tracks: Track[]`, chapters grouped by trackId

### SessionState additions

```typescript
detectedTracks: Track[]
selectedTrackIds: string[]
currentTrackId: string | null
```
