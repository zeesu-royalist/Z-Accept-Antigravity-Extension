import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { RequestStorage } from './storage/requestStorage';
import { PathValidator } from './security/pathValidator';
import { PermissionManager } from './security/permissionManager';
import { AccessMonitor } from './security/accessMonitor';
import { AutoAcceptManager } from './autoAccept/autoAcceptManager';
import { ZAcceptViewProvider } from './providers/zAcceptProvider';

let accessMonitor: AccessMonitor | undefined;
let autoAcceptManager: AutoAcceptManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[Z-Accept] Activating AI Auto Accept & Access Permission System...');

  // 1. Initialize Request Storage
  const storage = new RequestStorage(context.globalStorageUri);

  // 2. Initialize Path Validator & Permission Manager
  const pathValidator = new PathValidator();
  const permissionManager = new PermissionManager(pathValidator, storage);

  // 3. Initialize Runtime Access Monitor (Interception Engine for outside project access)
  accessMonitor = new AccessMonitor(permissionManager, storage.getFilePath());
  context.subscriptions.push(accessMonitor);

  // 4. Initialize Auto Accept Manager (with native Antigravity Turbo auto-execution)
  autoAcceptManager = new AutoAcceptManager();
  await autoAcceptManager.initialize();
  context.subscriptions.push(autoAcceptManager);

  // 5. Register Sidebar UI Provider
  const provider = new ZAcceptViewProvider(
    context.extensionUri,
    autoAcceptManager,
    permissionManager,
    storage
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ZAcceptViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // 6. Create Native Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'z-accept.focusView';
  context.subscriptions.push(statusBarItem);

  const updateStatusBar = () => {
    const status = autoAcceptManager?.getStatus();
    const isAutoOn = status?.autoConfirmSteps ?? true;
    const isMonOn = permissionManager.isEnabled();

    if (isAutoOn && isMonOn) {
      statusBarItem.text = '$(zap) Z-Accept: Turbo Active';
      statusBarItem.tooltip = 'Z-Accept: Tool Popups [AUTO-BYPASS] | Code Diff [MANUAL REVIEW] | Perimeter Guard [ACTIVE]\nClick to open Control Panel';
    } else if (isAutoOn) {
      statusBarItem.text = '$(zap) Z-Accept: Turbo';
      statusBarItem.tooltip = 'Z-Accept: Tool Popups [AUTO-BYPASS] | Code Diff [MANUAL REVIEW]\nClick to open Control Panel';
    } else if (isMonOn) {
      statusBarItem.text = '$(shield) Z-Accept: Guard';
      statusBarItem.tooltip = 'Z-Accept: Outside Access [GUARDING]\nClick to open Control Panel';
    } else {
      statusBarItem.text = '$(circle-slash) Z-Accept: Paused';
      statusBarItem.tooltip = 'Z-Accept: All features paused\nClick to open Control Panel';
    }
    statusBarItem.show();
  };

  updateStatusBar();
  autoAcceptManager.onDidChangeStatus(() => updateStatusBar());

  // 7. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('z-accept.focusView', () => {
      vscode.commands.executeCommand('z-accept.mainView.focus');
    }),

    vscode.commands.registerCommand('z-accept.toggleAutoAccept', () => {
      if (autoAcceptManager) {
        const nextState = autoAcceptManager.toggle();
        updateStatusBar();
        vscode.window.setStatusBarMessage(
          `Z-Accept: Tool popup auto-confirm ${nextState ? 'Enabled' : 'Disabled'}`,
          3000
        );
      }
    }),

    vscode.commands.registerCommand('z-accept.toggleSecurityMonitor', () => {
      const nextState = !permissionManager.isEnabled();
      permissionManager.setMonitorEnabled(nextState);
      vscode.workspace.getConfiguration('zAccept').update('securityMonitor.enabled', nextState, vscode.ConfigurationTarget.Global);
      provider.updateWebview();
      updateStatusBar();
      vscode.window.setStatusBarMessage(
        `Z-Accept: Access Guard ${nextState ? 'Guarding' : 'Disabled'}`,
        3000
      );
    }),

    vscode.commands.registerCommand('z-accept.syncTurboMode', async () => {
      if (autoAcceptManager) {
        const msg = await autoAcceptManager.syncNativeConfig();
        vscode.window.showInformationMessage(`Z-Accept: ${msg}`);
      }
    }),

    vscode.commands.registerCommand('z-accept.acceptPendingNow', async () => {
      if (autoAcceptManager) {
        await autoAcceptManager.acceptPendingNow();
      }
    }),

    vscode.commands.registerCommand('z-accept.clearHistory', async () => {
      await storage.clearRequests();
      vscode.window.setStatusBarMessage('Z-Accept: History cleared', 2500);
    }),

    // Interactive command to verify outside-project permission enforcement
    vscode.commands.registerCommand('z-accept.testOutsideAccess', async () => {
      const testPath = path.join(os.homedir(), 'Desktop', 'z-accept-test-sensitive-file.txt');
      vscode.window.showInformationMessage(`[Z-Accept Test] Simulating AI agent requesting read access to: ${testPath}`);
      
      try {
        const res = await permissionManager.evaluateAccess('Read File', testPath, 'AI Test Agent');
        if (res.allowed) {
          vscode.window.showInformationMessage('Z-Accept Test: Access was Allowed by user.');
        } else {
          vscode.window.showWarningMessage('Z-Accept Test: Access was Cancelled / Denied by user.');
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Z-Accept Test Error: ${err.message}`);
      }
    })
  );

  console.log('[Z-Accept] Activated successfully.');

  return {
    permissionManager,
    autoAcceptManager,
    storage,
    pathValidator,
    evaluateAccess: (action: any, targetPath: string, agentName?: string) =>
      permissionManager.evaluateAccess(action, targetPath, agentName)
  };
}

export function deactivate() {
  if (accessMonitor) {
    accessMonitor.dispose();
  }
  if (autoAcceptManager) {
    autoAcceptManager.dispose();
  }
}
