"use strict";

(function () {
    const N = globalThis.ASCSNotes;
    const C = globalThis.ASCSCharts;
    const { check, equal } = globalThis.TestHarness;
    const json = value => JSON.stringify(value);

    // Tags
    equal("tags extracted, lowercased, sorted", json(N.extractTags("Plan #Work and #home, again #work")), json(["home", "work"]));
    equal("heading is not a tag", json(N.extractTags("# Heading\n## Sub")), json([]));
    equal("mid-word hash is not a tag", json(N.extractTags("C#sharp and a#b")), json([]));
    equal("tag in parentheses", json(N.extractTags("(see #ideas)")), json(["ideas"]));
    equal("unicode tags", json(N.extractTags("#café notes")), json(["café"]));
    equal("tag length capped at 32", N.extractTags("#" + "a".repeat(40))[0].length, 32);

    // Queries
    const note = { title: "Release plan", content: "Bump version #work\nUpdate changelog" };
    check("plain term matches content", N.matchesNoteQuery(note, "changelog"));
    check("tag term matches tag", N.matchesNoteQuery(note, "#work"));
    check("tag term needs an exact tag", !N.matchesNoteQuery(note, "#wor"));
    check("all terms must match", !N.matchesNoteQuery(note, "#work missing"));
    check("empty query matches", N.matchesNoteQuery(note, "  "));
    equal("tag counts", json(N.tagCounts([note, { title: "", content: "#work #home" }])), json([{ tag: "work", count: 2 }, { tag: "home", count: 1 }]));

    // Markdown blocks
    const md = N.parseMarkdown("# Title\n\nSome **bold** and *it* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted\n\n---\n\n```\nlet x = 1;\n**not bold**\n```");
    equal("block types", json(md.map(b => b.type)), json(["h1", "p", "ul", "ol", "blockquote", "hr", "pre"]));
    equal("inline kinds", json(md[1].children.map(c => c.type)), json(["text", "strong", "text", "em", "text", "code", "text"]));
    equal("list items", md[2].items.length, 2);
    equal("code fence kept verbatim", md[6].text, "let x = 1;\n**not bold**");
    const link = N.parseInline("see [docs](https://example.com/a) now")[1];
    check("link parsed as text + url", link.type === "link" && link.text === "docs" && link.url === "https://example.com/a");
    equal("tag inside markdown", N.parseInline("todo #work")[1].type, "tag");

    // Hostile input stays text: the tree has only known node types, and the
    // markup survives verbatim as text for app.js to set via textContent.
    const evil = "<img src=x onerror=alert(1)> <script>alert(2)</script> [x](javascript:alert(3))";
    const tree = N.parseMarkdown(evil);
    const known = new Set(["text", "code", "strong", "em", "link", "tag"]);
    check("hostile input: only known node types", tree.every(b => b.type === "p" && b.children.every(c => known.has(c.type))));
    check("hostile input: markup preserved as text", tree[0].children.map(c => c.text).join("").includes("<img src=x onerror=alert(1)>"));
    equal("word count", N.wordCount("  one two\nthree "), 3);

    // Sparkline geometry
    const s = C.sparkline([0, 50, 100], 100, 50, 0);
    equal("sparkline line", s.line, "M0 50 L50 25 L100 0");
    check("sparkline area closes to the baseline", s.area.endsWith("L100 50 L0 50 Z"));
    equal("sparkline peak", s.peak, 100);
    equal("sparkline average", s.average, 50);
    equal("sparkline clamps", C.sparkline([-20, 150], 10, 10, 0).line, "M0 10 L10 0");
    equal("sparkline needs two points", C.sparkline([42], 10, 10).line, "");
    equal("sparkline ignores junk", C.sparkline([10, "x", null, 20], 10, 10, 0).count, 3);
})();
