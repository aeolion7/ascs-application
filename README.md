# Aeolionware Super Command System (ASCS)

**Brand:** AEOLIONWARE SUPER COMMAND SYSTEM  
**Tagline:** AEOLIONWARE, at your command.  
**Version:** 1.4.0
**Platform:** Windows  
**Status:** Version 1.4.0 implementation in source; runtime verification pending

ASCS is a keyboard-driven Windows utility suite. It uses AutoHotkey v2 for hotkeys and Windows automation, WebView2 for its graphical interface, and a web frontend built with HTML, CSS, and JavaScript.

## Contents

- [1. Project Overview](#1-project-overview)
- [2. Architecture](#2-architecture)
- [3. Visual Identity](#3-visual-identity)
- [4. Application Structure](#4-application-structure)
- [5. Interfaces](#5-interfaces)
- [6. Keyboard Shortcuts](#6-keyboard-shortcuts)
- [7. Frontend and Backend Communication](#7-frontend-and-backend-communication)
- [8. Dependencies](#8-dependencies)
- [9. Installation and Startup](#9-installation-and-startup)
- [10. Development Status](#10-development-status)
- [11. Known Limitations](#11-known-limitations)
- [12. Development Roadmap](#12-development-roadmap)
- [13. Changelog](#13-changelog)

## 1. Project Overview

ASCS centralizes application launching, system controls, productivity utilities, file search, and system monitoring behind the dedicated Super key, mapped to F24 by Keychron Launcher.

The application has five primary views:

1. Command Center
2. Quick Notes
3. System Dashboard
4. Super Commands, a reference for the available shortcuts
5. Preferences, for drive, snapping, and shortcut configuration

## 2. Architecture

### Technology and Responsibilities

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Keyboard input | Keychron Launcher | Maps the physical Super key to Super |
| Automation | AutoHotkey v2 (64-bit) | Handles shortcuts, Windows commands, persistence, and system queries |
| Web interface | Microsoft Edge WebView2 | Hosts the embedded frontend |
| Presentation | HTML and CSS | Defines interface structure and styling |
| Interaction | JavaScript | Handles navigation, input, and WebView messaging |
| File search | Voidtools Everything | Launches the user's indexed file search |
| Persistent data | Local files under `data` | Stores notes, preferences, workspaces, activity logs, and WebView2 profile data |

AutoHotkey remains responsible for command execution and Windows integration. The frontend is a presentation and interaction layer, not a general-purpose command executor.

### Startup and Page Loading

The AutoHotkey script creates a `WebViewGui`, enables WebView messaging, registers message and navigation handlers, maps the `frontend` directory to the `ascs.localhost` virtual host, and navigates to `https://ascs.localhost/index.html`. It requests that the application start hidden. These integration steps are implemented in source but have not yet been verified on the target Windows installation.

The window opens at up to 1920 × 1080 pixels, centered and constrained to the primary display's work area. Its native title bar is disabled while the normal taskbar button is retained; the custom title bar provides the ASCS mark, draggable surface, and minimize, maximize/restore, and hide controls. The Command Center uses a compact layout at shorter heights to avoid scrolling on open.

## 3. Visual Identity

### Aeolionware Obsidian

The frontend uses a premium desktop-oriented dark theme with balanced spacing, restrained gradients, rounded layered panels, and indigo/violet accents. Typography uses Segoe UI. Inline SVG provides interface graphics; a custom ICO supplies the ASCS window, system-tray, and frontend favicon.

| Design token | Color or treatment |
| --- | --- |
| Main background | `#111218` |
| Sidebar | `#151620` |
| Panels | `#1B1C28` |
| Elevated panels | `#222332` |
| Primary accent | `#8175F5` |
| Secondary accent | `#A78BFA` |
| Success | `#5ED6A0` |
| Primary text | `#F4F3FA` |
| Secondary text | `#9696AA` |
| Borders | `#303140` |
| Typeface | Segoe UI |

The layout adapts to narrower WebView windows, provides visible keyboard focus, and honors reduced-motion preferences. On wide and ultrawide displays, the application uses a wider canvas and an application-wide larger type scale, including for navigation, cards, and the shortcut appendix. The Command Center places system metrics beside quick actions; other views remain centered with per-view width limits for readability.

## 4. Application Structure

```text
C:\ASCS\
├── ASCS.ahk
├── AEOLIONWARE_SUPER_COMMAND_SYSTEM.md
├── frontend\
│   ├── assets\
│   │   └── ascs.ico
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── webview\
│   ├── WebViewToo.ahk
│   └── WebView2.ahk
├── lib\
│   └── VirtualDesktopAccessor.dll       (optional; desktop switching/window moves)
└── data\
    ├── notes.json
    ├── settings.ini
    ├── workspace.ini
    ├── ASCS_Log.txt
    └── WebView2\
```

| File or directory | Purpose |
| --- | --- |
| `ASCS.ahk` | WebView initialization, window chrome, shortcuts, message handling, application launching, notes, dashboard metrics, and logging |
| `frontend/assets/ascs.ico` | ASCS window, system-tray, and frontend icon |
| `frontend/index.html` | Structure and content for the five interfaces and command launcher |
| `frontend/styles.css` | Aeolionware Obsidian theme and responsive layout |
| `frontend/app.js` | Navigation, command launcher, preferences, notes, and metric display |
| `webview/` | Locally installed WebViewToo library and related dependencies |
| `data/notes.json` | Version 2 Quick Notes collection; `.bak` holds the previous save |
| `data/settings.ini` | User-configurable drives, window preferences, and shortcut keys |
| `data/workspace.ini` | Last saved window layout |
| `data/ASCS_Log.txt` | Activity and error log |
| `data/WebView2/` | WebView2 browser profile data |

WebViewToo is maintained separately from ASCS application code.

## 5. Interfaces

### Command Center

The Command Center opens when Super is tapped. It provides CPU and RAM summaries and one storage card per configured drive. Change the drive list in Preferences (defaults: `C:` and `J:`). Mapped/network drive metrics are cached, and Windows' drive type and readiness are checked before querying capacity.

The overview receives metrics from the same backend updates used by the System Dashboard. It does not show recent activity because the current backend does not provide an activity-history interface.

### Quick Notes

Quick Notes is opened with Super + Q. It supports multiple notes, title editing, filtering, pinning, deletion, and note/snippet types. Snippets use monospace text and can be copied. Data is stored as a version 2 JSON object in `data/notes.json`; saves are debounced and atomically replaced, with the previous file retained as `.bak`. Legacy `{"content":"..."}` files migrate to a note named “Scratch”.

### Everything Launcher

Super + F opens the installed Everything application directly. Type in Everything's own search field to see results as you type; ASCS does not embed search or load the Everything SDK.

### System Dashboard

The System Dashboard is opened with Super + I by default. It displays live CPU/RAM metrics, configured drive cards, processor and graphics details, memory configuration, motherboard and BIOS information, and Windows build. Its physical-drive list maps disks to their partitions and mounted drive letters, including volume labels, file systems, capacities, and free space. Metrics refresh every five seconds; hardware details are read once per session.

### Super Commands

The Super Commands view is an in-app appendix of the active shortcuts. App/view key defaults can be changed in Preferences. The searchable command launcher opens with Super + Space.

### Preferences and command launcher

Preferences configure up to 12 drive letters, snap spacing, monitor-move sizing, and unique letters for application/view shortcuts. Shortcut changes rebind immediately and are saved in `data/settings.ini`.

The command launcher filters available ASCS views, applications, and system actions. Use arrow keys to navigate, Enter to run, and Escape to close.

### Workspaces

Super + S saves a snapshot of up to 24 visible application windows; Super + R restores their positions and relaunches missing processes. Window placement is saved locally in `data/workspace.ini`.

## 6. Keyboard Shortcuts

Shortcut tables use “Super” as the user-facing name for the dedicated key (mapped to F24 by Keychron Launcher). Existing shortcut assignments are:

| Shortcut | Action | Status |
| --- | --- | --- |
| Super | Open Command Center | Implemented in source |
| Super + Space | Open searchable command launcher | Implemented in source |
| Super + Q | Open Quick Notes (default; configurable) | Implemented in source |
| Super + F | Open Everything (default; configurable) | Implemented in source |
| Super + I | Open System Dashboard (default; configurable) | Implemented in source |
| Super + 1–9 | Focus virtual desktop 1–9 (top row or numpad) | Implemented in source |
| Super + Shift + 1–9 | Move active window to a desktop, then switch to it | Implemented in source |
| Super + Left / Right | Snap active resizable window to monitor half | Implemented in source |
| Super + horizontal arrow, then vertical arrow | Snap active window to the selected quadrant | Implemented in source |
| Super + Shift + Left / Right | Move active window to adjacent monitor | Implemented in source |
| Super + Up / Down | Maximize, restore, or minimize | Implemented in source |
| Super + T / E / C / H | Terminal / Explorer / Calculator / Task Manager (defaults; configurable) | Implemented in source |
| Super + L | Lock workstation | Implemented in source |
| Super + M | Toggle audio mute | Implemented in source |
| Super + V | Open Clipboard History | Implemented in source |
| Super + J | Insert timestamp | Implemented in source |
| Super + Y | Insert date | Implemented in source |
| Super + Shift + S | Open Snipping Tool | Implemented in source |
| Super + S | Save window workspace | Implemented in source |
| Super + R | Restore window workspace | Implemented in source |

Timestamp format: `yyyy-MM-dd HH:mm:ss`  
Date format: `yyyy-MM-dd`

Shortcut letter defaults are editable in Preferences; the keys S, R, L, M, V, J, and Y are reserved. These definitions have not been runtime-tested with the configured keyboard. Numpad NumLock-off aliases, virtual desktop DLL compatibility, and multi-monitor/DPI positioning remain verification items.

## 7. Frontend and Backend Communication

The frontend/backend message contract is defined by the current `ASCS.ahk` and `frontend/app.js`. Do not change the message format or event names without updating both sides.

### Frontend to AutoHotkey

JavaScript sends newline-separated text through `window.chrome.webview.postMessage()`:

```text
MessageType
MessageContent
```

| Message | Content | Purpose |
| --- | --- | --- |
| `Ready` | None | Announces that frontend initialization is complete |
| `GetNotes` | None | Requests the saved notes JSON |
| `SaveNotes` | Full notes JSON text | Atomically persists all notes (replaces `SaveNote`) |
| `WindowAction` | `minimize`, `maximize`, or `close` | Controls the frameless ASCS window |
| `Launch` | Allowlisted launcher identifier | Requests an application launch |
| `GetMetrics` | None | Requests a dashboard update |
| `GetSettings` | None | Requests current preferences |
| `SaveSettings` | Drives, snap gap, size preference, and shortcut letters | Validates and persists preferences |
| `Log` | Log text | Adds an activity-log entry |

The first newline separates the message type from its content. The full notes JSON is sent as content. The backend validates message types and payload sizes.

### AutoHotkey to Frontend

AutoHotkey sends JSON with `PostWebMessageAsJson()`.

| Response type | Purpose |
| --- | --- |
| `navigate` | Activates a view |
| `notes` | Returns opaque notes JSON in `data`, plus `recovered` |
| `saved` | Confirms note persistence |
| `metrics` | Supplies CPU/RAM, legacy C: fields, and a `drives` array |
| `settings` | Returns current preferences |
| `settingsSaved` | Confirms preferences were saved and applied |
| `openLauncher` | Opens the command palette |
| `flushNotes` | Asks the frontend to immediately send a pending note save |
| `error` | Displays an error notification |

On `Ready`, the backend marks the page ready, sends the pending view and initial data, and starts the five-second dashboard timer. The `metrics` response keeps `disk`, `diskUsed`, and `diskTotal` for C: and adds `drives: [{letter, usage, used, total, online}]`.

### Security Considerations

- Keep frontend actions mapped to predefined backend operations.
- Validate message types and content in the backend.
- Do not add unrestricted shell or PowerShell execution to the frontend bridge.
- Keep file access limited to ASCS data paths where practical.
- Restrict external navigation to approved destinations.

These are design requirements; runtime security behavior has not been independently validated.

## 8. Dependencies

### Required

- Windows 10 or Windows 11.
- AutoHotkey v2, 64-bit.
- Microsoft Edge WebView2 Runtime.
- Locally installed WebViewToo and its required files under `C:\ASCS\webview`.
- Keychron Launcher configured to emit Super for the Super key.

### Optional

- Voidtools Everything for file search.
- `lib\VirtualDesktopAccessor.dll` for direct desktop switching and moving windows between desktops.

Everything is optional and is only needed for its launcher. ASCS opens the application directly; no Everything SDK DLL is required. To use desktop switching or window moves, place a compatible VirtualDesktopAccessor.dll in `lib`; ASCS reads the current desktop count and targets only existing desktops. If the DLL is missing or fails, these actions are disabled rather than using a keyboard fallback that might create desktops. Verify the `GetDesktopCount`, `GoToDesktopNumber`, and `MoveWindowToDesktopNumber` exports for the DLL version in use. The upstream API documents `-1` as the error return; ASCS treats nonnegative results as success. The WebView2 Evergreen Runtime is preferred.

## 9. Installation and Startup

1. Install AutoHotkey v2, 64-bit.
2. Install the Microsoft Edge WebView2 Runtime.
3. Configure the Keychron Super key to emit Super.
4. Place WebViewToo and its dependencies under `C:\ASCS\webview`.
5. Place the frontend files, including `assets\ascs.ico`, under `C:\ASCS\frontend`.
6. Ensure the `data` directory is available; the script creates it when needed.
7. Run `C:\ASCS\ASCS.ahk`.

The script requests hidden startup and is intended to show the Command Center when Super is tapped. These behaviors remain unverified on the target system. After changing frontend assets, restart or reload ASCS to load the updated interface.

## 10. Development Status

Status labels distinguish source implementation from execution on the target system:

- **Implemented in source:** Corresponding code exists in the repository.
- **Code-reviewed:** Source and message contracts have been inspected; this is not runtime verification.
- **Runtime-tested:** Successfully executed on the target Windows installation. No feature below is currently marked runtime-tested.
- **Planned or pending:** Not implemented, incomplete, or awaiting validation.

### Implemented in Source

- WebViewGui initialization, messaging setup, event registration, and virtual-host mapping.
- Frontend readiness handshake and newline-delimited message dispatch.
- Frontend JSON response handling.
- Super shortcut definitions, application launchers, and basic system controls.
- Quick Notes v2 multi-note JSON persistence, atomic replacement, backup fallback, and save acknowledgements.
- Super+F direct Everything launch.
- Custom ASCS title bar, window controls, and display-aware 1920 × 1080 startup sizing.
- WMI metrics, cached physical-hardware details, and configurable drive cards with network-drive polling guards.
- Desktop switching, active-window desktop moves, quadrant snapping, and monitor-to-monitor window movement.
- Saved workspace capture/restoration and a searchable command launcher.
- A Preferences view for drive selection, snap gap, monitor sizing, and live shortcut rebinding.
- Five-second dashboard refresh after frontend readiness.
- The five primary frontend interfaces, command launcher, Super Commands appendix, and Preferences.

### Code-Reviewed

- The frontend and backend use newline-delimited requests and JSON responses; changed message contracts are listed above.
- The frontend sends only allowlisted operations; storage cards are generated from the backend `drives` array.
- The dashboard uses the backend-provided CPU, RAM, storage, and capacity fields.

This review did not execute ASCS, initialize WebView2, or verify callback behavior.

### Runtime Testing Pending

- WebViewToo initialization and event callback registration.
- Virtual-host page loading and WebView2-to-AutoHotkey messaging in both directions.
- Hidden startup, Super activation, and modifier combinations.
- Quick Notes save, acknowledgement, and persistence across restarts.
- Super+F direct launch of Everything.
- Notes create/delete/rename/pin/type/filter, atomic save, backup recovery, legacy migration, and hide/close flush.
- J: online/offline behavior and delayed network-drive refresh.
- Virtual desktop switching with NumLock on/off; confirm nonexistent desktop numbers do nothing.
- Active-window moves between desktops with the supplied DLL and error behavior for unsupported exports.
- Quadrant snapping, adjacent-monitor movement, snap gaps, and mixed-DPI layouts.
- Workspace save/relaunch/restore behavior and dynamic shortcut rebinding.
- Preferences persistence/validation and command launcher filtering/keyboard operation.
- Dashboard metric values, C:/J: online/offline cards, and five-second updates.
- Hardware detail collection on devices with multiple GPU/disk/memory configurations.
- Responsive layout and interaction at target WebView window sizes.
- Super Commands appendix content and navigation.

## 11. Known Limitations

- WebView2 integration has not been verified on the target Windows installation.
- Startup, frontend callbacks, and keyboard behavior require runtime testing.
- Workspace restore depends on the saved executable paths still existing and windows becoming available; only up to 24 visible windows are captured.
- Super+F requires the Everything application to be installed; ASCS delegates search and result display to it.
- The VirtualDesktopAccessor DLL's window-move API and OS build compatibility have not been verified at runtime.
- A disconnected network drive can still stall during the Windows readiness check; polling is isolated and cached to reduce exposure.
- Desktop switching and window moves require `VirtualDesktopAccessor.dll`; without it, those actions are disabled.
- Monitor frame-bound calculations depend on Windows DPI coordinate behavior and require runtime verification.
- Metrics depend on WMI and Windows drive reporting.
- The Command Center does not display recent activity.
- No complete runtime test suite or target-system test results are included with the project.

## 12. Development Roadmap

### WebView2 Stabilization

- Verify WebViewToo initialization against the locally installed library.
- Verify frontend callback registration and message dispatch.
- Verify frontend-to-AutoHotkey and AutoHotkey-to-frontend communication.
- Verify hidden startup and Super behavior on the target keyboard.
- Verify notes, Everything launching, and dashboard operations.

### Future Improvements

- Review startup reliability and resource use.
- Expand automation tools while keeping the message bridge allowlisted.
- Refine keyboard navigation and overall interaction consistency.

## 13. Changelog

### Version 1.4.0 — Window Management and Productivity

- Added two-direction arrow chords for quadrant snapping, configurable snap spacing, and left/right adjacent-monitor window moves.
- Added Super+Shift+number window-to-desktop moves with bounds checks, plus direct switching through VirtualDesktopAccessor.
- Implemented local workspace capture and restoration, including relaunching missing applications.
- Added Super+Space searchable command launcher, Preferences, persistent drive/shortcut settings, and immediate hotkey rebinding.
- Expanded the System Dashboard with cached WMI hardware/device details.
- Updated the in-app shortcut reference and both user/developer documentation.
- Runtime validation remains pending; verify AutoHotkey syntax, WebView2 behavior, DLL exports, multi-monitor behavior, and network-drive readiness on the target Windows installation.

### Version 1.3.0 — Notes v2 and Windows Controls

- Focused the Quick Notes primary input on navigation and window activation using the vendored WebView `MoveFocus(0)` API.
- Super+F opens Everything directly; embedded SDK search and its bundled SDK files were removed after runtime issues.
- Added multi-note v2 storage, autosave, atomic replacement, backup recovery, legacy migration, and flush-on-hide/close handling.
- Added configurable C:/J: storage cards and a 30-second network-drive metrics cache.
- Added Super number/numpad virtual desktop switching and Super+arrow active-window positioning.
- Added the ASCS window icon, branded draggable title bar, window controls, and display-aware startup sizing.
- Removed the redundant Super+P PowerShell shortcut; Super+T opens Windows Terminal.
- Runtime testing remains pending; optional DLL exports, Everything command-line behavior, and target-system behavior require verification.

### Version 1.2.1 — WebView2 Stabilization and Aeolionware Obsidian Redesign

- Reviewed the WebViewToo and WebView2 integration source.
- Standardized newline-separated frontend requests and JSON backend responses.
- Added the frontend readiness handshake and navigation event handling.
- Replaced direct file URL loading with a local virtual-host mapping.
- Improved Quick Notes JSON persistence and save acknowledgements.
- Improved Everything executable discovery.
- Added five-second dashboard metric updates.
- Replaced the previous dashboard styling with the Aeolionware Obsidian visual system.
- Refined the four primary interfaces while retaining the existing backend protocol and shortcut identifiers.
- Added an in-app appendix documenting every current Super command and workspace placeholder.
- Increased typography and spacing application-wide, with an additional scale for wide and ultrawide windows.
- Improved responsive behavior, focus visibility, reduced-motion support, and metric presentation.
- Added capacity details to the Command Center summary.
- Runtime verification remains pending.

### Version 1.2.0 — WebView2 Frontend Introduction

- Introduced the WebView2 frontend and initial AutoHotkey integration.
- Added the Command Center, Quick Notes, Everything Search, and System Dashboard.
- Added application launching, system controls, and date/time shortcuts.
- WebView2 integration was not fully verified.
