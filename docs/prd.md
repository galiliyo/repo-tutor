# Repo Tutor — Product Requirements Document

## Vision

Repo Tutor is a VS Code extension that helps developers intimately understand unfamiliar codebases through guided, chapter-based learning with quizzes — adapting explanations to the user's preferred programming language.

## Problem Statement

Developers frequently need to understand new codebases:
- Onboarding to a new team
- Contributing to open source
- Evaluating third-party libraries
- Learning from real-world code

Current approaches are inefficient:
- Reading code linearly (miss the big picture)
- Grep/search (fragmented understanding)
- Asking colleagues (not always available)
- Documentation (often outdated or missing)

## Solution

An intelligent tutor that:
1. Analyzes the codebase structure locally (AST, dependency graph)
2. Plans a learning path based on the analysis
3. Generates chapter content with code explanations
4. Tests understanding with quizzes
5. Adapts to the user's preferred language and skill level

## Target Users

- **Primary**: Developers joining a new codebase (new job, new team, open source)
- **Secondary**: Students learning from real-world codebases
- **Tertiary**: Tech leads evaluating unfamiliar projects

## Core Features (MVP)

### 1. Guided Chapters

Deterministic learning path progressing through:
- Repository structure and organization
- Entry points and bootstrap sequence
- HTTP/API layer (if present)
- State management (if present)
- Data flow through the system
- Key modules deep-dive

### 2. Variable Zoom

Users can learn at different depths:
- High-level architecture overview
- Module-level understanding
- Function/class-level details
- Syntax-level explanations (for unfamiliar languages)

### 3. Language Adaptation

- User specifies their preferred/familiar language
- Explanations use analogies from that language
- Example: "This Python decorator is like a higher-order function in JavaScript"

### 4. Mid-Chapter Q&A

- User can ask questions at any point during a chapter
- Questions are answered with relevant codebase context
- Answers reference specific files and line numbers

### 5. Chapter Quizzes

- 3-5 questions per chapter
- Aligned with Bloom's Taxonomy cognitive levels
- Multiple question types: multiple-choice, true-false, free-text, code-completion
- Partial credit for free-text answers
- Constructive feedback with hints and explanations

### 6. Pattern Recognition

- Identifies and names common design patterns
- Connects code to established CS concepts
- Helps build transferable knowledge

### 7. Privacy-First

- Upfront security configuration wizard
- Automatic secret redaction
- Transparency logs showing what's sent to LLM
- User controls what code can be sent

## User Journey

```
1. Open unfamiliar repo in VS Code
2. Click "Start Learning" in sidebar
3. Complete security configuration (first time)
4. Select preferred language and skill level
5. Wait for analysis (~30 seconds)
6. View chapter outline in sidebar
7. Read Chapter 1 in main panel
8. Ask clarifying questions as needed
9. Complete chapter quiz
10. Progress to next chapter
11. Repeat until codebase is understood
```

## Success Metrics

- User can explain the main architectural patterns of a repo after completing all chapters
- Quiz pass rate > 70% indicates effective teaching
- Users report confidence increase in navigating the codebase
- Time to productive contribution decreases

## Technical Constraints

- **LLM Provider**: User's own API key (OpenAI or Anthropic)
- **Languages (MVP)**: JavaScript/TypeScript, Python
- **Analysis**: Local AST parsing + LLM for explanations
- **No Backend**: Extension communicates directly with LLM provider

## Phase 2 (Future)

- Code critique/review mode
- Practical exercises (make changes, get reviewed)
- Additional language plugins
- Team learning features
- Optional repo-tutor config for repo maintainers
- CLI version using the core library

## Non-Goals (MVP)

- Real-time collaboration
- Code generation/autocomplete
- IDE features beyond learning (refactoring, etc.)
- Supporting non-code files (documentation-only repos)

## Dependencies

- VS Code Extension API
- ts-morph (JavaScript/TypeScript parsing)
- tree-sitter (Python parsing, future languages)
- User's LLM API key
