"use strict";
// maestro drive (2.10.0): added to the page of an isolated copy before it loads,
// never to the app. It records what the page does for the run's report (errors,
// long tasks, intervals, animation frames, messages each way) and holds the
// channel the copy's hook polls: the runner asks with request(), the hook
// takes the requests and answers with reply().
(() => {
    if (window.__maestroDrive) return;
    const drive = window.__maestroDrive = {
        marks: { created: performance.now() },
        errors: [],
        longTasks: [],
        intervals: new Map(),
        timeouts: 0,
        frames: 0,
        sent: {},
        received: {},
        requests: [],
        replies: new Map(),
        nextId: 1
    };

    const trim = text => String(text ?? "").replace(/https:\/\/ascs\.localhost\//g, "").slice(0, 600);
    const caller = () => {
        const lines = String(new Error().stack ?? "").split("\n").map(line => line.trim()).filter(line => line.startsWith("at "));
        return trim(lines[2] ?? lines[lines.length - 1] ?? "");
    };
    const firstWord = message => {
        if (typeof message === "string") return message.split(/[\n|]/)[0].slice(0, 40);
        return String(message?.type ?? "?").slice(0, 40);
    };

    const realSetInterval = window.setInterval.bind(window);
    const realClearInterval = window.clearInterval.bind(window);
    const realSetTimeout = window.setTimeout.bind(window);
    const realFrame = window.requestAnimationFrame.bind(window);
    window.setInterval = (handler, ms, ...rest) => {
        const id = realSetInterval(handler, ms, ...rest);
        drive.intervals.set(id, { ms: Number(ms) || 0, at: caller(), since: Math.round(performance.now()) });
        return id;
    };
    window.clearInterval = id => {
        drive.intervals.delete(id);
        return realClearInterval(id);
    };
    window.setTimeout = (handler, ms, ...rest) => {
        drive.timeouts++;
        return realSetTimeout(handler, ms, ...rest);
    };
    window.requestAnimationFrame = callback => {
        drive.frames++;
        return realFrame(callback);
    };

    const note = (kind, parts) => drive.errors.push({ kind, at: Math.round(performance.now()), text: trim(parts.map(part => part?.stack ?? (typeof part === "object" ? JSON.stringify(part) : String(part))).join(" ")) });
    for (const level of ["error", "warn"]) {
        const real = console[level].bind(console);
        console[level] = (...parts) => {
            note(level, parts);
            real(...parts);
        };
    }
    window.addEventListener("error", event => note("uncaught", [event.error ?? event.message]));
    window.addEventListener("unhandledrejection", event => note("rejection", [event.reason]));
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) drive.longTasks.push({ start: Math.round(entry.startTime), ms: Math.round(entry.duration) });
        }).observe({ type: "longtask", buffered: true });
    } catch (error) {
        note("drive", ["Long tasks can't be observed: " + error]);
    }

    const webview = window.chrome?.webview;
    if (webview) {
        const realPost = webview.postMessage.bind(webview);
        const counted = message => {
            const word = firstWord(message);
            drive.sent[word] = (drive.sent[word] ?? 0) + 1;
            if (word === "Ready" && drive.marks.ready === undefined) drive.marks.ready = performance.now();
            return realPost(message);
        };
        try {
            Object.defineProperty(webview, "postMessage", { value: counted, configurable: true, writable: true });
        } catch (error) {
            note("drive", ["Messages to Maestro can't be counted: " + error]);
        }
        webview.addEventListener("message", event => {
            const word = firstWord(event.data);
            drive.received[word] = (drive.received[word] ?? 0) + 1;
        });
    }

    // The channel. Requests are tab-separated lines; values come back as text.
    drive.request = (kind, data = "") => new Promise(resolve => {
        const id = drive.nextId++;
        drive.replies.set(id, resolve);
        drive.requests.push(`${id}\t${kind}\t${String(data).replace(/[\t\r\n]+/g, " ")}`);
    });
    drive.send = (kind, data = "") => drive.requests.push(`0\t${kind}\t${String(data).replace(/[\t\r\n]+/g, " ")}`);
    drive.take = () => drive.requests.splice(0).join("\n");
    drive.reply = (id, value) => {
        const resolve = drive.replies.get(id);
        drive.replies.delete(id);
        resolve?.(value);
    };
})();
