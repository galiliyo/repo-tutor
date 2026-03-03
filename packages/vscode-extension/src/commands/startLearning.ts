// packages/vscode-extension/src/commands/startLearning.ts

import * as vscode from 'vscode';
import type { Track } from '@repo-tutor/core';
import { getCoreAdapter, getDefaultUserContext } from '../core-adapter';
import { getSettings, getApiKey, hasApiKey } from '../settings';
import { getProvider } from '../providers/registry';
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
    const providerDef = getProvider(settings.provider);
    const baseUrl = settings.provider === 'ollama'
      ? settings.ollamaUrl + '/v1'
      : providerDef?.baseUrl;
    getCoreAdapter().setLLMConfig({
      provider: settings.provider,
      apiKey,
      model: settings.model,
      baseUrl,
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

  // Step 1: Analyze with progress
  const core = getCoreAdapter();
  const userContext = getDefaultUserContext();

  let analysisResult: Awaited<ReturnType<typeof core.analyze>> | undefined;

  try {
    analysisResult = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Repo Tutor',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Analyzing codebase...', increment: 0 });
        return core.analyze(repoPath, securityResult.config!);
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Analysis failed: ${message}`);
    return;
  }

  // Step 2: Track selection QuickPick (outside progress)
  const detectedTracks: Track[] = analysisResult.detectedTracks || [];

  const trackItems = detectedTracks
    .sort((a, b) => a.suggestedOrder - b.suggestedOrder)
    .map(t => ({
      label: t.label,
      description: `${Math.round(t.confidence * 100)}% match`,
      detail: t.description,
      picked: t.confidence >= 0.3,
      track: t,
    }));

  const selectedItems = await vscode.window.showQuickPick(trackItems, {
    title: 'Select Learning Tracks',
    placeHolder: 'Choose which parts of the codebase to learn',
    canPickMany: true,
  });

  if (!selectedItems || selectedItems.length === 0) {
    vscode.window.showInformationMessage('No tracks selected, session cancelled');
    return;
  }

  const selectedTracks = selectedItems.map(item => item.track);

  // Step 3: Plan chapters per track with progress
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Repo Tutor',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Planning chapters...', increment: 50 });

        const allChapters: Awaited<ReturnType<typeof core.planChapters>> = [];
        for (const track of selectedTracks) {
          const trackChapters = await core.planChapters(analysisResult!, userContext, track);
          trackChapters.forEach(ch => { ch.trackId = track.id; });
          allChapters.push(...trackChapters);
        }

        progress.report({ message: 'Opening tutorial...', increment: 90 });

        // Store session state via tree provider
        const session = {
          repoPath,
          analysisResult: analysisResult!,
          chapters: allChapters,
          securityConfig: securityResult.config,
          userContext,
          currentChapterId: allChapters.length > 0 ? allChapters[0].id : null,
          currentTrackId: selectedTracks.length > 0 ? selectedTracks[0].id : null,
          progress: {},
          startedAt: new Date().toISOString(),
          detectedTracks: detectedTracks,
          selectedTrackIds: selectedTracks.map(t => t.id),
        };

        const treeProvider = getChaptersTreeProvider();
        treeProvider.setSession(session);

        // Show success and refresh chapters view
        vscode.window.showInformationMessage(
          `Found ${allChapters.length} chapters across ${selectedTracks.length} track(s)`
        );

        // Reveal the chapters sidebar
        vscode.commands.executeCommand('repo-tutor.chapters.focus');

        // Open learning panel with first chapter
        if (allChapters.length > 0) {
          const panel = LearningPanel.show(context.extensionUri, session);
          panel.loadChapter(allChapters[0].id);
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Planning failed: ${message}`);
  }
}
