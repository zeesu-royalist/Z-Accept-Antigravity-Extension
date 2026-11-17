import * as vscode from 'vscode';
import { IDEAdapter, AcceptResult, AcceptOptions } from './ideAdapter';

export class VSCodeAdapter implements IDEAdapter {
  public readonly id = 'vscode';
  public readonly displayName = 'Visual Studio Code';

  private promptCommands = [
    'workbench.action.acceptSelectedQuickOpenItem',
    'quickInput.accept'
  ];

  private diffCommands = [
    'chatEditing.acceptAllFiles',
    'chatEditing.acceptFile',
    'inlineChat.acceptChanges',
    'inlineChat2.keep',
    'interactiveEditor.accept',
    'notebook.inlineChat.acceptChangesAndRun'
  ];

  public getSupportedCommands(): string[] {
    return [...this.promptCommands, ...this.diffCommands];
  }

  public async isDetected(): Promise<boolean> {
    const appName = vscode.env.appName || '';
    return !appName.toLowerCase().includes('antigravity');
  }

  public async isAcceptAvailable(): Promise<boolean> {
    try {
      const allCommands = await vscode.commands.getCommands(true);
      return this.getSupportedCommands().some(sc => allCommands.includes(sc));
    } catch {
      return false;
    }
  }

  public async acceptIntermediatePrompts(): Promise<AcceptResult> {
    const availableCommands = new Set(await vscode.commands.getCommands(true));
    let handledCount = 0;

    if (availableCommands.has('quickInput.accept')) {
      try {
        await vscode.commands.executeCommand('quickInput.accept');
        handledCount++;
      } catch {}
    }

    return {
      success: handledCount > 0,
      handledCount,
      message: handledCount > 0 ? 'Accepted quick prompt' : 'No prompt pending.'
    };
  }

  public async acceptDiffs(): Promise<AcceptResult> {
    const availableCommands = new Set(await vscode.commands.getCommands(true));
    let handledCount = 0;
    const acceptedMethods: string[] = [];

    if (availableCommands.has('chatEditing.acceptAllFiles')) {
      try {
        await vscode.commands.executeCommand('chatEditing.acceptAllFiles');
        handledCount++;
        acceptedMethods.push('Multi-File Edits');
      } catch {}
    }

    if (availableCommands.has('inlineChat.acceptChanges')) {
      try {
        await vscode.commands.executeCommand('inlineChat.acceptChanges');
        handledCount++;
        acceptedMethods.push('Inline Chat Changes');
      } catch {}
    }

    return {
      success: handledCount > 0,
      handledCount,
      message: handledCount > 0 ? `Accepted: ${acceptedMethods.join(', ')}` : 'No diffs pending.'
    };
  }

  public async acceptChanges(options?: AcceptOptions): Promise<AcceptResult> {
    let totalHandled = 0;
    const messages: string[] = [];

    if (options?.allowStepPrompts !== false) {
      const pRes = await this.acceptIntermediatePrompts();
      if (pRes.success) {
        totalHandled += pRes.handledCount;
        messages.push(pRes.message);
      }
    }

    if (options?.allowDiffs === true) {
      const dRes = await this.acceptDiffs();
      if (dRes.success) {
        totalHandled += dRes.handledCount;
        messages.push(dRes.message);
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
      message: 'No active AI changes waiting.'
    };
  }
}
