# Model Configuration Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent sidebar webview + status bar for model configuration with a data-driven provider registry supporting Anthropic, OpenAI, Gemini, OpenRouter, Groq, and Ollama.

**Architecture:** Provider registry defines all providers as data. The sidebar WebviewView reads the registry and renders a config form. Changes flow through VS Code global settings + SecretStorage, update the core LLMClient, and refresh the status bar. New providers = new registry entry, no UI changes.

**Tech Stack:** VS Code WebviewViewProvider, VS Code SecretStorage, existing OpenAI + Anthropic SDKs, esbuild bundling.

---

### Task 1: Expand LLMProvider type in core

**Files:**
- Modify: `packages/core/src/types/config.ts:7`

**Step 1: Update the LLMProvider union type**

In `packages/core/src/types/config.ts`, change line 7 from:

```ts
export type LLMProvider = 'openai' | 'anthropic' | 'ollama';
```

to:

```ts
export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'gemini' | 'openrouter' | 'groq';
```

**Step 2: Run existing tests to confirm nothing breaks**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All tests pass. The new union members are additive.

**Step 3: Commit**

```bash
git add packages/core/src/types/config.ts
git commit -m "feat(core): expand LLMProvider type with gemini, openrouter, groq"
```

---

### Task 2: Route new providers through OpenAI client in LLMClient

**Files:**
- Modify: `packages/core/src/generation/llm-client.ts:24-37` (setConfig method)
- Modify: `packages/core/src/generation/llm-client.ts:45-49` (complete method)
- Test: `packages/core/src/generation/__tests__/llm-client.test.ts` (new file)

**Step 1: Write the failing test**

Create `packages/core/src/generation/__tests__/llm-client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { LLMClient } from '../llm-client';

describe('LLMClient', () => {
  describe('setConfig', () => {
    it('should configure OpenAI-compatible providers with custom baseURL', () => {
      const client = new LLMClient();

      // Groq is OpenAI-compatible
      client.setConfig({
        provider: 'groq',
        apiKey: 'test-key',
        model: 'llama-3.3-70b-versatile',
        baseUrl: 'https://api.groq.com/openai/v1',
      });

      // Should not throw when provider is recognized
      expect(() =>
        client.setConfig({
          provider: 'gemini',
          apiKey: 'test-key',
          model: 'gemini-2.0-flash',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        })
      ).not.toThrow();

      expect(() =>
        client.setConfig({
          provider: 'openrouter',
          apiKey: 'test-key',
          model: 'anthropic/claude-sonnet-4-5-20250929',
          baseUrl: 'https://openrouter.ai/api/v1',
        })
      ).not.toThrow();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @repo-tutor/core test -- --run packages/core/src/generation/__tests__/llm-client.test.ts`
Expected: FAIL — `setConfig` doesn't handle 'groq', 'gemini', or 'openrouter' providers.

**Step 3: Update setConfig to route new providers through OpenAI client**

In `packages/core/src/generation/llm-client.ts`, replace the `setConfig` method body:

```ts
setConfig(config: LLMConfig): void {
  this.config = config;

  if (config.provider === 'anthropic') {
    this.anthropic = new Anthropic({ apiKey: config.apiKey });
    this.openai = null;
  } else if (config.provider === 'openai') {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.anthropic = null;
  } else {
    // All other providers (ollama, gemini, openrouter, groq) use OpenAI-compatible API
    this.openai = new OpenAI({
      apiKey: config.provider === 'ollama' ? 'ollama' : config.apiKey,
      baseURL: config.baseUrl,
    });
    this.anthropic = null;
  }
}
```

Also update the `complete` method to route all non-anthropic providers through OpenAI:

```ts
async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
  if (!this.config) {
    throw new Error('LLM config not set');
  }

  if (this.config.provider === 'anthropic') {
    return this.completeAnthropic(prompt, systemPrompt);
  }

  return this.completeOpenAI(prompt, systemPrompt);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @repo-tutor/core test -- --run packages/core/src/generation/__tests__/llm-client.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add packages/core/src/generation/llm-client.ts packages/core/src/generation/__tests__/llm-client.test.ts
git commit -m "feat(core): route gemini/openrouter/groq through OpenAI-compatible client"
```

---

### Task 3: Create provider registry

**Files:**
- Create: `packages/vscode-extension/src/providers/registry.ts`

**Step 1: Create the provider registry**

Create `packages/vscode-extension/src/providers/registry.ts`:

```ts
import type { LLMProvider } from '@repo-tutor/core';

export interface ProviderDefinition {
  id: LLMProvider;
  label: string;
  requiresApiKey: boolean;
  defaultModel: string;
  models: string[];
  apiCompatibility: 'openai' | 'anthropic';
  baseUrl?: string;
  baseUrlConfigurable: boolean;
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    requiresApiKey: true,
    defaultModel: 'claude-sonnet-4-5-20250929',
    models: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022'],
    apiCompatibility: 'anthropic',
    baseUrlConfigurable: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    requiresApiKey: true,
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    apiCompatibility: 'openai',
    baseUrlConfigurable: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    requiresApiKey: true,
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
    apiCompatibility: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseUrlConfigurable: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    requiresApiKey: true,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    models: [
      'anthropic/claude-sonnet-4-5-20250929',
      'google/gemini-2.0-flash-001',
      'deepseek/deepseek-chat-v3-0324',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    apiCompatibility: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    baseUrlConfigurable: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    requiresApiKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    apiCompatibility: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    baseUrlConfigurable: false,
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    requiresApiKey: false,
    defaultModel: 'llama3',
    models: [], // auto-detected at runtime
    apiCompatibility: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    baseUrlConfigurable: true,
  },
];

export function getProvider(id: LLMProvider): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getSecretKey(providerId: LLMProvider): string {
  return `repo-tutor.${providerId}.apiKey`;
}
```

**Step 2: Build to check for compile errors**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/vscode-extension/src/providers/registry.ts
git commit -m "feat(vscode): add data-driven provider registry"
```

---

### Task 4: Update settings.ts for new providers and global persistence

**Files:**
- Modify: `packages/vscode-extension/src/settings.ts`

**Step 1: Rewrite settings.ts**

Replace the entire contents of `packages/vscode-extension/src/settings.ts`:

```ts
import * as vscode from 'vscode';
import type { LLMProvider } from '@repo-tutor/core';
import { getSecretKey, getProvider, PROVIDER_REGISTRY } from './providers/registry';

export type { LLMProvider };

export interface ExtensionSettings {
  provider: LLMProvider;
  model: string;
  ollamaUrl: string;
}

export function getSettings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration('repoTutor');
  const provider = config.get<LLMProvider>('llm.provider', 'ollama');
  const providerDef = getProvider(provider);
  return {
    provider,
    model: config.get<string>('llm.model', providerDef?.defaultModel ?? 'llama3'),
    ollamaUrl: config.get<string>('llm.ollamaUrl', 'http://localhost:11434'),
  };
}

export async function updateSettings(
  settings: Partial<ExtensionSettings>
): Promise<void> {
  const config = vscode.workspace.getConfiguration('repoTutor');
  if (settings.provider !== undefined) {
    await config.update('llm.provider', settings.provider, vscode.ConfigurationTarget.Global);
  }
  if (settings.model !== undefined) {
    await config.update('llm.model', settings.model, vscode.ConfigurationTarget.Global);
  }
  if (settings.ollamaUrl !== undefined) {
    await config.update('llm.ollamaUrl', settings.ollamaUrl, vscode.ConfigurationTarget.Global);
  }
}

export async function getApiKey(
  secrets: vscode.SecretStorage,
  provider: LLMProvider
): Promise<string | undefined> {
  const providerDef = getProvider(provider);
  if (providerDef && !providerDef.requiresApiKey) {
    return 'ollama';
  }
  return secrets.get(getSecretKey(provider));
}

export async function setApiKey(
  secrets: vscode.SecretStorage,
  provider: LLMProvider,
  apiKey: string
): Promise<void> {
  const providerDef = getProvider(provider);
  if (providerDef && !providerDef.requiresApiKey) {
    return;
  }
  await secrets.store(getSecretKey(provider), apiKey);
}

export async function deleteApiKey(
  secrets: vscode.SecretStorage,
  provider: LLMProvider
): Promise<void> {
  const providerDef = getProvider(provider);
  if (providerDef && !providerDef.requiresApiKey) {
    return;
  }
  await secrets.delete(getSecretKey(provider));
}

export async function hasApiKey(
  secrets: vscode.SecretStorage,
  provider?: LLMProvider
): Promise<boolean> {
  const p = provider || getSettings().provider;
  const providerDef = getProvider(p);
  if (providerDef && !providerDef.requiresApiKey) {
    return true;
  }
  const key = await getApiKey(secrets, p);
  return !!key;
}
```

**Step 2: Build to check for compile errors**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds. The public API of settings.ts is unchanged so existing callers still work.

**Step 3: Commit**

```bash
git add packages/vscode-extension/src/settings.ts
git commit -m "feat(vscode): update settings for new providers and global persistence"
```

---

### Task 5: Update package.json contributions

**Files:**
- Modify: `packages/vscode-extension/package.json`

**Step 1: Add new providers to the enum in configuration**

In `packages/vscode-extension/package.json`, update the `repoTutor.llm.provider` configuration to include new providers:

```json
"repoTutor.llm.provider": {
  "type": "string",
  "default": "ollama",
  "enum": [
    "anthropic",
    "openai",
    "gemini",
    "openrouter",
    "groq",
    "ollama"
  ],
  "enumDescriptions": [
    "Anthropic Claude",
    "OpenAI GPT",
    "Google Gemini",
    "OpenRouter (multi-provider)",
    "Groq (fast inference)",
    "Ollama (Local, Free)"
  ],
  "description": "LLM provider to use"
}
```

**Step 2: Add the ModelConfig webview view above Chapters**

In the `"views"` section under `"repo-tutor"`, add the model config view *before* the chapters view:

```json
"views": {
  "repo-tutor": [
    {
      "type": "webview",
      "id": "repo-tutor.modelConfig",
      "name": "Model"
    },
    {
      "id": "repo-tutor.chapters",
      "name": "Chapters"
    }
  ]
}
```

**Step 3: Build to check**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/vscode-extension/package.json
git commit -m "feat(vscode): add model config webview view and new provider enums"
```

---

### Task 6: Create StatusBarManager

**Files:**
- Create: `packages/vscode-extension/src/views/StatusBarManager.ts`
- Modify: `packages/vscode-extension/src/views/index.ts`

**Step 1: Create StatusBarManager**

Create `packages/vscode-extension/src/views/StatusBarManager.ts`:

```ts
import * as vscode from 'vscode';
import { getSettings, hasApiKey } from '../settings';
import { getProvider } from '../providers/registry';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private secrets: vscode.SecretStorage;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'repo-tutor.modelConfig.focus';
    this.refresh();
    this.item.show();
  }

  async refresh(): Promise<void> {
    const settings = getSettings();
    const providerDef = getProvider(settings.provider);
    const keyOk = await hasApiKey(this.secrets, settings.provider);

    if (!keyOk) {
      this.item.text = '$(warning) No API key';
      this.item.tooltip = `Repo Tutor: ${providerDef?.label ?? settings.provider} - API key not configured`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.text = `$(plug) ${settings.model}`;
      this.item.tooltip = `Repo Tutor: ${providerDef?.label ?? settings.provider} - ${settings.model}`;
      this.item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
```

**Step 2: Export from views/index.ts**

Add to `packages/vscode-extension/src/views/index.ts`:

```ts
export { StatusBarManager } from './StatusBarManager';
```

**Step 3: Build to check**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/vscode-extension/src/views/StatusBarManager.ts packages/vscode-extension/src/views/index.ts
git commit -m "feat(vscode): add status bar manager for model connection status"
```

---

### Task 7: Create ModelConfigView (sidebar webview)

**Files:**
- Create: `packages/vscode-extension/src/views/ModelConfigView.ts`
- Modify: `packages/vscode-extension/src/views/index.ts`

This is the largest task. The webview shows provider/model selectors, API key status, and a test connection button.

**Step 1: Create ModelConfigView**

Create `packages/vscode-extension/src/views/ModelConfigView.ts`:

```ts
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
          testResultEl.textContent = '\u2713 ' + msg.message;
        } else {
          testResultEl.className = 'test-result error';
          testResultEl.textContent = '\u2717 ' + msg.message;
        }
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
```

**Step 2: Export from views/index.ts**

Add to `packages/vscode-extension/src/views/index.ts`:

```ts
export { ModelConfigView } from './ModelConfigView';
```

**Step 3: Build to check**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/vscode-extension/src/views/ModelConfigView.ts packages/vscode-extension/src/views/index.ts
git commit -m "feat(vscode): add model configuration sidebar webview"
```

---

### Task 8: Wire everything together in extension.ts

**Files:**
- Modify: `packages/vscode-extension/src/extension.ts`

**Step 1: Register ModelConfigView and StatusBarManager**

Replace the contents of `packages/vscode-extension/src/extension.ts`:

```ts
import * as vscode from 'vscode';
import { startLearningCommand } from './commands/startLearning';
import { configureApiKeyCommand } from './commands/configureApiKey';
import { ChaptersTreeProvider, LearningPanel, ModelConfigView, StatusBarManager } from './views';

let chaptersTreeProvider: ChaptersTreeProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('Repo Tutor is now active');

  // Initialize tree view provider
  chaptersTreeProvider = new ChaptersTreeProvider(context);

  // Register tree view
  const chaptersTreeView = vscode.window.createTreeView('repo-tutor.chapters', {
    treeDataProvider: chaptersTreeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(chaptersTreeView);

  // Register model config sidebar view
  const modelConfigView = new ModelConfigView(context.extensionUri, context.secrets);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ModelConfigView.viewType, modelConfigView)
  );

  // Register status bar
  const statusBar = new StatusBarManager(context.secrets);
  modelConfigView.setStatusBar(statusBar);
  context.subscriptions.push(statusBar);

  // Refresh status bar when settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('repoTutor')) {
        statusBar.refresh();
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'repo-tutor.startLearning',
      () => startLearningCommand(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'repo-tutor.configureApiKey',
      () => configureApiKeyCommand(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'repo-tutor.refreshChapters',
      () => chaptersTreeProvider.refresh()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'repo-tutor.selectChapter',
      (chapterId: string) => selectChapterCommand(chapterId, context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'repo-tutor.clearSession',
      () => {
        chaptersTreeProvider.clearSession();
        vscode.window.showInformationMessage('Learning session cleared');
      }
    )
  );
}

async function selectChapterCommand(chapterId: string, context: vscode.ExtensionContext) {
  const session = chaptersTreeProvider.getSession();
  if (!session) {
    vscode.window.showWarningMessage('No active learning session');
    return;
  }

  const chapter = session.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    vscode.window.showErrorMessage(`Chapter not found: ${chapterId}`);
    return;
  }

  chaptersTreeProvider.setCurrentChapter(chapterId);

  const panel = LearningPanel.show(context.extensionUri, session);
  panel.loadChapter(chapterId);
}

export function getChaptersTreeProvider(): ChaptersTreeProvider {
  return chaptersTreeProvider;
}

export function deactivate() {}
```

**Step 2: Build the extension**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds.

**Step 3: Manual test (F5)**

1. Press F5 to launch Extension Development Host
2. Verify: Repo Tutor icon appears in activity bar
3. Click it: "Model" view should appear above "Chapters"
4. Provider dropdown should list all 6 providers
5. Status bar should show model status on the left
6. Try "Test Connection" with Ollama or a cloud key

**Step 4: Commit**

```bash
git add packages/vscode-extension/src/extension.ts
git commit -m "feat(vscode): wire model config view and status bar into extension"
```

---

### Task 9: End-to-end verification and cleanup

**Files:**
- Check all modified files compile
- Verify `configureApiKey` command still works as fallback

**Step 1: Full build**

Run: `pnpm --filter repo-tutor build`
Expected: Build succeeds.

**Step 2: Run core tests**

Run: `pnpm --filter @repo-tutor/core test`
Expected: All tests pass.

**Step 3: Manual E2E test**

In the Extension Development Host:
1. Open the Repo Tutor sidebar
2. Select "Anthropic" from the provider dropdown
3. Click "Set Key", enter a key
4. Click "Test Connection" — verify green checkmark
5. Switch to "Ollama" — verify model dropdown auto-populates (if Ollama running)
6. Switch to "Groq" — verify it asks for a key
7. Check status bar updates on each change
8. Run "Repo Tutor: Start Learning" — verify it uses the selected provider

**Step 4: Commit any fixes from testing**

```bash
git add -u
git commit -m "fix(vscode): address issues found in e2e testing"
```
