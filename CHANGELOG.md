# ASCS Changelog

All notable changes to the Aeolionware Super Command System. The newest release is first. For current behavior, see [README.md](README.md).

## Version 1.7.0

Released after the full manual pass on the target system (`tests\manual-1.7.0.html`): every item passed, after three fixes found during the pass (the window reopening at its minimum size, the Quick Notes header, and Now playing's window focus). Now playing and the PSO voice channel were filled out from the pass's notes. 507 automated checks.

### Stage 1: Indigo and gold
- **Indigo primary:** the violet accent is replaced by a tonal scale anchored on `#2B0071`. Large surfaces (active navigation, primary buttons, palette selection, the keyboard map's Apps keys) use the deep anchor; focus, accent text and strokes use lighter tints of the same hue, because the anchor alone is too dark to read on the background. Every violet colour in the stylesheet was remapped onto the scale, not just the main tokens.
- **Metallic gold signature,** in exactly four places: the brand mark's gold edge, the Super keycap (sidebar footer and the Super Commands intro, joining the keyboard map's Super key), a gold rule above the Command Center date, and the palette title in a brighter champagne gold that reads as text.
- **Flat gold icons** on the Command Center cards and quick actions; navigation icons stay indigo.
- **Taller title strip and grander brand:** the title bar grows from 60 to 72 px, the brand mark from 40 to 48 px, and the wordmark to 16 px. The search bar (36 px), status pill (28 px) and key chips (22 px) grow with it, and everything stays on one optical centre line (re-verified at 2× scale).
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
- **A grander brand:** the sidebar now opens with a 76 px gold-trimmed mark, a soft indigo halo, and the wordmark centred beneath it with generous space above; it shrinks smoothly to the 48 px mark when the sidebar is collapsed.
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
- **The System bar:** the system controls moved out of the right-hand column into their own bar in the Command Center header, to the right of the title, where they add no height. Click actions (Lock, the audio output) and hold actions (Recycle Bin, Sleep, Restart, Shut down, Sign out) are separate groups: the hold group is framed in gold and labelled HOLD with a ring symbol, its buttons are gold-edged, and a plain click flashes that label. The audio list and warnings open as pop-overs. **Displays off** was removed: it only blanked the screens, which wasn't worth a button.
- **Everything fits:** ASCS now opens at 2208 × 1242 (15% larger, capped to the screen), and with the System bar in the header the Command Center and Quick Notes fit without scrolling (measured: the Command Center's content ends about 200 px above the window's bottom edge).
- **System controls on the Command Center:** Lock, Displays off, an Audio output picker (through SoundSwitch), and, guarded, Recycle Bin (with its size), Sleep, Restart, Shut down and Sign out. Guarded actions need a 1.5-second press-and-hold, then a single-use 10-second ticket from ASCS, with warnings (and a second hold) when a game is running; restart and shut down use Windows' own 30-second timer and are never forced; sign out waits 15 s and sleep 5 s; a banner on every tab counts down with Cancel. Testing with the real calls replaced by log lines confirmed every guard, and caught one bug before release: a Cancel pressed in the moment while notes were being saved could let a restart go ahead; the restart now checks it wasn't cancelled before asking Windows.
- **Uninstalled Steam games with play time** are listed (247 here), named from Steam's binary app cache, which ASCS reads only for the games it needs; their button reads **Install** and opens Steam's install prompt, and they stay out of Continue playing and the palette. Steam covers are now looked up when first shown, which keeps the first library build at about 0.4 s with 289 Steam games (it was 1.3 s with an up-front search).
- **RetroAchievements badges and game icons:** downloaded once from `media.retroachievements.org` and cached in `data\ra-images`. ASCS accepts only a plain badge number or `/Images/<digits>.png` from the response and builds the address itself; images must be real PNGs under 256 KB; at most four download at once. Hardcore unlocks get a gold frame. The cache is capped at 20 MB: past that, the least recently shown images are removed down to 16 MB, checked a minute after start-up and after downloads; only ASCS's own image files are ever deleted.
- **An input tester for D-input and Switch-mode controllers:** sticks, trigger axes, the D-pad and numbered buttons, read from the controller's HID reports through Raw Input and decoded by Windows' HID parser, registered only while the tester is open. Every new native call was first checked with guard bytes against all twelve HID interfaces on the target PC (no overruns).
- **Horizontal scrolling:** a thumb wheel (such as the MX Master 4's), a sideways trackpad swipe or Shift + wheel steps through tab strips one tab per notch (Preferences, the Logs sources and levels, and the Games filters and sorting), with a short cooldown so a fast spin doesn't skip; vertical scrolling is never taken over. The direction follows the MX Master's thumb wheel as it feels in the hand (rolling right steps right; this is the reverse of the browser's sideways-scroll sign, which tested backwards on that mouse). Tab strips stay on one line in narrow windows and scroll sideways, keeping the selected tab in view. Continue playing now holds twelve games in a sideways-scrolling row with snap points that fades at its edge while more are off to the side.
- **Page errors are logged:** any script error in the page is written to the ASCS log as "Page error: …" (ten per session at most), so it shows in the Logs tab instead of failing silently.
- **One entry per controller:** a 2.4 GHz receiver exposes both an X-input pad (the controller itself) and an idle D-input interface whose sticks rest in one corner; ASCS now shows only the X-input entry, labelled **2.4 GHz receiver** instead of USB, with "battery not reported through the receiver" instead of "Wired" (receivers report themselves as wired). Receivers are recognised from Windows' own name, remembered before any rename. **Identify** rumbles one controller, to tell two identical controllers apart.
- **Fixed: ASCS sometimes reopened as a tiny window that couldn't be resized.** If ASCS was minimized and then hidden, showing it again could leave Windows' minimized stub on screen. Every show now restores a minimized window and resets the size and position if the window is too small or off every monitor (logging what it found), and the window can no longer be resized below 760 × 520.
- **The PSO session opens a Discord voice channel (from the manual pass):** set in Preferences › Games & apps by pasting the channel's Copy Link address. ASCS accepts only a Discord channel link (two numeric ids; messages, DMs and other sites are rejected), stores it in `data\settings.ini`, and opens it through Discord's own `discord://` link: at once if Discord was running, or once Discord's main window is up if the session started it (up to 90 s, then anyway if Discord is running in the tray). No account token or simulated clicks. Timing checked in an isolated copy with the link opening stubbed out; on the target PC Discord opens the channel with its Join Voice button, one click from joining.
- **Fixed (found in the manual pass): Now playing said "At the menu" and restarted its timer when the emulator's main window had focus.** PCSX2 and Dolphin show a game in its own window beside their main window, and ASCS read whichever window was in front. ASCS now reads all of the emulator's visible windows and prefers the largest one showing a game, and times the session by the game's name rather than the window title (so RetroArch's FPS counter can't restart it either). A session now ends only when the game closes or another game starts. Verified in an isolated copy with a two-window stand-in emulator, switching focus back and forth.
- **Now playing, filled out (from the manual pass):** the running game's cover as a soft blurred backdrop, a live session timer next to its total play time, RetroAchievements progress (with the latest unlock in that game and its rich presence) and **Show file**; further running games are listed beneath. Sessions are timed from the emulator's process start (read with `GetProcessTimes`, checked with guard bytes), or from when a new game appears in the same window; a 10-second check keeps this current while the Games tab is closed. With nothing running, the panel shows the last game played with **Play**. The **Start a PSO session** button was removed (Super + M4 starts it). Verified in an isolated copy with a stand-in emulator that starts, switches games and exits.
- **Fixed (found in the manual pass): ASCS reopened at its minimum size after being minimized.** WebViewToo's `Show()` re-applies the window's current client size, which for a minimized window is the stub's, so Windows clamped it to 760 × 520 and the size check above saw a legal window. A minimized window is now restored to its normal size before it is shown. Reproduced in an isolated copy (774 × 534 before, 2208 × 1242 after, minimized and minimized-then-hidden).
- **Fixed (found in the manual pass): the Quick Notes header sat further in than every other view's,** because Notes alone was capped at 1440 px and centred. It now uses the same width, so all page headers line up (measured: every eyebrow at the same x).
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
