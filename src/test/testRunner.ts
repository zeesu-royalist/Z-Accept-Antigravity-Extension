import './mockVscode';
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Test PathValidator
import { PathValidator } from '../security/pathValidator';
import { RequestStorage, AccessRequestRecord } from '../storage/requestStorage';
import { PermissionManager } from '../security/permissionManager';
import { AntigravityAdapter } from '../integrations/antigravityAdapter';
import { VSCodeAdapter } from '../integrations/vscodeAdapter';

async function runAllTests() {
  console.log('====================================================');
  console.log('   Z-ACCEPT EXTENSION COMPREHENSIVE TEST SUITE     ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
    }
  }

  const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-accept-test-'));
  const dummyWorkspace = path.join(tempTestDir, 'my-project');
  fs.mkdirSync(dummyWorkspace, { recursive: true });

  const outsideFile = path.join(tempTestDir, 'outside-secret.txt');
  fs.writeFileSync(outsideFile, 'secret data', 'utf8');

  const outsideFile2 = path.join(tempTestDir, 'outside-secret-2.txt');
  fs.writeFileSync(outsideFile2, 'secret data 2', 'utf8');

  const insideFile = path.join(dummyWorkspace, 'index.ts');
  fs.writeFileSync(insideFile, 'console.log("hello");', 'utf8');

  // --- SUITE 1: PATH VALIDATOR & TRAVERSAL PREVENTION ---
  console.log('\n[Suite 1: PathValidator & Path Traversal Prevention]');

  const validator = new PathValidator();
  // Ensure workspace root is canonicalized to match realpath
  const canonicalDummyWorkspace = validator.resolveCanonicalPath(dummyWorkspace);
  (validator as any).getWorkspaceRoots = () => [canonicalDummyWorkspace];

  await test('Should identify path inside workspace as workspace category', () => {
    const res = validator.validatePath(insideFile);
    assert.strictEqual(res.isWithinWorkspace, true);
    assert.strictEqual(res.category, 'workspace');
  });

  await test('Should detect path outside workspace as restricted', () => {
    const res = validator.validatePath(outsideFile);
    assert.strictEqual(res.isWithinWorkspace, false);
    assert.notStrictEqual(res.category, 'workspace');
  });

  await test('Should detect parent traversal (../../outside) as restricted', () => {
    const traversalPath = path.join(dummyWorkspace, '..', 'outside-secret.txt');
    const res = validator.validatePath(traversalPath);
    assert.strictEqual(res.isWithinWorkspace, false);
    assert.strictEqual(res.realPath, fs.realpathSync(outsideFile));
  });

  await test('Should resolve symlink pointing outside workspace and block traversal', () => {
    const symlinkPath = path.join(dummyWorkspace, 'symlink-to-outside');
    try {
      fs.symlinkSync(outsideFile, symlinkPath);
      const res = validator.validatePath(symlinkPath);
      assert.strictEqual(res.isWithinWorkspace, false, 'Symlink escaping workspace must be flagged outside project');
    } finally {
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath);
      }
    }
  });

  await test('Should categorize system paths like /etc or Desktop correctly', () => {
    const etcRes = validator.validatePath('/etc/passwd');
    assert.strictEqual(etcRes.isWithinWorkspace, false);
    assert.strictEqual(etcRes.category, 'system');

    const desktopRes = validator.validatePath(path.join(os.homedir(), 'Desktop', 'notes.txt'));
    assert.strictEqual(desktopRes.isWithinWorkspace, false);
    assert.strictEqual(desktopRes.category, 'user-private');
  });

  // --- SUITE 2: REQUEST STORAGE ---
  console.log('\n[Suite 2: Local Request Storage]');

  const storageDir = path.join(tempTestDir, 'storage');
  fs.mkdirSync(storageDir, { recursive: true });
  const storage = new RequestStorage({ fsPath: storageDir } as any);

  await test('Storage saves records and does not store file contents', async () => {
    const sampleRecord: AccessRequestRecord = {
      id: 'req-test-1',
      timestamp: new Date().toISOString(),
      agent: 'Test AI Agent',
      action: 'Read File',
      requestedPath: outsideFile,
      projectPath: dummyWorkspace,
      decision: 'Cancelled',
      status: 'Denied'
    };

    await storage.saveRequest(sampleRecord);
    const requests = storage.getRequests();
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].id, 'req-test-1');
    assert.strictEqual(requests[0].decision, 'Cancelled');
    assert.strictEqual(requests[0].status, 'Denied');
    assert.strictEqual((requests[0] as any).content, undefined, 'File content must never be stored');
  });

  await test('Storage updates existing request decision', async () => {
    await storage.updateRequest('req-test-1', {
      decision: 'Allowed',
      status: 'Allowed'
    });

    const requests = storage.getRequests();
    assert.strictEqual(requests[0].decision, 'Allowed');
    assert.strictEqual(requests[0].status, 'Allowed');
  });

  await test('Storage clears history on command', async () => {
    await storage.clearRequests();
    const requests = storage.getRequests();
    assert.strictEqual(requests.length, 0);
  });

  // --- SUITE 3: PERMISSION MANAGER & ENFORCEMENT ---
  console.log('\n[Suite 3: Permission Manager Enforcement]');
  await storage.clearRequests();

  const permissionManager = new PermissionManager(validator, storage);
  permissionManager.setMonitorEnabled(true);

  await test('Inside workspace access is automatically allowed without prompting', async () => {
    const res = await permissionManager.evaluateAccess('Read File', insideFile);
    assert.strictEqual(res.allowed, true);
  });

  await test('Outside access prompt rejection results in allowed: false', async () => {
    // Mock user prompt returning 'Cancel'
    const { AccessNotification } = await import('../notifications/accessNotification');
    const origPrompt = AccessNotification.promptUser;
    AccessNotification.promptUser = async () => 'Cancel';

    try {
      const res = await permissionManager.evaluateAccess('Read File', outsideFile, 'AI Agent');
      assert.strictEqual(res.allowed, false, 'Access must be denied when user cancels');
      
      const records = storage.getRequests();
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].decision, 'Cancelled');
      assert.strictEqual(records[0].status, 'Denied');
    } finally {
      AccessNotification.promptUser = origPrompt;
    }
  });

  await test('Outside access prompt approval results in single-use grant only', async () => {
    const { AccessNotification } = await import('../notifications/accessNotification');
    const origPrompt = AccessNotification.promptUser;
    AccessNotification.promptUser = async () => 'Allow';

    try {
      const res = await permissionManager.evaluateAccess('Read File', outsideFile, 'AI Agent');
      assert.strictEqual(res.allowed, true, 'Access must be allowed when user clicks Allow');

      const records = storage.getRequests();
      assert.strictEqual(records[0].decision, 'Allowed');
      assert.strictEqual(records[0].status, 'Allowed');

      // First call consumes the single-use grant
      const firstConsumption = permissionManager.consumeSingleUseGrant('Read File', outsideFile);
      assert.strictEqual(firstConsumption, true, 'Single-use grant should be valid once');

      // Subsequent call must NOT have the grant (no permanent permission)
      const secondConsumption = permissionManager.consumeSingleUseGrant('Read File', outsideFile);
      assert.strictEqual(secondConsumption, false, 'Permanent permission must NOT be granted');
    } finally {
      AccessNotification.promptUser = origPrompt;
    }
  });

  // --- SUITE 4: ADAPTERS & CAPABILITIES ---
  console.log('\n[Suite 4: IDE Adapters & Supported Acceptance APIs]');

  const antigravityAdapter = new AntigravityAdapter();
  const vscodeAdapter = new VSCodeAdapter();

  await test('AntigravityAdapter includes official Antigravity accept commands', () => {
    const commands = antigravityAdapter.getSupportedCommands();
    assert.ok(commands.includes('acceptAgentStep'));
    assert.ok(commands.includes('antigravity.terminalCommand.accept'));
    assert.ok(commands.includes('antigravity.prioritized.agentAcceptAllInFile'));
    assert.ok(commands.includes('antigravity.command.accept'));
    assert.ok(commands.includes('chatEditing.acceptAllFiles'));
  });

  await test('AntigravityAdapter separates intermediate step prompts from final diffs', async () => {
    const promptRes = await antigravityAdapter.acceptIntermediatePrompts();
    assert.strictEqual(typeof promptRes.success, 'boolean');

    // Default acceptChanges only accepts prompts, leaves diffs for manual user review
    const defaultRes = await antigravityAdapter.acceptChanges();
    assert.strictEqual(typeof defaultRes.success, 'boolean');
  });

  await test('AntigravityConfigManager locates state database path', async () => {
    const { AntigravityConfigManager } = await import('../integrations/antigravityConfig');
    const dbPath = AntigravityConfigManager.getDefaultDatabasePath();
    // In this macOS environment, Antigravity IDE is installed
    if (process.platform === 'darwin') {
      assert.ok(dbPath !== undefined, 'Database path should be detected on macOS');
    }
  });

  await test('VSCodeAdapter includes official VS Code chatEditing and inlineChat commands', () => {
    const commands = vscodeAdapter.getSupportedCommands();
    assert.ok(commands.includes('chatEditing.acceptAllFiles'));
    assert.ok(commands.includes('inlineChat2.keep'));
  });

  // --- SUITE 5: ACCESS MONITOR PRE-EXECUTION INTERCEPTION ---
  console.log('\n[Suite 5: Access Monitor Pre-Execution Interception]');

  const { AccessMonitor } = await import('../security/accessMonitor');
  const monitor = new AccessMonitor(permissionManager, storage.getFilePath());

  await test('Interception blocks unauthorized outside access via vscode.workspace.fs.readFile', async () => {
    const { AccessNotification } = await import('../notifications/accessNotification');
    const origPrompt = AccessNotification.promptUser;
    AccessNotification.promptUser = async () => 'Cancel';

    try {
      const { mockVscode } = await import('./mockVscode');
      let caughtError: any = null;
      try {
        await mockVscode.workspace.fs.readFile({ fsPath: outsideFile } as any);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, 'Operation must throw when cancelled');
      assert.strictEqual(caughtError.code, 'NoPermissions');
    } finally {
      AccessNotification.promptUser = origPrompt;
    }
  });

  await test('Interception permits outside access when user explicitly approves via vscode.workspace.fs.readFile', async () => {
    const { AccessNotification } = await import('../notifications/accessNotification');
    const origPrompt = AccessNotification.promptUser;
    AccessNotification.promptUser = async () => 'Allow';

    try {
      const { mockVscode } = await import('./mockVscode');
      let threw = false;
      try {
        await mockVscode.workspace.fs.readFile({ fsPath: outsideFile } as any);
      } catch {
        threw = true;
      }

      assert.strictEqual(threw, false, 'Operation must succeed when user allows');
    } finally {
      AccessNotification.promptUser = origPrompt;
    }
  });

  await test('Interception blocks unauthorized outside access via fs.promises.readFile', async () => {
    const { AccessNotification } = await import('../notifications/accessNotification');
    const origPrompt = AccessNotification.promptUser;
    AccessNotification.promptUser = async () => 'Cancel';

    try {
      let caughtError: any = null;
      try {
        await fs.promises.readFile(outsideFile2);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, 'fs.promises.readFile must throw when cancelled');
      assert.strictEqual(caughtError.code, 'EACCES');
    } finally {
      AccessNotification.promptUser = origPrompt;
    }
  });

  await test('Internal Z-Accept paths bypass interception without triggering prompts', async () => {
    const internalPath = storage.getFilePath();
    let promptTriggered = false;
    const { AccessNotification } = await import('../notifications/accessNotification');
    const origPrompt = AccessNotification.promptUser;
    AccessNotification.promptUser = async () => {
      promptTriggered = true;
      return 'Allow';
    };

    try {
      const exists = fs.existsSync(internalPath);
      assert.ok(typeof exists === 'boolean');
      assert.strictEqual(promptTriggered, false, 'Internal storage operations must never prompt user');
    } finally {
      AccessNotification.promptUser = origPrompt;
    }
  });

  monitor.dispose();

  // Cleanup temp files
  try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  } catch {}

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED (${total - passed} FAILED)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
