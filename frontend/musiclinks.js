"use strict";

// Quick Notes' links to the Conservatory (2.6.0): a saved song, exercise,
// rhythm or chord, copied as a Markdown link from its menu and opened from a
// note with Ctrl + click. Nothing leaves the page: the link names an item
// Maestro already keeps, looked up in its own list.

const musicLinks = { pending: null };

// Opens the Conservatory on the item, once its list has come from AHK.
function openMusicLink(url) {
    const link = ASCSNotes.musicLink(url);
    if (!link) return false;
    musicLinks.pending = link;
    navigate("conservatory");
    resolveMusicLink();
    return true;
}

// Called again as each list arrives; a link waiting on it is opened.
function resolveMusicLink() {
    const link = musicLinks.pending;
    if (!link) return;
    const gone = what => {
        musicLinks.pending = null;
        showToast(`That ${what} isn't saved any more.`);
    };
    if (link.kind === "song") {
        if (!prog.songs) return askForProgSongs();
        musicLinks.pending = null;
        if (!prog.songs.some(song => song.id === link.id)) return gone("song");
        consSections.show("progressions");
        openProgSong(link.id);
    } else if (link.kind === "exercise") {
        if (!cp.saved) return askForCpExercises();
        musicLinks.pending = null;
        if (!cp.saved.some(item => item.id === link.id)) return gone("exercise");
        consSections.show("counterpoint");
        openCpExercise(link.id);
    } else if (link.kind === "rhythm") {
        if (!rh.saved) return askForRhythms();
        musicLinks.pending = null;
        if (!rh.saved.some(item => item.id === link.id)) return gone("rhythm");
        consSections.show("rhythm");
        openRhythm(link.id);
    } else if (link.kind === "chord") {
        if (!chords.library) {
            if (!chords.asked) {
                chords.asked = true;
                send("GetChords");
            }
            return;
        }
        musicLinks.pending = null;
        const index = chords.library.findIndex(chord => chord.instrument === link.instrument && (chord.name === link.name || chord.label === link.name));
        if (index < 0 || !Object.hasOwn(MaestroMusic.INSTRUMENTS, link.instrument)) return gone("chord");
        if (cons.settings.instrument !== link.instrument) chooseConsInstrument(link.instrument);
        consSections.show("chords");
        openSavedChord(index);
    }
}

// The link for a saved item, copied to paste into a note.
function copyMusicLink(title, link) {
    const text = ASCSNotes.musicLinkText(title, link);
    if (text) copyText(text, "Copied a link. Paste it into a Quick Note; Ctrl + click opens it here.");
}
