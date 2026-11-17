import * as vscode from 'vscode';
import { IDEAdapter, AcceptResult, AcceptOptions } from './ideAdapter';
import { AntigravityConfigManager } from './antigravityConfig';

export class AntigravityAdapter implements IDEAdapter {
  public readonly id = 'antigravity';
  public readonly displayName = 'Google Antigravity IDE';

  // Intermediate tool execution / permission / prompt acceptance commands
  private promptCommands = [
    'acceptAgentStep',
    'antigravity.terminalCommand.accept',
    'antigravity.terminalCommand.run',
    'antigravity.command.accept',
    'quickInput.accept',
    'workbench.action.acceptSelectedQuickOpenItem'
  ];

  // Final code change / diff acceptance commands (kept separate for manual user review)
  private diffCommands = [
    'chatEditing.acceptAllFiles',
    'chatEditing.acceptFile',
    'antigravity.prioritized.agentAcceptAllInFile',
    'antigravity.prioritized.agentAcceptFocusedHunk',
    'inlineChat.acceptChanges',
    'inlineChat2.keep',
    'antigravity.prioritized.supercompleteAccept',
    'antigravity.prioritized.tabJumpAccept',
    'antigravity.acceptCompletion',
    'notebook.inlineChat.acceptChangesAndRun'
  ];

  public getSupportedCommands(): string[] {
    return [...this.promptCommands, ...this.diffCommands];
  }

  public async isDetected(): Promise<boolean> {
    const appName = vscode.env.appName || '';
    if (appName.toLowerCase().includes('antigravity')) {
      return true;
    }

    try {
      const allCommands = await vscode.commands.getCommands(true);
      return allCommands.some(cmd => cmd.startsWith('antigravity.') || cmd === 'acceptAgentStep');
    } catch {
      return false;
    }
  }

  public async isAcceptAvailable(): Promise<boolean> {
    try {
      const allCommands = await vscode.commands.getCommands(true);
      return this.getSupportedCommands().some(sc => allCommands.includes(sc));
    } catch {
      return false;
    }
  }

  /**
   * Synchronizes Antigravity preferences so that intermediate terminal & tool execution
   * (e.g. git status, commands) run automatically in Turbo mode without popup friction,
   * and ensures the auto-submit engine is active in the IDE UI.
   */
  public async syncNativeConfig(): Promise<{ success: boolean; message: string }> {
    const res = AntigravityConfigManager.syncAll();
    return {
      success: res.success,
      message: res.message
    };
  }

  /**
   * Auto-approves intermediate agent popups and permission requests
   * (such as 'git status', command approvals, and step confirmations).
   */
  public async acceptIntermediatePrompts(): Promise<AcceptResult> {
    const availableCommands = new Set(await vscode.commands.getCommands(true));
    let handledCount = 0;
    const acceptedMethods: string[] = [];

    // 1. Accept Agent Step in Antigravity Agent Chat / Cascade
    if (availableCommands.has('acceptAgentStep')) {
      try {
        const res = await vscode.commands.executeCommand('acceptAgentStep');
        if (res !== undefined) {
          handledCount++;
          acceptedMethods.push('Agent Step');
        }
      } catch {}
    }

    // 2. Accept Terminal Commands proposed by AI Agent
    if (availableCommands.has('antigravity.terminalCommand.accept')) {
      try {
        const res = await vscode.commands.executeCommand('antigravity.terminalCommand.accept');
        if (res !== undefined) {
          handledCount++;
          acceptedMethods.push('Terminal Command');
        }
      } catch {}
    }

    // 3. QuickInput / QuickPick confirmation (hits first default option)
    if (availableCommands.has('quickInput.accept')) {
      try {
        const res = await vscode.commands.executeCommand('quickInput.accept');
        if (res !== undefined) {
          handledCount++;
          acceptedMethods.push('Quick Input');
        }
      } catch {}
    }

    return {
      success: handledCount > 0,
      handledCount,
      message: handledCount > 0 ? `Auto-confirmed: ${acceptedMethods.join(', ')}` : 'No intermediate prompt pending.'
    };
  }

  /**
   * Accepts final code diffs across editors/files.
   * Note: Kept manual unless allowDiffs is explicitly enabled.
   */
  public async acceptDiffs(): Promise<AcceptResult> {
    const availableCommands = new Set(await vscode.commands.getCommands(true));
    let handledCount = 0;
    const acceptedMethods: string[] = [];

    // 1. Multi-file AI Chat Edit Session (Cascade / Copilot)
    if (availableCommands.has('chatEditing.acceptAllFiles')) {
      try {
        await vscode.commands.executeCommand('chatEditing.acceptAllFiles');
        handledCount++;
        acceptedMethods.push('Multi-File Edits');
      } catch {}
    }

    // 2. Cascade Diff Zones in Active Editor & All Visible Editors
    const visibleEditors = vscode.window.visibleTextEditors;
    if (availableCommands.has('antigravity.prioritized.agentAcceptAllInFile')) {
      try {
        await vscode.commands.executeCommand('antigravity.prioritized.agentAcceptAllInFile');
        handledCount++;
        acceptedMethods.push('Cascade File Edits');
      } catch {}

      for (const editor of visibleEditors) {
        try {
          await vscode.commands.executeCommand('antigravity.prioritized.agentAcceptAllInFile', editor.document.uri);
          handledCount++;
        } catch {}
      }
    }

    // 3. Focused Diff Hunk
    if (availableCommands.has('antigravity.prioritized.agentAcceptFocusedHunk')) {
      try {
        await vscode.commands.executeCommand('antigravity.prioritized.agentAcceptFocusedHunk');
        handledCount++;
        acceptedMethods.push('Focused Diff Hunk');
      } catch {}
    }

    // 4. Inline Chat Keep
    if (availableCommands.has('inlineChat.acceptChanges')) {
      try {
        await vscode.commands.executeCommand('inlineChat.acceptChanges');
        handledCount++;
        acceptedMethods.push('Inline Chat Changes');
      } catch {}
    }

    if (availableCommands.has('inlineChat2.keep')) {
      try {
        await vscode.commands.executeCommand('inlineChat2.keep');
        handledCount++;
        acceptedMethods.push('Inline Chat Keep');
      } catch {}
    }

    return {
      success: handledCount > 0,
      handledCount,
      message: handledCount > 0 ? `Accepted code changes: ${acceptedMethods.join(', ')}` : 'No pending code diffs.'
    };
  }

  /**
   * Unified accept runner.
   * By default, only bypasses intermediate tool popups, leaving final diffs for manual user review.
   */
  public async acceptChanges(options?: AcceptOptions): Promise<AcceptResult> {
    let totalHandled = 0;
    const messages: string[] = [];

    // 1. Always auto-confirm intermediate tool popups if allowed (default true)
    if (options?.allowStepPrompts !== false) {
      const stepRes = await this.acceptIntermediatePrompts();
      if (stepRes.success) {
        totalHandled += stepRes.handledCount;
        messages.push(stepRes.message);
      }
    }

    // 2. ONLY accept code diffs if explicitly authorized
    if (options?.allowDiffs === true) {
      const diffRes = await this.acceptDiffs();
      if (diffRes.success) {
        totalHandled += diffRes.handledCount;
        messages.push(diffRes.message);
      }
    }

    if (totalHandled > 0) {
      return {
        success: true,
        handledCount: totalHandled,
        message: messages.join(' | ')
      };
    }

    return {
      success: false,
      handledCount: 0,
      message: 'No pending prompts or changes waiting.'
    };
  }
}
