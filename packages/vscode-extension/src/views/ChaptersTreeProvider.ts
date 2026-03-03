// packages/vscode-extension/src/views/ChaptersTreeProvider.ts

import * as vscode from 'vscode';
import { Chapter, AnalysisResult, SecurityConfig, UserContext, Track } from '@repo-tutor/core';

type ChapterStatus = 'locked' | 'available' | 'in-progress' | 'completed';

export interface ChapterProgress {
  status: ChapterStatus;
  startedAt?: string;
  completedAt?: string;
  quizScore?: number;
  questionsAsked: number;
}

export interface SessionProgress {
  [chapterId: string]: ChapterProgress;
}

export interface SessionState {
  repoPath: string;
  analysisResult: AnalysisResult;
  chapters: Chapter[];
  securityConfig: SecurityConfig;
  userContext: UserContext;
  currentChapterId: string | null;
  progress: SessionProgress;
  startedAt: string;
  detectedTracks: Track[];
  selectedTrackIds: string[];
  currentTrackId: string | null;
}

export class ChapterTreeItem extends vscode.TreeItem {
  constructor(
    public readonly chapter: Chapter,
    public readonly status: ChapterStatus
  ) {
    super(chapter.title, vscode.TreeItemCollapsibleState.None);

    this.id = chapter.id;
    this.description = this.getStatusLabel(status);
    this.iconPath = this.getStatusIcon(status);
    this.tooltip = this.getTooltip();

    // Only allow selection if not locked
    if (status !== 'locked') {
      this.command = {
        command: 'repo-tutor.selectChapter',
        title: 'Select Chapter',
        arguments: [chapter.id],
      };
    }

    this.contextValue = status;
  }

  private getStatusLabel(status: ChapterStatus): string {
    switch (status) {
      case 'locked':
        return '🔒';
      case 'available':
        return '';
      case 'in-progress':
        return '📖';
      case 'completed':
        return '✓';
    }
  }

  private getStatusIcon(status: ChapterStatus): vscode.ThemeIcon {
    switch (status) {
      case 'locked':
        return new vscode.ThemeIcon('lock');
      case 'available':
        return new vscode.ThemeIcon('circle-outline');
      case 'in-progress':
        return new vscode.ThemeIcon('book');
      case 'completed':
        return new vscode.ThemeIcon('check');
    }
  }

  private getTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${this.chapter.title}**\n\n`);
    md.appendMarkdown(`Focus: ${this.chapter.focus}\n\n`);

    if (this.chapter.learningObjectives.length > 0) {
      md.appendMarkdown(`**Objectives:**\n`);
      this.chapter.learningObjectives.forEach((obj) => {
        md.appendMarkdown(`- ${obj}\n`);
      });
    }

    if (this.chapter.prerequisites.length > 0) {
      md.appendMarkdown(`\n**Prerequisites:** ${this.chapter.prerequisites.join(', ')}`);
    }

    return md;
  }
}

class TrackTreeItem extends vscode.TreeItem {
  constructor(public readonly track: Track) {
    super(track.label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = track.description;
    this.contextValue = 'track';
  }
}

type TreeItem = ChapterTreeItem | TrackTreeItem;

export class ChaptersTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> =
    new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private session: SessionState | null = null;

  constructor(private context: vscode.ExtensionContext) {
    // Load session from workspace state
    this.loadSession();
  }

  private loadSession(): void {
    const stored = this.context.workspaceState.get<SessionState>('repoTutor.session');
    if (stored) {
      this.session = stored;
    }
  }

  refresh(): void {
    this.loadSession();
    this._onDidChangeTreeData.fire();
  }

  setSession(session: SessionState): void {
    this.session = session;
    this.context.workspaceState.update('repoTutor.session', session);
    this._onDidChangeTreeData.fire();
  }

  clearSession(): void {
    this.session = null;
    this.context.workspaceState.update('repoTutor.session', undefined);
    this._onDidChangeTreeData.fire();
  }

  getSession(): SessionState | null {
    return this.session;
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!this.session || !this.session.chapters) {
      return Promise.resolve([]);
    }

    // If multiple tracks, show track groups at top level
    if (!element && this.session.selectedTrackIds?.length > 1) {
      const trackItems = (this.session.detectedTracks || [])
        .filter(t => this.session!.selectedTrackIds.includes(t.id))
        .sort((a, b) => a.suggestedOrder - b.suggestedOrder)
        .map(t => new TrackTreeItem(t));
      return Promise.resolve(trackItems);
    }

    // Get chapters for the track (or all if single track / no element)
    const trackId = element instanceof TrackTreeItem ? element.track.id : null;
    const chapters = this.session.chapters
      .filter(ch => !trackId || ch.trackId === trackId)
      .sort((a, b) => a.order - b.order);

    return Promise.resolve(
      chapters.map(ch => new ChapterTreeItem(ch, this.getChapterStatus(ch)))
    );
  }

  private getChapterStatus(chapter: Chapter): ChapterStatus {
    if (!this.session?.progress) {
      // No progress tracked yet - first chapter is available, rest locked
      return chapter.order === 1 ? 'available' : 'locked';
    }

    const chapterProgress = this.session.progress[chapter.id];
    if (chapterProgress) {
      return chapterProgress.status;
    }

    // Check prerequisites
    const prereqsMet = chapter.prerequisites.every((prereqId) => {
      const prereqProgress = this.session!.progress[prereqId];
      return prereqProgress?.status === 'completed';
    });

    return prereqsMet ? 'available' : 'locked';
  }

  updateProgress(chapterId: string, status: ChapterStatus): void {
    if (!this.session) return;

    if (!this.session.progress) {
      this.session.progress = {};
    }

    this.session.progress[chapterId] = {
      ...this.session.progress[chapterId],
      status,
      startedAt:
        status === 'in-progress'
          ? new Date().toISOString()
          : this.session.progress[chapterId]?.startedAt,
      completedAt:
        status === 'completed'
          ? new Date().toISOString()
          : undefined,
      questionsAsked: this.session.progress[chapterId]?.questionsAsked || 0,
    };

    this.context.workspaceState.update('repoTutor.session', this.session);
    this._onDidChangeTreeData.fire();
  }

  setCurrentChapter(chapterId: string): void {
    if (!this.session) return;

    this.session.currentChapterId = chapterId;
    this.updateProgress(chapterId, 'in-progress');
  }
}
