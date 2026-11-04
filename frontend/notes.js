"use strict";

// Pure Quick Notes logic: #tags, filter queries, and a small Markdown parser.
// No DOM access. The parser returns a plain tree that app.js turns into
// elements with textContent only, so note text can never become HTML.
(function (global) {
    // #tag: a letter or digit after #, then letters, digits, _ or -, up to
    // 32 characters. "# Heading" (with a space) is not a tag, nor is "a#b".
    const TAG = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,31})/gu;

    function extractTags(text) {
        const tags = new Set();
        for (const match of String(text ?? "").matchAll(TAG)) tags.add(match[2].toLocaleLowerCase());
        return [...tags].sort();
    }

    // Query: whitespace-separated terms. "#tag" terms must match a tag of the
    // note exactly; other terms must appear in the title or content.
    function matchesNoteQuery(note, query) {
        const terms = String(query ?? "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) return true;
        const text = `${normalizeGroup(note.group)}\n${note.title}\n${note.content}`.toLocaleLowerCase();
        const tags = extractTags(`${note.title}\n${note.content}`);
        return terms.every(term => term.startsWith("#") && term.length > 1
            ? tags.includes(term.slice(1))
            : text.includes(term));
    }

    // ------------------------------------------------------------- groups
    // One level (1.8.0): an optional `group` string on a note; none means
    // Ungrouped. Names are tidied (spaces collapsed, control characters
    // dropped, up to 60 characters) and compared without regard to case, so
    // "claude" joins "Claude". ASCS checks the same limits when saving.
    const GROUP_MAX = 60;

    function normalizeGroup(name) {
        return String(name ?? "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, GROUP_MAX).trim();
    }

    const groupKey = name => normalizeGroup(name).toLocaleLowerCase();
    const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

    // Every group in use, A to Z, each spelled as it first appears.
    function groupNames(notes) {
        const names = new Map();
        (notes || []).forEach(note => {
            const name = normalizeGroup(note.group);
            if (name && !names.has(name.toLocaleLowerCase())) names.set(name.toLocaleLowerCase(), name);
        });
        return [...names.values()].sort(byName);
    }

    // The list's sections: pinned notes (outside the groups), then groups
    // (pinned groups first, each set A to Z), then Ungrouped. Notes keep the
    // order they're given in.
    function groupNotes(notes, pinnedGroups = []) {
        const pinnedKeys = new Set([...pinnedGroups].map(groupKey));
        const pinned = [], ungrouped = [];
        const groups = new Map();
        (notes || []).forEach(note => {
            if (note.pinned) return pinned.push(note);
            const name = normalizeGroup(note.group);
            if (!name) return ungrouped.push(note);
            const key = name.toLocaleLowerCase();
            if (!groups.has(key)) groups.set(key, { key, name, notes: [], pinned: pinnedKeys.has(key) });
            groups.get(key).notes.push(note);
        });
        const ordered = [...groups.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || byName(a.name, b.name));
        return { pinned, groups: ordered, ungrouped };
    }

    // Moves every note in a group to another name (merging when that group
    // exists), or to Ungrouped when the new name is empty. Returns how many.
    function renameGroup(notes, from, to) {
        const key = groupKey(from);
        const name = normalizeGroup(to);
        if (!key) return 0;
        let count = 0;
        (notes || []).forEach(note => {
            if (groupKey(note.group) !== key) return;
            if (name) note.group = name; else delete note.group;
            count++;
        });
        return count;
    }

    // Deleting a group moves its notes to Ungrouped; notes are never deleted.
    function deleteGroup(notes, name) {
        return renameGroup(notes, name, "");
    }

    // A note's name with its group in front, for the palette: "Claude › Bug".
    function groupedLabel(note, label) {
        const group = normalizeGroup(note?.group);
        return group ? `${group} › ${label}` : label;
    }

    // Tags across all notes with how many notes use each, most used first.
    function tagCounts(notes) {
        const counts = new Map();
        (notes || []).forEach(note => extractTags(`${note.title}\n${note.content}`)
            .forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([tag, count]) => ({ tag, count }));
    }

    // ------------------------------------------------------------- Markdown
    // Blocks: headings (# to ###), fenced code (```), block quotes (>),
    // bulleted and numbered lists, horizontal rules, and paragraphs.
    // Inline: **bold**, *italic*, `code`, [text](url) links, and #tags.
    // Links are shown as text and never navigated (see app.js).

    function parseInline(text) {
        const nodes = [];
        const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))|((?:^|(?<=[\s(]))#[\p{L}\p{N}][\p{L}\p{N}_-]{0,31})/gu;
        let last = 0;
        for (const match of text.matchAll(pattern)) {
            if (match.index > last) nodes.push({ type: "text", text: text.slice(last, match.index) });
            const token = match[0];
            if (match[1]) nodes.push({ type: "code", text: token.slice(1, -1) });
            else if (match[2]) nodes.push({ type: "strong", text: token.slice(2, -2) });
            else if (match[3]) nodes.push({ type: "em", text: token.slice(1, -1) });
            else if (match[4]) {
                const split = token.indexOf("](");
                nodes.push({ type: "link", text: token.slice(1, split), url: token.slice(split + 2, -1) });
            } else nodes.push({ type: "tag", text: token.slice(1).toLocaleLowerCase() });
            last = match.index + token.length;
        }
        if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
        return nodes;
    }

    function parseMarkdown(source) {
        const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
        const blocks = [];
        let paragraph = [];
        let list = null;

        const flushParagraph = () => {
            if (paragraph.length) blocks.push({ type: "p", children: parseInline(paragraph.join(" ")) });
            paragraph = [];
        };
        const flushList = () => {
            if (list) blocks.push(list);
            list = null;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*```/.test(line)) {
                flushParagraph(); flushList();
                const code = [];
                for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
                blocks.push({ type: "pre", text: code.join("\n") });
                continue;
            }
            let match;
            if ((match = /^(#{1,3})\s+(.+)$/.exec(line))) {
                flushParagraph(); flushList();
                blocks.push({ type: `h${match[1].length}`, children: parseInline(match[2].trim()) });
            } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
                flushParagraph(); flushList();
                blocks.push({ type: "hr" });
            } else if ((match = /^\s*>\s?(.*)$/.exec(line))) {
                flushParagraph(); flushList();
                blocks.push({ type: "blockquote", children: parseInline(match[1]) });
            } else if ((match = /^\s*(?:[-*+]|(\d+)[.)])\s+(.+)$/.exec(line))) {
                flushParagraph();
                const ordered = match[1] !== undefined;
                if (!list || list.ordered !== ordered) {
                    flushList();
                    list = { type: ordered ? "ol" : "ul", ordered, items: [] };
                }
                list.items.push(parseInline(match[2]));
            } else if (!line.trim()) {
                flushParagraph(); flushList();
            } else {
                flushList();
                paragraph.push(line.trim());
            }
        }
        flushParagraph();
        flushList();
        return blocks;
    }

    function wordCount(text) {
        const words = String(text ?? "").trim().match(/\S+/g);
        return words ? words.length : 0;
    }

    // ------------------------------------------------------------ placeholders
    // Filled in when a note is pasted or copied from the palette:
    //   {date} {isodate} {weekday}, each with a day offset like {date+7}
    //   {time} {time24} {month} {year} {uuid}
    //   {ask:name} or {ask:name=default}  asked for in the palette first;
    //                                     camelCase names, shown as words
    //   {clipboard} {cursor}              left as markers for ASCS, which knows
    //                                     the clipboard and places the cursor
    // Anything else in braces is left exactly as written. Nothing here can run
    // a command or read anything beyond the date, by design.
    const MARK_CLIPBOARD = String.fromCharCode(0xE000);
    const MARK_CURSOR = String.fromCharCode(0xE001);
    const MARKS = new RegExp(`[${MARK_CLIPBOARD}${MARK_CURSOR}]`, "g");
    const PLACEHOLDER = /\{(date|isodate|weekday)([+-]\d{1,4})?\}|\{(time|time24|month|year|uuid|clipboard|cursor)\}|\{ask:([^{}=\r\n]{1,40}?)\s*(?:=([^{}\r\n]{0,200}))?\}/g;

    // How an ask is shown in the palette: "clientName" or "client_name"
    // reads "Client name". The name in the note stays as written.
    function askLabel(name) {
        const words = String(name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
        return words ? words[0].toUpperCase() + words.slice(1) : String(name);
    }

    function placeholderAsks(text) {
        const asks = [];
        for (const match of String(text ?? "").matchAll(PLACEHOLDER)) {
            const name = match[4]?.trim();
            if (name && !asks.some(ask => ask.name === name)) asks.push({ name, fallback: (match[5] ?? "").trim() });
        }
        return asks;
    }

    function hasPlaceholders(text) {
        return new RegExp(PLACEHOLDER.source).test(String(text ?? ""));
    }

    function fillPlaceholders(text, { now = new Date(), answers = {}, uuid = () => globalThis.crypto.randomUUID() } = {}) {
        const pad = n => String(n).padStart(2, "0");
        const clean = value => String(value ?? "").replace(MARKS, "");
        const day = offset => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        return clean(text).replace(PLACEHOLDER, (whole, dateName, offset, plain, askName, fallback) => {
            if (dateName) {
                const d = day(Number(offset || 0));
                if (dateName === "isodate") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                if (dateName === "weekday") return d.toLocaleDateString("en-US", { weekday: "long" });
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            }
            if (plain === "time") return now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            if (plain === "time24") return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
            if (plain === "month") return now.toLocaleDateString("en-US", { month: "long" });
            if (plain === "year") return String(now.getFullYear());
            if (plain === "uuid") return uuid();
            if (plain === "clipboard") return MARK_CLIPBOARD;
            if (plain === "cursor") return MARK_CURSOR;
            const name = askName.trim();
            return clean(Object.prototype.hasOwnProperty.call(answers, name) ? answers[name] : (fallback ?? "").trim());
        });
    }

    // The placeholders the editor's menu offers, in order. "select" is the
    // part selected after inserting, ready to type over (a name, a number).
    const PLACEHOLDER_MENU = [
        { group: "Date and time", label: "Date", text: "{date}" },
        { group: "Date and time", label: "Date in 7 days", text: "{date+7}", select: [6, 7], note: "Change 7 to any number of days, or use - for days ago" },
        { group: "Date and time", label: "ISO date", text: "{isodate}" },
        { group: "Date and time", label: "Weekday", text: "{weekday}" },
        { group: "Date and time", label: "Time", text: "{time}" },
        { group: "Date and time", label: "24-hour time", text: "{time24}" },
        { group: "Date and time", label: "Month", text: "{month}" },
        { group: "Date and time", label: "Year", text: "{year}" },
        { group: "Ask when pasting", label: "Ask for a value", text: "{ask:name}", select: [5, 9], note: "The palette asks for it, by this name, before pasting" },
        { group: "Ask when pasting", label: "Ask, with a default", text: "{ask:name=default}", select: [5, 9], note: "Enter keeps the default" },
        { group: "From the moment", label: "Clipboard", text: "{clipboard}", note: "The text on the clipboard" },
        { group: "From the moment", label: "Cursor", text: "{cursor}", note: "Where the cursor ends up after pasting" },
        { group: "From the moment", label: "Unique ID", text: "{uuid}" }
    ];

    // Whether a note fills placeholders: its own setting, or by style (text
    // notes do; code notes paste exactly as written).
    function fillsPlaceholders(note) {
        return typeof note?.fill === "boolean" ? note.fill : note?.type !== "code";
    }

    global.ASCSNotes = {
        extractTags, matchesNoteQuery, tagCounts, parseMarkdown, parseInline, wordCount,
        MARK_CLIPBOARD, MARK_CURSOR, PLACEHOLDER_MENU, askLabel, placeholderAsks,
        normalizeGroup, groupKey, groupNames, groupNotes, renameGroup, deleteGroup, groupedLabel, hasPlaceholders, fillPlaceholders, fillsPlaceholders
    };
})(globalThis);
