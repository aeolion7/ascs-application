"use strict";
// maestro drive (2.10.0): the helpers a plan uses, run in the copy's page after
// it has loaded. A plan is `async function drivePlan(d)`; what it returns is
// written to the copy's drive\result.json. Every wait has a limit, so a plan
// that goes wrong ends with an error in the result rather than hanging.
(() => {
    const drive = window.__maestroDrive;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
    const round = value => Math.round(value * 10) / 10;

    const d = {
        wait,
        round,
        phase: "",
        // The next painted frame after a change.
        async paint() {
            await frame();
            await frame();
        },
        async until(test, ms = 5000, what = "a condition") {
            const end = performance.now() + ms;
            while (performance.now() < end) {
                if (test()) return true;
                await wait(50);
            }
            throw new Error(`Timed out after ${ms} ms waiting for ${what}.`);
        },
        $: selector => document.querySelector(selector),
        $$: selector => [...document.querySelectorAll(selector)],
        visible(element) {
            if (!element) return false;
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
        },
        click(target) {
            const element = typeof target === "string" ? document.querySelector(target) : target;
            if (!element) throw new Error(`Nothing to click: ${target}`);
            element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
            element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
            element.click();
            return element;
        },
        key(key, options = {}, target = document.activeElement ?? document.body) {
            const init = { key, bubbles: true, cancelable: true, ...options };
            target.dispatchEvent(new KeyboardEvent("keydown", init));
            target.dispatchEvent(new KeyboardEvent("keyup", init));
        },
        // Elements that spill out of their box sideways, or past the window.
        overflow(root = document.querySelector(".view.active") ?? document.body) {
            const found = [];
            const width = document.documentElement.clientWidth;
            for (const element of root.querySelectorAll("*")) {
                if (!d.visible(element)) continue;
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                const clips = /(auto|scroll|hidden|clip)/.test(style.overflowX);
                if (box.right > width + 1) found.push({ what: describe(element), past: Math.round(box.right - width) });
                else if (!clips && element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0 && style.textOverflow !== "ellipsis")
                    found.push({ what: describe(element), spill: element.scrollWidth - element.clientWidth });
                if (found.length >= 25) break;
            }
            return found;
        },
        counters() {
            return {
                at: performance.now(),
                longTasks: drive.longTasks.length,
                errors: drive.errors.length,
                timeouts: drive.timeouts,
                frames: drive.frames,
                sent: { ...drive.sent },
                received: { ...drive.received }
            };
        },
        // What happened since counters() was taken.
        since(start) {
            const tasks = drive.longTasks.filter(task => task.start + task.ms >= start.at);
            const diff = (now, then) => Object.fromEntries(Object.entries(now).map(([key, value]) => [key, value - (then[key] ?? 0)]).filter(([, value]) => value));
            return {
                ms: round(performance.now() - start.at),
                longTasks: tasks.length,
                longTaskMs: tasks.reduce((sum, task) => sum + task.ms, 0),
                longestTask: tasks.reduce((most, task) => Math.max(most, task.ms), 0),
                errors: drive.errors.slice(start.errors),
                timeouts: drive.timeouts - start.timeouts,
                frames: drive.frames - start.frames,
                sent: diff(drive.sent, start.sent),
                received: diff(drive.received, start.received)
            };
        },
        intervals() {
            return [...drive.intervals.values()].map(item => ({ ms: item.ms, at: item.at }));
        },
        heapMB() {
            const memory = performance.memory;
            return memory ? round(memory.usedJSHeapSize / 1048576) : null;
        },
        domNodes: () => document.getElementsByTagName("*").length,
        // Opens a page and measures it: to the first painted frame, then what
        // runs in the next `settle` ms (tasks, timers, frames, messages).
        async openView(view, settle = 1500) {
            const start = d.counters();
            navigate(view);
            await d.paint();
            const painted = round(performance.now() - start.at);
            await wait(settle);
            return { view, painted, ...d.since(start), heapMB: d.heapMB(), domNodes: d.domNodes(), intervals: d.intervals() };
        },
        // A tab inside the open page, by its button.
        async openTab(button, settle = 1000) {
            const start = d.counters();
            d.click(button);
            await d.paint();
            const painted = round(performance.now() - start.at);
            await wait(settle);
            return { tab: label(button), painted, ...d.since(start) };
        },
        tabs(root = document.querySelector(".view.active")) {
            return [...(root?.querySelectorAll('[role="tab"]') ?? [])].filter(button => d.visible(button));
        },
        // Requests the hook carries out.
        resize: (width, height) => drive.request("resize", `${width},${height}`),
        hide: () => drive.request("hide"),
        show: () => drive.request("show"),
        capture: name => drive.request("capture", name),
        memory: async () => {
            const text = await drive.request("memory");
            const [workingMB, privateMB, processes, cpuMs, cpuHostMs] = String(text).split(",").map(Number);
            return { workingMB, privateMB, processes, cpuMs, cpuHostMs };
        },
        hostTimes: async () => Object.fromEntries(String(await drive.request("times")).split(",").map(pair => pair.split("=")).map(([key, value]) => [key, Number(value)])),
        log: text => drive.send("log", text),
        async save(name, text) {
            for (let index = 0; index < text.length || index === 0; index += 20000)
                await drive.request("write", `${name}|${text.slice(index, index + 20000)}`);
        }
    };

    function label(element) {
        return (element.getAttribute("aria-label") || element.textContent || element.id || element.tagName).trim().replace(/\s+/g, " ").slice(0, 60);
    }
    function describe(element) {
        const id = element.id ? `#${element.id}` : "";
        const classes = [...element.classList].slice(0, 2).map(name => `.${name}`).join("");
        return `${element.tagName.toLowerCase()}${id}${classes}`;
    }

    window.__maestroDriveRun = async phase => {
        d.phase = phase;
        let result;
        try {
            result = { phase, ok: true, ...(await drivePlan(d)) };
        } catch (error) {
            result = { phase, ok: false, error: String(error?.stack ?? error) };
        }
        result.errorsAll = drive.errors;
        await d.save("result.json", JSON.stringify(result));
        drive.send("done", result.ok ? "ok" : "failed");
    };
})();
