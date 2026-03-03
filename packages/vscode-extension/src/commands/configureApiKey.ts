// packages/vscode-extension/src/commands/configureApiKey.ts

import * as vscode from 'vscode';
import { getSettings, setApiKey, getApiKey, LLMProvider } from '../settings';
import { configureLLM } from '../core-adapter';
import { getProvider } from '../providers/registry';

export async function configureApiKeyCommand(context: vscode.ExtensionContext): Promise<boolean> {
  const settings = getSettings();

  // Let user pick provider
  const providerChoice = await vscode.window.showQuickPick(
    [
      { label: 'Ollama (Local)', value: 'ollama' as LLMProvider, description: 'Free, runs locally' },
      { label: 'Anthropic (Claude)', value: 'anthropic' as LLMProvider, description: 'Recommended cloud option' },
      { label: 'OpenAI (GPT)', value: 'openai' as LLMProvider },
    ],
    { placeHolder: 'Select your LLM provider' }
  );

  if (!providerChoice) return false;

  // Handle Ollama separately (no API key needed)
  if (providerChoice.value === 'ollama') {
    const ollamaUrl = await vscode.window.showInputBox({
      prompt: 'Enter Ollama server URL',
      value: settings.ollamaUrl || 'http://localhost:11434',
      ignoreFocusOut: true,
    });

    if (!ollamaUrl) return false;

    const model = await vscode.window.showInputBox({
      prompt: 'Enter Ollama model name (e.g., llama3, mistral, codellama)',
      value: 'llama3',
      ignoreFocusOut: true,
    });

    if (!model) return false;

    // Update settings
    const config = vscode.workspace.getConfiguration('repoTutor');
    await config.update('llm.provider', 'ollama', true);
    await config.update('llm.ollamaUrl', ollamaUrl, true);
    await config.update('llm.model', model, true);

    // Configure the core
    configureLLM({
      provider: 'ollama',
      apiKey: 'ollama',
      model,
      baseUrl: `${ollamaUrl}/v1`,
    });

    vscode.window.showInformationMessage(`Configured Ollama at ${ollamaUrl} with model ${model}`);
    return true;
  }

  // Get existing key (masked)
  const existingKey = await getApiKey(context.secrets, providerChoice.value);
  const placeholder = existingKey ? '********' + existingKey.slice(-4) : 'Enter your API key';

  // Input API key
  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter your ${providerChoice.label} API key`,
    placeHolder: placeholder,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || value.trim().length < 10) {
        return 'API key seems too short';
      }
      return null;
    }
  });

  if (!apiKey) return false;

  // Save to secure storage
  await setApiKey(context.secrets, providerChoice.value, apiKey.trim());

  // Update settings if provider changed
  if (providerChoice.value !== settings.provider) {
    await vscode.workspace.getConfiguration('repoTutor').update('llm.provider', providerChoice.value, true);
  }

  // Configure the core with new key
  const providerDef = getProvider(providerChoice.value);
  configureLLM({
    provider: providerChoice.value,
    apiKey: apiKey.trim(),
    model: settings.model,
    baseUrl: providerDef?.baseUrl,
  });

  vscode.window.showInformationMessage(`API key saved for ${providerChoice.label}`);
  return true;
}
