# ASCS Changelog

All notable changes to the Aeolionware Super Command System. The newest release is first. For current behavior, see [README.md](README.md).

## Version 1.6.0: Command Palette, Capture, and Workspaces

### Command palette (Super + Space)

- The palette now searches notes, snippets, custom commands, saved workspaces, and open windows on the current desktop, as well as the built-in commands.
- Matching ranks prefixes, word starts, initials (for example, `wt` finds Windows Terminal), and in-order letters in titles. Commands you use often or recently rank higher, and the five most recent appear first when the search is empty.
- Added an inline calculator: type math such as `18*1.2`, or start with `=`. Enter copies the result.
- Added web search: start a query with `?`, or choose “Search the web” at the end of any search. The search address is set in Preferences (DuckDuckGo by default).
- Any search ends with “Search files for…”, which opens Everything with that query.
- Added palette modes, shown as a chip in the search box: Snippets, Workspaces, Windows, and Save workspace. Backspace in an empty search returns to all commands.
- Results show their Super shortcut, a type badge, and context-sensitive key hints.

### Shortcuts

- **Super + Shift + C** captures the selected text, or the clipboard when nothing is selected, into a new note without opening ASCS. The clipboard is restored afterwards.
- **Super + Shift + P** opens the palette on your snippets: Enter pastes the snippet into the window you were using, and Shift+Enter copies it.
- **Super + Shift + R** opens the palette on your saved workspaces.
- **Super + Shift + S** is now deliberately unassigned. The Snipping Tool moved to the palette, so a keyboard snipping macro can own that job.
- C, P, D, and F form a fixed Super + Shift layer that takes precedence over any unshifted assignment. When C, D, F, or P is unassigned, Super + that letter passes the Windows shortcut through.

### Features

- **Named workspaces:** save any number of named layouts with “Save workspace as…” in the palette or in Preferences, and restore or delete them from either place. Super + S and Super + R continue to use the Default workspace (`data\workspace.ini`); named layouts are stored in `data\workspaces\`.
- **Custom commands:** add applications (`.exe` or `.lnk`), folders, and web links in Preferences, each with an optional Super-key letter. They appear in the palette and are stored in `data\commands.ini`. Their letters are validated against the built-in shortcuts in both directions.
- **Activity feed:** the Command Center lists recent launches, captures, pasted snippets, workspace changes, searches, custom commands, created Explorer items, and problems with relative times. Entries persist in `data\activity.log` (the newest 50 are kept).
- **Start or reload with Ctrl + Alt + Shift + A:** a new resident helper, `ASCS.Launcher.ahk`, owns this hotkey. It starts ASCS when it isn't running and sends it a reload message when it is; ASCS saves pending notes, then reloads. If an older ASCS doesn't acknowledge the message, the launcher relaunches it. ASCS also handles the keys itself, so reloading works without the launcher. `tools\Install-Shortcut.ps1` creates the Start Menu shortcut, registers the launcher at sign-in, and starts it. `-Startup` also starts ASCS at sign-in, and `-Remove` undoes everything. (A first attempt put the hotkey on the Start Menu shortcut, but Windows 11 did not honour it.) “Reload ASCS” is also in the palette.
- **Tray menu:** Show ASCS, Command palette, Quick Notes, Preferences, Save/Restore workspace, Open data folder, Open log file, Reload, and Exit. A single click on the tray icon shows ASCS, and Reload and Exit save pending note edits first.
- **Theme:** a three-accent system. Violet stays primary for interaction. **Burgundy** (`#8A2846`/`#C4587B`) is secondary: every resource bar (CPU, RAM, and drives), saved items (snippets, workspaces, captures), heading punctuation, the palette mode chip, and destructive actions, which no longer use the earlier pink-red. **Gold** (`#C9A24A`/`#E3C072`) is tertiary: any resource at 90% or more, pinned notes, the palette's Recent group, calculator results and custom commands, and “NEW” badges.
- **Keyboard map:** Super Commands opens with a map of the customized Keychron Q6 Max: a full-width left Shift, a rectangular Enter with `\ |` above it, a **Code** key and macro keys M1–M7 (marked Planned, with no current compatibility), and Alt · Super · Fn · Ctrl right of Space. It shows which keys are taken with Super and with Super + Shift, colored by category, with the physical Super key in metallic gold. It includes hover and focus details, a layer toggle, and a hold-Shift preview, and it follows your Preferences letters and custom commands.
- **Title bar:** it now forms one continuous top strip: the sidebar brand on the same centre line, context (`ASCS / view`), a centred command bar that opens the palette, a live status pill (green “All systems nominal”, or gold “Attention · …” when a resource reaches 90%), and a clock. With no band at rest, it no longer falls short of the window edges; a frosted band fades in edge to edge when the page scrolls, and the bar stays at the top. The caption buttons are pinned to the window corner at full bar height and use crisp 10 px glyphs; Maximize swaps to a restore glyph, and Close has a burgundy hover. Every element is optically aligned: text is trimmed to cap height (`text-box`), and controls use even heights on one centre line, verified by pixel measurement.
- **Copy:** the interface text was rewritten in a more restrained voice. The Command Center shows today's date and “Every window, tool, and thought, one key away.” The palette opens with “At your command.” and the footer reads “Crafted for the keyboard.” Section labels are Capture, Telemetry, The Keymap, and Configuration, and the sidebar reads “ASCS 1.6.0 · Standing by”.
- **Drive fullness bars:** each volume in the Dashboard's “Physical drives & volumes” list now has a fullness bar and a “% full” label.

### Engineering

- Moved pure, side-effect-free logic (validators, workspace matching, search encoding, activity parsing, and the JSON helpers) into `lib\ASCS.Core.ahk`, and palette logic into `frontend\palette.js`.
- Added an automated unit test suite: `tests\run-tests.ps1` runs `tests\core.tests.ahk` (71 checks) and `tests\frontend.tests.html` (79 checks for the palette and keymap, in headless Edge).
- The tests found and fixed a defect before release: a local variable named `buffer` shadowed AutoHotkey's `Buffer` class (names are case-insensitive), which would have broken web search.
- Workspace matching now uses the shared, tested `MatchWorkspaceRecords` helper.
- The sidebar version label now matches the release; it had still read 1.5.0 in 1.5.1.

## Version 1.5.1: Test-Pass Fixes and Responsiveness

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

## Version 1.5.0: Performance, Launch Reuse, and Command Center Polish

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

## Version 1.4.4: WebView and Workspace Hardening

- Validated workspace restore targets as absolute, existing `.exe` paths matching the saved process name; restore never accepts stored command-line arguments.
- Restricted WebView navigation and bridge messages to `https://ascs.localhost`; blocked popup windows and disabled DevTools, context menus, browser accelerators, and zoom controls.
- Added a restrictive frontend Content Security Policy.
- Moved drive capacity/status probes into a separate process with an eight-second timeout; dashboard polling now stops when ASCS is hidden or minimized and resumes while visible.
- Sanitized and bounded activity-log entries and rotate the log at 1 MiB.
- Kept the window icon assignment at creation time; showing ASCS no longer sends redundant icon messages to a potentially stale window handle.
- Verified that re-showing the existing Command Palette from another virtual desktop focuses the ASCS window without a stale-HWND error.
- Updated the Keychron setup instructions to emit F24 and aligned platform, message-contract, and runtime-status documentation.
- WebView security controls and drive-worker timeout behavior still need target-system regression testing.

## Version 1.4.3: Vivaldi Cross-Desktop Detection

- Fixed Super+B detection of Vivaldi windows on other virtual desktops by temporarily enabling AutoHotkey hidden-window enumeration, then filtering out invisible helper windows.
- Kept current-desktop Vivaldi windows preferred; when needed, switch to the desktop of the topmost Vivaldi window before activation without moving or duplicating windows.
- Vivaldi cross-desktop focus and File Explorer foreground behavior have been verified on the target Windows system.

## Version 1.4.2: Vivaldi Focus-or-Open

- Added Super+B to focus or launch Vivaldi, and to prefer an existing window on the current desktop before switching to another desktop.
- Cross-desktop focus requires `GetCurrentDesktopNumber` and `GetWindowDesktopNumber` from VirtualDesktopAccessor.dll; if these APIs are unavailable, ASCS reports the problem instead of launching a duplicate.
- Added Vivaldi to the command launcher while retaining Super+V for Clipboard History; reserved B from configurable shortcuts and documented the binding in the shortcut reference and Preferences.
- Initial cross-desktop window enumeration did not find Vivaldi windows on other desktops; corrected in v1.4.3.

## Version 1.4.1: Application Foreground Activation

- Added process/window waiting and `WinActivate` requests to application launch paths so launched applications are brought to the foreground when Windows allows it.
- Manually verified on the target Windows system: Super+E/T/C/H/F shortcuts; app launches from Super+Space; foreground activation when an app was already open; Downloads and Documents folder launches; Browser, Windows Settings, and Snipping Tool launcher actions.
- Detailed notes persistence, WebView security controls, dashboard metrics, automatic metric updates, and additional virtual-desktop configurations still require validation.

## Version 1.4.0: Window Management and Productivity

- Added two-direction arrow chords for quadrant snapping, configurable snap spacing, and left/right adjacent-monitor window moves.
- Added Super+Shift+number window-to-desktop moves with bounds checks, plus direct switching through VirtualDesktopAccessor.
- Implemented local workspace capture and restoration, including relaunching missing applications.
- Added Super+Space searchable command launcher, Preferences, persistent drive/shortcut settings, and immediate hotkey rebinding.
- Expanded the System Dashboard with cached WMI hardware/device details.
- Updated the in-app shortcut reference and project documentation.
- Basic snapping, desktop moves, and workspace save/restore have since been verified; mixed-DPI behavior, remaining DLL exports, WebView2 hardening, and network-drive timeout behavior still require validation.

## Version 1.3.0: Notes v2 and Windows Controls

- Focused the Quick Notes primary input on navigation and window activation using the vendored WebView `MoveFocus(0)` API.
- Super+F opens Everything directly; embedded SDK search and its bundled SDK files were removed after runtime issues.
- Added multi-note v2 storage, autosave, atomic replacement, backup recovery, legacy migration, and flush-on-hide/close handling.
- Added configurable C:/J: storage cards and a 30-second network-drive metrics cache.
- Added Super number/numpad virtual desktop switching and Super+arrow active-window positioning.
- Added the ASCS window icon, branded draggable title bar, window controls, and display-aware startup sizing.
- Runtime testing remains pending; optional DLL exports, Everything command-line behavior, and target-system behavior require verification.

## Version 1.2.1: WebView2 Stabilization and Aeolionware Obsidian Redesign

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

## Version 1.2.0: WebView2 Frontend Introduction

- Introduced the WebView2 frontend and initial AutoHotkey integration.
- Added the Command Center, Quick Notes, Everything Search, and System Dashboard.
- Added application launching, system controls, and date/time shortcuts.
- WebView2 integration was not fully verified.
