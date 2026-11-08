# ASCS Changelog

All notable changes to the Aeolionware Super Command System. The newest release is first. For current behavior, see [README.md](README.md).

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
