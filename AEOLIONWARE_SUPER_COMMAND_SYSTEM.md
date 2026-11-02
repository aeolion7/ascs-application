
# AEOLIONWARE SUPER COMMAND SYSTEM (ASCS)

**Developer:** Joseph Lionarons
**Version:** 1.4.2
**Project:** Aeolionware SCS
**Platform:** Windows 11  
**Architecture:** AutoHotkey v2 + Microsoft Edge WebView2

---

# 1. Project Overview

Aeolionware Super Command System (ASCS) is a keyboard-driven Windows automation environment designed to centralize everyday computer operations.

ASCS combines AutoHotkey automation with a graphical WebView2 frontend to provide a unified command interface.

The system uses Super as its Super key, allowing users to access applications and system utilities through keyboard shortcuts.

## Primary Objectives

- Fast keyboard-driven interaction.
- Centralized application launching.
- Persistent quick notes.
- Launching Everything.
- System resource monitoring.
- Reliable Windows automation.
- Consistent visual identity.
- Modular and maintainable architecture.

---

# 2. Architecture

## 2.1 Technology Stack

| Component | Technology |
|---|---|
| Automation | AutoHotkey v2, 64-bit |
| Super Key | Keychron Launcher maps the dedicated key to F24 |
| GUI Framework | Microsoft Edge WebView2 |
| WebView Library | WebViewToo |
| Frontend | HTML, CSS, JavaScript |
| File Search | Voidtools Everything application |
| Window chrome | Custom draggable title bar, controls, and ASCS icon |
| System Monitoring | Windows WMI |
| Persistence | JSON, INI, and text files |

## 2.2 Application Architecture

ASCS uses a frontend/backend architecture.

### Frontend

The frontend is responsible for:

- Rendering the graphical interface.
- Navigation between application views.
- User input.
- Notes editing.
- Dashboard visualization.
- Preferences and command launcher.
- Displaying notifications and status messages.

### Backend

The AutoHotkey backend is responsible for:

- Keyboard shortcuts.
- Application launching.
- File persistence.
- Everything application launching.
- Preferences, workspace, and hardware reporting.
- Windows system queries.
- WebView2 communication.
- Activity logging.

## 2.3 Communication Architecture

ASCS uses WebView2 messaging to communicate between JavaScript and AutoHotkey.

### Frontend to Backend

JavaScript sends messages using:

`window.chrome.webview.postMessage()`

Messages use a newline-separated format:

`MessageType\nMessageContent`

Examples:

| Message | Purpose |
|---|---|
| Ready | Announces frontend readiness |
| GetNotes | Requests saved notes |
| SaveNotes | Saves complete notes JSON (replaces SaveNote) |
| WindowAction | Minimizes, maximizes/restores, or hides the ASCS window |
| GetMetrics | Requests system metrics |
| GetSettings | Requests current preferences |
| SaveSettings | Validates and persists preferences |
| Log | Sends a bounded activity-log entry |

### Backend to Frontend

AutoHotkey sends JSON messages using:

`PostWebMessageAsJson()`

Supported message types:

| Message | Purpose |
|---|---|
| navigate | Changes the active interface |
| notes | Returns opaque notes JSON in `data`, with a `recovered` flag |
| saved | Confirms successful note persistence |
| metrics | Updates CPU/RAM, legacy C: values, and the `drives` array |
| settings | Returns configured drives, snap gap, monitor sizing, and shortcut assignments |
| settingsSaved | Confirms preferences are persisted and applied |
| openLauncher | Opens the command palette |
| flushNotes | Requests immediate persistence of pending note edits |
| error | Displays an error notification |

The `metrics` response retains the C: `disk`, `diskUsed`, and `diskTotal` fields and adds `drives:[{letter, usage, used, total, online}]` and a cached `hardware` object.

### Frontend Readiness

The frontend sends a `Ready` message after its JavaScript initialization.

The backend uses this handshake to determine when frontend communication can begin.

This prevents application data from being sent before the page has initialized.

---

# 3. Application Structure

```text
C:\ASCS\
│
├── ASCS.ahk
├── AEOLIONWARE_SUPER_COMMAND_SYSTEM.md
├── assets\
│   └── ascs.ico
│
├── frontend\
│   ├── assets\
│   │   └── ascs.ico
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── webview\
│   ├── WebViewToo.ahk
│   └── WebView2.ahk
├── lib\
│   └── VirtualDesktopAccessor.dll (optional; desktop switching/window moves)
│
└── data\
    ├── notes.json
    ├── settings.ini
    ├── workspace.ini
    ├── ASCS_Log.txt
    └── WebView2\
```

## 3.1 Main Script

`ASCS.ahk`

Contains:

- Global configuration.
- WebView2 initialization.
- Super shortcut definitions.
- Frontend/backend messaging.
- Application launching.
- Notes persistence.
- Everything application launching.
- Dashboard metrics.
- Activity logging.

## 3.2 Frontend Files

`frontend/index.html`

Defines the application structure and interface elements.

`frontend/styles.css`

Defines the ASCS visual identity and styling.

`frontend/app.js`

Controls frontend behavior, navigation, messaging, notes, and dashboard updates.

## 3.3 WebView Dependencies

`webview/WebViewToo.ahk`

Provides the AutoHotkey WebView2 GUI integration.

`webview/WebView2.ahk`

Provides the underlying WebView2 implementation.

## 3.4 Data Directory

`data/notes.json`

Stores version 2 multi-note JSON; `notes.json.bak` is the prior atomic-save copy.

`data/settings.ini`

Stores user-configured drives, snap gap, monitor-move sizing, and app/view shortcut assignments.

`data/workspace.ini`

Stores the last captured application window layout.

`data/ASCS_Log.txt`

Stores application activity and error information.

`data/WebView2/`

Stores WebView2 browser profile data.

---

# 4. Visual Identity

ASCS uses a unified dark interface.

## 4.1 Design Characteristics

- Dark charcoal backgrounds.
- Indigo and purple accents.
- Segoe UI typography.
- Rounded interface panels.
- Subtle animations.
- Consistent navigation.
- Minimal visual clutter.
- Clear interface hierarchy.

## 4.2 Branding

**AEOLIONWARE**

SUPER COMMAND SYSTEM
---

# 5. Primary Interfaces

ASCS contains five primary interfaces.

## 5.1 Command Center

The central application interface.

Features:

- System overview.
- Quick application launching.
- Navigation to other interfaces.
- CPU, RAM, and one storage card per configured drive.
- Drive letters are editable in Preferences and persisted to `data/settings.ini` (default C: and J:).

## 5.2 Quick Notes

A persistent note-taking interface.

Features:

- Text editing.
- Automatic saving.
- Debounced save requests.
- Backend save acknowledgements.
- JSON-based persistence.

Notes are stored in:

`data/notes.json`

Version 2 storage format:

```json
{
  "version": 2,
  "activeId": "n_...",
  "notes": [
    {"id":"n_...","title":"","type":"note","content":"","pinned":false,"created":"ISO-8601","updated":"ISO-8601"}
  ]
}
```

The frontend migrates legacy `{"content":"..."}` files to one note titled “Scratch”. Note type is `note` or `snippet`; snippets render in monospace and have a copy action.

## 5.3 Everything Launcher

Super + F launches the installed Voidtools Everything application directly. Type in Everything's search field to see results as you type. ASCS has no embedded search view or SDK dependency.

## 5.4 Vivaldi Shortcut

Super + B focuses the topmost existing Vivaldi window, restoring it if minimized; if no Vivaldi window is open, ASCS launches the installed browser. If Vivaldi cannot be found or activated, ASCS logs and displays an error. Super + V remains the Windows Clipboard History shortcut.

## 5.5 Window Appearance

The WebView window disables the native title bar while retaining its normal taskbar button. The window and system-tray icon use the ASCS ICO, which is reapplied whenever the window is shown; the custom title bar includes minimize, maximize/restore, and hide controls. Startup size is up to 1920 × 1080 pixels and is centered within the primary display's work area. The Command Center uses a compact layout at shorter heights to avoid scrolling on open.

## 5.6 System Dashboard

Displays system resource utilization and a hardware inventory.

Features:

- CPU utilization.
- RAM utilization.
- RAM usage in GB.
- Per-drive storage cards from the user-configured drive list (default C: and J:).
- Processor model, cores/threads and maximum clock; graphics adapters, reported memory and driver; physical memory capacity/module count/speed; motherboard, BIOS, and Windows build.
- Physical disk model, capacity, interface, media type, status, partitions, and mapped volumes with drive letters, labels, file systems, and free space.
- Automatic metric updates.

Metrics refresh every five seconds. Network/mapped drives are checked at most every 30 seconds; each drive failure is isolated and displayed as Offline.

Hardware details are collected once per session from:

- Win32_Processor.
- Win32_ComputerSystem.
- Win32_PhysicalMemory.
- Win32_VideoController.
- Win32_DiskDrive.
- Win32_DiskPartition.
- Win32_LogicalDiskToPartition.
- Win32_LogicalDisk.
- Win32_BaseBoard.
- Win32_BIOS.
- Win32_OperatingSystem.
- Windows drive information.

## 5.7 Preferences and Command Launcher

Super + Space opens a searchable launcher for ASCS views, Windows applications, and system actions. Arrow keys move the selection, Enter runs it, and Escape closes the palette.

Preferences configures monitored drives, snap spacing, whether window size is preserved when moving between monitors, and the letter assignments for application/view shortcuts. Shortcut changes rebind immediately. B is reserved for Vivaldi; S, R, L, M, V, J, and Y are reserved for system commands. Preferences are stored in `data/settings.ini`.

## 5.8 Workspaces

Super + S records up to 24 visible application windows and their normalized monitor placement in `data/workspace.ini`; Super + R restores the saved placement and relaunches missing applications. Super + Shift + S remains the Windows Snipping Tool shortcut.

---

# 6. Keyboard Shortcuts

Shortcut tables use “Super” as the user-facing name for the dedicated key; Keychron Launcher maps it to F24 for AutoHotkey.

## 6.1 Primary Interfaces

| Shortcut | Action |
|---|---|
| Super | Command Center |
| Super + Space | Searchable command launcher |
| Super + Q | Quick Notes (default; configurable) |
| Super + I | System Dashboard (default; configurable) |

## 6.2 Application Launching

| Shortcut | Action |
|---|---|
| Super + F | Open Everything (default; configurable) |
| Super + B | Focus an open Vivaldi window or open Vivaldi |
| Super + T | Windows Terminal (default; configurable) |
| Super + E | File Explorer (default; configurable) |
| Super + C | Calculator (default; configurable) |
| Super + H | Task Manager (default; configurable) |

## 6.3 Virtual Desktops and Window Positioning

| Shortcut | Action |
|---|---|
| Super + 1–9 | Focus virtual desktop 1–9, top row or numpad (NumLock on/off) |
| Super + Shift + 1–9 | Move active window to the existing numbered desktop, then switch to it |
| Super + Left / Right | Snap the active resizable window to a monitor half |
| Super + horizontal, then vertical arrow | Snap the window to the corresponding quadrant |
| Super + Shift + Left / Right | Move the active window to the adjacent monitor |
| Super + Up / Down | Maximize; restore a maximized window or otherwise minimize |

## 6.4 System Controls

| Shortcut | Action |
|---|---|
| Super + L | Lock Workstation |
| Super + M | Toggle mute |
| Super + V | Clipboard history |

## 6.5 Text Utilities

| Shortcut | Action |
|---|---|
| Super + J | Insert timestamp |
| Super + Y | Insert date |

Timestamp format:

`yyyy-MM-dd HH:mm:ss`

Date format:

`yyyy-MM-dd`

## 6.6 Workspace Controls

| Shortcut | Action | Status |
|---|---|---|
| Super + Shift + S | Snipping Tool | Implemented |
| Super + S | Save workspace | Implemented |
| Super + R | Restore workspace | Implemented |

The saved workspace is local and limited to 24 visible windows. Applications must still exist at their saved executable paths to be relaunched.

---

# 7. Dependencies

## 7.1 Required Dependencies

1. Windows 10 or Windows 11.
2. AutoHotkey v2, 64-bit.
3. Microsoft Edge WebView2 Runtime.
4. WebViewToo.
5. WebView2.ahk.
6. Required WebView2 loader dependencies.
7. Keychron Launcher configured to emit Super.

## 7.2 Optional Dependencies

**Voidtools Everything**

Install Everything to use Super + F. ASCS opens the application directly; no SDK DLL is required.

**`lib/VirtualDesktopAccessor.dll`**

Required for Super + 1–9 desktop switching and Super + Shift + 1–9 window movement. Place a compatible DLL under `lib`. ASCS reads the existing desktop count and targets only desktops that exist. Verify the `GetDesktopCount`, `GoToDesktopNumber`, and `MoveWindowToDesktopNumber` exports and Windows build compatibility for the DLL version in use. The current upstream API documents `-1` as the error return; ASCS treats nonnegative results as success. If the DLL is missing or fails, desktop actions are disabled rather than using keyboard navigation that could create desktops.

## 7.3 WebView2 Runtime

The Microsoft Edge WebView2 Runtime must be installed and available to the application.

WebView2 profile data is stored in:

`data/WebView2/`

---

# 8. Installation and Startup

## 8.1 Installation

1. Install AutoHotkey v2, 64-bit.
2. Install Microsoft Edge WebView2 Runtime.
3. Configure the Keychron Super key to emit Super.
4. Place WebViewToo and its dependencies in `C:\ASCS\webview`.
5. Place the frontend files, including `assets\ascs.ico`, in `C:\ASCS\frontend`.
6. Place a compatible `VirtualDesktopAccessor.dll` in `C:\ASCS\lib` for desktop switching and window-to-desktop movement.
7. Use Preferences to configure monitored drives and shortcut letters; the defaults are C: and J:.
8. Create the data directory.
9. Run `ASCS.ahk`.

## 8.2 Startup Behavior

ASCS is designed to initialize WebView2 and remain hidden.

The Command Center should appear when Super is pressed.

Closing the interface hides the application instead of terminating the AutoHotkey process.

## 8.3 WebView2 Frontend Loading

The frontend is loaded through a local virtual-host mapping:

`https://ascs.localhost/index.html`

The frontend directory is mapped through WebViewToo's folder-browsing functionality.

This replaces the earlier direct `file:///` navigation approach.

---

# 9. Development Status

This section distinguishes source implementation from verified runtime functionality.

## 9.1 Implemented in Source

- WebViewGui initialization, messaging, readiness handling, and focus via vendored `MoveFocus(0)`.
- Quick Notes input focus on view activation and window focus.
- Quick Notes v2 multi-note editing, legacy migration, atomic saves, `.bak` recovery, and flush-on-hide/close.
- Super+F direct Everything launch, Super+number/numpad, and Super+arrow shortcuts.
- ASCS window icon, custom title bar controls, and display-aware startup sizing.
- Configurable per-drive storage cards, preserving legacy C: metrics and caching network-drive polls.
- Virtual desktop switching, active-window desktop moves, quadrant snapping, and monitor-to-monitor movement.
- Workspace capture/restoration, searchable command launcher, and persistent Preferences.
- Cached WMI hardware reporting in the System Dashboard.
- Runtime-tested on the target Windows system in v1.4.1: Super+E/T/C/H/F launches, command-launcher app actions, foreground activation of already-running apps, Downloads/Documents, Browser, Windows Settings, and Snipping Tool. These launch paths request activation with `WinActivate`.
- Implemented in v1.4.2, runtime testing pending: Super+B focuses the topmost existing Vivaldi window or opens the installed browser, and Vivaldi is available in the command launcher. Super+V remains Clipboard History; B is reserved from configurable shortcut assignments.

## 9.2 Code-Reviewed, Runtime Testing Pending

- WebView2 virtual-host loading, messaging callbacks, and input focus.
- Quick Notes migration/recovery/atomic replacement and flush behavior.
- J: connected, missing, and disconnected-network cases.
- VirtualDesktopAccessor exports and OS-build compatibility; numpad mappings.
- Snap coordinates, monitor work areas, invisible borders, and mixed-DPI displays.
- Keyboard conflicts and all Super combinations on the target keyboard.

## 9.3 New Feature Validation Pending

- Live shortcut rebinding and Preferences validation/persistence.
- Command launcher filtering and keyboard selection.
- Workspace restoration, relaunch matching, and window placement.
- Hardware detail accuracy across systems with multiple GPUs, drives, and RAM modules.
- VirtualDesktopAccessor window-move API and behavior across supported Windows builds.
- Quadrant snapping, snap gaps, monitor movement, and mixed-DPI layouts.

---

# 10. Development Roadmap

## Phase 1: WebView2 Stabilization

- [x] Inspect WebViewToo API.
- [x] Inspect WebView2.ahk API.
- [x] Establish communication architecture.
- [x] Prepare unified messaging protocol.
- [x] Implement frontend readiness handshake.
- [ ] Verify WebView2 initialization on Windows.
- [ ] Verify frontend loading.
- [ ] Verify frontend/backend messaging.
- [ ] Verify hidden startup.
- [ ] Verify Super activation.

## Phase 2: Interface Verification

- [ ] Test Command Center.
- [ ] Test Quick Notes.
- [x] Test Super+F Everything launch.
- [ ] Test System Dashboard.
- [ ] Verify automatic metric updates.

## Phase 3: Feature Verification

- [ ] Verify quadrant snapping and adjacent-monitor movement.
- [ ] Verify Super+Shift+number with the compatible DLL.
- [ ] Verify workspace save and restore.
- [ ] Verify Preferences and command launcher behavior.
- [ ] Verify physical hardware reporting.

## Phase 4: Reliability and Refinement

- [ ] Improve startup reliability.
- [ ] Improve error handling.
- [ ] Review memory and CPU usage.
- [ ] Improve interface responsiveness.
- [ ] Verify shortcut consistency.

## Phase 5: Future Development

- [ ] Expand application launcher.
- [ ] Introduce additional automation tools.
- [ ] Improve workspace integration.
- [ ] Refine overall user experience.

---

# 11. Known Limitations

1. WebView2 initialization has not yet been verified on the target Windows installation.
2. Frontend/backend communication requires runtime testing.
3. Super standalone activation and modifier combinations require physical keyboard testing.
4. Workspace restoration is limited to 24 saved visible windows; apps that no longer exist cannot be relaunched.
5. Super+F requires Everything to be installed; executable detection may need adjustment for portable installations.
6. CPU and RAM metrics depend on WMI reporting.
7. Dashboard metrics are sampled every five seconds.
8. Optional DLL APIs and Windows-version behavior require target-system verification.
9. Network-drive status calls may still wait while being polled; slow drives are cached for 30 seconds.
10. Super+1–9 and Super+Shift+1–9 require VirtualDesktopAccessor.dll; unsupported APIs disable the action without creating desktops.
11. DPI-coordinate behavior for invisible frame-border compensation requires multi-monitor testing.
12. Super+B and Vivaldi window activation/installation discovery require runtime verification; Vivaldi must be installed to launch it.

---

# 12. Testing Procedure

Manual runtime checklist; completed v1.4.1 launch tests and pending v1.4.2 Vivaldi checks are recorded below:

- [x] Launch File Explorer, Windows Terminal, Calculator, Task Manager, and Everything with Super+E/T/C/H/F; confirm each becomes foreground.
- [x] Launch apps through Super+Space and confirm foreground activation, including when the app is already open.
- [x] Launch Downloads and Documents from Super+Space and confirm the correct folder opens in the foreground.
- [x] Launch Browser, Windows Settings, and Snipping Tool from Super+Space.
- [ ] Verify Super+B focuses an existing Vivaldi window (including a minimized one), launches Vivaldi when closed, and reports a clear error if Vivaldi is unavailable.
- [ ] Verify Vivaldi can be launched from the Super+Space command launcher.

- [ ] Open Quick Notes through navigation, Super hotkey, and re-showing the hidden window; confirm the note caret is at the end.
- [ ] Create, rename, filter, pin/unpin, change type, copy a snippet, and delete notes; verify confirmation and save status.
- [ ] Verify atomic save, previous-file backup, backup recovery after corrupting the primary file, legacy `{"content":"..."}` migration to “Scratch”, and save flush when hidden/closed.
- [ ] Verify J: online, missing, and disconnected-network behavior; ensure offline cards do not suppress CPU/RAM metrics and network queries are spaced at least 30 seconds apart.
- [ ] Switch existing desktops with top-row keys and numpad with NumLock on and off; verify requests above the desktop count do nothing and switching is disabled if the DLL is missing.
- [ ] Move windows to existing desktops and verify unavailable numbers do nothing; validate DLL export return semantics.
- [ ] Snap windows to halves/quadrants, maximize, restore/minimize, and move between monitors with mixed DPI; verify the configured gap and size preference.
- [ ] Save and restore a workspace with already-open and closed apps; verify matching and placement behavior.
- [ ] Change shortcut assignments and drive settings; verify validation, persistence, and immediate rebinding.
- [ ] Search and run commands through Super+Space with keyboard and mouse.
- [ ] Verify hardware labels against Windows System Information and Device Manager.
- [ ] Verify Everything's search-as-you-type behavior.

A feature should only be marked runtime-tested after successful execution on the target Windows system.

---

# 13. Changelog

## Version 1.4.2 — Vivaldi Focus-or-Open

- Added Super+B to focus an existing Vivaldi window or launch Vivaldi; added Vivaldi to the command launcher while retaining Super+V for Clipboard History.
- Reserved B from configurable shortcuts and documented the binding in the in-app shortcut reference and Preferences.
- Vivaldi installation discovery, focus behavior, and shortcut operation remain to be runtime-tested on the target Windows system.

## Version 1.4.1 — Application Foreground Activation

- Added process/window waiting and `WinActivate` requests to application launch paths so launched applications are brought to the foreground when Windows allows it.
- Manually verified on the target Windows system: Super+E/T/C/H/F shortcuts; app launches from Super+Space; foreground activation when an app was already open; Downloads and Documents folder launches; Browser, Windows Settings, and Snipping Tool launcher actions.
- Other runtime validation remains pending, including notes, WebView2 integration, dashboard behavior, virtual desktop operations, and workspace restoration.

## Version 1.4.0 — Window Management and Productivity

- Added arrow-key quadrant snapping, snap spacing, and adjacent-monitor movement with an optional size-preservation preference.
- Added active-window movement to an existing virtual desktop with Super+Shift+number.
- Implemented local workspace capture and restoration, including relaunching missing applications.
- Added searchable Super+Space command launcher and Preferences for drives, snap gap, monitor sizing, and shortcut rebinding.
- Added cached physical hardware details to the System Dashboard.
- Expanded shortcut reference and updated frontend/backend messaging and documentation.
- Runtime testing remains pending; validate AHK hotkey syntax, WebView2 integration, DLL API semantics, WMI details, and multi-monitor behavior on target Windows.

## Version 1.3.0 — Notes v2 and Windows Controls

- Added view/window-focus behavior using the vendored WebViewToo `MoveFocus(0)` API.
- Changed Super+F to launch Everything directly; removed embedded search and its SDK files after runtime issues.
- Replaced `SaveNote` with `SaveNotes`; added notes v2, atomic replacement, backup recovery, legacy migration, and hide/close flush.
- Added C:/J: drive metrics and cards, manual `ASCS_Drives` configuration, and 30-second network-drive caching.
- Added virtual desktop number/numpad shortcuts and Super+arrow window positioning.
- Added the ASCS icon, draggable title bar, custom window controls, and display-aware startup sizing.
- Updated the in-app shortcut appendix and corrected the documentation filename in project structure.
- Runtime testing remains pending; no feature is marked runtime-tested.

## Version 1.2.1 — WebView2 Integration Stabilization

### Architecture

- Reviewed WebViewToo API.
- Reviewed WebView2.ahk API.
- Standardized frontend/backend communication.
- Introduced newline-separated frontend message protocol.
- Added JSON-based backend responses.
- Added frontend readiness handshake.
- Added navigation event handling.
- Replaced direct file URL navigation with virtual-host mapping.

### Quick Notes

- Improved JSON persistence.
- Added save acknowledgements.
- Added compatibility with legacy plain-text notes.

### Everything Search

- Improved executable detection.
- Added additional common installation paths.
- Improved registry fallback handling.

### System Dashboard

- Added automatic five-second metric refresh.
- Added frontend metric requests.
- Improved error logging.

### General

- Corrected activity logging argument handling.
- Improved error reporting.
- Updated project documentation.

**Release status:** Implementation prepared. Runtime testing pending.

## Version 1.2.0 — WebView2 Frontend Introduction

### Architecture

- Introduced WebView2 frontend.
- Integrated AutoHotkey and HTML interfaces.
- Established initial frontend/backend communication.

### Interfaces

- Command Center.
- Quick Notes.
- Everything Search.
- System Dashboard.

### Automation

- Introduced Super Super key shortcuts.
- Added application launching.
- Added system controls.
- Added timestamp and date insertion.

**Release status:** Initial implementation. WebView2 integration not fully verified.

---

# 14. Project Identity

**AEOLIONWARE SUPER COMMAND SYSTEM**

ASCS is intended to evolve into a dependable Windows utility suite built around keyboard efficiency, reliability, modularity, and a unified interface.
