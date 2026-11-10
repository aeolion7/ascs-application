"use strict";

// Pure command-palette logic: matching, ranking, and the inline calculator.
// No DOM access, so tests/palette.tests.html can exercise it directly.
(function (global) {
    const normalize = text => String(text ?? "").toLocaleLowerCase().normalize("NFKD")
        .replace(/[̀-ͯ]/g, "");

    // Scores how well one query token matches text: prefix 100, word start 80,
    // substring 60, in-order subsequence up to 30; 0 when there is no match.
    function scoreToken(token, text, fuzzy = true) {
        if (!token) return 1;
        if (!text) return 0;
        if (text.startsWith(token)) return 100;
        const index = text.indexOf(token);
        if (index > 0) {
            return /[\s\-_./\\:·]/.test(text[index - 1]) ? 80 : 60;
        }
        if (!fuzzy || token.length < 2) return 0;
        // Initials: "wt" matches "Windows Terminal".
        const initials = text.split(/[\s\-_./\\:·]+/).filter(Boolean).map(word => word[0]).join("");
        if (initials.startsWith(token)) return 70;
        let position = -1;
        let gaps = 0;
        for (const char of token) {
            const next = text.indexOf(char, position + 1);
            if (next === -1) return 0;
            if (position >= 0) gaps += next - position - 1;
            position = next;
        }
        if (gaps > token.length * 3) return 0;
        return Math.max(5, 30 - gaps);
    }

    // Every whitespace-separated token must match the label or the extra
    // search text; label matches weigh more. Returns 0 when any token fails.
    function scoreMatch(query, label, extra = "") {
        const tokens = normalize(query).split(/\s+/).filter(Boolean);
        if (!tokens.length) return 1;
        const labelText = normalize(label);
        const extraText = normalize(extra);
        let total = 0;
        for (const token of tokens) {
            // Fuzzy (subsequence) matching applies to labels only; keywords and
            // descriptions must contain the token, which keeps results focused.
            const best = Math.max(scoreToken(token, labelText), scoreToken(token, extraText, false) * 0.6);
            if (best <= 0) return 0;
            total += best;
        }
        return total / tokens.length;
    }

    // Usage boost: frequently and recently used items rank higher.
    function usageBoost(usage, now = Date.now()) {
        if (!usage || !usage.count) return 0;
        const ageHours = Math.max(0, (now - (usage.last || 0)) / 3600000);
        const recency = ageHours < 1 ? 25 : ageHours < 24 ? 15 : ageHours < 168 ? 6 : 0;
        return Math.min(25, Math.log2(usage.count + 1) * 6) + recency;
    }

    // Ranks items for a query. Items need {id, label, keywords?, weight?}.
    function rankItems(items, query, usageMap = {}, now = Date.now()) {
        return items
            .map((item, order) => {
                const match = scoreMatch(query, item.label, `${item.keywords ?? ""} ${item.description ?? ""}`);
                return { item, order, score: match ? match + (item.weight ?? 0) + usageBoost(usageMap[item.id], now) : 0 };
            })
            .filter(entry => entry.score > 0)
            .sort((left, right) => right.score - left.score || left.order - right.order)
            .map(entry => entry.item);
    }

    // Most recently used ids that still exist, newest first.
    function recentIds(usageMap, limit = 5) {
        return Object.entries(usageMap || {})
            .filter(([, usage]) => usage && usage.last)
            .sort((left, right) => right[1].last - left[1].last)
            .slice(0, limit)
            .map(([id]) => id);
    }

    function recordUsage(usageMap, id, now = Date.now()) {
        const next = { ...(usageMap || {}) };
        const previous = next[id] || { count: 0, last: 0 };
        next[id] = { count: previous.count + 1, last: now };
        const ids = Object.keys(next);
        if (ids.length > 200) {
            ids.sort((left, right) => next[left].last - next[right].last)
                .slice(0, ids.length - 200)
                .forEach(stale => delete next[stale]);
        }
        return next;
    }

    // ------------------------------------------------------------ calculator

    const FUNCTIONS = {
        sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor,
        ceil: Math.ceil, ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan
    };
    const CONSTANTS = { pi: Math.PI, e: Math.E };

    // Tokens, or { error } saying what isn't understood. "x" between values
    // multiplies, "$" is ignored, "mod" is the remainder, and "%" after a value
    // is a percent (2.0.0; it used to be the remainder).
    function tokenize(source) {
        const tokens = [];
        const text = source.replace(/×/g, "*").replace(/÷/g, "/").replace(/[,$]/g, "");
        let index = 0;
        while (index < text.length) {
            const char = text[index];
            if (/\s/.test(char)) { index++; continue; }
            const number = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(text.slice(index));
            if (number) {
                tokens.push({ type: "num", value: Number(number[0]) });
                index += number[0].length;
                continue;
            }
            if (/x/i.test(char) && !/[a-z]/i.test(text[index + 1] ?? "")) {
                tokens.push({ type: "op", value: "*" });
                index++;
                continue;
            }
            const word = /^[a-z]+/i.exec(text.slice(index));
            if (word) {
                const name = word[0].toLowerCase();
                if (name in FUNCTIONS) tokens.push({ type: "fn", value: name });
                else if (name in CONSTANTS) tokens.push({ type: "num", value: CONSTANTS[name] });
                else if (name === "mod") tokens.push({ type: "op", value: "mod" });
                else return { error: `“${word[0]}” isn't something it can calculate.` };
                index += word[0].length;
                continue;
            }
            if ("+-*/%^()".includes(char)) {
                tokens.push({ type: "op", value: char });
                index++;
                continue;
            }
            return { error: `“${char}” isn't something it can calculate.` };
        }
        return tokens;
    }

    // Recursive-descent evaluation (no eval): + - * / ^, x for times, mod,
    // percents, parentheses, unary minus, functions such as sqrt(2), and the
    // constants pi and e. Returns { value } or { error } with a short reason.
    function calculate(source) {
        const tokens = tokenize(String(source ?? ""));
        if (tokens.error) return tokens;
        if (!tokens.length) return { error: "Type an expression." };
        let position = 0;
        const peek = () => tokens[position];
        const take = () => tokens[position++];
        const fail = reason => { throw new Error(reason); };
        const UNFINISHED = "Keep typing: the expression isn't finished.";
        const UNCLOSED = "A parenthesis isn't closed.";

        function primary() {
            const token = take();
            if (!token) fail(UNFINISHED);
            if (token.type === "num") return token.value;
            if (token.type === "fn") {
                if (take()?.value !== "(") fail(`Put what ${token.value} works on in parentheses, as in ${token.value}(2).`);
                const value = expression();
                if (take()?.value !== ")") fail(UNCLOSED);
                return FUNCTIONS[token.value](value);
            }
            if (token.value === "(") {
                const value = expression();
                if (take()?.value !== ")") fail(UNCLOSED);
                return value;
            }
            if (token.value === "-") return -power();
            if (token.value === "+") return power();
            fail(UNFINISHED);
        }
        function percent() {
            let value = primary();
            while (peek()?.value === "%") {
                take();
                value /= 100;
            }
            return value;
        }
        function power() {
            const base = percent();
            if (peek()?.value === "^") {
                take();
                return Math.pow(base, power());
            }
            return base;
        }
        function term() {
            let value = power();
            while (peek() && ["*", "/", "mod"].includes(peek().value)) {
                const operator = take().value;
                const right = power();
                value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
            }
            return value;
        }
        function expression() {
            let value = term();
            while (peek() && ["+", "-"].includes(peek().value)) {
                const operator = take().value;
                const right = term();
                value = operator === "+" ? value + right : value - right;
            }
            return value;
        }

        try {
            const value = expression();
            if (position !== tokens.length) return { error: peek()?.value === ")" ? "A parenthesis closes that wasn't opened." : "Put an operator between the numbers, such as * or x." };
            if (!Number.isFinite(value)) return { error: "That has no answer, such as a division by zero." };
            return { value };
        } catch (error) {
            return { error: error.message };
        }
    }

    function evaluateExpression(source) {
        const result = calculate(source);
        return "value" in result ? result.value : null;
    }

    // True when the query reads as arithmetic rather than a search: it has a
    // digit and an operator or function, and nothing that is not math.
    function looksLikeExpression(query) {
        const text = String(query ?? "").trim();
        if (text.startsWith("=")) return true;
        if (!/\d/.test(text)) return false;
        if (!/[+\-*/%^×÷()]|[\d.)]\s*x\s*[\d.(]|\b(sqrt|abs|round|floor|ceil|ln|log|sin|cos|tan|mod)\b/i.test(text)) return false;
        return /^[\d\s.,$+\-*/%^×÷()a-z]*$/i.test(text) && evaluateExpression(text) !== null;
    }

    // Typed as arithmetic but not yet an answer, such as "2 +" or "(4 x 3":
    // digits, an operator, and only the characters of math.
    function looksLikeUnfinishedMath(query) {
        const text = String(query ?? "").trim();
        return /\d/.test(text) && /[+\-*/%^×÷(]|\dx|x\d|\dx$/i.test(text.replace(/\s+/g, ""))
            && /^[\d\s.,$+\-*/%^×÷()x]*$/i.test(text) && evaluateExpression(text) === null;
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "";
        if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
        return String(Number(value.toPrecision(12)));
    }

    // Splits a raw query into a mode-relevant form: "=expr" (calculator),
    // "?text" (web search), "+text" (a calendar event), or plain text.
    function parseQuery(raw) {
        const text = String(raw ?? "");
        const trimmed = text.trim();
        if (trimmed.startsWith("=")) return { kind: "calc", text: trimmed.slice(1).trim() };
        if (trimmed.startsWith("?")) return { kind: "web", text: trimmed.slice(1).trim() };
        if (trimmed.startsWith("+")) return { kind: "event", text: trimmed.slice(1).trim() };
        if (looksLikeExpression(trimmed)) return { kind: "calc", text: trimmed };
        return { kind: "text", text: trimmed };
    }

    function isValidWorkspaceName(name) {
        const text = String(name ?? "").trim();
        return /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(text)
            && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(text);
    }

    global.ASCSPalette = {
        scoreMatch, usageBoost, rankItems, recentIds, recordUsage,
        calculate, evaluateExpression, looksLikeExpression, looksLikeUnfinishedMath, formatNumber, parseQuery, isValidWorkspaceName
    };
})(globalThis);
