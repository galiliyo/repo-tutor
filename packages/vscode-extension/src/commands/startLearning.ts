// packages/vscode-extension/src/commands/startLearning.ts

import * as vscode from 'vscode';
import { getCoreAdapter } from '../core-adapter';

export async function startLearningCommand(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Please open a folder to start learning');
    return;
  }

  // If multiple folders, let user pick
  let repoPath: string;
  if (workspaceFolders.length === 1) {
    repoPath = workspaceFolders[0].uri.fsPath;
  } else {
    const picked = await vscode.window.showQuickPick(
      workspaceFolders.map(f => ({
        label: f.name,
        description: f.uri.fsPath,
        folder: f
      })),
      { placeHolder: 'Select a folder to learn' }
    );
    if (!picked) return;
    repoPath = picked.folder.uri.fsPath;
  }

  vscode.window.showInformationMessage(`Starting Repo Tutor for: ${repoPath}`);

  // TODO: Check API key is configured
  // TODO: Show security config wizard
  // TODO: Run analysis with progress
  // TODO: Open webview panel
}
