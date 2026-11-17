import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';

export interface PathValidationResult {
  isWithinWorkspace: boolean;
  requestedPath: string;
  normalizedPath: string;
  realPath: string;
  category: 'workspace' | 'system' | 'user-private' | 'outside-project';
  matchedWorkspaceRoot: string | null;
  primaryWorkspaceRoot: string;
}

export class PathValidator {
  private homeDir: string;

  constructor() {
    this.homeDir = path.resolve(os.homedir());
  }

  /**
   * Resolves the canonical physical path, resolving any symbolic links and relative segments.
   */
  public resolveCanonicalPath(targetPath: string): string {
    const normalized = path.resolve(path.normalize(targetPath));

    try {
      if (fs.existsSync(normalized)) {
        return fs.realpathSync.native ? fs.realpathSync.native(normalized) : fs.realpathSync(normalized);
      }
      
      // If target file doesn't exist yet (e.g. creating a new file), resolve existing parent
      let current = normalized;
      const uncreatedParts: string[] = [];
      while (!fs.existsSync(current) && current !== path.dirname(current)) {
        uncreatedParts.unshift(path.basename(current));
        current = path.dirname(current);
      }

      if (fs.existsSync(current)) {
        const resolvedParent = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current);
        return path.join(resolvedParent, ...uncreatedParts);
      }
    } catch {
      // Fallback to normalized
    }

    return normalized;
  }

  /**
   * Gets list of current workspace folder canonical paths.
   */
  public getWorkspaceRoots(): string[] {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return [];
    }

    return folders.map(f => this.resolveCanonicalPath(f.uri.fsPath));
  }

  /**
   * Checks whether a target file/dir path resides inside the open project/workspace.
   */
  public validatePath(targetPath: string): PathValidationResult {
    const normalized = path.resolve(path.normalize(targetPath));
    const real = this.resolveCanonicalPath(normalized);
    const workspaceRoots = this.getWorkspaceRoots();

    const primaryWorkspaceRoot = workspaceRoots.length > 0 
      ? workspaceRoots[0] 
      : (vscode.workspace.rootPath ? this.resolveCanonicalPath(vscode.workspace.rootPath) : '<No Active Workspace>');

    // If no workspace is open, any path is considered outside project
    if (workspaceRoots.length === 0) {
      const category = this.categorizeLocation(real);
      return {
        isWithinWorkspace: false,
        requestedPath: targetPath,
        normalizedPath: normalized,
        realPath: real,
        category,
        matchedWorkspaceRoot: null,
        primaryWorkspaceRoot
      };
    }

    // Compare with each open workspace folder
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const caseInsensitive = isWindows || isMac;

    const targetToCompare = caseInsensitive ? real.toLowerCase() : real;

    for (const wsRoot of workspaceRoots) {
      const wsToCompare = caseInsensitive ? wsRoot.toLowerCase() : wsRoot;

      // Exact match or sub-path inside workspace folder
      if (targetToCompare === wsToCompare) {
        return {
          isWithinWorkspace: true,
          requestedPath: targetPath,
          normalizedPath: normalized,
          realPath: real,
          category: 'workspace',
          matchedWorkspaceRoot: wsRoot,
          primaryWorkspaceRoot
        };
      }

      const wsWithSep = wsToCompare.endsWith(path.sep) ? wsToCompare : wsToCompare + path.sep;
      if (targetToCompare.startsWith(wsWithSep)) {
        return {
          isWithinWorkspace: true,
          requestedPath: targetPath,
          normalizedPath: normalized,
          realPath: real,
          category: 'workspace',
          matchedWorkspaceRoot: wsRoot,
          primaryWorkspaceRoot
        };
      }
    }

    // Path is outside current project
    const category = this.categorizeLocation(real);
    return {
      isWithinWorkspace: false,
      requestedPath: targetPath,
      normalizedPath: normalized,
      realPath: real,
      category,
      matchedWorkspaceRoot: null,
      primaryWorkspaceRoot
    };
  }

  private categorizeLocation(canonicalPath: string): 'system' | 'user-private' | 'outside-project' {
    const lower = canonicalPath.toLowerCase();

    // Check system root folders
    if (
      lower.startsWith('/etc') ||
      lower.startsWith('/private/etc') ||
      lower.startsWith('/var') ||
      lower.startsWith('/private/var') ||
      lower.startsWith('/usr') ||
      lower.startsWith('/bin') ||
      lower.startsWith('/sbin') ||
      lower.startsWith('/system') ||
      lower.startsWith('/library') ||
      lower.startsWith('c:\\windows') ||
      lower.startsWith('c:\\program files')
    ) {
      return 'system';
    }

    // Check user private folders (Desktop, Documents, Downloads, ssh, etc.)
    const homeLower = this.homeDir.toLowerCase();
    if (lower.startsWith(homeLower)) {
      const relToHome = path.relative(this.homeDir, canonicalPath).toLowerCase();
      if (
        relToHome.startsWith('desktop') ||
        relToHome.startsWith('documents') ||
        relToHome.startsWith('downloads') ||
        relToHome.startsWith('.ssh') ||
        relToHome.startsWith('.aws') ||
        relToHome.startsWith('.config') ||
        relToHome.startsWith('.gemini')
      ) {
        return 'user-private';
      }
    }

    return 'outside-project';
  }
}
