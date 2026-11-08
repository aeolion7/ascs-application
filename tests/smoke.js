// Smoke test (1.9.0): the real page (frontend\index.html, every module and
// stylesheet) with a stand-in for WebView2, loaded by run-tests.ps1 before the
// page's own scripts. It opens every view and fails on any script error or
// unhandled rejection, and on any message the page sends that isn't in
// ASCS.ahk's allowlist (window.SMOKE_ALLOWLIST, written by run-tests.ps1).
(() => {
    const errors = [];
    const sent = new Set();
    window.addEventListener("error", event => {
        errors.push(`${event.message} (${String(event.filename || "").split("/").pop()}:${event.lineno})`);
    });
    window.addEventListener("unhandledrejection", event => {
        errors.push(`Unhandled rejection: ${event.reason?.message || event.reason}`);
    });
    window.chrome = window.chrome || {};
    window.chrome.webview = {
        postMessage: message => sent.add(String(message).split("\n")[0]),
        addEventListener() {},
        removeEventListener() {}
    };

    function report(checks) {
        const failed = checks.filter(([, problems]) => problems.length);
        const lines = [`PASS ${checks.length - failed.length} FAIL ${failed.length}`];
        failed.forEach(([name, problems]) => lines.push(`${name}: ${problems.join("; ")}`));
        const pre = document.createElement("pre");
        pre.id = "results";
        pre.textContent = lines.join("\n");
        document.body.append(pre);
    }

    window.addEventListener("load", () => setTimeout(() => {
        const checks = [["the page loads without errors", errors.splice(0)]];
        const views = [...new Set([...document.querySelectorAll("[data-view]")].map(node => node.dataset.view))];
        checks.push(["every view is reachable", views.length >= 9 ? [] : [`only ${views.length} views found`]]);
        views.forEach(view => {
            try {
                navigate(view);
            } catch (error) {
                errors.push(error.message);
            }
            const shown = document.getElementById(view)?.classList.contains("active");
            const titled = (document.getElementById("breadcrumb")?.textContent || "").trim() !== "";
            checks.push([`the ${view} view opens`, [...errors.splice(0), ...(shown ? [] : ["not shown"]), ...(titled ? [] : ["no breadcrumb title"])]]);
        });
        setTimeout(() => {
            checks.push(["no errors after opening the views", errors.splice(0)]);
            const allowed = new Set(window.SMOKE_ALLOWLIST || []);
            checks.push(["the allowlist was read", allowed.size >= 50 ? [] : [`only ${allowed.size} message types`]]);
            checks.push(["every message sent is allowlisted", [...sent].filter(type => !allowed.has(type)).map(type => `${type} isn't allowlisted`)]);

            // 1.9.1: rules and rendering the unit tests can't see.
            navigate("games");
            const shelf = getComputedStyle(document.querySelector(".games-continue"));
            const px = value => parseFloat(value) || 0;
            checks.push(["Continue playing has room for a hovered, focused tile",
                px(shelf.paddingTop) >= 6 && px(shelf.paddingLeft) >= 4 && px(shelf.paddingRight) >= 4 ? [] : [`padding ${shelf.padding}`]]);
            checks.push(["its tiles stay lined up with the page",
                px(shelf.marginTop) === -px(shelf.paddingTop) && px(shelf.marginLeft) === -px(shelf.paddingLeft) ? [] : [`margin ${shelf.margin}, padding ${shelf.padding}`]]);
            const fillOf = className => {
                const bar = document.createElement("span");
                bar.className = className;
                const fill = bar.appendChild(document.createElement("b"));
                document.body.append(bar);
                const paint = getComputedStyle(fill).backgroundImage;
                bar.remove();
                return paint;
            };
            checks.push(["a mastered bar is painted differently", fillOf(Games.raBarClass(true)) !== fillOf(Games.raBarClass(false)) ? [] : ["same paint"]]);
            navigate("sounds");
            handleStartupSounds({ signin: [{ weight: 100, file: "a.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false }], shutdown: null, taskWarning: "Test warning" });
            checks.push(["Sounds > Startup shows the sign-in task warning",
                document.querySelector("#soundStartup .startup-task-warning")?.textContent === "Test warning" ? [] : ["not shown"]]);
            handleStartupSounds({ signin: [{ weight: 100, file: "a.wav", id: "a.wav", origin: "a.wav", exists: true, changed: false }], shutdown: null, taskWarning: "" });
            checks.push(["and shows none when all is well", document.querySelector("#soundStartup .startup-task-warning") ? ["still shown"] : []]);
            navigate("dashboard");
            handleWebMessage({ data: { type: "signInHistory", items: [{ time: "2026-11-08T10:28:15", retrobar: 4937, taskbar: 2515, apps: 5171, keychron: 5515, sound: "<b>x</b>" }, { retrobar: "junk" }] } });
            checks.push(["System Dashboard compares sign-ins",
                document.querySelectorAll("#signInHistory .signin-row").length === 1 && !document.querySelector("#signInHistory b b") ? [] : ["wrong rows"]]);
            checks.push(["no errors from the 1.9.1 checks", errors.splice(0)]);
            report(checks);
        }, 800);
    }, 300));
})();
