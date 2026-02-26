// packages/vscode-extension/src/commands/configureApiKey.ts

import * as vscode from 'vscode';
import { getSettings, setApiKey, getApiKey, LLMProvider } from '../settings';
import { configureLLM } from '../core-adapter';

export async function configureApiKeyCommand(context: vscode.ExtensionContext): Promise<boolean> {
  const settings = getSettings();

  // Let user pick provider
  const providerChoice = await vscode.window.showQuickPick(
    [
      { label: 'Anthropic (Claude)', value: 'anthropic' as LLMProvider, description: 'Recommended' },
      { label: 'OpenAI (GPT)', value: 'openai' as LLMProvider },
    ],
    { placeHolder: 'Select your LLM provider' }
  );

  if (!providerChoice) return false;

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
  configureLLM({
    provider: providerChoice.value,
    apiKey: apiKey.trim(),
    model: settings.model,
  });

  vscode.window.showInformationMessage(`API key saved for ${providerChoice.label}`);
  return true;
}
