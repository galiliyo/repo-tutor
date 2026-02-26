// packages/vscode-extension/src/extension.ts

import * as vscode from 'vscode';
import { startLearningCommand } from './commands/startLearning';
import { configureApiKeyCommand } from './commands/configureApiKey';
import { ChaptersTreeProvider } from './views';

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

  // Update current chapter
  chaptersTreeProvider.setCurrentChapter(chapterId);

  // TODO: Open main learning webview with this chapter
  vscode.window.showInformationMessage(`Selected chapter: ${chapter.title}`);
}

export function getChaptersTreeProvider(): ChaptersTreeProvider {
  return chaptersTreeProvider;
}

export function deactivate() {}
