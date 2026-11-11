# Maestro Changelog

All notable changes to Aeolionware Maestro (code name ASCS; before 2.0.0, the Aeolionware Super Command System). The newest release is first. For current behavior, see [README.md](README.md).

## Version 2.1.1

The command line does what was done by hand at every release, and Maestro's folder takes its name.

**Summary.** Four commands take over the routine of a release: `maestro new-release` starts a version, `maestro bump` writes its number, `maestro check --release` says whether the docs are ready, and `maestro clean` clears away checkouts that are finished. The command line no longer has a folder written into it, a version being worked on lives inside the main folder, and that folder becomes `C:\Maestro`: a script kept outside the repository renames it once, after this release is on `master`. `bump` and `check --release` were used on this release itself. The rename script was tested on a copy, there and back (23 checks: the folder, a checkout holding uncommitted work, each file byte for byte, the shortcuts, and undoing all of it); it had not been run on the real folder when this was written. The manual pass (19 items) follows the release, because all but one of its items need the released build or the renamed folder; no results had been reported when this was written. Checks at release: core 771, timers 34, startup 10, frontend 1232, smoke 575, cli 155. Moved out to 2.1.2 (README §14): `doctor`, `isolate`, `preview` and `checklist`.

- **The folders become Maestro.** The main folder is `C:\Maestro` (it was `C:\ASCS`), and a version being worked on lives inside it, as `C:\Maestro\_2.2`, where the editor's git tools show it; it used to sit beside it, as `C:\ASCS-2.2`. git ignores whatever starts with an underscore in the main folder. Folders only: the files and the repository keep the name ASCS. The rename itself is done once, by a script outside the repository, after this release is on `master`.
- **The command line finds the main folder through git** rather than by a path written into it, so it works whatever the folders are called, and from a checkout's own copy. Standing in a version's checkout now means that checkout, though it's inside the main folder.
- **`maestro new-release <version>`** makes the second checkout for a version inside the main folder (`C:\Maestro\_2.2` for 2.2.0) on a new branch off `master`, and adds the version's "(in progress)" heading to its CHANGELOG. The branch is `feat/v<version>` unless you name one. It refuses a version that isn't newer than the one on `master`, a branch or folder that already exists, and a main folder where git wouldn't ignore the checkout.
- **`maestro bump <version>`** writes the version in the five places it's kept, which are the ones `maestro status` reads: both commands now work from one list, so they can't disagree. It works on the checkout you're standing in and never on `master`; if a place can't be found, nothing is changed and the place is named. Each file keeps its line endings and everything else in it.
- **`maestro check` ends with the check counts** in the form the README and CHANGELOG use (`core 771, timers 34` and so on), so they're copied rather than read off six lines.
- **`maestro check --release`** adds what marking a release complete asks of the docs: the version is the same everywhere, the CHANGELOG's newest heading is that version and not "in progress", the README Status line names it, both files have this run's counts, and the README's count for each suite matches. It says when new files aren't staged yet.
- **`maestro clean`** removes each second checkout whose branch is merged into `master` and pushed, with its local branch. The branch stays on the remote. A checkout with uncommitted work, a copy of your data, a build running, or you standing in it is kept, with the reason. It asks first, and `--dry-run` only lists.
- **Performance and security:** the command line only. Nothing new runs in Maestro, and none of these starts or messages the running app, commits, pushes, or touches `data\`. `clean` deletes only through git, without `--force`, so git itself refuses a checkout holding anything new or changed.

## Version 2.1.0

Backups that run by themselves and can be put back, and a trash for notes.

**Summary.** Maestro backs up its data folder every day to a folder you choose, on a drive inside this PC, and `maestro restore-data` puts a backup back, first keeping a copy of the data as it was so a restore can itself be undone. Deleted notes go to a trash for 30 days, with Undo. The manual pass on the target system covered the 18 items that can be done before a release (the trash and Preferences in a test build, and the command line on the real data) and passed 17. The other, restoring a backup and then undoing it, looked for a note in the real data that had been made in the test build; the restore itself had completed and the data matched the backup, and `restore-data` now says whose data it means (below). The 8 items that need the released build, because a test build never backs up, passed on it after the release: the Backups module in Preferences, **Back up now**, **Open folder**, the folder picker, the switch and the time, the 6:00 PM backup, the trash on the real notes, and restoring a backup then undoing it. With those, all 25 items have passed and none is open. Checks at release: core 771, timers 34, startup 10, frontend 1232, smoke 575, cli 113. Moved out to the roadmap (README §14): media controls, to after iPhone calendar sync.

- **A trash for notes.** **Delete** moves a note to the trash at once, with **Undo** on the toast, in place of a dialog that asked first and then removed the note for good. **Trash**, at the foot of the notes list while it holds anything, lists what's been deleted with the days each has left, **Restore** and **Delete forever**, and **Empty trash**; only those two are for good, and each asks first. A note stays 30 days. A restored note comes back as it was; a game's note keeps its link unless the game has a new note by then. A note with nothing in it is just removed.
- **The trash is saved with the notes,** as a list of its own in `notes.json`, so nothing that reads notes (the list, the filter, the palette, Pinned Notes, Games) sees a deleted one. No new messages, timers or network use: AHK checks each entry's time on save, and the page drops an entry that isn't a whole note.
- **A backup every day.** Preferences has a **Backups** module: **Back up every day**, the time (6:00 PM unless changed), the folder, when the last backup was made or why one failed, **Back up now** and **Open folder**. If the PC is off at that time, the backup is made within a minute of Maestro next starting; one that fails is tried again each hour. Maestro runs `maestro backup-data` as a hidden process of its own, so nothing waits on the drive.
- **The folder is chosen in Windows' folder picker,** never typed into the page: **Choose…** opens it, and Maestro keeps the folder only if it's on a drive inside this PC and outside Maestro's own folder.
- **The attention list** names a backup that failed (burgundy) and three days or more without one (gold), each with **Open Preferences**, while the daily backup is on.
- **A test build never backs up,** so a copy of your data can't land among your real backups.
- **Preferences still fits the window:** Windows and Power share a column, so Backups has one of its own.
- **`maestro backup-data` works while Maestro runs.** WebView2 keeps its cookie file locked for as long as Maestro is open, so a backup made then reported skipped files and failed. That folder holds nothing of yours and is now left out, as the caches are.
- **A folder of your choosing, and only that one.** Backups go to the folder named by `Folder` under `[Backups]` in `data\settings.ini`, which must be a full path on a drive inside this PC and outside Maestro's own folders. With none set, or one that can't be used, there is no backup: nothing goes to `%LOCALAPPDATA%\Aeolionware\ASCS-Backups` any more, so backups take no room on the system drive unless you choose it.
- **What's kept:** every copy from the newest day, the newest from each of the 14 newest days, and the first from each of the 6 newest months, in place of the newest ten.
- **No half-made backups.** A copy gets its name only once every file has copied; one that can't finish is removed and reported, where it used to stay and count as a backup.
- **Each run records its result** in `data\backup-status.ini` (the time, whether it worked, and the last good backup), for Maestro to show.
- **`maestro restore-data`** lists the backups, newest first, and `maestro restore-data <number or name>` puts one back. Maestro must be closed. It asks first, and copies your data as it is now to the backups folder as `before-restore-…` before replacing anything, so a restore can itself be undone; the newest three of those are kept.
- **`restore-data` says whose data it means.** With a test build's copy of the data in a second checkout, the list and the question before a restore name that copy and say it isn't touched: the command line always works on the real data. In the manual pass a note made in a test build was looked for after a restore of the real data, where it had never been.
- **Performance and security:** one timer, once a minute, compares two times and reads the status file only when it has changed; while a backup runs, a second checks each second whether it has finished. No listeners or network use. Four new messages (`SaveBackups`, `ChooseBackupsFolder`, `BackupNow`, `OpenBackupsFolder`), none carrying a path. A backup holds `secrets.ini`, which is why the folder must be on a drive inside this PC. `restore-data` is the only command that changes `data\`: it refuses while any Maestro is running, restores only folders it finds by its own naming in the backups folder, and won't touch a test build's copy.

## Version 2.0.0

ASCS becomes **Aeolionware Maestro**, with a new layout built in stages. ASCS stays as the code name: the repo, folders and file names keep it, and the command line is now `maestro`.

**Summary.** Every page was rebuilt on one design: a new name and metronome mark, Bahnschrift and Lato at a 17 px floor, a sidebar of eight pages with section tabs inside them, one look for every control, and pages that fit the window. The Command Center became modules arranged on the page itself, with eight more to add (weather, timer and others). Preferences keeps only app-wide settings, which save as they change; the rest moved to their pages. Also new: an editable key map, a rebuilt Hardware inventory, System history at three timescales with clock times, most of GitHub's Markdown in Quick Notes, a Timer sound, and the `maestro` command. The manual pass (79 items, A to P) passed in full; its 18 notes are addressed below under **Manual pass**. Checks at release: core 727, timers 31, startup 10, frontend 1159, smoke 537, cli 74. Moved out to the roadmap (README §14): the notes trash with Undo, scheduled `maestro backup-data`, media controls, live Markdown formatting in Quick Notes, and the rest listed there.

**Stage 1, the shell:**
- **The name and the mark.** A metronome: the old triangle as its tower, a gold clef-like flourish around it, and an arm that swings once when the page opens (not with reduced motion on). The icon file now has a drawing for each size from 16 to 256 px, in place of one 64 px image. Tray, window and shortcut use the new name.
- **Type.** Bahnschrift SemiCondensed (ships with Windows) for titles, numbers and controls, and Lato (ships with Maestro, under its open license) for reading. No text is under 17 px, on any page, and text is about 12.5% larger overall. Tight letter spacing is gone from older pages.
- **Design values.** Colors, sizes and spacing are named in `25-2.0.0-tokens.css`.
- **Sidebar.** One list of eight pages, with Preferences and Power at the bottom. Each shows its key.
- **Page keys.** Ctrl + 1 to 8 for the pages, Ctrl + - for Preferences (was Ctrl + 9), Ctrl + = for the power tray. Ctrl + 9 and 0 are free for new pages.
- **Title bar.** The page's name replaces the breadcrumb and each page's own heading. The date and time sit together at the same size.
- **Attention list.** "All systems nominal" is gone: nothing shows while all is well, and anything that needs you becomes a button that opens a list, each item with its next step. The processor and memory must stay over 90% for three readings, so one spike doesn't raise it. Dismissing lasts until the problem clears. Test builds have their own chip.
- **Power keys.** While the tray is open, holding S (shut down), Z (sleep), O (sign out), B (Recycle Bin) or R (restart) works like holding its button, for the same 1.5 seconds. If a second key goes down, the hold stops and nothing is accepted until every key is up. The hold, the ticket and the warnings all still apply.
- **Labels.** System Dashboard is now System, and Super Commands is now Commands.
- **Less to read.** Sections have one heading, not a small label above a larger one: Games has "RetroAchievements" and "Library", for example. Panel labels are in sentence case. Sounds drops its folder-naming note, which stays in the README, and the leveling explanation opens from "How leveling works".
- **The arm swings when you open the window.** The page loads hidden, so a swing at load was never seen. It moves like a real metronome, from its rest: right, left, then right into its rest again. If Maestro quits partway, it's back at rest on the next start. It resets after the window has closed, so the reset isn't seen. Preferences > Logo swing chooses the first time after Maestro starts (the default), every time, or never.
- **Stage 2, shared components.** One look for buttons, tabs, fields, modules, headings, key caps and dialogs. Every button has an edge, including the ones that looked like plain text. Sub-headings are larger. One focus ring everywhere, including text areas and calendar days, which had none: white, with an indigo halo between it and the control, and never cut off by the box around it. Low-contrast grey text is gone. Dialogs sit on a plain dark layer, in place of a blur.
- **Text size.** Preferences > Text size: Default, Larger or Largest, applied at once. The keyboard map keeps its size.
- **Arrow keys.** Outside text fields, arrow keys move to the nearest control in that direction, across the sidebar, title bar and page. In an open dialog or the power tray, they stay inside it. Controls with their own arrow keys keep them, and with nowhere to go, the arrow scrolls the page.
- **Mouse back and forward.** The side buttons on a mouse such as the MX Master move through the pages you've visited, while the pointer is over Maestro. Nothing hooks the mouse system-wide. Alt + Left and Alt + Right do the same.
- **More keys inside Maestro.** / opens search (not while typing). F6 and Shift + F6 move between the sidebar, title bar and page.
- **The name in the sidebar.** AEOLIONWARE and MAESTRO in capitals, with MAESTRO in metallic gold.
- **A larger window.** Maestro opens at 2540 × 1360 (was 2208 × 1242), capped to the screen, so the Command Center fits without scrolling at the default text size, and spare height goes to its modules.
- **Stage 3, Command Center.** Rebuilt as modules on a grid: Now Playing (or last played), Today, Next Up, System, Quick Actions and Workspaces, Continue Playing, and Quick Note, each with a button to its page. Next Up shows the date for events a week or more away. Arrange (in the title bar) arranges them on the page (see **Arrange on the page**). Recent Activity moved to System. The Almanac strip became the Today module. Home asks RetroAchievements for nothing: achievement progress shows once the Games page has loaded it.
- **Stage 3, Games.** Five sections, each a tab: Playing, Library, Achievements, Controllers and Setup (from Preferences), so nothing is several screens down. Playing has Now Playing (the same module as Home, with sessions and rich presence), the game's notes, Next Up (moved from Achievements, now with points earned and the latest and rarest unlocks), Play time, and Continue Playing as a list with a Play button on each game, in place of a row of large tiles that scrolled sideways. Library shows the selected game beside the list, where it used to open inside the list. Controllers' Identify, Rename and Test are full buttons, and the 3-second check no longer takes the focus off them. Cover art moved here from Preferences, and it saves on its own, so turning it on or off can't touch other settings. While a game runs, its blurred cover is the backdrop of Now Playing, on Home as well as Games. Your RetroAchievements picture and name head the Achievements summary. The picture is cached like other images and checked again after a week, or at once with Check now in Games › Setup. The library's play time and last played are fixed columns, so a date with its year fits and rows line up beside Install. Library and Achievements draw only once they're open, so RetroAchievements images aren't fetched until then. Four older stylesheets' worth of Games rules are now one, `30-2.0.0-games.css`.
- **Stage 3, Commands.** Four sections: Key Map, Custom Commands, Palette and Quick Actions. The key map can now be edited: click a key to see it in the panel beside the map, type a new letter for a command, or give a free letter any built-in or custom command. Clashes and reserved letters are refused, by the page and again by the backend. Below the map, three lists name every command and select its key, in place of nine long groups, and search covers both. Preferences loses Shortcuts, Palette and Custom Commands, and quick actions are edited here, where they can be dragged into order (or moved with the arrow keys on a card's grip, which keeps its focus; Delete removes the card). Names on the keyboard stay inside their keys, whatever their length. The Key Map's focus ring is on the key itself, and free letters can be reached by keyboard. Ctrl + F opens the section a page's search box is in. The old Commands and shortcuts styles are gone.
- **Stage 3, System.** Four sections: Live, Hardware, Startup, and Activity and Logs. Live graphs processor and memory at full height on a fixed 0 to 100% scale, with a reading under the pointer that gives its clock time and how long ago, in place of small graphs that stretched. Drives use the same rows as the Command Center, so an offline drive no longer says "Offline in use", and an offline drive lines up with its neighbors, on Home too. Monitored drives moved here from Preferences, under Choose drives; letters you cancel or leave unsaved are dropped, so Preferences can't save them later. Startup now measures until every startup task is done, not until RetroBar's bar appears: `SignIn.ahk` logs a new "finished" time, after Keychron Assistant is closed to the tray. Older sign-ins use their last recorded time, so they read low until they leave the graph. The graph is taller with a time scale, the fastest and slowest sit alongside the latest and middle, and a table gives every sign-in's stage times, so they no longer need the pointer. Logs are now a section rather than a dialog; the palette's Logs and the attention list's View log open it, and logs are read only while it shows. Recent Activity lists the latest 50 (was 5). The page's code moved out of `app.js` into `systemview.js`, and its old styles are now one file, `32-2.0.0-system.css`.
- **Stage 3, Calendar.** The page fits the window in every view and doesn't scroll, with the toolbar, the side column and the calendar always in the same place, so nothing moves when events load or the view changes. Day and Week fit all 24 hours. Month's six weeks share the window's height, and a day shows as many events as fit. Agenda puts each day beside its events, in place of a heading above a full-width row. Calendars has a module of its own, with **Countdowns** below it: what's coming, nearest first, moved here from Preferences, with **Edit** opening a dialog. The server's messages sit in the toolbar. Headings and weekday names are title case.
- **Stage 3, Workspaces.** Two sections, each a tab: Workspaces and Launch Rules, in place of a strip of chips across the top. The first puts the workspace being edited (its actions, desktop tabs, the drawing of the monitor and the window list) beside **Saved Arrangements** and **Selected Window**, which is headed by the window's app rather than a label above it. **Save open windows…** sits at the foot of the list. Launch Rules has the rules beside **Add a Rule**, with a count of rules and how many are on. Both fit the window, and long lists scroll inside their module. Text, buttons, switches and the place buttons are at the 2.0.0 sizes (they were 17 px throughout), and pinned windows use the gold from the design values. The list and the editor hold their space while workspaces load. The old strip and chip styles are gone; the page's own styles are in `35-2.0.0-workspaces.css`.
- **Arrange on the page.** Arrange turns the Command Center's modules into tiles to drag into place, size by their right edge (or 1, 2, 3), and hide; the others slide aside as one moves, and Esc puts a drag back. A tile moves only when the pointer is over another module. The dock slides in from the right while arranging and lies on the sidebar as a raised, rounded card, the sidebar dimmed beneath it, in one fixed shape: how the layout fits, the hidden modules as a list, Reset and Done; a collapsed sidebar opens for it and closes again after. From the keyboard, Tab goes from grip to grip, the arrow keys move a tile, 1, 2 or 3 set its width, and Delete hides it; Hide and the width buttons are for the mouse. Today's settings are behind a **Settings** button on the Today module.
- **Added modules,** hidden until Arrange shows them, each asking for what it needs only while it shows: **Weather** (from Open-Meteo: free, no account or key, the location to about a kilometer, cached for 30 minutes), **Top Apps**, **Network**, **Audio**, **Controllers**, **Pinned Notes**, **Recent Unlocks** (only once Games has loaded them) and **Timer**, whose end Maestro announces even with the window hidden, with a sound chosen in Sounds (Use as › When a timer ends), and a stopwatch.
- **The almanac** adds the day, week and season with the next solstice or equinox, the next full or new moon, daylight against yesterday, and, in the rotating line, composers born today, golden and blue hour, moonrise and moonset, and active meteor showers, all worked out on this PC. A reading and its note now read as one phrase ("2 days until Veterans Day").
- **System history:** the graphs show 5 minutes, an hour or 24 hours. Maestro samples every second and keeps each second for 5 minutes, each 10 seconds for an hour and each minute for a day, with the peaks and each point's time; before, it kept one sample every 10 seconds for 15 minutes. The pointer's reading and the graph's start show the time on the clock ("11:18:04 AM · 9 min ago"), right even after sleep.
- **The calendar editor** no longer scrolls sideways (Save was cut off), and takes any color: the picker or a hex code, for Countdowns and US Holidays too.
- **Continue Playing covers** are cropped around their middle instead of cut off at the bottom; a PS2 case at an angle is centered on its front art.
- **The roadmap** gains what Maestro is missing (a notes trash, scheduled backups, exports, reminders, media controls, a mixer, searching note text, module heights) and the polish notes for this design.
- **The `maestro` command.** The `ASCS` command is now `maestro` (`maestro status`, `check`, `try`, `backup-data`, `cut-release`, `help`), run through `C:\Scripts\maestro.cmd`; the script is `tools\cli\Maestro-Cli.ps1`, and its messages start with "maestro:". The test-build chip and the Markdown Reference's example say `maestro` too. Kept, so nothing already made stops working: the backups folder (`ASCS-Backups`), the window message a running Maestro answers, and the test builds `ASCS try` made, which `maestro try --end` still recognizes.
- **Polish after the pages were built.**
  - **Command Center widths.** The page is a grid three squares wide and three high. Every module is one square high and, set in **Arrange** with **1**, **2** or **3**, one to three wide; the rows share the window evenly. Arrange draws the grid small, with empty squares and a fourth row (which makes the page scroll) marked. Modules keep the order you set. Each fits its width: Now Playing's cover shrinks in one square, System's readings go into two columns, Continue Playing shows three games per square, and Quick Actions and Arrangements is one module whose two parts stack, or sit side by side when wide. Lists longer than their square scroll inside it.
  - **Text centered in its controls.** Bahnschrift and Lato keep more room above their capitals than below the baseline, so text in buttons, menus, tabs and keys sat 2 to 4 px high. Both now load with that room split evenly, keeping every line's height, so the capitals sit in the middle: within a pixel, measured on screen. The preview audit now measures this for every control.
  - **The almanac** cuts a long entry at three lines, with the whole of it in the tooltip, so it can't make the Command Center scroll.
  - **Quick Notes:** the text editor is a darker field edged in indigo and the Markdown viewer a lighter page, so the mode shows at a glance.
  - **Workspaces:** its first tab is **Arrangements**, which is what it holds.
  - **The Command Palette** is called that. Its foot says Super + Space opens it from anywhere, and the title bar's search box shows **/**, the key that opens it inside Maestro.
  - **The calculator** shows its answer large as you type, takes `x` or `X` for times, ignores `$`, reads `%` after a value as a percent (`80 * 15%` is 12; the remainder is now `mod`), and says why when it can't work something out. Typing `5x3` used to find nothing, so Enter ran a search instead. Enter now copies through Maestro, which works whether or not the window has the focus.
  - **Version 2.0.0** is shown everywhere: in the tray, the log, the help and the calendar files Maestro writes. The README no longer dates features by 1.x version; each release's manual and automated verification moved from README §12 to that release in this changelog.
- **Stage 3, Preferences.** Only what belongs to the whole app stays: Appearance (text size, logo swing), Windows (snap gap, keep size across monitors) and Power (the delay), as modules on one page, with no tabs. Every setting saves as it changes, so the Save buttons and the unsaved-changes bar are gone, and the title bar says so beside the page's name ("Saved at 2:32 PM"), on Games › Setup too; controls wait, disabled, until the saved settings arrive, so a save can't send blanks. The rest moved to the pages they belong to: **Games › Setup** (programs, the PSO session, RetroAchievements; was Games & Apps), the Wikipedia almanac to **Today's Settings** on the Command Center, spell-check to the foot of a note, and Maestro sounds to the Sounds bar. **On Their Own Pages** lists each, with a button to it. Messages that sent you to Preferences › Games & Apps now name Games › Setup. The old Preferences tabs, cards and save bar styles are removed; the page's own are in `37-2.0.0-preferences.css`.
- **Markdown, most of it.** The Markdown viewer now reads most of GitHub's Markdown: six heading levels and underlined headings, `_` and `*` emphasis, bold italic, strikethrough, highlight, code with backticks inside, `~~~` fences and a language label, nested lists, numbered lists that keep their start, task lists, quotes that nest and hold lists, tables with alignment, bare web addresses and backslash escapes. Line breaks are kept. Images show their alt text and are never loaded. Task boxes tick in the viewer and save. Ctrl + click opens a web link in the browser, through a new `OpenNoteLink` message that AHK checks (http and https only, no user name or password); a plain click still does nothing. **Markdown**, beside Placeholders, opens a reference of every kind, drawn by the viewer itself.
- **Stage 3, Quick Notes.** The page fits the window: the list of notes beside the open note, each a module, with **New note** in the list's heading and the note's title as its heading, in place of a "NOTE" label above "Saved privately on this machine". Notes now open in the **Markdown viewer**, formatted, and the **text editor** shows the plain text; Ctrl + M switches between them (Quick Notes only, from inside the text too), the viewer is drawn again each time it's chosen, and a double-click in it edits. This replaces Preview. New and empty notes, code notes, and a game's note opened from Games open in the editor. The save status says "All changes saved" in the footer, in sentence case, and group names are no longer in capitals. The list, its groups and the controls are at the 2.0.0 sizes. Styles for the parts that went (the kind label, its icon and toolbar, the Preview button) are removed; the page's own are in `36-2.0.0-notes.css`.
- **Maestro everywhere.** What was still called ASCS in the app now says Maestro: the startup error, launcher and toast windows, log lines and activity entries, the tray, the shortcut's description, and the `ASCS` command's messages about the app. The code name stays where it names something real: the repo and its folders and files, the `ASCS Leveled` folder in the sound library (renaming it would orphan copies made before; the Sounds page calls it Maestro Leveled), and the calendar's `PRODID`.
- **Tuning up, every time.** Every start, including a reload and a test build, shows **Maestro is tuning up…** at once. Until the page has loaded, Super says Maestro is still tuning up rather than opening a blank window; after 30 seconds it opens the window anyway, so a page that never loads can't keep it shut. The launcher no longer passes `--starting`.
- **Workspaces are now arrangements.** A saved set of windows is an **arrangement**, everywhere you read it: the Workspaces page, the Command Center, the palette ("Restore an arrangement…", "Save arrangement as…"), the key map and Commands, the tray menu, toasts, dialogs and the activity log. The page and its first tab keep the name Workspaces. Only the words changed: saved files, settings and hotkeys carry over as they are.
- **Ready when it says so.** Pressing Super while Maestro was starting could show an AutoHotkey error: the key reached for a window that didn't exist yet. Its hotkeys now wait for the window, Super says Maestro is still tuning up, and a toast at the top of the screen says **Maestro is ready.** once the page has loaded. The launcher's tooltip at the pointer is gone; the toast replaces it.
- **No scrolling into empty space.** A page whose content fits the window doesn't scroll: the bottom margin was counted twice on every page, from the old pages' padding and the new page margin.
- **Games fits the window.** No tab scrolls the page. Playing's modules share two even rows, and whatever is long (the library, a game's achievements, progress, site badges) scrolls inside its own module.
- **Scrollbars.** One style everywhere: a slim burgundy pill on no track, brighter under the pointer, with room between it and the text in the Calendar's and Games' lists.
- **Text boxes have room.** Quick Notes' box has more space at its sides and below the buttons above it, and the Games notes box got the same treatment.
- **Audio outputs say what they are.** Monitor Speaker (LG ULTRAGEAR) and Headphones (SteelSeries Arctis Nova 5), in the power tray, Sounds, Preferences and the activity log, using the kind Windows reports for each device. The Headphones preference now offers only outputs; it used to list microphones too.
- **Stage 3, Sounds.** Three sections: Library, In Use and Startup, in place of three tabs squeezed into a side panel, with most of the page empty beside them. Selected Sound now sits beside the library, so clicking a sound no longer changes tab. The two boards have the whole page: In Use shows its sounds in columns with longer level bars, so a sound's own level is easier to set, and Startup puts Sign-in Sounds beside Shutdown Sound. Play stays in one place on every row. The audio output is now on this page as well as in the power tray. Leveling works as before. Its styles, from eight older stylesheets, are now one file, `33-2.0.0-sounds.css`.
- **Nothing moves when it loads.** A space is held for whatever is on its way, with a loading indicator. Next Up on Games holds its place until RetroAchievements answers, and Notes is always beside Now Playing, so a game starting or stopping doesn't rearrange the page. Each row of the Command Center holds the height it reaches when full, and the page still fits without scrolling. System's drives, the Startup tab and Sounds' measuring got the same treatment. The preview tool's `shift-*` scenes measure this page by page.
- **Readings that stay live.** System's readings stopped a few seconds after the window opened until you changed page, on Home as well, in every release until now: a finished drive check rescheduled the five-second timer as a single run. They now keep coming, and a new test fails if any timer is set both ways. Live reads every second while it shows, and the end of each graph's line follows the current reading. The attention list still needs about 10 seconds of high usage, and the "Updated" time is gone.
- **Hardware rebuilt.** Four tiles (Processor, Graphics, Memory, Storage), Drives with a bar for how each is divided, Displays, Sound and Network, and Device, Motherboard, BIOS and Windows, showing everything Windows reports. The inventory moved to its own process, `ASCS.HardwareProbe.ahk`, so reading it no longer holds up Maestro. New details include true video memory, DDR type, voltages, slots, caches, socket, driver date, display mode, drive health and firmware, and Secure Boot. Drives now say NVMe and SATA where they said SCSI and IDE, and every partition is listed by purpose. How full a drive is moved to Live alone, since Hardware's figure was read once per session and went stale. Device no longer shows a drive's model in place of its own, and hardware details are no longer sent with every reading. The code that turns them into text is in `hardware.js`.
- **Title case.** Every heading, column head, tab and dialog title is in title case, checked by the smoke test. System's Sign-in tab is now Startup.
- **Room for the larger type.** The Calendar's hours are 60 px tall (were 48), so a one-hour event shows its time and title. The Sounds side panel is wider. In a window under 1701 px wide, the title bar's search box becomes an icon, so the page's name stays whole. Label columns are wider, and Quick Notes' tools wrap.
- **Manual pass.** All 79 items passed. Fixed from its notes:
  - **Drive bars** on the Command Center were 14 px shorter than Processor's and Memory's: the drive list set its scrollbar's room aside inside itself. It now comes out of the module's padding.
  - **A focus ring is never cut off.** The Calendars list cut the top of its first Edit button's ring; so did the notes list, the Workspaces inspector and rule list, the Library's and Logs' filter strips, the desktop tabs, the canvas's windows and the key map's edge keys. Lists and strips that scroll now leave room for the ring, segmented buttons and the canvas's windows draw it inside, and the smoke test focuses every control on every page to keep it so. The ring is white with an indigo halo, so it stands out on any surface.
  - **Quick actions** keep their focus ring when moved with the arrow keys (the cards were being rebuilt), and Remove is no longer a Tab or arrow-key stop: Delete on a card's grip removes it.
  - **Arrange's dock** keeps one shape and covers no module, and Tab goes from grip to grip (see **Arrange on the page**). Every page's entry animation had kept a transform after it ended, which pinned anything fixed on the page to the page rather than the window, so the dock first appeared over the modules; it now lets go when it ends.
  - **A quick Arrange, then Done** no longer maximizes the window: the title bar is the window's drag area, where Windows takes a double-click as maximize, and the Arrange button wasn't excluded from it. Every title bar button now is.
  - **No startup log error:** System's visibility check no longer runs into the window before it exists ("no property named Hwnd").
  - **Clock times on System's graphs**, beside how long ago.
  - **Saving as you go** is said in the title bar rather than at the foot of Preferences.
  - **Scrollbars** are burgundy.
  - **The almanac's Wikipedia requests** no longer carry the owner's email address: every request names the client the same way, `Maestro/2.0.0 (Aeolionware)`.
  - **The `ASCS` command** is retired: `C:\Scripts\ASCS.cmd` and `maestro.cmd`'s fallback to it go once 2.0.0 is on master.
  - **Finding text in a note.** Ctrl + F's filter on Quick Notes now also marks its words in the open note, in gold, in the viewer and the editor alike, with a count beside it; Enter and Shift + Enter step through them, and Esc clears.
  - **Quick Notes' footer** shows its one saved dot again: the title bar's new status had borrowed its class name and added a second.
  - Answered without a change: the keypad already moves the focus with Num Lock off (Edge reports its keys as arrows), and loading indicators show only while something is actually on its way.

## Version 1.11.2

Running and developing ASCS safely apart, before the redesign. Tested on the target system, with the owner's permission, by running the real commands against the live ASCS: a test build ran on a copy of the data, a calendar event written through it stayed out of the real calendar, and the real notes, settings and calendar files didn't change while it ran. 1,430 automated checks across the core, frontend and command line suites, and a 140-check smoke test. The layout redesign is next.

### Added
- **A daily copy of your notes.** `notes.json.bak` is replaced by nearly every save, so it couldn't undo a bad one. The first save of each day now keeps a copy in `data\notes-history`, and the newest 14 stay.
- **`ASCS try`** closes ASCS and runs a second checkout on a copy of your data, with its own calendar and **TEST BUILD** in the title bar. `ASCS try --end` deletes the copy and starts your real ASCS.
- **`ASCS status`** shows what's running and from where, whether that code is older than what's on disk, whether the version agrees everywhere, and errors logged since the last start.
- **`ASCS check`** runs the tests, parse check and hidden-character scan, with one result.
- **`ASCS backup-data`** copies your data folder outside the repo, keeping the newest ten.

### Changed
- **The title bar reports page errors,** with **View log**, instead of saying all systems are nominal.
- **`ASCS cut-release`** also checks a second checkout for uncommitted work, and stops if the CHANGELOG still says "in progress".
- **The `ASCS` command moved into the repo,** at `tools\cli`, so it's versioned and tested with everything else.
- **The launcher finds ASCS in any folder,** so it can't start a second copy during a test build.

### Performance and security
- The daily copy adds one small file copy a day, and a file check on each save. No timers, polling or network use.
- A test build's copy of your secrets file stays in a folder git ignores, and is deleted when the test ends. Its calendar config is rewritten and checked so it can't reach the real calendar.
- ASCS now exits on a window message, which, like the existing reload message, any program running as you can send.

### Verification

**On the target system:** tested on the target system, with the owner's permission, by running the real commands against the live ASCS, and not through the manual checklist.
- **`ASCS try`:** closed the live ASCS and ran a second checkout as the only running copy, with **TEST BUILD** in its title bar. Its calendar server ran on the copy's config. A test event sent to that server went into the copy and not the real calendar. A reload stayed in the test build, and a second `try` was refused.
- **`ASCS try --end`:** closed the test build, deleted the copy and started the real ASCS with its own calendar server. Hashes of the real notes, settings and calendar files, taken while the test build was running and before the test event, still matched after it ended.
- **The other commands:** `status`, including older code on disk; `check`; and a complete `backup-data` with ASCS closed.
- **Daily notes copies:** the real save code was run in a temp folder, including pruning and a copy that can't be made.
- **Not exercised on the live app:** a page error in the title bar (covered by the smoke test), typing in the test build's interface, and the Ctrl + Alt + Shift + A keys themselves (the same reload was triggered through the launcher). No items are open.

## Version 1.11.1

Per-game notes with session timestamps. The first run showed an empty Quick Notes list at startup, with the notes themselves safe in the file. That was fixed, and two restarts after the fix logged no page errors. The owner then reported the release good, using a short list of checks in place of the full checklist. 1,348 automated checks and a 130-check smoke test. The layout redesign is next.

### Added
- **Game notes.** Each game has one set of notes, shown under Now playing, in a library game's details and in the achievement browser. They're an ordinary note in Quick Notes, in the Game notes group, made when you first type. The same game on two emulators shares one note.
- **Add timestamp.** Adds a heading with the date and time, plus how far into the session you are if that game is running. It's in the notes box, and above a linked note in Quick Notes.
- **Notes for current game** in the palette opens the running game's note in Quick Notes, ready to type.
- **Unlink** in Quick Notes keeps a note but stops linking it to its game.

### Fixed
- **Replies that reach the page during startup now wait until every script has run.** Before this, a reply that arrived too early could stop part of the page from drawing. The same timing also logged a `renderWorkspaceManager` error at startup.

### Performance and security
- No timers or polling. Typing uses the existing delayed save. Add timestamp and the palette entry each ask once what's running, through the existing `GetGamesLive`.
- No network use, listener, hotkey or new message. ASCS checks the new `game` field when saving, and a game's title is tidied, capped and shown only as text.

### Verification

**On the target system:** reported good by the owner, using a short list of checks in place of the full checklist. The first run showed an empty Quick Notes list at startup, because a reply reached the page before its last script had loaded; the notes were safe in the file. After the fix, two restarts logged no page errors, and the smoke test now delivers replies that early. No items are open.

## Version 1.11.0

Toasts at the top of the screen in place of cursor tooltips, and site badges in Games with mastered games marked. Manual pass: all 17 items passed, and both retest items passed after the two visual notes from that pass were fixed. 1,306 automated checks and a 94-check smoke test. Routines, iPhone calendar sync and the console hub stay on the roadmap.

### Added
- **Site badges in Games.** Your RetroAchievements awards as a grid of game art, newest first, with tabs for All, Mastered, Completed, Beaten and Events (and Community when you have any). Mastered games have a gold frame, totals join the stats, a card shows the game and date, and clicking a game's badge opens its achievements.

### Changed
- **The Achievements stats line up:** equal columns, with every label and value on one line. The back control in a game's achievements is a larger button.
- **Toasts at the top of the screen replace the tooltips at the cursor.** A short notice about what a hotkey just did shows at the top center of the active monitor. Up to three stack, and a repeat shows a count. It never takes focus, clicks go through it, and it shows over fullscreen games. While ASCS is in front, you get its own toast instead, so saving a workspace no longer notifies twice.

### Performance and security
- The toast is a small native window, built only while there's something to show (about 5 ms each), with one timer while it's up. It takes no input. No new listener, elevation or hotkey.
- Site badges add one request to retroachievements.org, with the same key, only once the Achievements section is on screen, kept for 10 minutes. Images load as they scroll near view, through the existing route. No address is ever taken from a response.

### Verification

**Manual pass** (17 items): all passed. Two notes were acted on: the Achievements stats now line up in equal columns, and the back control in a game's achievements is a larger button. The 2-item retest of these passed. No items are open.

**Verified automatically:**

- **Site badges:** one real reply from `API_GetUserAwards` (71 awards, up to 2026) set the parser's fields and was run through the real page in headless Edge: 17 mastered, 3 completed, 50 beaten and 1 event, 52 games and events under All. The smoke test checks each game showing once, hidden empty tabs, the gold frame, hostile titles staying text, the card staying inside the section, a badge opening its game, an event opening nothing, and the failed and empty cases. The message is allowlisted; a request through ASCS itself wasn't made in an isolated copy, because those don't hold the key.
- **Toasts:** in an isolated copy, with a real game in front in PCSX2: the foreground window never changed across five checks; a point in the toast's center resolved to the window behind it; it stayed on top, centered on the active monitor, with the no-activate and tool-window styles, and a workspace save would skip it. A fourth message dropped the oldest, a long one wrapped, each went on its own and the window and timer went with them. Ten notices in a burst took 47 ms.

## Version 1.10.0

The Workspaces page rebuilt so a saved workspace can be read and edited, with a canvas at the monitor's real shape, and launch rules. Manual pass: 30 of 31 items passed, and the other, Save current as…, was then confirmed good with no change. The notes from that pass were fixed afterward, and all 6 retest items passed. 1,265 automated checks and a 76-check smoke test. Routines, iPhone calendar sync and the console hub stay on the roadmap.

### Changed
- **The Workspaces page is rebuilt.** A strip chooses a workspace, and the whole page shows it, with text you can read: window names were 9.5 px and are now 15 px. A tab for each desktop shows it on a canvas at your monitor's real shape, where screens used to be forced to 16:9, with a list of every window under it.
- **Restore and Launch rules are one chip away,** and **Save current as…** now asks before replacing a workspace.

### Added
- **Edit a saved workspace.** Change a window's desktop, monitor and place with ready-made thirds and halves or exact percentages, drag it to move or resize it (edges stick to thirds, the middle and other windows; Esc cancels), or use the arrow keys. Pin it to every desktop, switch it off so Restore leaves it alone, remove it, or add an open window. **Duplicate** copies a workspace. Editing changes only the saved file, never an open window.
- **Launch rules.** When an app starts, its first window goes where you remembered, on the same monitor and desktop. Remember an open window, or use **Always open here** on a saved one. Rules only move windows; they never open anything.
- **A window that fills the usable screen is Full,** and is restored maximized, however it got there: saved that way, typed, dragged, or from an older workspace. This also applies to launch rules.

### Fixed
- A workspace name ending in a line break got past the name check.

### Performance and security
- Launch rules add one shell hook that tells ASCS when top-level windows are created, and only do work for an app with a rule; nothing polls. Edits are small file writes, and a drag sends one message, on release. No new listener, network use, elevation or hotkey.
- The page can never set an app's path or command for a saved window, because Restore launches what the file holds. Only AHK writes a path, from a real window, and it's checked again at restore. Every new message is validated in AHK.

### Verification

**Manual pass** (31 items): 30 passed. C1 (Save current as…) was marked as a failure and then confirmed good, with no change. Four notes were acted on: **Duplicate** ignored the suggested name; a window filling the screen is now **Full**, including one sized to 100% in the page; removing the last window says so before any dialog; and the strip's window count could go stale, which was reproduced with the save field open. A window sized to 100% in the page also became **Full**, at the owner's request. The 6-item retest of these passed. No items are open.

**Verified automatically:**

- **Launch rules:** in an isolated copy with test windows, Remember stored the right app, place and desktop, and a process just started measured 564 ms old. A fresh launch at 50,50 moved to exactly 700,300 500×260. Only the first window moved; the second stayed where it opened. With the rule off, nothing moved. A rule on a temporary desktop put a relaunched window on that desktop, in place. A window shown 16 seconds after its process started stayed put.
- **Editing a workspace:** in an isolated copy with a fake workspace, an edit changed only the place and switches and kept the app's path, leaving no temp file. A desktop the file doesn't have, an index out of range and an extra field carrying a path were all refused, with the file unchanged. Remove renumbered the rest, and refused the last window. Duplicate refused an existing name and Default. An added window's path came from the window; a bad handle was refused. Restore used the edited place (0.25 left, 0.5 wide, as set) and didn't reopen a window switched off. **Always open here** took the saved place, and a fresh launch went there.
- **The page:** the smoke test checks the canvas's real shape, that no text is under 12.5 px, that hostile names stay text, each kind of edit's message, and a drag with real pointer events: it moves live, sends nothing until released, then one edit, and Esc cancels. Headless Edge renders of each state: a workspace, a window off, a missing app, two monitors, no workspaces, and launch rules.

## Version 1.9.2

A cleaner shell with no tagline or footer, power options in a tray on every view, ASCS Logs as a dialog, Games loaded ahead of time with its first-load freeze fixed, a sideways wheel in more places, and the sign-in history as a compact graph. Manual pass: all 21 items passed, and all 6 retest items passed after the notes from that pass were fixed. 1,114 automated checks and a 36-check smoke test. Launch rules, routines, iPhone calendar sync and the console hub stay on the roadmap.

### Changed
- **Power options are in a tray on every view:** **Power** at the bottom of the sidebar opens Lock, audio output and the hold-to-confirm actions, which work as before. They've left the Command Center.
- **Logs moved out of the sidebar** into a dialog, **ASCS Logs**, from System Dashboard or the palette. Preferences is now Ctrl + 9 and Super Commands Ctrl + 8.
- **The sign-in history is a graph with data points,** one short row in System Dashboard, in place of the bars, and shows the last 20 sign-ins. Hovering shows a card with that sign-in's date, stage times and sound, named by its Windows version when it's a Windows startup sound.
- **Games opens with its library in place:** it loads once in the background after the Command Center first opens. Covers and RetroAchievements still wait until Games is open.
- **Sideways wheel:** on the Calendar it steps through days, weeks or months, on the Sounds panel it switches tabs, and on the Command Center's almanac it steps through its items. Continue playing and code in notes already scrolled sideways.

### Removed
- The tagline, the footer on every view, and the CLICK label.
- Preferences › Workspaces, which only linked to the Workspaces page.

### Fixed
- **New calendar event** could be chosen as a quick action, but ASCS refused to save it, which also dropped any other change saved with it.
- Preferences no longer names the ASCS sounds, which can be anything set in Sounds › In use.
- The first load of Games froze hotkeys for about 3 seconds while reading Dolphin's game list. It now takes about 15 ms.

### Verification

**Manual pass** (21 items): all passed. Four notes were acted on: the ASCS sounds are no longer named in Preferences; **New calendar event** could be picked as a quick action but wasn't saved (it is now); the thumb wheel steps the almanac; and the sign-in graph has a proper hover card. The graph's card also began naming a Windows startup sound by its Windows version. The 6-item retest of these passed, including a real sign-in after the retired scripts were removed from `C:\Scripts`. No items are open.

**Verified automatically:**

- **The first Games load:** measured on the real library in an isolated copy, it blocked AutoHotkey's thread, and so every hotkey, for about 3.1 s, nearly all of it parsing Dolphin's 6 MB game list byte by byte. With a native byte search the parse took 15 ms instead of 3,110, and found the same 73 games with no differences from the old parser on the real file. The search only reads, and is probed with guard bytes in the core tests. A whole library build now takes about 50 ms, so loading it ahead of time is safe.
- **The shell:** headless Edge renders of the Command Center, System Dashboard with the graph, the power tray over the Calendar, and ASCS Logs.

## Version 1.9.1

Fixes from the 1.9.0 pass. 1,077 automated checks and a 22-check smoke test. Manual pass: every item passed after two Now playing fixes for RetroArch, found in the first pass (17 of 18) and its retest. This closes 1.9.0's E2. Launch rules, routines, iPhone calendar sync and the console hub stay on the roadmap.

### Fixed
- **Startup sounds had no effect** (1.9.0's E2): chances and levels in Sounds › Startup were ignored, and XP played at 0%. `SignIn.ahk` reads those settings, but `C:\Scripts\Configure-Startup.ps1` hadn't been run since it moved sign-in to that one script, so five older tasks kept running, one playing a fixed file. It needs one elevated run and a restart.
- **Super + Shift + E opened Documents** while Super + E opened This PC. Both now follow "Open File Explorer to".
- **Now playing said "At the menu" in RetroArch** while a game was running: RetroArch 1.22 doesn't name the game in its window title. ASCS now reads it from the command line, or from RetroArch's history for a game started from its own menu. After Close Content it says "At the menu" again.
- **Mastered games have a gold bar** in Now playing and the achievement browser, as they already did in the Progress list.
- **Continue playing cut off** the top and left of a hovered or focused tile.
- **Workspace saves counted hidden system windows:** a closed Settings and the input panel were saved as windows, and a real Settings window on another desktop counted twice. Their missing desktop also hid the "across desktops" wording. Older saves ignore those entries, and restoring them no longer tries to launch them. The notice now reads "3 windows across 2 desktops", or "1 window".
- **`Startup Status.cmd` reported old tasks as OK** and showed test runs as the last sign-in's timeline. It now flags retired tasks, a missing sign-in task, and a stale timeline.

### Added
- **A warning when sign-in isn't using your settings:** Sounds › Startup, the log and Recent Activity say so if an old task is left or the sign-in task is missing. The check only reads Task Scheduler.
- **Sign-in comparison** in System Dashboard: the last 10 sign-ins, with the time until the taskbar was ready.
- `Configure-Startup.ps1` checks its own result, says if it didn't finish, and records the outcome for `Startup Status.cmd`.

### Verification

**Manual pass** (18 items): 17 passed, including real sign-ins and shutdowns after `C:\Scripts\Configure-Startup.ps1` was run, which closes 1.9.0's E2. C2 failed: Now playing said "At the menu" in RetroArch, because RetroArch 1.22 doesn't name the game in its window title. On retest C2, C4 (a game started from RetroArch's menu) and E1 (the sign-in comparison) passed, and C5 failed: the game stayed named after Close Content. After that fix, the final retest passed: C5, C6 (loading a different game), C7 (a game started from Games) and E2 (test runs left out of the comparison). No items are open.

**Verified automatically:**

- **Startup sounds:** `StartupApproved` timestamps (last written 2026-11-03 11:04:28, before the single-task version of `Configure-Startup.ps1` at 13:31) and the old tasks still running showed that version had never run. The fix itself needs an elevated run and a restart, so it's in the manual pass. Against the unfixed state, `Show-StartupStatus.ps1` now names the missing task, all five old tasks, and the stale timeline, and an isolated ASCS gave the warning in the Task Scheduler check, the log and Recent Activity.
- **Explorer:** live, with an Explorer window already open, `explorer.exe /n` opened Documents, and plain `explorer.exe` opened This PC in a new window each time. In the isolated copy, the real command with a new window forced opened This PC.
- **Workspaces:** a real Settings window moved to another desktop reports that desktop (as both its frame and its inside), and a closed one reports none, which is what tells them apart. In an isolated copy with a fake data folder, a real save held no suspended windows. A copy of the 2026-11-06 layout (2 windows and 3 suspended ones) showed 2 windows, and restoring only suspended entries opened nothing, where before their valid paths would have launched them.
- **Continue playing:** before and after renders in headless Edge of a raised, focused tile: the top and left of the outline were cut off, and now aren't; the tile still lines up with the heading.

- **RetroArch and sign-ins (after the manual pass):** RetroArch 1.22.2's program holds no title format naming the game. In an isolated copy, a stand-in process with RetroArch's arguments gave Golden Axe (World) in 47 ms, then 0 ms from the cache (no game was started); the real sign-in log gave today's restarts and left out test runs with no taskbar. Started from RetroArch's own menu, the game is read from its history by the core in the title; the retest confirmed that format, and the live log shows the menu's title is just "RetroArch". After Close Content, no game is named, because the title goes back to "RetroArch", as the final retest confirmed.

## Version 1.9.0

The Workspaces page and workspaces across desktops, the achievement browser, a finished calendar (resizing, dragging in Month, wheel pickers, Undo), and the large files split by feature with a smoke test. Manual pass: 18 of 19 items passed; E2 (startup sounds) is open, because `C:\Scripts\Configure-Startup.ps1` hasn't yet been re-run from an elevated session. 1,023 automated checks and a 15-check smoke test. Launch rules, routines, iPhone calendar sync and the console hub are not in this release; they move to the roadmap.

### Fixed
- A restored window landed a border's width to the left of where it was saved, and a little larger: positions are now saved as the visible frame.
- **Only this one** keeps the occurrence in its series as a changed occurrence (the iCalendar way) instead of making a separate event, so later changes ask again, and putting it back as the series has it rejoins the series.
- Day and Week keep their scroll position when stepping through days or weeks (it jumped back to 7:00 or to now); Today still goes to now.
- Changing a repeating event in the editor now asks **Only this one** or **Every event in the series** in the same dialog as dragging, every time (the editor's small radio buttons, which defaulted to the whole series, are gone); Delete asks too.
- **Where it lands** no longer disappears when the end is before the start, which shifted the editor's fields under the mouse wheel; it stays and says so.
- Moving one event of a repeating series moves the series by whole days plus the clock change, so the series no longer slips an hour when the move crosses a daylight-saving change.

### Changed
- **The large files are split, with no change in behavior.** `ASCS.ahk` keeps the globals, WebView setup, navigation and the message allowlist; each feature moved verbatim into `lib\features` (18 files), included where it was, so the script AutoHotkey runs is byte-for-byte the same. `styles.css` is now 15 files in `frontend\styles`, in its original order (the cascade depends on it).

### Added
- **Workspaces page** (sidebar, Ctrl + 4): each saved workspace as a card with a map of its windows on each desktop and monitor, and Restore, Save over, Rename and Delete. Ctrl + 1–9 follow the sidebar, so pages after Calendar moved down one, and Preferences is Ctrl + 0.
- **Workspaces across desktops** (with VirtualDesktopAccessor): windows from every desktop are saved (up to 48) and restored to their desktops, pinned windows pinned again; missing desktops are added only after asking.
- **The achievement browser:** click a game in Achievements to see every achievement, unlocked and locked, with points, rarity, unlock dates and whether it's progression, the win condition or missable; filter (locked, unlocked, missable, progression) and sort (game order, points, rarest). **Next up** shows the last game's next locked progression step and the missable ones still open; **More unlocks** pages through the last 30 days.
- **Resizing events** in Day and Week by their top and bottom edges, snapped to 15 minutes.
- **Dragging in Month:** events and multi-day bars move between days, keeping their times, with the target day outlined.
- **Wheel pickers** in the event editor: hour, minute and AM/PM, and month, day and year (start, end and repeat-until), each turn with the mouse wheel or the arrow keys, or take typed digits and A/P; dates keep their calendar pop-up.
- **Undo** for every calendar change (drag, resize, Save, Delete, Back to the series), in its notice for 10 seconds; it never overwrites a change made elsewhere in between.
- **Back to the series** in the editor of a changed occurrence.
- **A smoke test** (`tests\smoke.js`, run by `run-tests.ps1`): the real page with a stand-in for WebView2 opens every view, failing on any script error and on any message ASCS doesn't accept.

### Verification

**Manual pass** (19 items, covering the file split, the calendar, the achievement browser and Workspaces): 18 passed. E2 (startup sounds) is open: the sign-in task that runs `SignIn.ahk` is applied only when `C:\Scripts\Configure-Startup.ps1` is re-run from an elevated session.

**Verified automatically:**

- **The file split (stage 1), with no behavior change:** `ASCS.ahk` went from 7,817 lines to 1,042, with 18 feature files in `lib\features` included where each section was; pasting the includes back gives the original byte for byte, so AutoHotkey runs the same script. `styles.css` became 15 files in `frontend\styles`, linked in the same order; joined, they're the original byte for byte. Screenshots of all nine views and three Sounds states, before and after, differ only where two runs of the unchanged page differ (the clock's minute, and live Notes and Dashboard readings). The isolated sound and power-action smoke tests give the same results as before, and the parse check is clean.
- **Workspaces across desktops (stage 4a):** 9 core checks for matching saved desktops (by name, then number; missing ones and how many to add) and 10 for the maps. Isolated run with test windows under a renamed AutoHotkey (so a restore could match nothing else) and a temporary desktop: the save recorded A on its desktop, B on the temporary one and C as pinned; after scrambling them, the restore put B back on the temporary desktop at exactly its saved position (520,160, after fixing the old border offset; it was 513), A on its own, and pinned C again; the desktop was removed afterward. Rename: plain, onto an existing name (refused, both kept), Default (refused), a path (refused) and a change of case. The view rendered in headless Edge with sample layouts, and the smoke test now also checks every view sets its title.
- **The achievement browser (stage 3):** 25 new unit checks (a game's achievements in order, counts, filters, sorts, rarity, Next up, unlocks newest first, and hostile input: markup kept as text, bad numbers, badges, types and dates dropped) and 9 for game IDs. In headless Edge with sample replies fed through the page's own message handler: Next up chose the first locked progression step and counted the missable one still open; the browser's filters and counts, missable filter and rarest-first sort were right; badges were asked for at most 30 to a request; More unlocks paged 15 unlocks six at a time with Older disabled on the last page; an unlock opened its game; a failed fetch showed its message.
- **Calendar (stage 2):** 29 new unit checks (resizing edges, whole-day moves across daylight saving, the time picker's steps and typing). In headless Edge with sample calendars and saving replaced by a record: the end of a 2–4 PM event dragged to 5:30 saved 2:00–5:30, its start dragged to 1:15 saved 1:15–4:00, the end dragged above the start stopped at 15 minutes, and Esc cancelled; in Month an event moved five days keeping its 3:00–3:30 PM, and a three-day bar moved a week; countdowns weren't draggable; the picker's wheel, touchpad nudges (adding up to a step), A/P, typed digits and arrow keys set the time, the end followed the start, and All day hid it. With a stand-in server keeping events in memory and checking version tags: Only this one kept the change inside the series (no separate event), dragging it back asked again and rejoined, Back to the series and its Undo worked, Undo after Every event restored the series text exactly, Undo after a change elsewhere refused, and a deleted event came back with Undo; Day view kept its scroll position across days and into Week, and Today went to the current time. After the first pass: Save, Delete and drags of a repeating event each asked, again after Cancel or Esc; the date picker's wheel stepped days (the end following) and months, typing 2027 set the year, and repeat-until got a picker; with the end before the start, the strip said so and the rows below stayed put (same position and height).
- **The smoke test** fails on a planted duplicate declaration in `soundsview.js` (naming the file and line) and on a planted message outside the allowlist; with the code as it is, all 14 checks pass.

## Version 1.8.1

Startup sounds move into ASCS, leveling always starts from the original, and each sound can have its own level. Built at the owner's request after 1.8.0. Manual pass (`tests\manual-1.8.1.html`): 21 of 23 items passed; a real sign-in and shutdown (B2, B3) were left for the next restart. Reset levels came from the pass. 911 automated checks.

### Added
- **Sounds › Startup:** a third tab for the sounds played at Windows sign-in (one picked by chance) and at shutdown, with its own startup level (presets Quiet, Balanced, Bold, Like XP and Middle of yours), Play all, Match, Match all, Restore, Restore all and Remove. Each sign-in sound's chance sits beside it and is saved once the chances add up to 100. Up to 8 sign-in sounds.
- **Reset levels** (from the manual pass, C4): one link on In use and Startup, beneath Play all and Match all with Restore all, puts the notification and startup levels, Target RMS and every own level back to their defaults, without changing any sound.
- **Use as › Startup:** "Sign-in sound (adds to the chance roll)" and "Shutdown sound", offering a copy matched to the startup level.
- **Own levels:** a gold handle on each row's bar gives that sound its own level, −12 to +12 dB around its board's, in half-dB steps (drag it, step it with the arrow keys, or type one; double-click, Home or × goes back). Matched, Match, Match all and Use as follow it.
- `C:\Scripts\SignIn.ahk` and `Shutdown Sound.ahk` read the sounds and chances from `data\startup-sounds.ini`, which ASCS writes (and creates at launch with the defaults if it's missing); they fall back to Windows' own XP sounds. `SignIn.ahk --sound=N` now forces sign-in sound N.

### Changed
- **Match levels the original:** ASCS records which original each leveled copy came from (`data\sound-origins.ini`), and Match, Match all and Restore work from it on both boards, so gains no longer pile up in chained copies. Earlier copies are traced back by name.
- **Hand-leveled copies retired:** ASCS's show and hide sounds default to Windows XP's Logon and Logoff Sound from the library, and the `Aeolionware Startup` folder (the hand-leveled 95, 98 and Me startup sounds and `ASCS Sound Files`) was moved to the Recycle Bin. The first sign-in roll uses the library's originals at the same chances (XP 88%, Me 10%, 98 1%, 95 1%); Match them once on the Startup tab.
- **Selected sound levels from the original too:** with a leveled copy selected, Save leveled copy and Use as make the new copy from its original with one total gain, so names never stack gains.
- **Replaced copies are cleared away:** when Match, Use as, Restore or Remove stops a sound playing a leveled copy, the copy goes to the Recycle Bin unless something else plays it, a Restore points to it, or it was saved by hand.
- Leveled copy names drop `=`, `[`, `]` and `;`, so they're safe as ini keys.

### Verification

**Manual pass** (`tests\manual-1.8.1.html`, 23 items): 21 passed, covering the Startup tab, chances, the forced sign-in sound (B1), Match from the original on both boards and in Selected sound, replaced copies cleared away and the backlog cleared with Select, own levels, and the retired folder. B2 (a real sign-in) and B3 (shutdown) were left for the next restart. C4's note asked for a way to put the levels back to their defaults without changing any sound; **Reset levels** (F1) was added for it, and the board's actions were rearranged so it fits: Play all and Match all on one row, Reset levels and Restore all as links beneath.

**Verified automatically:**

- Unit tests: 911 checks (400 core, 511 frontend), including Reset levels' list of changes: startup slots, entries and chances, copy names stripped of gains, and own levels (snapping, bar position, cleaning saved values).
- In an isolated copy with a throwaway library and data folder: defaults written on first use; chances that don't add up to 100, or don't match the number of sounds, refused; add at 0%, a repeat refused, remove handing the chance to the first; Match from the original, then again from the original (not the copy), then Restore; a pre-1.8.1 chained copy traced to its original by name; the shutdown sound's copy refused for deletion.
- The sign-in and shutdown scripts' new functions, run on their own against test files: a 5,000-roll at 88/12 came out 87.4/12.6; a forced slot, a missing slot, zero and malformed chances, a chance over 100 and totals other than 100 all behave; the shutdown sound falls back to Windows' own when unset, missing or not a WAV. Both read the live file correctly. Both scripts parse cleanly.
- Clearing replaced copies, in an isolated copy (Recycle Bin replaced by plain removal, no Windows events, which would write the real registry): Match twice clears the first copy and its record; a copy still used as the shutdown sound is kept until that's restored; a copy saved by hand survives replacement and Restore; Remove and Restore clear theirs; ASCS's show sound, matched twice then restored, leaves no copy; a copy a Restore points to is kept; originals are never touched.
- Selected sound with a leveled copy selected, in headless Edge: the panel names the original and its total gain, and Save and Use as level the original.
- Own levels in headless Edge: a drag to three quarters across set +6 dB, arrow keys stepped 0.5 dB with focus kept, Enter opened the typed level, and all were saved; Matched and Match follow the own level.

## Version 1.8.0

Released after three manual passes on the target system (`tests\manual-1.8.0.html`); every item passed in the end. Round 1 (61 items) found the restart closing apps before they could ask about unsaved work, and test steps for the In use board that couldn't be followed; round 2 found a second Match doing nothing, event text sitting high, and asked for an indicator when moving events; round 3 found that indicator was meant for dragging, which then shipped. Quick Notes groups, Select in Sounds, US holidays and dragging events were added along the way at the owner's request. iPhone calendar sync is designed and moves to 1.9.0. 867 automated checks.

### After manual pass round 3
- **Dragging events in Day and Week:** an event dims where it was while a dashed outline in its color shows where it will land, snapped to 15 minutes, keeping its length, labeled with the new time (and day, across days). Dropping saves; Esc or dropping in place cancels; a click still opens the editor. Repeating events ask: only this one, or every event in the series. This is the indicator asked for in round 2's E4 and round 3's E2. The editor's save is now shared, so a drop saves exactly as the editor would.
- **Where it lands** covers all-day and multi-day events too: a strip of the days around them.
- **Tests:** 6 new (snapping), 867 in all.

### After manual pass round 2
- **Quick Notes groups:** one level of groups, from an optional `group` on each note (no migration; older versions ignore it).
  - **List:** pinned notes first, then groups with collapsible headers and counts (pinned groups first, then A to Z), then Ungrouped. Open and pinned groups are kept on this PC.
  - **Header menu:** Pin group, Rename (in place; onto an existing name it merges, after asking) and Delete group (its notes move to Ungrouped; nothing is deleted).
  - **Group field** in the editor, suggesting the groups in use.
  - **Palette:** "Group › Title", so "cl bug" finds Claude › Bug.
  - **Checked on save:** ASCS refuses a group over 60 characters or with control characters, keeping the previous file.
  - **Performance:** a 500-note list re-renders in about 4.6 ms.
- **Fixed: Match on a second row did nothing** (D5). The library refresh after a match let go of the In use sounds; they're kept now, fetched again if missing, and Match on another row while one runs queues it.
- **Fixed: event text still sat high** (E2). Chips and bars now center on the letters (`text-box` trimmed to the capitals), with room kept for descenders.
- **Power:** VS Code marks only its active tab as unsaved (C2), so its own backups of unsaved files made since it started count too. The hold reads "Restart on hold" with one line of explanation, and the arm warning lists each warning as a sentence.
- **Sounds:** your own folders (Aeolionware Startup, ASCS Leveled) are buttons beside Favorites, out of the version grid.
- **Calendar:**
  - **US Holidays:** a read-only calendar of the federal holidays and common observances, worked out on this PC. They count down on the Command Center by default (Preferences › Countdowns), and yours replace one with the same name or date.
  - **Where it lands:** the event editor shows a strip of the event's hours with that day's other events, redrawn as times change, noting overlaps (E4). After round 3 (E2 showed no indicator), all-day and multi-day events get a strip of the surrounding days too.
- **Tests:** 44 new (16 core, 28 frontend), 861 in all.

### After manual pass round 1
- **Fixed: a restart closed apps before any could ask about unsaved work** (C2). Windows asks apps to close one at a time, so by the time an app asked, others (RetroBar among them) were already gone, and Windows 11 Notepad and VS Code never ask. ASCS now checks first, from window titles only (a leading `*`, `●` or `•`). The arm warning names the apps, and when the countdown ends ASCS holds before running `shutdown.exe`, with **Restart anyway** and **Cancel**. It looks again every 2 seconds and goes ahead once they're saved or closed. Sleep is never held. Verified in an isolated copy with the power calls stubbed and a stand-in unsaved window.
- **Sounds:**
  - **Delete** on a leveled copy, with a confirmation. It goes to the Recycle Bin, and only WAVs directly in `ASCS Leveled` that nothing plays can be deleted (checked by ASCS as well as the page).
  - **Restore all** in In use, with a confirmation, undoes every change ASCS made to Windows and ASCS sounds.
  - **Select** deletes several leveled copies at once: pick them (Shift + click for a range; copies in use can't be picked), then **Delete (N)** after one confirmation. Up to 200, sent 10 to a request so ASCS stays responsive; each copy gets the same checks as a single Delete, and one that fails is skipped with its reason.
- **Calendar:**
  - Multi-day bars are pointed where they continue, instead of ending in a small arrow character.
  - Text is vertically centered in events and bars.
  - Countdowns are rounded pills with an hourglass instead of a dashed outline, so they read differently from yearly events. Their color is chosen with **Edit** beside Countdowns.
  - A one-off countdown is removed the day after its date.
  - Moving an event's start (date or time) moves its end too, keeping the length. Before, a start set past the end left an error, and only date changes moved the end.
  - A **1 minute before** reminder.
  - The reminder pop-up carries the ASCS icon, "Starts in 5 minutes · Today 3:00 PM" and the location, and clicking it opens the Calendar.
- **The sidebar footer** is a quiet card: the wordmark and version on one line, the status with its dot beneath, and the Super keycap centered.
- **Ask fields use camelCase:** the menu inserts `{ask:name}`, and the palette shows a name like `clientName` as "Client name". Existing notes work as before.
- **Manual pass round 2** (`tests\manual-1.8.0.html`, 22 items): retests C2; rewrites D10 to D16 with where each control is and what a pass looks like; covers each change above.
- **Moved to 1.9.0:** dragging events to 15-minute slots (since brought back into 1.8.0, below), and a time picker that changes with the mouse wheel.
- **Tests:** 53 new (42 core, 11 frontend), 817 in all.

### Stage 1: Shortcuts, power delay, sounds
- **Shortcuts inside ASCS** (while it has focus): **Ctrl + 1–9** switch views in sidebar order, with each sidebar item showing its number (worked out from the order, so new views take the next one); **Ctrl + N** makes a new note from anywhere (even before the notes have loaded); **Ctrl + F** only ever searches the current page (pages without a search box ignore it; Super + Space stays the palette); **F1** opens and closes **Help** (also the **?** button in the title bar): the shortcuts inside ASCS and the main Super ones as keycaps, with the configured letters; the pages with their numbers, the current one highlighted, each clickable; and a link to every Super shortcut. The **?** key itself is left free for later. Browser shortcuts stay off, so these reach the page.
- **Power action delay** in Preferences › General: none, 5 seconds (default) or 30 seconds, for Restart, Shut down, Sign out and Sleep.
- **Fixed: Restart and Shut down force-closed apps.** 1.7.0 used Windows' own 30-second timer, but `shutdown /t` above 0 implies `/f`, so apps with unsaved work were closed without asking. ASCS now counts down itself and runs `shutdown /r` or `/s` with `/t 0` and no `/f`. Verified in an isolated copy with the real calls replaced by log lines (no delay, a canceled 5-second shutdown, a completed 5-second sign out).
- **ASCS sounds:** your logon and logoff sounds when ASCS shows and hides (default), when it starts and exits, or off; never at Windows sign-in or shutdown.
- **Fixed: a custom Claude quick-entry shortcut reverted to Ctrl + Alt + Space at every start** (the setting was read into a local variable). Found through the parse check's warnings.
- **Startup sound odds** (in `C:\Scripts\SignIn.ahk`, outside ASCS): Windows Me 10%, 98 1%, 95 1%, XP otherwise, from your hand-leveled copies (all measured at RMS −26.4 dBFS, matching the XP sound); XP plays if one is missing. Checked over 100,000 rolls; `Startup Status.cmd` shows which played.

### Notification level board, and a placeholder menu
- **The In use tab is a notification level board:**
  - **Measurement:** every sound in use (ASCS's three and Windows' events) is measured for loudness the way the ear hears it (ITU-R BS.1770, in LUFS) against one **notification level**.
  - **Target:** −24 to start, with − / + and presets: Quiet, Balanced, Clear and Middle of yours.
  - **Rows:** each has a bar and "Matched" or "N dB louder or quieter".
  - **Actions:** **Match** or **Match all** saves leveled copies and switches to them, held back if the peak would pass −0.3 dBFS. **Play all** plays them in turn. **Restore** now covers ASCS's own sounds as well as Windows'.
  - **Use as** offers a matched copy by default when a sound is off the level.
  - **Safety:** sounds are requested by event name only, never by path.
- **Loudness tests:** checked against the standard's own reference values. A 1 kHz tone at −20 dBFS reads −23.0 LUFS in one channel and −20.0 in two, at both 48 and 44.1 kHz. A 40 Hz rumble counts for less, silence is gated out, and a sound shorter than one block is still measured.
- **Placeholder menu:** **{ } Placeholders** in the notes editor lists every placeholder with a live example. Clicking one inserts it at the cursor, with the name or number selected to type over. **Fill in when pasting** sits at the bottom, and inserting turns it on.
- **The frontend test page now fails on a test file that doesn't load.** A syntax error had silently dropped a whole file's checks, and the run still reported all passed.
- **Tests:**
  - 30 new: 12 for loudness and the target, 17 for the board's requests and paths, and 2 for the menu (net 1 after one replaced test).
  - Checked in the page:
    - **Board:** 9 synthetic sounds measured; Match all took them from 1 to 9 matched, then refreshed the library once.
    - **Placeholder menu:** inserting `{ask:Name}` mid-line in a Code note selects "Name" and turns filling on.

### Stage 4: Notes and snippets as one
- **Every note can be pasted or copied from the palette.** On a note, Enter opens it, **Alt + Enter** pastes it into the window you were using, Shift + Enter copies it. **Super + Shift + P** ("Paste a note") lists every note; Enter pastes. Quick actions pinned to a snippet keep pasting it, and the palette's pick list offers both "open" and "Paste …" for each note.
- **Text and Code styles** replace the Note/Snippet type. Text has Markdown preview and spell-check; Code is monospace (Cascadia Mono) with neither. Existing snippets became Code notes on load (and are saved that way).
- **Placeholders,** filled when pasting or copying from the palette: `{date}` `{isodate}` `{weekday}` (with day offsets like `{date+7}`), `{time}` `{time24}` `{month}` `{year}` `{uuid}`, `{clipboard}`, `{cursor}`, and `{ask:Name}` / `{ask:Name=default}`, which the palette asks for one at a time with a live preview (Esc cancels). Anything else in braces is left alone, and nothing can run a command or read a file. **{ } Placeholders** in the editor turns filling on or off per note: on for Text, off for Code by default, so code containing `{date}` pastes exactly.
- **Spell-check in Quick Notes** (Preferences › General), on by default, never in Code notes.
- **Copy** in the editor footer for every note (exactly as written).
- **Fixed in this pass:** the American-spelling change had also renamed the `aria-labelledby` attribute (48 places), which screen readers only recognize in that spelling; restored.
- Tests: 18 new (11 for placeholders, 7 for preparing the text at paste time, including the clipboard, the cursor and its 2,000-character limit). Checked end to end in the page: migration, Enter / Alt + Enter / Shift + Enter, a two-question fill with its preview, Esc cancelling, and the editor's states.

### Polish after stage 3b
- **Countdowns in the Calendar:** the almanac's countdowns show as outlined, read-only all-day days (yearly ones every year, one-offs once), with **Countdowns** in the calendar list to hide them. They stay in Preferences (clicking one opens Preferences › Countdowns), so nothing is copied to the calendar server or can fall out of step; a countdown pinned from an event isn't shown twice. 6 unit tests, including 02-29 and impossible dates.
- **Sounds opens on a grid of versions,** three to a row, each with its logo (cut from a reference sheet, kept in `frontend\assets\windows`), year and number of sounds; a version opens the list as before, the version strip is larger with logos, and **All versions** sits just above the sounds. Search, Favorites and Play random work from the grid across every version. 3 unit tests map every version folder to its logo.
- **Favorites:** spelled "Favorite", with a heart in burgundy (the color for saved things) instead of a gold star. Existing favorites are kept.
- **American spelling throughout** (color, center, leveled, canceled…); leveled copies now go into "ASCS Leveled". Favorites saved before the change are kept.
- **Click and drag moves horizontal strips** (Sounds versions, Preferences tabs, Logs and Games filters) when they overflow; a short press still clicks, and the click that ends a drag doesn't choose anything.
- **Dropdowns draw their own caret,** 13 px in from the right edge with room for it, on every dropdown.

### Stage 3b: Calendar everywhere
- **Quick add from the palette:** `+Dentist tue 3pm #work`. The palette previews the day, time and calendar before Enter adds it. Understands today/tonight/tomorrow, weekdays and "next fri", month names, numeric and ISO dates, "in N days", 12- and 24-hour times, noon, "at 9", ranges (3-5pm, 11-2pm, 10pm-2am), "for 90m", and `#calendar`; a time already past means the next day (or next week for today's weekday); a pattern that isn't a real date (feb 30) stays in the title. 25 unit tests.
- **Today on the Command Center,** under the system overview: today's remaining events or the next one, each opening in the Calendar. Measured to fit without scrolling even when full (three events and "+N more").
- **Pin as countdown** from an event (yearly events count down every year), into the almanac's existing countdowns.
- **.ics import and export** through Windows' own Open and Save dialogs (5 MB cap, iCalendar only). Imports keep time zones and moved occurrences with their events, skip events already in the calendar, and give events whose ids can't be file names a stable name, so importing a file twice changes nothing (found and fixed in the end-to-end run: it had duplicated them).
- **The palette lists Calendar, Sounds and New calendar event,** which were missing.
- **Sounds moved to the System section** of the sidebar (Ctrl + 6).
- Verified end to end against a real server in an isolated copy, on a separate port, while the live calendar server kept running untouched: quick add, import twice, export, and a pinned countdown written to settings.

### Stage 3a: Calendar
- **A Calendar page** (sidebar, after Quick Notes; Ctrl + 3): month, week and agenda views; Personal, Gaming and Work to start, and calendars you can create, rename, recolor, hide and delete; events with all-day or timed spans, repeats (daily, weekly on chosen days, monthly by date or "2nd Tuesday" / "last Friday", yearly; every N; until a date or N times), reminders, location and notes; "only this one" or "every event in the series" for repeating events.
- **Reminders that work while ASCS is hidden:** the page hands the next three days' reminders to ASCS, which shows a Windows notification with the reminder sound chosen in Sounds (Use as › Calendar reminders), and drops any more than 15 minutes late.
- **A private calendar server:** Radicale 3.8.3, installed by `tools\Install-Radicale.ps1` into `data\radicale` from 14 files pinned by SHA-256 (checked against PyPI), listening on 127.0.0.1 only with a password, started and stopped by ASCS (kept running across reloads). 3.8.3 rather than the nine-day-old 3.9.0. The page asks ASCS for fixed operations; ASCS builds each request and holds the password.
- **Standard iCalendar that round-trips:** edits keep everything ASCS doesn't manage, events in other time zones are read correctly, and repeats stay on the wall clock across daylight saving.
- Verified end to end against a real server with a throwaway store: defaults created, a weekly event made through the editor, one occurrence and then the series changed, an event moved between calendars, an occurrence and then the series deleted, a calendar created, renamed and deleted, and reminders reaching ASCS with the right times. That run caught two page bugs, both fixed: a change made while a refresh was running wasn't shown until the next refresh, and a calendar deleted mid-refresh showed an error.
- **A Day view**, and a day opens it: clicking a day in the month (or a day's heading in the week, or "+N more") shows that day by the hour, where a click on a time adds an event. The all-day row adds all-day events.
- **Multi-day events as bars** across the days they cover (month view, and the week's and day's all-day row), in lanes, with an arrow where an event continues into the next week; timed events that cross midnight count too. Month rows keep one height (up to two lanes and three lines per day, then "+N more"), so the month still fits the window.
- **Fixed: the delete confirmation appeared behind the event editor.** Confirmations now always sit above other dialogs.
- **Ctrl + E** opens Calendar with a new event from any page (waiting for the calendar to load if needed, and saying why if the server isn't running). Listed in Help.
- **Fixed: shortcuts acted behind open dialogs.** Ctrl + N, Ctrl + 1–9 and F1 now do nothing while the event, calendar or confirmation dialog is open, instead of switching pages underneath it.
- **Alignment pass over everything new in 1.8.0** (Help, sidebar numbers, Preferences, Sounds, Calendar), measured rather than eyeballed: a probe compared the text baselines in every row and the centring of dots, boxes and icons on the text, and double-resolution crops checked what it flagged. Fixed: the agenda rows (time, title and details on one baseline, the color dot centered on them), the calendar list (names and Edit on one baseline, check boxes centered), the week's "all day" label (2 px high), the Sounds library line (label 2 px high), and Play crowding the In use list's scrollbar. Re-checked for overlaps at four window sizes afterwards.
- Tests: 764 checks (316 core, 448 frontend), adding quick add, .ics files, the CalDAV request builder, the bar layout (lanes, continuation across weeks, daylight saving) and its refusals, and the iCalendar, time zone, repeat and reminder logic.

### Stage 2: Sounds
- **A Sounds page** (sidebar, after Games; Ctrl + 4): every sound in `C:\Sounds\all-windows-sounds-main`, 1,040 here across 16 Windows versions plus your own folders, with a version timeline, themes as groups, search across everything, favorites, Play random, Stop all and volume. One sound at a time: a new one stops the last (even one still loading, so quick clicks never pile up), and Ctrl + click layers a sound on purpose; checked in a real WebView with the volume at 0. MIDI and WMA play through Windows.
- **Levels and leveled copies:** RMS and peak for any sound, a reference level (typed, a preset, or another sound's), the gain to match it with clipping held off at −0.3 dBFS, a preview at that gain, and a saved copy in `ASCS Leveled` in the original format. Checked against the hand-leveled startup sounds: the page measures them exactly as an independent Python measurement did (−26.4 dB RMS), and the original 98 startup sound leveled by ASCS measured −26.4 dB afterwards.
- **Use as a Windows sound or an ASCS sound,** for 19 Windows events and ASCS's show and hide sounds, with exact **Restore** of what Windows had before.
- **Layout pass:** checked for overlapping or clipped elements at four window sizes (2192 × 1226 down to 800 × 560; none). The right-hand column became two tabs (Selected sound, In use) instead of three stacked panels, and is sized to the space beside the list, so at ASCS's default size the page doesn't scroll and only the In use list scrolls when needed. The library folder moved to a line under the list; the toolbar groups finding (search, favorites) and playback (random, stop all, volume); the target level is one field and three chips (your startup sounds, your ASCS sounds, this sound); "Use as" starts unchosen, so a stray click changes nothing; the duplicate Stop is gone.
- **Fast first look:** listing the library takes about 16 ms; reading every WAV header from a cold disk had taken 4 s, so lengths are read in the background and remembered.
- Tests: 581 checks (259 core, 322 frontend), adding the WAV reader and writer, level maths, gain plans, and the sound library rules.

### Verification

**Manual pass**, round 1 (61 items): 53 passed. C2 failed (a restart closed apps before any asked about unsaved work; fixed with the unsaved-work hold), and D10 to D16 couldn't be followed as written (rewritten for round 2). Notes from passing items were acted on: the sidebar footer, multi-day bar ends, countdown style and color, removal of passed countdowns, the start moving the end, text centering in events, a 1-minute reminder and a fuller reminder pop-up, deleting leveled copies, Restore all, and camelCase ask fields. Round 2 (22 items) covers these; dragging events and wheel-edited times moved to 1.9.0. Round 2: 18 of 21 passed (among them C1, the hold with VS Code; D6, Match all and Restore all checked in Windows' Sound settings; D9, Delete; and E5, the reminder pop-up and its click on RetroBar). D5 failed (a second Match did nothing: the library refresh had let go of the In use sounds), E2 failed (times still sat high: Segoe UI's line box), and E4 asked for a visual indicator. C2 found that VS Code marks only its active tab. All are fixed, and round 2's notes were acted on (the hold message, your own sound folders as buttons, US holidays, Select). Round 3 covers these and Quick Notes groups: 15 of 16 passed. E2 (where it lands) showed no indicator, most likely on an all-day event, for which the strip was hidden; it now covers all-day and multi-day events too. The request behind E4 and E2 was in fact an indicator while dragging an event to a new time, so moving events by drag (planned for 1.9.0) was brought into 1.8.0. Its three items (dragging, cancel and click, repeating events) and the all-day strip then passed, completing the pass: every 1.8.0 item has passed on the target system.

**Verified automatically:**

- Unit tests: 867 checks (374 core, 493 frontend).
- Dragging, simulated with pointer events in headless Edge: a 2-hour event dragged from Thursday 2 PM to Friday showed the outline "Fri 4:30 PM – 6:30 PM" in Friday's column, the drop saved Friday 16:30–18:30, and the click that ended the drag didn't open the editor.
- Quick Notes list with 500 generated notes in 12 groups: a full re-render takes about 4.6 ms in headless Edge (well within a frame).
- Select › Delete in an isolated copy (deleting replaced by plain file removal, on a throwaway library): a free copy deleted; one in use and one not in the library skipped with their reasons; a request including an original refused whole, leaving every file.
- The unsaved-work hold, in an isolated copy with shutdown, sleep and the Recycle Bin replaced by log lines and a stand-in window titled `*draft.txt - TestPad`: the arm warning names it; a restart is held and goes ahead within 2 seconds of the window closing; **Shut down anyway** proceeds; Cancel while held runs nothing; Sleep is never held.
- Headless Edge renders of the Calendar (pointed bar ends, centered text, countdown pills) and the sidebar footer.

## Version 1.7.0

Released after the full manual pass on the target system (`tests\manual-1.7.0.html`): every item passed, after three fixes found during the pass (the window reopening at its minimum size, the Quick Notes header, and Now playing's window focus). Now playing and the PSO voice channel were filled out from the pass's notes. 507 automated checks.

### Stage 1: Indigo and gold
- **Indigo primary:** the violet accent is replaced by a tonal scale anchored on `#2B0071`. Large surfaces (active navigation, primary buttons, palette selection, the keyboard map's Apps keys) use the deep anchor; focus, accent text and strokes use lighter tints of the same hue, because the anchor alone is too dark to read on the background. Every violet color in the stylesheet was remapped onto the scale, not just the main tokens.
- **Metallic gold signature,** in exactly four places: the brand mark's gold edge, the Super keycap (sidebar footer and the Super Commands intro, joining the keyboard map's Super key), a gold rule above the Command Center date, and the palette title in a brighter champagne gold that reads as text.
- **Flat gold icons** on the Command Center cards and quick actions; navigation icons stay indigo.
- **Taller title strip and grander brand:** the title bar grows from 60 to 72 px, the brand mark from 40 to 48 px, and the wordmark to 16 px. The search bar (36 px), status pill (28 px) and key chips (22 px) grow with it, and everything stays on one optical center line (re-verified at 2× scale).
- **Fixed:** the tops of tall letters in the title bar's search placeholder were clipped.
- **Fixed:** the palette title reverted to “What would you like to do?” when the palette opened; it now reads “At your command.”
- **Version** is defined once in `ASCS.ahk` (`ASCS_Version`) and used for the log, the activity feed and the tray tooltip.

### Stage 2: Layout refresh
- **Command Center header:** the ~300 px hero (with its large emblem) is replaced by a compact band: the date under the metallic rule, the title, and the tagline on one line. The space goes to content, and it leaves room for stage 3's almanac.
- **Configurable quick actions:** up to six pinned items, chosen from any view, app or action, custom command, saved workspace, snippet, or note. Edit in place (× to remove, **Add quick action** opens the palette in a pick mode); they are saved in `settings.ini` (`[QuickActions]`) with strict id validation, and run through the palette's existing, validated paths. Common items get their own icons.
- **Dashboard history graphs:** CPU and RAM sparklines covering the last 15 minutes, with average and peak. ASCS samples every 10 seconds even while hidden (two near-instant system calls), so the history is ready the moment the Dashboard opens.
- **Spec sheet:** the seven hardware cards (one left alone on its row) became a two-column specification list.
- **Preferences:** a section bar that stays in view and highlights the current section, and a floating save bar that turns gold with “Unsaved changes”.
- **Super Commands search:** filters the shortcut lists and highlights matching keys on the keyboard map.
- **Collapsible sidebar:** an 84 px icon rail, toggled by the handle on the sidebar's edge or the palette's **Toggle sidebar**, and remembered.
- **Quick Notes:**
  - **Cleaner editor:** the tall burgundy stripe on snippets is gone; a burgundy **SNIPPET** label and icon mark them instead. The footer shows a word count, and the decorative mark was removed.
  - **#tags:** chips with counts above the list, combinable with text in the filter.
  - **Markdown preview:** built from text elements only, so note content can never become HTML. Links are shown but not opened.
- **Tests:** `notes.js` and `charts.js` are new pure modules with 28 tests (including hostile Markdown), and the core library gains 9 quick-action tests (187 in total).

### Refinements
- **A grander brand:** the sidebar now opens with a 76 px gold-trimmed mark, a soft indigo halo, and the wordmark centered beneath it with generous space above; it shrinks smoothly to the 48 px mark when the sidebar is collapsed.
- **One page header for every tab:** the Command Center's compact header and the other tabs' larger headers (50 px titles) were unified into a single spec: a 32–40 px title, a 14.5 px description, a hairline beneath, and identical spacing. Measured on all five tabs, the eyebrow, title and content start at the same positions, to the pixel.
- **Sidebar parity:** collapsing the sidebar no longer moves the navigation icons (they used to jump up 191 px). The brand block, section label and footer keep identical dimensions in both states, verified by measurement; collapsed, the brand shows a 56 px mark shrinking in place, a short ASCS wordmark, and a gold hairline in place of the WORKSPACE label.
- **Every hotkey represented:** an audit of all registered hotkeys found one gap. While C, D, F, or P has no ASCS action, Super + that letter passes the Windows shortcut through, so **Super + D (show desktop)** and **Super + P (project to a display)** were live but undocumented. They now appear on the keyboard map (as Windows & system keys, with an explanation on hover) and in the shortcut lists, and they disappear from the map if you assign those letters.
- **Fixed:** the Dashboard's processor detail ended in a dangling “Up to ” with no value. The clock speed was on a continuation line that AutoHotkey silently ran as a separate, discarded statement (it only joins lines that begin with an operator). A scan of every script found no other instance. The detail now reads, for example, “8 cores · 16 threads · 4.1 GHz base”, since Windows reports the rated base clock, not the boost clock.
- **Preferences as option rows:** one column in the style of Windows Settings. Each setting is a row with its name and explanation on the left and its control on the right; checkboxes became switches, and each shortcut letter has its own row.
- **Preferences tabs:** the sections (General, Shortcuts, Palette, Custom commands, Workspaces) are now tabs showing one section at a time, like the sub-pages of Windows Settings, with arrow-key navigation, and the last tab is remembered. This replaces the scrolling page with a section locator, which could never highlight the short final sections and let the save bar cover the section strip. The Save preferences bar appears only on the tabs it saves, and unsaved edits survive switching between them.
- **Keyboard map:** the line describing the hovered key has its own full-width row and stays on one line (long text ends in an ellipsis, with the full text on hover), so hovering Space no longer shifts the layout. App keys use a softer indigo at the same visual weight as the other categories, and hovering or focusing any assigned key darkens it.
- **Super + C asks Claude:** it opens the Claude desktop app's quick-entry prompt by pressing the app's own shortcut (Ctrl+Alt+Space, set in Preferences, where only a strict modifier-plus-key format is accepted). ASCS checks that a Claude window came forward; if Claude isn't running, or the prompt doesn't appear, it starts the app instead. The app is matched by window class as well as process name, so the Claude Code command-line tool (also `claude.exe`) is never mistaken for it. ASCS makes no network calls and stores no keys for this. Calculator gives up the letter: it stays in the palette, and math typed into the palette is still answered inline.
- **Super + Shift + S saves a named workspace:** it opens the palette on name entry, and Enter saves the current window layout under that name, so you can save a new workspace on the fly without going through the palette's menu. Super + S is unchanged (it saves the default workspace). This replaces the 1.6.0 decision to leave the combination empty.

### Stage 3: Almanac and Logs
- **The almanac:** a strip beneath the Command Center title with the moon's phase (drawn to match its illumination), today's sunrise and sunset in New York City with the hours of daylight, and one rotating line: on this day in history, an observance, Wikipedia's featured article, or the quote of the day (from public-domain works, with sources), plus your nearest countdown.
- **Wikipedia almanac, opt-in:** off by default; turn it on in Preferences › Almanac. ASCS then downloads two fixed en.wikipedia.org feeds once a day (HTTPS, certificate checks, no redirects, timeouts, a size cap, and a User-Agent with the owner's contact address, as Wikimedia asks), caches them in `data\almanac`, and hands them to the page as plain text. Article links are rebuilt by ASCS from validated titles. Turning it off deletes the cache.
- **Countdowns:** up to 12, each yearly (MM-DD) or one-off (YYYY-MM-DD), in their own Preferences tab. The nearest shows in its own cell of the almanac strip, beside daylight, with the rest in its tooltip. They are sorted when saved (yearly dates January to December, then one-off dates), and impossible dates such as 13-40 are rejected in both the page and ASCS.
- **The rotating line:** two lines of room (longer items end in an ellipsis, with the full text on hover), so the strip never changes height. It rotates every 20 seconds while the Command Center is showing and pauses while the pointer or keyboard focus is on the strip. **‹ ›** step back and forward, with the outgoing item fading out one way and the next fading in from the other, following the direction of travel (a plain fade with reduced motion).
- **The Logs tab** (under a new SYSTEM group in the sidebar, with Dashboard): the ASCS log, the activity log, and the Code key's log, grouped by day, newest first, with errors and warnings marked, All / Issues / Errors filters with counts, a text filter, Copy, and Open file. It refreshes every three seconds only while open, and ASCS answers only when the file has changed.
- **Sidebar groups:** WORKSPACE (Command Center, Quick Notes), SYSTEM (Dashboard, Logs), and REFERENCE (Super Commands, Preferences). Games joins WORKSPACE in stage 4.
- **Fixed during testing:** WinHttp could not decode Wikipedia's responses (their Content-Type carries a profile parameter after the charset), so ASCS now decodes the raw bytes as UTF-8, after checking their size. Found by an isolated end-to-end run that performed the real download.
- Tests: 310 checks (117 core, 193 frontend), adding the almanac validators, moon phases on known dates, New York sunrise and sunset at both solstices (within three minutes), hostile feed input, countdown dates, and log parsing.

### Stage 4: Games and macro keys
- **The Games tab** (under WORKSPACE): now playing (the game an emulator is running, from its window title), XInput controllers with battery where reported, play time per emulator, **Continue playing** (the six most recent games, one click to play), RetroAchievements, and a library of every game played with filters, sorting, search and **Play**. Play time comes from RetroArch's runtime logs, PCSX2's playtime.dat and Dolphin's TimePlayed.ini; names and launch paths from their history and game lists. On the target PC: 125 games (95 RetroArch, 14 Dolphin, 16 PCSX2), 114 launchable, built in about 0.4 s the first time and 16 ms after (the binary game lists are cached until they change).
- **Cover art** (opt-in): box art from RetroArch's thumbnails and PCSX2's covers folder on this PC (87 games), checked to be a PNG or JPEG of at most 1.5 MB, sent one at a time so hotkeys stay responsive. Other games get a monogram tile.
- **RetroAchievements:** points, rank, rich presence, progress and recent unlocks, using a user name and Web API key in `data\secrets.ini`, which stays on this PC (git ignores `data/`). The key is never sent to the page or logged; requests go to two fixed addresses at most every ten minutes.
- **Super + M4, the PSO session:** switches to the headphones through SoundSwitch (pressing its shortcut and reading Windows' default device back after each press, stopping after a full cycle), starts Discord if needed and the Ephinea launcher, then checks every 10 seconds on a held handle for PsoBB.exe to close. Afterwards it restores the previous audio device and offers to close Discord.
- **Super + M5 / M6 / M7:** the palette opens on your recent RetroArch, Dolphin or PCSX2 games; Enter plays one. Launchable games also appear when searching the palette. Super + Shift + macro keys stay vacant.
- **The keyboard map** shows what the macro keys and the Code key do on their own (from the macro scripts), fills M4–M7 with their Super commands, and marks M4–M7 with a green dot while that program runs (checked only while Super Commands is open). The shortcut lists gain a Games and macro keys group.
- **Preferences › Games & apps:** the program paths (prefilled from the macro script and validated as existing .exe files), the headphones device (with Windows' device names offered; matching ignores case, spacing, punctuation and Windows' "2-" prefix, since Windows calls the headset "Headphones (2- SteelSeries Arctis Nova 5)"), the SoundSwitch shortcut, cover art, and RetroAchievements setup.
- **Tidy-up:** the obsolete Calculator shortcut entry (`calculator=c`, from before Super + C became Ask Claude) is removed from settings.ini when ASCS starts; it was already ignored.
- **Found during testing:** sending 40 covers at once blocked hotkeys for 1.3 s; covers are now queued (about 30 ms each, 110 ms for the largest 1 MB box art).
- **Steam:** a fifth source, read from Steam's own files with no account details or keys: 42 installed games, play time from the signed-in account, portrait art (or the landscape header) for every one, the running game in Now playing, and Play through Steam's `steam://rungameid/` link. Cover lookups are remembered per session, so the library builds in about 0.4 s the first time and 32 ms after.
- **Game details:** clicking a library game opens a panel beneath it with larger art, the full title, play time, sessions, the exact last-played time, the RetroArch core, serial, disc ID or Steam app ID, the file or install folder and its size, matching RetroAchievements progress, and **Play** and **Show file** (Explorer at the file) or **Open folder** (Steam).
- **Controllers:** each controller's name, mode (X-input, D-input, Switch or PlayStation), connection (Bluetooth or USB), player slot and battery where reported, read through XInput and the classic joystick API, so an 8BitDo in Bluetooth D-input or Switch mode now appears too. A live input tester shows sticks, triggers or axes, the hat and every button, with Rumble for X-input pads. **Rename** sets the name in ASCS and Windows' per-user game controller list (no admin rights); **Bluetooth name…** opens Devices and Printers for the one-time Bluetooth rename, which needs admin rights. A keyboard receiver that registered as a buttonless joystick is ignored.
- **Achievements, polished:** hardcore, true and softcore points, rank with a percentile, the game you were last seen in with its rich presence, progress with percentages (completed and mastered games in gold), unlock descriptions with points pills (gold for hardcore), when it last updated, and a **Profile** button.
- **Fixed: ASCS crashed (four times) after the controller support arrived.** Windows recorded heap corruption (0xc0000374); the crash dumps showed two of the four inside DirectInput's device enumeration and the others tripping over the damage later. ASCS never called DirectInput itself, but the classic joystick API (winmm) it used for D-input pads runs on it, and polling all 16 joystick slots made DirectInput re-scan the devices, which corrupted memory when a controller connected or slept mid-scan. ASCS now reads controllers only through XInput and the Raw Input device list, and DirectInput is never loaded (verified over 3,000 polls, which also became much faster: 0.09 ms instead of about 200). The live tester is now X-input only; D-input and Switch-mode pads are still listed. Every native call added in 1.7.0 was re-checked with guard bytes for writes past its buffer.
- **The System bar:** the system controls moved out of the right-hand column into their own bar in the Command Center header, to the right of the title, where they add no height. Click actions (Lock, the audio output) and hold actions (Recycle Bin, Sleep, Restart, Shut down, Sign out) are separate groups: the hold group is framed in gold and labeled HOLD with a ring symbol, its buttons are gold-edged, and a plain click flashes that label. The audio list and warnings open as pop-overs. **Displays off** was removed: it only blanked the screens, which wasn't worth a button.
- **Everything fits:** ASCS now opens at 2208 × 1242 (15% larger, capped to the screen), and with the System bar in the header the Command Center and Quick Notes fit without scrolling (measured: the Command Center's content ends about 200 px above the window's bottom edge).
- **System controls on the Command Center:** Lock, Displays off, an Audio output picker (through SoundSwitch), and, guarded, Recycle Bin (with its size), Sleep, Restart, Shut down and Sign out. Guarded actions need a 1.5-second press-and-hold, then a single-use 10-second ticket from ASCS, with warnings (and a second hold) when a game is running; restart and shut down use Windows' own 30-second timer and are never forced; sign out waits 15 s and sleep 5 s; a banner on every tab counts down with Cancel. Testing with the real calls replaced by log lines confirmed every guard, and caught one bug before release: a Cancel pressed in the moment while notes were being saved could let a restart go ahead; the restart now checks it wasn't canceled before asking Windows.
- **Uninstalled Steam games with play time** are listed (247 here), named from Steam's binary app cache, which ASCS reads only for the games it needs; their button reads **Install** and opens Steam's install prompt, and they stay out of Continue playing and the palette. Steam covers are now looked up when first shown, which keeps the first library build at about 0.4 s with 289 Steam games (it was 1.3 s with an up-front search).
- **RetroAchievements badges and game icons:** downloaded once from `media.retroachievements.org` and cached in `data\ra-images`. ASCS accepts only a plain badge number or `/Images/<digits>.png` from the response and builds the address itself; images must be real PNGs under 256 KB; at most four download at once. Hardcore unlocks get a gold frame. The cache is capped at 20 MB: past that, the least recently shown images are removed down to 16 MB, checked a minute after start-up and after downloads; only ASCS's own image files are ever deleted.
- **An input tester for D-input and Switch-mode controllers:** sticks, trigger axes, the D-pad and numbered buttons, read from the controller's HID reports through Raw Input and decoded by Windows' HID parser, registered only while the tester is open. Every new native call was first checked with guard bytes against all twelve HID interfaces on the target PC (no overruns).
- **Horizontal scrolling:** a thumb wheel (such as the MX Master 4's), a sideways trackpad swipe or Shift + wheel steps through tab strips one tab per notch (Preferences, the Logs sources and levels, and the Games filters and sorting), with a short cooldown so a fast spin doesn't skip; vertical scrolling is never taken over. The direction follows the MX Master's thumb wheel as it feels in the hand (rolling right steps right; this is the reverse of the browser's sideways-scroll sign, which tested backwards on that mouse). Tab strips stay on one line in narrow windows and scroll sideways, keeping the selected tab in view. Continue playing now holds twelve games in a sideways-scrolling row with snap points that fades at its edge while more are off to the side.
- **Page errors are logged:** any script error in the page is written to the ASCS log as "Page error: …" (ten per session at most), so it shows in the Logs tab instead of failing silently.
- **One entry per controller:** a 2.4 GHz receiver exposes both an X-input pad (the controller itself) and an idle D-input interface whose sticks rest in one corner; ASCS now shows only the X-input entry, labeled **2.4 GHz receiver** instead of USB, with "battery not reported through the receiver" instead of "Wired" (receivers report themselves as wired). Receivers are recognized from Windows' own name, remembered before any rename. **Identify** rumbles one controller, to tell two identical controllers apart.
- **Fixed: ASCS sometimes reopened as a tiny window that couldn't be resized.** If ASCS was minimized and then hidden, showing it again could leave Windows' minimized stub on screen. Every show now restores a minimized window and resets the size and position if the window is too small or off every monitor (logging what it found), and the window can no longer be resized below 760 × 520.
- **The PSO session opens a Discord voice channel (from the manual pass):** set in Preferences › Games & apps by pasting the channel's Copy Link address. ASCS accepts only a Discord channel link (two numeric ids; messages, DMs and other sites are rejected), stores it in `data\settings.ini`, and opens it through Discord's own `discord://` link: at once if Discord was running, or once Discord's main window is up if the session started it (up to 90 s, then anyway if Discord is running in the tray). No account token or simulated clicks. Timing checked in an isolated copy with the link opening stubbed out; on the target PC Discord opens the channel with its Join Voice button, one click from joining.
- **Fixed (found in the manual pass): Now playing said "At the menu" and restarted its timer when the emulator's main window had focus.** PCSX2 and Dolphin show a game in its own window beside their main window, and ASCS read whichever window was in front. ASCS now reads all of the emulator's visible windows and prefers the largest one showing a game, and times the session by the game's name rather than the window title (so RetroArch's FPS counter can't restart it either). A session now ends only when the game closes or another game starts. Verified in an isolated copy with a two-window stand-in emulator, switching focus back and forth.
- **Now playing, filled out (from the manual pass):** the running game's cover as a soft blurred backdrop, a live session timer next to its total play time, RetroAchievements progress (with the latest unlock in that game and its rich presence) and **Show file**; further running games are listed beneath. Sessions are timed from the emulator's process start (read with `GetProcessTimes`, checked with guard bytes), or from when a new game appears in the same window; a 10-second check keeps this current while the Games tab is closed. With nothing running, the panel shows the last game played with **Play**. The **Start a PSO session** button was removed (Super + M4 starts it). Verified in an isolated copy with a stand-in emulator that starts, switches games and exits.
- **Fixed (found in the manual pass): ASCS reopened at its minimum size after being minimized.** WebViewToo's `Show()` re-applies the window's current client size, which for a minimized window is the stub's, so Windows clamped it to 760 × 520 and the size check above saw a legal window. A minimized window is now restored to its normal size before it is shown. Reproduced in an isolated copy (774 × 534 before, 2208 × 1242 after, minimized and minimized-then-hidden).
- **Fixed (found in the manual pass): the Quick Notes header sat further in than every other view's,** because Notes alone was capped at 1440 px and centered. It now uses the same width, so all page headers line up (measured: every eyebrow at the same x).
- **Privacy:** RetroAchievements requests no longer carry the owner's email address; only the Wikimedia requests do, as the owner approved for the almanac.
- **Cover art is on by default:** it only reads image folders on this PC.
- **Fixed:** the selected library filter (RetroArch, Dolphin, PCSX2, Steam) wasn't highlighted.
- **Fixed:** some invisible Unicode characters (text-direction controls and a byte-order mark) had been written literally into four source files where readable `\u` escapes were intended. They behaved correctly, but invisible direction controls don't belong in source code, so they are now escapes.
- Tests: 507 checks (231 core, 276 frontend), adding Steam's binary app cache, RetroAchievements image tokens and addresses, the image cache cap, Now playing's sessions, window choice and game matching, and the Discord channel link; before that 442 (186 core, 256 frontend), adding Steam's files, controller IDs, modes and names, Steam game ids, achievement progress, rank percentiles and title matching. Before that: 400 checks (154 core, 246 frontend), adding the emulator record parsers (with binary game lists built in memory), path and credential validation, device matching, game formatting and sorting, window-title parsing, and hostile RetroAchievements input.

### Plan changes
- **Clipboard history** was dropped from the roadmap. Remembering clipboard contents risks storing passwords and one-time codes, and Windows already provides this, more safely, on Win + V (Super + V).

### Verification

**Manual pass** (the manual pass in `tests\manual-1.7.0.html`, every item passed; the three failures found along the way (A3, B3, F9) were fixed and retested):

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

**Verified automatically:**

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
- **Start or reload with Ctrl + Alt + Shift + A:** a new resident helper, `ASCS.Launcher.ahk`, owns this hotkey. It starts ASCS when it isn't running and sends it a reload message when it is; ASCS saves pending notes, then reloads. If an older ASCS doesn't acknowledge the message, the launcher relaunches it. ASCS also handles the keys itself, so reloading works without the launcher. `tools\Install-Shortcut.ps1` creates the Start Menu shortcut, registers the launcher at sign-in, and starts it. `-Startup` also starts ASCS at sign-in, and `-Remove` undoes everything. (A first attempt put the hotkey on the Start Menu shortcut, but Windows 11 did not honor it.) “Reload ASCS” is also in the palette.
- **Tray menu:** Show ASCS, Command palette, Quick Notes, Preferences, Save/Restore workspace, Open data folder, Open log file, Reload, and Exit. A single click on the tray icon shows ASCS, and Reload and Exit save pending note edits first.
- **Theme:** a three-accent system. Violet stays primary for interaction. **Burgundy** (`#8A2846`/`#C4587B`) is secondary: every resource bar (CPU, RAM, and drives), saved items (snippets, workspaces, captures), heading punctuation, the palette mode chip, and destructive actions, which no longer use the earlier pink-red. **Gold** (`#C9A24A`/`#E3C072`) is tertiary: any resource at 90% or more, pinned notes, the palette's Recent group, calculator results and custom commands, and “NEW” badges.
- **Keyboard map:** Super Commands opens with a map of the customized Keychron Q6 Max: a full-width left Shift, a rectangular Enter with `\ |` above it, a **Code** key and macro keys M1–M7 (marked Planned, with no current compatibility), and Alt · Super · Fn · Ctrl right of Space. It shows which keys are taken with Super and with Super + Shift, colored by category, with the physical Super key in metallic gold. It includes hover and focus details, a layer toggle, and a hold-Shift preview, and it follows your Preferences letters and custom commands.
- **Title bar:** it now forms one continuous top strip: the sidebar brand on the same center line, context (`ASCS / view`), a centered command bar that opens the palette, a live status pill (green “All systems nominal”, or gold “Attention · …” when a resource reaches 90%), and a clock. With no band at rest, it no longer falls short of the window edges; a frosted band fades in edge to edge when the page scrolls, and the bar stays at the top. The caption buttons are pinned to the window corner at full bar height and use crisp 10 px glyphs; Maximize swaps to a restore glyph, and Close has a burgundy hover. Every element is optically aligned: text is trimmed to cap height (`text-box`), and controls use even heights on one center line, verified by pixel measurement.
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
- Fixed workspace saves failing with “Unable to identify the window's monitor.” Monitor lookup now uses `MonitorFromWindow`; cloaked, owned, and shell windows are excluded; and one bad window is skipped instead of canceling the save.
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
