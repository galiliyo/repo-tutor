// packages/vscode-extension/src/commands/startLearning.ts

import * as vscode from 'vscode';
import { getCoreAdapter, getDefaultUserContext } from '../core-adapter';
import { getSettings, getApiKey, hasApiKey } from '../settings';
import { SecurityConfigPanel, LearningPanel } from '../views';
import { configureApiKeyCommand } from './configureApiKey';
import { getChaptersTreeProvider } from '../extension';

export async function startLearningCommand(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Please open a folder to start learning');
    return;
  }

  // Check API key is configured
  const settings = getSettings();
  if (!await hasApiKey(context.secrets)) {
    const configure = await vscode.window.showWarningMessage(
      'No API key configured. Would you like to configure one now?',
      'Configure API Key',
      'Cancel'
    );

    if (configure === 'Configure API Key') {
      const success = await configureApiKeyCommand(context);
      if (!success) return;
    } else {
      return;
    }
  }

  // Configure LLM with stored API key
  const apiKey = await getApiKey(context.secrets, settings.provider);
  if (apiKey) {
    getCoreAdapter().setLLMConfig({
      provider: settings.provider,
      apiKey,
      model: settings.model,
    });
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

  // Show security config wizard
  const securityResult = await SecurityConfigPanel.show(context.extensionUri);

  if (!securityResult.confirmed || !securityResult.config) {
    vscode.window.showInformationMessage('Learning session cancelled');
    return;
  }

  // Run analysis with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Repo Tutor',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Analyzing codebase...', increment: 0 });

      try {
        const core = getCoreAdapter();
        const analysisResult = await core.analyze(repoPath, securityResult.config!);

        progress.report({ message: 'Planning chapters...', increment: 50 });

        const userContext = getDefaultUserContext();
        const chapters = await core.planChapters(analysisResult, userContext);

        progress.report({ message: 'Opening tutorial...', increment: 90 });

        // Store session state via tree provider
        const session = {
          repoPath,
          analysisResult,
          chapters,
          securityConfig: securityResult.config,
          userContext,
          currentChapterId: chapters.length > 0 ? chapters[0].id : null,
          progress: {},
          startedAt: new Date().toISOString(),
        };

        const treeProvider = getChaptersTreeProvider();
        treeProvider.setSession(session as any);

        // Show success and refresh chapters view
        vscode.window.showInformationMessage(
          `Found ${chapters.length} chapters to learn about ${analysisResult.languages.join(', ')} codebase`
        );

        // Reveal the chapters sidebar
        vscode.commands.executeCommand('repo-tutor.chapters.focus');

        // Open learning panel with first chapter
        if (chapters.length > 0) {
          const panel = LearningPanel.show(context.extensionUri, session as any);
          panel.loadChapter(chapters[0].id);
        }

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Analysis failed: ${message}`);
      }
    }
  );
}
