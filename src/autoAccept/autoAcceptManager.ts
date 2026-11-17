import * as vscode from 'vscode';
import { IDEAdapter } from '../integrations/ideAdapter';
import { AntigravityAdapter } from '../integrations/antigravityAdapter';
import { VSCodeAdapter } from '../integrations/vscodeAdapter';

export interface AutoAcceptStatus {
  enabled: boolean;
  autoConfirmSteps: boolean;
  autoAcceptDiffs: boolean;
  adapterName: string;
  totalAcceptedCount: number;
  lastAcceptedTime: Date | null;
  lastMessage: string;
}

export class AutoAcceptManager implements vscode.Disposable {
  private isEnabled = true;
  private autoConfirmSteps = true;
  private autoAcceptDiffs = false;
  private delayMs = 500;
  private adapter: IDEAdapter;
  private totalAcceptedCount = 0;
  private lastAcceptedTime: Date | null = null;
  private lastMessage = 'Ready (Intermediate popups auto-bypassed)';

  private debounceTimer: NodeJS.Timeout | null = null;
  private disposables: vscode.Disposable[] = [];

  private readonly _onDidChangeStatus = new vscode.EventEmitter<AutoAcceptStatus>();
  public readonly onDidChangeStatus = this._onDidChangeStatus.event;

  constructor() {
    this.adapter = new VSCodeAdapter();
    this.loadConfiguration();
  }

  public async initialize(): Promise<void> {
    const antigravityAdapter = new AntigravityAdapter();
    if (await antigravityAdapter.isDetected()) {
      this.adapter = antigravityAdapter;
      // Proactively ensure Antigravity IDE state has Turbo auto-execution for tool commands
      try {
        await antigravityAdapter.syncNativeConfig();
      } catch (err) {
        console.warn('[Z-Accept] Antigravity config sync notice:', err);
      }
    } else {
      this.adapter = new VSCodeAdapter();
    }

    this.registerEventListeners();
    this.notifyStatusChange();
  }

  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('zAccept');
    this.isEnabled = config.get<boolean>('autoAccept.enabled', true);
    this.autoConfirmSteps = config.get<boolean>('autoConfirmSteps', true);
    this.autoAcceptDiffs = config.get<boolean>('autoAcceptDiffs', false);
    this.delayMs = config.get<number>('autoAccept.delayMs', 500);
  }

  private registerEventListeners(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('zAccept')) {
          this.loadConfiguration();
          this.notifyStatusChange();
        }
      })
    );

    // Watch document changes: only trigger diff acceptance if autoAcceptDiffs is explicitly enabled
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!this.isEnabled || !this.autoAcceptDiffs) {
          return;
        }

        const scheme = e.document.uri.scheme;
        if (scheme === 'output' || scheme === 'vscode-log') {
          return;
        }

        this.scheduleAutoAccept();
      })
    );

    if (vscode.window.onDidChangeActiveTextEditor) {
      this.disposables.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
          if (this.isEnabled && this.autoAcceptDiffs) {
            this.scheduleAutoAccept();
          }
        })
      );
    }
  }

  private scheduleAutoAccept(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      await this.tryAcceptChanges(false, this.autoAcceptDiffs);
    }, this.delayMs);
  }

  /**
   * Attempts to accept pending actions based on options.
   */
  public async tryAcceptChanges(silent = false, allowDiffs = false): Promise<boolean> {
    if (!this.isEnabled) {
      return false;
    }

    try {
      const result = await this.adapter.acceptChanges({
        allowStepPrompts: this.autoConfirmSteps,
        allowDiffs: allowDiffs && this.autoAcceptDiffs
      });

      if (result.success && result.handledCount > 0) {
        this.totalAcceptedCount += result.handledCount;
        this.lastAcceptedTime = new Date();
        this.lastMessage = result.message;
        this.notifyStatusChange();

        if (!silent) {
          vscode.window.setStatusBarMessage(`$(check) Z-Accept: ${result.message}`, 3000);
        }
        return true;
      }
    } catch (err: any) {
      this.lastMessage = `Check: ${err.message || err}`;
    }

    return false;
  }

  /**
   * Manual user invocation command: accepts ALL pending changes (prompts + code diffs) immediately.
   */
  public async acceptPendingNow(): Promise<void> {
    const result = await this.adapter.acceptChanges({
      allowStepPrompts: true,
      allowDiffs: true
    });

    if (result.success) {
      this.totalAcceptedCount += result.handledCount;
      this.lastAcceptedTime = new Date();
      this.lastMessage = result.message;
      this.notifyStatusChange();
      vscode.window.showInformationMessage(`Z-Accept: ${result.message}`);
    } else {
      vscode.window.showInformationMessage(`Z-Accept: ${result.message}`);
    }
  }

  /**
   * Syncs native IDE Turbo mode settings.
   */
  public async syncNativeConfig(): Promise<string> {
    if (this.adapter.syncNativeConfig) {
      const res = await this.adapter.syncNativeConfig();
      this.notifyStatusChange();
      return res.message;
    }
    return 'Native sync not required for this editor.';
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    vscode.workspace.getConfiguration('zAccept').update('autoAccept.enabled', enabled, vscode.ConfigurationTarget.Global);
    this.notifyStatusChange();
  }

  public toggle(): boolean {
    this.setEnabled(!this.isEnabled);
    return this.isEnabled;
  }

  public setAutoConfirmSteps(enabled: boolean): void {
    this.autoConfirmSteps = enabled;
    vscode.workspace.getConfiguration('zAccept').update('autoConfirmSteps', enabled, vscode.ConfigurationTarget.Global);
    this.notifyStatusChange();
  }

  public setAutoAcceptDiffs(enabled: boolean): void {
    this.autoAcceptDiffs = enabled;
    vscode.workspace.getConfiguration('zAccept').update('autoAcceptDiffs', enabled, vscode.ConfigurationTarget.Global);
    this.notifyStatusChange();
  }

  public resetCount(): void {
    this.totalAcceptedCount = 0;
    this.notifyStatusChange();
  }

  public getStatus(): AutoAcceptStatus {
    return {
      enabled: this.isEnabled,
      autoConfirmSteps: this.autoConfirmSteps,
      autoAcceptDiffs: this.autoAcceptDiffs,
      adapterName: this.adapter.displayName,
      totalAcceptedCount: this.totalAcceptedCount,
      lastAcceptedTime: this.lastAcceptedTime,
      lastMessage: this.lastMessage
    };
  }

  private notifyStatusChange(): void {
    this._onDidChangeStatus.fire(this.getStatus());
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.disposables.forEach(d => d.dispose());
    this._onDidChangeStatus.dispose();
  }
}
