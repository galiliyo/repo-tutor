# Model Configuration Panel Design

## Problem

The current model configuration UX is a multi-step quick-pick flow that gives no feedback about connection status. Users can't tell at a glance which provider/model is active or whether their API key works. The provider list is hardcoded and difficult to extend.

## Solution

A persistent sidebar webview + status bar item for model configuration, backed by a data-driven provider registry.

## Provider Registry

Data-driven provider definitions. Adding a new provider = adding an entry, no UI changes.

```ts
interface ProviderDefinition {
  id: string;                          // e.g. 'openai', 'groq'
  label: string;                       // e.g. 'OpenAI'
  requiresApiKey: boolean;
  defaultModel: string;
  models: string[];                    // curated presets (Ollama: auto-detect from /api/tags)
  apiCompatibility: 'openai' | 'anthropic'; // which SDK to route through
  baseUrl?: string;                    // for OpenAI-compatible providers
  baseUrlConfigurable: boolean;        // e.g. true for Ollama
}
```

### Initial Providers

| Provider    | Key? | Default model                           | API compat | Base URL                         |
|-------------|:----:|-----------------------------------------|------------|----------------------------------|
| Anthropic   | Yes  | claude-sonnet-4-5-20250929              | anthropic  | (default SDK)                    |
| OpenAI      | Yes  | gpt-4o                                  | openai     | (default SDK)                    |
| Gemini      | Yes  | gemini-2.0-flash                        | openai     | https://generativelanguage.googleapis.com/v1beta/openai |
| OpenRouter  | Yes  | anthropic/claude-sonnet-4-5-20250929    | openai     | https://openrouter.ai/api/v1    |
| Groq        | Yes  | llama-3.3-70b-versatile                 | openai     | https://api.groq.com/openai/v1  |
| Ollama      | No   | (auto-detect first available)           | openai     | http://localhost:11434/v1        |

## UI Components

### Sidebar WebviewView (`repo-tutor.modelConfig`)

Registered in the `repo-tutor` activity bar container, above the Chapters tree view.

Layout (top to bottom):
1. **Provider dropdown** — populated from registry
2. **Model dropdown** — curated presets per provider; Ollama auto-detects from `/api/tags`
3. **API Key row** — green/red status dot + "Set Key" / "Change Key" button (hidden for Ollama)
4. **Base URL field** — shown only for providers with `baseUrlConfigurable: true` (Ollama)
5. **Test Connection button** — sends minimal prompt "Say ok" via `LLMClient.validateApiKey()` → spinner → `✓ Connected (340ms)` or `✗ <error message>`

### Status Bar Item

- Position: left side of status bar
- Format: `$(plug) gpt-4o ✓` or `$(warning) No API key`
- Click action: focuses the sidebar model config view

## Persistence

- Provider, model, base URLs → VS Code **global** settings (`ConfigurationTarget.Global`)
- API keys → `SecretStorage` (already global, per-provider keys)
- Settings survive across workspaces and sessions

## Data Flow

1. User changes provider/model in sidebar webview
2. Webview posts message to extension
3. Extension updates VS Code global settings + SecretStorage
4. Extension calls `configureLLM()` to update the core's `LLMConfig`
5. Status bar item refreshes to reflect new state
6. On "Test Connection": extension calls `LLMClient.validateApiKey()` and posts result back to webview

## Files to Create/Modify

### New files
- `packages/vscode-extension/src/providers/registry.ts` — provider definitions
- `packages/vscode-extension/src/views/ModelConfigView.ts` — WebviewViewProvider
- `packages/vscode-extension/src/views/StatusBarManager.ts` — status bar item

### Modified files
- `packages/core/src/types/config.ts` — expand `LLMProvider` union type
- `packages/core/src/generation/llm-client.ts` — route new providers through OpenAI client with custom baseURL
- `packages/vscode-extension/src/settings.ts` — support new providers, fix default mismatch, global settings
- `packages/vscode-extension/src/extension.ts` — register new view + status bar
- `packages/vscode-extension/package.json` — add webview view contribution, status bar contribution

### Kept as-is
- `configureApiKey` command — remains as command-palette fallback
- `SecretStorage` key management — reused for all providers
- `LLMClient.validateApiKey()` — reused for connection test

## Non-Goals

- Provider-specific settings beyond model/key/URL (temperature, max tokens stay in code defaults)
- Model parameter tuning UI (future feature)
- Streaming support
