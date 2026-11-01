
# AEOLIONWARE SUPER COMMAND SYSTEM (ASCS)

**Developer:** Joseph Lionarons
**Version:** 1.2.1  
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
- Integrated Everything file searching.
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
| File Searching | Voidtools Everything |
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
- File search requests.
- Dashboard visualization.
- Displaying notifications and status messages.

### Backend

The AutoHotkey backend is responsible for:

- Keyboard shortcuts.
- Application launching.
- File persistence.
- Everything integration.
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
| SaveNote | Saves note content |
| SearchFiles | Starts an Everything search |
| Launch | Launches an application |
| GetMetrics | Requests system metrics |
| Log | Sends an activity log entry |

### Backend to Frontend

AutoHotkey sends JSON messages using:

`PostWebMessageAsJson()`

Supported message types:

| Message | Purpose |
|---|---|
| navigate | Changes the active interface |
| notes | Returns saved notes |
| saved | Confirms successful note persistence |
| metrics | Updates dashboard information |
| error | Displays an error notification |

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
├── ASCS_Documentation.md
│
├── frontend\
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── webview\
│   ├── WebViewToo.ahk
│   ├── WebView2.ahk
│   └── Dependencies
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
- Everything integration.
- Dashboard metrics.
- Activity logging.

## 3.2 Frontend Files

`frontend/index.html`

Defines the application structure and interface elements.

`frontend/styles.css`

Defines the ASCS visual identity and styling.

`frontend/app.js`

Controls frontend behavior, navigation, messaging, notes, search, and dashboard updates.

## 3.3 WebView Dependencies

`webview/WebViewToo.ahk`

Provides the AutoHotkey WebView2 GUI integration.

`webview/WebView2.ahk`

Provides the underlying WebView2 implementation.

## 3.4 Data Directory

`data/notes.json`

Stores persistent Quick Notes content.

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
- CPU, RAM, and storage summaries.

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

Storage format:

```json
{
  "content": "Your notes..."
}
```

The backend also supports loading the original plain-text notes format.

## 5.3 Everything Search

Provides an interface for searching indexed files using Voidtools Everything.

Features:

- Search input.
- Enter-key submission.
- Search button.
- External Everything application launching.

Search results are displayed in the Everything application rather than inside ASCS.

## 5.4 System Dashboard

Displays system resource utilization.

Features:

- CPU utilization.
- RAM utilization.
- RAM usage in GB.
- C: drive utilization.
- C: drive usage in GB.
- Automatic metric updates.

Metrics are refreshed every five seconds.

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
| F24 + F | Everything Search |
| F24 + I | System Dashboard |

## 6.2 Application Launching

| Shortcut | Action |
|---|---|
| F24 + P | PowerShell |
| F24 + T | Windows Terminal |
| F24 + E | File Explorer |
| F24 + C | Calculator |
| F24 + H | Task Manager |

## 6.3 System Controls

| Shortcut | Action |
|---|---|
| F24 + L | Lock Workstation |
| F24 + M | Toggle mute |
| F24 + V | Clipboard history |

## 6.4 Text Utilities

| Shortcut | Action |
|---|---|
| F24 + J | Insert timestamp |
| F24 + Y | Insert date |

Timestamp format:

`yyyy-MM-dd HH:mm:ss`

Date format:

`yyyy-MM-dd`

## 6.5 Workspace Controls

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

Everything Search requires Everything to be installed and accessible.

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
5. Place the frontend files in `C:\ASCS\frontend`.
6. Create the data directory.
7. Run `ASCS.ahk`.

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

- WebViewGui initialization.
- WebView2 messaging configuration.
- WebMessageReceived event registration.
- Navigation event registration.
- Frontend readiness handshake.
- Frontend/backend message dispatch.
- Hidden startup request.
- F24 shortcut definitions.
- Application launching.
- Quick Notes persistence.
- Everything executable detection.
- Dashboard WMI queries.
- Five-second dashboard refresh.
- Activity logging.

## 9.2 Code-Reviewed, Runtime Testing Pending

- WebView2 virtual-host frontend loading.
- Frontend-to-backend messaging.
- Backend-to-frontend messaging.
- Hidden startup behavior.
- F24 standalone activation alongside modifier combinations.
- Quick Notes persistence.
- Everything Search launching.
- Dashboard metric updates.

## 9.3 Planned Features

- Full workspace save and restoration.
- Selected-file path copying.
- Improved Everything detection.
- More comprehensive error handling.
- Startup verification.
- Resource usage optimization.
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
- [ ] Test Everything Search.
- [ ] Test System Dashboard.
- [ ] Verify automatic metric updates.

## Phase 3: Workspace Management

- [ ] Implement workspace saving.
- [ ] Implement workspace restoration.
- [ ] Restore selected-file path copying.

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
5. Selected-file path copying is not implemented.
6. Everything Search depends on an external application.
7. Everything detection may require adjustment for portable installations.
8. CPU and RAM metrics depend on WMI reporting.
9. Dashboard metrics are sampled every five seconds.
10. The current frontend does not display individual search results.

---

# 12. Testing Procedure

Testing should be performed in stages.

| Stage | Test | Expected Result |
|---|---|---|
| 1 | Launch ASCS | No startup error |
| 2 | Hidden startup | Interface remains hidden |
| 3 | Press F24 | Command Center appears |
| 4 | Navigate interfaces | All four views work |
| 5 | Test messaging | Frontend and backend communicate |
| 6 | Save a note | Save acknowledgement appears |
| 7 | Restart ASCS | Saved note remains |
| 8 | Search for a file | Everything opens with the query |
| 9 | Open Dashboard | Metrics appear |
| 10 | Wait five seconds | Metrics refresh |
| 11 | Test shortcuts | Existing assignments remain functional |

A feature should only be marked tested after successful execution on the target Windows system.

---

# 13. Changelog

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
