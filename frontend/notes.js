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

    // Where the filter's words are in a note's text (2.0.0), for highlighting:
    // [{ start, end }], in order, never overlapping, at most `limit`. Case is
    // ignored. A #tag term is found with its #; group names aren't searched,
    // as they aren't in the text.
    function findMatches(text, query, limit = 1000) {
        const source = String(text ?? "");
        const terms = [...new Set(String(query ?? "").split(/\s+/).filter(term => term && term !== "#"))]
            .sort((a, b) => b.length - a.length);       // the longest first, where two start together
        if (!terms.length || !source) return [];
        const escape = term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(terms.map(escape).join("|"), "giu");
        const found = [];
        for (const match of source.matchAll(pattern)) {
            if (found.length >= limit) break;
            found.push({ start: match.index, end: match.index + match[0].length });
        }
        return found;
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

    // ---------------------------------------------------------- game notes
    // 1.11.1: an optional `game` string links a note to a game, by the game's
    // title key (ASCSGames.gameNoteKey), so renaming the note keeps the link.
    const GAME_NOTE_GROUP = "Game notes";
    const isGameKey = key => typeof key === "string" && /^[\p{L}\p{N}]{1,160}$/u.test(key);

    // Drops a link that isn't valid, so one bad hand edit can't make ASCS
    // refuse every later save. Returns how many were dropped.
    function cleanGameLinks(notes) {
        let dropped = 0;
        notes.forEach(note => {
            if (note.game !== undefined && !isGameKey(note.game)) {
                delete note.game;
                dropped++;
            }
        });
        return dropped;
    }

    // The game's note; if a hand edit left several, the one updated last.
    function findGameNote(notes, key) {
        if (!isGameKey(key)) return null;
        return notes.filter(note => note.game === key)
            .reduce((best, note) => !best || String(note.updated) > String(best.updated) ? note : best, null);
    }

    // A window's title can hold anything, so it's tidied before it's a note's.
    function gameNoteTitle(title) {
        return String(title ?? "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160).trim();
    }

    // A timestamp as a heading on its own line at the end, ready to write under.
    function appendStamp(content, stamp) {
        const text = String(content ?? "");
        const gap = !text || text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
        return `${text}${gap}### ${stamp}\n`;
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
    // GitHub-style Markdown (2.0.0; 1.7.0 had a few blocks and inline marks).
    // Blocks: headings (# to ######, and text underlined with === or ---),
    // fenced code (``` or ~~~, with a language label), block quotes (nested,
    // holding anything), lists (bulleted, numbered from any number, nested, and
    // task lists), tables (with alignment), horizontal rules and paragraphs. A
    // line break in a paragraph is kept, as in most note apps.
    // Inline: **bold** and __bold__, *italic* and _italic_, ***both***,
    // ~~strikethrough~~, ==highlight==, `code`, [links](url), <https://…> and bare
    // web addresses, ![images](url) (shown as their alt text, never loaded),
    // backslash escapes, and #tags.
    // The result is plain data; app.js builds it with elements and textContent
    // only, so nothing in a note is ever read as HTML. Depth and size are capped.

    const MAX_DEPTH = 8;            // quotes and lists inside each other
    const MAX_INLINE_DEPTH = 6;     // marks inside marks
    const MAX_TABLE_COLUMNS = 20;
    const MAX_TABLE_ROWS = 500;
    const ESCAPABLE = "\\`*_{}[]()#+-.!|~=<>\"'";

    // Inline ------------------------------------------------------------

    const isSpace = ch => ch === undefined || /\s/.test(ch);
    const isWordChar = ch => ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);

    // The closing delimiter for a mark opened at `from`, or -1. It must follow a
    // non-space; `_` must also not be inside a word.
    function findClose(text, from, delim) {
        let at = from;
        while ((at = text.indexOf(delim, at)) !== -1) {
            if (at > from && !isSpace(text[at - 1]) && text[at - 1] !== "\\") {
                const after = text[at + delim.length];
                const single = delim.length === 1;
                if (delim[0] === "_" && isWordChar(after)) { at++; continue; }
                if (single && after === delim) { at += 2; continue; }   // part of a ** or __
                // In a longer run (*** closing **), the mark takes the run's end,
                // so the * before it can close an inner italic.
                if (!single) while (text[at + delim.length] === delim[0]) at++;
                return at;
            }
            at++;
        }
        return -1;
    }

    // The end of a link's (url) starting at `open` (the "("), allowing balanced
    // parentheses inside, or -1.
    function closeParen(text, open) {
        let depth = 0;
        for (let i = open; i < text.length; i++) {
            const ch = text[i];
            if (ch === "\\") { i++; continue; }
            if (ch === "\n") return -1;
            if (ch === "(") depth++;
            else if (ch === ")" && --depth === 0) return i;
        }
        return -1;
    }

    // The matching "]" for a "[" at `open`, or -1.
    function closeBracket(text, open) {
        let depth = 0;
        for (let i = open; i < text.length; i++) {
            const ch = text[i];
            if (ch === "\\") { i++; continue; }
            if (ch === "`") {
                const run = /^`+/.exec(text.slice(i))[0];
                const end = text.indexOf(run, i + run.length);
                if (end !== -1) { i = end + run.length - 1; continue; }
            }
            if (ch === "[") depth++;
            else if (ch === "]" && --depth === 0) return i;
        }
        return -1;
    }

    // "url" or "url "title"" from inside a link's parentheses.
    function linkTarget(inside) {
        const match = /^\s*<?([^\s<>]*)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/.exec(inside);
        return match ? match[1] : null;
    }

    const EMPHASIS = [
        ["***", "strongEm"], ["___", "strongEm"], ["**", "strong"], ["__", "strong"],
        ["~~", "del"], ["==", "mark"], ["*", "em"], ["_", "em"]
    ];

    function parseInline(text, depth = 0, inLink = false) {
        const nodes = [];
        let plain = "";
        const flush = () => {
            if (plain) nodes.push({ type: "text", text: plain });
            plain = "";
        };
        const push = node => { flush(); nodes.push(node); };
        text = String(text ?? "");

        for (let i = 0; i < text.length;) {
            const ch = text[i];
            const rest = text.slice(i);

            if (ch === "\\" && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
                plain += text[i + 1];
                i += 2;
                continue;
            }
            if (ch === "\n") {
                push({ type: "br" });
                i++;
                continue;
            }
            if (ch === "`") {
                const run = /^`+/.exec(rest)[0];
                const end = text.indexOf(run, i + run.length);
                if (end !== -1 && text[end + run.length] !== "`") {
                    let code = text.slice(i + run.length, end).replace(/\n/g, " ");
                    if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
                    push({ type: "code", text: code });
                    i = end + run.length;
                    continue;
                }
                plain += run;
                i += run.length;
                continue;
            }
            if (ch === "<") {
                const match = /^<(https?:\/\/[^\s<>]+)>/i.exec(rest);
                if (match && !inLink) {
                    push({ type: "link", url: match[1], children: [{ type: "text", text: match[1] }] });
                    i += match[0].length;
                    continue;
                }
            }
            if ((ch === "!" && text[i + 1] === "[") || ch === "[") {
                const image = ch === "!";
                const open = i + (image ? 1 : 0);
                const close = closeBracket(text, open);
                if (close !== -1 && text[close + 1] === "(") {
                    const end = closeParen(text, close + 1);
                    const url = end !== -1 ? linkTarget(text.slice(close + 2, end)) : null;
                    if (url !== null && (image || !inLink)) {
                        const label = text.slice(open + 1, close);
                        if (image) push({ type: "image", alt: label.replace(/\\(.)/g, "$1"), url });
                        else push({ type: "link", url, children: depth < MAX_INLINE_DEPTH ? parseInline(label, depth + 1, true) : [{ type: "text", text: label }] });
                        i = end + 1;
                        continue;
                    }
                }
            }
            if ((ch === "h" || ch === "H") && !inLink && (i === 0 || /[\s(]/.test(text[i - 1]))) {
                const match = /^https?:\/\/[^\s<]+/i.exec(rest);
                if (match) {
                    let url = match[0];
                    // Trailing punctuation belongs to the sentence, and a ")" only if unmatched.
                    while (/[.,;:!?'"*_~]$/.test(url) || (url.endsWith(")") && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length)) url = url.slice(0, -1);
                    push({ type: "link", url, children: [{ type: "text", text: url }] });
                    i += url.length;
                    continue;
                }
            }
            if (ch === "#" && (i === 0 || /[\s(]/.test(text[i - 1]))) {
                const match = /^#([\p{L}\p{N}][\p{L}\p{N}_-]{0,31})/u.exec(rest);
                if (match) {
                    push({ type: "tag", text: match[1].toLocaleLowerCase() });
                    i += match[0].length;
                    continue;
                }
            }
            if ("*_~=".includes(ch) && depth < MAX_INLINE_DEPTH) {
                const mark = EMPHASIS.find(([delim]) => rest.startsWith(delim));
                if (mark) {
                    const [delim, type] = mark;
                    const opens = !isSpace(text[i + delim.length]) && !(delim[0] === "_" && isWordChar(text[i - 1]));
                    const close = opens ? findClose(text, i + delim.length, delim) : -1;
                    if (close !== -1) {
                        const inner = parseInline(text.slice(i + delim.length, close), depth + 1, inLink);
                        push(type === "strongEm"
                            ? { type: "strong", children: [{ type: "em", children: inner }] }
                            : { type, children: inner });
                        i = close + delim.length;
                        continue;
                    }
                    // An unmatched run is text: all of it, so ** doesn't become a lone *.
                    const run = /^([*_~=])\1*/.exec(rest)[0];
                    plain += run;
                    i += run.length;
                    continue;
                }
            }
            plain += ch;
            i++;
        }
        flush();
        return nodes;
    }

    // Blocks ------------------------------------------------------------

    const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
    const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
    const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
    const QUOTE = /^ {0,3}>\s?(.*)$/;
    const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
    const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
    const SETEXT = /^ {0,3}(=+|-+)\s*$/;

    const indentOf = text => {
        let width = 0;
        for (const ch of text) {
            if (ch === " ") width++;
            else if (ch === "\t") width += 4 - (width % 4);
            else break;
        }
        return width;
    };

    // Removes `width` columns of leading indentation, tabs counted to 4.
    function dedent(text, width) {
        let removed = 0, i = 0;
        while (i < text.length && removed < width) {
            if (text[i] === " ") removed++;
            else if (text[i] === "\t") removed += 4 - (removed % 4);
            else break;
            i++;
        }
        return text.slice(i);
    }

    // Splits a table row on its pipes (not escaped, not in code); the outer pipes
    // are optional.
    function tableCells(text) {
        let line = text.trim();
        if (line.startsWith("|")) line = line.slice(1);
        if (line.endsWith("|") && !line.endsWith("\\|")) line = line.slice(0, -1);
        const cells = [];
        let cell = "", inCode = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === "\\" && line[i + 1] === "|") { cell += "|"; i++; continue; }
            if (ch === "`") inCode = !inCode;
            if (ch === "|" && !inCode) { cells.push(cell.trim()); cell = ""; continue; }
            cell += ch;
        }
        cells.push(cell.trim());
        return cells;
    }

    const startsBlock = text => FENCE.test(text) || HEADING.test(text) || RULE.test(text) || QUOTE.test(text) || ITEM.test(text);

    // `lines` are { text, n }: n is the line's number in the note, so a task
    // box can change the right line.
    function parseBlocks(lines, depth) {
        const blocks = [];
        let i = 0;
        while (i < lines.length) {
            const { text } = lines[i];
            if (!text.trim()) { i++; continue; }
            let match;

            if ((match = FENCE.exec(text))) {
                const fence = match[1];
                const lang = /^[\w+#.-]{1,24}$/.test(match[2]) ? match[2] : "";
                const indent = indentOf(text);
                const code = [];
                for (i++; i < lines.length; i++) {
                    const close = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
                    if (close.test(lines[i].text)) { i++; break; }
                    code.push(dedent(lines[i].text, indent));
                }
                blocks.push({ type: "pre", text: code.join("\n"), lang });
                continue;
            }
            if ((match = HEADING.exec(text))) {
                blocks.push({ type: `h${match[1].length}`, children: parseInline((match[2] || "").trim()) });
                i++;
                continue;
            }
            if (RULE.test(text)) {
                blocks.push({ type: "hr" });
                i++;
                continue;
            }
            if (QUOTE.test(text)) {
                const inner = [];
                while (i < lines.length && (match = QUOTE.exec(lines[i].text))) {
                    inner.push({ text: match[1], n: lines[i].n });
                    i++;
                }
                blocks.push(depth < MAX_DEPTH
                    ? { type: "blockquote", blocks: parseBlocks(inner, depth + 1) }
                    : { type: "blockquote", blocks: [{ type: "p", children: parseInline(inner.map(line => line.text).join("\n")) }] });
                continue;
            }
            if ((match = ITEM.exec(text)) && !RULE.test(text)) {
                const parsed = parseList(lines, i, depth);
                blocks.push(parsed.list);
                i = parsed.next;
                continue;
            }
            if (text.includes("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1].text) && lines[i + 1].text.includes("-")) {
                const head = tableCells(text).slice(0, MAX_TABLE_COLUMNS);
                const divider = tableCells(lines[i + 1].text);
                if (divider.length === tableCells(text).length) {
                    const align = head.map((_, column) => {
                        const spec = divider[column] || "";
                        return spec.startsWith(":") && spec.endsWith(":") ? "center" : spec.endsWith(":") ? "right" : spec.startsWith(":") ? "left" : "";
                    });
                    const rows = [];
                    for (i += 2; i < lines.length && lines[i].text.trim() && lines[i].text.includes("|") && rows.length < MAX_TABLE_ROWS; i++) {
                        const cells = tableCells(lines[i].text);
                        rows.push(head.map((_, column) => parseInline(cells[column] ?? "")));
                    }
                    blocks.push({ type: "table", align, head: head.map(cell => parseInline(cell)), rows });
                    continue;
                }
            }

            // A paragraph: lines until a blank one or the start of another block.
            // Text underlined with === or --- is a heading instead.
            const paragraph = [text.trim()];
            for (i++; i < lines.length; i++) {
                const next = lines[i].text;
                if (!next.trim()) break;
                if ((match = SETEXT.exec(next))) {
                    blocks.push({ type: match[1][0] === "=" ? "h1" : "h2", children: parseInline(paragraph.join("\n")) });
                    paragraph.length = 0;
                    i++;
                    break;
                }
                // A numbered line interrupts a paragraph only from 1, so "2026. A year" stays text.
                const item = ITEM.exec(next);
                if (startsBlock(next) && !(item && /\d/.test(item[2]) && parseInt(item[2], 10) !== 1)) break;
                paragraph.push(next.trim());
            }
            if (paragraph.length) blocks.push({ type: "p", children: parseInline(paragraph.join("\n")) });
        }
        return blocks;
    }

    // One list from line `start`: its items, each with what's indented under it.
    function parseList(lines, start, depth) {
        const first = ITEM.exec(lines[start].text);
        const ordered = /\d/.test(first[2]);
        const indent = indentOf(first[1]);
        const list = { type: ordered ? "ol" : "ul", ordered, start: ordered ? Math.min(parseInt(first[2], 10), 999999999) : 1, items: [] };
        let i = start;
        while (i < lines.length) {
            const match = ITEM.exec(lines[i].text);
            if (!match || indentOf(match[1]) > indent + 3 || indentOf(match[1]) < indent || /\d/.test(match[2]) !== ordered || RULE.test(lines[i].text)) break;
            const content = indentOf(match[1]) + match[2].length + (match[3] ? Math.min(match[3].length, 4) : 1);
            let body = match[4];
            const lineNumber = lines[i].n;
            let task = null;
            const box = /^\[([ xX])\](?:\s+|$)/.exec(body);
            if (box) {
                task = box[1] !== " ";
                body = body.slice(box[0].length);
            }
            const textLines = [body];
            const children = [];
            let blank = false;
            for (i++; i < lines.length; i++) {
                const next = lines[i].text;
                if (!next.trim()) { blank = true; continue; }
                const nextIndent = indentOf(next);
                if (nextIndent >= content || (nextIndent > indent && ITEM.test(next))) {
                    children.push({ text: dedent(next, Math.min(content, nextIndent)), n: lines[i].n });
                    if (blank) children.splice(children.length - 1, 0, { text: "", n: lines[i].n });
                    blank = false;
                    continue;
                }
                if (blank || startsBlock(next)) break;
                if (!children.length) textLines.push(next.trim());       // a wrapped line
                else children.push({ text: next.trim(), n: lines[i].n });
            }
            list.items.push({
                children: parseInline(textLines.join("\n")),
                task, line: lineNumber,
                blocks: children.length ? (depth < MAX_DEPTH ? parseBlocks(children, depth + 1) : [{ type: "p", children: parseInline(children.map(line => line.text).join("\n")) }]) : []
            });
            // The loop above goes on only while the next line is an item of this list.
        }
        return { list, next: i };
    }

    function parseMarkdown(source) {
        const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n").map((text, n) => ({ text, n }));
        return parseBlocks(lines, 0);
    }

    // Ticks or clears the task box on line `lineNumber` (counted from 0), or
    // returns null if that line no longer holds one.
    function toggleTask(source, lineNumber) {
        const lines = String(source ?? "").split("\n");
        const line = lines[lineNumber];
        if (line === undefined) return null;
        const match = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\].*)$/s.exec(line.replace(/\r$/, ""));
        if (!match) return null;
        lines[lineNumber] = match[1] + (match[2] === " " ? "x" : " ") + match[3] + (line.endsWith("\r") ? "\r" : "");
        return lines.join("\n");
    }

    // The Markdown reference (2.0.0): each row is written as typed, and drawn by
    // the same parser, so the chart can't promise more than the viewer does.
    const MARKDOWN_REFERENCE = [
        ["Headings", "# Heading 1\n## Heading 2\n### Heading 3"],
        ["Smaller Headings", "#### Heading 4\n##### Heading 5\n###### Heading 6"],
        ["Underlined Headings", "Heading 1\n===\nHeading 2\n---"],
        ["Bold", "**bold** or __bold__"],
        ["Italic", "*italic* or _italic_"],
        ["Bold and Italic", "***both at once***"],
        ["Strikethrough", "~~no longer true~~"],
        ["Highlight", "==worth noticing=="],
        ["Inline Code", "Run `maestro check` first"],
        ["Code Block", "```js\nconst total = 1 + 2;\n```"],
        ["Bulleted List", "- First\n- Second\n  - Indented under it"],
        ["Numbered List", "1. First\n2. Second\n3. Third"],
        ["Starting Number", "4. Picks up at four\n5. And goes on"],
        ["Task List", "- [x] Done\n- [ ] Still to do"],
        ["Quote", "> Quoted text\n> > A quote inside it"],
        ["Table", "| Item | Count |\n| :--- | ---: |\n| Discs | 4 |\n| Pads | 2 |"],
        ["Link", "[Maestro on GitHub](https://github.com)"],
        ["Web Address", "https://retroachievements.org"],
        ["Image", "![A screenshot](shot.png)"],
        ["Line Break", "One line\nThe next line"],
        ["Paragraph", "A paragraph.\n\nAnother, after a blank line."],
        ["Horizontal Rule", "Above\n\n---\n\nBelow"],
        ["Tag", "#work #ideas"],
        ["Escape a Mark", "\\*not italic\\*"]
    ];

    function wordCount(text) {
        const words = String(text ?? "").trim().match(/\S+/g);
        return words ? words.length : 0;
    }

    // Quick Notes (2.0.0): how a note opens. Read shows it formatted; a note with
    // nothing in it yet, and code, which isn't Markdown, open in Edit.
    function openingMode(note) {
        if (!note || note.type === "code" || !String(note.content ?? "").trim()) return "edit";
        return "read";
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

    // ---------------------------------------------------------------- trash
    // 2.1.0: a deleted note is kept for 30 days in a list of its own, `trash`,
    // beside `notes` in notes.json, so nothing that reads notes ever sees it.
    // Each entry is the whole note plus `deletedAt`.
    const TRASH_DAYS = 30;
    const TRASH_LIMIT = 200;
    const DAY_MS = 86400000;

    // A whole note, as notes.json holds one.
    function isNote(note) {
        return Boolean(note) && typeof note.id === "string"
            && typeof note.title === "string"
            && ["note", "code", "snippet"].includes(note.type)
            && (note.fill === undefined || typeof note.fill === "boolean")
            && (note.group === undefined || typeof note.group === "string")
            && typeof note.content === "string"
            && typeof note.pinned === "boolean"
            && typeof note.created === "string"
            && typeof note.updated === "string";
    }

    const isTime = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
    const isBlankNote = note => !note.title.trim() && !note.content.trim();
    const trashedAt = entry => Date.parse(entry.deletedAt);

    // A saved trash list as it should be: only whole notes with a time, none
    // past its 30 days, 200 at most. One bad entry is dropped, so it can't
    // cost the rest. `changed` says the saved list needs saving again.
    function cleanTrash(list, now = new Date()) {
        const saved = Array.isArray(list) ? list : [];
        const trash = saved
            .filter(entry => isNote(entry) && isTime(entry.deletedAt) && now.getTime() - trashedAt(entry) < TRASH_DAYS * DAY_MS)
            .sort((left, right) => trashedAt(right) - trashedAt(left))
            .slice(0, TRASH_LIMIT);
        let changed = trash.length !== saved.length || (list !== undefined && !Array.isArray(list));
        trash.forEach(entry => {
            if (entry.type === "snippet") {
                entry.type = "code";
                changed = true;
            }
        });
        if (cleanGameLinks(trash)) changed = true;
        return { trash, changed };
    }

    // Takes a note out of data.notes and puts it at the front of data.trash.
    // A note with nothing in it is only removed. Returns the trash entry, null
    // for an empty note, or undefined when there's no such note.
    function trashNote(data, id, now = new Date()) {
        const index = data.notes.findIndex(note => note.id === id);
        if (index < 0) return undefined;
        const [note] = data.notes.splice(index, 1);
        if (isBlankNote(note)) return null;
        const entry = { ...note, deletedAt: now.toISOString() };
        data.trash.unshift(entry);
        if (data.trash.length > TRASH_LIMIT) data.trash.length = TRASH_LIMIT;
        return entry;
    }

    // Puts a trashed note back among the notes, as it was. Its link to a game is
    // dropped if that game has another note by now. Returns the note, or null.
    function restoreNote(data, id) {
        const index = data.trash.findIndex(entry => entry.id === id);
        if (index < 0) return null;
        const note = { ...data.trash[index] };
        data.trash.splice(index, 1);
        delete note.deletedAt;
        if (data.notes.some(other => other.id === note.id)) note.id = `${note.id}_restored_${Date.now().toString(36)}`;
        if (note.game !== undefined && data.notes.some(other => other.game === note.game)) delete note.game;
        data.notes.push(note);
        return note;
    }

    // Deletes a trashed note for good. True when there was one.
    function removeTrashed(data, id) {
        const index = data.trash.findIndex(entry => entry.id === id);
        if (index < 0) return false;
        data.trash.splice(index, 1);
        return true;
    }

    // Whole days until a trashed note is removed: 30 on the day it's deleted, 1 on its last.
    function trashDaysLeft(entry, now = new Date()) {
        return Math.max(1, Math.ceil((trashedAt(entry) + TRASH_DAYS * DAY_MS - now.getTime()) / DAY_MS));
    }

    global.ASCSNotes = {
        extractTags, matchesNoteQuery, findMatches, tagCounts, parseMarkdown, parseInline, toggleTask, MARKDOWN_REFERENCE, wordCount, openingMode,
        MARK_CLIPBOARD, MARK_CURSOR, PLACEHOLDER_MENU, askLabel, placeholderAsks,
        normalizeGroup, groupKey, groupNames, groupNotes, renameGroup, deleteGroup, groupedLabel, hasPlaceholders, fillPlaceholders, fillsPlaceholders,
        GAME_NOTE_GROUP, isGameKey, cleanGameLinks, findGameNote, gameNoteTitle, appendStamp,
        TRASH_DAYS, isNote, cleanTrash, trashNote, restoreNote, removeTrashed, trashDaysLeft
    };
})(globalThis);
