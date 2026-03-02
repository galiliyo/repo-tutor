import * as vscode from 'vscode';
import { LLMProvider } from '@repo-tutor/core';
import { PROVIDER_REGISTRY, getProvider, ProviderDefinition } from '../providers/registry';
import { getSettings, updateSettings, getApiKey, setApiKey, hasApiKey } from '../settings';
import { configureLLM, getCoreAdapter } from '../core-adapter';
import { StatusBarManager } from './StatusBarManager';

type ConfigMessage =
  | { type: 'ready' }
  | { type: 'providerChanged'; provider: LLMProvider }
  | { type: 'modelChanged'; model: string }
  | { type: 'baseUrlChanged'; baseUrl: string }
  | { type: 'setApiKey' }
  | { type: 'testConnection' };

type ConfigResponse =
  | { type: 'state'; provider: LLMProvider; model: string; baseUrl: string; hasKey: boolean; providers: ProviderDefinition[]; ollamaModels: string[] }
  | { type: 'testResult'; success: boolean; message: string }
  | { type: 'ollamaModels'; models: string[] };

export class ModelConfigView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repo-tutor.modelConfig';

  private _view?: vscode.WebviewView;
  private _statusBar: StatusBarManager | undefined;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _secrets: vscode.SecretStorage,
  ) {}

  setStatusBar(statusBar: StatusBarManager): void {
    this._statusBar = statusBar;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage((msg: ConfigMessage) =>
      this._handleMessage(msg),
    );
  }

  private async _handleMessage(msg: ConfigMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this._sendState();
        break;

      case 'providerChanged': {
        const providerDef = getProvider(msg.provider);
        await updateSettings({
          provider: msg.provider,
          model: providerDef?.defaultModel ?? 'llama3',
        });
        await this._applyConfig();
        await this._sendState();
        break;
      }

      case 'modelChanged':
        await updateSettings({ model: msg.model });
        await this._applyConfig();
        await this._sendState();
        break;

      case 'baseUrlChanged':
        await updateSettings({ ollamaUrl: msg.baseUrl });
        await this._applyConfig();
        break;

      case 'setApiKey':
        await this._promptApiKey();
        break;

      case 'testConnection':
        await this._testConnection();
        break;
    }
  }

  private async _sendState(): Promise<void> {
    const settings = getSettings();
    const keyOk = await hasApiKey(this._secrets, settings.provider);
    let ollamaModels: string[] = [];

    if (settings.provider === 'ollama') {
      ollamaModels = await this._fetchOllamaModels(settings.ollamaUrl);
    }

    this._postMessage({
      type: 'state',
      provider: settings.provider,
      model: settings.model,
      baseUrl: settings.ollamaUrl,
      hasKey: keyOk,
      providers: PROVIDER_REGISTRY,
      ollamaModels,
    });
  }

  private async _fetchOllamaModels(baseUrl: string): Promise<string[]> {
    try {
      const resp = await fetch(`${baseUrl}/api/tags`);
      if (!resp.ok) return [];
      const data = (await resp.json()) as { models?: { name: string }[] };
      return data.models?.map((m) => m.name) ?? [];
    } catch {
      return [];
    }
  }

  private async _promptApiKey(): Promise<void> {
    const settings = getSettings();
    const providerDef = getProvider(settings.provider);

    const existing = await getApiKey(this._secrets, settings.provider);
    const placeholder = existing ? '********' + existing.slice(-4) : 'Enter your API key';

    const apiKey = await vscode.window.showInputBox({
      prompt: `Enter your ${providerDef?.label ?? settings.provider} API key`,
      placeHolder: placeholder,
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length < 10) {
          return 'API key seems too short';
        }
        return null;
      },
    });

    if (!apiKey) return;
    await setApiKey(this._secrets, settings.provider, apiKey.trim());
    await this._applyConfig();
    await this._sendState();
  }

  private async _testConnection(): Promise<void> {
    const settings = getSettings();
    const keyOk = await hasApiKey(this._secrets, settings.provider);

    if (!keyOk) {
      this._postMessage({ type: 'testResult', success: false, message: 'No API key configured' });
      return;
    }

    await this._applyConfig();

    const start = Date.now();
    try {
      const ok = await getCoreAdapter().validateApiKey();
      const elapsed = Date.now() - start;
      if (ok) {
        this._postMessage({ type: 'testResult', success: true, message: `Connected (${elapsed}ms)` });
      } else {
        this._postMessage({ type: 'testResult', success: false, message: 'Validation failed' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this._postMessage({ type: 'testResult', success: false, message: msg });
    }
  }

  private async _applyConfig(): Promise<void> {
    const settings = getSettings();
    const apiKey = await getApiKey(this._secrets, settings.provider);
    if (!apiKey) return;

    const providerDef = getProvider(settings.provider);

    configureLLM({
      provider: settings.provider,
      apiKey,
      model: settings.model,
      baseUrl: providerDef?.baseUrl ?? (settings.provider === 'ollama' ? settings.ollamaUrl + '/v1' : undefined),
    });

    this._statusBar?.refresh();
  }

  private _postMessage(msg: ConfigResponse): void {
    this._view?.webview.postMessage(msg);
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 12px;
      margin: 0;
    }
    .field { margin-bottom: 12px; }
    label {
      display: block;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    select, input[type="text"] {
      width: 100%;
      padding: 4px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-family: inherit;
      font-size: inherit;
      box-sizing: border-box;
    }
    select:focus, input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    .key-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-dot.ok { background: var(--vscode-testing-iconPassed); }
    .status-dot.missing { background: var(--vscode-testing-iconFailed); }
    .key-label { flex: 1; font-size: 0.9em; }
    button {
      padding: 4px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .test-btn { width: 100%; margin-top: 4px; }
    .test-result {
      margin-top: 8px;
      padding: 6px 8px;
      border-radius: 2px;
      font-size: 0.9em;
    }
    .test-result.success {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
    }
    .test-result.error {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
    }
    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="field">
    <label>Provider</label>
    <select id="provider"></select>
  </div>

  <div class="field">
    <label>Model</label>
    <select id="model"></select>
  </div>

  <div class="field hidden" id="baseUrlField">
    <label>Server URL</label>
    <input type="text" id="baseUrl" />
  </div>

  <div class="field" id="keyField">
    <label>API Key</label>
    <div class="key-row">
      <span class="status-dot missing" id="keyDot"></span>
      <span class="key-label" id="keyLabel">Not set</span>
      <button id="setKeyBtn">Set Key</button>
    </div>
  </div>

  <div class="field">
    <button class="test-btn" id="testBtn">Test Connection</button>
    <div id="testResult"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const providerEl = document.getElementById('provider');
    const modelEl = document.getElementById('model');
    const baseUrlField = document.getElementById('baseUrlField');
    const baseUrlEl = document.getElementById('baseUrl');
    const keyField = document.getElementById('keyField');
    const keyDot = document.getElementById('keyDot');
    const keyLabel = document.getElementById('keyLabel');
    const setKeyBtn = document.getElementById('setKeyBtn');
    const testBtn = document.getElementById('testBtn');
    const testResultEl = document.getElementById('testResult');

    let currentState = null;

    providerEl.addEventListener('change', () => {
      vscode.postMessage({ type: 'providerChanged', provider: providerEl.value });
    });

    modelEl.addEventListener('change', () => {
      vscode.postMessage({ type: 'modelChanged', model: modelEl.value });
    });

    let baseUrlTimeout;
    baseUrlEl.addEventListener('input', () => {
      clearTimeout(baseUrlTimeout);
      baseUrlTimeout = setTimeout(() => {
        vscode.postMessage({ type: 'baseUrlChanged', baseUrl: baseUrlEl.value });
      }, 500);
    });

    setKeyBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'setApiKey' });
    });

    testBtn.addEventListener('click', () => {
      testBtn.disabled = true;
      testResultEl.className = '';
      testResultEl.replaceChildren();
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      testResultEl.appendChild(spinner);
      testResultEl.appendChild(document.createTextNode(' Testing...'));
      vscode.postMessage({ type: 'testConnection' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'state') {
        currentState = msg;

        // Populate providers
        providerEl.replaceChildren();
        msg.providers.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.label;
          if (p.id === msg.provider) opt.selected = true;
          providerEl.appendChild(opt);
        });

        // Populate models
        const providerDef = msg.providers.find((p) => p.id === msg.provider);
        modelEl.replaceChildren();

        let modelList = providerDef ? providerDef.models : [];
        if (msg.provider === 'ollama' && msg.ollamaModels.length > 0) {
          modelList = msg.ollamaModels;
        }

        if (modelList.length > 0) {
          modelList.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === msg.model) opt.selected = true;
            modelEl.appendChild(opt);
          });
        }

        // If current model is not in the list, add it
        if (msg.model && !modelList.includes(msg.model)) {
          const opt = document.createElement('option');
          opt.value = msg.model;
          opt.textContent = msg.model;
          opt.selected = true;
          modelEl.appendChild(opt);
        }

        // Base URL field
        if (providerDef && providerDef.baseUrlConfigurable) {
          baseUrlField.classList.remove('hidden');
          baseUrlEl.value = msg.baseUrl;
        } else {
          baseUrlField.classList.add('hidden');
        }

        // API key status
        if (providerDef && !providerDef.requiresApiKey) {
          keyField.classList.add('hidden');
        } else {
          keyField.classList.remove('hidden');
          if (msg.hasKey) {
            keyDot.className = 'status-dot ok';
            keyLabel.textContent = 'Configured';
            setKeyBtn.textContent = 'Change';
          } else {
            keyDot.className = 'status-dot missing';
            keyLabel.textContent = 'Not set';
            setKeyBtn.textContent = 'Set Key';
          }
        }

        // Clear test result on state change
        testResultEl.replaceChildren();
        testResultEl.className = '';
      }

      if (msg.type === 'testResult') {
        testBtn.disabled = false;
        testResultEl.replaceChildren();
        if (msg.success) {
          testResultEl.className = 'test-result success';
          testResultEl.textContent = '\\u2713 ' + msg.message;
        } else {
          testResultEl.className = 'test-result error';
          testResultEl.textContent = '\\u2717 ' + msg.message;
        }
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
