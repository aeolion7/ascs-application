# Aeolionware Maestro

**Brand:** AEOLIONWARE MAESTRO (code name ASCS: the repo, folders and file names keep it)  
**Platform:** Windows 10/11 (Windows 11 target verification)  
**Releases:** the current version, and each release with its checks and manual results, are in [CHANGELOG.md](CHANGELOG.md).

Maestro is a keyboard-driven Windows utility suite. It uses AutoHotkey v2 for hotkeys and Windows automation, WebView2 for its interface, and a web frontend in plain HTML, CSS and JavaScript.

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

Maestro brings application launching, window and desktop control, notes, games, sounds, a calendar, system monitoring and a music workshop behind one dedicated key, **Super** (F24, mapped by Keychron Launcher).

Its pages, in the sidebar: **Podium**, **Quick Notes**, **Calendar**, **Workspaces**, **Games**, **System**, **Sounds**, **Commands** and **Conservatory**, with **Preferences** and **Power** at the foot. **Super + Space** opens the **Command Palette** over any of them.

## 2. Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Keyboard input | Keychron Launcher | Maps the physical Super key to F24 |
| Automation | AutoHotkey v2 (64-bit) | Hotkeys, Windows commands, files and system queries (`ASCS.ahk` and `lib\features\*.ahk`) |
| Core logic | AutoHotkey v2 | Pure, tested validators and algorithms (`lib\ASCS.Core.ahk`) |
| Web interface | Microsoft Edge WebView2 | Hosts the frontend |
| Frontend | HTML, CSS, JavaScript | The pages; pure logic modules are tested headlessly |
| File search | Voidtools Everything | Opened with a query; not embedded |
| Calendar store | Radicale (CalDAV), local only | Calendars, on 127.0.0.1 |
| Persistent data | `data\` | Notes, settings, arrangements, songs, exercises, rhythms, logs and the WebView2 profile |

AutoHotkey does everything that touches Windows. The frontend presents and asks: it can request only the operations in the allowlist in [section 7](#7-frontend-and-backend-communication), and AutoHotkey validates every request.

**Startup.** `ASCS.ahk` creates the WebView window, maps `frontend\` to `https://ascs.localhost`, registers the message and navigation handlers, and starts hidden. When the page reports `Ready`, AutoHotkey sends its data. The first show after a start puts up a start screen while the page finishes drawing.

**Responsiveness.** Nothing slow runs on a hotkey or message: metrics are pushed on timers, drive and hardware probes run in separate processes, polling happens only while its view is visible, and pages show the shape of what's loading so nothing moves when data arrives.

## 3. Visual Identity

**Aeolionware Obsidian**: a dark desktop theme with layered, rounded modules and three accents.

| Accent | Meaning | Used for |
| --- | --- | --- |
| Indigo, anchored on `#2B0071` | Interaction | Active navigation, primary buttons, selection; lighter tints (`#7B5CF0`, text `#B6A5FB`) wherever it must be legible |
| Burgundy `#B4476F` | Resources and saved items | Usage bars, saved items, favorites, destructive actions |
| Gold `#D9B95F` | Distinction and attention | Anything at 90% or more, pinned and recent items, custom commands |
| Metallic gold | The Maestro signature | Only the brand mark, the Super keycap on the keyboard map, and the palette title |

- **Type:** Bahnschrift SemiCondensed (titles, numbers, controls; shipped with Windows) and Lato (reading; bundled), in seven sizes (`--t-*`, 18 to 58 px), scaled by Preferences › Text size. For music, Libre Bodoni and Bravura Text (bundled). The smoke test fails on any other size.
- **Tokens:** colors, depth (page, module, overlay) and motion live in `frontend\styles\25-2.0.0-tokens.css`. Motion uses one curve at 120, 200 and 320 ms, moves only position and opacity, and stops under Windows' reduced motion.
- **Parts:** one set of controls on every page: primary, secondary and quiet buttons; segmented controls with a sliding marker (they also step with a sideways wheel); one icon set of 51 drawings (`icons.js`). A repeated action in a row or list (delete, rename, edit, duplicate) is its icon alone, named in its tooltip; playing and stopping keep their word beside the icon; everything else is words.

## 4. Application Structure

```text
C:\Maestro\
├── ASCS.ahk                  Main script: globals, the WebView, navigation and the message allowlist
├── ASCS.DriveProbe.ahk       Drive metrics, in its own process
├── ASCS.HardwareProbe.ahk    Hardware inventory, in its own process
├── ASCS.Launcher.ahk         Resident Ctrl+Alt+Shift+A helper: starts or reloads Maestro
├── frontend\
│   ├── index.html, app.js    The shell: navigation, messaging, shared components
│   ├── styles\               Stylesheets in cascade order, 01-foundation.css … 49-2.7.0-staff.css
│   ├── assets\               Icon, fonts (with licenses), start-screen pictures
│   ├── *.js                  Pure logic (palette, notes, charts, almanac, games, sounds, calendar,
│   │                         workspaces, logs, keymap, metronome, music, harmony, prompts, notation,
│   │                         counterpoint, rhythm, melody) and views (*view.js, homemodules, gamenotes …)
├── lib\
│   ├── ASCS.Core.ahk         Pure helpers shared with the tests
│   ├── features\             One file per feature, included by ASCS.ahk (SuperKey, Launcher, Desktops,
│   │                         Notes, Games, Sounds, Calendar, Power, Workspaces, Rules, Charts, …)
│   └── VirtualDesktopAccessor.dll   Optional: desktop switching and cross-desktop focus
├── tests\                    The runner, the suites, the smoke test and preview scenes
├── tools\                    Installers and the maestro command (tools\cli)
├── webview\                  WebViewToo and WebView2 wrappers (vendored)
└── data\                     Created at runtime; ignored by git
```

What `data\` holds:

| Path | Contents |
| --- | --- |
| `notes.json` (+ `.bak`), `notes-history\` | Quick Notes; the previous save, and one copy a day for 14 days |
| `settings.ini`, `commands.ini` | Preferences, shortcut letters, quick actions; custom commands |
| `workspace.ini`, `workspaces\`, `rules.ini` | Arrangements and launch rules |
| `chords.ini`, `charts\`, `counterpoint\`, `rhythms\`, `exports\` | The Conservatory's saved chords, songs, exercises, rhythms and MusicXML exports |
| `startup-sounds.ini`, `sound-origins.ini`, `sound-lengths.txt` | Sign-in and shutdown sounds, where leveled copies came from, cached lengths |
| `radicale\` | The calendar server and its store |
| `consoles.ini`, `consoles\` | The console hub: the chosen payload, its folder, the dates each console was last updated; copies of console SD cards' config files (five of each) |
| `secrets.ini` | Optional: the RetroAchievements key and the calendar password. Never sent to the page or logged |
| `activity.log`, `ASCS_Log.txt` | The activity feed; the diagnostic log (rotated at 1 MiB) |
| `almanac\`, `ra-images\`, `weather.json` | Caches: Wikipedia feeds, RetroAchievements images (capped at the limit set in Preferences › Storage), the forecast |
| `WebView2\` | The WebView profile, including page-side settings in local storage |

## 5. Interfaces

### Podium

Super shows Maestro on the last view open (the Podium after a start) and hides it when it's in front. The Podium is a three-by-three grid of modules sized to fit the window without scrolling: **Now Playing**, **Today** (the almanac: moon, sun, countdowns, seasons and a rotating line from history, quotes and, if turned on, Wikipedia), **Next Up** (calendar), **System**, **Quick Actions and Arrangements**, **Continue Playing** and **Quick Note**. **Arrange** moves, sizes (one to three squares wide, and up to three tall for a module with more to show) and hides modules, each going in the first space where it fits, and adds others: Weather, Top Apps, Network, Audio, Controllers, Pinned Notes, Recent Unlocks, Metronome and Timer. Saved **layouts**, chosen from the chip beside the title or the palette, keep different arrangements of modules; one can be used while a game runs, switching back as it closes.

**Power**, at the sidebar's foot, opens a tray in four named groups: **Session** (Lock, Turn off display), **Sound** (the audio output, its volume and Mute), **Recycle Bin** and **Power** (Sleep, Restart, Shut down, Sign out). Emptying the Recycle Bin and the four power actions need a 1.5 s press-and-hold (or holding the button's letter); the power actions then count down with Cancel. Restart, Shut down and Sign out wait while any window shows unsaved work.

**Maestro sounds** play when Maestro shows and hides (or starts and exits), chosen in Sounds.

### Command Palette

Super + Space, or **/** inside Maestro. One search over views, apps and actions, custom commands, arrangements, notes and open windows on this desktop; math answered as you type; `?` searches the web; `+` adds a calendar event in plain words (`+Dentist tue 3pm #work`); and the last rows search files (Everything) or the web. Modes paste a note, restore or save an arrangement, or switch windows. Ranking learns from use.

### Quick Notes

Notes with titles, groups, `#tags`, pinning and a 30-day trash with Undo. Each note is **Text** (a Markdown viewer and a spell-checked editor) or **Code** (monospace, pasted exactly). Placeholders such as `{date}`, `{ask:name}`, `{clipboard}` and `{cursor}` are filled when a note is pasted from the palette. Ctrl + F finds text across notes. **Quick capture** (Super + Shift + C) saves the selection as a note without showing Maestro. Notes are saved atomically to `data\notes.json` with a backup and daily history; links open only on Ctrl + click.

### Calendar

Day, Week, Month and Agenda views of local calendars, stored in a Radicale CalDAV server on 127.0.0.1. Events repeat, have reminders (tray pop-ups with a sound, even while Maestro is hidden), and can be dragged and resized; every change has Undo. Countdowns and US holidays show beside events. Calendars import and export `.ics` files through Windows' own dialogs.

### Workspaces

Arrangements of windows: Super + S and Super + R save and restore the Default, and named ones are saved and restored from the palette or the Workspaces page. The page draws each arrangement on its monitors and desktops, where windows can be moved, resized, pinned or switched off before restoring. With `VirtualDesktopAccessor.dll`, arrangements span virtual desktops. **Launch rules** send an app's first window to a remembered place when it starts.

### Games

Play time, recent games and achievements across Steam, RetroArch, Dolphin, PCSX2 and Phantasy Star Online, read from each program's own records. **Playing** shows what's running with a session timer and the game's notes (a Quick Note per game); **Achievements** shows RetroAchievements progress, site badges and each game's achievements, with hardcore and softcore unlocks shown together and a filter for those still to earn in hardcore; **Library** lists every game played, with covers from local folders; **Controllers** lists controllers with a live input tester, rumble and renaming; **Consoles** pushes a Switch payload with TegraRcmGUI's sender (listing its favorites and a folder you choose, with hekate's version and each file's SHA-256), says when a Switch in RCM mode is plugged in and can push the chosen payload then, recognizes Switch, 3DS and Wii U SD cards as they're inserted (their free space, the versions their files record, a copy of their config files) and copies the Switch's album to Pictures\Switch, and keeps each console's last update date, release pages and notes; **Setup** holds program paths, the PSO session and RetroAchievements. **Super + G** opens a small window over the game with the running game's notes; it stays on top and doesn't take the focus until clicked.

### System

**Live** graphs processor and memory (5 minutes to 24 hours) and shows the monitored drives. **Hardware** shows what Windows reports about each component, read once a session in a separate process. **Startup** graphs the last 20 sign-ins' timings. **Activity and Logs** shows the activity feed and a viewer for Maestro's logs.

### Sounds

Every Windows sound from 3.x to 11, from a local library, plus a custom folder. Sounds can be previewed, measured (RMS, peak and loudness in LUFS), leveled into copies, and used for Windows events, Maestro's own sounds, or the sign-in roll and shutdown sound. **In Use** matches every sound in use to one notification level; **Startup** sets the sign-in sounds' chances and their level. Originals are never changed.

### Commands

**Key Map** draws the customized keyboard with every Super binding, where letters are reassigned; **Custom Commands** adds apps, folders and links to the palette and to free letters; **Palette** sets the web search address; **Quick Actions** chooses the Podium's buttons.

### Conservatory

A music workshop for guitar, bass, mandolin, ukulele and keyboard, with a neck or keyboard across the top, nine tabs and a metronome along the bottom. **Neck** (or **Keys**), beside the instrument's chip, shows or hides it on every tab at once, so moving between tabs or quiz kinds never moves the page; hidden, the modules take the room. It stays where a tab works on it (Scales, Chords, the Finder and the Notes quiz), and the Rhythm tab never has it.

- **Scales:** 49 scales on the neck, spelled by key, with their chords, positions, a drone and drills.
- **Chords:** build a chord on the neck, name it, see it on a staff, and keep a library of chords.
- **Progressions:** a song as a chord chart in sections, looped with the metronome, with bass and drums; chord suggestions, voicings, the circle of fifths, cadences, forms and writing prompts; a **Staff** view where each chord's voicing is written and edited note by note, and a **Tab** view with its frets under the staff on a stringed instrument; the whole song in negative harmony; songs saved, printed and linked from Quick Notes.
- **Counterpoint:** species and four-part exercises and melodies, written on a staff and checked as they're written, with model answers, playback, clefs chosen per staff, printing and MusicXML export. Each problem names the rule it breaks, which opens that rule in Rules; each rule can be switched off there except the fundamentals (parallel and hidden fifths and octaves, dissonance treatment, crossing voices, the leading tone and sevenths), and an exercise is checked in a style: species as Fux has it or in the Renaissance style, four parts in common practice or as Bach's chorales have it. Four-part voices can move in quarters and eighths and hold notes over, and their non-chord tones are named by their notes as Kostka and Payne's *Tonal Harmony* names them; Embellish adds some to a finished answer, and a new exercise's given bass or soprano can come with them.
- **Rhythm:** a step sequencer on a synthesized kit, rhythms written on percussion staves, and a polyrhythm trainer that scores taps.
- **Theory:** a twelve-tone row's matrix, its forms played or sent to Counterpoint; a pitch-class set's Forte name, prime form, interval vector and transformations; and negative harmony in a key.
- **Finder:** names the chord from notes picked on the neck, and the scales that hold them.
- **Quiz:** notes on the neck, and intervals, chords, progressions, melodies and rhythms by ear and by reading; progressions can be written on the staff and graded note by note.
- **Tuning:** reference tones for each string, at a chosen concert pitch, and your own tunings.

Each instrument is written as it usually is: a keyboard on a grand staff, guitar and bass an octave above where they sound under a clef with an 8, mandolin and ukulele on a treble clef. Sounds are synthesized in the page (no sample files): plucked strings heard in a small room, and an organ for Counterpoint's staff, each voice in its own stop and place from left to right. The **metronome** keeps playing on every page and while Maestro is hidden; Ctrl + Shift + M starts or stops it anywhere.

### Preferences

Only what belongs to the whole app: text size and the logo's swing, window snapping, the power delay, the daily backup of `data\` to a folder you choose, and **Storage**: the size of each cache, the image cache's limit (100 MB to 1 GB) and clearing a cache. Settings that belong to one page live on that page.

### Other parts

- **Title bar:** where you are, the search box that opens the palette, a status pill (gold when a resource is at 90%), the clock, and the attention list when something needs you.
- **Toasts:** what a hotkey just did, at the top of the active monitor; they never take focus.
- **Tray menu:** show Maestro, the palette, Quick Notes, arrangements, the data folder and log, Reload and Exit.
- **Vivaldi, Terminal and Explorer:** Super + B, T and E bring an open window forward, switching to its desktop if it's on another, and open one only when none exists.
- **Explorer items:** Super + Shift + D and F create a folder or an empty file in the active Explorer folder.

## 6. Keyboard Shortcuts

"Super" is the dedicated key (F24). Letters marked *configurable* change under Commands › Key Map.

| Shortcut | Action |
| --- | --- |
| Super | Show Maestro on the last-used view, or hide it |
| Super + Space | Command palette |
| Super + Q *(configurable)* | Quick Notes |
| Super + Shift + C | Quick capture: the selection (or clipboard) into a new note |
| Super + Shift + P | Palette: paste a note |
| Super + S / R | Save / restore the Default arrangement |
| Super + Shift + S / R | Save an arrangement as… / choose one |
| Super + F / I *(configurable)* | Everything / System |
| Super + B | Vivaldi: focus it here, go to its desktop, or open it |
| Super + T / E *(configurable)* | Terminal / Explorer, reused across desktops |
| Super + Shift + T / E | New Terminal / Explorer window |
| Super + C / H *(configurable)* | Ask Claude / Task Manager |
| Super + M4 | PSO session (headphones, Discord, the launcher) |
| Super + M5 / M6 / M7 | Recent RetroArch / Dolphin / PCSX2 games |
| Super + *letter* | A custom command assigned that letter |
| Super + Shift + D / F | New folder / empty file in the active Explorer folder |
| Super + 1–9 | Switch to virtual desktop 1–9 |
| Super + Shift + 1–9 | Move the active window to that desktop and follow it |
| Super + Left / Right / Up / Down | Snap to a half; then an arrow within 150 ms for a quadrant / maximize / restore or minimize |
| Super held through a mouse's desktop gesture | Carry the active window to the next desktop that way, and follow it (gestures that send Ctrl + Win + arrow, as Logi Options+ does) |
| Super + Shift + Left / Right | Move the window to the adjacent monitor |
| Super + L / M / V | Lock / toggle mute / Clipboard History |
| Super + J / Y | Type a timestamp / date |
| Super + G | Game notes window: the running game's notes over the game |
| Ctrl + Shift + M | Start or stop the metronome |
| Ctrl + Alt + Shift + A | Start Maestro, or save notes and reload it |
| Inside Maestro | Ctrl + 1–9 pages, **/** search, F6 next area, Alt + Left/Right back and forward, Ctrl + N new note, Ctrl + E new event, Ctrl + F find, F1 help |

When C, D, F or P has no Super assignment, Super + that letter passes the Windows shortcut through.

## 7. Frontend and Backend Communication

The contract is defined by `ASCS.ahk` (`HandleWebMessage`) and `frontend\app.js`; change both together. The smoke test checks that every message the page sends is one `ASCS.ahk` accepts.

### Frontend to AutoHotkey

The page sends text through `window.chrome.webview.postMessage()`: the message type, a newline, then the content. AutoHotkey validates every field; the page never sends a file path or a command line.

| Message | Content | Purpose |
| --- | --- | --- |
| `Ready` | None | The page has loaded |
| `GetNotes` / `SaveNotes` | None / notes JSON (≤ 5 MB) | Load / atomically save notes (groups, trash and game links checked) |
| `WindowAction` | `minimize`, `maximize`, `close` | Window controls; close hides |
| `Launch` | An allowlisted id (`everything`, `vivaldi`, `terminal`, `explorer`, `calculator`, `claude`, `taskmanager`, `settings`, `downloads`, `projects`, `snipping`, `lock`, `mute`, `reload`) | Built-in launches and actions |
| `GetMetrics` / `SetHistoryScale` | `home`, `dashboard` or empty / `seconds`, `tens`, `minutes` | Metrics push / the history System shows |
| `GetWeather` / `SetWeather` | None / `on`, `off` | The forecast (cached 30 minutes) / turn it off, deleting the cache |
| `GetHomeStats` | `network`, `processes` | Network speed and the busiest apps |
| `CountdownTimer` | Seconds 1–86400, `0` cancels | The Timer module |
| `GetAlmanac` / `SaveAlmanac` / `OpenWikipedia` | None / settings and up to 12 countdowns (≤ 2 KB) / an article title (≤ 200) | Almanac data and settings / open an article Maestro addresses itself |
| `GetGames` / `GetGamesLive` / `GetRunning` | None | Library (no paths) / now playing and controllers / running apps |
| `LaunchGame` / `GetGameDetails` / `ShowGameFile` | A game id from Maestro's index | Play / details / show in Explorer |
| `GetCovers` | Up to 40 game ids | Cover art as checked data URIs |
| `GetGameSettings` / `SaveGameSettings` / `SetShowCovers` | None / setup fields / `0`, `1` | Games › Setup |
| `GetRetroAchievements` / `SetupRetroAchievements` / `RefreshRaPicture` | `refresh` (optional) / None / None | Summary / create and open `secrets.ini` / refetch the picture |
| `GetRaGame` / `GetRaUnlocks` / `GetRaAwards` / `GetRaImages` | A game id (1–9 digits) / `refresh` / `refresh` / up to 30 image tokens | One game's achievements / recent unlocks / site badges / cached images |
| `OpenRetroAchievementsProfile` / `OpenBluetoothRename` | None | The profile page / Devices and Printers |
| `GetControllerInput` / `RumbleController` / `RenameController` | `x0`–`x3`, `j0`–`j15` / same / `VVVV:PPPP\|name` | Controller tester, rumble, rename |
| `StartControllerTester` / `StopControllerTester` | `h<handle>` / None | Raw Input tester |
| `StartPsoSession` | None | The Super + M4 session |
| `CalDav` / `SetReminders` | `id\|operation\|calendar\|event\|version` and a body / reminder lines | One CalDAV request Maestro builds / the next three days' reminders |
| `ExportCalendarFile` / `ImportCalendarFile` | Calendar name and `.ics` text / None | Through Windows' Save and Open dialogs |
| `PowerArm` / `PowerRun` / `PowerCancel` / `PowerAnyway` / `PowerNow` | An action / `action\|ticket` / None / None / `lock`, `display` | Guarded power actions with a single-use ticket; Lock and Turn off display at once |
| `GetRecycleBin` / `GetAudioDevices` / `SelectAudioDevice` | None / None / a device name | The power tray |
| `GetVolume` / `SetVolume` / `SetMute` | None / a whole number 0–100 / `0`, `1` | The default output's volume and mute, in the power tray |
| Sounds: `DeleteLeveledSound(s)`, `RestoreAllSounds`, `SetCustomSounds`, `GetInUseOrigin` | Sound ids (≤ 10 a request) / None / a folder (≤ 400) / an in-use key | Leveled copies, restoring, the custom folder |
| Startup: `GetSignInHistory`, `GetStartupSounds`, `SetStartupSound`, `RemoveStartupSound`, `RestoreStartupSound`, `SaveStartupOdds` | Slots, sound ids and whole-number chances | Sign-in timings and sounds |
| `GetLog` / `OpenLogFile` | `ascs`, `activity`, `codebutton` | Log tail / open in Notepad |
| `GetSettings` / `SaveSettings` / `SetStartScreen` | None / settings fields / `on`, `off` | Preferences and Commands |
| `GetCommands` / `SaveCommands` / `RunCommand` / `BrowseCommandTarget` | None / up to 30 commands / an index 1–30 / `row\|app`, `row\|folder` | Custom commands |
| `SaveBackups` / `ChooseBackupsFolder` / `BackupNow` / `OpenBackupsFolder` | `0\|HHmm`, `1\|HHmm` / None | The daily backup; the folder comes from Windows' picker |
| `GetStorage` / `SetCacheLimit` / `ClearCache` | None / `100`, `250`, `500`, `1000` / `images`, `almanac`, `forecast` | The caches' sizes / the image cache's limit in MB / clears a cache, deleting only files named as Maestro's own |
| `GameNotesWindowState` / `ToggleGameNotes` | The running game's note as JSON (up to 220,000 characters) / None | Passed to the game notes window, which checks it / opens or closes that window |
| `GetConsoles` / `PushPayload` / `GetPayloadBytes` / `SetPayloadChoice` / `ChoosePayloadFolder` | None or `refresh` / a payload's place in Maestro's list / the same / its place (0 for none) and `0` or `1` / None | The console hub; Maestro keeps the payloads' paths, and the page hashes the bytes it's sent |
| `SetConsoleUpdated` / `OpenConsoleCard`, `ImportAlbum` / `OpenAlbumFolder`, `OpenConsoleBackups` / `OpenConsoleLink` | `switch`, `3ds` or `wiiu` and a date / a drive letter Maestro recognized / None / `hekate`, `atmosphere`, `luma` or `aroma` | A console's last update / a card's folder, its album copied / the copies' folders / a fixed release page |
| Workspaces: `GetWorkspaces`, `SaveWorkspace`, `RestoreWorkspace`, `DeleteWorkspace`, `RenameWorkspace`, `DuplicateWorkspace`, `SetWorkspaceWindow`, `RemoveWorkspaceWindow`, `AddWorkspaceWindow` | Validated names, indexes and range-checked places | Arrangements; never an app's path |
| Launch rules: `GetLaunchRules`, `RememberWindowRule`, `RuleFromWorkspaceWindow`, `SetLaunchRuleEnabled`, `DeleteLaunchRule` | A window handle, `name\|index`, or a validated path | Launch rules |
| `GetWindows` / `FocusWindow` | None / a window handle | Window switcher |
| `PasteNote` / `CopyNote` | Note text (≤ 256 KB) | Paste into the previous window / copy |
| `SearchWeb` / `SearchFiles` / `OpenNoteLink` | A query (≤ 1000) / same / an address (≤ 2048) | Web search / Everything / an http(s) link from a note |
| `GetActivity` / `SaveQuickActions` | None / up to six validated ids | Activity feed / Podium buttons |
| `GetChords` / `SaveChords` | None / saved chords (≤ 32 KB) | The Conservatory's chord library (`data\chords.ini`) |
| `GetCharts` / `SaveChart` / `DeleteChart` | None / an id and a chart (≤ 64 KB) / an id | Songs in `data\charts`, checked line by line |
| `GetExercises` / `SaveExercise` / `DeleteExercise` | None / an id and an exercise (≤ 64 KB) / an id | Counterpoint exercises in `data\counterpoint` |
| `ExportMusicXml` / `ShowExport` | A title and MusicXML (≤ 512 KB) / None | Write into `data\exports` under a name Maestro makes / show it in Explorer |
| `GetRhythms` / `SaveRhythm` / `DeleteRhythm` | None / an id and a rhythm (≤ 16 KB) / an id | Rhythms in `data\rhythms` |
| `Log` | Text (≤ 4 KB) | A diagnostic log entry |

Song, exercise and rhythm ids are 8 to 24 lowercase letters and digits, so they can only name a file in their own folder.

### AutoHotkey to Frontend

AutoHotkey sends JSON with `PostWebMessageAsJson()`: views to show (`navigate`, `resume`), window state, notes, metrics, settings, commands, workspaces, launch rules, windows, activity, sounds, games, RetroAchievements data, saved Conservatory files, acknowledgements, notices and errors. Larger payloads (covers, images, calendar replies, game data) arrive as tagged strings the page parses and checks field by field.

## 8. Security

### Boundaries

- The backend accepts bridge messages only from `https://ascs.localhost`, validates every message type and payload, cancels navigation to other origins, and blocks new windows.
- WebView settings disable DevTools, default context menus, browser accelerator keys, zoom and host objects (WebViewToo would otherwise expose every AutoHotkey function to page script).
- The **game notes window** is a second WebView with the same settings, origin and policy. It accepts messages only from its own page, with a short list of its own: an edit for a note named by a checked key, a timestamp, opening the note in Maestro, and closing. It writes nothing itself: the main page changes the note and saves it as every other note.
- The Content Security Policy allows only Maestro's own scripts, styles, fonts and images (inline styles and data images too) and no connections, so the page has no network access.
- Nothing in the bridge runs arbitrary commands. Custom commands run only validated entries from `data\commands.ini`, referred to by index. The page never sends a file path: files are named by ids Maestro checks, or chosen in Windows' own dialogs.
- Maestro asks for no elevation and opens no network listener other than the calendar server on 127.0.0.1. Restrict write access to `C:\Maestro` to the installing account, Administrators and SYSTEM, and don't run Maestro elevated.

### Network use

Every request names the client `Maestro/<version> (Aeolionware)` with no contact details, uses HTTPS with certificate checks, no redirects, timeouts and size caps, and goes to an address Maestro builds itself.

- **Weather** (Open-Meteo), only while its module shows, at most every 30 minutes; the location is rounded to two decimals.
- **Wikipedia almanac**, off until turned on; two fixed feeds a day; links are never taken from the feeds.
- **RetroAchievements**, opt-in through `data\secrets.ini`; fixed API addresses with a validated user name and game ids; images only from `media.retroachievements.org`, by numbers Maestro checks, PNG-signature-checked and capped. The key is never sent to the page or logged.
- Everything else (covers, sounds, fonts, music) is local; nothing is downloaded.

### Data and actions

- **Power actions** need a completed press-and-hold, then a single-use 10-second ticket from Maestro; shutdowns are never forced, are counted down by Maestro and can be canceled. None is on a hotkey, quick action or the palette.
- **Calendar:** Radicale listens on 127.0.0.1 only, with a random password Maestro keeps (the page never sees it), and was installed from hash-pinned wheels. The page names an operation; Maestro builds the one request and guards edits with `If-Match` / `If-None-Match`.
- **Files Maestro writes** (notes, settings, songs, exercises, rhythms, chords, sounds) are validated in AutoHotkey on save and on read, written through a temporary file and moved into place. Leveled sound copies go only into `ASCS Leveled`; Windows sounds change only for 19 allowlisted events, with the previous value kept for Restore; deletions go to the Recycle Bin.
- **Notes:** Markdown never becomes HTML and images are never loaded; a link opens only on Ctrl + click and only as a checked http(s) address. Notes are pasted through the clipboard (restored afterwards), never typed as keystrokes.
- **Consoles:** a payload is pushed only by TegraRcmGUI's own sender, with a path Maestro read from TegraRcmGUI's files or your folder and checked (a .bin, no characters the command line would read); the page names it only by its place in the list. Maestro listens for USB devices to see a Switch in RCM mode and reads SD cards without changing them: their config files are copied into `data\consoles`, and the album is copied, never moved or overwritten. Release pages open in the browser; Maestro checks nothing online.
- **Games and controllers:** emulator and Steam files are only read; games start through Maestro's own index or `steam://rungameid/` with a checked id. Controllers are read through XInput and Raw Input only: DirectInput and the winmm joystick API corrupted Maestro's memory in testing. Every new native call is probed with guard bytes.
- **Workspaces and launch rules** never take an app's path from the page; paths are captured by AutoHotkey from real windows and checked again at restore.
- **Backups** hold `secrets.ini`; the folder must be on a fixed drive of this PC, outside Maestro's folder, and is checked before every backup. A test build never backs up.
- **Upkeep commands** (`maestro doctor`, `preview`, `isolate`, `try`) use no network, listener or elevation; `isolate` copies no `data\` and runs a copy only after a scan finds nothing in it that could act outside. `drive` runs such a copy with a test hook that can run script in its page and read the results; the hook lives only in `tools\cli`, `maestro check` fails if the app's own files ever name it, and the copy of `data\` it can take leaves out `secrets.ini`.
- Maestro exits or reloads on its own window messages, which any program running as the same user can send.

## 9. Dependencies

**Required:** Windows 10 or 11; AutoHotkey v2 (64-bit); the Microsoft Edge WebView2 Runtime; WebViewToo under `webview\` (vendored for now; planned to become an external dependency); and Keychron Launcher mapping the Super key to F24.

**Optional:** Voidtools Everything (file search); `lib\VirtualDesktopAccessor.dll` (desktop switching, moving windows between desktops, workspaces across desktops, and bringing Vivaldi, Terminal and Explorer forward from another desktop; without it those report a failure and everything stays on the current desktop); Radicale 3.8.3, installed by `tools\Install-Radicale.ps1` (the calendar); 64-bit Python 3.14, for Radicale's private environment; Microsoft Edge (the headless tests and previews).

## 10. Installation and Startup

1. Install AutoHotkey v2 (64-bit) and the WebView2 Runtime.
2. Configure the Keychron Super key to emit F24.
3. Place the repository at `C:\Maestro`, with WebViewToo under `webview` and, optionally, the virtual-desktop DLL under `lib`.
4. Restrict write access as described in [Security](#8-security).
5. Run `pwsh -File C:\Maestro\tools\Install-Shortcut.ps1`: it creates a Start Menu shortcut and registers the launcher, which owns **Ctrl + Alt + Shift + A** (start Maestro, or save notes and reload it). `-Startup` also starts Maestro at sign-in; `-Remove` undoes it all.
6. Press Ctrl + Alt + Shift + A. Maestro starts hidden; tap Super, or click the tray icon, to show it.

### Developing and running apart

Maestro runs from the folder it's in, so `C:\Maestro` stays on `master` as the copy in use, and branch work happens in a version's checkout inside it (`C:\Maestro\_X.Y`, ignored by git). The `maestro` command (`tools\cli\Maestro-Cli.ps1`) manages that; `maestro help` lists everything. `C:\Scripts\maestro.cmd` runs it through a launcher beside it (a copy of `tools\cli\maestro.ps1`), which picks the newest copy: a version's checkout newer than `master`, else `master`'s, so a release in progress is never judged by older rules and nothing needs running by hand. `check`, `bump` and `commit-release` on an older version's checkout run that checkout's own copy. `maestro doctor` says if the installed launcher differs from the repo's.

| Command | What it does |
| --- | --- |
| `maestro status` | Each checkout's branch and version, what's running, and errors logged since it started |
| `maestro check [--quick] [--release]` | The tests, the AutoHotkey parse check and the hidden-character scan; `--release` also checks the version and the CHANGELOG entry with its counts |
| `maestro new-release <version> [branch]` | A version's checkout on a new branch off `master`, with its CHANGELOG heading |
| `maestro bump <version>` | Writes the version in its four places |
| `maestro commit-release [version]` / `cut-release` | Commits a release in your name after `check --release` / pushes it and fast-forwards `master` |
| `maestro clean` | Removes checkouts whose branches are merged and pushed, and forgets ones whose folders were deleted |
| `maestro try [version or folder]` / `try --end` | Runs a version's checkout (`try 2.7.1`) on a copy of your data / ends it and starts your real Maestro |
| `maestro backup-data` / `restore-data` | Copies `data\` to the backups folder / puts a backup back (Maestro closed) |
| `maestro doctor` | Checks what Maestro needs and the sign-in side, changing nothing |
| `maestro isolate` | A copy of the checkout that can't act outside itself, for probes |
| `maestro drive` | The scripted test: such a copy run for real, off-screen, while a plan works its page and records timings, memory, CPU, errors and screenshots; `--summary` and `--compare` read the results back, release against release |
| `maestro preview <scene,...>` | Screenshots and layout audits of the page with stand-in data |

## 11. Testing

```powershell
pwsh -File C:\Maestro\tests\run-tests.ps1
```

`maestro check` runs it with the parse check and hidden-character scan. The suites:

- **core:** `tests\core.tests.ahk` covers `lib\ASCS.Core.ahk`: every validator and parser, with hostile input.
- **timers** and **startup:** no timer is set both repeating and once; the startup scripts behave.
- **frontend:** `tests\frontend.tests.html`, in headless Edge, covers every pure frontend module, with hostile input.
- **smoke:** `tests\smoke.js` runs the real page with a stand-in for WebView2: every view opens without a script error, every message is in the allowlist, every text is one of the seven sizes, every control is in the house style, and each feature's main paths work.
- **cli:** `tests\cli.tests.ps1` covers the `maestro` command against throwaway repositories.

`tests\preview\preview.ps1` screenshots the real page in any state, at any window and text size, and `-Audit` measures each scene (text sizes, contrast, overflow, focus rings). The tests never touch the running Maestro or `data\`.

Hotkeys, WebView behavior and window management need the real desktop, so releases are also checked by hand. Each pass's results are in the CHANGELOG.

## 12. Development Status

The current version, and each release's contents, checks and manual results, are in [CHANGELOG.md](CHANGELOG.md). Manual testing is suspended until one large pass, after more features are in.

## 13. Known Limitations

- **Virtual desktops:** cross-desktop focus, workspaces across desktops and desktop switching need `VirtualDesktopAccessor.dll`. The window switcher and **Add an open window…** list the current desktop only.
- **Windows and workspaces:** restore launches apps without arguments (except Explorer folders and Terminal) and captures up to 24 windows (48 across desktops). Launch rules act only on an app's own new process. A window that fills the usable screen counts as maximized. Dragging keeps a window on its monitor.
- **Power:** actions count down inside Maestro, so they don't happen if Maestro closes first; unsaved work is recognized only by a mark in a window's title (and VS Code's backups).
- **Steam:** uninstalled games appear only if Steam's app cache names them; Steam achievements aren't shown.
- **Controllers:** identical controllers share a name; battery isn't reported through a 2.4 GHz receiver or in D-input and Switch modes; the Bluetooth name needs administrator rights.
- **RetroArch:** a core loaded with no game reads as its last game.
- **Almanac:** the location is fixed to New York City.
- **PSO session:** switches audio through SoundSwitch's hotkey, and Discord shows the voice channel rather than joining it.
- **Startup history:** timed from `SignIn.ahk` starting, about a second after sign-in.
- **Quick Notes:** quick capture copies with Ctrl+C; paste uses Ctrl+V in the previous window and falls back to the clipboard if it can't refocus it.
- **Toasts and the game notes window:** a game in exclusive fullscreen can draw over them.
- **Consoles:** pushing needs TegraRcmGUI in its usual folder and its USB driver; a Switch already in RCM mode when Maestro starts is found once, 30 seconds in. Versions are read only where a card's files record them (hekate's update.bin, Luma3DS's boot.firm); Atmosphère's and Aroma's show as present. Only removable drives are checked for console cards.
- **Podium:** module heights apply in a window over 1700 pixels wide; narrower, modules stack in two columns at their own heights. A taller Now Playing shows the next achievement only once Games has loaded the game's list. Up to 12 layouts, kept on this PC with the page's other settings.
- **Metrics:** depend on Windows APIs, WMI and drive reporting; drive probes time out after eight seconds and are cached for 30. Hardware details are read once a session.
- **Backups:** need PowerShell 7, run only while Maestro runs, and aren't compressed or encrypted.
- **Conservatory:**
  - **Progressions:** a song has one key and time signature, up to 12 sections of 64 bars (256 in all) and four chords a bar. A chord's voicing has up to ten notes, eight on a stringed instrument's single staff. Print writes the chart, not the staff.
  - **Counterpoint:** species are in 4/4 against whole notes, and four-part writing has a chord every half note, its voices moving in notes from a whole to an eighth. Both are checked by the rules of their style (four parts' non-chord tones by Kostka and Payne's classification), each of which can be switched off, the fundamentals excepted, but not changed. The styles are two each: species counterpoint in the tonal, harmony-based tradition of the nineteenth century isn't one of them. Clefs are treble, alto, tenor and bass.
  - **Theory:** prime forms are Rahn's; matrix forms are numbered from the row's first note. Negative harmony mirrors across the tonic and its dominant only, and a written voicing is let go. In a window narrower than 2100 px, the set and negative harmony take turns.
  - **Melodies and rhythms:** melodies are in 4/4 up to 32 bars; a rhythm has one time signature, up to eight rows and four bars.
  - **Library and timing:** saved chords ignore the capo, and the library holds 200. The metronome and tones play through Windows' default output.
  - **Quiz:** in a 1600 × 1000 window with the neck shown, the Quiz's taller kinds need the tab scrolled; hiding the neck gives them the room.
- **Logs:** the diagnostic log rotates at 1 MiB; the activity feed keeps 50 entries.

## 14. Development Roadmap

**Next:** routines, with media controls and a per-app volume mixer; then the large pass, run on a test copy by `maestro drive` with what it can't check flagged for a manual look; then iPhone calendar sync (a second Radicale on the home network with a private certificate authority, after its setup guide is reviewed), which comes after the large pass.

**Planned:**

- **Routines:** multi-step sequences (restore a workspace, switch desktop, set audio, launch an app, wait); never power actions.
- **Moving `C:\Scripts` into Maestro,** with a migration and rollback plan.
- **Tasks on the calendar server,** and 3D printer status (which needs its own network plan).
- **A tonal style for species counterpoint:** species in major and minor keys, each bar's implied chord worked out and its other notes treated as dissonances, as nineteenth-century courses teach it.
- **Stylesheets merged:** the stylesheets' later overrides folded into the rules they override, proven unchanged scene by scene.
- **Ideas needing new access, each with its own plan first:** MIDI in and out, MusicXML import, slowing a track, and tools that use the microphone.
- **Smaller ideas:** notes and settings export, reminders that aren't events, live Markdown in the editor, and palette actions on results.
