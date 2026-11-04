"use strict";

(function () {
    const P = globalThis.ASCSPalette;
    const { check, equal, close } = globalThis.TestHarness;

    // Calculator
    equal("precedence", P.evaluateExpression("2+3*4"), 14);
    equal("parentheses", P.evaluateExpression("(2+3)*4"), 20);
    equal("power is right-associative", P.evaluateExpression("2^3^2"), 512);
    equal("unary minus binds looser than ^", P.evaluateExpression("-2^2"), -4);
    equal("modulo", P.evaluateExpression("10%3"), 1);
    equal("sqrt", P.evaluateExpression("sqrt(16)"), 4);
    equal("thousands separators", P.evaluateExpression("1,000*2"), 2000);
    equal("× and ÷", P.evaluateExpression("2×3÷4"), 1.5);
    close("pi constant", P.evaluateExpression("pi"), Math.PI);
    equal("scientific notation", P.evaluateExpression("2e3/4"), 500);
    equal("division by zero is not a result", P.evaluateExpression("1/0"), null);
    equal("incomplete expression", P.evaluateExpression("2+"), null);
    equal("unknown word", P.evaluateExpression("abc"), null);
    equal("unbalanced parenthesis", P.evaluateExpression("(1+2"), null);
    equal("formatting removes float noise", P.formatNumber(0.1 + 0.2), "0.3");

    // Query parsing
    check("math detected", P.looksLikeExpression("18*1.2"));
    check("= forces calculator", P.parseQuery("=1").kind === "calc");
    check("plain words are not math", !P.looksLikeExpression("win 11"));
    check("words with digits are not math", !P.looksLikeExpression("2-factor"));
    equal("? starts a web search", P.parseQuery("?  cats ").kind, "web");
    equal("web query text", P.parseQuery("?  cats ").text, "cats");
    equal("text query", P.parseQuery(" term ").kind, "text");
    equal("+ starts a calendar event", P.parseQuery("+ Dentist tue 3pm").kind + " " + P.parseQuery("+ Dentist tue 3pm").text, "event Dentist tue 3pm");

    // Matching
    check("prefix match", P.scoreMatch("term", "Terminal") > 0);
    check("word-start match", P.scoreMatch("term", "Windows Terminal") > 0);
    check("initials match", P.scoreMatch("wt", "Windows Terminal") > 0);
    check("label subsequence match", P.scoreMatch("tmgr", "Task Manager") > 0);
    check("all tokens must match", P.scoreMatch("win xyz", "Windows Terminal") === 0);
    check("descriptions need real substrings (no fuzzy noise)",
        P.scoreMatch("git", "Windows Settings", "configuration control panel Open Windows system settings") === 0);
    check("keyword substring matches", P.scoreMatch("shell", "Windows Terminal", "console shell powershell") > 0);
    check("accents are ignored", P.scoreMatch("cafe", "Café notes") > 0);
    check("prefix outranks substring",
        P.scoreMatch("note", "Notes") > P.scoreMatch("note", "Quick Notes"));

    // Ranking and usage
    const items = [
        { id: "a", label: "Quick Notes" },
        { id: "b", label: "Notes archive" },
        { id: "c", label: "Calculator" }
    ];
    equal("ranking: prefix first", P.rankItems(items, "notes")[0].id, "b");
    equal("ranking: non-matches removed", P.rankItems(items, "notes").length, 2);
    let usage = {};
    for (let i = 0; i < 5; i++) usage = P.recordUsage(usage, "a", 1000 + i);
    equal("usage counted", usage.a.count, 5);
    equal("usage boost reorders", P.rankItems(items, "notes", usage, 2000)[0].id, "a");
    usage = P.recordUsage(usage, "c", 5000);
    equal("recent ids newest first", P.recentIds(usage).join(","), "c,a");
    let big = {};
    for (let i = 0; i < 205; i++) big = P.recordUsage(big, `id${i}`, i);
    equal("usage map is capped", Object.keys(big).length, 200);
    check("oldest usage dropped", !("id0" in big) && "id204" in big);

    // Workspace names (mirrors ValidateWorkspaceName in ASCS.Core.ahk)
    check("workspace name valid", P.isValidWorkspaceName("Coding 2"));
    check("workspace name with slash invalid", !P.isValidWorkspaceName("a/b"));
    check("workspace device name invalid", !P.isValidWorkspaceName("con"));
    check("workspace name too long", !P.isValidWorkspaceName("a".repeat(41)));

})();
