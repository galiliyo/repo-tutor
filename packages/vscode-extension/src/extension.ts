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
