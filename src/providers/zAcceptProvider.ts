import * as vscode from 'vscode';
import { AutoAcceptManager } from '../autoAccept/autoAcceptManager';
import { PermissionManager } from '../security/permissionManager';
import { RequestStorage } from '../storage/requestStorage';
import { ZA_LOGO_DATA_URI } from './logoAsset';

export class ZAcceptViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'z-accept.mainView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly autoAcceptManager: AutoAcceptManager,
    private readonly permissionManager: PermissionManager,
    private readonly storage: RequestStorage
  ) {
    this.autoAcceptManager.onDidChangeStatus(() => this.updateWebview());
    this.storage.onDidChangeRequests(() => this.updateWebview());
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.type) {
        case 'toggleAutoConfirmSteps':
          this.autoAcceptManager.setAutoConfirmSteps(!this.autoAcceptManager.getStatus().autoConfirmSteps);
          break;
        case 'toggleAutoAcceptDiffs':
          this.autoAcceptManager.setAutoAcceptDiffs(!this.autoAcceptManager.getStatus().autoAcceptDiffs);
          break;
        case 'toggleSecurityMonitor': {
          const next = !this.permissionManager.isEnabled();
          this.permissionManager.setMonitorEnabled(next);
          vscode.workspace
            .getConfiguration('zAccept')
            .update('securityMonitor.enabled', next, vscode.ConfigurationTarget.Global);
          this.updateWebview();
          break;
        }
        case 'syncTurboMode': {
          const msg = await this.autoAcceptManager.syncNativeConfig();
          vscode.window.showInformationMessage(`Z-Accept: ${msg}`);
          break;
        }
        case 'acceptPendingNow':
          await this.autoAcceptManager.acceptPendingNow();
          break;
        case 'clearHistory':
          await this.storage.clearRequests();
          break;
        case 'refresh':
          this.updateWebview();
          break;
      }
    });

    this.updateWebview();
  }

  public updateWebview(): void {
    if (!this._view) {
      return;
    }

    const autoAcceptStatus = this.autoAcceptManager.getStatus();
    const monitorEnabled = this.permissionManager.isEnabled();
    const requests = this.storage.getRequests();

    this._view.webview.postMessage({
      type: 'stateUpdate',
      state: {
        autoConfirmSteps: autoAcceptStatus.autoConfirmSteps,
        autoAcceptDiffs: autoAcceptStatus.autoAcceptDiffs,
        autoAcceptCount: autoAcceptStatus.totalAcceptedCount,
        adapterName: autoAcceptStatus.adapterName,
        lastMessage: autoAcceptStatus.lastMessage,
        monitorEnabled,
        requests
      }
    });
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private escapeHtml(str: string): string {
    if (!str) {
      return '';
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getHtmlForWebview(_webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const autoAcceptStatus = this.autoAcceptManager.getStatus();
    const monitorEnabled = this.permissionManager.isEnabled();
    const requests = this.storage.getRequests();

    const initialStateJson = JSON.stringify({
      autoConfirmSteps: autoAcceptStatus.autoConfirmSteps,
      autoAcceptDiffs: autoAcceptStatus.autoAcceptDiffs,
      autoAcceptCount: autoAcceptStatus.totalAcceptedCount,
      adapterName: autoAcceptStatus.adapterName,
      lastMessage: autoAcceptStatus.lastMessage,
      monitorEnabled,
      requests
    });

    const initialRequestsHtml =
      requests.length === 0
        ? `<div class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            <div class="empty-title">Zero Access Violations</div>
            <div class="empty-desc">No outside-project or system access requests detected. Workspace boundaries are guarded.</div>
          </div>`
        : requests
            .map(r => {
              const timeStr = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '';
              const isAllowed = r.decision === 'Allowed';
              const badgeClass = isAllowed ? 'allowed' : 'denied';
              const badgeText = isAllowed ? 'Allowed' : 'Cancelled';

              return `
              <div class="request-item" title="${this.escapeHtml(r.requestedPath)}">
                <div class="item-header">
                  <span class="action-tag">${this.escapeHtml(r.action || 'Access')}</span>
                  <span class="status-pill ${badgeClass}">${badgeText}</span>
                </div>
                <div class="item-path">${this.escapeHtml(r.requestedPath || '')}</div>
                <div class="item-footer">
                  <span class="agent-name">${this.escapeHtml(r.agent || 'AI Coding Agent')}</span>
                  <span class="item-time">${timeStr}</span>
                </div>
              </div>`;
            })
            .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data: https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Z-Accept</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #181818);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --desc-fg: var(--vscode-descriptionForeground, #8c8c8c);
      --border-subtle: var(--vscode-sideBarSectionHeader-border, rgba(255, 255, 255, 0.08));
      --card-bg: var(--vscode-editorWidget-background, #1f1f1f);
      --card-border: var(--vscode-widget-border, rgba(255, 255, 255, 0.06));
      --primary-btn-bg: var(--vscode-button-background, #0e639c);
      --primary-btn-fg: var(--vscode-button-foreground, #ffffff);
      --primary-btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --sec-btn-bg: var(--vscode-button-secondaryBackground, #313131);
      --sec-btn-fg: var(--vscode-button-secondaryForeground, #cccccc);
      --sec-btn-hover: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
      --badge-bg: var(--vscode-badge-background, rgba(255, 255, 255, 0.08));
      --tag-bg: rgba(255, 255, 255, 0.05);
      --allowed-bg: rgba(14, 99, 156, 0.15);
      --allowed-fg: #4daafc;
      --denied-bg: rgba(241, 76, 76, 0.15);
      --denied-fg: #f48771;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      font-size: 12px;
      line-height: 1.45;
      padding: 14px 10px;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }

    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 14px;
    }

    .brand-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.2px;
      color: var(--fg);
    }

    .brand-logo {
      height: 16px;
      width: 25px;
      object-fit: contain;
      flex-shrink: 0;
      image-rendering: -webkit-optimize-contrast;
      vertical-align: middle;
    }

    body.vscode-light .brand-logo {
      filter: invert(1);
    }

    .engine-pill {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 12px;
      background: var(--badge-bg);
      color: var(--desc-fg);
      border: 1px solid var(--border-subtle);
      font-weight: 500;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .control-cards {
      display: flex;
      flex-direction: column;
      gap: 9px;
      margin-bottom: 14px;
    }

    .control-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 11px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 5px;
      transition: border-color 0.15s ease;
    }

    .control-card:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }

    .card-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: 72%;
    }

    .card-heading {
      font-weight: 600;
      font-size: 12px;
      color: var(--fg);
    }

    .card-caption {
      font-size: 10.5px;
      color: var(--desc-fg);
      line-height: 1.3;
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 34px;
      height: 19px;
      flex-shrink: 0;
      cursor: pointer;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.15);
      transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 19px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 13px;
      width: 13px;
      left: 2px;
      bottom: 2px;
      background-color: #dcdcdc;
      transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--primary-btn-bg, #0e639c);
      border-color: var(--primary-btn-bg, #0e639c);
    }

    input:checked + .slider:before {
      transform: translateX(15px);
      background-color: #ffffff;
    }

    .action-row {
      display: flex;
      gap: 6px;
      margin-bottom: 16px;
    }

    .btn {
      flex: 1;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.12s ease;
      border: none;
      outline: none;
    }

    .btn-primary {
      background-color: var(--primary-btn-bg, #0e639c);
      color: var(--primary-btn-fg, #ffffff);
    }

    .btn-primary:hover {
      background-color: var(--primary-btn-hover, #1177bb);
    }

    .btn-secondary {
      background-color: var(--sec-btn-bg);
      color: var(--sec-btn-fg);
      border: 1px solid var(--border-subtle);
    }

    .btn-secondary:hover {
      background-color: var(--sec-btn-hover);
      color: var(--fg);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: var(--desc-fg);
    }

    .clear-link {
      cursor: pointer;
      color: var(--desc-fg);
      text-decoration: none;
      font-size: 10px;
    }

    .clear-link:hover {
      color: var(--fg);
    }

    .request-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
      max-height: 240px;
      overflow-y: auto;
    }

    .request-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 4px;
      padding: 7px 9px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .action-tag {
      font-size: 10px;
      font-weight: 600;
      color: var(--fg);
      background: var(--tag-bg);
      padding: 1px 5px;
      border-radius: 3px;
    }

    .status-pill {
      font-size: 9.5px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
    }

    .status-pill.allowed {
      background: var(--allowed-bg);
      color: var(--allowed-fg);
    }

    .status-pill.denied {
      background: var(--denied-bg);
      color: var(--denied-fg);
    }

    .item-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10.5px;
      color: var(--fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-footer {
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: var(--desc-fg);
    }

    .empty-state {
      padding: 18px 12px;
      text-align: center;
      background: var(--card-bg);
      border: 1px dashed var(--border-subtle);
      border-radius: 5px;
      color: var(--desc-fg);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .empty-icon {
      opacity: 0.5;
    }

    .empty-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--fg);
    }

    .empty-desc {
      font-size: 10px;
      line-height: 1.35;
      max-width: 210px;
    }
  </style>
</head>
<body>
  <!-- Brand Top Bar -->
  <div class="top-bar">
    <div class="brand-title">
      <img class="brand-logo" src="${ZA_LOGO_DATA_URI}" alt="Z-Accept" />
      <span>Z-Accept</span>
    </div>
    <span class="engine-pill" id="adapterPill">${this.escapeHtml(autoAcceptStatus.adapterName)}</span>
  </div>

  <!-- Primary Function Controls -->
  <div class="control-cards">
    <!-- Tool & Step Popups Auto-Confirm -->
    <div class="control-card">
      <div class="card-info">
        <div class="card-heading">Bypass Tool Popups</div>
        <div class="card-caption" id="stepConfirmCaption">
          Auto-confirms 'git status' &amp; terminal execution prompts
        </div>
      </div>
      <label class="switch">
        <input type="checkbox" id="stepConfirmToggle" ${autoAcceptStatus.autoConfirmSteps ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>

    <!-- Outside Access Security -->
    <div class="control-card">
      <div class="card-info">
        <div class="card-heading">Outside Access Guard</div>
        <div class="card-caption" id="monitorCaption">
          ${monitorEnabled ? 'Guarding workspace perimeter' : 'Paused'}
        </div>
      </div>
      <label class="switch">
        <input type="checkbox" id="monitorToggle" ${monitorEnabled ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>

    <!-- Final Code Manual Review Card -->
    <div class="control-card">
      <div class="card-info">
        <div class="card-heading">Code Changes</div>
        <div class="card-caption">Manual Review (Diffs preserved for review)</div>
      </div>
      <span class="status-pill allowed" style="font-size: 10px;">Manual Safe</span>
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="action-row">
    <button class="btn btn-primary" id="syncTurboBtn" title="Align IDE Turbo Execution">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      <span>Sync Turbo</span>
    </button>
    <button class="btn btn-secondary" id="acceptNowBtn" title="Accept all waiting steps &amp; diffs now">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>Accept Now</span>
    </button>
  </div>

  <!-- Outside Access Audit Log -->
  <div class="section-header">
    <span>Access Perimeter Log</span>
    <span class="clear-link" id="clearBtn">Clear</span>
  </div>

  <div class="request-list" id="requestsContainer">
    ${initialRequestsHtml}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const stepConfirmToggle = document.getElementById('stepConfirmToggle');
    const stepConfirmCaption = document.getElementById('stepConfirmCaption');
    const monitorToggle = document.getElementById('monitorToggle');
    const monitorCaption = document.getElementById('monitorCaption');
    const adapterPill = document.getElementById('adapterPill');
    const syncTurboBtn = document.getElementById('syncTurboBtn');
    const acceptNowBtn = document.getElementById('acceptNowBtn');
    const clearBtn = document.getElementById('clearBtn');
    const requestsContainer = document.getElementById('requestsContainer');

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderRequests(requests) {
      if (!requests || requests.length === 0) {
        requestsContainer.innerHTML = \`
          <div class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            <div class="empty-title">Zero Access Violations</div>
            <div class="empty-desc">No outside-project or system access requests detected. Workspace boundaries are guarded.</div>
          </div>\`;
        return;
      }

      requestsContainer.innerHTML = requests.map(r => {
        const timeStr = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '';
        const isAllowed = r.decision === 'Allowed';
        const badgeClass = isAllowed ? 'allowed' : 'denied';
        const badgeText = isAllowed ? 'Allowed' : 'Cancelled';

        return \`
          <div class="request-item" title="\${escapeHtml(r.requestedPath)}">
            <div class="item-header">
              <span class="action-tag">\${escapeHtml(r.action || 'Access')}</span>
              <span class="status-pill \${badgeClass}">\${badgeText}</span>
            </div>
            <div class="item-path">\${escapeHtml(r.requestedPath || '')}</div>
            <div class="item-footer">
              <span class="agent-name">\${escapeHtml(r.agent || 'AI Coding Agent')}</span>
              <span class="item-time">\${timeStr}</span>
            </div>
          </div>\`;
      }).join('');
    }

    stepConfirmToggle.addEventListener('change', () => {
      vscode.postMessage({ type: 'toggleAutoConfirmSteps' });
    });

    monitorToggle.addEventListener('change', () => {
      vscode.postMessage({ type: 'toggleSecurityMonitor' });
    });

    syncTurboBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'syncTurboMode' });
    });

    acceptNowBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'acceptPendingNow' });
    });

    clearBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearHistory' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'stateUpdate') {
        const state = message.state;
        stepConfirmToggle.checked = !!state.autoConfirmSteps;
        monitorToggle.checked = !!state.monitorEnabled;

        if (state.autoConfirmSteps) {
          stepConfirmCaption.textContent = "Auto-submits 'git status' & tool popups in 40ms";
        } else {
          stepConfirmCaption.textContent = 'Intermediate popup auto-confirm paused';
        }

        monitorCaption.textContent = state.monitorEnabled
          ? 'Guarding workspace perimeter'
          : 'Paused';

        if (state.adapterName) {
          adapterPill.textContent = state.adapterName;
        }

        renderRequests(state.requests);
      }
    });

    try {
      const initial = ${initialStateJson};
      if (initial && initial.requests) {
        renderRequests(initial.requests);
      }
    } catch {}
  </script>
</body>
</html>`;
  }
}
