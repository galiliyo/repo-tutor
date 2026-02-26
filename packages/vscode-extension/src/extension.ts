// packages/vscode-extension/src/extension.ts

import * as vscode from 'vscode';
import { startLearningCommand } from './commands/startLearning';
import { configureApiKeyCommand } from './commands/configureApiKey';

export function activate(context: vscode.ExtensionContext) {
  console.log('Repo Tutor is now active');

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
}

export function deactivate() {}
