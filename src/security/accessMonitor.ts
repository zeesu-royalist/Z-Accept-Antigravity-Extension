import * as vscode from 'vscode';
import * as path from 'path';
import { PermissionManager } from './permissionManager';
import { RequestAction } from '../storage/requestStorage';

export class AccessMonitor implements vscode.Disposable {
  private permissionManager: PermissionManager;
  private storageFilePath: string;
  private isDisposed = false;

  // Stored originals for cleanup
  private originalVscodeFs: { [key: string]: any } = {};
  private originalNodeFs: { [key: string]: any } = {};
  private originalNodeFsPromises: { [key: string]: any } = {};

  constructor(permissionManager: PermissionManager, storageFilePath: string) {
    this.permissionManager = permissionManager;
    this.storageFilePath = path.resolve(storageFilePath).toLowerCase();
    this.installInterceptors();
  }

  /**
   * Checks if the target path is an internal Z-Accept file or IDE application path.
   * Prevents self-interception loops and unnecessary popups for IDE files.
   */
  private isInternalPath(targetPath: string): boolean {
    if (!this.permissionManager.isEnabled()) {
      return true;
    }
    if (!targetPath) {
      return true;
    }
    const resolved = path.resolve(targetPath);
    const lower = resolved.toLowerCase();

    // 1. Z-Accept internal storage
    const storageDir = path.dirname(this.storageFilePath).toLowerCase();
    if (lower === this.storageFilePath || lower.startsWith(storageDir + path.sep)) {
      return true;
    }

    // 2. IDE application bundles, frameworks, and electron resources
    if (lower.startsWith('/applications/') || lower.includes('.app/')) {
      return true;
    }

    // 3. System IDE and editor internals, node_modules, globalStorage
    if (lower.includes('/node_modules/') || lower.includes('/globalstorage/')) {
      return true;
    }
    if (process.platform === 'win32') {
      if (lower.includes('\\program files') || lower.includes('\\appdata\\local\\programs\\')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Inspects stack trace to infer the calling AI agent or extension identity.
   */
  private detectCallerIdentity(): string {
    try {
      const stack = new Error().stack || '';
      const lines = stack.split('\n');
      for (const line of lines) {
        if (line.includes('z-accept') || line.includes('accessMonitor.ts') || line.includes('permissionManager.ts')) {
          continue;
        }
        if (line.includes('antigravity') || line.includes('cascade')) {
          return 'Google Antigravity Agent';
        }
        if (line.includes('copilot')) {
          return 'GitHub Copilot';
        }
        if (line.includes('gemini')) {
          return 'Gemini AI Agent';
        }
        if (line.includes('cline') || line.includes('roo-code') || line.includes('continue')) {
          return 'AI Coding Agent';
        }
      }
    } catch {
      // Fallback
    }
    return 'AI Coding Agent';
  }

  private safeDefine(target: any, prop: string, value: any): boolean {
    try {
      Object.defineProperty(target, prop, {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      });
      return true;
    } catch {
      try {
        target[prop] = value;
        return true;
      } catch {
        return false;
      }
    }
  }

  private installInterceptors(): void {
    if (!this.permissionManager.isEnabled()) {
      return;
    }

    try {
      this.interceptVscodeFs();
    } catch (err) {
      console.warn('[Z-Accept] vscode.workspace.fs interceptor note:', err);
    }

    try {
      this.interceptNodeFs();
    } catch (err) {
      console.warn('[Z-Accept] Node fs interceptor note:', err);
    }
  }

  /**
   * Intercepts vscode.workspace.fs operations before execution.
   */
  private interceptVscodeFs(): void {
    const fsObj = vscode.workspace.fs;
    if (!fsObj) {
      return;
    }

    // 1. readFile
    try {
      const origReadFile = fsObj.readFile.bind(fsObj);
      this.originalVscodeFs['readFile'] = origReadFile;
      this.safeDefine(fsObj, 'readFile', async (uri: vscode.Uri) => {
        const fsPath = uri.fsPath;
        if (!this.isInternalPath(fsPath)) {
          const caller = this.detectCallerIdentity();
          const check = await this.permissionManager.evaluateAccess('Read File', fsPath, caller);
          if (!check.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied read permission for ${fsPath}`);
          }
        }
        return origReadFile(uri);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.readFile:', e);
    }

    // 2. writeFile
    try {
      const origWriteFile = fsObj.writeFile.bind(fsObj);
      this.originalVscodeFs['writeFile'] = origWriteFile;
      this.safeDefine(fsObj, 'writeFile', async (uri: vscode.Uri, content: Uint8Array) => {
        const fsPath = uri.fsPath;
        if (!this.isInternalPath(fsPath)) {
          const caller = this.detectCallerIdentity();
          const check = await this.permissionManager.evaluateAccess('Write File', fsPath, caller);
          if (!check.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied write permission for ${fsPath}`);
          }
        }
        return origWriteFile(uri, content);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.writeFile:', e);
    }

    // 3. delete
    try {
      const origDelete = fsObj.delete.bind(fsObj);
      this.originalVscodeFs['delete'] = origDelete;
      this.safeDefine(fsObj, 'delete', async (uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }) => {
        const fsPath = uri.fsPath;
        if (!this.isInternalPath(fsPath)) {
          const caller = this.detectCallerIdentity();
          const check = await this.permissionManager.evaluateAccess('Delete File', fsPath, caller);
          if (!check.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied delete permission for ${fsPath}`);
          }
        }
        return origDelete(uri, options);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.delete:', e);
    }

    // 4. rename
    try {
      const origRename = fsObj.rename.bind(fsObj);
      this.originalVscodeFs['rename'] = origRename;
      this.safeDefine(fsObj, 'rename', async (source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }) => {
        const srcPath = source.fsPath;
        const destPath = target.fsPath;
        const caller = this.detectCallerIdentity();

        if (!this.isInternalPath(srcPath)) {
          const checkSrc = await this.permissionManager.evaluateAccess('Modify File', srcPath, caller);
          if (!checkSrc.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied permission for ${srcPath}`);
          }
        }
        if (!this.isInternalPath(destPath)) {
          const checkDest = await this.permissionManager.evaluateAccess('Write File', destPath, caller);
          if (!checkDest.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied permission for ${destPath}`);
          }
        }
        return origRename(source, target, options);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.rename:', e);
    }

    // 5. copy
    try {
      const origCopy = fsObj.copy.bind(fsObj);
      this.originalVscodeFs['copy'] = origCopy;
      this.safeDefine(fsObj, 'copy', async (source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }) => {
        const srcPath = source.fsPath;
        const destPath = target.fsPath;
        const caller = this.detectCallerIdentity();

        if (!this.isInternalPath(srcPath)) {
          const checkSrc = await this.permissionManager.evaluateAccess('Read File', srcPath, caller);
          if (!checkSrc.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied read permission for ${srcPath}`);
          }
        }
        if (!this.isInternalPath(destPath)) {
          const checkDest = await this.permissionManager.evaluateAccess('Write File', destPath, caller);
          if (!checkDest.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied write permission for ${destPath}`);
          }
        }
        return origCopy(source, target, options);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.copy:', e);
    }

    // 6. createDirectory
    try {
      const origCreateDir = fsObj.createDirectory.bind(fsObj);
      this.originalVscodeFs['createDirectory'] = origCreateDir;
      this.safeDefine(fsObj, 'createDirectory', async (uri: vscode.Uri) => {
        const fsPath = uri.fsPath;
        if (!this.isInternalPath(fsPath)) {
          const caller = this.detectCallerIdentity();
          const check = await this.permissionManager.evaluateAccess('Write File', fsPath, caller);
          if (!check.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied permission for ${fsPath}`);
          }
        }
        return origCreateDir(uri);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.createDirectory:', e);
    }

    // 7. readDirectory
    try {
      const origReadDir = fsObj.readDirectory.bind(fsObj);
      this.originalVscodeFs['readDirectory'] = origReadDir;
      this.safeDefine(fsObj, 'readDirectory', async (uri: vscode.Uri) => {
        const fsPath = uri.fsPath;
        if (!this.isInternalPath(fsPath)) {
          const caller = this.detectCallerIdentity();
          const check = await this.permissionManager.evaluateAccess('List Directory', fsPath, caller);
          if (!check.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied list permission for ${fsPath}`);
          }
        }
        return origReadDir(uri);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.readDirectory:', e);
    }

    // 8. stat
    try {
      const origStat = fsObj.stat.bind(fsObj);
      this.originalVscodeFs['stat'] = origStat;
      this.safeDefine(fsObj, 'stat', async (uri: vscode.Uri) => {
        const fsPath = uri.fsPath;
        if (!this.isInternalPath(fsPath)) {
          const caller = this.detectCallerIdentity();
          const check = await this.permissionManager.evaluateAccess('Read File', fsPath, caller);
          if (!check.allowed) {
            throw vscode.FileSystemError.NoPermissions(`Access denied by Z-Accept: User denied stat permission for ${fsPath}`);
          }
        }
        return origStat(uri);
      });
    } catch (e) {
      console.warn('[Z-Accept] Could not wrap vscode.workspace.fs.stat:', e);
    }
  }

  /**
   * Intercepts Node.js fs and fs.promises inside the extension host process.
   */
  private interceptNodeFs(): void {
    let nodeFs: any;
    let nodeFsPromises: any;

    try {
      nodeFs = require('fs');
    } catch {
      return;
    }

    try {
      nodeFsPromises = require('fs/promises');
    } catch {
      nodeFsPromises = nodeFs.promises;
    }

    // 1. fs.promises
    if (nodeFsPromises) {
      const wrapPromise = (method: string, action: RequestAction) => {
        const orig = nodeFsPromises[method];
        if (typeof orig === 'function') {
          this.originalNodeFsPromises[method] = orig;

          const replacement = async (...args: any[]) => {
            const targetPath = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].toString ? args[0].toString() : '');
            if (targetPath && !this.isInternalPath(targetPath)) {
              const caller = this.detectCallerIdentity();
              const check = await this.permissionManager.evaluateAccess(action, targetPath, caller);
              if (!check.allowed) {
                const err: any = new Error(`EACCES: permission denied by Z-Accept: ${targetPath}`);
                err.code = 'EACCES';
                err.errno = -13;
                throw err;
              }
            }
            return orig.apply(nodeFsPromises, args);
          };

          try {
            Object.defineProperty(nodeFsPromises, method, {
              value: replacement,
              writable: true,
              configurable: true
            });
          } catch {
            nodeFsPromises[method] = replacement;
          }
        }
      };

      wrapPromise('readFile', 'Read File');
      wrapPromise('writeFile', 'Write File');
      wrapPromise('appendFile', 'Write File');
      wrapPromise('unlink', 'Delete File');
      wrapPromise('rm', 'Delete File');
      wrapPromise('rmdir', 'Delete File');
      wrapPromise('mkdir', 'Write File');
      wrapPromise('readdir', 'List Directory');
    }

    // 2. fs synchronous methods:
    // If an agent tries synchronous access outside project, evaluate against single-use grant or prompt
    const wrapSync = (method: string, action: RequestAction) => {
      const orig = nodeFs[method];
      if (typeof orig === 'function') {
        this.originalNodeFs[method] = orig;

        const replacement = (...args: any[]) => {
          const targetPath = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].toString ? args[0].toString() : '');
          if (targetPath && !this.isInternalPath(targetPath)) {
            // Check if allowed via pathValidator
            const validation = (this.permissionManager as any).pathValidator?.validatePath(targetPath);
            if (validation && !validation.isWithinWorkspace) {
              const consumed = this.permissionManager.consumeSingleUseGrant(action, validation.realPath);
              if (!consumed && this.permissionManager.isEnabled()) {
                // Deny synchronous unpermitted outside-project access
                const caller = this.detectCallerIdentity();
                // Trigger asynchronous notification & record request in background
                this.permissionManager.evaluateAccess(action, targetPath, caller);
                const err: any = new Error(`EACCES: synchronous permission denied by Z-Accept for outside-project path: ${targetPath}`);
                err.code = 'EACCES';
                err.errno = -13;
                throw err;
              }
            }
          }
          return orig.apply(nodeFs, args);
        };

        try {
          Object.defineProperty(nodeFs, method, {
            value: replacement,
            writable: true,
            configurable: true
          });
        } catch {
          nodeFs[method] = replacement;
        }
      }
    };

    wrapSync('readFileSync', 'Read File');
    wrapSync('writeFileSync', 'Write File');
    wrapSync('unlinkSync', 'Delete File');
    wrapSync('rmSync', 'Delete File');
    wrapSync('rmdirSync', 'Delete File');
    wrapSync('mkdirSync', 'Write File');
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    // Restore vscode.workspace.fs
    const fsObj = vscode.workspace.fs;
    if (fsObj) {
      for (const [key, orig] of Object.entries(this.originalVscodeFs)) {
        this.safeDefine(fsObj, key, orig);
      }
    }

    let nodeFs: any;
    let nodeFsPromises: any;
    try {
      nodeFs = require('fs');
    } catch {}
    try {
      nodeFsPromises = require('fs/promises');
    } catch {
      nodeFsPromises = nodeFs?.promises;
    }

    // Restore fs.promises
    if (nodeFsPromises) {
      for (const [key, orig] of Object.entries(this.originalNodeFsPromises)) {
        try {
          Object.defineProperty(nodeFsPromises, key, {
            value: orig,
            writable: true,
            configurable: true
          });
        } catch {
          nodeFsPromises[key] = orig;
        }
      }
    }

    // Restore fs sync
    if (nodeFs) {
      for (const [key, orig] of Object.entries(this.originalNodeFs)) {
        try {
          Object.defineProperty(nodeFs, key, {
            value: orig,
            writable: true,
            configurable: true
          });
        } catch {
          nodeFs[key] = orig;
        }
      }
    }
  }
}
