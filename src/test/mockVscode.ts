// Minimal mock of vscode module for standalone unit testing outside extension host
const EventEmitter = class {
  private listeners: Function[] = [];
  event = (listener: Function) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire = (data: any) => {
    for (const l of this.listeners) {
      l(data);
    }
  };
  dispose = () => {
    this.listeners = [];
  };
};

const mockVscode = {
  EventEmitter,
  workspace: {
    workspaceFolders: [],
    rootPath: undefined,
    getConfiguration: () => ({
      get: (_key: string, defaultVal: any) => defaultVal,
      update: async () => {}
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    fs: {
      readFile: async (_uri?: any) => new Uint8Array(),
      writeFile: async (_uri?: any, _content?: any) => {},
      delete: async (_uri?: any, _options?: any) => {},
      rename: async (_source?: any, _target?: any, _options?: any) => {},
      copy: async (_source?: any, _target?: any, _options?: any) => {},
      createDirectory: async (_uri?: any) => {},
      readDirectory: async (_uri?: any) => [],
      stat: async (_uri?: any) => ({})
    }
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  },
  window: {
    createStatusBarItem: () => ({
      show: () => {},
      dispose: () => {},
      text: '',
      tooltip: '',
      command: ''
    }),
    showWarningMessage: async () => 'Allow',
    showInformationMessage: async () => {},
    showErrorMessage: async () => {},
    setStatusBarMessage: () => ({ dispose: () => {} }),
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    registerWebviewViewProvider: () => ({ dispose: () => {} })
  },
  commands: {
    getCommands: async () => ['chatEditing.acceptAllFiles', 'antigravity.prioritized.agentAcceptAllInFile', 'antigravity.command.accept'],
    executeCommand: async (_cmd: string) => {},
    registerCommand: () => ({ dispose: () => {} })
  },
  env: {
    appName: 'Google Antigravity IDE'
  },
  Uri: {
    file: (f: string) => ({ fsPath: f, scheme: 'file', toString: () => f })
  },
  FileSystemError: {
    NoPermissions: (msg: string) => Object.assign(new Error(msg), { code: 'NoPermissions' })
  },
  ConfigurationTarget: {
    Global: 1
  }
};

// Register in Node module cache so require('vscode') resolves immediately
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path: string) {
  if (path === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

export { mockVscode };
