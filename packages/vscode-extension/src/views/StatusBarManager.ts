import * as vscode from 'vscode';
import { getSettings, hasApiKey } from '../settings';
import { getProvider } from '../providers/registry';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private secrets: vscode.SecretStorage;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'repo-tutor.chapters.focus';
    this.refresh();
    this.item.show();
  }

  async refresh(): Promise<void> {
    const settings = getSettings();
    const providerDef = getProvider(settings.provider);
    const keyOk = await hasApiKey(this.secrets, settings.provider);

    if (!keyOk) {
      this.item.text = '$(warning) No API key';
      this.item.tooltip = `Repo Tutor: ${providerDef?.label ?? settings.provider} - API key not configured`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.text = `$(plug) ${settings.model}`;
      this.item.tooltip = `Repo Tutor: ${providerDef?.label ?? settings.provider} - ${settings.model}`;
      this.item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
