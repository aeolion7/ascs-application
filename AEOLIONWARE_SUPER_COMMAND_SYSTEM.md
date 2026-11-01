
# AEOLIONWARE SUPER COMMAND SYSTEM (ASCS)

**Developer:** Joseph Lionarons
**Version:** 1.3.0
**Project:** Aeolionware SCS
**Platform:** Windows 11  
**Architecture:** AutoHotkey v2 + Microsoft Edge WebView2

---

# 1. Project Overview

Aeolionware Super Command System (ASCS) is a keyboard-driven Windows automation environment designed to centralize everyday computer operations.

ASCS combines AutoHotkey automation with a graphical WebView2 frontend to provide a unified command interface.

The system uses F24 as its Super key, allowing users to access applications and system utilities through keyboard shortcuts.

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
| Super Key | Keychron Launcher F24 |
| GUI Framework | Microsoft Edge WebView2 |
| WebView Library | WebViewToo |
| Frontend | HTML, CSS, JavaScript |
| File Search | Voidtools Everything application |
| Window chrome | Custom draggable title bar, controls, and ASCS icon |
| System Monitoring | Windows WMI |
| Persistence | JSON and text files |

## 2.2 Application Architecture

ASCS uses a frontend/backend architecture.

### Frontend

The frontend is responsible for:

- Rendering the graphical interface.
- Navigation between application views.
- User input.
- Notes editing.
- Dashboard visualization.
- Displaying notifications and status messages.

### Backend

The AutoHotkey backend is responsible for:

- Keyboard shortcuts.
- Application launching.
- File persistence.
- Everything application launching.
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
| flushNotes | Requests immediate persistence of pending note edits |
| error | Displays an error notification |

The `metrics` response retains the C: `disk`, `diskUsed`, and `diskTotal` fields and adds `drives:[{letter, usage, used, total, online}]`.

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
│   └── VirtualDesktopAccessor.dll (required for F24 + 1–9)
│
└── data\
    ├── notes.json
    ├── ASCS_Log.txt
    └── WebView2\
```

## 3.1 Main Script

`ASCS.ahk`

Contains:

- Global configuration.
- WebView2 initialization.
- F24 shortcut definitions.
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

ASCS contains four primary interfaces.

## 5.1 Command Center

The central application interface.

Features:

- System overview.
- Quick application launching.
- Navigation to other interfaces.
- CPU, RAM, and one storage card per configured drive.
- `ASCS_Drives` near the top of `ASCS.ahk` is manually edited (default `["C:", "J:"]`).

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

F24 + F launches the installed Voidtools Everything application directly. Type in Everything's search field to see results as you type. ASCS has no embedded search view or SDK dependency.

## 5.4 Window Appearance

The WebView window disables the native title bar while retaining its normal taskbar button. The window and system-tray icon use the ASCS ICO, which is reapplied whenever the window is shown; the custom title bar includes minimize, maximize/restore, and hide controls. Startup size is up to 1920 × 1080 pixels and is centered within the primary display's work area. The Command Center uses a compact layout at shorter heights to avoid scrolling on open.

## 5.5 System Dashboard

Displays system resource utilization.

Features:

- CPU utilization.
- RAM utilization.
- RAM usage in GB.
- Per-drive storage cards from the manually configured `ASCS_Drives` list (default `["C:", "J:"]`).
- Automatic metric updates.

Metrics refresh every five seconds. Network/mapped drives are checked at most every 30 seconds; each drive failure is isolated and displayed as Offline.

Data sources:

- Win32_Processor.
- Win32_OperatingSystem.
- Windows drive information.

---

# 6. Keyboard Shortcuts

F24 is the Super key.

## 6.1 Primary Interfaces

| Shortcut | Action |
|---|---|
| F24 | Command Center |
| F24 + Q | Quick Notes |
| F24 + I | System Dashboard |

## 6.2 Application Launching

| Shortcut | Action |
|---|---|
| F24 + F | Open Everything |
| F24 + T | Windows Terminal |
| F24 + E | File Explorer |
| F24 + C | Calculator |
| F24 + H | Task Manager |

## 6.3 Virtual Desktops and Window Positioning

| Shortcut | Action |
|---|---|
| F24 + 1–9 | Focus virtual desktop 1–9, top row or numpad (NumLock on/off) |
| F24 + Left / Right | Snap the active resizable window to a monitor half |
| F24 + Up | Maximize the active resizable window |
| F24 + Down | Restore a maximized window; otherwise minimize |

## 6.4 System Controls

| Shortcut | Action |
|---|---|
| F24 + L | Lock Workstation |
| F24 + M | Toggle mute |
| F24 + V | Clipboard history |

## 6.5 Text Utilities

| Shortcut | Action |
|---|---|
| F24 + J | Insert timestamp |
| F24 + Y | Insert date |

Timestamp format:

`yyyy-MM-dd HH:mm:ss`

Date format:

`yyyy-MM-dd`

## 6.6 Workspace Controls

| Shortcut | Action | Status |
|---|---|---|
| F24 + Shift + S | Snipping Tool | Implemented |
| F24 + S | Workspace save | Placeholder |
| F24 + R | Workspace restore | Placeholder |

Workspace save and restoration functionality remains planned.

---

# 7. Dependencies

## 7.1 Required Dependencies

1. Windows 10 or Windows 11.
2. AutoHotkey v2, 64-bit.
3. Microsoft Edge WebView2 Runtime.
4. WebViewToo.
5. WebView2.ahk.
6. Required WebView2 loader dependencies.
7. Keychron Launcher configured to emit F24.

## 7.2 Optional Dependencies

**Voidtools Everything**

Install Everything to use F24 + F. ASCS opens the application directly; no SDK DLL is required.

**`lib/VirtualDesktopAccessor.dll`**

Required for F24 + 1–9 virtual desktop switching. Place a compatible DLL under `lib`. ASCS reads the existing desktop count and calls `GoToDesktopNumber` to jump directly to the requested desktop; keys beyond the existing count do nothing. Verify the `GetDesktopCount` and `GoToDesktopNumber` exports and Windows build compatibility for the DLL version in use. If the DLL is missing or fails, ASCS disables desktop switching rather than using keyboard navigation that could create desktops.

## 7.3 WebView2 Runtime

The Microsoft Edge WebView2 Runtime must be installed and available to the application.

WebView2 profile data is stored in:

`data/WebView2/`

---

# 8. Installation and Startup

## 8.1 Installation

1. Install AutoHotkey v2, 64-bit.
2. Install Microsoft Edge WebView2 Runtime.
3. Configure the Keychron Super key to emit F24.
4. Place WebViewToo and its dependencies in `C:\ASCS\webview`.
5. Place the frontend files, including `assets\ascs.ico`, in `C:\ASCS\frontend`.
6. Place a compatible `VirtualDesktopAccessor.dll` in `C:\ASCS\lib` to enable F24 + 1–9 virtual desktop switching.
7. Edit `ASCS_Drives` near the top of `ASCS.ahk` for the desired storage cards; no drive autodetection is used.
8. Create the data directory.
9. Run `ASCS.ahk`.

## 8.2 Startup Behavior

ASCS is designed to initialize WebView2 and remain hidden.

The Command Center should appear when F24 is pressed.

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
- F24+F direct Everything launch, F24+number/numpad, and F24+arrow shortcuts.
- ASCS window icon, custom title bar controls, and display-aware startup sizing.
- Configurable per-drive storage cards, preserving legacy C: metrics and caching network-drive polls.
- Virtual desktop switching and resizable-window positioning.
- No feature in this document is marked Runtime-tested.

## 9.2 Code-Reviewed, Runtime Testing Pending

- WebView2 virtual-host loading, messaging callbacks, and input focus.
- F24+F launch behavior.
- Quick Notes migration/recovery/atomic replacement and flush behavior.
- J: connected, missing, and disconnected-network cases.
- VirtualDesktopAccessor exports and OS-build compatibility; numpad mappings.
- Snap coordinates, monitor work areas, invisible borders, and mixed-DPI displays.
- Keyboard conflicts and all F24 combinations on the target keyboard.

## 9.3 Planned Features

- Full workspace save and restoration.
- Additional automation interfaces.

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
- [ ] Verify F24 activation.

## Phase 2: Interface Verification

- [ ] Test Command Center.
- [ ] Test Quick Notes.
- [ ] Test F24+F Everything launch.
- [ ] Test System Dashboard.
- [ ] Verify automatic metric updates.

## Phase 3: Workspace Management

- [ ] Implement workspace saving.
- [ ] Implement workspace restoration.

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
3. F24 standalone activation and modifier combinations require physical keyboard testing.
4. Workspace save/restore is not implemented.
5. F24+F requires Everything to be installed; executable detection may need adjustment for portable installations.
6. CPU and RAM metrics depend on WMI reporting.
7. Dashboard metrics are sampled every five seconds.
8. Optional DLL APIs and Windows-version behavior require target-system verification.
9. Network-drive status calls may still wait while being polled; slow drives are cached for 30 seconds.
10. F24+1–9 requires VirtualDesktopAccessor.dll; missing or invalid accessor APIs disable switching without creating desktops.
11. DPI-coordinate behavior for invisible frame-border compensation requires multi-monitor testing.

---

# 12. Testing Procedure

Manual runtime checklist (not yet run):

- [ ] Open Quick Notes through navigation, F24 hotkey, and re-showing the hidden window; confirm the note caret is at the end.
- [ ] Create, rename, filter, pin/unpin, change type, copy a snippet, and delete notes; verify confirmation and save status.
- [ ] Verify atomic save, previous-file backup, backup recovery after corrupting the primary file, legacy `{"content":"..."}` migration to “Scratch”, and save flush when hidden/closed.
- [ ] Verify J: online, missing, and disconnected-network behavior; ensure offline cards do not suppress CPU/RAM metrics and network queries are spaced at least 30 seconds apart.
- [ ] Switch existing desktops with top-row keys and numpad with NumLock on and off; verify requests above the desktop count do nothing and switching is disabled if the DLL is missing.
- [ ] Snap windows left/right, maximize, restore/minimize across monitors, taskbar positions, and mixed-DPI displays; confirm no visible seam or overlap.
- [ ] Confirm F24+F launches Everything and its search-as-you-type behavior.
- [ ] Confirm F24+T opens Windows Terminal.

A feature should only be marked runtime-tested after successful execution on the target Windows system.

---

# 13. Changelog

## Version 1.3.0 — Notes v2 and Windows Controls

- Added view/window-focus behavior using the vendored WebViewToo `MoveFocus(0)` API.
- Changed F24+F to launch Everything directly; removed embedded search and its SDK files after runtime issues.
- Replaced `SaveNote` with `SaveNotes`; added notes v2, atomic replacement, backup recovery, legacy migration, and hide/close flush.
- Added C:/J: drive metrics and cards, manual `ASCS_Drives` configuration, and 30-second network-drive caching.
- Added virtual desktop number/numpad shortcuts and F24+arrow window positioning.
- Added the ASCS icon, draggable title bar, custom window controls, and display-aware startup sizing.
- Removed the redundant F24+P PowerShell shortcut; F24+T opens Windows Terminal.
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

- Introduced F24 Super key shortcuts.
- Added application launching.
- Added system controls.
- Added timestamp and date insertion.

**Release status:** Initial implementation. WebView2 integration not fully verified.

---

# 14. Project Identity

**AEOLIONWARE SUPER COMMAND SYSTEM**

ASCS is intended to evolve into a dependable Windows utility suite built around keyboard efficiency, reliability, modularity, and a unified interface.
