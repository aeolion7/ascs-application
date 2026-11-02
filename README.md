# Aeolionware Super Command System (ASCS)

**Brand:** AEOLIONWARE SUPER COMMAND SYSTEM  
**Tagline:** AEOLIONWARE, at your command.  
**Version:** 1.5.1
**Platform:** Windows 10/11 (Windows 11 target verification)
**Status:** Version 1.5.1. The 1.5.0 manual test pass (84 checks) covered startup, views, the command palette, shortcuts, application reuse, Explorer item creation, virtual desktops, window positioning, workspaces, Quick Notes, metrics, and Preferences on the target Windows setup. Version 1.5.1 fixes the issues that pass found and needs a focused regression pass (see [Development Status](#10-development-status)).

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
| Keyboard input | Keychron Launcher | Maps the physical Super key to F24; ASCS presents it as Super |
| Automation | AutoHotkey v2 (64-bit) | Handles shortcuts, Windows commands, persistence, and system queries |
| Web interface | Microsoft Edge WebView2 | Hosts the embedded frontend |
| Presentation | HTML and CSS | Defines interface structure and styling |
| Interaction | JavaScript | Handles navigation, input, and WebView messaging |
| File search | Voidtools Everything | Launches the user's indexed file search |
| Persistent data | Local files under `data` | Stores notes, preferences, workspaces, activity logs, and WebView2 profile data |

AutoHotkey remains responsible for command execution and Windows integration. The frontend is a presentation and interaction layer, not a general-purpose command executor.

### Startup and Page Loading

The AutoHotkey script creates a `WebViewGui`, enables WebView messaging, registers message and navigation handlers, maps the `frontend` directory to the `ascs.localhost` virtual host, and navigates to `https://ascs.localhost/index.html`. It sends the window icon once at creation. Re-showing the window uses the existing GUI handle without reapplying the icon; this avoids stale-window errors when activating ASCS across virtual desktops. Basic readiness and the cross-desktop Command Palette activation behavior have been verified on the target installation. Version 1.4.4's WebView security restrictions still need regression testing.

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
├── ASCS.DriveProbe.ahk
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
│   └── VirtualDesktopAccessor.dll       (optional; desktop switching/window moves/cross-desktop focus)
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
| `ASCS.DriveProbe.ahk` | Isolated per-drive metrics worker; the main hotkey process enforces an eight-second timeout |
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

Tapping Super shows ASCS on the view that was last open during the current session, or hides ASCS when it is already active. After ASCS starts, the first view is the Command Center; the sidebar or the command palette's “Command Center” entry returns to it at any time. The Command Center provides CPU and RAM summaries and one storage card per configured drive. Change the drive list in Preferences (defaults: `C:` and `J:`). Drive status and capacity probes are isolated from the hotkey process, can run concurrently without AutoHotkey's duplicate-script prompt, time out after eight seconds, and are cached for 30 seconds. Each probe writes to its own result file so an older worker cannot overwrite a newer result; cards refresh as soon as the probe completes.

The overview receives metrics from the same backend updates used by the System Dashboard. It does not show recent activity because the current backend does not provide an activity-history interface.

### Quick Notes

Quick Notes is opened with Super + Q. It supports multiple notes, title editing, filtering, pinning, deletion, and note/snippet types. Snippets use monospace text and can be copied. Data is stored as a version 2 JSON object in `data/notes.json`; saves are debounced and atomically replaced, with the previous file retained as `.bak`. Deleting a note asks for confirmation in an in-app dialog.

If `notes.json` is unreadable at startup, ASCS loads `notes.json.bak` and shows a notice the next time the window is focused. When ASCS is shown, it checks whether `notes.json` was changed outside ASCS (edited, replaced, or restored) and reloads it; if the editor has unsaved changes, those are kept and the next save overwrites the outside change. As a compatibility path for files written before version 1.4, a single-note file of the form `{"content":"..."}` is converted into a note named “Scratch”; new installations start with an empty version 2 collection.

Each note stores an `id`, `title`, `type` (`note` or `snippet`), `content`, `pinned`, and ISO-8601 `created`/`updated` timestamps. The collection stores `version`, `activeId`, and a `notes` array.

### Everything Launcher

Super + F opens the installed Everything application directly. Type in Everything's own search field to see results as you type; ASCS does not embed search or load the Everything SDK.

### Vivaldi

Super + B detects visible Vivaldi windows even when Windows hides them from the current desktop's normal window list. It focuses a window on the current desktop when possible; if Vivaldi is only open on another desktop, ASCS switches to its topmost window's desktop and focuses it without moving the window or launching a duplicate. If no Vivaldi window exists, ASCS launches the installed browser. Cross-desktop detection requires `VirtualDesktopAccessor.dll` with `GetCurrentDesktopNumber` and `GetWindowDesktopNumber`; if the desktop cannot be detected or switched, ASCS reports the problem instead of opening another window. Super + V remains Clipboard History.

### Explorer Item Creation

With a filesystem folder open and active in File Explorer, Super + Shift + D prompts for a folder name and creates it there. Super + Shift + F prompts for a filename including its extension and creates an empty file in the same folder. Both shortcuts report an error if Explorer is not active, the current location is not a filesystem folder, the name is invalid, or an item with that name already exists. These modified shortcuts do not replace the configurable unshifted Super + D/F assignments.

### System Dashboard

The System Dashboard is opened with Super + I by default. It displays live CPU/RAM metrics, configured drive cards, processor and graphics details, memory configuration, motherboard and BIOS information, and Windows build. Its physical-drive list maps disks to their partitions and mounted drive letters, including volume labels, file systems, capacities, and free space. Metrics refresh every five seconds while ASCS is visible; polling stops while it is hidden or minimized. CPU utilization comes from `GetSystemTimes` deltas and memory from `GlobalMemoryStatusEx`; both return immediately. Hardware inventory is deferred until the Dashboard is first opened, then read once per session through Windows Management Instrumentation (WMI) on a timer after the live metrics are displayed. Showing ASCS, navigating, and hotkeys never wait for metric collection.

Hardware inventory uses `Win32_Processor`, `Win32_ComputerSystem`, `Win32_PhysicalMemory`, `Win32_VideoController`, `Win32_DiskDrive`, `Win32_DiskPartition`, `Win32_LogicalDiskToPartition`, `Win32_LogicalDisk`, `Win32_BaseBoard`, `Win32_BIOS`, and `Win32_OperatingSystem`.

### Super Commands

The Super Commands view is an in-app appendix of the active shortcuts. App/view key defaults can be changed in Preferences. The searchable command launcher opens with Super + Space.

### Preferences and command launcher

Preferences configure up to 12 drive letters, snap spacing, monitor-move sizing, and unique letters for application/view shortcuts. Shortcut changes rebind immediately and are saved in `data/settings.ini`. If a value is rejected, the message names the shortcut and conflicting letter, nothing is applied, and the form returns to the active values. B is reserved for Vivaldi; S, R, L, M, V, J, and Y are reserved for system commands. Terminal and Explorer reuse the existing configured shortcut and open a new window when Shift is held; Shift+Super+D/F remain the folder/file creation shortcuts.

The command launcher filters available ASCS views, applications, and system actions. Use arrow keys to navigate, Enter to run, and Escape to close.

### Workspaces

Super + S saves a snapshot of up to 24 visible application windows on the current virtual desktop; Super + R restores them. Window placement is saved locally in `data/workspace.ini`.

- **Save** skips windows that are minimized, cloaked (for example, on another virtual desktop), tool windows, owned dialogs, and the desktop/taskbar. A window that cannot be measured is skipped and logged instead of cancelling the snapshot. File Explorer windows also record their folder.
- **Restore** reuses open windows before launching anything. First, each saved window is matched exactly (same Explorer folder, or same title for other applications). Then it is matched to any other unclaimed window of the same application, so windows whose titles have changed (Terminal, editors, browsers) are reused. An application is launched only when no unclaimed window of it remains: Explorer reopens the saved folder, and Windows Terminal opens through `wt.exe`. Matching continues for up to 20 seconds per window.
- If no workspace has been saved, or it cannot be restored, ASCS shows an information dialog.

## 6. Keyboard Shortcuts

Shortcut tables use “Super” as the user-facing name for the dedicated key (mapped to F24 by Keychron Launcher). Existing shortcut assignments are:

| Shortcut | Action | Status |
| --- | --- | --- |
| Super | Show ASCS on the last-used view (Command Center after startup), or hide it when already active | Implemented in source |
| Super + Space | Open searchable command launcher | Implemented in source |
| Super + Q | Open Quick Notes (default; configurable) | Implemented in source |
| Super + F | Open Everything (default; configurable) | Implemented in source |
| Super + B | Focus Vivaldi here, switch to its desktop, or open it | Implemented in source |
| Super + Shift + D | Create a folder in the active File Explorer location | Implemented in source |
| Super + Shift + F | Create an empty, named file in the active File Explorer location | Implemented in source |
| Super + I | Open System Dashboard (default; configurable) | Implemented in source |
| Super + 1–9 | Focus virtual desktop 1–9 (top row or numpad) | Implemented in source |
| Super + Shift + 1–9 | Move active window to a desktop, then switch to it | Implemented in source |
| Super + Left / Right | Snap active resizable window to monitor half | Implemented in source |
| Super + horizontal arrow, then vertical arrow | Snap active window to the selected quadrant | Implemented in source |
| Super + Shift + Left / Right | Move active window to adjacent monitor | Implemented in source |
| Super + Up / Down | Maximize, restore, or minimize | Implemented in source |
| Super + T / E | Reuse Terminal / Explorer, switching desktops if needed (defaults; configurable) | Implemented in source |
| Super + Shift + T / E | Open a new Terminal / Explorer window (default keys; configurable) | Implemented in source |
| Super + C / H | Open Calculator / Task Manager (defaults; configurable) | Implemented in source |
| Super + L | Lock workstation | Implemented in source |
| Super + M | Toggle audio mute | Implemented in source |
| Super + V | Open Clipboard History | Implemented in source |
| Super + J | Insert timestamp | Implemented in source |
| Super + Y | Insert date | Implemented in source |
| Super + Shift + S | Open the Snipping Tool capture overlay (`ms-screenclip:`) | Implemented in source |
| Super + S | Save window workspace | Implemented in source |
| Super + R | Restore window workspace | Implemented in source |

Terminal and Explorer shortcuts reuse a visible existing window, preferring the current desktop and switching desktops when necessary. Hold Shift with the configured Terminal or Explorer shortcut to explicitly open a new window. D/F remain Explorer-item shortcuts when Shift is held. When no reusable window exists, the app is launched; delayed activation is skipped if the user has switched to another window in the meantime. File Explorer launch checks wait for a visible folder window rather than treating the Explorer shell process as the folder window.

Timestamp format: `yyyy-MM-dd HH:mm:ss`  
Date format: `yyyy-MM-dd`

Shortcut letter defaults are editable in Preferences; the keys B, S, R, L, M, V, J, and Y are reserved. Super + B prefers an open Vivaldi window on the current desktop, switches to the topmost Vivaldi window's desktop when needed, or opens Vivaldi if no window is running; Super + V remains Clipboard History. Super+Shift+D/F create items only in the active Explorer folder. For Terminal and Explorer, the corresponding configured Shift+Super shortcut opens a new window; D/F keep their item-creation behavior. Super activation and the listed app launch, Vivaldi, snapping, desktop move, and basic workspace behaviors have been verified on the target keyboard/system. New Terminal/Explorer reuse and new-window behavior, numpad NumLock-off aliases, additional DLL/OS combinations, and mixed-DPI positioning remain verification items.

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
| `WindowAction` | `minimize`, `maximize`, or `close` | Controls the frameless ASCS window; `close` hides it |
| `Launch` | Allowlisted launcher identifier | Requests an application launch |
| `GetMetrics` | `home` or `dashboard` | Requests view-specific metrics and defers hardware inventory until the dashboard is opened |
| `GetSettings` | None | Requests current preferences |
| `SaveSettings` | Drives, snap gap, size preference, and shortcut letters | Validates and persists preferences |
| `Log` | Log text | Adds an activity-log entry |

The first newline separates the message type from its content. The full notes JSON is sent as content. The backend validates message types and payload sizes, accepts messages only from `https://ascs.localhost`, and cancels navigation outside that origin.

### AutoHotkey to Frontend

AutoHotkey sends JSON with `PostWebMessageAsJson()`.

| Response type | Purpose |
| --- | --- |
| `navigate` | Activates a view |
| `resume` | ASCS was re-shown without a view change; the frontend refreshes the current view |
| `notes` | Returns opaque notes JSON in `data`, plus `recovered` and `external` (reloaded after an outside change) |
| `saved` | Confirms note persistence |
| `metrics` | Supplies CPU/RAM, legacy C: fields, and a `drives` array |
| `settings` | Returns current preferences |
| `settingsSaved` | Confirms preferences were saved and applied |
| `openLauncher` | Opens the command palette |
| `flushNotes` | Asks the frontend to immediately send a pending note save |
| `error` | Displays an error notification; optional `scope` is `notes` or `settings` |

On `Ready`, the backend marks the page ready and sends the pending view and initial data. Metric requests (`GetMetrics`, showing the window, completed drive probes) are coalesced onto a timer and never run inside a message handler or hotkey. Dashboard polling starts only while the ASCS window is visible; it refreshes every five seconds and stops when the window is hidden or minimized. Drive metrics are pushed again as soon as their asynchronous probe completes. The `metrics` response keeps `disk`, `diskUsed`, and `diskTotal` for C: and adds `drives: [{letter, usage, used, total, online}]`.

### Security Considerations

- Keep frontend actions mapped to predefined backend operations.
- Validate message types and content in the backend.
- Do not add unrestricted shell or PowerShell execution to the frontend bridge.
- Keep file access limited to ASCS data paths where practical.
- Restrict external navigation to approved destinations.

The backend cancels navigation outside `https://ascs.localhost`, rejects bridge messages whose source is outside that origin, and blocks new-window requests. Release WebView settings disable DevTools, default context menus, browser accelerator keys, zoom controls, and host objects. Host objects are disabled because WebViewToo otherwise injects a `global` object into `*.localhost` pages that exposes every AutoHotkey function to page script, bypassing the allowlisted bridge. The cancelled navigation of WebViewToo's built-in `data:` template at startup is expected and is not logged. The frontend Content Security Policy limits resource loading to the local app (with inline styles and data images allowed). These controls are implemented but still require target-system regression testing.

## 8. Dependencies

### Required

- Windows 10 or Windows 11 (Windows 11 is the target verification platform).
- AutoHotkey v2, 64-bit.
- Microsoft Edge WebView2 Runtime.
- Locally installed WebViewToo and its required files under `C:\ASCS\webview`.
- Keychron Launcher configured to emit F24 for the physical Super key.

### Optional

- Voidtools Everything for file search.
- `lib\VirtualDesktopAccessor.dll` for direct desktop switching, moving windows between desktops, and focusing Vivaldi across desktops.

Everything is optional and only needed for its launcher. ASCS opens the application directly; no Everything SDK DLL is required. To use desktop switching or window moves, place a compatible VirtualDesktopAccessor.dll in `lib`; ASCS reads the current desktop count and targets only existing desktops. Super + B also uses this DLL to locate Vivaldi across desktops and switch to its desktop. That behavior additionally requires the `GetCurrentDesktopNumber` and `GetWindowDesktopNumber` exports. For desktop shortcuts and window moves, verify `GetDesktopCount`, `GoToDesktopNumber`, and `MoveWindowToDesktopNumber`. If the DLL or required exports are missing or fail, desktop actions report a failure and Super + B does not open a duplicate Vivaldi window. The upstream API documents `-1` as the error return; ASCS treats nonnegative results as success. The WebView2 Evergreen Runtime is preferred.

## 9. Installation and Startup

1. Install AutoHotkey v2, 64-bit.
2. Install the Microsoft Edge WebView2 Runtime.
3. Configure the Keychron Super key to emit F24 (the user-facing shortcut name is Super).
4. Place WebViewToo and its dependencies under `C:\ASCS\webview`.
5. Place the frontend files, including `assets\ascs.ico`, under `C:\ASCS\frontend`.
6. Ensure the `data` directory is available; the script creates it when needed.
7. Restrict write access to the installing account, Administrators, and SYSTEM; do not run ASCS elevated.
8. Run `C:\ASCS\ASCS.ahk`.

The script starts hidden. Tapping Super shows the Command Center after startup (later, the last-used view), or hides ASCS when it is already active. Reloading the script and registering the configurable shortcuts, including the Shift-modified Terminal/Explorer behavior, have been tested. After changing frontend assets, restart or reload ASCS to load the updated interface.

## 10. Development Status

Status labels distinguish source implementation from execution on the target system:

- **Implemented in source:** Corresponding code exists in the repository.
- **Code-reviewed:** Source and message contracts have been inspected; this is not runtime verification.
- **Runtime-tested:** Manually executed on the target Windows installation; completed checks are marked below. The v1.4.4 WebView security and drive-worker changes still need regression testing.
- **Planned or pending:** Not implemented, incomplete, or awaiting validation.

### Implemented in Source

- Application launch activation, including asynchronous process/window waiting that avoids stealing focus after the user switches windows.
- Reuse-first Windows Terminal and File Explorer shortcuts; when an existing window is on another virtual desktop, ASCS switches to that desktop and focuses it. Hold Shift with the configured shortcut to request a new window.
- A Super-key Command Center toggle that hides the active window or shows the home view.
- WebViewGui initialization, messaging setup, event registration, and virtual-host mapping.
- Frontend readiness handshake and newline-delimited message dispatch.
- Frontend JSON response handling.
- Super shortcut definitions, application launchers, and basic system controls.
- Quick Notes v2 multi-note JSON persistence, atomic replacement, backup fallback, and save acknowledgements.
- Super+F direct Everything launch.
- Super+Shift+D/F active-Explorer folder and empty-file creation, including name validation and duplicate protection.
- Custom ASCS title bar, window controls, and display-aware 1920 × 1080 startup sizing.
- WMI metrics with a reused WMI connection, lazy physical-hardware collection on first Dashboard view, and configurable drive cards with network-drive polling guards.
- Per-drive probe result files and process IDs, concurrent probe execution without duplicate-instance prompts, bounded worker lifetime, cached results, and immediate metric refresh after completion.
- Incremental drive-card updates and unchanged-hardware render suppression in the frontend.
- Desktop switching, active-window desktop moves, quadrant snapping, and monitor-to-monitor window movement.
- Saved workspace capture/restoration and a searchable command launcher.
- A Preferences view for drive selection, snap gap, monitor sizing, and live shortcut rebinding.
- Five-second dashboard refresh while the ASCS window is visible; drive probes run in a separate process with an eight-second timeout.
- A compact, balanced, responsive Commands layout with two desktop columns and a single narrow-screen column; drive cards use the shared metric-card styling.
- The five primary frontend interfaces, command launcher, Super Commands appendix, and Preferences.

### Engineering Checks Completed

- [x] Review the vendored WebViewToo and WebView2 APIs.
- [x] Establish the frontend/backend communication contract and newline-delimited request protocol.
- [x] Implement the frontend readiness handshake.
- [x] Keep frontend requests mapped to allowlisted backend operations and use backend-provided metric fields.

### Runtime Tests Verified

- [x] Super activation and opening the Command Center.
- [x] Basic Command Center, Quick Notes, System Dashboard, and Super+F Everything use.
- [x] Application launches and foreground activation, including existing windows, Downloads/Documents, Browser, Windows Settings, and Snipping Tool.
- [x] File Explorer, Downloads, and Documents foreground behavior over maximized windows.
- [x] Quadrant snapping and adjacent-monitor movement.
- [x] Super+Shift+number window movement using the compatible virtual-desktop DLL.
- [x] Workspace save and restore basics.
- [x] Vivaldi current/other-desktop focus, launch-if-closed, error behavior, and command-launcher entry.
- [x] Re-showing the existing ASCS/Command Palette window from another desktop without a stale-window error.
- [x] Super toggles the Command Center; Terminal and Explorer reuse existing windows and can switch desktops to focus them.
- [x] Shift-modified Terminal/Explorer shortcuts register and reload; Shift+Super+D/F retain their Explorer item-creation actions.
- [x] Drive probes run independently with unique outputs; Dashboard hardware details are deferred, and completed probes refresh their cards promptly.
- [x] Responsive Commands layout and shared drive/RAM card styling.
- [x] 1.5.0 manual pass: hidden startup, single instance, window chrome, WebView restrictions (context menu, DevTools, zoom, reload), command palette filtering and keyboard operation, all palette entries and quick actions.
- [x] 1.5.0 manual pass: configurable and fixed Super shortcuts, Terminal/Explorer/Vivaldi reuse and new-window behavior, missing-DLL reporting, and focus-steal protection.
- [x] 1.5.0 manual pass: full Explorer item-creation matrix, top-row and numpad (NumLock on/off) desktop switching, desktop moves, half/quadrant snapping, snap gap, and maximize/restore/minimize.
- [x] 1.5.0 manual pass: Quick Notes create/rename/filter/pin/type/copy/delete, persistence across restarts, hide flush, exit flush, backup recovery, and 5 MB limit.
- [x] 1.5.0 manual pass: CPU/RAM/drive cards, five-second refresh, no polling while hidden, hardware and disk-layout details, Preferences persistence/validation/live rebinding, and Super Commands content.

### Runtime Testing Pending

- **1.5.1 regression:** Super+Shift+S opens the capture overlay (not Start); the window and palette respond immediately after showing; Super resumes the last-used view; a desktop number beyond the desktop count shows a tooltip; workspace save with two windows of one application; workspace restore reuses open Terminal/Explorer windows and reopens saved Explorer folders; the missing-workspace dialog; the delete-note dialog; the backup-recovery and outside-change notices; Preferences form reset after a rejected save; and the `SUPER COMMANDS` breadcrumb.
- Mixed-DPI and multi-monitor layouts, adjacent-monitor moves, and monitor work-area/frame-bound calculations (the target system has a single monitor).
- Network-drive offline behavior, the eight-second worker timeout, and delayed refresh without blocking hotkeys.
- Additional Windows builds, VirtualDesktopAccessor DLL versions, and alternate Windows Terminal launch configurations.
- Hardware detail collection on devices with multiple GPU/disk/memory configurations.

- Untrusted-origin message rejection and blocked new-window requests (not reachable from the shipped frontend; verify with a deliberately modified page).

## 11. Known Limitations

- WebView origin restrictions, security settings, and complete startup/frontend callback regression coverage still need broader testing across supported installations.
- Additional Windows builds, virtual desktop DLL versions, and modifier/keyboard configurations need compatibility testing.
- Workspace restore validates absolute existing `.exe` paths against the recorded process name and launches without arguments (except Explorer folders and Windows Terminal, as described in [Workspaces](#workspaces)); only up to 24 visible windows on the current desktop are captured. Windows of the same application whose titles have changed are matched in enumeration order, so two such windows can swap positions.
- Super+F requires the Everything application to be installed; ASCS delegates search and result display to it.
- The VirtualDesktopAccessor DLL's broader window-move APIs and OS-build compatibility require additional testing; Vivaldi cross-desktop focus and the reported desktop-move behavior have been verified on the target system.
- Drive readiness and capacity checks run in a separate AutoHotkey process; the main process stops a worker after eight seconds and caches results for 30 seconds. WMI and Windows drive reporting determine metric availability.
- Desktop switching, window moves, and focusing existing Vivaldi, Terminal, or Explorer windows across desktops require `VirtualDesktopAccessor.dll`; if unavailable, ASCS reports the failure rather than launching a duplicate.
- Monitor frame-bound calculations depend on Windows DPI coordinate behavior and require runtime verification.
- Metrics depend on WMI and Windows drive reporting.
- The Command Center does not display recent activity.
- Activity log entries are single-line, capped, and rotated at 1 MiB to one backup.
- No automated runtime test suite is included; the current release has been verified with targeted script, browser, and on-device checks.

## 12. Development Roadmap

### WebView2 Stabilization

- Verify WebViewToo initialization against the locally installed library.
- Verify frontend callback registration and message dispatch.
- Verify frontend-to-AutoHotkey and AutoHotkey-to-frontend communication.
- Verify hidden startup, detailed notes persistence/recovery, Everything search behavior, dashboard metrics, WebView security controls, and Vivaldi/virtual-desktop behavior on additional supported systems; target-system checks are recorded above.

### Future Improvements

- Review startup reliability and resource use.
- Expand automation tools while keeping the message bridge allowlisted.
- Refine keyboard navigation and overall interaction consistency.

## 13. Changelog

### Version 1.5.1 — Test-Pass Fixes and Responsiveness

- Fixed ASCS being unresponsive for several seconds after showing, a 2–3 second command-palette delay, and sluggish hotkeys. CPU and RAM now come from `GetSystemTimes`/`GlobalMemoryStatusEx` instead of WMI's `Win32_Processor.LoadPercentage`, which blocked for about one second per query. Metric pushes are coalesced onto timers, and the one-time hardware inventory runs after the live metrics are shown.
- Super+Space opens the palette immediately over the current view.
- Tapping Super now shows the view that was last open during the session; the Command Center is the first view after startup.
- Fixed Super+Shift+S opening the Start menu; it now opens the capture overlay through `ms-screenclip:`, as does the palette's Snipping Tool entry.
- Fixed workspace saves failing with “Unable to identify the window's monitor.” Monitor lookup now uses `MonitorFromWindow`; cloaked, owned, and shell windows are excluded; and one bad window is skipped instead of cancelling the save.
- Workspace restore reuses already-open windows (an exact match first, then any window of the same application) and launches only when none remain. Explorer reopens saved folders, and Windows Terminal relaunches through `wt.exe`.
- “No saved workspace” and restore failures now appear as information dialogs instead of tooltips.
- Switching or moving to a desktop number that does not exist shows a tooltip.
- Replaced the browser confirmation with a styled in-app dialog for deleting notes.
- Notes recovered from backup, converted from the legacy format, or reloaded after an outside change now show a notice when ASCS is next focused, rather than while hidden.
- ASCS reloads `notes.json` when it is changed outside the app; unsaved edits take precedence. New installations start with an empty version 2 notes file.
- Rejected Preferences now restore the form to the active values, and the messages name the shortcut and the conflicting letter.
- Corrected the `SUPER COMMANDS` breadcrumb capitalization.
- Security: disabled WebView2 host objects, closing a path through which page script could call any AutoHotkey function via WebViewToo's injected `global` object. Removed the unused `browser` launch identifier from the bridge allowlist.
- Stopped logging the expected cancellation of WebViewToo's startup template on every launch.

### Version 1.5.0 — Performance, Launch Reuse, and Command Center Polish

- Made tapping Super toggle the Command Center: show the home view when ASCS is inactive, or hide it when already active.
- Changed Terminal and Explorer to reuse an existing visible window, preferring the current desktop and switching desktops when necessary. Hold Shift with the configured shortcut to open a new window; the D/F item-creation bindings keep their existing behavior.
- Made delayed application activation asynchronous and conditional on the foreground remaining unchanged, reducing accidental foreground stealing.
- Added Super+Shift+D to create a folder in the active File Explorer location.
- Added Super+Shift+F to create an empty file in the active File Explorer location; enter a filename with its extension.
- Kept unshifted Super+D/F available for configurable shortcuts; unassigned Super+D passes through to Windows Show Desktop.
- Require the target File Explorer window to be active; validate names and refuse to overwrite existing items.
- Improved drive metrics by allowing concurrent probe workers, giving every probe a unique result path, reusing the WMI connection, and refreshing metrics as soon as a probe completes.
- Deferred detailed hardware inventory until the Dashboard is first opened; the Command Center receives only the metrics it needs.
- Reconcile drive cards in place and skip unchanged hardware rendering; normalized drive card styling with other metric cards.
- Reworked the Commands reference into balanced flowing columns with compact spacing and a single-column narrow-screen layout.
- Updated the README and in-app shortcut descriptions to document the launch policy, performance work, and modified shortcuts.

### Version 1.4.4 — WebView and Workspace Hardening

- Validated workspace restore targets as absolute, existing `.exe` paths matching the saved process name; restore never accepts stored command-line arguments.
- Restricted WebView navigation and bridge messages to `https://ascs.localhost`; blocked popup windows and disabled DevTools, context menus, browser accelerators, and zoom controls.
- Added a restrictive frontend Content Security Policy.
- Moved drive capacity/status probes into a separate process with an eight-second timeout; dashboard polling now stops when ASCS is hidden or minimized and resumes while visible.
- Sanitized and bounded activity-log entries and rotate the log at 1 MiB.
- Kept the window icon assignment at creation time; showing ASCS no longer sends redundant icon messages to a potentially stale window handle.
- Verified that re-showing the existing Command Palette from another virtual desktop focuses the ASCS window without a stale-HWND error.
- Updated the Keychron setup instructions to emit F24 and aligned platform, message-contract, and runtime-status documentation.
- WebView security controls and drive-worker timeout behavior still need target-system regression testing.

### Version 1.4.3 — Vivaldi Cross-Desktop Detection

- Fixed Super+B detection of Vivaldi windows on other virtual desktops by temporarily enabling AutoHotkey hidden-window enumeration, then filtering out invisible helper windows.
- Kept current-desktop Vivaldi windows preferred; when needed, switch to the desktop of the topmost Vivaldi window before activation without moving or duplicating windows.
- Vivaldi cross-desktop focus and File Explorer foreground behavior have been verified on the target Windows system.

### Version 1.4.2 — Vivaldi Focus-or-Open

- Added Super+B to focus or launch Vivaldi, and to prefer an existing window on the current desktop before switching to another desktop.
- Cross-desktop focus requires `GetCurrentDesktopNumber` and `GetWindowDesktopNumber` from VirtualDesktopAccessor.dll; if these APIs are unavailable, ASCS reports the problem instead of launching a duplicate.
- Added Vivaldi to the command launcher while retaining Super+V for Clipboard History; reserved B from configurable shortcuts and documented the binding in the shortcut reference and Preferences.
- Initial cross-desktop window enumeration did not find Vivaldi windows on other desktops; corrected in v1.4.3.

### Version 1.4.1 — Application Foreground Activation

- Added process/window waiting and `WinActivate` requests to application launch paths so launched applications are brought to the foreground when Windows allows it.
- Manually verified on the target Windows system: Super+E/T/C/H/F shortcuts; app launches from Super+Space; foreground activation when an app was already open; Downloads and Documents folder launches; Browser, Windows Settings, and Snipping Tool launcher actions.
- Detailed notes persistence, WebView security controls, dashboard metrics, automatic metric updates, and additional virtual-desktop configurations still require validation.

### Version 1.4.0 — Window Management and Productivity

- Added two-direction arrow chords for quadrant snapping, configurable snap spacing, and left/right adjacent-monitor window moves.
- Added Super+Shift+number window-to-desktop moves with bounds checks, plus direct switching through VirtualDesktopAccessor.
- Implemented local workspace capture and restoration, including relaunching missing applications.
- Added Super+Space searchable command launcher, Preferences, persistent drive/shortcut settings, and immediate hotkey rebinding.
- Expanded the System Dashboard with cached WMI hardware/device details.
- Updated the in-app shortcut reference and project documentation.
- Basic snapping, desktop moves, and workspace save/restore have since been verified; mixed-DPI behavior, remaining DLL exports, WebView2 hardening, and network-drive timeout behavior still require validation.

### Version 1.3.0 — Notes v2 and Windows Controls

- Focused the Quick Notes primary input on navigation and window activation using the vendored WebView `MoveFocus(0)` API.
- Super+F opens Everything directly; embedded SDK search and its bundled SDK files were removed after runtime issues.
- Added multi-note v2 storage, autosave, atomic replacement, backup recovery, legacy migration, and flush-on-hide/close handling.
- Added configurable C:/J: storage cards and a 30-second network-drive metrics cache.
- Added Super number/numpad virtual desktop switching and Super+arrow active-window positioning.
- Added the ASCS window icon, branded draggable title bar, window controls, and display-aware startup sizing.
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
