# Aeolionware Maestro

**Brand:** AEOLIONWARE MAESTRO (code name ASCS: the repo, folders and file names keep it)  
**Version:** 2.1.0  
**Platform:** Windows 10/11 (Windows 11 target verification)  
**Status:** 2.1.0 is complete: Maestro backs up its data every day and can put a backup back, and deleted notes go to a trash. Of the 18 manual items that can be done before a release, 17 passed and the other is answered; the 8 that need the released build are open (§12). Next is 2.1.1, then 2.2.0 (§14). Release history is in [CHANGELOG.md](CHANGELOG.md).

Maestro is a keyboard-driven Windows utility suite. It uses AutoHotkey v2 for hotkeys and Windows automation, WebView2 for its graphical interface, and a web frontend built with HTML, CSS, and JavaScript.

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

Maestro centralizes application launching, system controls, productivity utilities, file search, and system monitoring behind the dedicated Super key, mapped to F24 by Keychron Launcher.

The application has seven views, grouped in the sidebar as Workspace, System and Reference, and a command palette:

1. **Command Center:** the almanac, live metrics, quick actions, and recent activity
2. **Quick Notes:** notes and reusable text, in Text or Code style, with placeholders
3. **Games:** play time, continue playing, the library, controllers, and RetroAchievements
4. **System:** live readings and drives, hardware, sign-in times, recent activity and logs
5. **Commands:** the keyboard map with every shortcut, custom commands, the palette's settings and quick actions
6. **Preferences:** what belongs to the whole app: text size, the logo's swing, window snapping, and the power delay
7. **Command Palette** (Super + Space): one search box for commands, notes, arrangements, windows, math, files, events, and the web

## 2. Architecture

### Technology and Responsibilities

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Keyboard input | Keychron Launcher | Maps the physical Super key to F24; Maestro presents it as Super |
| Automation | AutoHotkey v2 (64-bit) | Handles shortcuts, Windows commands, persistence, and system queries (`ASCS.ahk`) |
| Core logic | AutoHotkey v2 | Pure, testable validators and algorithms (`lib\ASCS.Core.ahk`) |
| Web interface | Microsoft Edge WebView2 | Hosts the embedded frontend |
| Presentation | HTML and CSS | Defines interface structure and styling |
| Interaction | JavaScript | Navigation, input, and messaging (`app.js`); palette matching and calculator (`palette.js`) |
| File search | Voidtools Everything | Opens the user's indexed file search, optionally with a query |
| Persistent data | Local files under `data` | Notes, preferences, custom commands, arrangements, activity, logs, and WebView2 profile data |

AutoHotkey remains responsible for command execution and Windows integration. The frontend is a presentation and interaction layer, not a general-purpose command executor. It can only request operations from the allowlist in [section 7](#7-frontend-and-backend-communication).

### Startup and Page Loading

The AutoHotkey script creates a `WebViewGui`, enables WebView messaging, registers message and navigation handlers, maps the `frontend` directory to the `ascs.localhost` virtual host, and navigates to `https://ascs.localhost/index.html`. It replaces the tray menu with the Maestro menu and starts hidden. On the frontend's `Ready` message, it sends the initial view, notes, preferences, custom commands, arrangements, and activity.

The window opens at up to 1920 × 1080 pixels, centered and constrained to the primary display's work area. Its native title bar is disabled while the taskbar button is retained; the custom title bar provides the Maestro mark, a draggable surface, and minimize, maximize/restore, and hide controls. The Command Center uses a compact layout at shorter heights to avoid scrolling on open.

Nothing slow runs on the hotkey or message path. CPU and RAM readings take under a millisecond, metric pushes are coalesced onto timers, drive probes run in a separate process, and the one-time hardware inventory runs after the live metrics are displayed.

## 3. Visual Identity

### Aeolionware Obsidian

The frontend uses a premium desktop-oriented dark theme with balanced spacing, restrained gradients, and rounded layered panels. It uses three accents: deep indigo (primary, anchored on `#2B0071`), burgundy (secondary), and gold (tertiary). Metallic gold is reserved as the Maestro signature. Typography uses Segoe UI. Inline SVG provides interface graphics, and a custom ICO supplies the window, tray, and favicon icon.

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
| Indigo | Interaction | Large surfaces use the deep anchor `#2B0071` (active navigation, primary buttons, palette selection, Apps keys on the keyboard map); anything that must be legible uses lighter tints of the same hue (accent text `#A892FB`, the indigo halo inside the white focus ring, links and strokes `#8B6FF5`, light text `#C7B8FD`). The anchor alone is too dark for text on this background. |
| Metallic gold | The Maestro signature | Exactly four places: the brand mark's edge, the Super keycap on the keyboard map, the rule above the Command Center date, and the palette title (in champagne gold) |
| Burgundy | Resources and saved items | Every usage bar (CPU and RAM on the Command Center, drives, and the per-volume fullness bars on System); pasteable notes, arrangements, captured notes, favorites; heading punctuation and eyebrow lines; the palette mode chip; destructive actions (Delete buttons and confirmation dialogs) |
| Gold (flat) | Distinction and attention | Any resource at **90% or more** (its bar turns gold); pinned notes; the palette's Recent group, calculator results, and custom commands; “NEW” badges; custom-command activity; content icons on the Command Center cards and quick actions (navigation icons stay indigo) |

The layout adapts to narrower WebView windows, provides visible keyboard focus, and honors reduced-motion preferences. On wide and ultrawide displays, the application uses a wider canvas and a larger type scale.

## 4. Application Structure

```text
C:\ASCS\
├── ASCS.ahk                  Main script: globals, WebView, navigation and the message allowlist; includes each feature from lib\features
├── ASCS.DriveProbe.ahk       Isolated per-drive metrics worker
├── ASCS.HardwareProbe.ahk    Isolated hardware inventory worker (2.0.0)
├── ASCS.Launcher.ahk         Resident Ctrl+Alt+Shift+A helper: starts or reloads Maestro
├── README.md
├── CHANGELOG.md
├── frontend\
│   ├── assets\ascs.ico
│   ├── index.html
│   ├── styles\               The stylesheet, in cascade order: 01-foundation.css … 40-2.1.0-notes-trash.css; later files build on earlier ones
│   ├── palette.js            Pure palette logic (matching, ranking, calculator)
│   ├── notes.js              Pure Quick Notes logic (#tags, filter queries, safe Markdown parser)
│   ├── charts.js             Pure graph geometry for System
│   ├── almanac.js            Pure almanac logic (moon, sunrise/sunset, feed parsing, countdowns, rotation)
│   ├── quotes.js             Quote of the day: public-domain quotations with sources
│   ├── composers.js          Composers born on each day, for the almanac's Born Today (2.0.0)
│   ├── homemodules.js        The Command Center's added modules: Weather, Top Apps, Network, Audio, Controllers, Pinned Notes, Recent Unlocks, Timer (2.0.0)
│   ├── backups.js            What Preferences and the attention list say about the daily backup (2.1.0)
│   ├── logs.js               Pure log parsing for Logs (formats, levels, filters, day groups)
│   ├── games.js              Pure Games logic (durations, sorting, titles, window titles, RetroAchievements parsing)
│   ├── sounds.js             Pure Sounds logic (WAV reading and writing, RMS/peak levels, gain plans, search)
│   ├── calendar.js           Pure Calendar logic (iCalendar, time zones, repeats, reminders, week layout)
│   ├── workspaces.js         Pure Workspaces logic: cleaned windows, desktops, screens, places, the edit message, dragging
│   ├── workspacesview.js     The Workspaces view: Saved Arrangements, the canvas, Selected Window, launch rules
│   ├── awardsview.js         The site badges in Games
│   ├── gamenotes.js          Per-game notes: the box, timestamps and the palette entry
│   ├── keymap.js             Keyboard-map layout (customized Q6 Max) and Super / Super+Shift bindings
│   ├── app.js
│   ├── soundsview.js         The Sounds view
│   └── calendarview.js       The Calendar view
├── lib\
│   ├── ASCS.Core.ahk         Pure helpers shared by ASCS.ahk and the tests
│   ├── features\                One file per feature, included by ASCS.ahk where each section was: SuperKey, Launcher, Notes, Dashboard, ActivityLog, Tray, ActivityFeed, Almanac, Logs, Games, Sounds, Calendar, Power, Workspaces, Rules, Notices, Commands, QuickCapture, PaletteWindows, QuickActions, Backups
│   └── VirtualDesktopAccessor.dll   (optional; desktop switching and cross-desktop focus)
├── tests\
│   ├── run-tests.ps1         Runs the three suites
│   ├── smoke.js              The smoke test: the real page with a stand-in for WebView2
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
│   ├── cli\                  The maestro command: status, check, try, backup-data, restore-data, cut-release
│   └── Install-Shortcut.ps1  Start Menu shortcut with the Ctrl+Alt+Shift+A hotkey (optional Startup entry)
├── webview\                  WebViewToo and WebView2 wrappers (vendored)
└── data\                     Created at runtime
    ├── notes.json (+ .bak)
    ├── settings.ini
    ├── commands.ini
    ├── workspace.ini         Default arrangement (Super+S / Super+R)
    ├── workspaces\*.ini      Named arrangements
    ├── rules.ini             Launch rules
    ├── activity.log
    ├── almanac\              Today's Wikipedia feeds (only while the Wikipedia almanac is on)
    ├── ra-images\            RetroAchievements badges, game icons and your picture (capped at 20 MB)
    ├── ASCS_Log.txt
    └── WebView2\
```

| File | Purpose |
| --- | --- |
| `data/notes.json` | Version 2 Quick Notes collection; `.bak` holds the previous save |
| `data/notes-history/` | One copy of `notes.json` a day, from before that day's first save; the newest 14 are kept |
| `data/settings.ini` | Drives, window preferences, shortcut letters, the web search address (`[Palette] SearchUrl`), and pinned quick actions (`[QuickActions]`, once customized) |
| `data/commands.ini` | Custom palette commands (name, kind, target, optional key) |
| `data/workspace.ini`, `data/workspaces/` | Saved window layouts |
| `data/rules.ini` | Launch rules: each app's path and where its first window goes |
| `data/activity.log` | Activity feed entries (tab-separated; compacted to the newest 50) |
| `data/secrets.ini` | Optional, created by **Open secrets file**: the RetroAchievements user name and Web API key. Never committed (`data/` is ignored by git), never sent to the page or logged |
| `data/almanac/` | Today's two Wikipedia feeds, cached; older days are deleted, and turning the Wikipedia almanac off deletes them all |
| `data/ASCS_Log.txt` | Diagnostic log, rotated at 1 MiB |
| `data/WebView2/` | WebView2 profile, including the palette's usage ranking in local storage |

WebViewToo is maintained separately from Maestro application code.

## 5. Interfaces

### Command Center

Tapping Super shows Maestro on the view that was last open during the session, or hides Maestro when it is already active. The first view after startup is the Command Center. The navigation sidebar collapses to an 84 px icon rail with the round handle on its edge (it appears on hover) or the palette's **Toggle sidebar**; the choice is remembered. The navigation icons stay at exactly the same height in both states: collapsed, the brand block keeps its size and shows a 56 px mark (centered where the 76 px mark was), a short Maestro wordmark, and a gold hairline in place of the section label.

Maestro opens at 2540 × 1360 (capped to the screen's work area), so the Command Center fits without scrolling at the default text size, even with every module full. *(2.0.0)* It's a grid three squares wide and three high, of modules that are each one glance or one action, with its title and a button to its page at the top. Every module is one square high and one to three squares wide; the three rows share the window evenly, so what a module holds, or when it arrives, never moves the others. Each module fits its contents to its width: Now Playing takes a smaller cover in one square, System puts its readings in two columns in two or three, Continue Playing shows three games per square (up to nine), and Quick Actions and Arrangements, one module with two parts, stacks them in one square and puts them side by side in two or three. A list longer than its square (drives past the third, say) scrolls inside it.

- **Now Playing:** the game running, its session timer and total time, and **Add note**, **Add timestamp** and **Show file** (or **Open folder**). With nothing running, the last game played, with **Play**. Achievement progress and **Achievements** appear once the Games page has loaded them: this page never asks RetroAchievements for anything itself. What's running is checked every 3 seconds, only while this page is open and the window is showing.
- **Today:** the moon, sunrise and sunset with the hours of daylight, your nearest **countdown** (hover it for the rest), the day of the year, the week, the season and how far through it is, with the next solstice or equinox; the moon's next full or new moon; daylight against yesterday; and one rotating line: on this day in history, an observance, Wikipedia's featured article, the quote of the day, a composer born today, golden hour and blue hour, moonrise and moonset, or a meteor shower that's active, cut at three lines with the whole of it in the tooltip, so a long entry never makes the page scroll. It rotates every 20 seconds while the Command Center is showing, pausing while the pointer or keyboard focus is on it, and moves on when the page is opened again; **‹ ›** step back and forward, with items sliding in from the direction of travel (a plain fade when Windows' reduced-motion setting is on). Moon, sun, quote and countdowns are calculated on this PC with no network access. The Wikipedia items appear only when the **Wikipedia almanac** is turned on, in **Today's Settings** (the Today module's **Settings** button; it is off by default); clicking one opens the article on en.wikipedia.org.
- **Next Up:** what's left today and coming in the next two weeks, up to five, with **New event**. Events a week or more away show their date, not a weekday.
- **System:** the processor, memory and each configured drive (defaults `C:` and `J:`), gold at 90% or more.
- **Quick Actions and Arrangements:** buttons, up to six each. Clicking an arrangement restores it. **Edit** opens Commands › Quick Actions.
- **Continue Playing:** your most recent games, three for each square of its width. Clicking one starts it. A cover is cropped to the tile around its middle; a PS2 cover, which PCSX2 draws as the case at an angle, is centered on its front art.
- **Quick Note:** write something and press Enter to save it as a note (Shift + Enter for a new line), above your two most recently changed notes.

**Arrange**, in the title bar on this page, turns the modules into tiles *(2.0.0)*. Drag one by its tile to move it (the others slide aside; Esc puts it back), drag its right edge or choose **1**, **2** or **3** to set its width, and **Hide** it. While arranging, a dock slides in from the right and lies on the sidebar as a raised, rounded card, with the sidebar dimmed and out of reach beneath it, so it covers no module and keeps one shape: how the layout fits, the hidden modules as a list (**+** shows one), **Reset** and **Done**. A collapsed sidebar opens for it and closes again after. Esc or leaving the page also finishes. From the keyboard, Tab goes from grip to grip: the arrow keys move the tile, **1**, **2** or **3** set its width (as does Shift + Left or Right), and Delete hides it. **Hide** and the width buttons are for the mouse, so they're not Tab stops. Modules keep the order you set, so one too wide for what's left of a row starts the next. Maestro keeps the arrangement on this PC. **Recent Activity** is on the System page.

**Added modules** *(2.0.0)*, hidden until Arrange shows them; each asks for what it needs only while it shows:

- **Weather:** the temperature, the conditions, how it feels, wind and humidity, and today and the next two days with the chance of rain, from Open-Meteo (see Security). On by default, and off in **Today's Settings**.
- **Top Apps:** the three apps using the most processor and the three using the most memory, every 3 seconds, each app's processes counted together, with **Task Manager**.
- **Network:** download and upload speed on the adapter that's up, every 3 seconds.
- **Audio:** the audio output, switched as in the power tray, and **Mute or unmute**.
- **Controllers:** those Games reads, with battery or connection.
- **Pinned Notes:** your pinned notes; clicking one opens it.
- **Recent Unlocks:** your latest RetroAchievements unlocks, once Games has loaded them (this page asks RetroAchievements for nothing).
- **Timer:** a timer of 1, 5, 10 or 25 minutes, whose end Maestro announces with a toast and a sound even while the window is hidden (Sounds › Use as › When a timer ends; until then Windows' notification sound), and a stopwatch.

**Today's Settings**, the **Settings** button on the Today module *(2.0.0; was in Arrange)*, holds the Wikipedia almanac, the weather and the location.

**Quick Actions** are up to six pinned items: any Maestro view, app or action, custom command, saved arrangement, or note (to open it, or to paste it). They're edited under Commands › Quick Actions, and saved in `settings.ini`. Until you customize them, the defaults are Terminal, File Explorer, Quick Notes, Task Manager, and Calculator. Running a quick action goes through exactly the same paths as the palette.

The **power tray** opens from **Power** at the bottom of the sidebar, on every view, and closes with Esc or a click elsewhere; it reads the Recycle Bin and audio devices only while open. At the top, acting at once: **Lock**, and the audio output (showing the current device; click for a list of active playback devices, right under it, switched through SoundSwitch with the result checked). *(2.0.0)* Outputs are named by what they are, then which one: **Monitor Speaker (LG ULTRAGEAR)**, **Headphones (SteelSeries Arctis Nova 5)**, using the kind Windows reports for each. Other kinds that report as speakers read **Speakers (…)**, and anything else keeps Windows' name. Games › Setup and the activity log use the same names. Below them, **HOLD**, framed in gold with a ring symbol, holds the guarded actions: **Recycle Bin** (with its item count and size), **Sleep**, **Restart**, **Shut down** and **Sign out**. Press and hold for 1.5 seconds (pointer, Space or Enter; a gold fill shows progress, and letting go cancels). *(2.0.0)* While the tray is open, holding its letter does the same: **S** Shut down, **Z** Sleep, **O** Sign out, **B** Recycle Bin, **R** Restart, each shown on a key cap and, where the letter is in the name, underlined. A tap does nothing. If a second key goes down, of any kind, the hold stops, the tray says so, and nothing is accepted until every key is up; a key already down when the tray opened doesn't count, nor does a letter with Ctrl, Alt, Shift or Win. Leaving the window or closing the tray stops a hold. Letters go through the same hold, ticket and warnings as the buttons. A completed hold asks Maestro to arm the action; Maestro replies with a single-use ticket valid for 10 seconds and any warnings (a game, PSO or a Steam game running, which then need a second hold), and only a request carrying that ticket runs. Then Maestro counts down for the delay set in Preferences › Power (**none**, **5 seconds** by default, or **30 seconds**), with a banner on every tab and **Cancel**, and runs the action. Restart and Shut down run `shutdown /r` or `/s` with `/t 0` and never `/f`. (Windows' own timer is not used: any `/t` above 0 implies `/f`.) Windows asks apps to close one at a time, so an app with unsaved work only gets to ask after others (RetroBar, for example) have already closed, and some (Windows 11 Notepad, VS Code) don't ask at all. So before Restart, Shut down or Sign out, Maestro looks at the open windows' titles for an unsaved mark (a leading `*`, `●` or `•`): the arm warning names those apps, and when the countdown ends Maestro holds instead of starting, with the banner "Restart held: save your work in …", **Restart anyway** and **Cancel**. It looks again every 2 seconds and goes ahead once they're saved or closed. Sleep is never held. VS Code marks only its active tab in the title, so Maestro also counts VS Code's own backups of unsaved files (`%APPDATA%\Code\Backups`, written while a file has unsaved changes and deleted on save) made since the running VS Code started, reading only their names and dates. Notes are saved first, every step is logged, and none of these is on a hotkey, a quick action or the palette.

**Maestro sounds:** **Maestro sounds**, in the Sounds page's bar *(2.0.0; was in Preferences)*, plays Windows XP's logon and logoff sounds from the sound library (or whatever Sounds › In Use sets for them; the hand-leveled copies in `Aeolionware Startup` are retired) either **when Maestro shows and hides** (the default; only when the window really appears or disappears), **when Maestro starts and exits** (Exit in the tray menu waits for the sound to finish), or **off**. They never play at Windows sign-in (Maestro starting within two minutes of sign-in, measured from Windows' shell host) or at shutdown.

**Recent Activity** On System, under Activity and Logs: the latest 50 events, newest first, with relative times: launches, custom commands, captures, pasted notes, arrangement saves/restores/deletions, palette searches, created Explorer items, and problems. Activity persists across restarts in `data\activity.log`.

Drive status and capacity probes run in a separate process, can run concurrently, time out after eight seconds, and are cached for 30 seconds. Cards refresh as soon as a probe completes.

### Command Palette

Super + Space opens the **Command Palette** over the current view, from anywhere (its foot says so); inside Maestro, **/** opens it too, which the title bar's search box shows on its key. Type to search; ↑/↓ select, Enter runs, and Esc closes.

| What you type or choose | What you get |
| --- | --- |
| Nothing | Your five most recent commands, then all commands |
| Any text | Ranked results from Maestro views, apps and actions, custom commands, arrangements, notes, and open windows on this desktop. On a note, **Enter** opens it, **Alt + Enter** pastes it into the window you were using, and **Shift + Enter** copies it. The list ends with **Search files for…** (opens Everything with the query) and **Search the web for…** |
| Math, such as `18*1.2`, `12.5 x 1.08` or `sqrt(2)`, or text starting with `=` | The answer, large, as you type; Enter copies it, through Maestro, so it works whether or not the window has the focus. Supports `+ − × ÷ ^`, `x` or `X` for times, `%` after a value for a percent (`80 * 15%` is 12), `mod` for the remainder, parentheses, `sqrt abs round floor ceil ln log sin cos tan`, `pi` and `e`; decimals, thousands commas and a `$` are fine. Math that can't be worked out yet says why, such as an unclosed parenthesis or a word it doesn't know |
| Text starting with `?` | A web search, using the address in Commands › Palette (DuckDuckGo by default) |
| **Paste a note…** / Super + Shift + P | Every note: Enter pastes into the window you were using (asking for any `{ask:…}` fields first); Shift + Enter copies |
| **Restore an arrangement…** / Super + Shift + R | Arrangements mode |
| **Save arrangement as…** | Type a name; Enter saves the current layout under that name |
| **Switch to window…** | Windows mode: jump to any open window on this desktop |

On a note, Enter opens it in Quick Notes and Shift + Enter copies its text. In a mode, the mode's name appears as a chip in the search box; Backspace in an empty search returns to all commands.

Matching ranks prefixes, word starts, and initials (`wt` finds Windows Terminal), and accepts letters in order within a title (`tmgr` finds Task Manager). Descriptions and keywords must contain the typed text. Commands you use often or recently rank higher; this ranking is stored in the WebView profile.

### Quick Notes

Quick Notes (Super + Q by default) supports multiple notes, title editing, filtering, pinning, and deletion to a trash. Notes and snippets are one: every note can be pasted or copied from the palette (Super + Shift + P lists them all to paste), and each note has a style. **Text** is formatted in the Markdown viewer and spell-checked in the text editor; **Code** is monospace, with neither. Snippets from earlier versions became Code notes. **Copy** in the footer copies the text exactly as written.

**Placeholders** are filled in when a note is pasted or copied from the palette:

| Placeholder | Becomes |
|---|---|
| `{date}`, `{isodate}`, `{weekday}` | Nov 4, 2026 · 2026-11-04 · Wednesday; add a day offset such as `{date+7}` or `{isodate-1}` |
| `{time}`, `{time24}`, `{month}`, `{year}` | 3:05 PM · 15:05 · November · 2026 |
| `{ask:name}`, `{ask:clientName=default}` | Asked for in the palette before pasting, one at a time with a live preview; the same name is asked once. Names are camelCase and shown as words ("Client name") |
| `{clipboard}` | The text on the clipboard |
| `{cursor}` | Where the cursor ends up after pasting (if within 2,000 characters of the end) |
| `{uuid}` | A new random identifier |

Anything else in braces is left as written. **{ } Placeholders** in the editor opens a menu of them all, each with a live example (today's date, the time): click one to insert it at the cursor, with the part to change (a name, a number of days) selected, ready to type over. The switch at the bottom of the menu, **Fill in when pasting**, turns filling on or off for the note: on for Text notes and off for Code notes unless you change it, so code that happens to contain `{date}` pastes exactly; inserting a placeholder from the menu turns it on. Placeholders can't run anything or read files; `{clipboard}` and `{cursor}` are handled by Maestro at paste time, everything else by the page. **Spell-check**, a switch at the foot of a note *(2.0.0; was in Preferences)*, is on by default, and never applies to Code notes.

**Groups**: the **Group** field beside the style picker puts a note in a group (it suggests the groups in use and accepts a new name; empty means Ungrouped). The list shows pinned notes first, then the groups (pinned groups first, each set A to Z), then Ungrouped. Each group's header opens or closes it and shows its count; its **⋯** menu can **Pin group**, **Rename…** (in place; a name another group already has merges the two, after asking) and **Delete group…** (its notes move to Ungrouped; notes are never deleted). Which groups are open or pinned is kept on this PC, not in notes.json. A filter or #tag shows every group with a match open, and opening a note from the palette opens its group. In the palette a grouped note reads **Group › Title**, so "cl bug" finds Claude › Bug. Group names are up to 60 characters without control characters, compared without regard to case; Maestro refuses a save that breaks this and keeps the previous file.

**#tags:** write `#tags` anywhere in a note. Tags cut across groups. The most used tags appear as chips above the list; click one (or type `#tag` in the filter) to show only notes with that tag. Plain words and tags combine in the filter.

**Finding text** *(2.0.0)*: Ctrl + F on Quick Notes goes to the filter, which searches every note's title, text and group. Its words are also marked in the open note, in gold, with a count beside the filter ("2 of 9", or "Not in this note"). **Enter** goes to the next match and **Shift + Enter** to the one before, scrolling the note while the focus stays in the filter; **Esc** clears it. Words match anywhere, ignoring case, so "the" also marks "then". Both modes are marked: the viewer through the browser's highlight feature, which leaves the note's page as it is (task boxes and links keep working), and the editor through a copy of its text laid out behind the text box, transparent but for the marks. Up to 1,000 matches are marked.

*(2.0.0)* The page fits the window: the list of notes on the left, with **New note** in its heading, and the open note beside it, headed by its title. Long lists and long notes scroll inside their module. The footer says when the note was updated and whether it's saved, with the word count and **Copy**.

**Markdown viewer and text editor** *(2.0.0; was Preview)*: a note opens in the **Markdown viewer**, formatted, with lines kept to a readable length. It reads most of GitHub's Markdown: headings to six levels (and text underlined with `===` or `---`), bold and italic with `*` or `_`, strikethrough `~~`, highlight `==`, inline code and fenced code (with ``` or ~~~, and its language shown), quotes that nest and hold lists, nested bulleted and numbered lists (a numbered list keeps its starting number), task lists, tables with alignment, links, bare web addresses, horizontal rules, `#tags` and backslash escapes. A line break is kept, as in most note apps; a blank line starts a new paragraph. Images show as a labeled box with their alt text and are never loaded. **Task boxes** can be ticked in the viewer, which changes `[ ]` to `[x]` in the note and saves it. A plain click on a link does nothing; **Ctrl + click** opens a web (http or https) link in your browser. **Markdown**, beside Placeholders, opens the **Markdown Reference**: every kind, as typed and as shown, each example drawn by the viewer itself. The **text editor** shows its plain text to change, on a darker field edged in indigo, so the two look different at a glance (the viewer reads on a lighter page); and the viewer is drawn again from the text each time it's chosen. Ctrl + M switches between them, from inside the text too, and a double-click in the viewer edits. Super + Q opens Quick Notes as it was left. A new or empty note opens in the editor, as does a code note, which has no viewer. A game's note opened from Games, or stamped with **Add timestamp**, opens in the editor, to write in during play. The viewer is built from plain text elements only and never interprets HTML, so nothing in a note can run as code. Links are shown (with their address on hover) but are never opened.

**Trash** *(2.1.0)*: **Delete** moves the open note to the trash at once, with **Undo** on the toast for 10 seconds; nothing asks first. A note with no title and no text is just removed. While the trash holds anything, **Trash**, with its count, sits at the foot of the notes list and opens the list of deleted notes, newest first, each with the day it was deleted and the days it has left, **Restore** and **Delete forever**; **Empty trash** deletes them all. Those two are for good, so each asks first. A note stays 30 days, and the trash holds 200 at most (the oldest go first). A restored note comes back as it was, pinned or grouped as before; a game's note comes back linked to its game unless that game has another note by then. Trashed notes are in none of the list, the filter, the palette, Pinned Notes or Games.

**Game notes**: a note written from Games shows **Notes for** *game* above its text, with **Add timestamp** and **Unlink**, which keeps the note but stops linking it to the game. Renaming or regrouping it keeps the link. See [Games](#games).

**Quick capture:** Super + Shift + C copies the selected text in the active application into a new note titled “Captured · *window title*”, without showing Maestro. If nothing is selected, it captures the current clipboard text instead. The clipboard is restored afterwards, and captures over 200,000 characters are truncated.

Data is stored as a version 2 JSON object in `data/notes.json`, with the trash as a list of its own, `trash`, beside `notes`, where each entry is the whole note and `deletedAt`. Saves are debounced and atomically replaced, and the previous file is kept as `.bak`. Because nearly every save replaces `.bak`, the first save of each day also keeps a copy in `data\notes-history`, and the newest 14 stay. To go back to one, exit Maestro and copy it over `notes.json`. If `notes.json` is unreadable at startup, Maestro loads the backup and shows a notice the next time it is focused. When Maestro is shown, it reloads `notes.json` if the file was changed outside Maestro; unsaved edits in the editor take precedence. An old single-note file of the form `{"content":"..."}` is converted into a note named “Scratch”.

Each note stores an `id`, `title`, `type` (`note` for Text or `code`; `snippet` from earlier versions is read as `code`), `content`, `pinned`, an optional `fill` (whether placeholders are filled, when set by hand), an optional `group`, an optional `game` (the link to a game, by its title key; older versions ignore it, and Maestro refuses a save where it isn't text, is too long or has control characters), and ISO-8601 `created`/`updated` timestamps. The collection stores `version`, `activeId`, and a `notes` array.

### Everything Launcher

Super + F opens Everything. The palette's “Search files for…” opens Everything with that query (`Everything.exe -search`). Maestro does not embed results or load the Everything SDK.

### Vivaldi

Super + B detects Vivaldi windows on any virtual desktop. It focuses one on the current desktop when possible, otherwise switches to the topmost window's desktop and focuses it, and launches Vivaldi only when no window exists. Cross-desktop detection requires `VirtualDesktopAccessor.dll` with `GetCurrentDesktopNumber` and `GetWindowDesktopNumber`; if detection fails, Maestro reports the problem instead of opening a duplicate.

### Explorer Item Creation

With a filesystem folder active in File Explorer, Super + Shift + D creates a folder and Super + Shift + F creates an empty file (enter a name with its extension). Both report an error if Explorer is not active, the location is not a filesystem folder, the name is invalid, or the item already exists.

### System

System (Super + I by default) has four sections, each a tab: Live, Hardware, Startup, and Activity and Logs.

**Live** graphs CPU and memory over the last **5 minutes**, **1 hour** or **24 hours** *(2.0.0; the switch beside the tabs, kept on this PC)* on a 0 to 100% scale, with the current value, average and peak; the pointer anywhere over a graph reads its value, its time on the clock and how long ago that was ("11:18:04 AM · 9 min ago"), and the graph's start is labeled the same way. Below them, the monitored drives. **Choose drives** opens a box for up to 12 letters, saved separately from anything else on the page. Readings refresh every second while this section shows and every five seconds elsewhere in Maestro, and stop while it is hidden or minimized; the end of each graph's line follows the current reading. Drives are checked every 30 seconds. CPU comes from `GetSystemTimes` deltas and memory from `GlobalMemoryStatusEx`. For the history, Maestro samples both every second even while hidden (two near-instant system calls) and keeps, in memory only, each second for 5 minutes, each 10 seconds for an hour and each minute for a day; a 10-second or minute point is the average of what it covers, and its peak shows in the pointer's card. Each point keeps the time it was taken (a 10-second or minute point, that of its last second), so the times stay right after sleep. The page is sent only the timescale it shows, and only when it has a new point.

**Hardware** shows everything Windows reports about each component. Four tiles lead with one large fact: Processor (cores, then maker, threads, base clock, socket, caches, architecture, revision and virtualization), Graphics (name and video memory, then maker, driver and its date, video BIOS, display mode, refresh rate and range, and color depth, with a group for any further card), Memory (total and layout, then form, running and rated speeds, voltage, data width, slots, maximum, maker, part number and each module) and Storage (total, each drive, partitions, drive letters and health). **Drives** gives each drive a bar showing how its partitions divide it, a list of them with file systems and sizes, and its connection, type, health, firmware and sector sizes. Displays (name, maker, product code, size, connection and when it was made), Sound and Network list the physical devices, each with its maker and connection or driver; software ones, such as a VPN or a virtual audio device, are left out. Below are Device, Motherboard, BIOS (including Secure Boot) and Windows (edition, version, build, installed and last started). Anything Windows doesn't report, or reports only as a maker's placeholder such as "Default string", is left out. How full a drive is stays on Live, where it's kept current.

The inventory is read once per session, after System first opens, by a separate process (`ASCS.HardwareProbe.ahk`, about 0.7 s), so Maestro doesn't wait for it. It uses WMI (`Win32_Processor`, `Win32_ComputerSystem`, `Win32_PhysicalMemory`, `Win32_PhysicalMemoryArray`, `Win32_VideoController`, `Win32_DiskDrive`, `Win32_LogicalDisk`, `Win32_BaseBoard`, `Win32_BIOS`, `Win32_OperatingSystem`, `Win32_SoundDevice`, `MSFT_PhysicalDisk` and `MSFT_Partition` from the Storage namespace, which name NVMe and SATA correctly and list every partition, `MSFT_NetAdapter`, and the `WmiMonitor` classes) and the registry (true video memory, since `AdapterRAM` stops at 4 GB; the Windows version name; Secure Boot). Serial numbers, owner names and network addresses are never asked for. A network adapter's link state and speed aren't shown, since they change and this is read once. It reaches the page when System opens, not with every reading.

### Games

Play time, recent games and achievements across Steam, RetroArch, Dolphin, PCSX2 and Phantasy Star Online, read from each program's own records (read-only):

- **Steam:** installed games from the app manifests in every Steam library folder, play time and last played from the most recently used account's `userdata\<account>\config\localconfig.vdf`, and portrait art from Steam's library cache (its landscape header when there is no portrait art). No Steam account details or keys are needed. Games are started through Steam's own `steam://rungameid/<number>` link. Uninstalled games you have played are listed too, named from Steam's binary app cache (`appcache\appinfo.vdf`, formats v28 and v29, read only for the games needed); their button reads **Install** and opens Steam's install prompt, and they stay out of Continue Playing and the palette. Steam cover art is looked up when a cover is first shown, not during the library build.
- **RetroArch:** runtime logs (`playlists\logs\*.lrtl`, with content runtime logging on) joined to its history.
- **PCSX2:** `inis\playtime.dat`, named through its game list.
- **Dolphin:** `Config\TimePlayed.ini`, named through its game list (system channels and brief tests are left out).

The page has four sections, each a tab under the title bar. Left and Right move along the tabs, and Library and Achievements draw only once they're open.

**Playing** opens first:

- **Now Playing:** the game an emulator or Steam is running (from the emulator's window title, or Steam's running app), matched to the library: its cover, also as a soft backdrop while the game runs (here and on the Command Center), a live session timer, total play time, sessions, RetroAchievements progress and the game's rich presence, with **Achievements** (which opens that game's list) and **Show file** (**Open folder** for Steam); other running games are named below it. The session starts when the emulator's process started, or when a different game appears; it isn't affected by which of the emulator's windows has focus (PCSX2 and Dolphin show games in a window beside their main one), and it ends only when the game closes; Maestro checks every 10 seconds (a few process and window-title reads). With nothing running, it shows the last game played with **Play**. The PSO session is started with Super + M4.
- **Game notes**: each game has one set of notes, shown beside Now Playing (for the running game, or the last one played when nothing is running; at an emulator's menu, or with nothing played, the module says there's no game to take notes on, and it keeps its place), in a library game's details and in the achievement browser. They're an ordinary note in Quick Notes, in the **Game notes** group, made when you first type. **Open in Quick Notes** goes there. A note belongs to a game by its title with regions, case and punctuation ignored, so the same game on two emulators shares one note, and a game RetroAchievements names differently from your library has a separate one. **Add timestamp** adds a heading with the date and time, plus how far into the session you are if that game is running; it adds one only when you press it. **Notes for current game** in the palette (Super + Space) asks once what's running and opens that game's note, making it if needed, with the cursor at the end.
- **Next Up:** the game you were last seen in on RetroAchievements: its next locked progression step (or the next locked achievement), with points earned, how many are still locked, how many missable ones are still open, and the latest and rarest unlocks. **All achievements** opens the game's list. The module is hidden until RetroAchievements has answered.
- **Play Time:** the total, and the total and game count for each source.
- **Continue Playing:** the five most recent games Maestro can start, each with **Play**. **Library** opens the Library section.

**Achievements** (RetroAchievements):

- **The summary:** headed by your RetroAchievements picture and name; hardcore, true and softcore points; rank with a percentile; the game you were last seen in and its rich presence; progress in recently played games (percent, with completed and mastered games in gold); and recent unlocks with their descriptions and points (gold for hardcore), with each game's icon and each achievement's badge. Images are asked for only once this section is open (one badge for Next Up before that). They come only from `media.retroachievements.org`: Maestro reads an image name from the response only if it is a plain badge number, `/Images/<digits>.png` or `/UserPic/<name>.png`, builds the address itself, keeps only real PNGs under 256 KB, and caches them in `data\ra-images`, so each is downloaded once. Your picture comes from `/UserPic/<name>.png` on the same host, for a name of only letters, digits and underscores, and is checked again after a week, because you can change it; the cached copy shows meanwhile and stays if the check fails. **Check now**, under Games › Setup, checks at once. The cache is capped at 20 MB: past that, the images shown least recently are removed down to 16 MB (typical use stays well under 1 MB). **Profile** opens your RetroAchievements profile; **Refresh** fetches again (at most once a minute; otherwise every ten minutes), and the header shows when it last updated. It needs a user name and Web API key in `data\secrets.ini` (**Open secrets file** creates it from a template and opens it in Notepad).
- **Site Badges**: your RetroAchievements profile's awards, as a grid of game art, newest first. Mastered games have a gold frame and completed ones a violet frame, and **Mastered** and **Completed** totals join the stats above. Tabs show All (each game once, at its highest award), Mastered, Completed, Beaten, Events and Community, and a tab with nothing in it is hidden. Hovering or focusing a badge shows the game, console and award with its date, and clicking a game's badge opens its achievements. An event's badge shows its card but opens nothing, and a community award is a text label. The awards are asked for once the Achievements section is on screen, and each image only as it scrolls near view. Awards you've hidden on your profile aren't shown; the heading says how many there are.
- **The achievement browser**: click a game in Progress (or a recent unlock) to see every achievement in it, unlocked and locked: badge (locked ones gray), title, description, points, whether it's **Progression**, the **Win condition** or **Missable**, when you unlocked it (and whether in hardcore), and how many players have it. Filter by **All**, **Locked**, **Unlocked**, **Missable** and **Progression** (each with its count), and sort by the game's order, most points or rarest first; **‹ Achievements** goes back. **More unlocks** pages through the last 30 days, six at a time. A game is fetched when first opened (and for Next Up) and kept for 10 minutes; **Refresh** fetches the open game and the unlocks again.

**Library:** every game played, filterable by source and text, sorted by recent, most played or A–Z, with **Play**. Clicking a game shows its details beside the list, and the first game is selected when the section opens: larger art, the full title, where it was played, play time, sessions, the exact last-played time, the RetroArch core, serial, disc ID or Steam app ID, the file name and size or the install folder and size, your RetroAchievements progress when the titles match, **Play** and **Show file** (or **Open folder** for Steam), and the game's notes. **Cover art**, in the section's toolbar, turns covers on and off (on by default).

**Controllers:**

- **Controllers:** each connected controller with its name, mode (X-input, D-input, Switch or PlayStation, from its vendor and product IDs), connection (Bluetooth or USB, from Windows' device records), player slot, and battery where reported (X-input mode reports it; Bluetooth D-input and Switch modes don't). **Test** opens a live input tester: for X-input controllers, sticks, triggers and every button (polled about 16 times a second only while it is open), with **Rumble**; for D-input and Switch-mode controllers, sticks, any trigger axes, the D-pad and numbered buttons, read from the controller's own HID reports through Raw Input (registered only while the tester is open, decoded with Windows' HID parser; never DirectInput). **Rename** names the controller in Maestro and in Windows' per-user game controller list (the name the Game Controllers panel and DirectInput games show; no administrator rights needed; an empty name restores the default). Most emulators and Steam use their own controller names. The Bluetooth name needs administrator rights, so **Bluetooth name…** opens Windows' Devices and Printers, where the controller's Properties › Bluetooth tab renames it; that is needed once per controller. Controllers are found through XInput and the Raw Input device list (never DirectInput, which crashed Maestro in testing); other HID devices, such as a keyboard's receiver, are ignored. Rumble, Identify and battery need X-input mode; D-input and Switch-mode pads are listed with their mode and connection and can be tested. A 2.4 GHz receiver (recognized from Windows' own name for it, remembered before any rename) shows its controller once, as the X-input entry labeled **2.4 GHz receiver**: its idle D-input interface is hidden, and since the receiver reports itself as wired, the battery reads "not reported through the receiver". **Identify** rumbles one X-input controller, to tell two identical controllers apart (they share a model, so they share a name; the player number tells them apart too).

Titles drop region and revision tags for display ("Super Paper Mario (Europe) (Rev 1)" reads "Super Paper Mario"), library-sorted names read naturally ("Legend of Zelda, The" reads "The Legend of Zelda"), and RetroArch's system names are shortened ("Sony - PlayStation" reads "PlayStation"). **Cover art** comes from Steam's library cache, RetroArch's thumbnails and PCSX2's covers folder on this PC; nothing is downloaded, and covers are sent to the page one at a time so hotkeys stay responsive. Games without art get a monogram tile. Live status refreshes every three seconds only while the tab is open.

### Calendar

Your calendars, kept on this PC: **Day** and **Week** (hours that scroll inside the page, overlapping events side by side, a gold line at the current time), **Month** and **Agenda** (the next 60 days), with **Today**, ‹ › and **New event** (or Ctrl + E). Click a day to see its hours, a time to add an event there, the all-day row to add an all-day event, and an event to change it. Multi-day events (all-day, or crossing midnight) are bars across the days they cover, in the month and in the week's and day's all-day row, pointed where one continues into the next week (or day). A month day shows up to three lines (two lanes of bars, then its own events), then "+N more", which opens the day. Calendars start as Personal, Gaming and Work; **New calendar** and each calendar's **Edit** create, rename, recolor and delete them, and the tick boxes show or hide each one. *(2.0.0)* A color is one of eight swatches or any other, from the picker or typed as a hex code (`#8B6FF5`), for Countdowns and US Holidays too.

The event editor has a title, calendar, all-day or start and end times (each time is an hour, minute and AM/PM side by side, and each date a month, day and year: turn the mouse wheel over a part to change it, minutes by 5 and days carrying into the next month, or use the arrow keys, type digits, or press A or P; a date's calendar button still opens the pop-up; the end follows the start), **Repeat** (daily, weekly on chosen days, monthly on a date or on e.g. the second Tuesday or the last Friday, yearly; every N; forever, until a date, or N times), a **Reminder**, location and notes. Changing an occurrence of a repeating event asks whether it's **only this one** or **every event in the series** (the series moves by the same amount). It asks every time, in the same dialog, however the change is made: **Save** in the editor (Cancel goes back to the editor, nothing saved), dragging, resizing, or **Delete**. **Only this one** keeps the occurrence in its series, changed (an iCalendar override: the same event with the date it replaces), so changing it again asks again, and putting it back exactly as the series has it (same time, length and details) rejoins the series by itself; **Back to the series** in its editor does that in one click. Moved to another calendar, an occurrence still becomes an event of its own there. **Every event in the series** applies the change to the series, and its changed occurrences move with it, keeping their own changes.

**Undo**: every calendar change (dragging, resizing, Save, Delete, Back to the series) says what it did with an **Undo** button, for 10 seconds. Undo puts back exactly what was there before, whichever choice was made; it only replaces the version it saved, so if the event was changed elsewhere in between it stops and says so rather than overwriting.

**Quick add:** in the palette (Super + Space), start with **+** and type the event: `+Dentist tue 3pm #work`, `+PSO raid fri 8-11pm #gaming`, `+Trip nov 12`, `+Call Sam tomorrow at 3 for 30m`. The palette shows what it understood (day, time, calendar) before Enter adds it. Dates: today, tonight, tomorrow, weekdays (and "next fri"), "nov 12" or "12 nov", 11/12, 2026-11-12, "in 3 days"; times: 3pm, 3:30pm, 15:00, noon, "at 9", ranges like 3-5pm; "for 90m" sets the length; `#name` picks the calendar. With no time the event is all-day; a time already past today means tomorrow (or next week, for today's weekday). Timed events get a 15-minute reminder. **New calendar event** is in the palette too.

**Today on the Command Center:** under the system overview, today's remaining events (up to three, then "+N more"), or the next one coming up; each opens in the Calendar.

**Countdowns and files:** your countdowns (the Calendar's **Countdowns** module; its **Edit** opens the dialog, which moved here from Preferences in 2.0.0: up to 12 dates, yearly (MM-DD) or one-off (YYYY-MM-DD), sorted when saved, yearly dates January to December, then one-off dates, plus the switch for US holidays) show in the Calendar as rounded pills with an hourglass, unlike events (square corners and a color stripe): yearly ones every year, one-offs once. A one-off countdown is removed the day after its date. **Edit** beside Countdowns in the calendar list chooses their color (kept with the Calendar's view settings). They are read-only in the Calendar (clicking one opens the Countdowns dialog), are never written to the calendar server, and can be hidden with **Countdowns** in the calendar list; a countdown with the same name as an event on that day isn't shown twice. An event's **Pin as countdown** adds it to the almanac's countdowns (a yearly event counts down every year). **Import .ics…** (under the calendar list) adds the events from a file to a calendar you choose; events already there (the same event id) are skipped, so importing a file twice changes nothing. A calendar's **Edit › Export .ics** saves it as a file. Windows' own Open and Save dialogs are used, so the page never handles file paths.

**US Holidays**: a read-only calendar of the 11 federal holidays (on their actual dates) and common observances (Valentine's Day, Easter, Mother's Day, Father's Day, Halloween, Christmas Eve, New Year's Eve), worked out on this PC with nothing downloaded. Hide or recolor it like Countdowns. They also count down on the Command Center unless **Count down to US holidays** is off (in the Countdowns dialog); one of your countdowns with the same name or date replaces the holiday.

**Dragging events**: in Day and Week, press on an event and drag it. It dims where it was, and a dashed outline in its color shows where it will land, snapped to 15 minutes, keeping its length and labeled with the new time (and day, when dragged across days in Week). Near the top or bottom the hours scroll. Dropping saves it; Esc, or dropping where it started, cancels; a short click still opens the editor. A repeating event asks first: **Only this one** or **Every event in the series** (the series moves by the same number of days and the same change of clock time, so it doesn't slip an hour across a daylight-saving change). Countdowns and holidays aren't dragged.

**Scrolling**: the hours open at 7:00, or an hour before now when today is shown, and then stay where they are while ‹ › steps through days or weeks or Day and Week switch; **Today** goes back to the current time. A sideways wheel over the Calendar steps like ‹ ›.

**Resizing**: the top and bottom edges of an event in Day and Week are grips (a short bar shows on hover). Drag the bottom to change when it ends, or the top to change when it starts; the outline shows the new times, snapped to 15 minutes, never shorter than 15 minutes and within its day. Dropping saves it, as with moving.

**Dragging in Month**: events and multi-day bars move between days, keeping their times. The day it will start on is outlined, with a dashed outline of the event at the top of its list (labeled with its time, or its new dates for a bar); the event dims where it was. Dropping, Esc and repeating events work as in Day and Week.

**Where it lands**: under the event editor's times, a strip shows where the event falls, redrawn as the times change. For a timed event it spans the hours around it, with that day's other events in gray and a note when they overlap; for an all-day or multi-day event it spans the days around it (at least a week), with other all-day events in gray. The strip keeps its place and height while the times change: when the end isn't after the start it stays, empty and hatched, and says “Ends before it starts” in burgundy, so the fields below never move under the mouse wheel.

**Reminders** (from when the event starts up to 2 days before, including 1 minute) for the next three days are handed to Maestro, which shows them as tray pop-ups with your reminder sound (Sounds › Use as › Calendar reminders; until then Windows' own Calendar Reminder sound), even while Maestro is hidden. The pop-up carries the Maestro icon, the event's name, "Starts in 5 minutes · Today 3:00 PM" and the location; clicking it within a minute opens the Calendar. In the event editor, moving the start (date or time) moves the end with it, keeping the event's length. A reminder more than 15 minutes late (the PC was asleep) is dropped.

**Where the data lives:** in **Radicale**, a small open-source CalDAV server, installed by `tools\Install-Radicale.ps1` into `data\radicale` (version 3.8.3 and 13 dependencies, each pinned by SHA-256 against PyPI's published digests; wheels only). Maestro starts it with itself, listening on 127.0.0.1 only; adopts it across a reload; and stops it on exit. Events are standard iCalendar, written in local time; edits change only the fields Maestro manages and keep everything else in an event (a phone's own properties, attendees, time zones), so a phone can be added later without losing anything. Events from other apps are read in their own time zones.

### Sounds

Every Windows sound from 3.x to 11, played as the originals from the sound library (`C:\Sounds\all-windows-sounds-main` by default; the **Library folder** line under the list shows it, with **Change** and **Re-read**). Each version is a folder named like `(1998) Windows 98`. Folders without a year, such as **Maestro Leveled** (the `ASCS Leveled` folder on disk, which keeps its name so nothing playing a copy loses it), are your own: each has a button beside ♥ Favorites rather than a place among the versions. The page opens on every version as a card, three to a row, each with its logo, year and number of sounds; choosing one opens it, with a strip of versions across the top (the thumb wheel steps through it) and **All versions** just above the sounds to go back. Within a version, sounds are grouped by their sub-folders (Windows 7's and Vista's themes). The toolbar has finding on the left (search across every version from either screen, **♥ Favorites**: click the heart on a sound) and playback on the right (**Play random**, **Stop all**, volume). One sound plays at a time: playing another stops it (even one still loading), and **Ctrl + click** layers a sound over what's playing instead. Sounds play in the page with Web Audio; MIDI and WMA files play through Windows.

*(2.0.0)* The page has three sections, each a tab: **Library**, **In Use** and **Startup** (with counts). On every tab, the bar beside them has **Stop all**, the **audio output** (the same list as the power tray, read when the page opens, and switched through SoundSwitch with the result checked) and **Volume**, which only sets how loud Maestro previews sounds. In Library, the sounds take two thirds of the page and **Selected Sound** a third, kept in view as you scroll, so clicking a sound shows its details without leaving the list. In Use and Startup have the whole page, and their rows keep Play in one place, with Match and Restore coming and going to its left. Startup has **Sign-in Sounds** beside **Shutdown Sound**. Selected Sound shows:

- **Level:** measured as soon as it's selected: its loudness against the notification level (below), and its RMS and peak in dBFS (measured over every sample, as the startup sounds were leveled), against a **reference** level: type a target, or pick one of three chips: your startup sounds (−26.4 dB), your Maestro sounds (−33.7 dB), or this sound's own level (to level others to it). Maestro works out the gain to match it, holding it back if the peak would go over −0.3 dBFS (and saying how far short that leaves it), lets you **preview** the result, and **saves a leveled copy** in the library's Maestro Leveled folder (named like `CHIMES (-7.6 dB).wav`, in the original's format; the original is never changed). **Measure all levels**, beside the count above the list, measures every sound shown and puts each level on its tile. Compressed WAVs (such as ADPCM) can be measured but not leveled.
- **Use As:** starts at "Choose where to use it…" (**Use** stays off until something is chosen), then makes a WAV the sound for a Windows event (Device Connect, Notification, Calendar Reminder, Empty Recycle Bin, and 15 more), or for Maestro showing, hiding or reminding, or a timer ending *(2.0.0)*, or as a **Sign-in sound** (added to the chance roll at 0%) or the **Shutdown sound**. When the sound is off the level for where it's going (the notification level, the startup level, or that place's own level), **Match** is ticked beneath: **Use** then saves a leveled copy and uses that (untick it to use the original).

**In Use: the notification level board.** Every sound in use, Maestro's three and Windows' events, measured for loudness the way the ear hears it: ITU-R BS.1770, in LUFS, the measure streaming services use. It weights the frequencies the ear is most sensitive to and leaves out silence, so a short chime with a quiet tail isn't counted as quieter than it sounds, as plain RMS would. At the top is one **notification level** (−24 LUFS to start; − and + step by 1 dB; presets Quiet −30, Balanced −24, Clear −18, and **Middle of yours**, the median of your sounds, which changes the fewest). Each row shows a bar with the target in the middle and the sound's place on it (±12 dB), and **Matched** (within ±1.5 dB) or how many dB louder or quieter it is.
- **Match** (one row) or **Match all** saves leveled copies in Maestro Leveled and switches the events to them. Match on another row while one is matching queues it ("Queued"). A copy is held back if raising it would push the peak past −0.3 dBFS.
- **Play all** plays each in turn, so you can hear them side by side (Stop ends it).
- **Restore** takes any event, or any of Maestro's sounds, back to what it played before Maestro first changed it. **Restore all** does that for every changed sound at once, after a confirmation; leveled copies stay in the library.
- **Delete**, on a selected leveled copy, moves it to the Recycle Bin after a confirmation. Only WAV files directly inside Maestro Leveled can be deleted, and not while a Windows event or Maestro sound plays them (Maestro checks this itself, whatever the page asks). **Select** (next to Measure all levels, wherever leveled copies are shown) deletes several at once: click copies to pick them (Shift + click picks a range; copies in use are grayed), then **Delete (N)** in the bar, after one confirmation. Up to 200 at a time; the page sends them 10 to a request and Maestro answers each, so it stays responsive, and a copy that fails a check is skipped with its reason while the rest go ahead. Esc or **Done** leaves Select.

**Match levels the original**: Maestro records which original each leveled copy was made from (`data\sound-origins.ini`), and Match, Match all and Restore always work from that original, so gains never pile up and a copy's name carries one gain, such as `The Microsoft Sound (-2.4 dB).wav`. Older copies, made before Maestro kept this record, are traced back by name (a library WAV with the same name once the `(±x dB)` parts are removed); press **Restore** and then **Match** on those to replace them with clean copies. Selected Sound does the same: with a leveled copy selected, **Save leveled copy** and **Use as** make the new copy from its original, with the one total gain worked out from that original (the panel says so: “A leveled copy of … A new copy is made from that original: +7.7 dB in all”), and if the original is already at the level, Use as uses the original.

**Replaced copies are cleared away**: when Match, Use as, Restore or Remove stops a sound from playing a leveled copy, Maestro moves that copy to the Recycle Bin, unless something else still plays it, a Restore would go back to it, or you saved it yourself with **Save leveled copy** (those are kept until you delete them). Older copies have no such mark, so they're cleared once replaced. To clear a backlog, open `ASCS Leveled`, press **Select**, then **Select all** (only copies nothing plays are picked) and **Delete**.

**Own levels**: each row's bar has a gold handle, at the middle (the board's level) until moved. Drag it to give that sound its own level, from −12 to +12 dB around the board's in half-dB steps: **Matched**, **Match** and **Match all** then use it, and it stays put when the board's level changes. With the handle focused, the arrow keys step 0.5 dB, Page Up and Page Down 3 dB, and Enter types a level; Home, Delete or a double-click goes back to the board's level, as does the **×** beside the gold **Own +3.0 dB** label (click the label to type a level). Own levels belong to the place a sound plays (a Windows event, Maestro's show sound, the shutdown sound), so a new sound there is matched to it too; sign-in sounds keep theirs by the original they're leveled from. They're kept on this PC with the other Sounds preferences, not in Maestro's data. **Reset levels**, on either board when anything differs from the defaults, puts the notification level back to −24, the startup level to −20, Selected Sound's Target RMS to −26.4, and every own level back to its board's, after a confirmation that lists them. No sound file changes: rows may then read louder or quieter until matched.

**Startup**: the sounds played at Windows sign-in, one picked by chance, and at shutdown. They're played by `C:\Scripts\SignIn.ahk` and `Shutdown Sound.ahk`, which read them from `data\startup-sounds.ini` (written by Maestro, and created at launch with the defaults if it's missing), so Maestro needn't be running then; if the file can't be read or a sound is missing, they play Windows' own XP startup or shutdown sound. The tab works like In Use, with its own **startup level** (−20 LUFS to start; presets Quiet −24, Balanced −20, Bold −16, **Like XP**, the XP startup original's loudness once measured, and Middle of yours). Each sign-in sound has its **chance** in a box at the left (whole percentages); they're saved once they add up to 100, and until then the line above them says what they add up to, in burgundy. Up to 8 sign-in sounds; **Remove** gives a sound's chance to the first, and the last one can't be removed. The first set is the library's originals: Windows XP Startup 88%, and Windows Me, 98 and 95's The Microsoft Sound 10%, 1% and 1%, with Windows XP Shutdown at shutdown. Windows allows about 5 seconds at shutdown, so a longer shutdown sound may be cut off.

Maestro sends each sound to the page by its event's name (`windows:<event>`, `ascs:<show|hide|reminder>` or `startup:<1–8|shutdown>`, and `origin:<the same>` for the original behind it); the page never names a file path. A bare file name in the registry is looked for in Windows' Media folder; nothing else is followed. Compressed WAVs can be measured but not matched. MIDI and WMA can't be used for Windows events at all.

Lengths are read from the WAV headers in the background and remembered in `data\sound-lengths.txt`, so the library lists at once.

### Startup history

On System, under Startup: a graph of the last 20 sign-ins, oldest on the left, with a data point for each: the time from `SignIn.ahk` starting until its last task is done, which is Keychron Assistant closed to the tray, including the 1.5 s it waits to catch the window reappearing. The startup sound isn't counted, since its length varies with the sound rolled. Beside the graph are the latest, middle, fastest and slowest, and below it a table gives each sign-in's stage times and sound. Hovering anywhere over the graph picks the nearest sign-in and shows a card with its date, how it compares with the middle, its stage times and its sound (the Windows version for a Windows startup sound, leveled copies included; otherwise the file's name); on the keyboard, Tab reaches the latest and the arrows move between them. It's read from the sign-in log when the page opens, leaving out test runs. Times are from `SignIn.ahk` starting, about a second after sign-in.

### Logs

On System, under Activity and Logs, or **Logs** from the palette; Ctrl + F on System goes to its filter box. Script errors in the page are written to the Maestro log as "Page error: …" (up to ten per session), so they appear here too. A read-only viewer for three logs: **Maestro** (`data\ASCS_Log.txt`), **Activity** (`data\activity.log`), and **Code key** (`%LOCALAPPDATA%\VSCodeMacro.log`, written by the Code key's script). Lines are grouped by day, newest first, with errors marked in burgundy and warnings in gold (inferred from words such as “failed” or “timed out”). **All / Issues / Errors** filter by level with counts, the filter box searches the text (Escape clears it), **Copy** copies the visible lines, and **Open file** opens the log in Notepad. While the section is showing it checks for changes every three seconds; Maestro answers only when the file has changed, and the check stops when you move to another section or page. Only the newest 512 KB (up to 2,000 lines) is read, and the newest 600 matching lines are shown.

### Commands

Four sections, each a tab: **Key Map**, **Custom Commands**, **Palette** and **Quick Actions**.

**Key Map** is led by a keyboard map of the user's customized Keychron Q6 Max: a 100% board with a full-width left Shift, a rectangular Enter with `\ |` above it, seven macro keys (M1–M3 in place of PrtSc/ScrLk/Pause, M4–M7 above the numpad), a **Code** key between left Ctrl and Alt, and Alt · **Super** · Fn · Ctrl right of Space. The map has two layers, **Super** and **Super + Shift**. Keys in use are filled by category: deep indigo for apps and views, steel for windows and system, burgundy for arrangements, notes and text, and gold for custom commands. Free keys are outlined. The physical Super key is drawn in metallic gold. The Code key and macro keys M1–M7 are outlined in dashed gold as **Macro keys**, captioned with what they do on their own through the keyboard's macro scripts (Bambu, Audio, Discord, PSO, Retro for RetroArch, Dolphin, PCSX2, VS Code). With Super, M4 starts a PSO session and M5–M7 open recent games; those keys are filled like other commands, and a green dot marks M4–M7 while that program is running (checked every three seconds, only while Commands is open). Fn is handled by the keyboard and is not used by Maestro. Text too wide for its key, such as a long custom command's name, is drawn smaller to fit. Hovering over or focusing a key shows its command under the map. Switch layers with the toggle, or hold Shift while the page is open to preview the second layer.

Clicking a key (or Enter on it) shows it in the panel beside the map, where it can be changed:

- **Quick Notes, Everything, System, Windows Terminal, File Explorer, Claude and Task Manager** always have a letter: type a new one and **Save**, or **Reset to** the default. Claude's key also holds the **Claude quick-entry shortcut**, the combination the Claude desktop app uses for its quick-entry prompt (default **Ctrl+Alt+Space**). Only Ctrl, Alt, Shift or Win plus one key (Space, a letter, a digit, or F1–F12) is accepted, with at least one of Ctrl, Alt or Win, so the setting cannot send arbitrary keystrokes. Leave it empty to have Ask Claude simply open the app.
- **A custom command** can move to another letter, or **Remove letter**.
- **A free letter** takes any of those: choose it under **Runs** and **Assign**, and it moves here from its old key. C, D, F and P count as free while they only pass a Windows shortcut through (Win + C, D, F and P); giving one a command replaces that.
- **Everything else is fixed:** B, S, R, L, M, V, J and Y, numbers, arrows, and the Super + Shift layer.

A letter another command holds is refused with a message naming it, in the page and again in the backend, and nothing changes until the backend has saved. Moves apply immediately.

Below the map, three lists name every command: **Apps and views**, **Windows and system**, and **Arrangements, notes and text**. Clicking a row selects its key. **Find a command or key** narrows the lists and highlights matching keys on the map, dimming the rest; Escape clears it.

**Custom Commands** are rows of name, type (Application, Folder, or Web link), target, and an optional Super letter, with a Browse… picker for applications and folders. Applications must be existing `.exe` or `.lnk` files and start without arguments; folders must exist; links must be `http(s)` URLs. Letters may not collide with built-in or other custom shortcuts. Up to 30 commands; **Save commands** applies them immediately. If saving fails, your edits stay in the form so you can fix the reported row.

**Palette** holds the web search address, which must use `https://` and contain `%s`, beside a list of what you can type in the palette.

**Quick Actions** lists the Command Center's buttons, up to six. Drag a card to change the order; Escape while dragging puts it back. From the keyboard, the arrow keys on a card's grip do the same, and Up and Down move a row; the card keeps its focus as it moves. Delete on a grip removes the card. **Remove** does it with the mouse (it isn't a Tab stop), and **Add quick action** opens the palette in a pick mode.

### Title Bar

The sidebar opens with the brand: a 76 px indigo mark with a metallic gold edge and a soft indigo halo, with AEOLIONWARE and MAESTRO centered beneath it in widely spaced capitals. When the sidebar is collapsed, the mark shrinks in place to 56 px above a short Maestro wordmark, so nothing below it moves. The title bar shows your location (`ASCS / view`), a **command bar** (“Search or run a command”, with **/** on its key) that opens the palette, a live **status pill**, and the clock. The pill reads “All systems nominal” in green, or turns gold with “Attention · J: 94% full” (or CPU/memory) when any monitored resource reaches 90%; hover for the full list. Every text run is trimmed to its capital height (`text-box: trim-both cap alphabetic`), and controls use even heights (command bar 36 px, status pill 28 px, key chips 22 px) on the 72 px bar. The search text keeps a few pixels of clipping room so tall letters are never cut. As a result, the brand, labels, controls, clock, and caption glyphs share one optical center line (verified to within half a pixel at 2× scale). There is no band or divider at rest, so nothing falls short of the window edges. Once the page scrolls, the bar stays at the top and a frosted band with a hairline fades in behind it, drawn edge to edge across the main area whatever the content padding. The caption buttons are pinned to the window's top-right corner at the bar's full height (48 × 72), with crisp 10 px glyphs drawn on whole-pixel strokes. Double-clicking the bar maximizes or restores the window. Maximize swaps to a restore glyph while the window is maximized, and Close hides Maestro (it keeps running) with a burgundy hover. Below 1100 px wide, the command bar and clock are hidden.

### Preferences

*(2.0.0)* Only what belongs to the whole app, on one page of modules with no tabs. Every setting saves as it changes, with "Saved." beneath the modules; nothing can be saved before the saved settings have arrived (the controls wait, disabled), so a save never sends blanks over them.

- **Appearance:** text size and the logo's swing (see Fonts).
- **Windows:** snap gap (0–48 px), and **Keep size across monitors**.
- **Power:** the delay before power actions.
- **Backups** *(2.1.0)*: **Back up every day** copies `data\` (your notes, calendar, settings and arrangements, and the secrets file) to a folder you choose, at the time you set: 6:00 PM unless changed, offered on the hour. If the PC is off then, the backup is made within a minute of Maestro next starting, and one that fails is tried again each hour. **Choose…** opens Windows' folder picker; the folder must be on a drive inside this PC and outside Maestro's own folder, and the page never sends a path. **Open folder** shows it in Explorer, and **Back up now** makes a copy at once. The line beside that button says when the last backup was made, or why one failed. Maestro runs `maestro backup-data` as a hidden process of its own, so nothing waits on the drive, and the command decides what's kept (see [Developing and running apart](#developing-and-running-apart)). A test build never backs up. To put a backup back, exit Maestro and run `maestro restore-data`.
- **On Their Own Pages:** where the rest went, each a button to it: Games › Setup (programs, the PSO session, RetroAchievements), Command Center › Today's Settings (the Wikipedia almanac and the weather), Quick Notes (spell-check), Sounds (Maestro sounds), Commands, System (monitored drives) and Calendar (countdowns).

**Games › Setup** *(2.0.0; was Preferences › Games & Apps)*: **Programs** (RetroArch, Dolphin, PCSX2), **PSO Session** (the launcher, Discord, the voice channel, headphones and the SoundSwitch shortcut) and **RetroAchievements** (**Open secrets file**, and **Check now** for your picture). A field saves when you leave it, and the title bar says so beside the page's name ("Saved at 2:32 PM"); until the saved values arrive the fields are disabled. **Today's Settings**, on the Command Center's Today module, holds the Wikipedia almanac and weather switches, which save as they're switched, and the location used for sunrise, sunset and the weather.




### Toasts

What a hotkey just did shows as a short toast at the top center of the monitor with the active window, in place of the tooltip that used to follow the cursor. Up to three stack, each for three seconds, with the oldest dropped first; the same message again restarts its time and shows a count (×2). The toast never takes focus, and clicks go through it, so it can't interrupt typing or a game. It shows over fullscreen games too. While Maestro is the window in front, its own toast is used instead, so a notice never shows twice.

*(2.0.0)* Starting up: every start (sign-in, Ctrl+Alt+Shift+A, a reload, a test build) shows **Maestro is tuning up…** at once. The hotkeys wait until Maestro's window exists, and until the page has loaded, Super says **Maestro is still tuning up** rather than opening a blank window (after 30 seconds it opens anyway). When the page has loaded, a toast says **Maestro is ready.**, once a run.

### Workspaces

Super + S saves the **Default** arrangement and Super + R restores it. Named arrangements are saved with Super + Shift + S, from the palette (“Save arrangement as…”), or on the **Workspaces** page, and chosen with Super + Shift + R. Names use letters, numbers, spaces, `-` and `_` (up to 40 characters).

**The Workspaces page** *(Ctrl + 4)*: two sections, each a tab: **Arrangements** and **Launch Rules**. Both fit the window without scrolling; long lists scroll inside their module. On the Arrangements tab, the arrangement being edited takes most of the page, and beside it **Saved Arrangements** lists every arrangement with a drawing of its first desktop, its window count and its desktops; clicking one opens it. **Save open windows…** at the foot of the list saves the windows open now under a name, and asks before replacing one. For an arrangement there's **Restore**, **Save over** (after a confirmation), **Rename** (in place; Default keeps its name), **Duplicate** and **Delete**. Until the list arrives, its space shows a loading indicator, and with nothing saved, the page says how to save.

Below that, a tab for each desktop (and **All desktops** in gold for windows pinned to every desktop) shows that desktop on a canvas: a screen per monitor, at the monitor's real shape (saved with the arrangement; older arrangements use the monitor as it is now), with each window drawn where it sits and labeled with its app and title. The list under the canvas names every window, including one hidden behind another, and says when a window is off or its app isn't on this PC.

**Editing**: select a window on the canvas or in the list, and **Selected Window**, headed by its app with its title below, changes where it goes: **Desktop**, **Monitor** (with more than one), a ready-made **Place** (thirds, halves, Full), or exact percentages. Drag a window to move it, or an edge or corner to resize it; edges stick to the monitor's thirds and middle and to other windows, otherwise to a whole percent, and Esc cancels. With a window focused, the arrow keys move it by one percent, and Shift and an arrow key resizes it. **On every desktop** pins it. **Restore this window** off keeps it in the arrangement, but Restore leaves it alone. **Remove** takes it out (an arrangement keeps at least one window; delete the arrangement instead), and **Add an open window…** adds one from this desktop and shows it where it landed. A window that fills the usable screen is **Full** and is restored maximized, however it got there: saved that way, typed, dragged, or from an older arrangement. Editing changes only the saved file, never an open window: Restore is what moves them. **Save over** replaces all of it, including which windows are off.

**Launch rules**: when an app starts, its first main window within 15 seconds goes where you remembered: its monitor, its place or maximized, and its desktop (found by name, then by number; if there's no such desktop, it stays on the one it opened on). Rules only move windows; they never open anything. Open the **Launch Rules** tab, put a window where you want it, choose it under **Add a Rule**, then **Remember where it goes**; or use **Always open here** on a saved window to take that saved place. There's one rule per app, up to 50, each with an on/off switch and **Delete**. They're saved in `data\rules.ini`. An app that's already running isn't touched, nor are its later windows.

**Across desktops** *(with `VirtualDesktopAccessor.dll`)*: a save takes windows from every virtual desktop, up to 48, recording each window's desktop (and the desktops' names) and whether it's pinned to all desktops; a restore puts each window back on its desktop (a desktop named in Task View is found by name, otherwise by number) and pins the pinned ones again. If the arrangement needs more desktops than there are, it asks first: **Yes** adds them, **No** puts those windows on the last desktop, **Cancel** doesn't restore. Without the DLL, and for arrangements saved before desktops were recorded, everything stays on the current desktop as before. Positions are now saved as the window's visible frame, so a restore lands exactly where the window was (before, it landed a border's width off and a little larger).

- **Save** captures up to 24 visible application windows on the current desktop (48 across every desktop, with the DLL). It skips minimized, cloaked (other-desktop, unless saving across desktops), tool, and owned windows and the desktop/taskbar. It also skips suspended system windows that belong to no desktop (a closed Settings, the input panel) and the inside of a Store app's frame, which used to inflate the count; arrangements saved earlier ignore those entries when shown or restored, without changing the file. The notice reads "3 windows across 2 desktops". A window that cannot be measured is skipped and logged instead of canceling the save. Explorer windows also record their folder.
- **Restore** reuses open windows before launching anything. First it matches exactly (same Explorer folder, or same title); then it matches any unclaimed window of the same application. An application is launched only when none of its windows remain: Explorer reopens the saved folder, and Terminal opens through `wt.exe`. Matching continues for up to 20 seconds per window.
- A missing or failed restore shows an information dialog.

### Attention list

*(2.0.0)* Nothing shows while all is well. When something needs you, a button appears beside the clock ("3 need attention") and opens a list. Each item says what's wrong and offers its next step: a page error is burgundy, with **View log**, which opens the logs and clears it; a monitored drive at 90% or more, or the processor or memory over 90% for three readings in a row, is gold, with **Open System**. While the daily backup is on *(2.1.0)*, a backup that failed is burgundy and three days or more without one is gold, each with **Open Preferences**. **Dismiss all** hides what's listed until that problem clears; if it comes back, it shows again. During `maestro try`, a separate gold chip says it's a test build. Readings arrive only while the window is showing.

### Tray Menu

Click the tray icon to show Maestro. Right-click for Show Maestro, Command palette, Quick Notes, Preferences, Save arrangement, Restore arrangement, Open data folder, Open log file, Reload Maestro (Ctrl + Alt + Shift + A), and Exit Maestro. Reload and Exit save pending note edits first.

## 6. Keyboard Shortcuts

“Super” is the dedicated key (F24 from Keychron Launcher). Letters marked *configurable* can be changed under Commands › Key Map.

| Shortcut | Action |
| --- | --- |
| Super | Show Maestro on the last-used view (Command Center after startup), or hide it |
| Super + Space | Command palette |
| Super + Q *(configurable)* | Quick Notes |
| Super + Shift + C | Quick capture: copy the selection (or clipboard) into a new note |
| Super + Shift + P | Palette: paste a note |
| Super + S | Save the Default arrangement |
| Super + R | Restore the Default arrangement |
| Super + Shift + R | Palette: choose an arrangement |
| Super + F *(configurable)* | Everything |
| Super + I *(configurable)* | System |
| Super + B | Focus Vivaldi here, switch to its desktop, or open it |
| Super + T / E *(configurable)* | Reuse Terminal / Explorer, switching desktops if needed |
| Super + Shift + T / E | New Terminal / Explorer window |
| Super + C / H *(configurable)* | Ask Claude / Task Manager |
| Super + M4 | PSO session: headphones (through SoundSwitch), Discord (opening the voice channel set in Games › Setup, if any), then the Ephinea launcher; when PsoBB.exe closes, the previous audio device comes back and Maestro offers to close Discord |
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
| Inside Maestro: / / F6 and Shift + F6 / Arrow keys / Alt + Left and Right, or mouse back and forward | Open search (not while typing) / next or previous area: sidebar, title bar, page / move to the nearest control in that direction (not while typing) / previous and next page |
| Inside Maestro: Ctrl + 1–8 / Ctrl + - / Ctrl + = / Ctrl + N / Ctrl + M / Ctrl + E / Ctrl + F / F1 | Switch page (each sidebar item shows its key) / Preferences / open or close the power tray / new note / on Quick Notes, the Markdown viewer or the text editor / new calendar event / search this page (pages with a search box) / open or close Help (also the ? button in the title bar). None of these act while a dialog is open. |
| Ctrl + Alt + Shift + A | Start Maestro when it is not running; save notes and reload it when it is (requires the launcher; see [Installation](#10-installation-and-startup)) |

**Super + Shift layer:** C (capture), P (paste a note), D (new folder), and F (new file) always perform their Shift action, even when a configurable action or custom command uses the letter without Shift. When C, D, F, or P has no assignment, Super + that letter passes the Windows shortcut through (for example, Win + D shows the desktop). **Super + Shift + S** is "save as": the palette opens on name entry, and Enter saves the current window layout under that name (Super + S still saves the default arrangement). The Snipping Tool is in the palette. Other keys keep their Super action when Shift is added. The keyboard map in Super Commands shows both layers. Launched applications take focus only if you haven't switched to another window in the meantime.

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
| `SetHistoryScale` | `seconds`, `tens` or `minutes` | *(2.0.0)* The history System's graphs show |
| `GetWeather` / `SetWeather` | None / `on` or `off` | *(2.0.0)* The forecast, from a 30-minute cache or fetched; turning it off deletes the cache. Answered with `weatherSettings` and a `WEATHER` string |
| `GetHomeStats` | `network`, `processes`, or both, comma-separated | *(2.0.0)* Network speed and the busiest apps, answered with `homeStats` |
| `CountdownTimer` | Seconds, 1 to 86400; `0` cancels | *(2.0.0)* The Timer module's timer, announced with a toast when it ends (`timerDone`) |
| `GetAlmanac` | None | Almanac settings, then today's cached Wikipedia feeds (fetching them if missing and enabled) |
| `SaveAlmanac` | `1` or `0`, then `date\|name` lines (≤ 2 KB, up to 12 countdowns) | Almanac preferences |
| `OpenWikipedia` | Article title (≤ 200 characters) | Opens `https://en.wikipedia.org/wiki/<title>`; the title is validated and the address built by Maestro |
| `GetGames` / `GetGamesLive` / `GetRunning` | None | The library (no file paths) / now playing, running apps and controllers / running apps for the keyboard map |
| `LaunchGame` | Game id (`ra:<n>`, `ps2:<serial>`, `gc:<ID>`) | Plays a game from Maestro's own index with the configured emulator |
| `GetCovers` | Comma-separated game ids (up to 40) | Queues cover art, sent as `COVER` strings with a checked PNG/JPEG data URI |
| `GetGameSettings` / `SaveGameSettings` | None / `retroarch\|dolphin\|pcsx2\|pso\|discord\|headphones\|soundswitch\|covers\|voicechannel` | Games › Setup |
| `SetShowCovers` | `0` or `1` | Turns cover art on or off (only that setting), answered with the library |
| `CalDav` / `SetReminders` | `id\|operation\|calendar\|event\|version` and a body / reminder lines (`at`, title, when, start, location; tab-separated) | One CalDAV request built by Maestro (reply: `CAL` string) / the next three days' reminders |
| `PowerAnyway` | None | Go ahead with a restart, shutdown or sign-out held for unsaved work (only while one is held) |
| `DeleteLeveledSound` / `RestoreAllSounds` | Sound id / None | Move a leveled copy to the Recycle Bin / restore every sound Maestro changed |
| `GetSignInHistory` | None | Recent sign-in times from `%LOCALAPPDATA%\StartupTasks.log`; test runs are left out (reply: `signInHistory`) |
| `GetStartupSounds` | None | The sign-in roll and the shutdown sound (reply: `startupSounds`) |
| `SetStartupSound` | `add\|<sound id>` or `shutdown\|<sound id>` (≤ 600 characters) | Add a library WAV to the sign-in roll at 0% (up to 8, no repeats) or make it the shutdown sound |
| `RemoveStartupSound` / `RestoreStartupSound` | Slot `1`–`8` / slot, `shutdown` or `all` | Take a sound out of the roll (its chance goes to the first; one always remains) / go back to the original it was leveled from |
| `SaveStartupOdds` | Comma-separated whole numbers, one per sign-in sound (≤ 60 characters) | The chances; refused unless each is 0–100 and they add up to 100 |
| `GetInUseOrigin` | `windows:<event>`, `ascs:<kind>` or `startup:<slot>` | The original behind a sound in use, as a `SOUND` string with id `origin:<key>`, for Match |
| `DeleteLeveledSounds` | Up to 10 sound ids, one per line (≤ 6,000 characters) | Select › Delete: each copy checked and moved to the Recycle Bin; any id that isn't a leveled copy refuses the whole request (reply: `soundsDeleted`) |
| `ExportCalendarFile` / `ImportCalendarFile` | Calendar name and .ics text / None | Windows' Save dialog writes the file / Windows' Open dialog reads one (reply: `ICS` string) |
| `RefreshRaPicture` | None | Fetches the picture for the user name in `data\secrets.ini` again (reply: `raPicture` with a message; the image as `RAIMG`) |
| `GetRaImages` | Up to 30 image tokens (`b:<digits>` badge, `i:<digits>` game icon, `u:<name>` user picture) | Cached or downloaded images, sent as `RAIMG` strings with a PNG data URI |
| `StartControllerTester` / `StopControllerTester` | `h<handle>` / None | Raw Input tester for a D-input or Switch-mode pad (the handle must be in Maestro's current device list) |
| `GetRetroAchievements` / `SetupRetroAchievements` | `refresh` (optional) / None | Fetches (sent as `RA` strings) / creates and opens `data\secrets.ini` |
| `StartPsoSession` | None | The Super + M4 session |
| `PowerArm` / `PowerRun` / `PowerCancel` | `restart`, `shutdown`, `signout`, `sleep` or `recycle` / `action\|ticket` / None | Guarded actions: arm (after a completed hold), run with the single-use ticket, cancel a countdown |
| `PowerNow` | `lock` | Lock the workstation |
| `GetRecycleBin` / `GetAudioDevices` / `SelectAudioDevice` | None / None / device name | Recycle Bin size / active playback devices / switch output through SoundSwitch |
| `GetGameDetails` / `ShowGameFile` | Game id | A game's details (sent as `gameDetails`) / Explorer at its file or install folder |
| `GetControllerInput` / `RumbleController` | `x0`–`x3` (XInput) or `j0`–`j15` (joystick API) | Live input for the tester / a half-second rumble (XInput only) |
| `RenameController` | `VVVV:PPPP\|name` (empty name resets) | Maestro name and Windows' per-user game controller name |
| `GetRaGame` / `GetRaUnlocks` | A RetroAchievements game ID (1–9 digits; `refresh:` before it to fetch again) / `refresh` (optional) | One game's achievements with the user's unlocks, sent as an `RA` string of kind `game:<id>` / the last 30 days of unlocks, kind `unlocks`; a failure replies `raExtra` |
| `GetRaAwards` | `refresh` (optional) | The profile's awards (`API_GetUserAwards`), sent as an `RA` string of kind `awards`; a failure replies `raExtra` |
| `OpenBluetoothRename` / `OpenRetroAchievementsProfile` | None | Devices and Printers / the user's profile page, built from the validated user name |
| `GetLog` / `OpenLogFile` | `ascs`, `activity` or `codebutton` (optionally `\|refresh`) | Log tail / open in Notepad |
| `GetSettings` / `SaveSettings` | None / `drives\|gap\|preserve\|keys\|claudeShortcut\|powerDelay\|ascsSounds\|searchUrl` | Preferences and Commands |
| `GetCommands` / `SaveCommands` | None / one command per line: name, kind, target, key (tab-separated) | Custom Commands |
| `RunCommand` | Command index (1–30) | Runs a saved custom command |
| `BrowseCommandTarget` | `row\|app` or `row\|folder` | Opens a file or folder picker |
| `SaveBackups` | `0\|HHmm` or `1\|HHmm` | *(2.1.0)* Turns the daily backup off or on and sets its time; on is refused until a folder is chosen |
| `ChooseBackupsFolder` | None | *(2.1.0)* Opens Windows' folder picker for the backups folder, which AHK checks before keeping. The page never sends a path |
| `BackupNow` | None | *(2.1.0)* Starts a backup, unless one is running |
| `OpenBackupsFolder` | None | *(2.1.0)* Shows the backups folder in Explorer |
| `GetWorkspaces` | None | Lists saved workspaces |
| `SaveWorkspace` / `RestoreWorkspace` / `DeleteWorkspace` | Workspace name (`Default` or empty for the default) | Named workspaces |
| `RenameWorkspace` | `old\|new` (both validated; Default keeps its name) | Renames a saved workspace; an existing name is refused |
| `SetWorkspaceWindow` | `name\|index\|desktop\|monitor\|x\|y\|width\|height\|maximized\|pinned\|enabled` (≤ 120 characters; every field range-checked, and the place must fit on the monitor) | Edits one saved window in the file. Only these fields: never its app or path |
| `RemoveWorkspaceWindow` | `name\|index` | Removes a saved window and renumbers the rest; the last one stays |
| `AddWorkspaceWindow` | `name\|window handle` | Adds an open window; AHK reads its app and place from the window itself |
| `DuplicateWorkspace` | `name\|new name` (both validated; an existing name and Default are refused) | Copies a saved workspace |
| `GetLaunchRules` | None | Lists launch rules; the reply is `launchRules` |
| `RememberWindowRule` | Window handle (≤ 20 characters) | An open window's app and place become that app's rule |
| `RuleFromWorkspaceWindow` | `name\|index` | A saved window's app and place become that app's rule; the path comes from the file |
| `SetLaunchRuleEnabled` | `1\|path` or `0\|path` (≤ 270 characters; the path is validated) | Turns a rule on or off |
| `DeleteLaunchRule` | Path (≤ 270 characters; validated) | Deletes a rule |
| `GetWindows` / `FocusWindow` | None / window handle | Window switcher; the handle must still be an eligible window |
| `PasteNote` / `CopyNote` | Note text with placeholders filled (≤ 256 KB); `{clipboard}` and `{cursor}` as private marks | Pastes into the previously active window, placing the cursor / copies to the clipboard. *(2.0.0)* The palette's calculator copies its answer with `CopyNote` too |
| `SearchWeb` / `SearchFiles` | Query (≤ 1000 characters) | Web search / Everything search |
| `OpenNoteLink` | Address (≤ 2048 characters) | *(2.0.0)* Ctrl + click on a link in a note's Markdown viewer: opens an http or https address in the default browser, after `ValidateNoteLink` |
| `GetActivity` | None | Activity feed |
| `SaveQuickActions` | Up to six ids, one per line (`view:`, `launch:`, `mode:`, `cmd:`, `ws:`, `snippet:` (paste a note) or `note:` (open it) followed by a name) | Pinned quick actions; each id is validated, and running one uses the palette's existing messages |
| `Log` | Text (≤ 4 KB) | Diagnostic log entry |

### AutoHotkey to Frontend

AutoHotkey sends JSON with `PostWebMessageAsJson()`.

| Type | Purpose |
| --- | --- |
| `navigate` / `resume` | Show a view / refresh the current view after re-showing |
| `windowState` | `maximized` true or false, for the title bar's maximize/restore glyph |
| `windowMinimized` | `minimized` true or false; Live stops asking for readings while minimized |
| `openLauncher` | Open the palette; `mode` is `""`, `snippets`, or `workspaces` |
| `notes` / `saved` / `flushNotes` | Notes data (`recovered`, `external`) / save acknowledgement / save now |
| `testBuild` | This is a test build on a copy of the data (`data\test-build.txt` exists), so the title bar says so |
| `captureNote` | Quick-capture text and source window title |
| `metrics` | CPU/RAM, legacy C: fields, `drives: [{letter, usage, used, total, online}]`, `historyScale` and `history: [[cpu, ram], …]` or `[[average cpu, average ram, peak cpu, peak ram], …]` (oldest first; null when the scale on screen has no new point), plus hardware once collected |
| `quickActions` | Pinned quick action ids, or `null` when never customized |
| `settings` / `settingsSaved` | Preferences and the settings Commands edits (including `searchTemplate`) / saved |
| `commands` / `commandsSaved` | Custom Commands `[{id, name, kind, target, key}]` / saved |
| `workspaces` | `monitors`, and `items: [{name, windows, saved, layout, desktopNames, aspects}]`; each `layout` entry has its place in the file, app, title, desktop, monitor, place, and whether it's maximized, pinned, on, or missing its app |
| `launchRules` | `items: [{path, app, enabled, monitor, x, y, width, height, maximized, desktop, desktopName, pinned}]` |
| `windows` | `[{id, title, app, minimized}]` |
| `browseResult` | Picker result for a custom-command row |
| `backups` | *(2.1.0)* The daily backup's settings, whether one is running, and the last result, for Preferences and the attention list |
| `backupsSaved` | *(2.1.0)* Whether a backup setting was kept, with why when it wasn't |
| `activity` / `activityAdded` | Activity list / one new entry (`{time, kind, text}`) |
| `powerHeld` | A power action held for unsaved work: `action` and `apps` (names) |
| `signInHistory` | `items: [{time, retrobar, taskbar, apps, keychron, sound}]`, newest first, up to 20; times in ms after `SignIn.ahk` starts |
| `startupSounds` | `signin: [{weight, file, id, origin, exists, changed}]` and `shutdown: {…}`; ids are relative to the library, never paths. `taskWarning`: why the sign-in scripts aren't using these settings, or empty |
| `raExtra` | A game or the recent unlocks couldn't be fetched: `kind`, `ok: false`, `message` |
| `soundsDeleted` | One Select › Delete batch: `ok`, `deleted`, `skipped: [{id, reason}]`, and `message` when refused |
| `notice` | Toast message (only sent while Maestro is visible) |
| `error` | Error toast; optional `scope` is `notes`, `settings`, or `commands` |

## 8. Security


- **Client name:** every request names the client the same way, `Maestro/<version> (Aeolionware)`, with no contact address. *(2.0.0)* The almanac's Wikimedia requests no longer carry the owner's email address, at the owner's request.
- **Weather (2.0.0):** asked for only while the Weather module shows, and at most every 30 minutes (15 after a failure). One fixed address on api.open-meteo.com over HTTPS, built in AHK from the almanac's location rounded to two decimals; redirects are off, with timeouts, a 200 KB cap and a shape check. No account, key or contact details are sent. The reply is cached in `data\weather.json` and given to the page as a plain string, which takes only the numbers it shows, each range-checked. Turning it off deletes the cache.
- **Network and Top Apps (2.0.0):** Windows' interface table and each process's times, working set and image name, read only; every buffer-filling call is probed with guard bytes in the core tests. Nothing is sent anywhere, and a process can't be closed from here.
- **Almanac:** the Wikipedia almanac is off until turned on (in Today's Settings on the Command Center). When on, Maestro requests two fixed addresses on en.wikipedia.org (the featured feed and today's observances) once a day over HTTPS, with certificate checks on, redirects off, timeouts, a 3 MB size cap, and a User-Agent naming Maestro (no email address). Failures back off for 30 minutes. The feeds go to the page as plain strings (never as script or markup), where only expected fields are read, control characters are stripped, lengths are capped, and everything is rendered as text. Links are never taken from the feeds: the page passes an article title, which Maestro validates before building the en.wikipedia.org address itself. The page's own content security policy still forbids it any network access.
- **Power actions:** restart, shut down, sign out, sleep and emptying the Recycle Bin need a completed press-and-hold, then a single-use, 10-second ticket issued by Maestro (a stray, repeated, mismatched or late request is rejected and logged). Shutdowns are never forced (Maestro counts down itself and runs `/t 0`, because Windows' own timer implies `/f`) and can be canceled, and `shutdown.exe` is run from the Windows folder by full path. None of these is reachable from a hotkey, a quick action or the palette. Verified with the real calls replaced by log lines.
- **Controllers and stability:** Maestro does not use DirectInput or the classic joystick API (winmm), which runs on it: in testing, DirectInput's device re-enumeration corrupted Maestro's memory when a controller connected or slept mid-scan, crashing Maestro. Controllers are read through XInput and the Raw Input device list only, and every new native call was checked with guard bytes for writes past its buffer.
- **Steam and controllers:** Steam's files are only read; games start only through `steam://rungameid/` with a numeric app id checked by Maestro. Renaming a controller writes one value, `OEMName`, under the current user's `Joystick\OEM\VID_xxxx&PID_yyyy` key (validated name, no administrator rights); Maestro never changes Bluetooth or device settings itself.
- **Games:** the emulators' files are only read, with sizes capped and every parser reading only expected fields. The page receives titles and play time, never file paths; it sends back only a game id, which Maestro validates and looks up in its own index, and launches use the configured emulator with the indexed path quoted (paths containing quotes are refused). Program paths in Games › Setup must be existing `.exe` files. Cover art is read from local folders only, checked to be a PNG or JPEG of at most 1.5 MB, and passed as a data URI; nothing is downloaded.
- **RetroAchievements images:** downloaded only from `media.retroachievements.org`, by an address Maestro builds from a validated number or, for a user's picture, a name of only letters, digits and underscores (never a URL from the response), with HTTPS, no redirects, a 256 KB cap and a PNG signature check, then cached on disk. The 20 MB cache cap deletes only files named like Maestro's own images (`b-<digits>.png`, `i-<digits>.png`, `u-<name>.png` and their partial writes).
- **Running a test build:** `maestro try` copies `data\`, including `secrets.ini`, into a second checkout, where git ignores it, and `maestro try --end` deletes it. It only deletes a folder it marked itself. The copy's calendar config is rewritten and checked so it can't reach the real calendar. `maestro backup-data` keeps its copies in the folder named by `Folder` under `[Backups]` in `data\settings.ini`, which must be a full path on a drive inside this PC and outside Maestro's own folders: each copy holds `secrets.ini`. With no folder set, or one that fails that check, there is no backup: it never falls back to another place. `maestro restore-data` replaces `data\` only with Maestro closed, only from a folder in the backups folder that the command itself named, and only after copying the data as it is now to the backups folder. Maestro exits on the `Aeolionware.ASCS.Exit` window message, which, like the existing reload message, any program running as the same user can send.
- **Backups** *(2.1.0)*: no network use, listener or elevation. The page sends only on or off and a time. The folder comes from Windows' folder picker and is kept only if it's a full path to a folder on a fixed drive of this PC, outside Maestro's own folder; AHK checks that, and the command checks it again before every backup. Maestro starts one fixed command line (`pwsh` running `tools\cli\Maestro-Cli.ps1 backup-data`) with nothing from the page in it, and reads back only a time, `ok` or `failed`, and one line of text, which it tidies and caps. A backup holds `secrets.ini`. A test build can't start one, so a copy of your data never lands in the real backups folder.
- **The notes trash** *(2.1.0)*: no network use, listener, timer or new message; it's saved through `SaveNotes` with the notes. AHK refuses a save whose `deletedAt` isn't a plain UTC time, and the page drops any trash entry that isn't a whole note with one, so one bad hand edit costs that entry and nothing else. A trashed note's title and text are only ever shown as text.
- **Game notes:** no network use, listener or new message. Notes go through the existing `SaveNotes` route, which checks the new `game` field. A game's title can come from a window's title, so it's treated as untrusted: it's tidied of control characters, capped in length, and shown only as text.
- **Site Badges:** one more request to retroachievements.org, with the same key and a fixed address, only while the Achievements section has been on screen, kept for 10 minutes (a refresh can't ask again within a minute). The page takes text and numbers from the reply, and art only as a numbered token, so no address ever comes from a response. A community award has no such number, so it's a text label.
- **RetroAchievements:** opt-in by creating `data\secrets.ini`, which git ignores. The user name and key are validated, read only when a request is made, never sent to the page and never logged (request addresses are not logged either). Only two fixed retroachievements.org API addresses are requested, with the same HTTPS rules as the almanac; responses are parsed in the page as text and numbers only, with no images or links taken from them. The achievement browser adds two more on the same site with the same key, fetched only when asked for: one game's achievements (`API_GetGameInfoAndUserProgress`, by a game ID Maestro checks is 1 to 9 digits, `ValidateRaGameId`) and the last 30 days of unlocks (`API_GetUserRecentAchievements`); each is kept for 10 minutes, a refresh can't repeat it within a minute, and at most 30 are kept. Their values are checked one by one in the page (`parseRaGame`, `parseRaUnlocks`: text cleaned and capped, numbers non-negative, dates in their exact format, types from a fixed list, badges only as plain numbers), and tested with hostile input.
- **Logs:** the page names one of three fixed sources and never supplies a path; only the file's tail is read, and lines are shown as text.
- **Calendar:** Radicale listens on 127.0.0.1 only (checked: not reachable from the LAN address), requires a password (a random 32-character one in `data\secrets.ini`; Radicale's user file keeps only a SHA-512 crypt hash), lets the account see only its own calendars, and has no web interface. It was installed with `--require-hashes --only-binary=:all: --no-deps` from a pinned list checked against PyPI. The page never talks to the server and never sees the password: it names an operation (list, read, save or delete events; create, edit or delete a calendar) with validated ids, and Maestro builds exactly one request for it (`CalDavRequest`, unit-tested), adds the password, and returns the reply. A new event can never overwrite another (`If-None-Match: *`), and an edit applies only to the version shown (`If-Match`). Undo goes through the same requests: it puts back the previous text only over the version it saved (`If-Match`), recreates a deleted event only where none exists (`If-None-Match: *`), and removes a new one only if unchanged. Maestro stops only server processes whose command line points at its own configuration. Verified end to end in an isolated copy with a throwaway store.
- **Quick Notes groups:** a note's group is plain text, shown as text. Every save is checked by Maestro (`CheckNoteGroups`): each `group` must be a string of up to 60 characters without control characters, or the save is refused and the previous file kept. Open and pinned groups live in the page's own storage, never in notes.json.
- **Sounds:** the page never names a file: Maestro indexes the sound library and sends a sound only by its index entry (the library may not be a drive root, the Windows folder or a profile folder). Sounds reach the page as base64 and play through Web Audio, so the Content Security Policy is unchanged. Leveled copies are checked to be WAV files, capped at 32 MB, and written only into `ASCS Leveled` under new names. Windows sounds are changed only for 19 allowlisted events in the current user's `AppEvents`, only to WAV files in the library, with the previous value and its type kept for **Restore**. Verified in an isolated copy against a test registry key. Deleting is limited to leveled copies, goes to the Recycle Bin, and is refused for a copy in use.
- **Startup sounds:** the page names startup sounds only by library id and slot; Maestro checks each is a WAV in the library, writes only its own `data\startup-sounds.ini` (to a temporary file, then moved into place), and validates the chances itself. `UseLeveledSound` takes the original from Maestro's own record (`origin`), never from a path in the request. The sign-in scripts read the file as data (whole-number chances and paths ending in `.wav` that exist) and fall back to Windows' own sounds; nothing in it is run. A copy used as a sign-in or shutdown sound can't be deleted. Own levels are numbers kept in the page's storage and only change the gain the page asks for, which Maestro already bounds. Clearing replaced copies is decided by Maestro alone, never by a request from the page: only a WAV directly in `ASCS Leveled`, not saved by hand, that nothing plays and no Restore points to, and only to the Recycle Bin.
- The backend accepts bridge messages only from `https://ascs.localhost`, validates every message type and payload, cancels navigation to other origins, and blocks new windows.
- Release WebView settings disable DevTools, default context menus, browser accelerator keys, zoom, and **host objects**. WebViewToo would otherwise inject a `global` object into `*.localhost` pages that exposes every AutoHotkey function to page script.
- The frontend Content Security Policy allows only local scripts and resources (inline styles and data images allowed).
- Nothing in the bridge executes arbitrary commands. Custom Commands run only entries saved in `data\commands.ini`, validated on save and load: an existing `.exe`/`.lnk` started without arguments, an existing folder opened in Explorer, or an `http(s)` URL opened in the default browser. The frontend refers to them by index only.
- Web searches are percent-encoded into the configured `https://` address. File-search queries have quotes and control characters removed before they are passed to Everything as one quoted argument.
- A note's Markdown viewer is built from text elements only; Markdown never becomes HTML, and images are never loaded. *(2.0.0)* A link opens only on Ctrl + click, and only an http or https address, which AHK checks again (`ValidateNoteLink`: no other scheme, no spaces, quotes or control characters, no user name or password before the host, at most 2,048 characters) before handing it to the default browser. Parsing is capped in depth (quotes and lists 8 deep, marks 6) and table size, so a crafted note can't stall the page. Quick action ids are validated against a strict pattern before they are stored, and they only ever select existing palette actions.
- Notes are pasted through the clipboard (restored afterwards), never typed as keystrokes; `{cursor}` then presses Left at most 2,000 times. Window focus requests are checked against the eligible-window rules used by workspaces.
- **Toasts:** a native window with no input: it can't take focus or receive clicks, and its text is shown literally. It's built only while there's something to show.
- Workspace names are restricted to a safe file-name character set; workspace restore launches only validated executables, without arguments.
- **Editing workspaces:** the page sends only places and switches for a saved window, each range-checked in AHK (`ParseWorkspaceWindowEdit`). It can never set an app's path or command, because Restore launches what the file holds: a path is only ever captured by AHK from a real window, and checked again at restore. Each edit works on a copy of the file and swaps it in, so a failure leaves the workspace as it was. Editing never touches an open window.
- **Launch rules:** no listener, no elevation, and nothing is launched. `RegisterShellHookWindow` only tells Maestro when top-level windows are created; Maestro then looks at a window for up to about 3 seconds and moves it only if its app has a rule that's on, its process is under 15 seconds old, and it's that process's first main window. App paths are validated when saved and when read from `data\rules.ini` (a drive-rooted `.exe`, up to 260 characters, no `..`).
- The sign-in task check only reads Task Scheduler, unelevated, through its local COM service. Maestro never registers, changes or removes a task, and never asks for elevation; only you run `Configure-Startup.ps1`.
- Restrict write access to `C:\ASCS` (including `data`) to the installing account, Administrators, and SYSTEM, and do not run Maestro elevated.

## 9. Dependencies

**Required:** Windows 10 or 11 (Windows 11 is the verification target); AutoHotkey v2 64-bit; the Microsoft Edge WebView2 Runtime (Evergreen preferred); WebViewToo under `C:\ASCS\webview`; and Keychron Launcher configured to emit F24 for the Super key.

**Optional:**

- Voidtools Everything for file search.
- `lib\VirtualDesktopAccessor.dll` for desktop switching, moving windows between desktops, and cross-desktop focus for Vivaldi, Terminal, and Explorer. It uses `GetDesktopCount`, `GoToDesktopNumber`, `MoveWindowToDesktopNumber`, `GetCurrentDesktopNumber`, and `GetWindowDesktopNumber`; Maestro treats nonnegative results as success. Workspaces across desktops also use `GetDesktopName`, `IsPinnedWindow`, `PinWindow` and `CreateDesktop` (only after asking), through failure-safe wrappers in `lib\features\Desktops.ahk`; each was probed on Windows build 26300 in a separate process first (names with guard bytes after the buffer; moving, pinning, creating and removing on a test window and a temporary desktop). Without it, desktop actions report a failure instead of opening duplicates.
- Microsoft Edge, which is used only to run the frontend tests headlessly.

**Fonts** *(2.0.0)*: Bahnschrift ships with Windows. Both fonts keep more room above their capitals than below the baseline, so a line centered in a button, row or menu sat 2 to 4 px high; each is loaded with that room split evenly (`ascent-override` and `descent-override`, keeping each line's height), so capitals sit in the middle. Bahnschrift is loaded by its Windows name as **Maestro Display**, at its SemiCondensed width. Lato 2.015 ships in `frontend\assets\fonts`, under the SIL Open Font License (`OFL.txt` beside it). Nothing is fetched from the network, and the page's content security policy allows fonts only from Maestro's own files. No page text is under 17 px; the keyboard map is a drawing that scales with the window, so its labels are 17 px or more at the default window size and smaller in a narrower one. *(2.0.0)* Preferences › Appearance sets the text size (Default, Larger, Largest) and when the logo's arm swings (the first time the window opens after Maestro starts, every time, or never; Windows' reduced motion setting turns it off). Both are kept in the page's local storage, like the spell-check setting, and need no backend message.

## 10. Installation and Startup

1. Install AutoHotkey v2 (64-bit) and the WebView2 Runtime.
2. Configure the Keychron Super key to emit F24.
3. Place the repository at `C:\ASCS`, with WebViewToo under `webview` and (optionally) the virtual-desktop DLL under `lib`.
4. Restrict write access as described in [Security](#8-security).
5. Run `pwsh -File C:\ASCS\tools\Install-Shortcut.ps1`. It creates a **Maestro** Start Menu shortcut (to pin), registers **Maestro Launcher** in your Startup folder, and starts the launcher, which enables **Ctrl + Alt + Shift + A**. Add `-Startup` to also start Maestro itself at sign-in, or `-Remove` to delete everything it created and stop the launcher.
6. Press Ctrl + Alt + Shift + A (or run `C:\ASCS\ASCS.ahk`). Maestro starts hidden. Tap Super, or click the tray icon, to show it.

**Start or reload with one hotkey:** `ASCS.Launcher.ahk` is a tiny resident script (no tray icon) that owns Ctrl + Alt + Shift + A. When Maestro is not running, it starts Maestro. When Maestro is running, it sends Maestro a reload message; Maestro saves pending note edits and reloads. If an older Maestro does not acknowledge the message within two seconds, the launcher relaunches it, and `#SingleInstance Force` replaces the old instance. Maestro also handles the same keys itself, so reloading works even without the launcher; only starting a stopped Maestro needs it. `ASCS.Launcher.ahk --trigger` performs the action once and exits.

The hotkey lives in a launcher rather than on the Start Menu shortcut because Windows 11 does not reliably honor shortcut hotkeys in the Start Menu. After changing code or frontend files, reload with the hotkey, the tray menu, or **Reload Maestro** in the palette.

### Developing and running apart

Maestro reads its code and data from the folder it runs in, so whatever is checked out in `C:\ASCS` is what starts. Keep `C:\ASCS` on `master`, as the copy you use, and do branch work in a second checkout:

```powershell
git -C C:\ASCS worktree add C:\ASCS-2.0 -b feat/v2.0.0
```

The `maestro` command (`tools\cli\Maestro-Cli.ps1`, run through `C:\Scripts\maestro.cmd`; `maestro help` lists it all). *(2.0.0)* It replaces the `ASCS` command entirely: `C:\Scripts\ASCS.cmd` and `maestro.cmd`'s fallback to `ASCS-Cli.ps1` were removed once 2.0.0 was on master.

| Command | What it does |
|---|---|
| `maestro status` | Each checkout's branch and version, whether the version agrees everywhere, what's running and from where, whether that code is older than what's on disk, and errors logged since it started |
| `maestro check` | The tests, parse check and hidden-character scan for the checkout you're standing in, with one result (`--quick` skips the tests) |
| `maestro try [folder]` | Closes Maestro, saving its notes, and runs a second checkout on a copy of your data, with its own calendar; the title bar says **TEST BUILD**. Windows sounds, controller names, power actions, audio switches, games and moved windows are still real |
| `maestro try --end` | Closes the test build, deletes the copy, and starts your real Maestro |
| `maestro backup-data` | Copies `data\` to the backups folder, which is chosen in Preferences › Backups (kept as `Folder` under `[Backups]` in `data\settings.ini`); with none chosen, it stops. Maestro runs this once a day when **Back up every day** is on. It works while Maestro runs. Kept: every copy from the newest day, the newest from each of the 14 newest days, and the first from each of the 6 newest months. A copy that can't be finished is removed, and each run's result goes to `data\backup-status.ini`. Each copy includes `secrets.ini`, so keep them on this PC |
| `maestro restore-data` | Lists the backups, newest first. Like `backup-data`, it's about your real data: with a test build's copy about, it names the copy and says it isn't touched |
| `maestro restore-data <number or name>` | Puts that backup back, replacing `data\`. Maestro must be closed (exit it from its tray icon). It asks first (`--yes` doesn't), and copies your data as it is now to the backups folder as `before-restore-…`, so a restore can itself be undone; the newest three of those are kept |
| `maestro cut-release` | Pushes the newest branch and fast-forwards `master` to it. It stops if there's uncommitted work in either folder or the CHANGELOG still says "in progress" |

## 11. Testing

### Automated

```powershell
pwsh -File C:\ASCS\tests\run-tests.ps1
```

- `tests\core.tests.ahk` covers `lib\ASCS.Core.ahk` (771 checks): toast stacking and timing, every field of a workspace edit and what must be refused, launch rule paths, which desktop an added window belongs on, which game RetroArch is running, sign-in timings, the sign-in task warning, suspended system windows in workspaces, workspace count wording, unsaved-work titles and VS Code's backup folders before power actions, note group and game link checks on save, Select › Delete request lists, passed countdowns, reminder pop-up text, which files count as leveled copies, the notification level board's requests, note placeholders at paste time, calendar files, calendar request building (every operation's method, path and headers, escaping, and what must be refused), ids, versions, colors and iCalendar checks, reminder lists, sound library rules (version folders, WAV lengths, library folders that must be refused, leveled file names, the Windows sound allowlist), Steam's binary app cache (a synthetic file built byte by byte, including a decoy and a truncated copy), RetroAchievements image addresses and the image cache cap, the emulators' record parsers (including binary game lists built in memory), Steam's manifests, library folders and play-time file, controller IDs, modes and names, executable paths, audio device matching, RetroAchievements credentials and game ids, the Claude quick-entry key combination grammar, countdown dates, the almanac payload, Wikipedia titles and feed addresses, shortcut-letter validation, quick action ids, drive lists, Explorer names, workspace names and executables, workspace relaunch commands, workspace window matching, custom-command validation and payload parsing, search templates and encoding, activity lines, and the JSON helpers.
- `tests\cli.tests.ps1` covers the `maestro` command (113 checks) against throwaway repositories, with stand-in Maestro scripts that only answer the exit message: every refusal in `cut-release`, `check` finding syntax errors and hidden characters, `backup-data` (a file locked by WebView2, a copy that can't finish, what's kept, and every folder it must refuse), `restore-data` (each refusal, the copy made first, and undoing a restore), and `try` and `try --end`, including that the copy's calendar points at the copy and that the real data doesn't change.
- `tests\frontend.tests.html` covers `frontend\palette.js`, `keymap.js`, `notes.js`, `charts.js`, `almanac.js` (with `quotes.js`) `logs.js`, `games.js`, `sounds.js`, `calendar.js`, `workspaces.js` and `backups.js` (1232 checks) in headless Edge, including game note keys and timestamps, the awards reply and its tabs, workspace places, percentages, the edit message, dragging and snapping, and note groups (sections, rename and merge, delete, palette matching) and US holiday dates. For the calendar: iCalendar reading (folding, escapes, all-day, UTC, floating and named time zones, including summer time), repeats (weekly days across the end of daylight saving, the 31st in short months, the 2nd Tuesday and last Friday, 29 February, counts, end dates, skipped dates, moved occurrences), reminders, writing that keeps a phone's own properties, and server replies. For sounds: WAV files built byte by byte in every supported format (8-, 16-, 24- and 32-bit, float, extensible, with extra chunks), levels against known values, gain plans with clipping limits, and gain applied in place. For the keymap, these include the Windows passthrough keys. For notes: tags, filter queries, Markdown structure, and hostile input (HTML and script markup must stay plain text). For charts: sparkline geometry, clamping, and bad data. For the palette: the calculator, query parsing, matching, ranking, usage history, and workspace-name rules. For the keymap: layout integrity (108 unique, non-overlapping keys of the customized Q6 Max, including the planned Code and macro keys), Super and Super + Shift bindings, Shift-layer precedence, Windows passthrough, and robustness with missing settings.

- `tests\smoke.js` runs the real page (every module and stylesheet, from a copy of `index.html` whose base is the frontend folder) with a stand-in for WebView2: the page loads and every view opens without a script error or unhandled rejection, and every message the page sends is one `ASCS.ahk` accepts (the allowlist is read from `HandleWebMessage` each run). It reports the file, line and message of any error. It also checks what unit tests can't see: Continue Playing's room for a raised, focused tile, the mastered bar's paint, the sign-in task warning in Sounds › Startup, and the sign-in graph; the power tray, Maestro Logs, what was removed, and that Maestro accepts every item the quick action picker offers; the Workspaces page, including a drag with pointer events; the site badges; Arrange's dock and keys, drive bars as long as the processor's, the graphs' clock times, the title bar's save status, that no control's focus ring is cut off on any page or section, and finding text in a note in both modes, including that the editor's marks lie over its text (575 checks).

The runner also checks the timers (34: none is set both as a repeating and a single run) and the startup scripts (10). The tests never touch the running Maestro instance or the `data` folder. The runner exits with code 0 when everything passes and reports each failure by name.

### Manual

Hotkeys, WebView behavior, and window management need the real desktop. Each release is checked with a manual test pass; the results are recorded below. Its checklist, `tests\manual\manual-X.Y.Z.html`, is kept locally and isn't part of the repository, so file names in older release notes won't be found in a clone. Open it in a browser, mark each item Pass or Fail with an optional note (progress is kept in the browser), and use **Copy results** for a plain-text list by ID. A checklist can be reused as the starting point for the next release's pass.

## 12. Development Status

**2.1.0 (complete, 2026-11-10):** the daily backup, `maestro restore-data` and the notes trash are built. The manual pass on the target system covered the 18 items that can be done before a release: the trash and Preferences in a test build, and the command line on the real data. 17 passed. The other, restoring a backup and then undoing it, looked for a note that had been made in the test build, while the command line works on the real data; the restore itself had completed, the data matched the backup, and `restore-data` now says whose data it means. Open, because a test build never backs up, are the 8 items that need the released build: the Backups module in Preferences, **Back up now**, **Open folder**, the folder picker, the switch and the time, the 6:00 PM backup, the trash on the real notes, and restoring a backup then undoing it. Automated: core 771, timers 34, startup 10, frontend 1232, smoke 575, cli 113.

### Verified on the Target System

- Startup hidden, single instance, window chrome, and WebView restrictions (context menu, DevTools, zoom, reload).
- Super toggle and resume; command palette filtering, keyboard operation, and every built-in entry; quick actions.
- Configurable and fixed shortcuts; live rebinding; Terminal/Explorer/Vivaldi reuse and new-window behavior; missing-DLL reporting; focus-steal protection.
- The Explorer item-creation matrix; top-row and numpad (NumLock on/off) desktop switching; desktop moves; half and quadrant snapping; snap gap; maximize/restore/minimize.
- Quick Notes create/rename/filter/pin/type/copy/delete, persistence, hide/exit flush, backup recovery, and the 5 MB limit.
- CPU/RAM/drive cards, five-second refresh, no polling while hidden, hardware and disk-layout details; Preferences persistence and validation; the Super Commands reference.
- Responsiveness: the window, palette, and hotkeys respond immediately, as reported by the user in daily use.

Each release's manual pass and automated verification are recorded with it in [CHANGELOG.md](CHANGELOG.md).

### Not Yet Verified on the Target System

- Quick capture from an editor and a terminal, including clipboard fallback and clipboard restoration (capture from a browser has passed).
- Note paste into a terminal, and Shift+Enter copy (paste into a text field has passed).
- Palette: notes/windows/workspaces in results, window switching, web search, Everything search, calculator copy, recent-command ordering, and Backspace leaving a mode.
- Named workspaces: save from the palette and Preferences, restore, delete, and Super + Shift + R.
- Custom commands: the Browse… pickers, `.lnk` targets, folder and link commands, and conflict messages (a command with a Super letter has passed).
- Activity feed updates and relative times; the tray menu, including Reload/Exit note flushing.
- The three-accent theme on the target display: burgundy bars, gold at 90% or more, the Dashboard volume meters, and gold pinned notes.
- Super + C/D/F/P passthrough when unassigned (Super + Shift + C, P and S have passed).
- The keyboard map (both layers, the Shift-hold preview, hover and focus details) and the new title bar (command bar, status pill, clock, and the maximize/restore glyph).
- The burgundy theme across all views at the target window sizes.
- Not yet confirmed individually: the missing-desktop tooltip, the workspace restore reuse matrix, notes reload after an outside change, and the Preferences reset after a rejected save.
- Carried over: mixed-DPI and multi-monitor layouts; network-drive offline behavior and probe timeout; additional Windows builds, DLL versions, and Terminal configurations; hardware inventory on other machines; untrusted-origin rejection (requires a deliberately modified page).

## 13. Known Limitations

- Steam: uninstalled games are listed only if Steam's app cache has their name (13 of 260 here have none), and Steam achievements aren't shown.
- Controllers: two identical controllers share a name, because Windows names controllers by model; battery isn't reported through a 2.4 GHz receiver or in D-input and Switch modes; renaming the Bluetooth device needs administrator rights, so Maestro opens Devices and Printers for it.
- RetroAchievements needs a user name and Web API key in `data\secrets.ini`.
- The almanac's location is fixed to New York City.
- The PSO session switches audio through SoundSwitch's hotkey, so the headphones must be in SoundSwitch's playback list.
- The PSO voice channel is opened with Discord's own `discord://` link (rebuilt from the channel link's two numbers; nothing else is accepted). Discord shows the channel with its **Join Voice** button (verified on the target PC) rather than joining by itself; Maestro never uses a Discord account token or automates clicks to join.
- Power actions count down inside Maestro; if Maestro closes during the countdown, they don't happen. Unsaved work is recognized only by a mark at the start of a window's title (`*`, `●`, `•`); an app that doesn't mark its title isn't held for.
- Workspace restore launches applications without arguments (except Explorer folders and Terminal) and captures up to 24 windows on the current desktop, or 48 across every desktop with `VirtualDesktopAccessor.dll`. Windows of one application whose titles have changed are matched in enumeration order, so two such windows can swap positions.
- RetroArch's Now playing can't tell a core loaded with no game from a game running, so it names that core's last game.
- Launch rules act on an app's own new process, so an app that hands a new window to a process already running (a second Edge window, a File Explorer window) doesn't trigger one. The first start of that app does.
- **Add an open window…** and **Add a rule** list windows on the current desktop, because that's what the window list reads. Go to a desktop to add a window from it.
- A game in exclusive fullscreen can draw over a toast, which then isn't seen. Failures also go to the log.
- Dragging keeps a window on its monitor; use **Monitor** in the panel to move it to another.
- A window that fills the usable screen always counts as maximized; 99% stays windowed. With a taskbar that reserves no screen space, a borderless fullscreen game counts too, and is restored maximized.
- For older sign-ins, logged before the startup history recorded it, the startup history can only work out a plain file's Windows version from the sounds set today, so it may be wrong if they've changed.
- Hardware's display mode and other details are read once per session, so a change of resolution shows after Maestro restarts.
- The startup history times from `SignIn.ahk` starting, about a second after sign-in, not from sign-in itself. Apps count once they've been started, not once they've finished loading.
- Sign-ins logged before 2.0.0 have no finish time, so they show their last recorded time, Keychron starting. That leaves out its trip to the tray, so they read about 2 s or more low beside newer ones until they leave the graph.
- The window switcher lists windows on the current virtual desktop only.
- Quick capture copies with Ctrl+C. Applications that use another copy shortcut (for example, some terminals without a selection) fall back to the clipboard text.
- Note paste uses Ctrl+V in the previous window. If that window cannot be refocused within one second, the note is left on the clipboard instead. `{cursor}` counts characters, so in an editor that auto-indents or converts line endings it can land slightly off.
- Custom applications cannot take command-line arguments; create a `.lnk` shortcut with the arguments instead.
- Everything must be installed for Super + F and file search.
- Desktop switching and cross-desktop focus require `VirtualDesktopAccessor.dll`; monitor frame calculations depend on Windows DPI behavior.
- Metrics depend on Windows APIs, WMI, and drive reporting; drive probes time out after eight seconds and are cached for 30 seconds.
- The daily backup needs PowerShell 7 (`pwsh`), and is made only while Maestro is running; with the PC off at the set time, it's made after Maestro next starts. Backups aren't compressed or encrypted, each holds `secrets.ini`, and putting one back is done from the command line, with Maestro closed.
- The notes trash is known only to 2.1.0 and later: an older Maestro run on the same data keeps the notes but drops the trash at its first save.
- The diagnostic log rotates at 1 MiB to one backup; the activity feed keeps the newest 50 entries.

## 14. Development Roadmap

Not yet built:

- **Routines:** multi-step sequences that restore a workspace, switch desktop, set audio output, launch an app or wait; never power actions.
- **iPhone calendar sync:** designed and not yet built: a second Radicale process on the home network over HTTPS with a private certificate authority, a firewall rule for the LAN only, and a DHCP reservation.
- **A console hub:** Luma3DS (3DS), hekate and Atmosphère (Switch, booted through an RCM jig, so pushing payloads matters) and Aroma (Wii U).
- **Moving `C:\Scripts` into Maestro,** with its own migration and rollback plan, since it touches the sign-in tasks.

Planned, after the redesign:

- **More of the `maestro` command line:** `new-release` and `bump` (`status`, `check`, `try`, `backup-data` and `restore-data` are built). It would never start or message the running app, or commit.
- **More in the achievement viewer:** softcore and hardcore shown together, with a filter and progress for each, and no size limit on the image cache, since the images never change.

Next, 2.1.1: **the folders become Maestro.** `C:\ASCS` becomes `C:\Maestro`, and a version being worked on lives inside it (`C:\Maestro\_2.2`, for example), so the editor's git tools show it without adding a folder. Folders only: the files and the repository keep the name ASCS.

Then, 2.2.0: **iPhone calendar sync**, as described above.

After that, in this order:

- **The pages used most:** Command Center modules in three sizes, with saved layouts to switch between; a small notes window for writing a game's note over the game; a metronome module.
- **Routines,** as described above.
- **A Switch payload command:** one command to push the chosen payload when the Switch is in RCM, ahead of the rest of the console hub.
- **Tasks on the calendar server:** reminders that aren't events, which iPhone sync could carry to Reminders.
- **3D print status:** what the printer is doing, on the Command Center. It needs a connection on the home network and the printer's access code, so it's decided like iPhone sync.
- **Media controls:** play, pause and what's playing, from Windows' media session.

Missing, suggested in 2.0.0:

- **Notes and settings export:** notes as Markdown files, and settings as one file to import.
- **Reminders that aren't events:** a reminder at a time, with no calendar event.
- **A per-app volume mixer** on the Sounds page.
- **Searching note text, further:** results that show the line each match is on, across every note at once.
- **A layout designed for keyboard navigation:** pages laid out so the arrow keys and Tab follow a clear path.
- **Heights in the Command Center:** modules two squares high, once the grid is designed for it.
- **Live Markdown in Quick Notes:** formatting shown as you type in the text editor (the Markdown viewer already formats a note).

Polish, for this design (2.0.0 notes):

- **Motion:** one set of durations and easings; page changes that move rather than cut; numbers that count to a new value; loading shown as the shape of what's coming rather than "Loading".
- **Type:** fewer sizes (the audit counts 13; about 7, used the same way everywhere).
- **More audits:** previews at the Larger and Largest text sizes and in narrower windows; every dialog with the same header and footer; empty and error states that read alike; module edges measured against the 12-column grid.
- **Icons:** one set, the same stroke and size everywhere.
- **Feedback:** hover and pressed states that match across controls.

Earlier ideas, still open:

- **Workspaces on desktops:** assign workspaces to desktops.
- **Palette actions on results:** open a custom command's folder, rename or delete a note, overwrite a workspace.
- **Broader automated coverage:** a scripted WebView smoke test on the target machine, run before each release.
