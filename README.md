<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/logo_light.png">
    <source media="(prefers-color-scheme: light)" srcset="media/logo_dark.png">
    <img alt="Z-Accept Logo" src="media/logo.png" width="180">
  </picture>
</p>

<h1 align="center">Z-Accept</h1>

<p align="center">
  <strong>Auto-confirm intermediate AI tool execution popups &amp; keep final code diff review strictly manual.</strong>
</p>

<p align="center">
  <a href="https://github.com/zeesu-royalist/Z-Accept-Antigravity-Extension"><img src="https://img.shields.io/badge/Version-1.0.0-0e639c.svg?style=flat-square" alt="Version"></a>
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://zeesu-royalist.vercel.app"><img src="https://img.shields.io/badge/Author-Zeesu%20Royalist-ff007f.svg?style=flat-square" alt="Author"></a>
  <a href="#"><img src="https://img.shields.io/badge/Platform-Antigravity%20IDE%20%7C%20VS%20Code-4e9de0.svg?style=flat-square" alt="Platform"></a>
  <a href="#"><img src="https://img.shields.io/badge/Privacy-100%25%20Local-success.svg?style=flat-square" alt="Privacy"></a>
</p>

---

## ⚡ Why Z-Accept?

When prompting AI coding agents in **Google Antigravity IDE** or **VS Code**, intermediate commands (like `git status`, `git add`, `cd`, `ls`, `npm test`, `python3`) repeatedly trigger annoying confirmation popups:

> *"Allow find terminalCommand handlers?"*  
> *"Allow git status?"*  
> *"Allow npm test?"*  
> `1. Yes, allow this time` &nbsp;→&nbsp; `[ Submit ↵ ]`

Having to manually press <kbd>Enter</kbd> or click `Submit` 10–20 times during a single prompt breaks your concentration.

**Z-Accept solves this completely:**
- ✅ **Bypasses & Auto-Confirms Tool Popups**: Intermediary terminal and command confirmation popups are automatically confirmed in **20ms**, letting the agent work without interruption.
- 🛡️ **Manual Final Code Review**: When code generation finishes, **you retain 100% manual control** to review the full code diff before accepting or rejecting files.
- 🚀 **Zero Annoyance**: No intrusive modal popups, no blocking dialogs, no broken workflows.

---

## 📊 Comparison: Without vs With Z-Accept

| Action / Stage | Without Z-Accept ❌ | With Z-Accept ⚡ |
| :--- | :--- | :--- |
| **Intermediate `git` / `cd` / `ls`** | Pauses work, forces repeated <kbd>Enter</kbd> / `Submit` | **Auto-submitted in 20ms (Zero friction)** |
| **Command Execution Policy** | Often set to *Request Review* | **Synchronized to Native Turbo / Eager** |
| **Pre-Approved Commands** | Asks for confirmation on basic tools | **`git`, `python3`, `node`, `npm`, `cd`, `ls` pre-approved** |
| **Final Multi-File Code Diff** | Manual | **Manual (Always safe & under your control)** |
| **Screen Blocking Popups** | Frequent interruptions | **Zero blocking popups** |

---

## 🎯 Key Features

### 1. ⚡ Instant Tool Popup Auto-Bypass
- Automatically triggers Option 1 (`Yes, allow this time`) on intermediate tool prompts.
- Ensures `git status`, `git add`, `cd`, `ls`, `npm`, and test scripts execute seamlessly.
- Eliminates the need to sit and hit <kbd>Enter</kbd> every few seconds.

### 2. 🛡️ Safe Code Acceptance Boundary
- Distinguishes intermediate tool steps from final code diffs.
- Code changes remain in the editor's review panel for your explicit approval.
- You never have to worry about the extension auto-applying unintended code diffs blindly.

### 3. 🚀 Antigravity Turbo Engine Synchronization
- Built-in adapter for **Google Antigravity IDE**:
  - Automatically synchronizes `autoExecutionPolicy = EAGER (Turbo)`.
  - Sets global pre-approval for standard developer tools (`git`, `python3`, `node`, `npm`, `cd`, `ls`, `cat`, `rm`, `mkdir`, etc.).
- Built-in adapter for **Visual Studio Code** chat and inline diff commands.

### 4. 🎨 Minimalist Control Panel
- Clean, native sidebar interface styled to match Antigravity IDE and VS Code aesthetics:
  - **Tool Popup Auto-Bypass Toggle**: Turn auto-confirmation on or off with one click.
  - **Manual Code Diff Review Status**: Confirms that final diffs remain manual.
  - **Single-click Turbo Sync**: Re-syncs native IDE policies anytime.
  - **Razor-sharp "ZA" Monogram Branding**: Adaptive dark/light theme graphics.

---

## 🚀 Quick Start

### Installation

1. Download or package the `.vsix` file:
   ```bash
   npm run package
   ```
2. Install in Google Antigravity IDE or VS Code:
   ```bash
   code --install-extension z-accept-1.0.0.vsix --force
   ```

### Optimal 1-Click Setup in Antigravity IDE

To get the absolute best experience with zero interruptions:
1. Open your Antigravity chat panel.
2. In the chat input footer (bottom right/left of the prompt box), click the preset selector (where it says *Default* or *Request Review*).
3. Select **"Turbo"**.

> [!TIP]
> **Turbo mode** runs all developer tools without restrictions, while keeping the final code changes waiting for your manual review.

---

## ⚙️ Configuration (`settings.json`)

Customize Z-Accept behavior in your VS Code / Antigravity `settings.json`:

```json
{
  // Automatically confirm intermediate tool execution steps (git, cd, ls, etc.)
  "zAccept.autoConfirmSteps": true,

  // Keep final code diffs manual (Set to true only if you want full auto-accept of diffs)
  "zAccept.autoAcceptDiffs": false,

  // Debounce delay (ms) for code checks
  "zAccept.autoAccept.delayMs": 500,

  // Security perimeter monitor (Disabled by default to prevent blocking popups)
  "zAccept.securityMonitor.enabled": false
}
```

---

## ⌨️ Commands & Shortcuts

| Command | Title | Description |
| :--- | :--- | :--- |
| `z-accept.focusView` | **Z-Accept: Focus Control Panel** | Opens the Z-Accept sidebar view |
| `z-accept.toggleAutoAccept` | **Z-Accept: Toggle Tool/Prompt Auto-Bypass** | Quickly enable/disable tool auto-confirm |
| `z-accept.syncTurboMode` | **Z-Accept: Sync IDE Turbo Auto-Execution** | Re-applies Turbo execution policy to IDE |
| `z-accept.acceptPendingNow` | **Z-Accept: Accept Pending Changes Now** | Force-accepts currently open editor diffs |

---

## 🔒 Privacy & Local Security

- **100% Local Execution**: Runs entirely inside your local IDE extension host.
- **No Telemetry or Tracking**: Does not collect, transmit, or phone home any code or analytics.
- **Zero File Content Logging**: Does not store or inspect your source code contents.

---

## 👨‍💻 Author & Maintainer

**Zeesu Royalist**  
- 🌐 **Website**: [zeesu-royalist.vercel.app](https://zeesu-royalist.vercel.app)
- 🐙 **GitHub**: [@zeesu-royalist](https://github.com/zeesu-royalist)
- 📦 **Project Repository**: [Z-Accept-Antigravity-Extension](https://github.com/zeesu-royalist/Z-Accept-Antigravity-Extension)

---

## 📄 License

Licensed under the [MIT License](LICENSE.txt). © 2026 [Zeesu Royalist](https://zeesu-royalist.vercel.app). All rights reserved.
