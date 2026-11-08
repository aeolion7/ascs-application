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
    const points = C.pointGraph([1000, 2000], 300, 56);
    equal("point graph: left and right", `${points.points[0].x},${points.points[1].x}`, "0,100");
    equal("point graph: starts from zero", points.points[0].y > points.points[1].y, true);
    equal("point graph: the largest stays inside", points.points[1].y > 0, true);
    equal("point graph: a line through them", points.line.startsWith("M0 "), true);
    equal("point graph: one point sits mid-way", C.pointGraph([5], 300, 56).points[0].x, 50);
    equal("point graph: one point has no line", C.pointGraph([5], 300, 56).line, "");
    equal("point graph: all zero is safe", C.pointGraph([0, 0], 300, 56).points[0].y, 100);
    equal("point graph: ignores junk", C.pointGraph([1, "x", -4, null, 2], 300, 56).points.length, 3);
    equal("point graph: nothing to draw", C.pointGraph(null, 300, 56).points.length, 0);
    equal("nearest point: the closer one", C.nearestPoint([{ x: 0 }, { x: 50 }, { x: 100 }], 60), 1);
    equal("nearest point: past the end", C.nearestPoint([{ x: 0 }, { x: 100 }], 140), 1);
    equal("nearest point: none", C.nearestPoint([], 10), -1);
    equal("sparkline ignores junk", C.sparkline([10, "x", null, 20], 10, 10, 0).count, 3);

    // Placeholders (filled when a note is pasted or copied from the palette)
    const now = new Date(2026, 10, 4, 15, 5);   // Wed, Nov 4 2026, 3:05 PM
    const fill = (text, answers = {}) => N.fillPlaceholders(text, { now, answers, uuid: () => "UUID" });
    const marks = text => text.replace(new RegExp(N.MARK_CLIPBOARD, "g"), "[clip]").replace(new RegExp(N.MARK_CURSOR, "g"), "[cursor]");
    equal("placeholders: dates and times", fill("{date} {isodate} {weekday} {time} {time24} {month} {year}"),
        "Nov 4, 2026 2026-11-04 Wednesday 3:05 PM 15:05 November 2026");
    equal("placeholders: day offsets", fill("{isodate+7} {isodate-4} {weekday+1} {date+30}"), "2026-11-11 2026-10-31 Thursday Dec 4, 2026");
    equal("placeholders: uuid", fill("id {uuid}"), "id UUID");
    equal("placeholders: clipboard and cursor become marks for ASCS", marks(fill("Re: {clipboard}\n{cursor}")), "Re: [clip]\n[cursor]");
    equal("placeholders: unknown braces are left exactly", fill("function f() { return {a: 1}; } {Date} {date }"), "function f() { return {a: 1}; } {Date} {date }");
    equal("placeholders: ask answers", fill("Hi {ask:Name}, see you {ask:Day=Friday}. Bye {ask:Name}!", { Name: "Sam" }), "Hi Sam, see you Friday. Bye Sam!");
    equal("placeholders: an answer is used as given, never re-filled", fill("{ask:Note}", { Note: "{date}" }), "{date}");
    equal("placeholders: asks listed once each, with defaults", JSON.stringify(N.placeholderAsks("{ask:Name} {ask: Day = Friday} {ask:Name}")),
        JSON.stringify([{ name: "Name", fallback: "" }, { name: "Day", fallback: "Friday" }]));
    equal("placeholders: marks typed into a note or an answer are dropped", marks(fill(`a${N.MARK_CURSOR}b{ask:X}`, { X: N.MARK_CLIPBOARD })), "ab");
    equal("ask label: camelCase reads as words", N.askLabel("clientName"), "Client name");
    equal("ask label: snake_case and single words", `${N.askLabel("due_date")}|${N.askLabel("name")}|${N.askLabel("Name")}`, "Due date|Name|Name");
    equal("ask label: acronyms and digits", N.askLabel("line2Text"), "Line2 text");
    equal("placeholder menu: ask examples are camelCase", N.PLACEHOLDER_MENU.filter(item => item.text.startsWith("{ask:")).map(item => item.text).join(" "), "{ask:name} {ask:name=default}");
    check("placeholders: detected", N.hasPlaceholders("x {time}") && !N.hasPlaceholders("x {nope}") && !N.hasPlaceholders("plain"));
    check("placeholder menu: every entry is a working placeholder", N.PLACEHOLDER_MENU.every(item => N.hasPlaceholders(item.text)));
    equal("placeholder menu: the selected part is the name or number", N.PLACEHOLDER_MENU.filter(item => item.select)
        .map(item => item.text.slice(...item.select)).join(), "7,name,name");
    equal("placeholders: text notes fill, code notes don't, unless set", [
        N.fillsPlaceholders({ type: "note" }), N.fillsPlaceholders({ type: "code" }),
        N.fillsPlaceholders({ type: "code", fill: true }), N.fillsPlaceholders({ type: "note", fill: false })].join(), "true,false,true,false");

    // ---- groups (1.8.0)
    const gnote = (id, group, extra = {}) => ({ id, title: id, content: "", pinned: false, ...(group === undefined ? {} : { group }), ...extra });
    const sample = () => [gnote("a", "Claude"), gnote("b", "claude "), gnote("c"), gnote("d", "Work"), gnote("e", ""), gnote("f", "Claude", { pinned: true }), gnote("g", "  ")];
    const ids = list => list.map(item => item.id).join("");

    equal("groups: names tidied", `${N.normalizeGroup("  Claude   prompts ")}|${N.normalizeGroup("a\tb\nc")}|${N.normalizeGroup(null)}`, "Claude prompts|a b c|");
    equal("groups: names capped at 60", N.normalizeGroup("x".repeat(80)).length, 60);
    equal("groups: names in use, A to Z, first spelling kept", N.groupNames(sample()).join(","), "Claude,Work");

    const sections = N.groupNotes(sample());
    equal("groups: pinned notes sit outside the groups", ids(sections.pinned), "f");
    equal("groups: case-insensitive, in order", sections.groups.map(group => `${group.name}:${ids(group.notes)}`).join(" "), "Claude:ab Work:d");
    equal("groups: no group, empty or blank means Ungrouped", ids(sections.ungrouped), "ceg");
    const pinnedFirst = N.groupNotes([gnote("x", "Zeta"), gnote("y", "alpha"), gnote("z", "Mid")], ["zeta"]);
    equal("groups: pinned groups first, then A to Z", pinnedFirst.groups.map(group => `${group.name}${group.pinned ? "*" : ""}`).join(" "), "Zeta* alpha Mid");

    const renamed = sample();
    equal("groups: rename moves every note, whatever the case", N.renameGroup(renamed, "CLAUDE", "Prompts"), 3);
    equal("groups: renamed", renamed.filter(item => item.group === "Prompts").map(item => item.id).join(""), "abf");
    const merged = sample();
    N.renameGroup(merged, "Work", "Claude");
    equal("groups: renaming onto another name merges", ids(N.groupNotes(merged).groups[0].notes), "abd");
    const deleted = sample();
    equal("groups: delete moves its notes", N.deleteGroup(deleted, "claude"), 3);
    check("groups: deleted notes are kept, ungrouped", deleted.length === 7 && ["a", "b", "f"].every(id => !("group" in deleted.find(item => item.id === id))));
    equal("groups: deleting leaves the others", N.groupNames(deleted).join(","), "Work");
    equal("groups: a blank name renames nothing", N.renameGroup(sample(), "  ", "X"), 0);

    // Game notes (1.11.1)
    const linked = (id, game, updated) => ({ id, title: id, content: "", game, updated });
    check("game key: letters and digits from any script", N.isGameKey("zelda2") && N.isGameKey("ゼルダ"));
    check("game key: not punctuation, empty, too long or not text", !N.isGameKey("a b") && !N.isGameKey("") && !N.isGameKey("g".repeat(161)) && !N.isGameKey(7));
    equal("game key: 160 characters is the limit", N.isGameKey("g".repeat(160)), true);
    equal("game note: found by key", N.findGameNote([linked("a", "one", "1"), linked("b", "two", "1")], "two")?.id, "b");
    equal("game note: none for another game", N.findGameNote([linked("a", "one", "1")], "two"), null);
    equal("game note: an unlinked note never matches", N.findGameNote([{ id: "a", updated: "1" }], undefined), null);
    equal("game note: of two, the one updated last", N.findGameNote([linked("a", "one", "2026-01-01"), linked("b", "one", "2026-02-01"), linked("c", "one", "2025-01-01")], "one")?.id, "b");
    const links = [linked("a", "ok", "1"), linked("b", "not ok", "1"), linked("c", 7, "1"), { id: "d" }];
    equal("game links: bad ones dropped and counted", N.cleanGameLinks(links), 2);
    equal("game links: good ones kept", json(links.map(item => item.game ?? null)), json(["ok", null, null, null]));
    equal("game links: a second pass drops nothing", N.cleanGameLinks(links), 0);
    equal("game note title: tidied", N.gameNoteTitle(" A\tB\n  C\x7f "), "A B C");
    equal("game note title: capped", N.gameNoteTitle("t".repeat(300)).length, 160);
    equal("stamp: in an empty note", N.appendStamp("", "Now"), "### Now\n");
    equal("stamp: after text", N.appendStamp("text", "Now"), "text\n\n### Now\n");
    equal("stamp: after a line", N.appendStamp("text\n", "Now"), "text\n\n### Now\n");
    equal("stamp: after a gap", N.appendStamp("text\n\n", "Now"), "text\n\n### Now\n");
    equal("stamp: is a heading in the preview", N.parseMarkdown(N.appendStamp("text", "Now"))[1].type, "h3");
    equal("stamp: isn't a tag", json(N.extractTags(N.appendStamp("", "Nov 8, 2026"))), json([]));

    equal("groups: palette label", `${N.groupedLabel(gnote("a", "Claude"), "Bug")}|${N.groupedLabel(gnote("b"), "Bug")}`, "Claude › Bug|Bug");
    check("groups: the filter matches the group name", N.matchesNoteQuery(gnote("a", "Claude"), "claude") && !N.matchesNoteQuery(gnote("b", "Work"), "claude"));
    const P = globalThis.ASCSPalette;
    const ranked = P.rankItems([
        { id: "1", label: N.groupedLabel(gnote("a", "Claude"), "Bug") },
        { id: "2", label: N.groupedLabel(gnote("b", "Claude"), "Feature") },
        { id: "3", label: N.groupedLabel(gnote("c"), "Bug report") }
    ], "cl bug");
    equal("groups: palette \"cl bug\" finds Claude › Bug first", ranked[0]?.id, "1");
    check("groups: palette \"cl bug\" leaves out other Claude notes", !ranked.some(item => item.id === "2"));
})();
