# Aeolionware Super Command System (ASCS)

**Brand:** AEOLIONWARE SUPER COMMAND SYSTEM  
**Tagline:** AEOLIONWARE, at your command.  
**Version:** 1.3.0
**Platform:** Windows  
**Status:** Version 1.3.0 implementation in source; runtime verification pending

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

ASCS centralizes application launching, system controls, productivity utilities, file search, and system monitoring behind the F24 key, configured as the Super key through Keychron Launcher.

The application has four primary views:

1. Command Center
2. Quick Notes
3. System Dashboard
4. F24 Commands, a reference for every shortcut currently defined in the backend

## 2. Architecture

### Technology and Responsibilities

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Keyboard input | Keychron Launcher | Maps the physical Super key to F24 |
| Automation | AutoHotkey v2 (64-bit) | Handles shortcuts, Windows commands, persistence, and system queries |
| Web interface | Microsoft Edge WebView2 | Hosts the embedded frontend |
| Presentation | HTML and CSS | Defines interface structure and styling |
| Interaction | JavaScript | Handles navigation, input, and WebView messaging |
| File search | Voidtools Everything | Launches the user's indexed file search |
| Persistent data | Local files under `data` | Stores notes, activity logs, and WebView2 profile data |

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
│   └── VirtualDesktopAccessor.dll       (required for F24 + 1–9)
└── data\
    ├── notes.json
    ├── ASCS_Log.txt
    └── WebView2\
```

| File or directory | Purpose |
| --- | --- |
| `ASCS.ahk` | WebView initialization, window chrome, shortcuts, message handling, application launching, notes, dashboard metrics, and logging |
| `frontend/assets/ascs.ico` | ASCS window, system-tray, and frontend icon |
| `frontend/index.html` | Structure and content for the four interfaces |
| `frontend/styles.css` | Aeolionware Obsidian theme and responsive layout |
| `frontend/app.js` | Navigation, frontend messaging, notes, and metric display |
| `webview/` | Locally installed WebViewToo library and related dependencies |
| `data/notes.json` | Version 2 Quick Notes collection; `.bak` holds the previous save |
| `data/ASCS_Log.txt` | Activity and error log |
| `data/WebView2/` | WebView2 browser profile data |

WebViewToo is maintained separately from ASCS application code.

## 5. Interfaces

### Command Center

The Command Center opens when F24 is tapped. It provides CPU and RAM summaries and one storage card per configured drive. Edit `ASCS_Drives` near the top of `ASCS.ahk` to change the drive list (default: `["C:", "J:"]`). Network-drive metrics are cached for 30 seconds to reduce stalls on disconnected mappings.

The overview receives metrics from the same backend updates used by the System Dashboard. It does not show recent activity because the current backend does not provide an activity-history interface.

### Quick Notes

Quick Notes is opened with F24 + Q. It supports multiple notes, title editing, filtering, pinning, deletion, and note/snippet types. Snippets use monospace text and can be copied. Data is stored as a version 2 JSON object in `data/notes.json`; saves are debounced and atomically replaced, with the previous file retained as `.bak`. Legacy `{"content":"..."}` files migrate to a note named “Scratch”.

### Everything Launcher

F24 + F opens the installed Everything application directly. Type in Everything's own search field to see results as you type; ASCS does not embed search or load the Everything SDK.

### System Dashboard

The System Dashboard is opened with F24 + I. It displays CPU and RAM metrics and one storage card per configured drive. Metrics refresh every five seconds; mapped or network drives are queried no more often than every 30 seconds.

### F24 Commands

The F24 Commands view is a complete in-app appendix of the keyboard shortcuts currently defined in `ASCS.ahk`. It groups commands by ASCS view, application, virtual desktop, window positioning, system control, text utility, and workspace/capture action. Workspace save and restore are explicitly identified as placeholders; F24 + Shift + S invokes the Windows Snipping Tool overlay.

## 6. Keyboard Shortcuts

F24 is the Super key. Existing shortcut assignments are:

| Shortcut | Action | Status |
| --- | --- | --- |
| F24 | Open Command Center | Implemented in source |
| F24 + Q | Open Quick Notes | Implemented in source |
| F24 + F | Open Everything | Implemented in source |
| F24 + I | Open System Dashboard | Implemented in source |
| F24 + 1–9 | Focus virtual desktop 1–9 (top row or numpad) | Implemented in source |
| F24 + Left / Right | Snap active resizable window to monitor half | Implemented in source |
| F24 + Up | Maximize active resizable window | Implemented in source |
| F24 + Down | Restore maximized window or minimize | Implemented in source |
| F24 + T | Open Windows Terminal | Implemented in source |
| F24 + E | Open File Explorer | Implemented in source |
| F24 + C | Open Calculator | Implemented in source |
| F24 + H | Open Task Manager | Implemented in source |
| F24 + L | Lock workstation | Implemented in source |
| F24 + M | Toggle audio mute | Implemented in source |
| F24 + V | Open Clipboard History | Implemented in source |
| F24 + J | Insert timestamp | Implemented in source |
| F24 + Y | Insert date | Implemented in source |
| F24 + Shift + S | Open Snipping Tool | Implemented in source |
| F24 + S | Workspace save placeholder | Placeholder; logs request |
| F24 + R | Workspace restore placeholder | Placeholder; logs request |

Timestamp format: `yyyy-MM-dd HH:mm:ss`  
Date format: `yyyy-MM-dd`

The shortcut definitions have not been runtime-tested with the configured keyboard. Numpad NumLock-off aliases, virtual desktop DLL compatibility, and multi-monitor/DPI positioning remain verification items.

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
- Keychron Launcher configured to emit F24 for the Super key.

### Optional

- Voidtools Everything for file search.
- `lib\VirtualDesktopAccessor.dll` for direct virtual desktop switching and desktop-count validation.

Everything is optional and is only needed for the F24 + F launcher. ASCS opens the application directly; no Everything SDK DLL is required. To use F24 + 1–9, place a compatible VirtualDesktopAccessor.dll in `lib`; ASCS reads the current desktop count and jumps directly to the requested existing desktop. If the DLL is missing or fails, switching is disabled rather than using a keyboard fallback that might create desktops. Verify the `GetDesktopCount` and `GoToDesktopNumber` exports for the DLL version in use. The WebView2 Evergreen Runtime is preferred.

## 9. Installation and Startup

1. Install AutoHotkey v2, 64-bit.
2. Install the Microsoft Edge WebView2 Runtime.
3. Configure the Keychron Super key to emit F24.
4. Place WebViewToo and its dependencies under `C:\ASCS\webview`.
5. Place the frontend files, including `assets\ascs.ico`, under `C:\ASCS\frontend`.
6. Ensure the `data` directory is available; the script creates it when needed.
7. Run `C:\ASCS\ASCS.ahk`.

The script requests hidden startup and is intended to show the Command Center when F24 is tapped. These behaviors remain unverified on the target system. After changing frontend assets, restart or reload ASCS to load the updated interface.

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
- F24 shortcut definitions, application launchers, and basic system controls.
- Quick Notes v2 multi-note JSON persistence, atomic replacement, backup fallback, and save acknowledgements.
- F24+F direct Everything launch.
- Custom ASCS title bar, window controls, and display-aware 1920 × 1080 startup sizing.
- WMI metrics and configurable C:/J: drive cards with lower-frequency network-drive polling.
- Numbered virtual desktop and active-window positioning hotkeys.
- Five-second dashboard refresh after frontend readiness.
- The four primary frontend interfaces, the F24 Commands appendix, and the Aeolionware Obsidian visual redesign.
- The F24 Commands appendix, including active shortcut and placeholder labels.

### Code-Reviewed

- The frontend and backend use newline-delimited requests and JSON responses; changed message contracts are listed above.
- The frontend sends only allowlisted operations; storage cards are generated from the backend `drives` array.
- The dashboard uses the backend-provided CPU, RAM, storage, and capacity fields.

This review did not execute ASCS, initialize WebView2, or verify callback behavior.

### Runtime Testing Pending

- WebViewToo initialization and event callback registration.
- Virtual-host page loading and WebView2-to-AutoHotkey messaging in both directions.
- Hidden startup, F24 activation, and modifier combinations.
- Quick Notes save, acknowledgement, and persistence across restarts.
- F24+F direct launch of Everything.
- Notes create/delete/rename/pin/type/filter, atomic save, backup recovery, legacy migration, and hide/close flush.
- J: online/offline behavior and delayed network-drive refresh.
- Virtual desktop switching with NumLock on/off; confirm nonexistent desktop numbers do nothing.
- Window snapping on multiple monitors with different DPI settings.
- Dashboard metric values, C:/J: online/offline cards, and five-second updates.
- Responsive layout and interaction at target WebView window sizes.
- F24 Commands appendix content and navigation.

## 11. Known Limitations

- WebView2 integration has not been verified on the target Windows installation.
- Startup, frontend callbacks, and keyboard behavior require runtime testing.
- Workspace save and restore are placeholders that only log requests.
- F24+F requires the Everything application to be installed; ASCS delegates search and result display to it.
- Configured network drive status calls may still block when they are actually polled; mapped drives are cached for 30 seconds.
- F24+1–9 requires `VirtualDesktopAccessor.dll`; without it, switching is disabled to avoid creating desktops.
- Monitor frame-bound calculations depend on Windows DPI coordinate behavior and require runtime verification.
- Metrics depend on WMI and Windows drive reporting.
- The Command Center does not display recent activity.
- No complete runtime test suite or target-system test results are included with the project.

## 12. Development Roadmap

### WebView2 Stabilization

- Verify WebViewToo initialization against the locally installed library.
- Verify frontend callback registration and message dispatch.
- Verify frontend-to-AutoHotkey and AutoHotkey-to-frontend communication.
- Verify hidden startup and F24 behavior on the target keyboard.
- Verify notes, Everything launching, and dashboard operations.

### Feature Completion

- Implement full workspace saving and restoration.
- Verify F24+F launches Everything.
- Verify dashboard metrics and refresh behavior.

### Future Improvements

- Review startup reliability and resource use.
- Expand automation tools while keeping the message bridge allowlisted.
- Refine keyboard navigation and overall interaction consistency.

## 13. Changelog

### Version 1.3.0 — Notes v2 and Windows Controls

- Focused the Quick Notes primary input on navigation and window activation using the vendored WebView `MoveFocus(0)` API.
- F24+F opens Everything directly; embedded SDK search and its bundled SDK files were removed after runtime issues.
- Added multi-note v2 storage, autosave, atomic replacement, backup recovery, legacy migration, and flush-on-hide/close handling.
- Added configurable C:/J: storage cards and a 30-second network-drive metrics cache.
- Added F24 number/numpad virtual desktop switching and F24+arrow active-window positioning.
- Added the ASCS window icon, branded draggable title bar, window controls, and display-aware startup sizing.
- Removed the redundant F24+P PowerShell shortcut; F24+T opens Windows Terminal.
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
- Added an in-app appendix documenting every current F24 command and workspace placeholder.
- Increased typography and spacing application-wide, with an additional scale for wide and ultrawide windows.
- Improved responsive behavior, focus visibility, reduced-motion support, and metric presentation.
- Added capacity details to the Command Center summary.
- Runtime verification remains pending.

### Version 1.2.0 — WebView2 Frontend Introduction

- Introduced the WebView2 frontend and initial AutoHotkey integration.
- Added the Command Center, Quick Notes, Everything Search, and System Dashboard.
- Added application launching, system controls, and date/time shortcuts.
- WebView2 integration was not fully verified.
