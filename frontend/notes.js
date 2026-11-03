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
        const text = `${note.title}\n${note.content}`.toLocaleLowerCase();
        const tags = extractTags(`${note.title}\n${note.content}`);
        return terms.every(term => term.startsWith("#") && term.length > 1
            ? tags.includes(term.slice(1))
            : text.includes(term));
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

    global.ASCSNotes = { extractTags, matchesNoteQuery, tagCounts, parseMarkdown, parseInline, wordCount };
})(globalThis);
