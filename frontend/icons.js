"use strict";
// One icon set (2.2.0). Every icon is drawn on the same 24-unit grid, inside
// 3.5 to 20.5, and one CSS rule in 41-2.2.0-finish.css gives them all the same
// stroke, caps and joins, at 20 px or 24 px. Static markup only: nothing here
// ever holds text from the page or from AutoHotkey. Window controls keep their
// own 10-unit drawings, since they match Windows' caption buttons.
const MaestroIcons = (() => {
    const speaker = '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"/>';
    const folder = '<path d="M3.5 7.5a2 2 0 0 1 2-2h4.5l2 2h6.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>';
    const heart = 'M12 19.5s-7.5-4.4-7.5-9.9A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.5c0 5.5-7.5 9.9-7.5 9.9Z';
    const PATHS = {
        // Pages
        home: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
        notes: '<path d="M6.5 3.5H14l4.5 4.5v10.5a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h5"/>',
        calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.75h2M11 16.75h2"/>',
        workspaces: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M11 9v10.5M11 14.25h9.5"/>',
        games: '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.3 5.8l-1 3.3a2.2 2.2 0 0 1-3.7.9L14 16h-4l-2.1 2a2.2 2.2 0 0 1-3.7-.9l-1-3.3A4.5 4.5 0 0 1 7.5 8Z"/><path d="M8 11v3m-1.5-1.5h3M15.5 12h.01M17.5 13.5h.01"/>',
        system: '<path d="M4.5 19.5V12m5 7.5V5m5 14.5v-10m5 10V8"/>',
        sounds: speaker + '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
        conservatory: '<path d="M9.5 17.5V6l10-2v11.5M9.5 9.5l10-2"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>',
        commands: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7 9h2m3 0h2m3 0h.01M7 13h.01m3 0h.01m3 0h.01m3 0h.01M8 16h8"/>',
        settings: '<circle cx="12" cy="12" r="2.75"/><path d="M10.46 5.58L10.74 3.59A8.5 8.5 0 0 1 13.26 3.59L13.54 5.58A6.6 6.6 0 0 1 15.45 6.37L17.06 5.17A8.5 8.5 0 0 1 18.83 6.94L17.63 8.55A6.6 6.6 0 0 1 18.42 10.46L20.41 10.74A8.5 8.5 0 0 1 20.41 13.26L18.42 13.54A6.6 6.6 0 0 1 17.63 15.45L18.83 17.06A8.5 8.5 0 0 1 17.06 18.83L15.45 17.63A6.6 6.6 0 0 1 13.54 18.42L13.26 20.41A8.5 8.5 0 0 1 10.74 20.41L10.46 18.42A6.6 6.6 0 0 1 8.55 17.63L6.94 18.83A8.5 8.5 0 0 1 5.17 17.06L6.37 15.45A6.6 6.6 0 0 1 5.58 13.54L3.59 13.26A8.5 8.5 0 0 1 3.59 10.74L5.58 10.46A6.6 6.6 0 0 1 6.37 8.55L5.17 6.94A8.5 8.5 0 0 1 6.94 5.17L8.55 6.37A6.6 6.6 0 0 1 10.46 5.58Z"/>',
        logs: '<path d="M5 6.5h.01M5 12h.01M5 17.5h.01M9 6.5h10M9 12h10M9 17.5h6"/>',
        // Power and audio
        power: '<path d="M12 3.5v8"/><path d="M7.2 6.6a7.5 7.5 0 1 0 9.6 0"/>',
        lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
        sleep: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/>',
        restart: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
        signout: '<path d="M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="m10 8-4 4 4 4M6 12h9"/>',
        trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7M10.5 10.5v6M13.5 10.5v6"/>',
        speaker: speaker + '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
        mute: speaker + '<path d="m16 9.5 5 5m0-5-5 5"/>',
        hold: '<circle cx="12" cy="12" r="8" opacity=".35"/><path d="M12 4a8 8 0 0 1 8 8"/><circle class="icon-dot" cx="12" cy="12" r="2.2"/>',
        // Moving around
        search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
        close: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
        "chevron-left": '<path d="m14.5 7-5 5 5 5"/>',
        "chevron-right": '<path d="m9.5 7 5 5-5 5"/>',
        "chevron-down": '<path d="m7 9.5 5 5 5-5"/>',
        "arrow-right": '<path d="M5 12h14m-5-5 5 5-5 5"/>',
        "arrow-up-right": '<path d="M7 17 17 7M9 7h8v8"/>',
        attention: '<path d="M12 4.5 20.5 19.5h-17Z"/><path d="M12 10v4.5M12 17h.01"/>',
        // Marks
        heart: `<path d="${heart}"/>`,
        "heart-filled": `<path class="icon-dot" d="${heart}"/>`,
        pin: '<path d="M8.5 3.5h7M9.5 3.5V9l-3 3.5V14h11v-1.5l-3-3.5V3.5M12 14v6.5"/>',
        stop: '<rect class="icon-dot" x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
        minus: '<path d="M6 12h12"/>',
        plus: '<path d="M12 6v12M6 12h12"/>',
        play: '<path class="icon-dot" d="M8 5.5v13l10.5-6.5Z"/>',
        more: '<circle class="icon-dot" cx="6" cy="12" r="1.5"/><circle class="icon-dot" cx="12" cy="12" r="1.5"/><circle class="icon-dot" cx="18" cy="12" r="1.5"/>',
        grip: '<circle class="icon-dot" cx="9" cy="6" r="1.5"/><circle class="icon-dot" cx="15" cy="6" r="1.5"/><circle class="icon-dot" cx="9" cy="12" r="1.5"/><circle class="icon-dot" cx="15" cy="12" r="1.5"/><circle class="icon-dot" cx="9" cy="18" r="1.5"/><circle class="icon-dot" cx="15" cy="18" r="1.5"/>',
        star: '<path d="M12 3.5 14.4 9l5.9.5-4.5 3.9 1.4 5.8L12 16.2l-5.2 3 1.4-5.8-4.5-3.9L9.6 9Z"/>',
        hourglass: '<path d="M7 3.5h10M7 20.5h10M8.5 3.5c0 4.5 7 4.5 7 8.5s-7 4-7 8.5M15.5 3.5c0 4.5-7 4.5-7 8.5s7 4 7 8.5"/>',
        // Kinds of palette item and the apps Maestro opens
        window: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9.5h17"/>',
        terminal: '<path d="m5 7 5 5-5 5m7 0h7"/>',
        layout: '<rect x="3.5" y="4.5" width="7" height="15" rx="1.5"/><rect x="13.5" y="4.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="6" rx="1.5"/>',
        code: '<path d="m9 8-4 4 4 4m6-8 4 4-4 4"/>',
        folder,
        "folder-open": folder + '<path d="M3.5 10h17"/>',
        calculator: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 7.5h7m-7 4.5h.01m3.5 0h.01m3.5 0h.01m-7 4h.01m3.5 0h.01m3.5 0h.01"/>',
        spark: '<path d="M12 3.5v4m0 9v4M3.5 12h4m9 0h4M6 6l2.8 2.8m6.4 6.4L18 18M6 18l2.8-2.8m6.4-6.4L18 6"/>',
        chart: '<path d="M4.5 19V5m0 14h15"/><path d="m7.5 15 3-4 3 2 5-6"/>',
        globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5Z"/>',
        download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>',
        scissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="m8.6 8.4 11 8.1m0-9-11 8.1"/>'
    };
    PATHS.reload = PATHS.restart;

    function has(name) {
        return Object.prototype.hasOwnProperty.call(PATHS, name);
    }

    function attributes(size) {
        return `class="icon${size === 24 ? " icon-24" : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"`;
    }

    // The icon as markup, for static templates. An unknown name is a mistake in
    // our own code, so it throws rather than drawing nothing.
    function markup(name, size = 20) {
        if (!has(name)) throw new Error(`No icon named ${name}`);
        return `<svg ${attributes(size)}>${PATHS[name]}</svg>`;
    }

    function create(name, size = 20) {
        const holder = document.createElement("span");
        holder.innerHTML = markup(name, size);   // our own static markup only
        return holder.firstElementChild;
    }

    // Fills each <svg data-icon="name"> in the page's own markup; data-size="24"
    // draws it at 24 px. Run once, as this file loads.
    function fill(root = document) {
        root.querySelectorAll("svg[data-icon]").forEach(svg => {
            const name = svg.dataset.icon;
            if (!has(name)) throw new Error(`No icon named ${name}`);
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("focusable", "false");
            svg.classList.add("icon");
            svg.classList.toggle("icon-24", svg.dataset.size === "24");
            svg.innerHTML = PATHS[name];
        });
    }

    return { names: Object.keys(PATHS), has, markup, create, fill };
})();

if (typeof document !== "undefined" && document.body) MaestroIcons.fill();
