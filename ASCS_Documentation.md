# Aeolionware Super Command System (ASCS)

**Brand:** AEOLIONWARE SUPER COMMAND SYSTEM  
**Tagline:** AEOLIONWARE, at your command.  
**Version:** 1.2.1  
**Platform:** Windows  
**Status:** WebView2 integration stabilization; runtime verification remains outstanding

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

The application has five primary views:

1. Command Center
2. Quick Notes
3. Everything Search
4. System Dashboard
5. F24 Commands, a reference for every shortcut currently defined in the backend

## 2. Architecture

### Technology and Responsibilities

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Keyboard input | Keychron Launcher | Maps the physical Super key to F24 |
| Automation | AutoHotkey v2 (64-bit) | Handles shortcuts, Windows commands, persistence, and system queries |
| Web interface | Microsoft Edge WebView2 | Hosts the embedded frontend |
| Presentation | HTML and CSS | Defines interface structure and styling |
| Interaction | JavaScript | Handles navigation, input, and WebView messaging |
| File search | Voidtools Everything | Indexes and displays matching files |
| Persistent data | Local files under `data` | Stores notes, activity logs, and WebView2 profile data |

AutoHotkey remains responsible for command execution and Windows integration. The frontend is a presentation and interaction layer, not a general-purpose command executor.

### Startup and Page Loading

The AutoHotkey script creates a `WebViewGui`, enables WebView messaging, registers message and navigation handlers, maps the `frontend` directory to the `ascs.localhost` virtual host, and navigates to `https://ascs.localhost/index.html`. It requests that the application start hidden. These integration steps are implemented in source but have not yet been verified on the target Windows installation.

## 3. Visual Identity

### Aeolionware Obsidian

The frontend uses a premium desktop-oriented dark theme with balanced spacing, restrained gradients, rounded layered panels, and indigo/violet accents. Typography uses Segoe UI. Inline SVG provides the interface icons without adding an icon package or image assets.

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
├── ASCS_Documentation.md
├── frontend\
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── webview\
│   ├── WebViewToo.ahk
│   ├── WebView2.ahk
│   └── dependencies
└── data\
    ├── notes.json
    ├── ASCS_Log.txt
    └── WebView2\
```

| File or directory | Purpose |
| --- | --- |
| `ASCS.ahk` | WebView initialization, shortcuts, message handling, application launching, notes, Everything integration, dashboard metrics, and logging |
| `frontend/index.html` | Structure and content for the four interfaces |
| `frontend/styles.css` | Aeolionware Obsidian theme and responsive layout |
| `frontend/app.js` | Navigation, frontend messaging, notes, search, and metric display |
| `webview/` | Locally installed WebViewToo library and related dependencies |
| `data/notes.json` | Persistent Quick Notes content |
| `data/ASCS_Log.txt` | Activity and error log |
| `data/WebView2/` | WebView2 browser profile data |

WebViewToo is maintained separately from ASCS application code.

## 5. Interfaces

### Command Center

The Command Center opens when F24 is tapped. It provides system summaries for CPU, RAM, and C: drive usage; navigation to the other views; and quick actions for PowerShell, File Explorer, Everything Search, Quick Notes, Task Manager, and Calculator.

The overview receives metrics from the same backend updates used by the System Dashboard. It does not show recent activity because the current backend does not provide an activity-history interface.

### Quick Notes

Quick Notes is opened with F24 + Q. It provides a multiline editor and sends changes to AutoHotkey after a short debounce. The backend stores note content in `data/notes.json` and returns a save acknowledgement. The frontend displays save status.

### Everything Search

Everything Search is opened with F24 + F. Submit a query with Enter or the Search button. AutoHotkey launches Voidtools Everything with the query; results appear in Everything, not embedded in ASCS.

### System Dashboard

The System Dashboard is opened with F24 + I. It displays CPU utilization, RAM utilization and capacity in GB, and C: drive utilization and capacity in GB. The backend requests updates every five seconds after receiving the frontend readiness message.

### F24 Commands

The F24 Commands view is a complete in-app appendix of the keyboard shortcuts currently defined in `ASCS.ahk`. It groups commands by ASCS view, application, system control, text utility, and workspace/capture action. Workspace save and restore are explicitly identified as placeholders; F24 + Shift + S invokes the Windows Snipping Tool overlay.

## 6. Keyboard Shortcuts

F24 is the Super key. Existing shortcut assignments are:

| Shortcut | Action | Status |
| --- | --- | --- |
| F24 | Open Command Center | Implemented in source |
| F24 + Q | Open Quick Notes | Implemented in source |
| F24 + F | Open Everything Search | Implemented in source |
| F24 + I | Open System Dashboard | Implemented in source |
| F24 + P | Open PowerShell | Implemented in source |
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

The shortcut definitions have not all been physically tested with the configured keyboard. F24 standalone activation and modifier combinations remain a verification item.

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
| `GetNotes` | None | Requests the saved note |
| `SaveNote` | Note text | Persists note content |
| `SearchFiles` | Search query | Starts an Everything search |
| `Launch` | Allowlisted launcher identifier | Requests an application launch |
| `GetMetrics` | None | Requests a dashboard update |
| `Log` | Log text | Adds an activity-log entry |

The first newline separates the message type from its content. Note text may contain further newlines.

### AutoHotkey to Frontend

AutoHotkey sends JSON with `PostWebMessageAsJson()`.

| Response type | Purpose |
| --- | --- |
| `navigate` | Activates a view |
| `notes` | Returns saved note content |
| `saved` | Confirms note persistence |
| `metrics` | Supplies CPU, RAM, and disk measurements |
| `error` | Displays an error notification |

On `Ready`, the backend marks the page ready, sends the pending view and initial data, and starts the five-second dashboard timer.

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

The WebView2 Evergreen Runtime is preferred. ASCS should verify runtime availability during startup. Everything executable discovery and launch behavior still require runtime verification.

## 9. Installation and Startup

1. Install AutoHotkey v2, 64-bit.
2. Install the Microsoft Edge WebView2 Runtime.
3. Configure the Keychron Super key to emit F24.
4. Place WebViewToo and its dependencies under `C:\ASCS\webview`.
5. Place the frontend files under `C:\ASCS\frontend`.
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
- Quick Notes JSON persistence and save acknowledgements.
- Everything executable discovery and command-line search launch.
- WMI and drive-based dashboard metrics.
- Five-second dashboard refresh after frontend readiness.
- The four primary frontend interfaces, the F24 Commands appendix, and the Aeolionware Obsidian visual redesign.
- The F24 Commands appendix, including active shortcut and placeholder labels.

### Code-Reviewed

- The redesign preserves the existing frontend message names and newline-delimited request format.
- The frontend response handling matches the JSON message types used by the backend.
- Existing view IDs, navigation data attributes, launcher identifiers, and core element IDs are retained.
- The dashboard uses the backend-provided CPU, RAM, storage, and capacity fields.

This review did not execute ASCS, initialize WebView2, or verify callback behavior.

### Runtime Testing Pending

- WebViewToo initialization and event callback registration.
- Virtual-host page loading and WebView2-to-AutoHotkey messaging in both directions.
- Hidden startup, F24 activation, and modifier combinations.
- Quick Notes save, acknowledgement, and persistence across restarts.
- Everything executable detection and search launch.
- Dashboard metric values and five-second updates.
- Responsive layout and interaction at target WebView window sizes.
- F24 Commands appendix content and navigation.

## 11. Known Limitations

- WebView2 integration has not been verified on the target Windows installation.
- Startup, frontend callbacks, and keyboard behavior require runtime testing.
- Workspace save and restore are placeholders that only log requests.
- Selected-file path copying is not implemented in the current backend.
- Everything Search depends on the external Everything application and its index.
- Dashboard storage monitoring is limited to the C: drive.
- Metrics depend on WMI and Windows drive reporting.
- Search results are displayed in Everything rather than inside ASCS.
- The Command Center does not display recent activity.
- No complete runtime test suite or target-system test results are included with the project.

## 12. Development Roadmap

### WebView2 Stabilization

- Verify WebViewToo initialization against the locally installed library.
- Verify frontend callback registration and message dispatch.
- Verify frontend-to-AutoHotkey and AutoHotkey-to-frontend communication.
- Verify hidden startup and F24 behavior on the target keyboard.
- Verify notes, search, and dashboard operations.

### Feature Completion

- Implement full workspace saving and restoration.
- Restore selected-file path copying.
- Improve Everything detection and error reporting.
- Verify dashboard metrics and refresh behavior.

### Future Improvements

- Review startup reliability and resource use.
- Expand automation tools while keeping the message bridge allowlisted.
- Refine keyboard navigation and overall interaction consistency.

## 13. Changelog

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
