// packages/vscode-extension/src/views/SecurityConfigPanel.ts

import * as vscode from 'vscode';
import { SecurityConfig } from '@repo-tutor/core';

const SECURITY_PRESETS: Record<string, Omit<SecurityConfig, 'preset'>> = {
  standard: {
    neverSend: ['.env', '.env.*', '*.pem', '*.key', 'credentials.json', '*.p12', '*.pfx'],
    skipAnalysis: ['node_modules', '.git', 'dist', 'build', '__pycache__', 'venv', '.venv'],
    confirmBeforeSend: false,
    maxCodeContextChars: 25000,
    strictMode: false,
  },
  cautious: {
    neverSend: ['.env', '.env.*', '*.pem', '*.key', 'credentials.json', '*.p12', '*.pfx', 'config/*', 'secrets/*'],
    skipAnalysis: ['node_modules', '.git', 'dist', 'build', '__pycache__', 'venv', '.venv', 'test', 'tests', '__tests__'],
    confirmBeforeSend: true,
    maxCodeContextChars: 15000,
    strictMode: false,
  },
  strict: {
    neverSend: ['*'],
    skipAnalysis: ['node_modules', '.git'],
    confirmBeforeSend: true,
    maxCodeContextChars: 10000,
    strictMode: true,
  },
};

export interface SecurityConfigResult {
  confirmed: boolean;
  config?: SecurityConfig;
}

type SecurityConfigMessage =
  | { type: 'ready' }
  | { type: 'presetSelected'; preset: string }
  | { type: 'configUpdated'; config: Partial<SecurityConfig> }
  | { type: 'confirm'; config: SecurityConfig }
  | { type: 'cancel' };

export class SecurityConfigPanel {
  public static currentPanel: SecurityConfigPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _resolvePromise?: (result: SecurityConfigResult) => void;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtmlForWebview();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (message: SecurityConfigMessage) => this._handleMessage(message),
      null,
      this._disposables
    );
  }

  public static show(extensionUri: vscode.Uri): Promise<SecurityConfigResult> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SecurityConfigPanel.currentPanel) {
      SecurityConfigPanel.currentPanel._panel.reveal(column);
    } else {
      const panel = vscode.window.createWebviewPanel(
        'repoTutor.securityConfig',
        'Repo Tutor - Security Settings',
        column || vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      SecurityConfigPanel.currentPanel = new SecurityConfigPanel(panel, extensionUri);
    }

    return new Promise<SecurityConfigResult>((resolve) => {
      SecurityConfigPanel.currentPanel!._resolvePromise = resolve;
    });
  }

  private _handleMessage(message: SecurityConfigMessage) {
    switch (message.type) {
      case 'ready':
        this._panel.webview.postMessage({
          type: 'init',
          presets: SECURITY_PRESETS,
          defaultPreset: 'standard',
        });
        break;

      case 'confirm':
        this._resolvePromise?.({ confirmed: true, config: message.config });
        this.dispose();
        break;

      case 'cancel':
        this._resolvePromise?.({ confirmed: false });
        this.dispose();
        break;
    }
  }

  public dispose() {
    SecurityConfigPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }

    if (this._resolvePromise) {
      this._resolvePromise({ confirmed: false });
    }
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Settings</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, system-ui);
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      max-width: 700px;
      margin: 0 auto;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 0.5em;
      color: var(--vscode-foreground);
    }
    .description {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .warning {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 20px;
    }
    .warning-title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .preset-group {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }
    .preset-btn {
      flex: 1;
      padding: 16px 12px;
      border: 2px solid var(--vscode-input-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
      cursor: pointer;
      text-align: left;
    }
    .preset-btn:hover {
      border-color: var(--vscode-focusBorder);
    }
    .preset-btn.selected {
      border-color: var(--vscode-button-background);
      background: var(--vscode-list-activeSelectionBackground);
    }
    .preset-btn h3 {
      margin: 0 0 8px 0;
      font-size: 1em;
    }
    .preset-btn p {
      margin: 0;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .section {
      margin-bottom: 20px;
    }
    .section label {
      display: block;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .section small {
      display: block;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      font-size: 0.85em;
    }
    textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      resize: vertical;
    }
    input[type="number"] {
      width: 120px;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .checkbox-row input {
      width: 18px;
      height: 18px;
    }
    .actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-input-border);
    }
    button {
      padding: 8px 20px;
      border-radius: 4px;
      font-size: 1em;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-input-border);
    }
    .btn-secondary:hover {
      background: var(--vscode-list-hoverBackground);
    }
  </style>
</head>
<body>
  <h1>🔒 Security Settings</h1>
  <p class="description">
    Before analyzing the codebase, configure what code can be sent to the LLM.
    These settings help protect sensitive information like API keys, passwords, and private business logic.
  </p>

  <div class="warning">
    <div class="warning-title">⚠️ Privacy Notice</div>
    Code from your repository will be sent to an external LLM API to generate learning content.
    Review these settings carefully to exclude sensitive files.
  </div>

  <h2>Security Preset</h2>
  <div class="preset-group">
    <button class="preset-btn" data-preset="standard">
      <h3>Standard</h3>
      <p>Excludes common secret files (.env, *.key). Good for most projects.</p>
    </button>
    <button class="preset-btn" data-preset="cautious">
      <h3>Cautious</h3>
      <p>Excludes more patterns, requires confirmation before sending.</p>
    </button>
    <button class="preset-btn" data-preset="strict">
      <h3>Strict</h3>
      <p>Only sends code structure, never actual code. Limited learning experience.</p>
    </button>
  </div>

  <h2>Customize</h2>

  <div class="section">
    <label for="neverSend">Never Send (glob patterns, one per line)</label>
    <small>Files matching these patterns will never be sent to the LLM</small>
    <textarea id="neverSend"></textarea>
  </div>

  <div class="section">
    <label for="skipAnalysis">Skip Analysis (glob patterns, one per line)</label>
    <small>Files matching these patterns won't be analyzed at all</small>
    <textarea id="skipAnalysis"></textarea>
  </div>

  <div class="section">
    <label for="maxChars">Max Code Context (characters)</label>
    <small>Maximum amount of code sent per LLM request</small>
    <input type="number" id="maxChars" min="5000" max="100000" step="1000">
  </div>

  <div class="section">
    <div class="checkbox-row">
      <input type="checkbox" id="confirmBeforeSend">
      <label for="confirmBeforeSend">Confirm before each LLM request</label>
    </div>
    <div class="checkbox-row">
      <input type="checkbox" id="strictMode">
      <label for="strictMode">Strict mode (only send structure, never code)</label>
    </div>
  </div>

  <div class="actions">
    <button class="btn-secondary" id="cancelBtn">Cancel</button>
    <button class="btn-primary" id="confirmBtn">Start Analysis</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let currentConfig = {
      preset: 'standard',
      neverSend: [],
      skipAnalysis: [],
      confirmBeforeSend: false,
      maxCodeContextChars: 25000,
      strictMode: false,
    };

    const presets = {};

    // Elements
    const presetBtns = document.querySelectorAll('.preset-btn');
    const neverSendEl = document.getElementById('neverSend');
    const skipAnalysisEl = document.getElementById('skipAnalysis');
    const maxCharsEl = document.getElementById('maxChars');
    const confirmBeforeSendEl = document.getElementById('confirmBeforeSend');
    const strictModeEl = document.getElementById('strictMode');
    const cancelBtn = document.getElementById('cancelBtn');
    const confirmBtn = document.getElementById('confirmBtn');

    function selectPreset(preset) {
      currentConfig.preset = preset;
      const presetConfig = presets[preset];
      if (presetConfig) {
        Object.assign(currentConfig, presetConfig);
        updateUI();
      }

      presetBtns.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.preset === preset);
      });
    }

    function updateUI() {
      neverSendEl.value = currentConfig.neverSend.join('\\n');
      skipAnalysisEl.value = currentConfig.skipAnalysis.join('\\n');
      maxCharsEl.value = currentConfig.maxCodeContextChars;
      confirmBeforeSendEl.checked = currentConfig.confirmBeforeSend;
      strictModeEl.checked = currentConfig.strictMode;
    }

    function readFromUI() {
      currentConfig.neverSend = neverSendEl.value.split('\\n').map(s => s.trim()).filter(Boolean);
      currentConfig.skipAnalysis = skipAnalysisEl.value.split('\\n').map(s => s.trim()).filter(Boolean);
      currentConfig.maxCodeContextChars = parseInt(maxCharsEl.value, 10) || 25000;
      currentConfig.confirmBeforeSend = confirmBeforeSendEl.checked;
      currentConfig.strictMode = strictModeEl.checked;
      // If user customized, mark as custom preset
      currentConfig.preset = 'custom';
    }

    // Event listeners
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => selectPreset(btn.dataset.preset));
    });

    [neverSendEl, skipAnalysisEl, maxCharsEl].forEach(el => {
      el.addEventListener('change', () => {
        readFromUI();
        presetBtns.forEach(btn => btn.classList.remove('selected'));
      });
    });

    [confirmBeforeSendEl, strictModeEl].forEach(el => {
      el.addEventListener('change', () => {
        readFromUI();
        presetBtns.forEach(btn => btn.classList.remove('selected'));
      });
    });

    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    confirmBtn.addEventListener('click', () => {
      readFromUI();
      vscode.postMessage({ type: 'confirm', config: currentConfig });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'init') {
        Object.assign(presets, message.presets);
        selectPreset(message.defaultPreset);
      }
    });

    // Signal ready
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
