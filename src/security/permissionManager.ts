import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { PathValidator } from './pathValidator';
import { RequestStorage, AccessRequestRecord, RequestAction, RequestDecision, RequestStatus } from '../storage/requestStorage';
import { AccessNotification } from '../notifications/accessNotification';

export interface PermissionCheckResult {
  allowed: boolean;
  requestId?: string;
  reason?: string;
}

export class PermissionManager {
  private pathValidator: PathValidator;
  private storage: RequestStorage;
  private isMonitorEnabled = false;

  // Single-use execution grants: maps a normalized path + action to an expiration timestamp
  private singleUseGrants = new Map<string, number>();

  constructor(pathValidator: PathValidator, storage: RequestStorage) {
    this.pathValidator = pathValidator;
    this.storage = storage;
    this.isMonitorEnabled = vscode.workspace.getConfiguration('zAccept').get<boolean>('securityMonitor.enabled', false);
  }

  public setMonitorEnabled(enabled: boolean): void {
    this.isMonitorEnabled = enabled;
  }

  public isEnabled(): boolean {
    return this.isMonitorEnabled;
  }

  /**
   * Generates a unique single-use token key for a path and action.
   */
  private makeGrantKey(action: RequestAction, canonicalPath: string): string {
    return `${action}:${canonicalPath.toLowerCase()}`;
  }

  /**
   * Checks if a single-use grant exists and consumes it immediately.
   */
  public consumeSingleUseGrant(action: RequestAction, targetPath: string): boolean {
    const canonical = this.pathValidator.resolveCanonicalPath(targetPath);
    const key = this.makeGrantKey(action, canonical);
    const expireTime = this.singleUseGrants.get(key);
    if (expireTime && Date.now() < expireTime) {
      this.singleUseGrants.delete(key);
      return true;
    }
    this.singleUseGrants.delete(key);
    return false;
  }

  /**
   * Main pre-execution permission evaluation gate.
   * Intercepts access attempt before the file operation executes.
   */
  public async evaluateAccess(
    action: RequestAction,
    targetPath: string,
    callerIdentity = 'AI Coding Agent'
  ): Promise<PermissionCheckResult> {
    // 0. If monitor is disabled by user, allow immediately with zero popups
    if (!this.isMonitorEnabled) {
      return { allowed: true, reason: 'Security monitor disabled by user setting' };
    }

    const validation = this.pathValidator.validatePath(targetPath);

    // 1. Files inside current project workspace are allowed without interruption
    if (validation.isWithinWorkspace) {
      return { allowed: true };
    }

    // 2. Check if this specific operation already has an unconsumed one-time grant
    if (this.consumeSingleUseGrant(action, validation.realPath)) {
      return { allowed: true };
    }

    // 4. Outside-project or system access attempt detected!
    const requestId = `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const pendingRecord: AccessRequestRecord = {
      id: requestId,
      timestamp,
      agent: callerIdentity,
      action,
      requestedPath: validation.realPath,
      projectPath: validation.primaryWorkspaceRoot,
      decision: 'Cancelled', // safe initial default
      status: 'Pending'
    };

    // Store the request immediately as Pending
    await this.storage.saveRequest(pendingRecord);

    // 5. Prompt user with unified native notification dialog
    const userDecision = await AccessNotification.promptUser({
      action,
      requestedLocation: validation.realPath,
      currentProject: validation.primaryWorkspaceRoot,
      agentName: callerIdentity
    });

    const isAllowed = userDecision === 'Allow';
    const decision: RequestDecision = isAllowed ? 'Allowed' : 'Cancelled';
    const status: RequestStatus = isAllowed ? 'Allowed' : 'Denied';

    // 6. Update the stored request record with user's decision
    await this.storage.updateRequest(requestId, {
      decision,
      status
    });

    if (isAllowed) {
      // Grant a 15-second single-use lease so the pending execution can proceed
      const grantKey = this.makeGrantKey(action, validation.realPath);
      this.singleUseGrants.set(grantKey, Date.now() + 15000);

      return {
        allowed: true,
        requestId
      };
    }

    return {
      allowed: false,
      requestId,
      reason: 'User cancelled permission request for outside-project location'
    };
  }
}
