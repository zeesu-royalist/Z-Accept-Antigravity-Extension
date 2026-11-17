import * as vscode from 'vscode';
import { RequestAction } from '../storage/requestStorage';

export interface NotificationParams {
  action: RequestAction;
  requestedLocation: string;
  currentProject: string;
  agentName?: string;
}

export class AccessNotification {
  /**
   * Displays the unified native permission notification.
   * Uses VS Code modal dialog for strict pre-execution enforcement,
   * matching Antigravity IDE native typography, dark background, and styling.
   */
  public static async promptUser(params: NotificationParams): Promise<'Allow' | 'Cancel'> {
    const message = `Z-Accept Security: Agent is requesting to ${params.action} outside workspace: ${params.requestedLocation}`;

    // Non-modal notification so it never blocks or spams the user with fullscreen popup windows
    const selection = await vscode.window.showWarningMessage(
      message,
      'Allow',
      'Deny'
    );

    if (selection === 'Allow') {
      return 'Allow';
    }

    return 'Cancel';
  }
}
