# Aeolionware Super Command System (ASCS)

**Brand:** AEOLIONWARE SUPER COMMAND SYSTEM  
**Tagline:** AEOLIONWARE, at your command.  
**Version:** 1.8.0  
**Platform:** Windows 10/11 (Windows 11 target verification)  
**Status:** 1.8.0 is the current release, verified by three manual passes on the target system (every item passed in the end) and 867 automated checks. It adds the Sounds page and notification level board, the Calendar (with US holidays and dragging events), notes and snippets as one with placeholders and groups, in-app shortcuts and Help, and the unsaved-work hold for power actions. iPhone calendar sync is designed and planned for 1.9.0. Release history is in [CHANGELOG.md](CHANGELOG.md).

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

The application has seven views, grouped in the sidebar as Workspace, System and Reference, and a command palette:

1. **Command Center:** the almanac, live metrics, quick actions, and recent activity
2. **Quick Notes:** notes and reusable text, in Text or Code style, with placeholders
3. **Games:** play time, continue playing, the library, controllers, and RetroAchievements
4. **System Dashboard:** live metrics and hardware inventory
5. **Logs:** the ASCS, activity and Code key logs, filterable and live
6. **Super Commands:** a reference for every shortcut
7. **Preferences:** drives, snapping, shortcuts, web search, the almanac, countdowns, games and apps, custom commands, and workspaces
8. **Command palette** (Super + Space): one search box for commands, notes, workspaces, windows, math, files, events, and the web

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

The frontend uses a premium desktop-oriented dark theme with balanced spacing, restrained gradients, and rounded layered panels. It uses three accents: deep indigo (primary, anchored on `#2B0071` since 1.7.0), burgundy (secondary), and gold (tertiary). Metallic gold is reserved as the ASCS signature. Typography uses Segoe UI. Inline SVG provides interface graphics, and a custom ICO supplies the window, tray, and favicon icon.

| Design token | Color or treatment |
| --- | --- |
| Main background | `#0E1017`, with an indigo glow (top right) and a faint burgundy glow (bottom left) |
| Sidebar | `#131621` |
| Panels | `#181B27` |
| Elevated panels | `#202434` |
| Primary accent (indigo) | Tonal scale anchored on **`#2B0071`**: 950 `#1A0047` · 900 `#2B0071` · 800 `#3A0D94` · 700 `#4C1FB8` · 600 `#5F35D6` · 400 `#8B6FF5` · 300 `#A892FB` · 200 `#C7B8FD` · 100 `#ECE6FE`; gradient `#2B0071` → `#4C1FB8` |
| Metallic gold (signature) | Multi-stop gradient `#7A5418` → `#C99A3E` → `#F6DC93` → `#FFF2C6` → `#D8AA4C` → `#8C6420`; a brighter champagne variant for text |
| Secondary accent (burgundy) | `#8A2846` deep, `#C4587B` bright, `#E8A3B9` text; gradient `#7D2441` → `#B04A6D` |
| Tertiary accent (gold) | `#C9A24A` base, `#E3C072` bright, `#ECD49C` text; gradient `#A8812F` → `#E3C072` |
| Success | `#66D9A8` |
| Primary text | `#F5F6FB` |
| Secondary text | `#A4A9BB` |
| Typeface | Segoe UI |

| Accent | Meaning | Used for |
| --- | --- | --- |
| Indigo | Interaction | Large surfaces use the deep anchor `#2B0071` (active navigation, primary buttons, palette selection, Apps keys on the keyboard map); anything that must be legible uses lighter tints of the same hue (focus rings and accent text `#A892FB`, links and strokes `#8B6FF5`, light text `#C7B8FD`). The anchor alone is too dark for text on this background. |
| Metallic gold | The ASCS signature | Exactly four places: the brand mark's edge, the Super keycap where Super is the subject (sidebar footer, Super Commands intro, the keyboard map), the rule above the Command Center date, and the palette title (in champagne gold) |
| Burgundy | Resources and saved items | Every usage bar (CPU, RAM, drive cards, and the Dashboard's per-volume fullness bars); pasteable notes, workspaces, captured notes, favorites; heading punctuation and eyebrow lines; the palette mode chip; destructive actions (Delete buttons and confirmation dialogs) |
| Gold (flat) | Distinction and attention | Any resource at **90% or more** (its bar turns gold); pinned notes; the palette's Recent group, calculator results, and custom commands; “NEW” badges; custom-command activity; content icons on the Command Center cards and quick actions (navigation icons stay indigo) |

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
│   ├── notes.js              Pure Quick Notes logic (#tags, filter queries, safe Markdown parser)
│   ├── charts.js             Pure sparkline geometry for the Dashboard
│   ├── almanac.js            Pure almanac logic (moon, sunrise/sunset, feed parsing, countdowns, rotation)
│   ├── quotes.js             Quote of the day: public-domain quotations with sources
│   ├── logs.js               Pure log parsing for the Logs tab (formats, levels, filters, day groups)
│   ├── games.js              Pure Games logic (durations, sorting, titles, window titles, RetroAchievements parsing)
│   ├── sounds.js             Pure Sounds logic (WAV reading and writing, RMS/peak levels, gain plans, search)
│   ├── calendar.js           Pure Calendar logic (iCalendar, time zones, repeats, reminders, week layout)
│   ├── keymap.js             Keyboard-map layout (customized Q6 Max) and Super / Super+Shift bindings
│   ├── app.js
│   ├── soundsview.js         The Sounds view
│   └── calendarview.js       The Calendar view
├── lib\
│   ├── ASCS.Core.ahk         Pure helpers shared by ASCS.ahk and the tests
│   └── VirtualDesktopAccessor.dll   (optional; desktop switching and cross-desktop focus)
├── tests\
│   ├── run-tests.ps1         Runs both suites
│   ├── core.tests.ahk
│   ├── frontend.tests.html   Runs harness.js and the palette, keymap, notes, almanac and logs tests
│   ├── harness.js
│   ├── palette.tests.js
│   ├── keymap.tests.js
│   ├── notes.tests.js        Notes and sparkline tests, including hostile Markdown
│   ├── almanac.tests.js      Moon phases, NYC sunrise/sunset, hostile feed input, countdowns
│   ├── games.tests.js        Game formatting, sorting, window titles, hostile RetroAchievements input
│   └── logs.tests.js         Log formats, levels, filters, and day grouping
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
    ├── almanac\              Today's Wikipedia feeds (only while the Wikipedia almanac is on)
    ├── ra-images\            RetroAchievements badges and game icons, downloaded once (capped at 20 MB)
    ├── ASCS_Log.txt
    └── WebView2\
```

| File | Purpose |
| --- | --- |
| `data/notes.json` | Version 2 Quick Notes collection; `.bak` holds the previous save |
| `data/settings.ini` | Drives, window preferences, shortcut letters, the web search address (`[Palette] SearchUrl`), and pinned quick actions (`[QuickActions]`, once customized) |
| `data/commands.ini` | Custom palette commands (name, kind, target, optional key) |
| `data/workspace.ini`, `data/workspaces/` | Saved window layouts |
| `data/activity.log` | Activity feed entries (tab-separated; compacted to the newest 50) |
| `data/secrets.ini` | Optional, created by **Open secrets file**: the RetroAchievements user name and Web API key. Never committed (`data/` is ignored by git), never sent to the page or logged |
| `data/almanac/` | Today's two Wikipedia feeds, cached; older days are deleted, and turning the Wikipedia almanac off deletes them all |
| `data/ASCS_Log.txt` | Diagnostic log, rotated at 1 MiB |
| `data/WebView2/` | WebView2 profile, including the palette's usage ranking in local storage |

WebViewToo is maintained separately from ASCS application code.

## 5. Interfaces

### Command Center

Tapping Super shows ASCS on the view that was last open during the session, or hides ASCS when it is already active. The first view after startup is the Command Center. The navigation sidebar collapses to an 84 px icon rail with the round handle on its edge (it appears on hover) or the palette's **Toggle sidebar**; the choice is remembered. The navigation icons stay at exactly the same height in both states: collapsed, the brand block keeps its size and shows a 56 px mark (centered where the 76 px mark was), a short ASCS wordmark, and a gold hairline in place of the section label.

ASCS opens at 2208 × 1242 (15% larger than 1920 × 1080, capped to the screen's work area), so the Command Center and Quick Notes fit without scrolling. The Command Center opens with a compact header: today's date under the metallic gold rule, the title, and the tagline on one line. Beneath it, the **almanac** strip shows the moon's phase and illumination, today's sunrise and sunset in New York City with the hours of daylight, your nearest **countdown** (hover it for the rest), and one rotating line: on this day in history, an observance, Wikipedia's featured article, or the quote of the day. The line has room for two lines of text (longer items end in an ellipsis, with the full text on hover), so the strip never changes height. It rotates every 20 seconds while the Command Center is showing, pausing while the pointer or keyboard focus is on the strip, and moves on when the Command Center is opened again; **‹ ›** step back and forward, with items sliding in from the direction of travel (a plain fade when Windows' reduced-motion setting is on). The dots show where it is in the rotation. Moon, sun, quote and countdowns are calculated on this PC with no network access. The Wikipedia items appear only when the **Wikipedia almanac** is turned on in Preferences (it is off by default); clicking one opens the article on en.wikipedia.org. Below it are CPU and RAM summaries, one storage card per configured drive (defaults `C:` and `J:`), **quick actions**, and **Recent activity**.

**Quick actions** are up to six pinned items: any ASCS view, app or action, custom command, saved workspace, or note (to open it, or to paste it). Choose **Edit** to remove items (×) or add one; **Add quick action** opens the palette in a pick mode. The selection is saved in `settings.ini`. Until you customize it, the defaults are Terminal, File Explorer, Quick Notes, Task Manager, and Calculator. Running a quick action goes through exactly the same paths as the palette.

The **System bar** sits in the header, to the right of the title, in two groups. **CLICK** acts at once: **Lock**, and the audio output (showing the current device; click for a list of active playback devices, switched through SoundSwitch with the result checked). **HOLD**, framed in gold with a ring symbol, holds the guarded actions: **Recycle Bin** (with its item count and size), **Sleep**, **Restart**, **Shut down** and **Sign out**. Press and hold for 1.5 seconds (pointer, Space or Enter; a gold fill shows progress, and letting go cancels). A completed hold asks ASCS to arm the action; ASCS replies with a single-use ticket valid for 10 seconds and any warnings (a game, PSO or a Steam game running, which then need a second hold), and only a request carrying that ticket runs. Then ASCS counts down for the delay set in Preferences › General (**none**, **5 seconds** by default, or **30 seconds**), with a banner on every tab and **Cancel**, and runs the action. Restart and Shut down run `shutdown /r` or `/s` with `/t 0` and never `/f`. (Windows' own timer is not used: any `/t` above 0 implies `/f`.) *(1.8.0)* Windows asks apps to close one at a time, so an app with unsaved work only gets to ask after others (RetroBar, for example) have already closed, and some (Windows 11 Notepad, VS Code) don't ask at all. So before Restart, Shut down or Sign out, ASCS looks at the open windows' titles for an unsaved mark (a leading `*`, `●` or `•`): the arm warning names those apps, and when the countdown ends ASCS holds instead of starting, with the banner "Restart held: save your work in …", **Restart anyway** and **Cancel**. It looks again every 2 seconds and goes ahead once they're saved or closed. Sleep is never held. VS Code marks only its active tab in the title, so ASCS also counts VS Code's own backups of unsaved files (`%APPDATA%\Code\Backups`, written while a file has unsaved changes and deleted on save) made since the running VS Code started, reading only their names and dates. Notes are saved first, every step is logged, and none of these is on a hotkey, a quick action or the palette.

**ASCS sounds (1.8.0):** Preferences › General › ASCS sounds plays the logon and logoff sounds from `C:\Sounds\all-windows-sounds-main\Aeolionware Startup\ASCS Sound Files` either **when ASCS shows and hides** (the default; only when the window really appears or disappears), **when ASCS starts and exits** (Exit in the tray menu waits for the sound to finish), or **off**. They never play at Windows sign-in (ASCS starting within two minutes of sign-in, measured from Windows' shell host) or at shutdown.

**Recent activity** The feed lists the latest five events, newest first, with relative times: launches, custom commands, captures, pasted notes, workspace saves/restores/deletions, palette searches, created Explorer items, and problems. On windows shorter than 820 px it shows three events, so the Command Center does not need to scroll. Activity persists across restarts in `data\activity.log`.

Drive status and capacity probes run in a separate process, can run concurrently, time out after eight seconds, and are cached for 30 seconds. Cards refresh as soon as a probe completes.

### Command Palette

Super + Space opens the palette over the current view. Type to search; ↑/↓ select, Enter runs, and Esc closes.

| What you type or choose | What you get |
| --- | --- |
| Nothing | Your five most recent commands, then all commands |
| Any text | Ranked results from ASCS views, apps and actions, custom commands, workspaces, notes, and open windows on this desktop. On a note, **Enter** opens it, **Alt + Enter** pastes it into the window you were using, and **Shift + Enter** copies it. The list ends with **Search files for…** (opens Everything with the query) and **Search the web for…** |
| Math, such as `18*1.2` or `sqrt(2)`, or text starting with `=` | A calculator result; Enter copies it. Supports `+ − × ÷ % ^`, parentheses, `sqrt abs round floor ceil ln log sin cos tan`, `pi`, and `e` |
| Text starting with `?` | A web search, using the address in Preferences (DuckDuckGo by default) |
| **Paste a note…** / Super + Shift + P | Every note: Enter pastes into the window you were using (asking for any `{ask:…}` fields first); Shift + Enter copies |
| **Restore a workspace…** / Super + Shift + R | Workspaces mode |
| **Save workspace as…** | Type a name; Enter saves the current layout under that name |
| **Switch to window…** | Windows mode: jump to any open window on this desktop |

On a note, Enter opens it in Quick Notes and Shift + Enter copies its text. In a mode, the mode's name appears as a chip in the search box; Backspace in an empty search returns to all commands.

Matching ranks prefixes, word starts, and initials (`wt` finds Windows Terminal), and accepts letters in order within a title (`tmgr` finds Task Manager). Descriptions and keywords must contain the typed text. Commands you use often or recently rank higher; this ranking is stored in the WebView profile.

### Quick Notes

Quick Notes (Super + Q by default) supports multiple notes, title editing, filtering, pinning, and deletion with an in-app confirmation dialog. *(1.8.0)* Notes and snippets are one: every note can be pasted or copied from the palette (Super + Shift + P lists them all to paste), and each note has a style. **Text** has Markdown preview and spell-check; **Code** is monospace, with neither. Snippets from earlier versions became Code notes. **Copy** in the footer copies the text exactly as written.

**Placeholders** *(1.8.0)* are filled in when a note is pasted or copied from the palette:

| Placeholder | Becomes |
|---|---|
| `{date}`, `{isodate}`, `{weekday}` | Nov 4, 2026 · 2026-11-04 · Wednesday; add a day offset such as `{date+7}` or `{isodate-1}` |
| `{time}`, `{time24}`, `{month}`, `{year}` | 3:05 PM · 15:05 · November · 2026 |
| `{ask:name}`, `{ask:clientName=default}` | Asked for in the palette before pasting, one at a time with a live preview; the same name is asked once. Names are camelCase and shown as words ("Client name") |
| `{clipboard}` | The text on the clipboard |
| `{cursor}` | Where the cursor ends up after pasting (if within 2,000 characters of the end) |
| `{uuid}` | A new random identifier |

Anything else in braces is left as written. **{ } Placeholders** in the editor opens a menu of them all, each with a live example (today's date, the time): click one to insert it at the cursor, with the part to change (a name, a number of days) selected, ready to type over. The switch at the bottom of the menu, **Fill in when pasting**, turns filling on or off for the note: on for Text notes and off for Code notes unless you change it, so code that happens to contain `{date}` pastes exactly; inserting a placeholder from the menu turns it on. Placeholders can't run anything or read files; `{clipboard}` and `{cursor}` are handled by ASCS at paste time, everything else by the page. **Spell-check** (Preferences › General) is on by default, and never applies to Code notes.

**Groups** *(1.8.0)*: the **Group** field beside the style picker puts a note in a group (it suggests the groups in use and accepts a new name; empty means Ungrouped). The list shows pinned notes first, then the groups (pinned groups first, each set A to Z), then Ungrouped. Each group's header opens or closes it and shows its count; its **⋯** menu can **Pin group**, **Rename…** (in place; a name another group already has merges the two, after asking) and **Delete group…** (its notes move to Ungrouped; notes are never deleted). Which groups are open or pinned is kept on this PC, not in notes.json. A filter or #tag shows every group with a match open, and opening a note from the palette opens its group. In the palette a grouped note reads **Group › Title**, so "cl bug" finds Claude › Bug. Group names are up to 60 characters without control characters, compared without regard to case; ASCS refuses a save that breaks this and keeps the previous file.

**#tags:** write `#tags` anywhere in a note. Tags cut across groups. The most used tags appear as chips above the list; click one (or type `#tag` in the filter) to show only notes with that tag. Plain words and tags combine in the filter.

**Markdown preview:** **Preview** shows a note formatted (headings, bold and italic, lists, quotes, inline and fenced code, rules). The preview is built from plain text elements only and never interprets HTML, so nothing in a note can run as code. Links are shown (with their address on hover) but are never opened. The footer shows the word count.

**Quick capture:** Super + Shift + C copies the selected text in the active application into a new note titled “Captured · *window title*”, without showing ASCS. If nothing is selected, it captures the current clipboard text instead. The clipboard is restored afterwards, and captures over 200,000 characters are truncated.

Data is stored as a version 2 JSON object in `data/notes.json`. Saves are debounced and atomically replaced, and the previous file is kept as `.bak`. If `notes.json` is unreadable at startup, ASCS loads the backup and shows a notice the next time it is focused. When ASCS is shown, it reloads `notes.json` if the file was changed outside ASCS; unsaved edits in the editor take precedence. A pre-1.4 single-note file of the form `{"content":"..."}` is converted into a note named “Scratch”.

Each note stores an `id`, `title`, `type` (`note` for Text or `code`; `snippet` from earlier versions is read as `code`), `content`, `pinned`, an optional `fill` (whether placeholders are filled, when set by hand), an optional `group` (1.8.0; older versions ignore it), and ISO-8601 `created`/`updated` timestamps. The collection stores `version`, `activeId`, and a `notes` array.

### Everything Launcher

Super + F opens Everything. The palette's “Search files for…” opens Everything with that query (`Everything.exe -search`). ASCS does not embed results or load the Everything SDK.

### Vivaldi

Super + B detects Vivaldi windows on any virtual desktop. It focuses one on the current desktop when possible, otherwise switches to the topmost window's desktop and focuses it, and launches Vivaldi only when no window exists. Cross-desktop detection requires `VirtualDesktopAccessor.dll` with `GetCurrentDesktopNumber` and `GetWindowDesktopNumber`; if detection fails, ASCS reports the problem instead of opening a duplicate.

### Explorer Item Creation

With a filesystem folder active in File Explorer, Super + Shift + D creates a folder and Super + Shift + F creates an empty file (enter a name with its extension). Both report an error if Explorer is not active, the location is not a filesystem folder, the name is invalid, or the item already exists.

### System Dashboard

The System Dashboard (Super + I by default) shows live CPU/RAM metrics with **history graphs** of the last 15 minutes (average and peak), drive cards, processor and graphics details, memory configuration, motherboard and BIOS information, the Windows build, and a disk-to-partition-to-volume map. Metrics refresh every five seconds while ASCS is visible and stop while it is hidden or minimized. CPU comes from `GetSystemTimes` deltas and memory from `GlobalMemoryStatusEx`. For the history, ASCS samples both every 10 seconds even while hidden (two near-instant system calls), keeping the newest 90 samples in memory only. The hardware inventory is laid out as a two-column spec sheet. The hardware inventory is read once per session through WMI (`Win32_Processor`, `Win32_ComputerSystem`, `Win32_PhysicalMemory`, `Win32_VideoController`, `Win32_DiskDrive`, `Win32_DiskPartition`, `Win32_LogicalDiskToPartition`, `Win32_LogicalDisk`, `Win32_BaseBoard`, `Win32_BIOS`, `Win32_OperatingSystem`).

### Games

Play time, recent games and achievements across Steam, RetroArch, Dolphin, PCSX2 and Phantasy Star Online, read from each program's own records (read-only):

- **Steam:** installed games from the app manifests in every Steam library folder, play time and last played from the most recently used account's `userdata\<account>\config\localconfig.vdf`, and portrait art from Steam's library cache (its landscape header when there is no portrait art). No Steam account details or keys are needed. Games are started through Steam's own `steam://rungameid/<number>` link. Uninstalled games you have played are listed too, named from Steam's binary app cache (`appcache\appinfo.vdf`, formats v28 and v29, read only for the games needed); their button reads **Install** and opens Steam's install prompt, and they stay out of Continue playing and the palette. Steam cover art is looked up when a cover is first shown, not during the library build.
- **RetroArch:** runtime logs (`playlists\logs\*.lrtl`, with content runtime logging on) joined to its history.
- **PCSX2:** `inis\playtime.dat`, named through its game list.
- **Dolphin:** `Config\TimePlayed.ini`, named through its game list (system channels and brief tests are left out).

The tab shows:

- **Now playing:** the game an emulator or Steam is running (from the emulator's window title, or Steam's running app), matched to the library: its cover as a soft backdrop, a live session timer, total play time, RetroAchievements progress with the latest unlock and the game's rich presence, and **Show file** (**Open folder** for Steam); other running games are listed below it. The session starts when the emulator's process started, or when a different game appears; it isn't affected by which of the emulator's windows has focus (PCSX2 and Dolphin show games in a window beside their main one), and it ends only when the game closes; ASCS checks every 10 seconds (a few process and window-title reads). With nothing running, it shows the last game played with **Play**. The PSO session is started with Super + M4.
- **Controllers:** each connected controller with its name, mode (X-input, D-input, Switch or PlayStation, from its vendor and product IDs), connection (Bluetooth or USB, from Windows' device records), player slot, and battery where reported (X-input mode reports it; Bluetooth D-input and Switch modes don't). **Test** opens a live input tester: for X-input controllers, sticks, triggers and every button (polled about 16 times a second only while it is open), with **Rumble**; for D-input and Switch-mode controllers, sticks, any trigger axes, the D-pad and numbered buttons, read from the controller's own HID reports through Raw Input (registered only while the tester is open, decoded with Windows' HID parser; never DirectInput). **Rename** names the controller in ASCS and in Windows' per-user game controller list (the name the Game Controllers panel and DirectInput games show; no administrator rights needed; an empty name restores the default). Most emulators and Steam use their own controller names. The Bluetooth name needs administrator rights, so **Bluetooth name…** opens Windows' Devices and Printers, where the controller's Properties › Bluetooth tab renames it; that is needed once per controller. Controllers are found through XInput and the Raw Input device list (never DirectInput, which crashed ASCS in testing); other HID devices, such as a keyboard's receiver, are ignored. Rumble, Identify and battery need X-input mode; D-input and Switch-mode pads are listed with their mode and connection and can be tested. A 2.4 GHz receiver (recognized from Windows' own name for it, remembered before any rename) shows its controller once, as the X-input entry labeled **2.4 GHz receiver**: its idle D-input interface is hidden, and since the receiver reports itself as wired, the battery reads "not reported through the receiver". **Identify** rumbles one X-input controller, to tell two identical controllers apart (they share a model, so they share a name; the player number tells them apart too).
- **Play time:** the total for each source.
- **Continue playing:** the twelve most recent games ASCS can start, with their cover art, in a row that scrolls sideways (a thumb wheel such as the MX Master's, a trackpad, or Shift + wheel; it fades at the edge while more games are off to the side); click one to play.
- **Achievements** (RetroAchievements): hardcore, true and softcore points; rank with a percentile; the game you were last seen in and its rich presence; progress in recently played games (percent, with completed and mastered games in gold); and recent unlocks with their descriptions and points (gold for hardcore), with each game's icon and each achievement's badge. Images come only from `media.retroachievements.org`: ASCS reads an image name from the response only if it is a plain badge number or `/Images/<digits>.png`, builds the address itself, keeps only real PNGs under 256 KB, and caches them in `data\ra-images`, so each is downloaded once. The cache is capped at 20 MB: past that, the images shown least recently are removed down to 16 MB (typical use stays well under 1 MB). **Profile** opens your RetroAchievements profile; **Refresh** fetches again (at most once a minute; otherwise every ten minutes), and the header shows when it last updated. It needs a user name and Web API key in `data\secrets.ini` (**Open secrets file** creates it from a template and opens it in Notepad).
- **The library:** every game played, filterable by source and text, sorted by recent, most played or A–Z, with **Play**. Click a game to open its details beneath it: larger art, the full title, where it was played, play time, sessions, the exact last-played time, the RetroArch core, serial, disc ID or Steam app ID, the file name and size or the install folder and size, your RetroAchievements progress when the titles match, and **Play** and **Show file** (or **Open folder** for Steam). One game is open at a time.

Titles drop region and revision tags for display ("Super Paper Mario (Europe) (Rev 1)" reads "Super Paper Mario"), library-sorted names read naturally ("Legend of Zelda, The" reads "The Legend of Zelda"), and RetroArch's system names are shortened ("Sony - PlayStation" reads "PlayStation"). **Cover art** (Preferences › Games & apps, on by default) comes from Steam's library cache, RetroArch's thumbnails and PCSX2's covers folder on this PC; nothing is downloaded, and covers are sent to the page one at a time so hotkeys stay responsive. Games without art get a monogram tile. Live status refreshes every three seconds only while the tab is open.

### Calendar

*(1.8.0)* Your calendars, kept on this PC: **Day** and **Week** (hours that scroll inside the page, overlapping events side by side, a gold line at the current time), **Month** and **Agenda** (the next 60 days), with **Today**, ‹ › and **New event** (or Ctrl + E). Click a day to see its hours, a time to add an event there, the all-day row to add an all-day event, and an event to change it. Multi-day events (all-day, or crossing midnight) are bars across the days they cover, in the month and in the week's and day's all-day row, pointed where one continues into the next week (or day). A month day shows up to three lines (two lanes of bars, then its own events), then "+N more", which opens the day. Calendars start as Personal, Gaming and Work; **New calendar** and each calendar's **Edit** create, rename, recolor and delete them, and the tick boxes show or hide each one.

The event editor has a title, calendar, all-day or start and end times, **Repeat** (daily, weekly on chosen days, monthly on a date or on e.g. the second Tuesday or the last Friday, yearly; every N; forever, until a date, or N times), a **Reminder**, location and notes. Changing an occurrence of a repeating event asks whether it's **only this one** (the series skips that date and the change becomes an event of its own) or **every event in the series** (the series moves by the same amount). Deleting asks the same.

**Quick add:** in the palette (Super + Space), start with **+** and type the event: `+Dentist tue 3pm #work`, `+PSO raid fri 8-11pm #gaming`, `+Trip nov 12`, `+Call Sam tomorrow at 3 for 30m`. The palette shows what it understood (day, time, calendar) before Enter adds it. Dates: today, tonight, tomorrow, weekdays (and "next fri"), "nov 12" or "12 nov", 11/12, 2026-11-12, "in 3 days"; times: 3pm, 3:30pm, 15:00, noon, "at 9", ranges like 3-5pm; "for 90m" sets the length; `#name` picks the calendar. With no time the event is all-day; a time already past today means tomorrow (or next week, for today's weekday). Timed events get a 15-minute reminder. **New calendar event** is in the palette too.

**Today on the Command Center:** under the system overview, today's remaining events (up to three, then "+N more"), or the next one coming up; each opens in the Calendar.

**Countdowns and files:** your countdowns (Preferences › Countdowns) show in the Calendar as rounded pills with an hourglass, unlike events (square corners and a color stripe): yearly ones every year, one-offs once. A one-off countdown is removed the day after its date. **Edit** beside Countdowns in the calendar list chooses their color (kept with the Calendar's view settings) and links to Preferences. They are read-only in the Calendar (clicking one opens Preferences › Countdowns), are never written to the calendar server, and can be hidden with **Countdowns** in the calendar list; a countdown with the same name as an event on that day isn't shown twice. An event's **Pin as countdown** adds it to the almanac's countdowns (a yearly event counts down every year). **Import .ics…** (under the calendar list) adds the events from a file to a calendar you choose; events already there (the same event id) are skipped, so importing a file twice changes nothing. A calendar's **Edit › Export .ics** saves it as a file. Windows' own Open and Save dialogs are used, so the page never handles file paths.

**US Holidays** *(1.8.0)*: a read-only calendar of the 11 federal holidays (on their actual dates) and common observances (Valentine's Day, Easter, Mother's Day, Father's Day, Halloween, Christmas Eve, New Year's Eve), worked out on this PC with nothing downloaded. Hide or recolor it like Countdowns. They also count down on the Command Center unless **Count down to US holidays** is off (Preferences › Countdowns); one of your countdowns with the same name or date replaces the holiday.

**Dragging events** *(1.8.0)*: in Day and Week, press on an event and drag it. It dims where it was, and a dashed outline in its color shows where it will land, snapped to 15 minutes, keeping its length and labeled with the new time (and day, when dragged across days in Week). Near the top or bottom the hours scroll. Dropping saves it; Esc, or dropping where it started, cancels; a short click still opens the editor. A repeating event asks first: **Only this one** or **Every event in the series**. Countdowns, holidays and all-day events aren't dragged; resizing and dragging in Month are planned for 1.9.0.

**Where it lands** *(1.8.0)*: under the event editor's times, a strip shows where the event falls, redrawn as the times change. For a timed event it spans the hours around it, with that day's other events in gray and a note when they overlap; for an all-day or multi-day event it spans the days around it (at least a week), with other all-day events in gray.

**Reminders** (from when the event starts up to 2 days before, including 1 minute) for the next three days are handed to ASCS, which shows them as tray pop-ups with your reminder sound (Sounds › Use as › Calendar reminders; until then Windows' own Calendar Reminder sound), even while ASCS is hidden. The pop-up carries the ASCS icon, the event's name, "Starts in 5 minutes · Today 3:00 PM" and the location; clicking it within a minute opens the Calendar. In the event editor, moving the start (date or time) moves the end with it, keeping the event's length. A reminder more than 15 minutes late (the PC was asleep) is dropped.

**Where the data lives:** in **Radicale**, a small open-source CalDAV server, installed by `tools\Install-Radicale.ps1` into `data\radicale` (version 3.8.3 and 13 dependencies, each pinned by SHA-256 against PyPI's published digests; wheels only). ASCS starts it with itself, listening on 127.0.0.1 only; adopts it across a reload; and stops it on exit. Events are standard iCalendar, written in local time; edits change only the fields ASCS manages and keep everything else in an event (a phone's own properties, attendees, time zones), so a phone can be added later without losing anything. Events from other apps are read in their own time zones.

### Sounds

*(1.8.0)* Every Windows sound from 3.x to 11, played as the originals from the sound library (`C:\Sounds\all-windows-sounds-main` by default; the **Library** line under the list shows it, with **Change** and **Re-read**). Each version is a folder named like `(1998) Windows 98`; other folders, such as `Aeolionware Startup`, appear at the end as your own. *(1.8.0)* Folders without a year, such as `Aeolionware Startup` and `ASCS Leveled`, are your own: each has a button beside ♥ Favorites rather than a place among the versions. The page opens on every version as a card, three to a row, each with its logo, year and number of sounds; choosing one opens it, with a strip of versions across the top (the thumb wheel steps through it) and **All versions** just above the sounds to go back. Within a version, sounds are grouped by their sub-folders (Windows 7's and Vista's themes). The toolbar has finding on the left (search across every version from either screen, **♥ Favorites**: click the heart on a sound) and playback on the right (**Play random**, **Stop all**, volume). One sound plays at a time: playing another stops it (even one still loading), and **Ctrl + click** layers a sound over what's playing instead. Sounds play in the page with Web Audio; MIDI and WMA files play through Windows.

The right-hand column has two tabs, one shown at a time: **Selected sound** (opened whenever a sound is clicked) and **In use** (with a count). Selected sound shows:

- **Level:** measured as soon as it's selected: its loudness against the notification level (below), and its RMS and peak in dBFS (measured over every sample, as the startup sounds were leveled), against a **reference** level: type a target, or pick one of three chips: your startup sounds (−26.4 dB), your ASCS sounds (−33.7 dB), or this sound's own level (to level others to it). ASCS works out the gain to match it, holding it back if the peak would go over −0.3 dBFS (and saying how far short that leaves it), lets you **preview** the result, and **saves a leveled copy** in the library's `ASCS Leveled` folder (named like `CHIMES (-7.6 dB).wav`, in the original's format; the original is never changed). **Measure all levels**, beside the count above the list, measures every sound shown and puts each level on its tile. Compressed WAVs (such as ADPCM) can be measured but not leveled.
- **Use as:** starts at "Choose where to use it…" (**Use** stays off until something is chosen), then makes a WAV the sound for a Windows event (Device Connect, Notification, Calendar Reminder, Empty Recycle Bin, and 15 more), or for ASCS showing, hiding or reminding. When the sound is off the notification level, **Match the notification level** is ticked beneath: **Use** then saves a leveled copy and uses that (untick it to use the original).

**In use: the notification level board.** *(1.8.0)* Every sound in use, ASCS's three and Windows' events, measured for loudness the way the ear hears it: ITU-R BS.1770, in LUFS, the measure streaming services use. It weights the frequencies the ear is most sensitive to and leaves out silence, so a short chime with a quiet tail isn't counted as quieter than it sounds, as plain RMS would. At the top is one **notification level** (−24 LUFS to start; − and + step by 1 dB; presets Quiet −30, Balanced −24, Clear −18, and **Middle of yours**, the median of your sounds, which changes the fewest). Each row shows a bar with the target in the middle and the sound's place on it (±12 dB), and **Matched** (within ±1.5 dB) or how many dB louder or quieter it is.
- **Match** (one row) or **Match all** saves leveled copies in `ASCS Leveled` and switches the events to them. Match on another row while one is matching queues it ("Queued"). A copy is held back if raising it would push the peak past −0.3 dBFS.
- **Play all** plays each in turn, so you can hear them side by side (Stop ends it).
- **Restore** takes any event, or any of ASCS's sounds, back to what it played before ASCS first changed it. **Restore all** *(1.8.0)* does that for every changed sound at once, after a confirmation; leveled copies stay in the library.
- **Delete** *(1.8.0)*, on a selected leveled copy, moves it to the Recycle Bin after a confirmation. Only WAV files directly inside `ASCS Leveled` can be deleted, and not while a Windows event or ASCS sound plays them (ASCS checks this itself, whatever the page asks). **Select** (next to Measure all levels, wherever leveled copies are shown) deletes several at once: click copies to pick them (Shift + click picks a range; copies in use are grayed), then **Delete (N)** in the bar, after one confirmation. Up to 200 at a time; the page sends them 10 to a request and ASCS answers each, so it stays responsive, and a copy that fails a check is skipped with its reason while the rest go ahead. Esc or **Done** leaves Select.

ASCS sends each sound to the page by its event's name (`windows:<event>` or `ascs:<show|hide|reminder>`); the page never names a file path. A bare file name in the registry is looked for in Windows' Media folder; nothing else is followed. Compressed WAVs can be measured but not matched. MIDI and WMA can't be used for Windows events at all.

Lengths are read from the WAV headers in the background and remembered in `data\sound-lengths.txt`, so the library lists at once.

### Logs

Script errors in the page are written to the ASCS log as "Page error: …" (up to ten per session), so they appear here too. A read-only viewer for three logs: **ASCS** (`data\ASCS_Log.txt`), **Activity** (`data\activity.log`), and **Code key** (`%LOCALAPPDATA%\VSCodeMacro.log`, written by the Code key's script). Lines are grouped by day, newest first, with errors marked in burgundy and warnings in gold (inferred from words such as “failed” or “timed out”). **All / Issues / Errors** filter by level with counts, the filter box searches the text (Escape clears it), **Copy** copies the visible lines, and **Open file** opens the log in Notepad. While the tab is open it checks for changes every three seconds; ASCS answers only when the file has changed, and the check stops when you leave the tab. Only the newest 512 KB (up to 2,000 lines) is read, and the newest 600 matching lines are shown.

### Super Commands

An in-app reference for every shortcut, led by a **keyboard map** of the user's customized Keychron Q6 Max: a 100% board with a full-width left Shift, a rectangular Enter with `\ |` above it, seven macro keys (M1–M3 in place of PrtSc/ScrLk/Pause, M4–M7 above the numpad), a **Code** key between left Ctrl and Alt, and Alt · **Super** · Fn · Ctrl right of Space. The map has two layers, **Super** and **Super + Shift**. Keys in use are filled by category: deep indigo for apps and views, steel for windows and system, burgundy for workspaces, notes and text, and gold for custom commands. Free keys are outlined. The physical Super key is drawn in metallic gold. The Code key and macro keys M1–M7 are outlined in dashed gold as **Macro keys**, captioned with what they do on their own through the keyboard's macro scripts (Bambu, Audio, Discord, PSO, RetroArch, Dolphin, PCSX2, VS Code). With Super, M4 starts a PSO session and M5–M7 open recent games; those keys are filled like other commands, and a green dot marks M4–M7 while that program is running (checked every three seconds, only while Super Commands is open). Fn is handled by the keyboard and is not used by ASCS. Hover over or focus a key for its command or note (and, for unassigned C/D/F/P, the Windows shortcut that passes through). Switch layers with the toggle, or hold Shift while the view is open to preview the second layer. The map follows your Preferences letters and custom commands immediately. Configurable letters in the lists below update as soon as Preferences are saved, and new 1.6.0 shortcuts are marked “NEW”. **Search** (beside the map's title) filters the lists below and highlights matching keys on the map, dimming the rest; Escape clears it. The map and lists cover every combination ASCS registers, including Windows shortcuts that ASCS passes through: while C, D, F, or P has no assigned action, Super + that letter runs Win + that letter (with the default letters: **Super + D** shows the desktop and **Super + P** projects to a display).

### Title Bar

The sidebar opens with the brand: a 76 px indigo mark with a metallic gold edge and a soft indigo halo, with AEOLIONWARE and SUPER COMMAND SYSTEM centered beneath it in widely spaced capitals. When the sidebar is collapsed, the mark shrinks in place to 56 px above a short ASCS wordmark, so nothing below it moves. The title bar shows your location (`ASCS / view`), a **command bar** (“Search or run a command”, Super + Space) that opens the palette, a live **status pill**, and the clock. The pill reads “All systems nominal” in green, or turns gold with “Attention · J: 94% full” (or CPU/memory) when any monitored resource reaches 90%; hover for the full list. Every text run is trimmed to its capital height (`text-box: trim-both cap alphabetic`), and controls use even heights (command bar 36 px, status pill 28 px, key chips 22 px) on the 72 px bar. The search text keeps a few pixels of clipping room so tall letters are never cut. As a result, the brand, labels, controls, clock, and caption glyphs share one optical center line (verified to within half a pixel at 2× scale). There is no band or divider at rest, so nothing falls short of the window edges. Once the page scrolls, the bar stays at the top and a frosted band with a hairline fades in behind it, drawn edge to edge across the main area whatever the content padding. The caption buttons are pinned to the window's top-right corner at the bar's full height (48 × 72), with crisp 10 px glyphs drawn on whole-pixel strokes. Double-clicking the bar maximizes or restores the window. Maximize swaps to a restore glyph while the window is maximized, and Close hides ASCS (it keeps running) with a burgundy hover. Below 1100 px wide, the command bar and clock are hidden.

### Preferences

Tabs (General · Shortcuts · Palette · Almanac · Countdowns · Custom commands · Workspaces) show one section at a time, laid out as option rows: each setting's name and explanation on the left, its control on the right. Arrow keys move between tabs, as does a sideways flick of a thumb wheel (such as the MX Master's) or a trackpad, one tab per notch; the last tab is remembered. In narrow windows the tabs stay on one line and scroll sideways. General, Shortcuts and Palette share the **Save preferences** bar, which turns gold with “Unsaved changes” until you save (unsaved edits survive switching between those tabs); Custom commands and Workspaces save on their own.

- **Almanac:** the Wikipedia almanac switch and the location used for sunrise and sunset.
- **Countdowns:** up to 12 dates, yearly (MM-DD) or one-off (YYYY-MM-DD), sorted when saved: yearly dates January to December, then one-off dates.
- **System overview:** up to 12 monitored drives, snap gap (0–48 px), and whether window size is preserved when moving between monitors.
- **Super-key shortcuts:** unique letters for Quick Notes, Everything, System Dashboard, Windows Terminal, File Explorer, Ask Claude, and Task Manager. B, S, R, L, M, V, J, and Y are reserved. Changes rebind immediately.
- **Claude quick-entry shortcut:** the key combination the Claude desktop app uses for its quick-entry prompt (default **Ctrl+Alt+Space**). Only Ctrl, Alt, Shift or Win plus one key (Space, a letter, a digit, or F1–F12) is accepted, and at least one of Ctrl, Alt or Win is required, so the setting cannot send arbitrary keystrokes. Leave it empty to have Ask Claude simply open the app. If a value is rejected, the message names the shortcut and the conflicting letter, nothing is applied, and the form returns to the active values.
- **Command palette:** the web search address, which must use `https://` and contain `%s`.
- **Custom commands:** rows of name, type (Application, Folder, or Web link), target, and an optional Super letter, with a Browse… picker for applications and folders. Applications must be existing `.exe` or `.lnk` files and start without arguments; folders must exist; links must be `http(s)` URLs. Letters may not collide with built-in or other custom shortcuts. Up to 30 commands; Save commands applies them immediately. If saving fails, your edits stay in the form so you can fix the reported row.
- **Workspaces:** a list of saved layouts with Restore and Delete, plus a field to save the current layout under a name.

### Workspaces

Super + S saves the **Default** workspace and Super + R restores it. Named workspaces are saved with Super + Shift + S, from the palette (“Save workspace as…”), or in Preferences, and chosen with Super + Shift + R. Names use letters, numbers, spaces, `-` and `_` (up to 40 characters).

- **Save** captures up to 24 visible application windows on the current desktop. It skips minimized, cloaked (other-desktop), tool, and owned windows and the desktop/taskbar. A window that cannot be measured is skipped and logged instead of canceling the save. Explorer windows also record their folder.
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
| Super + Shift + P | Palette: paste a note |
| Super + S | Save the Default workspace |
| Super + R | Restore the Default workspace |
| Super + Shift + R | Palette: choose a workspace |
| Super + F *(configurable)* | Everything |
| Super + I *(configurable)* | System Dashboard |
| Super + B | Focus Vivaldi here, switch to its desktop, or open it |
| Super + T / E *(configurable)* | Reuse Terminal / Explorer, switching desktops if needed |
| Super + Shift + T / E | New Terminal / Explorer window |
| Super + C / H *(configurable)* | Ask Claude / Task Manager |
| Super + M4 | PSO session: headphones (through SoundSwitch), Discord (opening the voice channel set in Preferences, if any), then the Ephinea launcher; when PsoBB.exe closes, the previous audio device comes back and ASCS offers to close Discord |
| Super + M5 / M6 / M7 | Recent RetroArch / Dolphin / PCSX2 games in the palette; Enter plays one |
| Super + Shift + M4–M7 | Deliberately vacant |
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
| Inside ASCS: Ctrl + 1–9 / Ctrl + N / Ctrl + E / Ctrl + F / F1 | Switch view (each sidebar item shows its number) / new note / new calendar event / search this page (pages with a search box) / open or close Help (also the ? button in the title bar). None of these act while a dialog is open. |
| Ctrl + Alt + Shift + A | Start ASCS when it is not running; save notes and reload it when it is (requires the launcher; see [Installation](#10-installation-and-startup)) |

**Super + Shift layer:** C (capture), P (paste a note), D (new folder), and F (new file) always perform their Shift action, even when a configurable action or custom command uses the letter without Shift. When C, D, F, or P has no assignment, Super + that letter passes the Windows shortcut through (for example, Win + D shows the desktop). **Super + Shift + S** is "save as": the palette opens on name entry, and Enter saves the current window layout under that name (Super + S still saves the default workspace). The Snipping Tool is in the palette. Other keys keep their Super action when Shift is added. The keyboard map in Super Commands shows both layers. Launched applications take focus only if you haven't switched to another window in the meantime.

## 7. Frontend and Backend Communication

The contract is defined by `ASCS.ahk` and `frontend/app.js`; change both sides together.

### Frontend to AutoHotkey

JavaScript sends newline-separated text through `window.chrome.webview.postMessage()`: the message type, a newline, then the content.

| Message | Content | Purpose |
| --- | --- | --- |
| `Ready` | None | Frontend initialized |
| `GetNotes` / `SaveNotes` | None / full notes JSON (≤ 5 MB) | Load / atomically save notes |
| `WindowAction` | `minimize`, `maximize`, or `close` | Window controls; `close` hides |
| `Launch` | Allowlisted identifier | Built-in launches and actions (`everything`, `vivaldi`, `terminal`, `explorer`, `calculator`, `claude`, `taskmanager`, `settings`, `downloads`, `projects`, `snipping`, `lock`, `mute`, `reload`) |
| `GetMetrics` | `home`, `dashboard`, or empty | Schedules a metrics push |
| `GetAlmanac` | None | Almanac settings, then today's cached Wikipedia feeds (fetching them if missing and enabled) |
| `SaveAlmanac` | `1` or `0`, then `date\|name` lines (≤ 2 KB, up to 12 countdowns) | Almanac preferences |
| `OpenWikipedia` | Article title (≤ 200 characters) | Opens `https://en.wikipedia.org/wiki/<title>`; the title is validated and the address built by ASCS |
| `GetGames` / `GetGamesLive` / `GetRunning` | None | The library (no file paths) / now playing, running apps and controllers / running apps for the keyboard map |
| `LaunchGame` | Game id (`ra:<n>`, `ps2:<serial>`, `gc:<ID>`) | Plays a game from ASCS's own index with the configured emulator |
| `GetCovers` | Comma-separated game ids (up to 40) | Queues cover art, sent as `COVER` strings with a checked PNG/JPEG data URI |
| `GetGameSettings` / `SaveGameSettings` | None / `retroarch\|dolphin\|pcsx2\|pso\|discord\|headphones\|soundswitch\|covers` | Games & apps preferences |
| `CalDav` / `SetReminders` | `id\|operation\|calendar\|event\|version` and a body / reminder lines (`at`, title, when, start, location; tab-separated) | One CalDAV request built by ASCS (reply: `CAL` string) / the next three days' reminders |
| `PowerAnyway` | None | Go ahead with a restart, shutdown or sign-out held for unsaved work (only while one is held) |
| `DeleteLeveledSound` / `RestoreAllSounds` | Sound id / None | Move a leveled copy to the Recycle Bin / restore every sound ASCS changed |
| `DeleteLeveledSounds` | Up to 10 sound ids, one per line (≤ 6,000 characters) | Select › Delete: each copy checked and moved to the Recycle Bin; any id that isn't a leveled copy refuses the whole request (reply: `soundsDeleted`) |
| `ExportCalendarFile` / `ImportCalendarFile` | Calendar name and .ics text / None | Windows' Save dialog writes the file / Windows' Open dialog reads one (reply: `ICS` string) |
| `GetRaImages` | Up to 30 image tokens (`b:<digits>` badge, `i:<digits>` game icon) | Cached or downloaded images, sent as `RAIMG` strings with a PNG data URI |
| `StartControllerTester` / `StopControllerTester` | `h<handle>` / None | Raw Input tester for a D-input or Switch-mode pad (the handle must be in ASCS's current device list) |
| `GetRetroAchievements` / `SetupRetroAchievements` | `refresh` (optional) / None | Fetches (sent as `RA` strings) / creates and opens `data\secrets.ini` |
| `StartPsoSession` | None | The Super + M4 session |
| `PowerArm` / `PowerRun` / `PowerCancel` | `restart`, `shutdown`, `signout`, `sleep` or `recycle` / `action\|ticket` / None | Guarded actions: arm (after a completed hold), run with the single-use ticket, cancel a countdown |
| `PowerNow` | `lock` | Lock the workstation |
| `GetRecycleBin` / `GetAudioDevices` / `SelectAudioDevice` | None / None / device name | Recycle Bin size / active playback devices / switch output through SoundSwitch |
| `GetGameDetails` / `ShowGameFile` | Game id | A game's details (sent as `gameDetails`) / Explorer at its file or install folder |
| `GetControllerInput` / `RumbleController` | `x0`–`x3` (XInput) or `j0`–`j15` (joystick API) | Live input for the tester / a half-second rumble (XInput only) |
| `RenameController` | `VVVV:PPPP\|name` (empty name resets) | ASCS name and Windows' per-user game controller name |
| `OpenBluetoothRename` / `OpenRetroAchievementsProfile` | None | Devices and Printers / the user's profile page, built from the validated user name |
| `GetLog` / `OpenLogFile` | `ascs`, `activity` or `codebutton` (optionally `\|refresh`) | Log tail / open in Notepad |
| `GetSettings` / `SaveSettings` | None / `drives\|gap\|preserve\|keys\|claudeShortcut\|searchUrl` | Preferences |
| `GetCommands` / `SaveCommands` | None / one command per line: name, kind, target, key (tab-separated) | Custom commands |
| `RunCommand` | Command index (1–30) | Runs a saved custom command |
| `BrowseCommandTarget` | `row\|app` or `row\|folder` | Opens a file or folder picker |
| `GetWorkspaces` | None | Lists saved workspaces |
| `SaveWorkspace` / `RestoreWorkspace` / `DeleteWorkspace` | Workspace name (`Default` or empty for the default) | Named workspaces |
| `GetWindows` / `FocusWindow` | None / window handle | Window switcher; the handle must still be an eligible window |
| `PasteNote` / `CopyNote` | Note text with placeholders filled (≤ 256 KB); `{clipboard}` and `{cursor}` as private marks | Pastes into the previously active window, placing the cursor / copies to the clipboard |
| `SearchWeb` / `SearchFiles` | Query (≤ 1000 characters) | Web search / Everything search |
| `GetActivity` | None | Activity feed |
| `SaveQuickActions` | Up to six ids, one per line (`view:`, `launch:`, `mode:`, `cmd:`, `ws:`, `snippet:` (paste a note) or `note:` (open it) followed by a name) | Pinned quick actions; each id is validated, and running one uses the palette's existing messages |
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
| `metrics` | CPU/RAM, legacy C: fields, `drives: [{letter, usage, used, total, online}]`, `history: [[cpu, ram], …]` (oldest first, up to 90 samples), plus hardware once collected |
| `quickActions` | Pinned quick action ids, or `null` when never customized |
| `settings` / `settingsSaved` | Preferences (including `searchTemplate`) / saved |
| `commands` / `commandsSaved` | Custom commands `[{id, name, kind, target, key}]` / saved |
| `workspaces` | `[{name, windows, saved}]` |
| `windows` | `[{id, title, app, minimized}]` |
| `browseResult` | Picker result for a custom-command row |
| `activity` / `activityAdded` | Activity list / one new entry (`{time, kind, text}`) |
| `powerHeld` | A power action held for unsaved work: `action` and `apps` (names) |
| `soundsDeleted` | One Select › Delete batch: `ok`, `deleted`, `skipped: [{id, reason}]`, and `message` when refused |
| `notice` | Toast message (only sent while ASCS is visible) |
| `error` | Error toast; optional `scope` is `notes`, `settings`, or `commands` |

## 8. Security


- **Contact address:** only the almanac's Wikimedia requests carry the owner's email address in their User-Agent (at the owner's request, as Wikimedia's policy asks). RetroAchievements requests use a generic `ASCS/<version>` client name.
- **Almanac (1.7.0):** the Wikipedia almanac is off until turned on in Preferences. When on, ASCS requests two fixed addresses on en.wikipedia.org (the featured feed and today's observances) once a day over HTTPS, with certificate checks on, redirects off, timeouts, a 3 MB size cap, and a User-Agent naming ASCS and the owner's email address, as Wikimedia's API policy asks. Failures back off for 30 minutes. The feeds go to the page as plain strings (never as script or markup), where only expected fields are read, control characters are stripped, lengths are capped, and everything is rendered as text. Links are never taken from the feeds: the page passes an article title, which ASCS validates before building the en.wikipedia.org address itself. The page's own content security policy still forbids it any network access.
- **Power actions (1.7.0):** restart, shut down, sign out, sleep and emptying the Recycle Bin need a completed press-and-hold, then a single-use, 10-second ticket issued by ASCS (a stray, repeated, mismatched or late request is rejected and logged). Shutdowns are never forced (1.8.0: ASCS counts down itself and runs `/t 0`, because Windows' own timer implies `/f`) and can be canceled, and `shutdown.exe` is run from the Windows folder by full path. None of these is reachable from a hotkey, a quick action or the palette. Verified with the real calls replaced by log lines.
- **Controllers and stability (1.7.0):** ASCS does not use DirectInput or the classic joystick API (winmm), which runs on it: in testing, DirectInput's device re-enumeration corrupted ASCS's memory when a controller connected or slept mid-scan, crashing ASCS. Controllers are read through XInput and the Raw Input device list only, and every new native call was checked with guard bytes for writes past its buffer.
- **Steam and controllers (1.7.0):** Steam's files are only read; games start only through `steam://rungameid/` with a numeric app id checked by ASCS. Renaming a controller writes one value, `OEMName`, under the current user's `Joystick\OEM\VID_xxxx&PID_yyyy` key (validated name, no administrator rights); ASCS never changes Bluetooth or device settings itself.
- **Games (1.7.0):** the emulators' files are only read, with sizes capped and every parser reading only expected fields. The page receives titles and play time, never file paths; it sends back only a game id, which ASCS validates and looks up in its own index, and launches use the configured emulator with the indexed path quoted (paths containing quotes are refused). Program paths in Preferences must be existing `.exe` files. Cover art is read from local folders only, checked to be a PNG or JPEG of at most 1.5 MB, and passed as a data URI; nothing is downloaded.
- **RetroAchievements images (1.7.0):** downloaded only from `media.retroachievements.org`, by an address ASCS builds from a validated number (never a URL from the response), with HTTPS, no redirects, a 256 KB cap and a PNG signature check, then cached on disk. The 20 MB cache cap deletes only files named like ASCS's own images (`b-<digits>.png`, `i-<digits>.png` and their partial writes).
- **RetroAchievements (1.7.0):** opt-in by creating `data\secrets.ini`, which git ignores. The user name and key are validated, read only when a request is made, never sent to the page and never logged (request addresses are not logged either). Only two fixed retroachievements.org API addresses are requested, with the same HTTPS rules as the almanac; responses are parsed in the page as text and numbers only, with no images or links taken from them.
- **Logs (1.7.0):** the page names one of three fixed sources and never supplies a path; only the file's tail is read, and lines are shown as text.
- **Calendar (1.8.0):** Radicale listens on 127.0.0.1 only (checked: not reachable from the LAN address), requires a password (a random 32-character one in `data\secrets.ini`; Radicale's user file keeps only a SHA-512 crypt hash), lets the account see only its own calendars, and has no web interface. It was installed with `--require-hashes --only-binary=:all: --no-deps` from a pinned list checked against PyPI. The page never talks to the server and never sees the password: it names an operation (list, read, save or delete events; create, edit or delete a calendar) with validated ids, and ASCS builds exactly one request for it (`CalDavRequest`, unit-tested), adds the password, and returns the reply. A new event can never overwrite another (`If-None-Match: *`), and an edit applies only to the version shown (`If-Match`). ASCS stops only server processes whose command line points at its own configuration. Verified end to end in an isolated copy with a throwaway store.
- **Quick Notes groups (1.8.0):** a note's group is plain text, shown as text. Every save is checked by ASCS (`CheckNoteGroups`): each `group` must be a string of up to 60 characters without control characters, or the save is refused and the previous file kept. Open and pinned groups live in the page's own storage, never in notes.json.
- **Sounds (1.8.0):** the page never names a file: ASCS indexes the sound library and sends a sound only by its index entry (the library may not be a drive root, the Windows folder or a profile folder). Sounds reach the page as base64 and play through Web Audio, so the Content Security Policy is unchanged. Leveled copies are checked to be WAV files, capped at 32 MB, and written only into `ASCS Leveled` under new names. Windows sounds are changed only for 19 allowlisted events in the current user's `AppEvents`, only to WAV files in the library, with the previous value and its type kept for **Restore**. Verified in an isolated copy against a test registry key. Deleting is limited to leveled copies, goes to the Recycle Bin, and is refused for a copy in use.
- The backend accepts bridge messages only from `https://ascs.localhost`, validates every message type and payload, cancels navigation to other origins, and blocks new windows.
- Release WebView settings disable DevTools, default context menus, browser accelerator keys, zoom, and **host objects**. WebViewToo would otherwise inject a `global` object into `*.localhost` pages that exposes every AutoHotkey function to page script.
- The frontend Content Security Policy allows only local scripts and resources (inline styles and data images allowed).
- Nothing in the bridge executes arbitrary commands. Custom commands run only entries saved in `data\commands.ini`, validated on save and load: an existing `.exe`/`.lnk` started without arguments, an existing folder opened in Explorer, or an `http(s)` URL opened in the default browser. The frontend refers to them by index only.
- Web searches are percent-encoded into the configured `https://` address. File-search queries have quotes and control characters removed before they are passed to Everything as one quoted argument.
- Note previews are built from text elements only; Markdown never becomes HTML, and links in notes are displayed but never opened. Quick action ids are validated against a strict pattern before they are stored, and they only ever select existing palette actions.
- Notes are pasted through the clipboard (restored afterwards), never typed as keystrokes; `{cursor}` then presses Left at most 2,000 times. Window focus requests are checked against the eligible-window rules used by workspaces.
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

The hotkey lives in a launcher rather than on the Start Menu shortcut because Windows 11 does not reliably honor shortcut hotkeys in the Start Menu. After changing code or frontend files, reload with the hotkey, the tray menu, or **Reload ASCS** in the palette.

## 11. Testing

### Automated

```powershell
pwsh -File C:\ASCS\tests\run-tests.ps1
```

- `tests\core.tests.ahk` covers `lib\ASCS.Core.ahk` (374 checks): unsaved-work titles and VS Code's backup folders before power actions, note group checks on save, Select › Delete request lists, passed countdowns, reminder pop-up text, which files count as leveled copies, the notification level board's requests, note placeholders at paste time, calendar files, calendar request building (every operation's method, path and headers, escaping, and what must be refused), ids, versions, colors and iCalendar checks, reminder lists, sound library rules (version folders, WAV lengths, library folders that must be refused, leveled file names, the Windows sound allowlist), Steam's binary app cache (a synthetic file built byte by byte, including a decoy and a truncated copy), RetroAchievements image addresses and the image cache cap, the emulators' record parsers (including binary game lists built in memory), Steam's manifests, library folders and play-time file, controller IDs, modes and names, executable paths, audio device matching, RetroAchievements credentials and game ids, the Claude quick-entry key combination grammar, countdown dates, the almanac payload, Wikipedia titles and feed addresses, shortcut-letter validation, quick action ids, drive lists, Explorer names, workspace names and executables, workspace relaunch commands, workspace window matching, custom-command validation and payload parsing, search templates and encoding, activity lines, and the JSON helpers.
- `tests\frontend.tests.html` covers `frontend\palette.js`, `keymap.js`, `notes.js`, `charts.js`, `almanac.js` (with `quotes.js`) `logs.js`, `games.js`, `sounds.js` and `calendar.js` (493 checks) in headless Edge, including note groups (sections, rename and merge, delete, palette matching) and US holiday dates. For the calendar: iCalendar reading (folding, escapes, all-day, UTC, floating and named time zones, including summer time), repeats (weekly days across the end of daylight saving, the 31st in short months, the 2nd Tuesday and last Friday, 29 February, counts, end dates, skipped dates, moved occurrences), reminders, writing that keeps a phone's own properties, and server replies. For sounds: WAV files built byte by byte in every supported format (8-, 16-, 24- and 32-bit, float, extensible, with extra chunks), levels against known values, gain plans with clipping limits, and gain applied in place. For the keymap, these include the Windows passthrough keys. For notes: tags, filter queries, Markdown structure, and hostile input (HTML and script markup must stay plain text). For charts: sparkline geometry, clamping, and bad data. For the palette: the calculator, query parsing, matching, ranking, usage history, and workspace-name rules. For the keymap: layout integrity (108 unique, non-overlapping keys of the customized Q6 Max, including the planned Code and macro keys), Super and Super + Shift bindings, Shift-layer precedence, Windows passthrough, and robustness with missing settings.

The tests never touch the running ASCS instance or the `data` folder. The runner exits with code 0 when everything passes and reports each failure by name.

### Manual

Hotkeys, WebView behavior, and window management need the real desktop. Each release is checked with a manual test pass; the results are recorded below. The 1.8.0 pass is `tests\manual-1.8.0.html` (now round 3: what failed or changed in round 2, and Quick Notes groups): open it in a browser, mark each item Pass or Fail with an optional note (progress is kept in the browser), and use **Copy results** for a plain-text list by ID. It can be reused as the starting point for the next release's pass.

## 12. Development Status

### Verified on the Target System

- Startup hidden, single instance, window chrome, and WebView restrictions (context menu, DevTools, zoom, reload).
- Super toggle and resume; command palette filtering, keyboard operation, and every built-in entry; quick actions.
- Configurable and fixed shortcuts; live rebinding; Terminal/Explorer/Vivaldi reuse and new-window behavior; missing-DLL reporting; focus-steal protection.
- The Explorer item-creation matrix; top-row and numpad (NumLock on/off) desktop switching; desktop moves; half and quadrant snapping; snap gap; maximize/restore/minimize.
- Quick Notes create/rename/filter/pin/type/copy/delete, persistence, hide/exit flush, backup recovery, and the 5 MB limit.
- CPU/RAM/drive cards, five-second refresh, no polling while hidden, hardware and disk-layout details; Preferences persistence and validation; the Super Commands reference.
- 1.5.1 responsiveness fixes (the window, palette, and hotkeys respond immediately), as reported by the user in daily use.

**1.8.0**, round 1 of the manual pass (61 items): 53 passed. C2 failed (a restart closed apps before any asked about unsaved work; fixed with the unsaved-work hold), and D10 to D16 couldn't be followed as written (rewritten for round 2). Notes from passing items were acted on: the sidebar footer, multi-day bar ends, countdown style and color, removal of passed countdowns, the start moving the end, text centering in events, a 1-minute reminder and a fuller reminder pop-up, deleting leveled copies, Restore all, and camelCase ask fields. Round 2 (22 items) covers these; dragging events and wheel-edited times moved to 1.9.0. Round 2: 18 of 21 passed (among them C1, the hold with VS Code; D6, Match all and Restore all checked in Windows' Sound settings; D9, Delete; and E5, the reminder pop-up and its click on RetroBar). D5 failed (a second Match did nothing: the library refresh had let go of the In use sounds), E2 failed (times still sat high: Segoe UI's line box), and E4 asked for a visual indicator. C2 found that VS Code marks only its active tab. All are fixed, and round 2's notes were acted on (the hold message, your own sound folders as buttons, US holidays, Select). Round 3 covers these and Quick Notes groups: 15 of 16 passed. E2 (where it lands) showed no indicator, most likely on an all-day event, for which the strip was hidden; it now covers all-day and multi-day events too. The request behind E4 and E2 was in fact an indicator while dragging an event to a new time, so moving events by drag (planned for 1.9.0) was brought into 1.8.0. Its three items (dragging, cancel and click, repeating events) and the all-day strip then passed, completing the pass: every 1.8.0 item has passed on the target system.

**1.7.0** (the manual pass in `tests\manual-1.7.0.html`, every item passed; the three failures found along the way (A3, B3, F9) were fixed and retested):

- The window: its default size on the 3440 × 1440 display, the Command Center and Quick Notes fitting without scrolling, reopening at full size after being minimized (fixed during the pass), the reload hotkey (Ctrl + Alt + Shift + A, starting a stopped ASCS and reloading a running one), no page errors, and no crashes over the whole pass.
- The indigo and gold theme, the sidebar, page headers lining up on every view (the Quick Notes header fixed during the pass), the Preferences tabs, and the thumb wheel on tab rows.
- The almanac (strip, rotation, Wikipedia on and off), countdowns, and quick actions.
- The System bar: the click and hold groups, the audio picker, Lock, Restart and Sign out canceled, the game-running warning, the Recycle Bin, and Sleep.
- Ask Claude and its shortcut validation, Super + Shift + S (save workspace as), recent games and games in the palette, and the vacant Super + Shift + macro keys.
- The Games tab: every source, uninstalled Steam games and Install, covers, the shelf, details, Play on every emulator and Steam, and Now playing (cover backdrop, session timer across window focus changes (fixed during the pass), achievements, Show file, last played).
- Controllers: one entry per controller (including the 2.4 GHz receiver), Identify, the X-input tester, the D-input and Switch-mode tester, two controllers at once, Rename in ASCS and Windows, the Bluetooth rename dialog, and a long session with the controller sleeping and waking.
- RetroAchievements with a real key: the secrets file, progress and unlocks, images and their cache (including the 20 MB cap), the profile link, and a rejected key.
- The PSO session: headphones, Discord, the voice channel (opened with Discord's Join Voice button), the launcher, and audio restored when the game or launcher closes.
- The keyboard map (macro keys, running dots, detail line, key colors), Logs (sources, filters, live), and the Games & apps preferences.

### Verified Automatically (1.7.0)

- Unit tests: 764 checks across the core library, palette, keyboard map, notes, charts, almanac, logs, and games (`tests\run-tests.ps1`).
- Isolated end-to-end runs, each in a copy of ASCS with its own data folder and the Super key remapped:
  - the Wikipedia almanac's real download, caching, and the cache deleted when it is turned off;
  - log tails (including a 3,000-line file), unknown log sources rejected;
  - the game library on the target PC's records: 167 installed games plus 247 uninstalled Steam games with play time, built in about 0.4 s, rebuilt in about 30 ms, with cover art for 87 emulator games and every Steam game sampled;
  - cover art and RetroAchievements images (real downloads, PNG checks, the on-disk cache, 404s and malformed names rejected; the 20 MB cap on a real folder, removing the oldest images and a leftover partial write while leaving other files alone);
  - controllers: 3,000 listing polls and 2,000 tester polls with DirectInput never loaded; every native call added in 1.7.0 checked with guard bytes for overruns (Raw Input and the HID parser against all twelve HID interfaces present);
  - power actions, with the real shutdown, sleep, sign-out and Recycle Bin calls replaced by log lines: missing, mismatched, reused, expired and unknown tickets rejected; Cancel stops a restart even during the notes save (a bug this caught).
- Four crash dumps from the target PC analyzed (heap corruption in DirectInput's device enumeration), leading to the removal of DirectInput.
- Headless Edge renders of every view with sample data; the Command Center and Quick Notes measured to fit without scrolling at the new default window size.

### Verified Automatically (1.8.0)

- Unit tests: 867 checks (374 core, 493 frontend).
- Dragging, simulated with pointer events in headless Edge: a 2-hour event dragged from Thursday 2 PM to Friday showed the outline "Fri 4:30 PM – 6:30 PM" in Friday's column, the drop saved Friday 16:30–18:30, and the click that ended the drag didn't open the editor.
- Quick Notes list with 500 generated notes in 12 groups: a full re-render takes about 4.6 ms in headless Edge (well within a frame).
- Select › Delete in an isolated copy (deleting replaced by plain file removal, on a throwaway library): a free copy deleted; one in use and one not in the library skipped with their reasons; a request including an original refused whole, leaving every file.
- The unsaved-work hold, in an isolated copy with shutdown, sleep and the Recycle Bin replaced by log lines and a stand-in window titled `*draft.txt - TestPad`: the arm warning names it; a restart is held and goes ahead within 2 seconds of the window closing; **Shut down anyway** proceeds; Cancel while held runs nothing; Sleep is never held.
- Headless Edge renders of the Calendar (pointed bar ends, centered text, countdown pills) and the sidebar footer.

### Carried Over from 1.6.0 (Pending Manual Verification)

- Quick capture from an editor and a terminal, including clipboard fallback and clipboard restoration (capture from a browser passed in 1.7.0).
- Note paste into a terminal, and Shift+Enter copy (paste into a text field passed in 1.7.0).
- Palette: notes/windows/workspaces in results, window switching, web search, Everything search, calculator copy, recent-command ordering, and Backspace leaving a mode.
- Named workspaces: save from the palette and Preferences, restore, delete, and Super + Shift + R.
- Custom commands: the Browse… pickers, `.lnk` targets, folder and link commands, and conflict messages (a command with a Super letter passed in 1.7.0).
- Activity feed updates and relative times; the tray menu, including Reload/Exit note flushing.
- The three-accent theme on the target display: burgundy bars, gold at 90% or more, the Dashboard volume meters, and gold pinned notes.
- Super + C/D/F/P passthrough when unassigned (Super + Shift + C, P and S passed in 1.7.0).
- The keyboard map (both layers, the Shift-hold preview, hover and focus details) and the new title bar (command bar, status pill, clock, and the maximize/restore glyph).
- The burgundy theme across all views at the target window sizes.
- 1.5.1 items not yet confirmed individually: the missing-desktop tooltip, the workspace restore reuse matrix, the delete-note dialog, notes reload after an outside change, and the Preferences reset after a rejected save.
- Carried over: mixed-DPI and multi-monitor layouts; network-drive offline behavior and probe timeout; additional Windows builds, DLL versions, and Terminal configurations; hardware inventory on other machines; untrusted-origin rejection (requires a deliberately modified page).

## 13. Known Limitations

- Steam: uninstalled games are listed only if Steam's app cache has their name (13 of 260 here have none), and Steam achievements aren't shown.
- Controllers: two identical controllers share a name, because Windows names controllers by model; battery isn't reported through a 2.4 GHz receiver or in D-input and Switch modes; renaming the Bluetooth device needs administrator rights, so ASCS opens Devices and Printers for it.
- RetroAchievements needs a user name and Web API key in `data\secrets.ini`.
- The almanac's location is fixed to New York City.
- The PSO session switches audio through SoundSwitch's hotkey, so the headphones must be in SoundSwitch's playback list.
- The PSO voice channel is opened with Discord's own `discord://` link (rebuilt from the channel link's two numbers; nothing else is accepted). Discord shows the channel with its **Join Voice** button (verified on the target PC) rather than joining by itself; ASCS never uses a Discord account token or automates clicks to join.
- Power actions count down inside ASCS; if ASCS closes during the countdown, they don't happen. Unsaved work is recognized only by a mark at the start of a window's title (`*`, `●`, `•`); an app that doesn't mark its title isn't held for.
- Workspace restore launches applications without arguments (except Explorer folders and Terminal) and captures up to 24 windows on the current desktop. Windows of one application whose titles have changed are matched in enumeration order, so two such windows can swap positions.
- The window switcher lists windows on the current virtual desktop only.
- Quick capture copies with Ctrl+C. Applications that use another copy shortcut (for example, some terminals without a selection) fall back to the clipboard text.
- Note paste uses Ctrl+V in the previous window. If that window cannot be refocused within one second, the note is left on the clipboard instead. `{cursor}` counts characters, so in an editor that auto-indents or converts line endings it can land slightly off.
- Custom applications cannot take command-line arguments; create a `.lnk` shortcut with the arguments instead.
- Everything must be installed for Super + F and file search.
- Desktop switching and cross-desktop focus require `VirtualDesktopAccessor.dll`; monitor frame calculations depend on Windows DPI behavior.
- Metrics depend on Windows APIs, WMI, and drive reporting; drive probes time out after eight seconds and are cached for 30 seconds.
- The diagnostic log rotates at 1 MiB to one backup; the activity feed keeps the newest 50 entries.

## 14. Development Roadmap

**1.9.0** (planned after 1.8.0 is cut):

- **Split the large files first:** `ASCS.ahk` (about 7,300 lines) and `styles.css` (about 11,300) into per-feature modules, with no change in behavior, before anything is added.
- **A console hub:** Luma3DS (3DS), hekate and Atmosphère (Switch, booted through an RCM jig, so pushing payloads matters) and Aroma (Wii U).
- **The achievement browser and Workspaces** (below), reusing the 1.8.0 window scan from the unsaved-work hold.
- **Moving `C:\Scripts` into ASCS,** with its own migration and rollback plan, since it touches the sign-in tasks.
- **iPhone calendar sync:** designed in 1.8.0 and not yet built: a second Radicale process on the home network over HTTPS with a private certificate authority, a firewall rule for the LAN only, and a DHCP reservation.
- **From the 1.8.0 pass:** resizing events by dragging their edge and dragging between days in Month (moving by drag shipped in 1.8.0), and a time picker whose hour, minute and AM/PM change with the mouse wheel.

Earlier ideas, still open:

- **Workspaces tab and routines:** a dedicated Workspaces view and multi-step routines.
- **Achievement browser:** click a game to see all its achievements (earned and locked, with dates and points), filter for missable ones, page through more than six recent unlocks, and a "Next up" card for the game being played.
- **Workspaces across desktops:** save and restore windows on all virtual desktops, and assign workspaces to desktops.
- **Per-application rules:** default snap position or desktop for an application when it launches.
- **Palette actions on results:** open a custom command's folder, rename or delete a note, overwrite a workspace.
- **Notes export:** Markdown export of notes.
- **A settings backup:** export or import preferences, commands, notes, and workspaces as a single file.
- **Broader automated coverage:** a scripted WebView smoke test on the target machine, run before each release.
