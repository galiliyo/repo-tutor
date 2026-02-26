// packages/vscode-extension/src/extension.ts

import * as vscode from 'vscode';
import { startLearningCommand } from './commands/startLearning';

export function activate(context: vscode.ExtensionContext) {
  console.log('Repo Tutor is now active');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'repo-tutor.startLearning',
      () => startLearningCommand(context)
    )
  );
}

export function deactivate() {}
