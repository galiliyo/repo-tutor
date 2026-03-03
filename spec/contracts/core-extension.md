# Core ↔ Extension Interface Contract

This document defines the interface between `@repo-tutor/core` and `@repo-tutor/vscode`.

## Core Public API

```typescript
interface RepoTutorCore {
  // Analysis
  analyze(repoPath: string, config: SecurityConfig): Promise<AnalysisResult>;

  // Chapter Planning
  planChapters(analysis: AnalysisResult, userContext: UserContext): Promise<Chapter[]>;

  // Content Generation
  generateChapter(chapter: Chapter, analysis: AnalysisResult): Promise<ChapterContent>;

  // Quiz
  generateQuiz(chapter: ChapterContent): Promise<Question[]>;
  evaluateAnswer(question: Question, userAnswer: string): Promise<Evaluation>;

  // Q&A
  answerQuestion(question: string, context: QuestionContext): Promise<Answer>;

  // Configuration
  setLLMConfig(config: LLMConfig): void;
  validateApiKey(provider: string, apiKey: string): Promise<boolean>;
}
```

## Configuration Types

```typescript
interface SecurityConfig {
  preset: 'standard' | 'cautious' | 'strict' | 'custom';
  neverSend: string[];           // Glob patterns
  skipAnalysis: string[];        // Glob patterns
  confirmBeforeSend: boolean;
  maxCodeContextChars: number;
  strictMode: boolean;           // Only send structure, never code
}

interface UserContext {
  preferredLanguage: string;     // e.g., "javascript", "python"
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
}

interface LLMConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

interface QuestionContext {
  currentChapter: ChapterContent;
  currentSection?: string;
  previousChapters: string[];    // Chapter IDs
  analysisResult: AnalysisResult;
}
```

## Events

Core emits events that the extension can subscribe to:

```typescript
interface CoreEvents {
  // Progress events
  'analysis:started': { repoPath: string };
  'analysis:progress': { phase: string; percent: number };
  'analysis:completed': { result: AnalysisResult };

  // LLM events
  'llm:request:started': { purpose: string; estimatedTokens: number };
  'llm:request:completed': { purpose: string; tokensUsed: number };

  // Privacy events
  'privacy:redaction': { file: string; redactions: string[] };
  'privacy:confirmation:required': { request: LLMRequest };
}
```

## Error Types

```typescript
type CoreError =
  | { code: 'ANALYSIS_FAILED'; message: string; cause?: Error }
  | { code: 'LLM_ERROR'; message: string; provider: string; statusCode?: number }
  | { code: 'VALIDATION_ERROR'; message: string; schema: string }
  | { code: 'RATE_LIMIT'; message: string; retryAfter?: number }
  | { code: 'INVALID_API_KEY'; message: string; provider: string }
  | { code: 'CONTEXT_TOO_LARGE'; message: string; tokens: number; limit: number };
```

## Extension ↔ Webview Messages

### Extension → Webview

```typescript
type ExtensionToWebviewMessage =
  | { type: 'init'; chapters: Chapter[]; currentChapterId: string | null; tracks?: Track[]; currentTrackId?: string | null }
  | { type: 'chapter:loading'; chapterId: string }
  | { type: 'chapter:loaded'; chapter: ChapterContent }
  | { type: 'chapter:error'; chapterId: string; error: string }
  | { type: 'quiz:loading'; chapterId: string }
  | { type: 'quiz:loaded'; questions: Question[] }
  | { type: 'answer:evaluating'; questionId: string }
  | { type: 'answer:evaluated'; evaluation: Evaluation }
  | { type: 'question:answering' }
  | { type: 'question:answered'; answer: Answer }
  | { type: 'tracks:detected'; tracks: Track[] }
  | { type: 'progress:updated'; progress: SessionProgress };
```

### Webview → Extension

```typescript
type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'chapter:request'; chapterId: string }
  | { type: 'quiz:start'; chapterId: string }
  | { type: 'quiz:submit'; questionId: string; answer: string }
  | { type: 'question:ask'; question: string }
  | { type: 'navigate'; chapterId: string }
  | { type: 'tracks:selected'; trackIds: string[] }
  | { type: 'openFile'; file: string; line?: number };
```

## Session State

```typescript
interface SessionState {
  repoPath: string;
  startedAt: string;

  securityConfig: SecurityConfig;
  userContext: UserContext;

  analysisResult: AnalysisResult;
  chapters: Chapter[];

  progress: SessionProgress;
  currentChapterId: string | null;

  detectedTracks: Track[];
  selectedTrackIds: string[];
  currentTrackId: string | null;
}

interface SessionProgress {
  [chapterId: string]: {
    status: 'locked' | 'available' | 'in-progress' | 'completed';
    startedAt?: string;
    completedAt?: string;
    quizScore?: number;
    questionsAsked: number;
  };
}
```

## Versioning

The contract is versioned. Core and Extension must agree on version:

```typescript
const CONTRACT_VERSION = '1.0.0';

// Core exposes
core.getContractVersion(): string;

// Extension checks on init
if (core.getContractVersion() !== EXPECTED_VERSION) {
  throw new Error('Contract version mismatch');
}
```
