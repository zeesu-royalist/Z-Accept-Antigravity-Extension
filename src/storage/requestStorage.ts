import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

export type RequestAction = 'Read File' | 'Write File' | 'Modify File' | 'Delete File' | 'List Directory' | 'Execute';
export type RequestDecision = 'Allowed' | 'Cancelled';
export type RequestStatus = 'Allowed' | 'Denied' | 'Pending';

export interface AccessRequestRecord {
  id: string;
  timestamp: string; // ISO string
  agent: string;
  action: RequestAction;
  requestedPath: string;
  projectPath: string;
  decision: RequestDecision;
  status: RequestStatus;
}

export class RequestStorage {
  private storageFilePath: string;
  private readonly _onDidChangeRequests = new vscode.EventEmitter<AccessRequestRecord[]>();
  public readonly onDidChangeRequests = this._onDidChangeRequests.event;
  private memoryCache: AccessRequestRecord[] = [];
  private isLoaded = false;

  constructor(globalStorageUri?: vscode.Uri) {
    if (globalStorageUri) {
      this.storageFilePath = path.join(globalStorageUri.fsPath, 'access_requests.json');
    } else {
      this.storageFilePath = path.join(os.homedir(), '.z-accept', 'access_requests.json');
    }
    this.ensureStorageDir();
    this.loadFromDisk();
  }

  public getFilePath(): string {
    return this.storageFilePath;
  }

  private ensureStorageDir(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.error('[Z-Accept] Failed to create storage directory:', err);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.memoryCache = parsed;
        }
      }
      this.isLoaded = true;
    } catch (err) {
      console.warn('[Z-Accept] Failed to load request history from disk, starting fresh:', err);
      this.memoryCache = [];
      this.isLoaded = true;
    }
  }

  private saveToDisk(): void {
    try {
      this.ensureStorageDir();
      fs.writeFileSync(this.storageFilePath, JSON.stringify(this.memoryCache, null, 2), 'utf8');
    } catch (err) {
      console.error('[Z-Accept] Failed to persist request storage:', err);
    }
  }

  public async saveRequest(record: AccessRequestRecord): Promise<void> {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }

    const existingIndex = this.memoryCache.findIndex(r => r.id === record.id);
    if (existingIndex >= 0) {
      this.memoryCache[existingIndex] = { ...this.memoryCache[existingIndex], ...record };
    } else {
      // Add newest at front
      this.memoryCache.unshift(record);
      // Keep within reasonable bounds (500 most recent items)
      if (this.memoryCache.length > 500) {
        this.memoryCache = this.memoryCache.slice(0, 500);
      }
    }

    this.saveToDisk();
    this._onDidChangeRequests.fire(this.memoryCache);
  }

  public async updateRequest(id: string, updates: Partial<AccessRequestRecord>): Promise<void> {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }

    const idx = this.memoryCache.findIndex(r => r.id === id);
    if (idx >= 0) {
      this.memoryCache[idx] = { ...this.memoryCache[idx], ...updates };
      this.saveToDisk();
      this._onDidChangeRequests.fire(this.memoryCache);
    }
  }

  public getRequests(): AccessRequestRecord[] {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }
    return [...this.memoryCache];
  }

  public async clearRequests(): Promise<void> {
    this.memoryCache = [];
    this.saveToDisk();
    this._onDidChangeRequests.fire(this.memoryCache);
  }
}
