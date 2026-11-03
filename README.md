# Aeolionware Super Command System (ASCS)

**Brand:** AEOLIONWARE SUPER COMMAND SYSTEM  
**Tagline:** AEOLIONWARE, at your command.  
**Version:** 1.6.0  
**Platform:** Windows 10/11 (Windows 11 target verification)  
**Status:** Version 1.6.0 adds a much broader command palette, quick capture, snippet pasting, named workspaces, custom commands, an activity feed, a keyboard map, a redesigned title bar, a tray menu, burgundy and gold accents, and an automated unit test suite. The automated tests and an isolated backend smoke test pass. The new features need a manual pass on the target system (see [Development Status](#12-development-status)). Release history is in [CHANGELOG.md](CHANGELOG.md).

ASCS is a keyboard-driven Windows utility suite. It uses AutoHotkey v2 for hotkeys and Windows automation, WebView2 for its graphical interface, and a web frontend built with HTML, CSS, and JavaScript.

## Contents

- [1. Project Overview](#1-project-overview)
- [2. Architecture](#2-architecture)
- [3. Visual Identity](#3-visual-identity)
- [4. Application Structure](#4-application-structure)
- [5. Interfaces](#5-interfaces)
- [6. Keyboard Shortcuts](#6-keyboard-shortcuts)
- [7. Frontend and Backend Communication](#7-frontend-and-backend-communication)
- [8. Security](#8-security)
- [9. Dependencies](#9-dependencies)
- [10. Installation and Startup](#10-installation-and-startup)
- [11. Testing](#11-testing)
- [12. Development Status](#12-development-status)
- [13. Known Limitations](#13-known-limitations)
- [14. Development Roadmap](#14-development-roadmap)
- [Changelog](CHANGELOG.md)

## 1. Project Overview

ASCS centralizes application launching, system controls, productivity utilities, file search, and system monitoring behind the dedicated Super key, mapped to F24 by Keychron Launcher.

The application has five views and a command palette:

1. **Command Center:** live metrics, quick actions, and recent activity
2. **Quick Notes:** notes and reusable snippets
3. **System Dashboard:** live metrics and hardware inventory
4. **Super Commands:** a reference for every shortcut
5. **Preferences:** drives, snapping, shortcuts, web search, custom commands, and workspaces
6. **Command palette** (Super + Space): one search box for commands, notes, snippets, workspaces, windows, math, files, and the web

## 2. Architecture

### Technology and Responsibilities

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Keyboard input | Keychron Launcher | Maps the physical Super key to F24; ASCS presents it as Super |
| Automation | AutoHotkey v2 (64-bit) | Handles shortcuts, Windows commands, persistence, and system queries (`ASCS.ahk`) |
| Core logic | AutoHotkey v2 | Pure, testable validators and algorithms (`lib\ASCS.Core.ahk`) |
| Web interface | Microsoft Edge WebView2 | Hosts the embedded frontend |
| Presentation | HTML and CSS | Defines interface structure and styling |
| Interaction | JavaScript | Navigation, input, and messaging (`app.js`); palette matching and calculator (`palette.js`) |
| File search | Voidtools Everything | Opens the user's indexed file search, optionally with a query |
| Persistent data | Local files under `data` | Notes, preferences, custom commands, workspaces, activity, logs, and WebView2 profile data |

AutoHotkey remains responsible for command execution and Windows integration. The frontend is a presentation and interaction layer, not a general-purpose command executor. It can only request operations from the allowlist in [section 7](#7-frontend-and-backend-communication).

### Startup and Page Loading

The AutoHotkey script creates a `WebViewGui`, enables WebView messaging, registers message and navigation handlers, maps the `frontend` directory to the `ascs.localhost` virtual host, and navigates to `https://ascs.localhost/index.html`. It replaces the tray menu with the ASCS menu and starts hidden. On the frontend's `Ready` message, it sends the initial view, notes, preferences, custom commands, workspaces, and activity.

The window opens at up to 1920 × 1080 pixels, centered and constrained to the primary display's work area. Its native title bar is disabled while the taskbar button is retained; the custom title bar provides the ASCS mark, a draggable surface, and minimize, maximize/restore, and hide controls. The Command Center uses a compact layout at shorter heights to avoid scrolling on open.

Nothing slow runs on the hotkey or message path. CPU and RAM readings take under a millisecond, metric pushes are coalesced onto timers, drive probes run in a separate process, and the one-time hardware inventory runs after the live metrics are displayed.

## 3. Visual Identity

### Aeolionware Obsidian

The frontend uses a premium desktop-oriented dark theme with balanced spacing, restrained gradients, and rounded layered panels. Since 1.6.0 it uses three accents: violet (primary), burgundy (secondary), and gold (tertiary). Typography uses Segoe UI. Inline SVG provides interface graphics, and a custom ICO supplies the window, tray, and favicon icon.

| Design token | Color or treatment |
| --- | --- |
| Main background | `#0E1017`, with faint violet (top right) and burgundy (bottom left) glows |
| Sidebar | `#131621` |
| Panels | `#181B27` |
| Elevated panels | `#202434` |
| Primary accent (violet) | `#8D83FF`; gradient `#7167E8` → `#A078ED` |
| Secondary accent (burgundy) | `#8A2846` deep, `#C4587B` bright, `#E8A3B9` text; gradient `#7D2441` → `#B04A6D` |
| Tertiary accent (gold) | `#C9A24A` base, `#E3C072` bright, `#ECD49C` text; gradient `#A8812F` → `#E3C072` |
| Success | `#66D9A8` |
| Primary text | `#F5F6FB` |
| Secondary text | `#A4A9BB` |
| Typeface | Segoe UI |

| Accent | Meaning | Used for |
| --- | --- | --- |
| Violet | Interaction | Selection, focus, primary buttons, navigation, links |
| Burgundy | Resources and saved items | Every usage bar (CPU, RAM, drive cards, and the Dashboard's per-volume fullness bars); snippets, workspaces, captured notes; heading punctuation and eyebrow lines; the palette mode chip; destructive actions (Delete buttons and confirmation dialogs) |
| Gold | Distinction and attention | Any resource at **90% or more** (its bar turns gold); pinned notes; the palette's Recent group, calculator results, and custom commands; “NEW” badges; custom-command activity |

The layout adapts to narrower WebView windows, provides visible keyboard focus, and honors reduced-motion preferences. On wide and ultrawide displays, the application uses a wider canvas and a larger type scale.

## 4. Application Structure

```text
C:\ASCS\
├── ASCS.ahk                  Main script: WebView, hotkeys, messaging, features
├── ASCS.DriveProbe.ahk       Isolated per-drive metrics worker
├── ASCS.Launcher.ahk         Resident Ctrl+Alt+Shift+A helper: starts or reloads ASCS
├── README.md
├── CHANGELOG.md
├── frontend\
│   ├── assets\ascs.ico
│   ├── index.html
│   ├── styles.css
│   ├── palette.js            Pure palette logic (matching, ranking, calculator)
│   ├── keymap.js             Keyboard-map layout (customized Q6 Max) and Super / Super+Shift bindings
│   └── app.js
├── lib\
│   ├── ASCS.Core.ahk         Pure helpers shared by ASCS.ahk and the tests
│   └── VirtualDesktopAccessor.dll   (optional; desktop switching and cross-desktop focus)
├── tests\
│   ├── run-tests.ps1         Runs both suites
│   ├── core.tests.ahk
│   ├── frontend.tests.html   Runs harness.js, palette.tests.js, keymap.tests.js
│   ├── harness.js
│   ├── palette.tests.js
│   └── keymap.tests.js
├── tools\
│   └── Install-Shortcut.ps1  Start Menu shortcut with the Ctrl+Alt+Shift+A hotkey (optional Startup entry)
├── webview\                  WebViewToo and WebView2 wrappers (vendored)
└── data\                     Created at runtime
    ├── notes.json (+ .bak)
    ├── settings.ini
    ├── commands.ini
    ├── workspace.ini         Default workspace (Super+S / Super+R)
    ├── workspaces\*.ini      Named workspaces
    ├── activity.log
    ├── ASCS_Log.txt
    └── WebView2\
```

| File | Purpose |
| --- | --- |
| `data/notes.json` | Version 2 Quick Notes collection; `.bak` holds the previous save |
| `data/settings.ini` | Drives, window preferences, shortcut letters, and the web search address (`[Palette] SearchUrl`) |
| `data/commands.ini` | Custom palette commands (name, kind, target, optional key) |
| `data/workspace.ini`, `data/workspaces/` | Saved window layouts |
| `data/activity.log` | Activity feed entries (tab-separated; compacted to the newest 50) |
| `data/ASCS_Log.txt` | Diagnostic log, rotated at 1 MiB |
| `data/WebView2/` | WebView2 profile, including the palette's usage ranking in local storage |

WebViewToo is maintained separately from ASCS application code.

## 5. Interfaces

### Command Center

Tapping Super shows ASCS on the view that was last open during the session, or hides ASCS when it is already active. The first view after startup is the Command Center.

The Command Center shows CPU and RAM summaries, one storage card per configured drive (defaults `C:` and `J:`), quick actions, and **Recent activity**. The feed lists the latest five events, newest first, with relative times: launches, custom commands, captures, pasted snippets, workspace saves/restores/deletions, palette searches, created Explorer items, and problems. On windows shorter than 820 px it shows three events, so the Command Center does not need to scroll. Activity persists across restarts in `data\activity.log`.

Drive status and capacity probes run in a separate process, can run concurrently, time out after eight seconds, and are cached for 30 seconds. Cards refresh as soon as a probe completes.

### Command Palette

Super + Space opens the palette over the current view. Type to search; ↑/↓ select, Enter runs, and Esc closes.

| What you type or choose | What you get |
| --- | --- |
| Nothing | Your five most recent commands, then all commands |
| Any text | Ranked results from ASCS views, apps and actions, custom commands, workspaces, notes, snippets, and open windows on this desktop. The list ends with **Search files for…** (opens Everything with the query) and **Search the web for…** |
| Math, such as `18*1.2` or `sqrt(2)`, or text starting with `=` | A calculator result; Enter copies it. Supports `+ − × ÷ % ^`, parentheses, `sqrt abs round floor ceil ln log sin cos tan`, `pi`, and `e` |
| Text starting with `?` | A web search, using the address in Preferences (DuckDuckGo by default) |
| **Paste a snippet…** / Super + Shift + P | Snippets mode: Enter pastes into the window you were using; Shift + Enter copies |
| **Restore a workspace…** / Super + Shift + R | Workspaces mode |
| **Save workspace as…** | Type a name; Enter saves the current layout under that name |
| **Switch to window…** | Windows mode: jump to any open window on this desktop |

On a note, Enter opens it in Quick Notes and Shift + Enter copies its text. In a mode, the mode's name appears as a chip in the search box; Backspace in an empty search returns to all commands.

Matching ranks prefixes, word starts, and initials (`wt` finds Windows Terminal), and accepts letters in order within a title (`tmgr` finds Task Manager). Descriptions and keywords must contain the typed text. Commands you use often or recently rank higher; this ranking is stored in the WebView profile.

### Quick Notes

Quick Notes (Super + Q by default) supports multiple notes, title editing, filtering, pinning, deletion with an in-app confirmation dialog, and note/snippet types. Snippets use a monospace editor with a burgundy edge and can be copied, pasted from the palette, or opened with Super + Shift + P.

**Quick capture:** Super + Shift + C copies the selected text in the active application into a new note titled “Captured · *window title*”, without showing ASCS. If nothing is selected, it captures the current clipboard text instead. The clipboard is restored afterwards, and captures over 200,000 characters are truncated.

Data is stored as a version 2 JSON object in `data/notes.json`. Saves are debounced and atomically replaced, and the previous file is kept as `.bak`. If `notes.json` is unreadable at startup, ASCS loads the backup and shows a notice the next time it is focused. When ASCS is shown, it reloads `notes.json` if the file was changed outside ASCS; unsaved edits in the editor take precedence. A pre-1.4 single-note file of the form `{"content":"..."}` is converted into a note named “Scratch”.

Each note stores an `id`, `title`, `type` (`note` or `snippet`), `content`, `pinned`, and ISO-8601 `created`/`updated` timestamps. The collection stores `version`, `activeId`, and a `notes` array.

### Everything Launcher

Super + F opens Everything. The palette's “Search files for…” opens Everything with that query (`Everything.exe -search`). ASCS does not embed results or load the Everything SDK.

### Vivaldi

Super + B detects Vivaldi windows on any virtual desktop. It focuses one on the current desktop when possible, otherwise switches to the topmost window's desktop and focuses it, and launches Vivaldi only when no window exists. Cross-desktop detection requires `VirtualDesktopAccessor.dll` with `GetCurrentDesktopNumber` and `GetWindowDesktopNumber`; if detection fails, ASCS reports the problem instead of opening a duplicate.

### Explorer Item Creation

With a filesystem folder active in File Explorer, Super + Shift + D creates a folder and Super + Shift + F creates an empty file (enter a name with its extension). Both report an error if Explorer is not active, the location is not a filesystem folder, the name is invalid, or the item already exists.

### System Dashboard

The System Dashboard (Super + I by default) shows live CPU/RAM metrics, drive cards, processor and graphics details, memory configuration, motherboard and BIOS information, the Windows build, and a disk-to-partition-to-volume map. Metrics refresh every five seconds while ASCS is visible and stop while it is hidden or minimized. CPU comes from `GetSystemTimes` deltas and memory from `GlobalMemoryStatusEx`. The hardware inventory is read once per session through WMI (`Win32_Processor`, `Win32_ComputerSystem`, `Win32_PhysicalMemory`, `Win32_VideoController`, `Win32_DiskDrive`, `Win32_DiskPartition`, `Win32_LogicalDiskToPartition`, `Win32_LogicalDisk`, `Win32_BaseBoard`, `Win32_BIOS`, `Win32_OperatingSystem`).

### Super Commands

An in-app reference for every shortcut, led by a **keyboard map** of the user's customized Keychron Q6 Max: a 100% board with a full-width left Shift, a rectangular Enter with `\ |` above it, seven macro keys (M1–M3 in place of PrtSc/ScrLk/Pause, M4–M7 above the numpad), a **Code** key between left Ctrl and Alt, and Alt · **Super** · Fn · Ctrl right of Space. The map has two layers, **Super** and **Super + Shift**. Keys in use are filled by category: violet for apps and views, steel for windows and system, burgundy for workspaces, notes and text, and gold for custom commands. Free keys are outlined. The physical Super key is drawn in metallic gold. The Code key and macro keys M1–M7 are outlined in dashed gold as **Planned**: they are reserved for future ASCS functionality and currently have no compatibility. Fn is handled by the keyboard and is not used by ASCS. Hover over or focus a key for its command or note (and, for unassigned C/D/F/P, the Windows shortcut that passes through). Switch layers with the toggle, or hold Shift while the view is open to preview the second layer. The map follows your Preferences letters and custom commands immediately. Configurable letters in the lists below update as soon as Preferences are saved, and new 1.6.0 shortcuts are marked “NEW”.

### Title Bar

The title bar is one continuous top strip. The sidebar's brand sits on the same centre line, followed by your location (`ASCS / view`), a **command bar** (“Search or run a command”, Super + Space) that opens the palette, a live **status pill**, and the clock. The pill reads “All systems nominal” in green, or turns gold with “Attention · J: 94% full” (or CPU/memory) when any monitored resource reaches 90%; hover for the full list. Every text run is trimmed to its capital height (`text-box: trim-both cap alphabetic`), and controls use even heights (command bar 32 px, status pill 26 px, key chips 20 px) on the 60 px bar. As a result, the brand, labels, controls, clock, and caption glyphs share one optical centre line (verified to within half a pixel at 2× scale). There is no band or divider at rest, so nothing falls short of the window edges. Once the page scrolls, the bar stays at the top and a frosted band with a hairline fades in behind it, drawn edge to edge across the main area whatever the content padding. The caption buttons are pinned to the window's top-right corner at the bar's full height (48 × 60), with crisp 10 px glyphs drawn on whole-pixel strokes. Double-clicking the bar maximizes or restores the window. Maximize swaps to a restore glyph while the window is maximized, and Close hides ASCS (it keeps running) with a burgundy hover. Below 1100 px wide, the command bar and clock are hidden.

### Preferences

- **System overview:** up to 12 monitored drives, snap gap (0–48 px), and whether window size is preserved when moving between monitors.
- **Super-key shortcuts:** unique letters for Quick Notes, Everything, System Dashboard, Windows Terminal, File Explorer, Calculator, and Task Manager. B, S, R, L, M, V, J, and Y are reserved. Changes rebind immediately. If a value is rejected, the message names the shortcut and the conflicting letter, nothing is applied, and the form returns to the active values.
- **Command palette:** the web search address, which must use `https://` and contain `%s`.
- **Custom commands:** rows of name, type (Application, Folder, or Web link), target, and an optional Super letter, with a Browse… picker for applications and folders. Applications must be existing `.exe` or `.lnk` files and start without arguments; folders must exist; links must be `http(s)` URLs. Letters may not collide with built-in or other custom shortcuts. Up to 30 commands; Save commands applies them immediately. If saving fails, your edits stay in the form so you can fix the reported row.
- **Workspaces:** a list of saved layouts with Restore and Delete, plus a field to save the current layout under a name.

### Workspaces

Super + S saves the **Default** workspace and Super + R restores it. Named workspaces are saved from the palette (“Save workspace as…”) or Preferences, and chosen with Super + Shift + R. Names use letters, numbers, spaces, `-` and `_` (up to 40 characters).

- **Save** captures up to 24 visible application windows on the current desktop. It skips minimized, cloaked (other-desktop), tool, and owned windows and the desktop/taskbar. A window that cannot be measured is skipped and logged instead of cancelling the save. Explorer windows also record their folder.
- **Restore** reuses open windows before launching anything. First it matches exactly (same Explorer folder, or same title); then it matches any unclaimed window of the same application. An application is launched only when none of its windows remain: Explorer reopens the saved folder, and Terminal opens through `wt.exe`. Matching continues for up to 20 seconds per window.
- A missing or failed restore shows an information dialog.

### Tray Menu

Click the tray icon to show ASCS. Right-click for Show ASCS, Command palette, Quick Notes, Preferences, Save workspace, Restore workspace, Open data folder, Open log file, Reload ASCS (Ctrl + Alt + Shift + A), and Exit ASCS. Reload and Exit save pending note edits first.

## 6. Keyboard Shortcuts

“Super” is the dedicated key (F24 from Keychron Launcher). Letters marked *configurable* can be changed in Preferences.

| Shortcut | Action |
| --- | --- |
| Super | Show ASCS on the last-used view (Command Center after startup), or hide it |
| Super + Space | Command palette |
| Super + Q *(configurable)* | Quick Notes |
| Super + Shift + C | Quick capture: copy the selection (or clipboard) into a new note |
| Super + Shift + P | Palette: paste a snippet |
| Super + S | Save the Default workspace |
| Super + R | Restore the Default workspace |
| Super + Shift + R | Palette: choose a workspace |
| Super + F *(configurable)* | Everything |
| Super + I *(configurable)* | System Dashboard |
| Super + B | Focus Vivaldi here, switch to its desktop, or open it |
| Super + T / E *(configurable)* | Reuse Terminal / Explorer, switching desktops if needed |
| Super + Shift + T / E | New Terminal / Explorer window |
| Super + C / H *(configurable)* | Calculator / Task Manager |
| Super + *letter* | A custom command assigned that letter |
| Super + Shift + D / F | New folder / empty file in the active Explorer folder |
| Super + 1–9 | Switch to virtual desktop 1–9 (top row or numpad, NumLock on or off) |
| Super + Shift + 1–9 | Move the active window to that desktop and follow it |
| Super + Left / Right | Snap to the left/right half |
| Super + horizontal arrow, then vertical arrow (within 150 ms) | Snap to a quadrant |
| Super + Up / Down | Maximize; restore or minimize |
| Super + Shift + Left / Right | Move the window to the adjacent monitor |
| Super + L | Lock the workstation |
| Super + M | Toggle mute |
| Super + V | Clipboard History |
| Super + J / Y | Type a timestamp (`yyyy-MM-dd HH:mm:ss`) / date (`yyyy-MM-dd`) |
| Ctrl + Alt + Shift + A | Start ASCS when it is not running; save notes and reload it when it is (requires the launcher; see [Installation](#10-installation-and-startup)) |

**Super + Shift layer:** C (capture), P (paste a snippet), D (new folder), and F (new file) always perform their Shift action, even when a configurable action or custom command uses the letter without Shift. When C, D, F, or P has no assignment, Super + that letter passes the Windows shortcut through (for example, Win + D shows the desktop). **Super + Shift + S is deliberately unassigned**; the Snipping Tool is in the palette, so a keyboard macro can own snipping. Other keys keep their Super action when Shift is added. The keyboard map in Super Commands shows both layers. Launched applications take focus only if you haven't switched to another window in the meantime.

## 7. Frontend and Backend Communication

The contract is defined by `ASCS.ahk` and `frontend/app.js`; change both sides together.

### Frontend to AutoHotkey

JavaScript sends newline-separated text through `window.chrome.webview.postMessage()`: the message type, a newline, then the content.

| Message | Content | Purpose |
| --- | --- | --- |
| `Ready` | None | Frontend initialized |
| `GetNotes` / `SaveNotes` | None / full notes JSON (≤ 5 MB) | Load / atomically save notes |
| `WindowAction` | `minimize`, `maximize`, or `close` | Window controls; `close` hides |
| `Launch` | Allowlisted identifier | Built-in launches and actions (`everything`, `vivaldi`, `terminal`, `explorer`, `calculator`, `taskmanager`, `settings`, `downloads`, `projects`, `snipping`, `lock`, `mute`, `reload`) |
| `GetMetrics` | `home`, `dashboard`, or empty | Schedules a metrics push |
| `GetSettings` / `SaveSettings` | None / `drives\|gap\|preserve\|keys\|searchUrl` | Preferences |
| `GetCommands` / `SaveCommands` | None / one command per line: name, kind, target, key (tab-separated) | Custom commands |
| `RunCommand` | Command index (1–30) | Runs a saved custom command |
| `BrowseCommandTarget` | `row\|app` or `row\|folder` | Opens a file or folder picker |
| `GetWorkspaces` | None | Lists saved workspaces |
| `SaveWorkspace` / `RestoreWorkspace` / `DeleteWorkspace` | Workspace name (`Default` or empty for the default) | Named workspaces |
| `GetWindows` / `FocusWindow` | None / window handle | Window switcher; the handle must still be an eligible window |
| `PasteSnippet` | Snippet text (≤ 256 KB) | Pastes into the previously active window |
| `SearchWeb` / `SearchFiles` | Query (≤ 1000 characters) | Web search / Everything search |
| `GetActivity` | None | Activity feed |
| `Log` | Text (≤ 4 KB) | Diagnostic log entry |

### AutoHotkey to Frontend

AutoHotkey sends JSON with `PostWebMessageAsJson()`.

| Type | Purpose |
| --- | --- |
| `navigate` / `resume` | Show a view / refresh the current view after re-showing |
| `windowState` | `maximized` true or false, for the title bar's maximize/restore glyph |
| `openLauncher` | Open the palette; `mode` is `""`, `snippets`, or `workspaces` |
| `notes` / `saved` / `flushNotes` | Notes data (`recovered`, `external`) / save acknowledgement / save now |
| `captureNote` | Quick-capture text and source window title |
| `metrics` | CPU/RAM, legacy C: fields, and `drives: [{letter, usage, used, total, online}]`, plus hardware once collected |
| `settings` / `settingsSaved` | Preferences (including `searchTemplate`) / saved |
| `commands` / `commandsSaved` | Custom commands `[{id, name, kind, target, key}]` / saved |
| `workspaces` | `[{name, windows, saved}]` |
| `windows` | `[{id, title, app, minimized}]` |
| `browseResult` | Picker result for a custom-command row |
| `activity` / `activityAdded` | Activity list / one new entry (`{time, kind, text}`) |
| `notice` | Toast message (only sent while ASCS is visible) |
| `error` | Error toast; optional `scope` is `notes`, `settings`, or `commands` |

## 8. Security

- The backend accepts bridge messages only from `https://ascs.localhost`, validates every message type and payload, cancels navigation to other origins, and blocks new windows.
- Release WebView settings disable DevTools, default context menus, browser accelerator keys, zoom, and **host objects**. WebViewToo would otherwise inject a `global` object into `*.localhost` pages that exposes every AutoHotkey function to page script.
- The frontend Content Security Policy allows only local scripts and resources (inline styles and data images allowed).
- Nothing in the bridge executes arbitrary commands. Custom commands run only entries saved in `data\commands.ini`, validated on save and load: an existing `.exe`/`.lnk` started without arguments, an existing folder opened in Explorer, or an `http(s)` URL opened in the default browser. The frontend refers to them by index only.
- Web searches are percent-encoded into the configured `https://` address. File-search queries have quotes and control characters removed before they are passed to Everything as one quoted argument.
- Snippets are pasted through the clipboard (restored afterwards), never typed as keystrokes. Window focus requests are checked against the eligible-window rules used by workspaces.
- Workspace names are restricted to a safe file-name character set; workspace restore launches only validated executables, without arguments.
- Restrict write access to `C:\ASCS` (including `data`) to the installing account, Administrators, and SYSTEM, and do not run ASCS elevated.

## 9. Dependencies

**Required:** Windows 10 or 11 (Windows 11 is the verification target); AutoHotkey v2 64-bit; the Microsoft Edge WebView2 Runtime (Evergreen preferred); WebViewToo under `C:\ASCS\webview`; and Keychron Launcher configured to emit F24 for the Super key.

**Optional:**

- Voidtools Everything for file search.
- `lib\VirtualDesktopAccessor.dll` for desktop switching, moving windows between desktops, and cross-desktop focus for Vivaldi, Terminal, and Explorer. It uses `GetDesktopCount`, `GoToDesktopNumber`, `MoveWindowToDesktopNumber`, `GetCurrentDesktopNumber`, and `GetWindowDesktopNumber`; ASCS treats nonnegative results as success. Without it, desktop actions report a failure instead of opening duplicates.
- Microsoft Edge, which is used only to run the frontend tests headlessly.

## 10. Installation and Startup

1. Install AutoHotkey v2 (64-bit) and the WebView2 Runtime.
2. Configure the Keychron Super key to emit F24.
3. Place the repository at `C:\ASCS`, with WebViewToo under `webview` and (optionally) the virtual-desktop DLL under `lib`.
4. Restrict write access as described in [Security](#8-security).
5. Run `pwsh -File C:\ASCS\tools\Install-Shortcut.ps1`. It creates an **ASCS** Start Menu shortcut (to pin), registers **ASCS Launcher** in your Startup folder, and starts the launcher, which enables **Ctrl + Alt + Shift + A**. Add `-Startup` to also start ASCS itself at sign-in, or `-Remove` to delete everything it created and stop the launcher.
6. Press Ctrl + Alt + Shift + A (or run `C:\ASCS\ASCS.ahk`). ASCS starts hidden. Tap Super, or click the tray icon, to show it.

**Start or reload with one hotkey:** `ASCS.Launcher.ahk` is a tiny resident script (no tray icon) that owns Ctrl + Alt + Shift + A. When ASCS is not running, it starts ASCS. When ASCS is running, it sends ASCS a reload message; ASCS saves pending note edits and reloads. If an older ASCS does not acknowledge the message within two seconds, the launcher relaunches it, and `#SingleInstance Force` replaces the old instance. ASCS also handles the same keys itself, so reloading works even without the launcher; only starting a stopped ASCS needs it. `ASCS.Launcher.ahk --trigger` performs the action once and exits.

The hotkey lives in a launcher rather than on the Start Menu shortcut because Windows 11 does not reliably honour shortcut hotkeys in the Start Menu. After changing code or frontend files, reload with the hotkey, the tray menu, or **Reload ASCS** in the palette.

## 11. Testing

### Automated

```powershell
pwsh -File C:\ASCS\tests\run-tests.ps1
```

- `tests\core.tests.ahk` covers `lib\ASCS.Core.ahk` (71 checks): shortcut-letter validation, drive lists, Explorer names, workspace names and executables, workspace relaunch commands, workspace window matching, custom-command validation and payload parsing, search templates and encoding, activity lines, and the JSON helpers.
- `tests\frontend.tests.html` covers `frontend\palette.js` and `frontend\keymap.js` (79 checks) in headless Edge. For the palette: the calculator, query parsing, matching, ranking, usage history, and workspace-name rules. For the keymap: layout integrity (108 unique, non-overlapping keys of the customized Q6 Max, including the planned Code and macro keys), Super and Super + Shift bindings, Shift-layer precedence, Windows passthrough, and robustness with missing settings.

The tests never touch the running ASCS instance or the `data` folder. The runner exits with code 0 when everything passes and reports each failure by name.

### Manual

Hotkeys, WebView behavior, and window management need the real desktop. Each release is checked with a manual test pass; the results are recorded below.

## 12. Development Status

### Verified on the Target System

- Startup hidden, single instance, window chrome, and WebView restrictions (context menu, DevTools, zoom, reload).
- Super toggle and resume; command palette filtering, keyboard operation, and every built-in entry; quick actions.
- Configurable and fixed shortcuts; live rebinding; Terminal/Explorer/Vivaldi reuse and new-window behavior; missing-DLL reporting; focus-steal protection.
- The Explorer item-creation matrix; top-row and numpad (NumLock on/off) desktop switching; desktop moves; half and quadrant snapping; snap gap; maximize/restore/minimize.
- Quick Notes create/rename/filter/pin/type/copy/delete, persistence, hide/exit flush, backup recovery, and the 5 MB limit.
- CPU/RAM/drive cards, five-second refresh, no polling while hidden, hardware and disk-layout details; Preferences persistence and validation; the Super Commands reference.
- 1.5.1 responsiveness fixes (the window, palette, and hotkeys respond immediately), as reported by the user in daily use.

### Verified Automatically (1.6.0)

- Unit tests: 150 checks across the core library, palette logic, and keyboard-map logic.
- An isolated backend smoke test (a copy of ASCS with its own data folder and the Super key remapped): hidden startup and frontend ready; named workspace save; custom-command save, reload, and rejection of invalid entries; shortcut conflicts between Preferences and custom commands; workspace, window, and activity messages; the 13-item tray menu; and a 0 ms metrics push.
- Frontend rendering checked in headless Edge with sample data: Command Center activity feed, palette (search, calculator, snippet mode), Preferences, and Quick Notes.

### Pending Manual Verification (1.6.0)

- Quick capture from several applications (browser, editor, terminal), including clipboard fallback and clipboard restoration.
- Snippet paste into the previous window (including terminals), and Shift+Enter copy.
- Palette: notes/windows/workspaces in results, window switching, web search, Everything search, calculator copy, recent-command ordering, and Backspace leaving a mode.
- Named workspaces: save from the palette and Preferences, restore, delete, and Super + Shift + R.
- Custom commands: the Browse… pickers, `.lnk` targets, folder and link commands, Super letters, and conflict messages.
- Activity feed updates and relative times; the tray menu, including Reload/Exit note flushing.
- Ctrl + Alt + Shift + A through the launcher: starts a stopped ASCS, and reloads a running one after saving notes. Both paths, and the fallback for an older ASCS, passed an isolated test with a copy of ASCS; the live hotkey still needs a manual check.
- The three-accent theme on the target display: burgundy bars, gold at 90% or more, the Dashboard volume meters, and gold pinned notes.
- Super + Shift + C capture, Super + Shift + P snippets, Super + Shift + S doing nothing, and Super + C/D/F/P passthrough when unassigned.
- The keyboard map (both layers, the Shift-hold preview, hover and focus details) and the new title bar (command bar, status pill, clock, and the maximize/restore glyph).
- The burgundy theme across all views at the target window sizes.
- 1.5.1 items not yet confirmed individually: the missing-desktop tooltip, the workspace restore reuse matrix, the delete-note dialog, notes reload after an outside change, and the Preferences reset after a rejected save.
- Carried over: mixed-DPI and multi-monitor layouts; network-drive offline behavior and probe timeout; additional Windows builds, DLL versions, and Terminal configurations; hardware inventory on other machines; untrusted-origin rejection (requires a deliberately modified page).

## 13. Known Limitations

- Workspace restore launches applications without arguments (except Explorer folders and Terminal) and captures up to 24 windows on the current desktop. Windows of one application whose titles have changed are matched in enumeration order, so two such windows can swap positions.
- The window switcher lists windows on the current virtual desktop only.
- Quick capture copies with Ctrl+C. Applications that use another copy shortcut (for example, some terminals without a selection) fall back to the clipboard text.
- Snippet paste uses Ctrl+V in the previous window. If that window cannot be refocused within one second, the snippet is left on the clipboard instead.
- Custom applications cannot take command-line arguments; create a `.lnk` shortcut with the arguments instead.
- Everything must be installed for Super + F and file search.
- Desktop switching and cross-desktop focus require `VirtualDesktopAccessor.dll`; monitor frame calculations depend on Windows DPI behavior.
- Metrics depend on Windows APIs, WMI, and drive reporting; drive probes time out after eight seconds and are cached for 30 seconds.
- The diagnostic log rotates at 1 MiB to one backup; the activity feed keeps the newest 50 entries.

## 14. Development Roadmap

Candidates for the next releases:

- **Theme refinement (planned for 1.7.0):** a more indigo primary, and gold for icons and similar details.\n- **Layout refresh (planned for 1.7.0):** a compact Command Center header in place of the large hero, configurable quick actions, a denser Dashboard with short CPU/RAM history sparklines, a tidier hardware grid, section navigation and a sticky save bar in Preferences, a search box on Super Commands, and a collapsible sidebar.

- **Clipboard history in the palette:** keep recent text clips (opt-in) and paste or save them as snippets.
- **Snippet placeholders:** `{date}`, `{time}`, `{clipboard}`, and fill-in fields when pasting.
- **Workspaces across desktops:** save and restore windows on all virtual desktops, and assign workspaces to desktops.
- **Per-application rules:** default snap position or desktop for an application when it launches.
- **Palette actions on results:** open a custom command's folder, rename or delete a note, overwrite a workspace.
- **Notes export and search syntax:** Markdown export, and tag filters such as `#work`.
- **A settings backup:** export or import preferences, commands, snippets, and workspaces as a single file.
- **Broader automated coverage:** a scripted WebView smoke test on the target machine, run before each release.
