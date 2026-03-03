// packages/vscode-extension/src/views/LearningPanel.ts

import * as vscode from 'vscode';
import { marked } from 'marked';
import { Chapter, ChapterContent, ChapterOutline, Question, Evaluation, Answer, Track } from '@repo-tutor/core';

const md = (text: string): string => marked.parse(text) as string;

/**
 * Post-process HTML to turn known file paths into clickable code-ref spans.
 * Matches paths inside <code> tags and as bare text (e.g. `src/foo.ts` or src/foo.ts).
 */
function linkifyFilePaths(html: string, knownFiles: Set<string>): string {
  if (knownFiles.size === 0) return html;

  // Sort longest-first so `src/utils/helper.ts` matches before `src/utils`
  const sorted = [...knownFiles].sort((a, b) => b.length - a.length);
  // Escape for regex
  const escaped = sorted.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    // Match inside <code>path</code> or bare path references, but not already inside a tag attribute
    `(<code>)(${escaped.join('|')})(</code>)` +
    `|(?<![/"'>=-])(${escaped.join('|')})(?=[^/\\w]|$)`,
    'g'
  );

  return html.replace(pattern, (...args) => {
    // Groups: 1=<code>, 2=path-in-code, 3=</code>, 4=bare-path
    const codeOpen = args[1];
    const codePath = args[2];
    const barePath = args[4];
    const filePath = codePath || barePath;
    return `<span class="code-ref" data-file="${filePath}">${filePath}</span>`;
  });
}
import { getCoreAdapter, getDefaultUserContext } from '../core-adapter';
import { SessionState } from './ChaptersTreeProvider';

interface ChapterSkeleton {
  title: string;
  order: number;
  trackLabel?: string;
  complexity?: 'low' | 'medium' | 'high';
  focus: string;
  learningObjectives: string[];
  targetFiles: Array<{ path: string; language?: string }>;
  dependencies: Array<{ from: string; to: string }>;
  moduleName?: string;
}

// Message types from contract
type ExtensionToWebviewMessage =
  | { type: 'init'; chapters: Chapter[]; currentChapterId: string | null; tracks?: Track[]; currentTrackId?: string | null }
  | { type: 'chapter:loading'; chapterId: string }
  | { type: 'chapter:loaded'; chapter: ChapterContent }
  | { type: 'chapter:error'; chapterId: string; error: string }
  | { type: 'quiz:loading'; chapterId: string }
  | { type: 'quiz:loaded'; questions: Question[] }
  | { type: 'answer:evaluating'; questionId: string }
  | { type: 'answer:evaluated'; evaluation: Evaluation }
  | { type: 'answer:explanation-chunk'; questionId: string; text: string }
  | { type: 'answer:explanation-done'; questionId: string }
  | { type: 'question:answering' }
  | { type: 'question:answered'; answer: Answer }
  | { type: 'chapter:skeleton'; chapterId: string; skeleton: ChapterSkeleton }
  | { type: 'prefetch:progress'; done: number; total: number }
  | { type: 'init:analyzing'; repoPath: string }
  | { type: 'init:planning'; trackCount: number }
  | { type: 'chapter:states'; states: Record<string, 'ready' | 'loading' | 'queued'> }
  | { type: 'chapter:outline'; chapterId: string; outline: ChapterOutline };

type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'chapter:request'; chapterId: string }
  | { type: 'quiz:start'; chapterId: string }
  | { type: 'quiz:submit'; questionId: string; answer: string }
  | { type: 'quiz:more'; chapterId: string }
  | { type: 'question:ask'; question: string }
  | { type: 'navigate'; chapterId: string }
  | { type: 'openFile'; file: string; line?: number }
  | { type: 'track:switched'; trackId: string };

export class LearningPanel {
  public static currentPanel: LearningPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _session: SessionState;
  private _generatedContent: Map<string, ChapterContent> = new Map();
  private _generatedQuizzes: Map<string, Question[]> = new Map();
  private _currentQuestions: Question[] = [];
  private _prefetchQueue: string[] = [];
  private _prefetching = false;
  private _prefetchAbortController: AbortController | null = null;
  private _inflight: Set<string> = new Set();

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    session: SessionState
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._session = session;

    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => this._handleMessage(message),
      null,
      this._disposables
    );
  }

  public static show(extensionUri: vscode.Uri, session: SessionState): LearningPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (LearningPanel.currentPanel) {
      LearningPanel.currentPanel._session = session;
      LearningPanel.currentPanel._panel.reveal(column);
      return LearningPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'repoTutor.learning',
      'Repo Tutor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    LearningPanel.currentPanel = new LearningPanel(panel, extensionUri, session);
    return LearningPanel.currentPanel;
  }

  public loadChapter(chapterId: string): void {
    this._postMessage({ type: 'chapter:request', chapterId } as unknown as ExtensionToWebviewMessage);
  }

  public postAnalyzing(repoPath: string): void {
    this._postMessage({ type: 'init:analyzing', repoPath });
  }

  public updateSession(session: SessionState): void {
    this._session = session;
  }

  public postPlanning(trackCount: number): void {
    this._postMessage({ type: 'init:planning', trackCount });
  }

  public sendInit(): void {
    this._postMessage({
      type: 'init',
      chapters: this._session.chapters,
      currentChapterId: this._session.currentChapterId,
      tracks: this._session.selectedTrackIds
        ? (this._session.detectedTracks || []).filter(t =>
            this._session.selectedTrackIds!.includes(t.id))
        : [],
      currentTrackId: this._session.currentTrackId || null,
    });
    this._sendChapterStates();
  }

  private async _handleMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case 'ready':
        // Skip init when chapters are empty (panel opened early in analyzing state)
        if (this._session.chapters.length > 0) {
          this._postMessage({
            type: 'init',
            chapters: this._session.chapters,
            currentChapterId: this._session.currentChapterId,
            tracks: this._session.selectedTrackIds
              ? (this._session.detectedTracks || []).filter(t =>
                  this._session.selectedTrackIds!.includes(t.id))
              : [],
            currentTrackId: this._session.currentTrackId || null,
          });
        }
        break;

      case 'chapter:request':
        await this._loadChapter(message.chapterId);
        break;

      case 'navigate':
        await this._loadChapter(message.chapterId);
        break;

      case 'quiz:start':
        await this._startQuiz(message.chapterId);
        break;

      case 'quiz:submit':
        await this._submitAnswer(message.questionId, message.answer);
        break;

      case 'quiz:more':
        await this._generateMoreQuestions(message.chapterId);
        break;

      case 'question:ask':
        await this._askQuestion(message.question);
        break;

      case 'openFile':
        await this._openFile(message.file, message.line);
        break;

      case 'track:switched':
        this._prefetchAbortController?.abort();
        this._prefetchAbortController = new AbortController();
        this._session.currentTrackId = message.trackId;
        // Rebuild queue for new track
        this._prefetchQueue = this._session.chapters
          .filter(c => c.trackId === message.trackId)
          .sort((a, b) => a.order - b.order)
          .map(c => c.id)
          .filter(id => !this._generatedContent.has(id));
        this._prefetching = false;
        this._runPrefetchQueue();
        this._sendChapterStates();
        break;
    }
  }

  private async _loadChapter(chapterId: string) {
    // If cached (e.g. from prefetch), skip skeleton and serve immediately
    const cached = this._generatedContent.get(chapterId);
    if (cached) {
      return this._renderAndSend(chapterId, cached);
    }

    this._postMessage({ type: 'chapter:loading', chapterId });

    // Send skeleton immediately from planner data + analysis
    const chapterMeta = this._session.chapters.find(c => c.id === chapterId);
    if (chapterMeta) {
      const graph = this._session.analysisResult.dependencyGraph;
      const targetFileSet = new Set(chapterMeta.targetFiles);
      const relevantEdges = (graph?.edges ?? []).filter(
        e => targetFileSet.has(e.from) && targetFileSet.has(e.to)
      );
      const nodes = graph?.nodes ?? [];
      const trackLabel = this._session.detectedTracks?.find(
        t => t.id === chapterMeta.trackId
      )?.label;
      const mod = this._session.analysisResult.modules?.find(
        m => chapterMeta.targetFiles.some(f => f.startsWith(m.path))
      );

      this._postMessage({
        type: 'chapter:skeleton',
        chapterId,
        skeleton: {
          title: chapterMeta.title,
          order: chapterMeta.order,
          trackLabel,
          complexity: chapterMeta.estimatedComplexity,
          focus: chapterMeta.focus,
          learningObjectives: chapterMeta.learningObjectives,
          targetFiles: chapterMeta.targetFiles.map(path => ({
            path,
            language: nodes.find(n => n.path === path)?.language,
          })),
          dependencies: relevantEdges.map(e => ({ from: e.from, to: e.to })),
          moduleName: mod?.name,
        },
      });
    }

    try {
      const chapter = this._session.chapters.find((c) => c.id === chapterId);
      if (!chapter) {
        throw new Error(`Chapter not found: ${chapterId}`);
      }

      // Promote: remove from prefetch queue if queued
      this._prefetchQueue = this._prefetchQueue.filter(id => id !== chapterId);

      let content: ChapterContent | undefined;

      // If already inflight from prefetch, wait for it
      if (this._inflight.has(chapterId)) {
        while (this._inflight.has(chapterId)) {
          await new Promise(r => setTimeout(r, 200));
        }
        content = this._generatedContent.get(chapterId);
      }

      if (!content) {
        const core = getCoreAdapter();
        content = await core.generateChapter(chapter, this._session.analysisResult, getDefaultUserContext());
        this._generatedContent.set(chapterId, content);
      }

      this._renderAndSend(chapterId, content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'chapter:error', chapterId, error: errorMessage });
    }
  }

  private _renderAndSend(chapterId: string, content: ChapterContent): void {
    const knownFiles = new Set<string>(
      (this._session.analysisResult.dependencyGraph?.nodes ?? []).map((n) => n.path)
    );
    const rendered = {
      ...content,
      sections: content.sections.map((s) => ({
        ...s,
        content: linkifyFilePaths(md(s.content), knownFiles),
      })),
    };
    this._postMessage({ type: 'chapter:loaded', chapter: rendered });
  }

  private async _prefetchChapter(chapterId: string): Promise<void> {
    if (this._generatedContent.has(chapterId) || this._inflight.has(chapterId)) return;
    this._inflight.add(chapterId);

    try {
      const chapter = this._session.chapters.find(c => c.id === chapterId);
      if (!chapter) return;

      const core = getCoreAdapter();
      const content = await core.generateChapter(
        chapter, this._session.analysisResult, getDefaultUserContext()
      );
      this._generatedContent.set(chapterId, content);
    } finally {
      this._inflight.delete(chapterId);
    }
  }

  public startPrefetchQueue(chapterIds: string[]): void {
    this._prefetchAbortController?.abort();
    this._prefetchAbortController = new AbortController();
    this._prefetchQueue = [...chapterIds];
    this._runPrefetchQueue();
  }

  private async _runPrefetchQueue(): Promise<void> {
    if (this._prefetching) return;
    this._prefetching = true;
    const signal = this._prefetchAbortController?.signal;

    try {
      while (this._prefetchQueue.length > 0) {
        if (signal?.aborted) break;
        const nextId = this._prefetchQueue.shift()!;
        if (this._generatedContent.has(nextId)) continue;
        await this._prefetchChapter(nextId);
        this._sendChapterStates();
        // Notify webview of progress
        const total = this._session.chapters.filter(
          c => c.trackId === this._session.currentTrackId
        ).length;
        const cached = [...this._generatedContent.keys()].filter(id =>
          this._session.chapters.find(c => c.id === id && c.trackId === this._session.currentTrackId)
        ).length;
        this._postMessage({
          type: 'prefetch:progress', done: cached, total
        });
      }
    } finally {
      this._prefetching = false;
    }
  }

  private async _startQuiz(chapterId: string) {
    this._postMessage({ type: 'quiz:loading', chapterId });

    try {
      let questions = this._generatedQuizzes.get(chapterId);

      if (!questions) {
        const content = this._generatedContent.get(chapterId);
        if (!content) {
          throw new Error('Load chapter content first');
        }

        const core = getCoreAdapter();
        questions = await core.generateQuiz(content);
        this._generatedQuizzes.set(chapterId, questions);
      }

      this._currentQuestions = questions;
      this._postMessage({ type: 'quiz:loaded', questions });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate quiz: ${error}`);
    }
  }

  private async _generateMoreQuestions(chapterId: string) {
    this._postMessage({ type: 'quiz:loading', chapterId });

    try {
      const content = this._generatedContent.get(chapterId);
      if (!content) {
        throw new Error('Load chapter content first');
      }

      const core = getCoreAdapter();
      const newQuestions = await core.generateQuiz(content, this._currentQuestions);

      // Append and send full list
      this._currentQuestions = [...this._currentQuestions, ...newQuestions];
      const cached = this._generatedQuizzes.get(chapterId);
      if (cached) {
        this._generatedQuizzes.set(chapterId, this._currentQuestions);
      }

      this._postMessage({ type: 'quiz:loaded', questions: this._currentQuestions });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate more questions: ${error}`);
    }
  }

  private async _submitAnswer(questionId: string, answer: string) {
    this._postMessage({ type: 'answer:evaluating', questionId });

    try {
      const question = this._currentQuestions.find((q) => q.id === questionId);
      if (!question) {
        throw new Error(`Question not found: ${questionId}`);
      }

      const core = getCoreAdapter();
      const evaluation = await core.evaluateAnswer(question, answer);

      const rendered = {
        ...evaluation,
        feedback: md(evaluation.feedback),
        explanation: evaluation.explanation ? md(evaluation.explanation) : undefined,
      };
      this._postMessage({ type: 'answer:evaluated', evaluation: rendered });

      // Stream detailed explanation (non-fatal)
      // Accumulate server-side, send pre-rendered HTML each time
      try {
        let accumulated = '';
        for await (const chunk of core.streamEvaluationExplanation(question, answer, evaluation)) {
          accumulated += chunk;
          this._postMessage({ type: 'answer:explanation-chunk', questionId, text: md(accumulated) });
        }
      } catch {
        // Streaming is best-effort — static feedback already shown
      }
      this._postMessage({ type: 'answer:explanation-done', questionId });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to evaluate answer: ${error}`);
    }
  }

  private async _askQuestion(question: string) {
    this._postMessage({ type: 'question:answering' });

    try {
      const core = getCoreAdapter();
      const currentChapter = this._generatedContent.get(
        this._session.currentChapterId || ''
      );

      if (!currentChapter) {
        throw new Error('No chapter loaded');
      }

      const answer = await core.answerQuestion(question, {
        currentChapter,
        previousChapters: [],
        analysisResult: this._session.analysisResult,
      });

      this._postMessage({ type: 'question:answered', answer });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to answer question: ${error}`);
    }
  }

  private async _openFile(file: string, line?: number) {
    const repoPath = this._session.repoPath;
    const uri = vscode.Uri.file(`${repoPath}/${file}`);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      });

      if (line !== undefined) {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Could not open file: ${file}`);
    }
  }

  private _buildChapterStates(): Record<string, 'ready' | 'loading' | 'queued'> {
    const states: Record<string, 'ready' | 'loading' | 'queued'> = {};
    const trackChapters = this._session.chapters.filter(
      c => c.trackId === this._session.currentTrackId
    );
    for (const ch of trackChapters) {
      if (this._generatedContent.has(ch.id)) {
        states[ch.id] = 'ready';
      } else if (this._inflight.has(ch.id)) {
        states[ch.id] = 'loading';
      } else {
        states[ch.id] = 'queued';
      }
    }
    return states;
  }

  private _sendChapterStates(): void {
    this._postMessage({ type: 'chapter:states', states: this._buildChapterStates() });
  }

  private _postMessage(message: ExtensionToWebviewMessage): void {
    this._panel.webview.postMessage(message);
  }

  public dispose() {
    LearningPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(): string {
    // Note: innerHTML usage here is for rendering content from our own LLM-generated
    // educational content, not arbitrary user input. For production, consider sanitizing
    // LLM output with DOMPurify.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repo Tutor</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, system-ui);
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 0;
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      height: 100vh;
    }
    .sidebar {
      width: 200px;
      border-right: 1px solid var(--vscode-panel-border);
      padding: 12px;
      overflow-y: auto;
      flex-shrink: 0;
    }
    .sidebar h3 {
      margin: 0 0 12px 0;
      font-size: 0.9em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }
    .chapter-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .chapter-list li {
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .chapter-list li:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .chapter-list li.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .chapter-list li.locked {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .main-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px 40px;
      max-width: 900px;
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
    .loading-spinner {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .skeleton-section {
      animation: fadeIn 0.3s ease-in;
    }
    .objectives-list {
      list-style: none;
      padding: 0;
    }
    .objectives-list li {
      padding: 4px 0;
      padding-left: 20px;
      position: relative;
    }
    .objectives-list li::before {
      content: '○';
      position: absolute;
      left: 0;
      opacity: 0.5;
    }
    .dependency-chain {
      color: var(--vscode-descriptionForeground);
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    h1 {
      font-size: 1.8em;
      margin: 0 0 8px 0;
    }
    .chapter-meta {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
    }
    .section {
      margin-bottom: 32px;
    }
    .section h2 {
      font-size: 1.3em;
      margin: 0 0 12px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .section p {
      line-height: 1.6;
    }
    .section pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px 16px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 12px 0;
    }
    .section pre code {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      background: none;
      padding: 0;
    }
    .section code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }
    .section ul {
      padding-left: 20px;
      margin: 8px 0;
    }
    .section li {
      line-height: 1.6;
      margin-bottom: 4px;
    }
    .section table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }
    .section th, .section td {
      border: 1px solid var(--vscode-panel-border);
      padding: 8px 12px;
      text-align: left;
    }
    .section th {
      background: var(--vscode-textCodeBlock-background);
      font-weight: 600;
    }
    .section tr:nth-child(even) {
      background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.03));
    }
    .code-ref {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      cursor: pointer;
      text-decoration: none;
      color: var(--vscode-textLink-foreground);
    }
    .code-ref:hover {
      text-decoration: underline;
    }
    .takeaways {
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textLink-foreground);
      padding: 16px;
      margin: 24px 0;
    }
    .takeaways h3 {
      margin: 0 0 12px 0;
    }
    .takeaways ul {
      margin: 0;
      padding-left: 20px;
    }
    .takeaways li {
      margin-bottom: 8px;
    }
    .quiz-section {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      border-radius: 8px;
      padding: 20px;
      margin-top: 32px;
    }
    .quiz-section h3 {
      margin: 0 0 16px 0;
    }
    .question {
      margin-bottom: 20px;
    }
    .question p {
      font-weight: 500;
      margin-bottom: 12px;
    }
    .options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      cursor: pointer;
    }
    .option:hover {
      border-color: var(--vscode-focusBorder);
    }
    .option.selected {
      border-color: var(--vscode-button-background);
      background: var(--vscode-list-activeSelectionBackground);
    }
    .option input {
      display: none;
    }
    textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: inherit;
      resize: vertical;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 1em;
      cursor: pointer;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .feedback {
      margin-top: 16px;
      padding: 16px;
      border-radius: 8px;
    }
    .feedback.correct {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
    }
    .feedback.incorrect {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
    }
    .qa-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .qa-section h3 {
      margin: 0 0 12px 0;
    }
    .qa-input {
      display: flex;
      gap: 8px;
    }
    .qa-input input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    .qa-answer {
      margin-top: 16px;
      padding: 16px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 8px;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state h2 {
      margin-bottom: 12px;
    }
    .nav-buttons {
      display: flex;
      justify-content: space-between;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .loading-feedback {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      margin-top: 12px;
      border-radius: 8px;
      background: var(--vscode-textBlockQuote-background);
      color: var(--vscode-descriptionForeground);
    }
    .loading-feedback .loading-spinner {
      flex-shrink: 0;
    }
    .loading-feedback .rotating-message {
      animation: fadeInOut 2.5s ease-in-out infinite;
    }
    @keyframes fadeInOut {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
    .streaming-text {
      margin-top: 12px;
      padding: 16px;
      border-radius: 8px;
      background: var(--vscode-textBlockQuote-background);
      line-height: 1.6;
      position: relative;
    }
    .track-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .track-tab {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      cursor: pointer;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }
    .track-tab.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    .streaming-text.streaming::after {
      content: '\\25AE';
      animation: blink 0.8s step-end infinite;
      margin-left: 2px;
      color: var(--vscode-textLink-foreground);
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
    .chapter-list li.queued { opacity: 0.5; }
    .chapter-list li.ch-loading { opacity: 0.8; }
    .status-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      display: inline-block;
      text-align: center;
      line-height: 14px;
      font-size: 12px;
    }
    .status-icon.spinner {
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 1s linear infinite;
    }
    .status-icon.ready {
      color: var(--vscode-testing-iconPassed);
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <h3>Chapters</h3>
    <div id="trackTabs" class="track-tabs"></div>
    <ul class="chapter-list" id="chapterList"></ul>
  </div>

  <div class="main-content" id="mainContent">
    <div class="empty-state">
      <h2>Welcome to Repo Tutor</h2>
      <p>Select a chapter from the sidebar to begin learning.</p>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let state = {
      chapters: [],
      currentChapterId: null,
      tracks: [],
      currentTrackId: null,
      currentContent: null,
      questions: [],
      currentQuestionIndex: 0,
      answers: {},
      evaluations: {},
      streamedExplanations: {},
      chapterStates: {},
    };

    const chapterListEl = document.getElementById('chapterList');
    const mainContentEl = document.getElementById('mainContent');

    function renderTrackTabs() {
      const tabsEl = document.getElementById('trackTabs');
      if (!tabsEl || !state.tracks || state.tracks.length <= 1) {
        if (tabsEl) tabsEl.replaceChildren();
        return;
      }

      tabsEl.replaceChildren();
      state.tracks.forEach(track => {
        const tab = document.createElement('div');
        tab.className = 'track-tab' + (track.id === state.currentTrackId ? ' active' : '');
        tab.textContent = track.label;
        tab.addEventListener('click', () => {
          state.currentTrackId = track.id;
          vscode.postMessage({ type: 'track:switched', trackId: track.id });
          renderTrackTabs();
          renderChapterList();
        });
        tabsEl.appendChild(tab);
      });
    }

    function renderChapterList() {
      const filteredChapters = state.currentTrackId
        ? state.chapters.filter(ch => ch.trackId === state.currentTrackId)
        : state.chapters;

      const items = filteredChapters
        .sort((a, b) => a.order - b.order)
        .map(ch => {
          const li = document.createElement('li');
          const chState = state.chapterStates[ch.id] || 'queued';
          li.className = (ch.id === state.currentChapterId ? 'active' : '') +
            (chState === 'queued' ? ' queued' : '') +
            (chState === 'loading' ? ' ch-loading' : '');
          li.dataset.id = ch.id;

          const icon = document.createElement('span');
          icon.className = 'status-icon';
          if (chState === 'loading') { icon.classList.add('spinner'); }
          else if (chState === 'ready') { icon.classList.add('ready'); icon.textContent = '\\u2713'; }
          li.appendChild(icon);

          const orderSpan = document.createElement('span');
          orderSpan.textContent = ch.order + '.';
          li.appendChild(orderSpan);

          const titleSpan = document.createElement('span');
          titleSpan.textContent = ch.title;
          li.appendChild(titleSpan);

          return li;
        });

      chapterListEl.replaceChildren(...items);

      chapterListEl.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
          const chapterId = li.dataset.id;
          vscode.postMessage({ type: 'navigate', chapterId });
        });
      });
    }

    function renderLoading(message) {
      message = message || 'Loading...';
      mainContentEl.replaceChildren();

      const div = document.createElement('div');
      div.className = 'loading';

      const spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      div.appendChild(spinner);

      const p = document.createElement('p');
      p.textContent = message;
      div.appendChild(p);

      mainContentEl.appendChild(div);
    }

    function renderSkeleton(skeleton) {
      mainContentEl.replaceChildren();

      // Header
      var h1 = document.createElement('h1');
      h1.textContent = skeleton.title;
      mainContentEl.appendChild(h1);

      var meta = document.createElement('div');
      meta.className = 'chapter-meta';
      var parts = ['Chapter ' + skeleton.order];
      if (skeleton.trackLabel) parts.push(skeleton.trackLabel);
      if (skeleton.complexity) parts.push(skeleton.complexity + ' complexity');
      meta.textContent = parts.join(' · ');
      mainContentEl.appendChild(meta);

      // Learning objectives
      if (skeleton.learningObjectives.length > 0) {
        var objSection = document.createElement('div');
        objSection.className = 'section skeleton-section';
        var objH2 = document.createElement('h2');
        objH2.textContent = "What you'll learn";
        objSection.appendChild(objH2);
        var ul = document.createElement('ul');
        ul.className = 'objectives-list';
        skeleton.learningObjectives.forEach(function(obj) {
          var li = document.createElement('li');
          li.textContent = obj;
          ul.appendChild(li);
        });
        objSection.appendChild(ul);
        mainContentEl.appendChild(objSection);
      }

      // Files in focus
      if (skeleton.targetFiles.length > 0) {
        var filesSection = document.createElement('div');
        filesSection.className = 'section skeleton-section';
        var filesH2 = document.createElement('h2');
        filesH2.textContent = 'Files in focus';
        filesSection.appendChild(filesH2);

        skeleton.targetFiles.forEach(function(f) {
          var link = document.createElement('a');
          link.className = 'code-ref';
          link.dataset.file = f.path;
          link.textContent = f.path + (f.language ? ' (' + f.language + ')' : '');
          filesSection.appendChild(link);
          filesSection.appendChild(document.createTextNode(' '));
        });

        // Dependency chain
        if (skeleton.dependencies.length > 0) {
          var depDiv = document.createElement('div');
          depDiv.className = 'dependency-chain';
          depDiv.style.marginTop = '12px';
          depDiv.style.fontFamily = 'var(--vscode-editor-font-family)';
          depDiv.style.fontSize = '13px';
          depDiv.style.opacity = '0.8';
          var chain = skeleton.dependencies.map(function(d) {
            return d.from.split('/').pop() + ' → ' + d.to.split('/').pop();
          }).join(', ');
          depDiv.textContent = 'Dependencies: ' + chain;
          filesSection.appendChild(depDiv);
        }

        mainContentEl.appendChild(filesSection);
      }

      // Module context
      if (skeleton.moduleName) {
        var modDiv = document.createElement('div');
        modDiv.className = 'section skeleton-section';
        modDiv.style.opacity = '0.7';
        modDiv.textContent = 'Module: ' + skeleton.moduleName;
        mainContentEl.appendChild(modDiv);
      }

      // Generating indicator
      var genDiv = document.createElement('div');
      genDiv.className = 'loading';
      genDiv.id = 'skeletonLoadingIndicator';
      var spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      genDiv.appendChild(spinner);
      var genP = document.createElement('p');
      genP.textContent = 'Generating detailed content...';
      genDiv.appendChild(genP);
      mainContentEl.appendChild(genDiv);
    }

    function renderCodeRefs(refs) {
      const container = document.createElement('div');
      container.style.marginTop = '12px';

      refs.forEach(ref => {
        const link = document.createElement('a');
        link.className = 'code-ref';
        link.dataset.file = ref.file;
        link.dataset.line = ref.startLine || '';
        link.textContent = ref.file + (ref.startLine ? ':' + ref.startLine : '');
        container.appendChild(link);
        container.appendChild(document.createTextNode(' '));
      });

      return container;
    }

    function renderChapter(chapter) {
      mainContentEl.replaceChildren();

      const h1 = document.createElement('h1');
      h1.textContent = chapter.title;
      mainContentEl.appendChild(h1);

      const meta = document.createElement('div');
      meta.className = 'chapter-meta';
      meta.textContent = 'Chapter ' + getChapterOrder(chapter.chapterId);
      mainContentEl.appendChild(meta);

      chapter.sections.forEach(section => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'section';

        const h2 = document.createElement('h2');
        h2.textContent = section.heading;
        sectionDiv.appendChild(h2);

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = (section.content);
        sectionDiv.appendChild(contentDiv);

        if (section.codeReferences && section.codeReferences.length > 0) {
          sectionDiv.appendChild(renderCodeRefs(section.codeReferences));
        }

        mainContentEl.appendChild(sectionDiv);
      });

      if (chapter.keyTakeaways && chapter.keyTakeaways.length > 0) {
        const takeaways = document.createElement('div');
        takeaways.className = 'takeaways';

        const h3 = document.createElement('h3');
        h3.textContent = 'Key Takeaways';
        takeaways.appendChild(h3);

        const ul = document.createElement('ul');
        chapter.keyTakeaways.forEach(t => {
          const li = document.createElement('li');
          li.textContent = t;
          ul.appendChild(li);
        });
        takeaways.appendChild(ul);

        mainContentEl.appendChild(takeaways);
      }

      // Quiz section
      const quizSection = document.createElement('div');
      quizSection.className = 'quiz-section';

      const quizH3 = document.createElement('h3');
      quizH3.textContent = 'Test Your Understanding';
      quizSection.appendChild(quizH3);

      const quizP = document.createElement('p');
      quizP.textContent = 'Take a quick quiz to check what you\\'ve learned.';
      quizSection.appendChild(quizP);

      const startQuizBtn = document.createElement('button');
      startQuizBtn.className = 'btn';
      startQuizBtn.id = 'startQuizBtn';
      startQuizBtn.textContent = 'Start Quiz';
      startQuizBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'quiz:start', chapterId: chapter.chapterId });
      });
      quizSection.appendChild(startQuizBtn);

      const quizContent = document.createElement('div');
      quizContent.id = 'quizContent';
      quizSection.appendChild(quizContent);

      mainContentEl.appendChild(quizSection);

      // Q&A section
      const qaSection = document.createElement('div');
      qaSection.className = 'qa-section';

      const qaH3 = document.createElement('h3');
      qaH3.textContent = 'Have a Question?';
      qaSection.appendChild(qaH3);

      const qaInput = document.createElement('div');
      qaInput.className = 'qa-input';

      const questionInput = document.createElement('input');
      questionInput.type = 'text';
      questionInput.id = 'questionInput';
      questionInput.placeholder = 'Ask about this chapter...';
      qaInput.appendChild(questionInput);

      const askBtn = document.createElement('button');
      askBtn.className = 'btn';
      askBtn.id = 'askBtn';
      askBtn.textContent = 'Ask';
      askBtn.addEventListener('click', () => {
        if (questionInput.value.trim()) {
          vscode.postMessage({ type: 'question:ask', question: questionInput.value });
        }
      });
      qaInput.appendChild(askBtn);

      qaSection.appendChild(qaInput);

      const qaAnswer = document.createElement('div');
      qaAnswer.id = 'qaAnswer';
      qaSection.appendChild(qaAnswer);

      mainContentEl.appendChild(qaSection);

      // Navigation buttons
      const navButtons = document.createElement('div');
      navButtons.className = 'nav-buttons';

      const prevChapter = findPrevChapter(chapter.chapterId);
      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn';
      prevBtn.id = 'prevBtn';
      prevBtn.textContent = 'Previous';
      prevBtn.style.visibility = prevChapter ? 'visible' : 'hidden';
      if (prevChapter) {
        prevBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'navigate', chapterId: prevChapter.id });
        });
      }
      navButtons.appendChild(prevBtn);

      const nextChapter = findNextChapter(chapter.chapterId);
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn';
      nextBtn.id = 'nextBtn';
      nextBtn.textContent = 'Next Chapter';
      nextBtn.style.visibility = nextChapter ? 'visible' : 'hidden';
      if (nextChapter) {
        nextBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'navigate', chapterId: nextChapter.id });
        });
      }
      navButtons.appendChild(nextBtn);

      mainContentEl.appendChild(navButtons);
    }

    function getChapterOrder(chapterId) {
      const ch = state.chapters.find(c => c.id === chapterId);
      return ch ? ch.order : '?';
    }

    function findNextChapter(currentId) {
      const current = state.chapters.find(c => c.id === currentId);
      if (!current) return null;
      return state.chapters.find(c => c.order === current.order + 1);
    }

    function findPrevChapter(currentId) {
      const current = state.chapters.find(c => c.id === currentId);
      if (!current) return null;
      return state.chapters.find(c => c.order === current.order - 1);
    }

    function renderQuiz(questions) {
      const prevCount = state.questions.length;
      // Preserve existing answers/evaluations when appending
      if (prevCount > 0 && questions.length > prevCount) {
        state.questions = questions;
        state.currentQuestionIndex = prevCount; // jump to first new question
      } else {
        state.questions = questions;
        state.currentQuestionIndex = 0;
        state.answers = {};
        state.evaluations = {};
      }
      renderCurrentQuestion();
    }

    function renderCurrentQuestion() {
      const quizContent = document.getElementById('quizContent');
      if (!quizContent) return;

      const q = state.questions[state.currentQuestionIndex];
      if (!q) {
        quizContent.replaceChildren();
        const p = document.createElement('p');
        p.textContent = 'No questions available.';
        quizContent.appendChild(p);
        return;
      }

      const evaluation = state.evaluations[q.id];

      quizContent.replaceChildren();

      const questionDiv = document.createElement('div');
      questionDiv.className = 'question';

      const progressP = document.createElement('p');
      progressP.textContent = 'Question ' + (state.currentQuestionIndex + 1) + ' of ' + state.questions.length;
      questionDiv.appendChild(progressP);

      const questionP = document.createElement('p');
      questionP.textContent = q.question;
      questionDiv.appendChild(questionP);

      if (q.type === 'multiple-choice' && q.options) {
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'options';

        q.options.forEach(opt => {
          const label = document.createElement('label');
          label.className = 'option' + (state.answers[q.id] === opt ? ' selected' : '');

          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'answer';
          radio.value = opt;
          if (state.answers[q.id] === opt) radio.checked = true;
          label.appendChild(radio);

          label.appendChild(document.createTextNode(opt));

          label.addEventListener('click', () => {
            state.answers[q.id] = opt;
            renderCurrentQuestion();
          });

          optionsDiv.appendChild(label);
        });

        questionDiv.appendChild(optionsDiv);
      } else {
        const textarea = document.createElement('textarea');
        textarea.id = 'freeAnswer';
        textarea.placeholder = 'Your answer...';
        textarea.value = state.answers[q.id] || '';
        textarea.addEventListener('input', (e) => {
          state.answers[q.id] = e.target.value;
        });
        questionDiv.appendChild(textarea);
      }

      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn';
      submitBtn.id = 'submitAnswerBtn';
      submitBtn.style.marginTop = '12px';
      submitBtn.textContent = evaluation ? 'Submitted' : 'Submit Answer';
      if (evaluation) submitBtn.disabled = true;
      submitBtn.addEventListener('click', () => {
        const answer = state.answers[q.id];
        if (answer) {
          vscode.postMessage({ type: 'quiz:submit', questionId: q.id, answer });
        }
      });
      questionDiv.appendChild(submitBtn);

      if (evaluation) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'feedback ' + (evaluation.isCorrect ? 'correct' : 'incorrect');

        const strong = document.createElement('strong');
        strong.textContent = evaluation.isCorrect ? '✓ Correct!' : '✗ Not quite';
        feedbackDiv.appendChild(strong);

        const feedbackP = document.createElement('div');
        // Feedback is pre-rendered to HTML by extension via marked
        feedbackP.innerHTML = evaluation.feedback;
        feedbackDiv.appendChild(feedbackP);

        if (evaluation.explanation) {
          const explainDiv = document.createElement('div');
          explainDiv.style.fontStyle = 'italic';
          // Explanation is pre-rendered to HTML by extension via marked
          explainDiv.innerHTML = evaluation.explanation;
          feedbackDiv.appendChild(explainDiv);
        }

        questionDiv.appendChild(feedbackDiv);

        // Streaming explanation container
        const streamingDiv = document.createElement('div');
        streamingDiv.className = 'streaming-text streaming';
        streamingDiv.id = 'streamingExplanation';
        const streamedText = (state.streamedExplanations || {})[q.id] || '';
        if (streamedText) {
          // Note: Content comes from our own LLM, same trust model as formatContent usage elsewhere
          streamingDiv.innerHTML = (streamedText);
        }
        questionDiv.appendChild(streamingDiv);
      }

      const navDiv = document.createElement('div');
      navDiv.style.marginTop = '16px';
      navDiv.style.display = 'flex';
      navDiv.style.gap = '8px';

      if (state.currentQuestionIndex > 0) {
        const prevQBtn = document.createElement('button');
        prevQBtn.className = 'btn';
        prevQBtn.id = 'prevQBtn';
        prevQBtn.textContent = 'Previous';
        prevQBtn.addEventListener('click', () => {
          state.currentQuestionIndex--;
          renderCurrentQuestion();
        });
        navDiv.appendChild(prevQBtn);
      }

      if (state.currentQuestionIndex < state.questions.length - 1) {
        const nextQBtn = document.createElement('button');
        nextQBtn.className = 'btn';
        nextQBtn.id = 'nextQBtn';
        nextQBtn.textContent = 'Next';
        nextQBtn.addEventListener('click', () => {
          state.currentQuestionIndex++;
          renderCurrentQuestion();
        });
        navDiv.appendChild(nextQBtn);
      }

      questionDiv.appendChild(navDiv);

      // "Another Question" button — always visible
      const moreBtn = document.createElement('button');
      moreBtn.className = 'btn btn-secondary';
      moreBtn.id = 'moreQBtn';
      moreBtn.textContent = 'Another Question';
      moreBtn.style.marginTop = '12px';
      moreBtn.addEventListener('click', () => {
        if (state.currentChapterId) {
          vscode.postMessage({ type: 'quiz:more', chapterId: state.currentChapterId });
        }
      });
      questionDiv.appendChild(moreBtn);

      quizContent.appendChild(questionDiv);
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'init':
          state.chapters = message.chapters;
          state.currentChapterId = message.currentChapterId;
          state.tracks = message.tracks || [];
          state.currentTrackId = message.currentTrackId || (state.tracks[0] && state.tracks[0].id) || null;
          renderTrackTabs();
          renderChapterList();
          if (message.currentChapterId) {
            vscode.postMessage({ type: 'chapter:request', chapterId: message.currentChapterId });
          }
          break;

        case 'chapter:loading':
          state.currentChapterId = message.chapterId;
          renderChapterList();
          // Don't call renderLoading — skeleton is already showing with its own spinner
          break;

        case 'chapter:skeleton':
          state.currentChapterId = message.chapterId;
          renderChapterList();
          renderSkeleton(message.skeleton);
          break;

        case 'prefetch:progress':
          var indicator = document.getElementById('prefetchIndicator');
          if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'prefetchIndicator';
            indicator.style.cssText = 'position:fixed;bottom:8px;right:16px;font-size:12px;opacity:0.6;';
            document.body.appendChild(indicator);
          }
          if (message.done >= message.total) {
            indicator.remove();
          } else {
            indicator.textContent = 'Preparing chapters... ' + message.done + '/' + message.total;
          }
          break;

        case 'chapter:states':
          state.chapterStates = message.states;
          renderChapterList();
          break;

        case 'init:analyzing':
          mainContentEl.replaceChildren();
          var analyzeDiv = document.createElement('div');
          analyzeDiv.className = 'loading';
          analyzeDiv.id = 'analyzePhase';
          var analyzeSpinner = document.createElement('div');
          analyzeSpinner.className = 'loading-spinner';
          analyzeDiv.appendChild(analyzeSpinner);
          var analyzeH2 = document.createElement('h2');
          analyzeH2.textContent = 'Scanning repository...';
          analyzeH2.style.margin = '16px 0 8px';
          analyzeDiv.appendChild(analyzeH2);
          var analyzeP = document.createElement('p');
          analyzeP.textContent = message.repoPath;
          analyzeP.style.opacity = '0.7';
          analyzeDiv.appendChild(analyzeP);
          mainContentEl.appendChild(analyzeDiv);
          break;

        case 'init:planning':
          var phaseEl = document.getElementById('analyzePhase');
          if (phaseEl) {
            var h2 = phaseEl.querySelector('h2');
            if (h2) h2.textContent = 'Planning ' + message.trackCount + ' track(s)...';
          }
          break;

        case 'chapter:loaded':
          state.currentContent = message.chapter;
          renderChapter(message.chapter);
          break;

        case 'chapter:error':
          mainContentEl.replaceChildren();
          const errorDiv = document.createElement('div');
          errorDiv.className = 'empty-state';
          const errorH2 = document.createElement('h2');
          errorH2.textContent = 'Error';
          errorDiv.appendChild(errorH2);
          const errorP = document.createElement('p');
          errorP.textContent = message.error;
          errorDiv.appendChild(errorP);
          mainContentEl.appendChild(errorDiv);
          break;

        case 'quiz:loading':
          const quizContent = document.getElementById('quizContent');
          if (quizContent) {
            quizContent.replaceChildren();
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            loadingDiv.appendChild(spinner);
            const loadingP = document.createElement('p');
            loadingP.textContent = 'Generating quiz...';
            loadingDiv.appendChild(loadingP);
            quizContent.appendChild(loadingDiv);
          }
          break;

        case 'quiz:loaded':
          renderQuiz(message.questions);
          break;

        case 'answer:evaluating': {
          const submitBtn = document.getElementById('submitAnswerBtn');
          if (submitBtn) submitBtn.disabled = true;

          // Show animated loading feedback
          const existingFeedback = document.querySelector('.feedback');
          if (!existingFeedback) {
            const questionEl = document.querySelector('.question');
            if (questionEl) {
              const loadingFeedback = document.createElement('div');
              loadingFeedback.className = 'loading-feedback';
              loadingFeedback.id = 'evaluatingFeedback';

              const spinner = document.createElement('div');
              spinner.className = 'loading-spinner';
              loadingFeedback.appendChild(spinner);

              const msgSpan = document.createElement('span');
              msgSpan.className = 'rotating-message';
              msgSpan.textContent = 'Checking your answer...';
              loadingFeedback.appendChild(msgSpan);

              questionEl.appendChild(loadingFeedback);

              // Rotate messages
              const messages = ['Checking your answer...', 'Analyzing key points...', 'Evaluating understanding...'];
              let msgIdx = 0;
              const interval = setInterval(() => {
                msgIdx = (msgIdx + 1) % messages.length;
                msgSpan.textContent = messages[msgIdx];
              }, 2000);
              loadingFeedback.dataset.interval = String(interval);
            }
          }
          break;
        }

        case 'answer:evaluated': {
          // Clear loading animation
          const evalFeedback = document.getElementById('evaluatingFeedback');
          if (evalFeedback) {
            clearInterval(Number(evalFeedback.dataset.interval));
            evalFeedback.remove();
          }
          state.evaluations[message.evaluation.questionId] = message.evaluation;
          state.streamedExplanations = state.streamedExplanations || {};
          state.streamedExplanations[message.evaluation.questionId] = '';
          renderCurrentQuestion();
          break;
        }

        case 'answer:explanation-chunk': {
          // Server sends full pre-rendered HTML (accumulated + converted via marked), just replace.
          // Content originates from our own LLM explanation pipeline, not arbitrary user input.
          state.streamedExplanations = state.streamedExplanations || {};
          state.streamedExplanations[message.questionId] = message.text;
          const streamEl = document.getElementById('streamingExplanation');
          if (streamEl) {
            streamEl.innerHTML = message.text;
            streamEl.classList.add('streaming');
            streamEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          break;
        }

        case 'answer:explanation-done': {
          const doneEl = document.getElementById('streamingExplanation');
          if (doneEl) {
            doneEl.classList.remove('streaming');
            const finalText = (state.streamedExplanations || {})[message.questionId] || '';
            if (finalText) {
              // Note: Content comes from our own LLM, same trust model as formatContent usage elsewhere in this file
              doneEl.innerHTML = (finalText);
            }
          }
          break;
        }

        case 'question:answering':
          const qaAnswer = document.getElementById('qaAnswer');
          if (qaAnswer) {
            qaAnswer.replaceChildren();
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            loadingDiv.appendChild(spinner);
            qaAnswer.appendChild(loadingDiv);
          }
          break;

        case 'question:answered':
          const qaAnswerEl = document.getElementById('qaAnswer');
          if (qaAnswerEl) {
            qaAnswerEl.replaceChildren();
            const answerDiv = document.createElement('div');
            answerDiv.className = 'qa-answer';
            answerDiv.textContent = message.answer.answer;
            qaAnswerEl.appendChild(answerDiv);
          }
          break;
      }
    });

    // Handle code reference clicks
    document.addEventListener('click', (e) => {
      const codeRef = e.target.closest('.code-ref');
      if (codeRef) {
        const file = codeRef.dataset.file;
        const line = codeRef.dataset.line ? parseInt(codeRef.dataset.line) : undefined;
        vscode.postMessage({ type: 'openFile', file, line });
      }
    });

    // Signal ready
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
