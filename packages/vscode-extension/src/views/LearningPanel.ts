// packages/vscode-extension/src/views/LearningPanel.ts

import * as vscode from 'vscode';
import { Chapter, ChapterContent, Question, Evaluation, Answer } from '@repo-tutor/core';
import { getCoreAdapter, getDefaultUserContext } from '../core-adapter';
import { SessionState } from './ChaptersTreeProvider';

// Message types from contract
type ExtensionToWebviewMessage =
  | { type: 'init'; chapters: Chapter[]; currentChapterId: string | null }
  | { type: 'chapter:loading'; chapterId: string }
  | { type: 'chapter:loaded'; chapter: ChapterContent }
  | { type: 'chapter:error'; chapterId: string; error: string }
  | { type: 'quiz:loading'; chapterId: string }
  | { type: 'quiz:loaded'; questions: Question[] }
  | { type: 'answer:evaluating'; questionId: string }
  | { type: 'answer:evaluated'; evaluation: Evaluation }
  | { type: 'question:answering' }
  | { type: 'question:answered'; answer: Answer };

type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'chapter:request'; chapterId: string }
  | { type: 'quiz:start'; chapterId: string }
  | { type: 'quiz:submit'; questionId: string; answer: string }
  | { type: 'question:ask'; question: string }
  | { type: 'navigate'; chapterId: string }
  | { type: 'openFile'; file: string; line?: number };

export class LearningPanel {
  public static currentPanel: LearningPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _session: SessionState;
  private _generatedContent: Map<string, ChapterContent> = new Map();
  private _generatedQuizzes: Map<string, Question[]> = new Map();
  private _currentQuestions: Question[] = [];

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

  private async _handleMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case 'ready':
        this._postMessage({
          type: 'init',
          chapters: this._session.chapters,
          currentChapterId: this._session.currentChapterId,
        });
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

      case 'question:ask':
        await this._askQuestion(message.question);
        break;

      case 'openFile':
        await this._openFile(message.file, message.line);
        break;
    }
  }

  private async _loadChapter(chapterId: string) {
    this._postMessage({ type: 'chapter:loading', chapterId });

    try {
      // Check cache
      let content = this._generatedContent.get(chapterId);

      if (!content) {
        const chapter = this._session.chapters.find((c) => c.id === chapterId);
        if (!chapter) {
          throw new Error(`Chapter not found: ${chapterId}`);
        }

        const core = getCoreAdapter();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analysisResult = (this._session as any).analysisResult;
        const userContext = getDefaultUserContext();

        content = await core.generateChapter(chapter, analysisResult, userContext);
        this._generatedContent.set(chapterId, content);
      }

      this._postMessage({ type: 'chapter:loaded', chapter: content });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'chapter:error', chapterId, error: errorMessage });
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

  private async _submitAnswer(questionId: string, answer: string) {
    this._postMessage({ type: 'answer:evaluating', questionId });

    try {
      const question = this._currentQuestions.find((q) => q.id === questionId);
      if (!question) {
        throw new Error(`Question not found: ${questionId}`);
      }

      const core = getCoreAdapter();
      const evaluation = await core.evaluateAnswer(question, answer);

      this._postMessage({ type: 'answer:evaluated', evaluation });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analysisResult: (this._session as any).analysisResult,
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
  </style>
</head>
<body>
  <div class="sidebar">
    <h3>Chapters</h3>
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
      currentContent: null,
      questions: [],
      currentQuestionIndex: 0,
      answers: {},
      evaluations: {},
    };

    const chapterListEl = document.getElementById('chapterList');
    const mainContentEl = document.getElementById('mainContent');

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function renderChapterList() {
      const items = state.chapters
        .sort((a, b) => a.order - b.order)
        .map(ch => {
          const li = document.createElement('li');
          li.className = ch.id === state.currentChapterId ? 'active' : '';
          li.dataset.id = ch.id;

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

    function formatContent(content) {
      // Simple text formatting - escape HTML first, then apply formatting
      const escaped = escapeHtml(content);
      return escaped
        .replace(/\\n\\n/g, '</p><p>')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\`(.+?)\`/g, '<code>$1</code>');
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
        contentDiv.innerHTML = formatContent(section.content);
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
      state.questions = questions;
      state.currentQuestionIndex = 0;
      state.answers = {};
      state.evaluations = {};
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

        const feedbackP = document.createElement('p');
        feedbackP.textContent = evaluation.feedback;
        feedbackDiv.appendChild(feedbackP);

        if (evaluation.explanation) {
          const explainP = document.createElement('p');
          const em = document.createElement('em');
          em.textContent = evaluation.explanation;
          explainP.appendChild(em);
          feedbackDiv.appendChild(explainP);
        }

        questionDiv.appendChild(feedbackDiv);
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
      quizContent.appendChild(questionDiv);
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'init':
          state.chapters = message.chapters;
          state.currentChapterId = message.currentChapterId;
          renderChapterList();
          if (message.currentChapterId) {
            vscode.postMessage({ type: 'chapter:request', chapterId: message.currentChapterId });
          }
          break;

        case 'chapter:loading':
          state.currentChapterId = message.chapterId;
          renderChapterList();
          renderLoading('Generating chapter content...');
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

        case 'answer:evaluating':
          const submitBtn = document.getElementById('submitAnswerBtn');
          if (submitBtn) submitBtn.disabled = true;
          break;

        case 'answer:evaluated':
          state.evaluations[message.evaluation.questionId] = message.evaluation;
          renderCurrentQuestion();
          break;

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
