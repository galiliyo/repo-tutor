// packages/vscode-extension/src/settings.ts

import * as vscode from 'vscode';

const SECRET_KEY_OPENAI = 'repo-tutor.openai.apiKey';
const SECRET_KEY_ANTHROPIC = 'repo-tutor.anthropic.apiKey';

export type LLMProvider = 'openai' | 'anthropic';

export interface ExtensionSettings {
  provider: LLMProvider;
  model: string;
}

export function getSettings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration('repoTutor');
  return {
    provider: config.get<LLMProvider>('llm.provider', 'anthropic'),
    model: config.get<string>('llm.model', 'claude-3-5-sonnet-20241022'),
  };
}

export async function getApiKey(secrets: vscode.SecretStorage, provider: LLMProvider): Promise<string | undefined> {
  const key = provider === 'openai' ? SECRET_KEY_OPENAI : SECRET_KEY_ANTHROPIC;
  return secrets.get(key);
}

export async function setApiKey(secrets: vscode.SecretStorage, provider: LLMProvider, apiKey: string): Promise<void> {
  const key = provider === 'openai' ? SECRET_KEY_OPENAI : SECRET_KEY_ANTHROPIC;
  await secrets.store(key, apiKey);
}

export async function deleteApiKey(secrets: vscode.SecretStorage, provider: LLMProvider): Promise<void> {
  const key = provider === 'openai' ? SECRET_KEY_OPENAI : SECRET_KEY_ANTHROPIC;
  await secrets.delete(key);
}

export async function hasApiKey(secrets: vscode.SecretStorage, provider?: LLMProvider): Promise<boolean> {
  const p = provider || getSettings().provider;
  const key = await getApiKey(secrets, p);
  return !!key;
}
