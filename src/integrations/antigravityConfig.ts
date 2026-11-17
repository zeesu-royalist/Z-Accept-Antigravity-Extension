import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

export interface AntigravitySyncResult {
  success: boolean;
  updated: boolean;
  message: string;
  dbPath?: string;
}

/**
 * Helper to manage native Google Antigravity IDE configuration and hooks
 * so that intermediate tool execution prompts (e.g. git status, terminal commands)
 * execute and submit automatically without requiring manual Enter/Submit clicks.
 */
export class AntigravityConfigManager {
  /**
   * Automatically locates the Antigravity IDE state.vscdb path across platforms.
   */
  public static getDefaultDatabasePath(): string | undefined {
    let dbPath: string | undefined;

    if (process.platform === 'darwin') {
      dbPath = path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Antigravity IDE',
        'User',
        'globalStorage',
        'state.vscdb'
      );
    } else if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      dbPath = path.join(appData, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');
    } else {
      // Linux
      dbPath = path.join(
        os.homedir(),
        '.config',
        'Antigravity IDE',
        'User',
        'globalStorage',
        'state.vscdb'
      );
    }

    return fs.existsSync(dbPath) ? dbPath : undefined;
  }

  /**
   * Locates the Antigravity IDE app bundle output directory.
   */
  public static getAppOutDirectory(): string | undefined {
    let appOut: string | undefined;

    if (process.platform === 'darwin') {
      appOut = '/Applications/Antigravity IDE.app/Contents/Resources/app/out';
    } else if (process.platform === 'win32') {
      const localApp = process.env.LOCALAPPDATA || '';
      appOut = path.join(localApp, 'Programs', 'Antigravity IDE', 'resources', 'app', 'out');
    } else {
      appOut = '/usr/share/antigravity-ide/resources/app/out';
    }

    return fs.existsSync(appOut) ? appOut : undefined;
  }

  /**
   * Ensures the auto-submit hook is active in Antigravity's UI bundle
   * so that any intermediate permission popup (e.g. ask_permission) automatically
   * triggers the 'Submit' button after 40ms without requiring manual user intervention.
   */
  public static ensureAutoSubmitInjected(): { success: boolean; modified: boolean; message: string } {
    const appOut = this.getAppOutDirectory();
    if (!appOut) {
      return { success: false, modified: false, message: 'Antigravity IDE app directory not found.' };
    }

    let modifiedCount = 0;

    // 1. Check and patch jetskiAgent/main.js
    const jetskiPath = path.join(appOut, 'jetskiAgent', 'main.js');
    if (fs.existsSync(jetskiPath)) {
      try {
        let code = fs.readFileSync(jetskiPath, 'utf8');
        let fileModified = false;

        if (code.includes('Nct=()=>za(et.CASCADE_AUTO_EXECUTION_POLICY)')) {
          code = code.replace('Nct=()=>za(et.CASCADE_AUTO_EXECUTION_POLICY)', 'Nct=()=>3');
          fileModified = true;
        }
        if (code.includes('function Ern(e,t,r={}){let n=r.default===!1?"request_review":"default";')) {
          code = code.replace(
            'function Ern(e,t,r={}){let n=r.default===!1?"request_review":"default";',
            'function Ern(e,t,r={}){return "turbo";let n=r.default===!1?"request_review":"default";'
          );
          fileModified = true;
        }

        if (fileModified) {
          fs.writeFileSync(jetskiPath, code, 'utf8');
          modifiedCount++;
        }
      } catch (err: any) {
        console.warn('[Z-Accept] Notice while checking jetskiAgent/main.js:', err.message);
      }
    }

    // 2. Check and patch workbench.desktop.main.js
    const workbenchPath = path.join(appOut, 'vs', 'workbench', 'workbench.desktop.main.js');
    if (fs.existsSync(workbenchPath)) {
      try {
        let code = fs.readFileSync(workbenchPath, 'utf8');
        const marker = 'zAccept_autoSubmit';
        if (!code.includes(marker)) {
          const target = ',be=z(()=>{se(!1)},[se]);return s?v(k8t,{';
          const injection = ',be=z(()=>{se(!1)},[se]);Oe(()=>{/* zAccept_autoSubmit */if(s&&re){try{setTimeout(()=>{re()},30)}catch(e){}}},[s,re]);return s?v(k8t,{';
          if (code.includes(target)) {
            code = code.replace(target, injection);
            fs.writeFileSync(workbenchPath, code, 'utf8');
            modifiedCount++;
          }
        }
      } catch (err: any) {
        console.warn('[Z-Accept] Notice while checking workbench.desktop.main.js:', err.message);
      }
    }

    // 3. Check and patch main.js (Root entry bundle)
    const rootMainPath = path.join(appOut, 'main.js');
    if (fs.existsSync(rootMainPath)) {
      try {
        let code = fs.readFileSync(rootMainPath, 'utf8');
        let fileModified = false;

        // Force Turbo/Eager execution policy for all terminal commands
        if (code.includes('cYe=()=>to(ot.CASCADE_AUTO_EXECUTION_POLICY)')) {
          code = code.replace('cYe=()=>to(ot.CASCADE_AUTO_EXECUTION_POLICY)', 'cYe=()=>3');
          fileModified = true;
        }

        // Force Turbo preset default
        if (code.includes('function Ygi(e,t,n={}){let r=n.default===!1?"request_review":"default";')) {
          code = code.replace(
            'function Ygi(e,t,n={}){let r=n.default===!1?"request_review":"default";',
            'function Ygi(e,t,n={}){return "turbo";let r=n.default===!1?"request_review":"default";'
          );
          fileModified = true;
        }

        // Auto-submit interaction dialog
        const o1eTarget = 'let de=e[i];if(!de)return null;let Ne=s1e(n[i],r[i]),Ee=i===a-1,we=()=>{Ee?l():o()}';
        const o1eInjection = 'let de=e[i];if(!de)return null;let Ne=s1e(n[i],r[i]),Ee=i===a-1,we=()=>{Ee?l():o()};Re(()=>{if((N==="ask_permission"||N==="ask_custom_permission")&&Ee&&Ne){try{setTimeout(()=>{we()},20)}catch(e){}}},[N,Ee,Ne])';
        if (code.includes(o1eTarget) && !code.includes('Re(()=>{if((N==="ask_permission"')) {
          code = code.replace(o1eTarget, o1eInjection);
          fileModified = true;
        }

        if (fileModified) {
          fs.writeFileSync(rootMainPath, code, 'utf8');
          modifiedCount++;
        }
      } catch (err: any) {
        console.warn('[Z-Accept] Notice while checking root main.js:', err.message);
      }
    }

    return {
      success: true,
      modified: modifiedCount > 0,
      message: modifiedCount > 0
        ? `Injected auto-submit engine into ${modifiedCount} IDE UI modules.`
        : 'Auto-submit engine already active in IDE UI.'
    };
  }

  /**
   * Synchronizes Antigravity preferences to ensure Turbo / Eager execution is enabled,
   * bypassing intermediate command prompts like 'git status', terminal runs, etc.
   */
  public static syncTurboExecutionPolicy(customDbPath?: string): AntigravitySyncResult {
    const dbPath = customDbPath || this.getDefaultDatabasePath();
    if (!dbPath || !fs.existsSync(dbPath)) {
      return {
        success: false,
        updated: false,
        message: 'Antigravity IDE state database (state.vscdb) not found.'
      };
    }

    try {
      const sqliteBinary = process.platform === 'darwin' ? '/usr/bin/sqlite3' : 'sqlite3';

      const query = "SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.agentPreferences';";
      const currentBase64 = execFileSync(sqliteBinary, [dbPath, query], {
        encoding: 'utf8',
        timeout: 3000
      }).trim();

      if (!currentBase64) {
        return {
          success: false,
          updated: false,
          message: 'agentPreferences key not found in Antigravity state.',
          dbPath
        };
      }

      const raw = Buffer.from(currentBase64, 'base64');

      const targetOff = Buffer.from('&terminalAutoExecutionPolicySentinelKey\x12\x06\n\x04EAE=');
      const targetAuto = Buffer.from('&terminalAutoExecutionPolicySentinelKey\x12\x06\n\x04EAI=');
      const replacementTurbo = Buffer.from('&terminalAutoExecutionPolicySentinelKey\x12\x06\n\x04EAM=');

      if (raw.includes(replacementTurbo)) {
        return {
          success: true,
          updated: false,
          message: 'Antigravity IDE is already running in Turbo Auto-Execution mode.',
          dbPath
        };
      }

      let updatedRaw: Buffer | null = null;
      if (raw.includes(targetOff)) {
        const idx = raw.indexOf(targetOff);
        updatedRaw = Buffer.concat([
          raw.subarray(0, idx),
          replacementTurbo,
          raw.subarray(idx + targetOff.length)
        ]);
      } else if (raw.includes(targetAuto)) {
        const idx = raw.indexOf(targetAuto);
        updatedRaw = Buffer.concat([
          raw.subarray(0, idx),
          replacementTurbo,
          raw.subarray(idx + targetAuto.length)
        ]);
      }

      if (updatedRaw) {
        const newBase64 = updatedRaw.toString('base64');
        const updateQuery = `UPDATE ItemTable SET value = '${newBase64}' WHERE key = 'antigravityUnifiedStateSync.agentPreferences';`;
        execFileSync(sqliteBinary, [dbPath, updateQuery], {
          encoding: 'utf8',
          timeout: 3000
        });

        return {
          success: true,
          updated: true,
          message: 'Antigravity IDE updated to Turbo Auto-Execution mode. Intermediate tool prompts bypassed!',
          dbPath
        };
      }

      return {
        success: true,
        updated: false,
        message: 'No execution policy changes required.',
        dbPath
      };
    } catch (err: any) {
      return {
        success: false,
        updated: false,
        message: `Notice configuring Antigravity state: ${err.message || err}`,
        dbPath
      };
    }
  }

  /**
   * Synchronizes all Antigravity settings and engines.
   */
  public static syncAll(): { success: boolean; message: string } {
    const dbRes = this.syncTurboExecutionPolicy();
    const injectRes = this.ensureAutoSubmitInjected();

    return {
      success: dbRes.success && injectRes.success,
      message: `${dbRes.message} | ${injectRes.message}`
    };
  }
}
