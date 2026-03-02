import * as vscode from 'vscode';
import type { LLMProvider } from '@repo-tutor/core';
import { getSecretKey, getProvider } from './providers/registry';

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
