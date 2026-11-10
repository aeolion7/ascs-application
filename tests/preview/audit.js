"use strict";
// Measures what's on screen in a preview scene (2.0.0): text sizes, contrast,
// line lengths, how clearly controls look like controls, and how the page uses
// the window's width. Writes JSON into <pre id="auditResult"> for preview.ps1.
globalThis.PreviewAudit = (scene, pageErrors) => {
    const parse = text => {
        const m = /rgba?\(([^)]+)\)/.exec(text || "");
        if (!m) return null;
        const p = m[1].split(/[ ,/]+/).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (top, under) => {
        const a = top.a + under.a * (1 - top.a);
        if (!a) return { r: 0, g: 0, b: 0, a: 0 };
        const mix = key => (top[key] * top.a + under[key] * under.a * (1 - top.a)) / a;
        return { r: mix("r"), g: mix("g"), b: mix("b"), a };
    };
    const luminance = c => {
        const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    // The solid colors behind an element. A gradient or image counts as unknown.
    const background = node => {
        const layers = [];
        for (let at = node; at; at = at.parentElement) {
            const style = getComputedStyle(at);
            // A gradient counts as the average of its stops, over what's under it.
            if (style.backgroundImage !== "none") {
                if (style.backgroundImage.includes("url(")) return null;
                const stops = (style.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
                if (stops.length) {
                    const mean = key => stops.reduce((sum, stop) => sum + stop[key], 0) / stops.length;
                    layers.push({ r: mean("r"), g: mean("g"), b: mean("b"), a: mean("a") });
                }
            }
            const color = parse(style.backgroundColor);
            if (color && color.a > 0) { layers.push(color); if (color.a >= 1) break; }
        }
        let result = { r: 13, g: 15, b: 24, a: 1 };
        layers.reverse().forEach(layer => { result = over(layer, result); });
        return result;
    };
    const visible = node => {
        const box = node.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return false;
        for (let at = node; at; at = at.parentElement) {
            const style = getComputedStyle(at);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        }
        return true;
    };
    const label = node => {
        const id = node.id ? `#${node.id}` : "";
        const cls = typeof node.className === "string" && node.className ? `.${node.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
        return `${node.tagName.toLowerCase()}${id}${cls}`;
    };

    const dialogOpen = [...document.querySelectorAll("[role=dialog], .launcher, #logsDialog, #confirmDialog, #powerTray")].find(node => !node.hidden && visible(node));
    const root = document.querySelector(".view.active");
    const scope = dialogOpen ? [dialogOpen] : [root, document.querySelector(".top-bar") || document.querySelector("header"), document.querySelector(".sidebar") || document.querySelector("aside")].filter(Boolean);

    const sizes = {};
    const small = {};
    const lowContrast = {};
    let contrastChecked = 0, contrastFailed = 0, unknownBackground = 0;
    let longestLine = 0, longestLineAt = "";
    scope.forEach(area => {
        const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            const value = text.textContent.trim();
            const owner = text.parentElement;
            if (!value || !owner || seen.has(owner) || !visible(owner)) continue;
            if (["SCRIPT", "STYLE", "OPTION", "DATALIST", "TEXTAREA"].includes(owner.tagName)) continue;
            if (owner.closest("svg")) continue;
            seen.add(owner);
            const style = getComputedStyle(owner);
            const px = parseFloat(style.fontSize);
            const key = String(Math.round(px * 10) / 10);
            sizes[key] = (sizes[key] || 0) + value.length;
            if (px < 17) {
                const name = `${label(owner)} (${key}px)`;
                if (!small[name]) small[name] = value.slice(0, 40);
            }
            const fore = parse(style.color);
            const back = background(owner);
            // Text filled by a gradient (the gold name) has no color of its own to compare.
            if (fore && fore.a === 0) unknownBackground++;
            else if (fore && back) {
                const shown = over(fore, back);
                const value2 = ratio(shown, back);
                contrastChecked++;
                const large = px >= 24 || (px >= 18.66 && Number(style.fontWeight) >= 700);
                if (value2 < (large ? 3 : 4.5)) {
                    contrastFailed++;
                    const name = `${label(owner)} (${value2.toFixed(1)}:1)`;
                    if (!lowContrast[name]) lowContrast[name] = value.slice(0, 40);
                }
            } else unknownBackground++;
            // Characters on one line of a block of running text.
            if (value.length > 60 && style.display !== "inline") {
                const lines = Math.max(1, Math.round(owner.getBoundingClientRect().height / (parseFloat(style.lineHeight) || px * 1.4)));
                const perLine = Math.round(value.length / lines);
                if (perLine > longestLine) { longestLine = perLine; longestLineAt = label(owner); }
            }
        }
    });

    // Controls: can you tell it's one, can you hit it, and does focus show?
    const controls = [...new Set(scope.flatMap(area => [...area.querySelectorAll("button, a[href], select, input:not([type=hidden]), textarea, [role=button], [tabindex='0']")]))].filter(visible);
    const looks = {};
    const looksLikeText = {};
    const tiny = {};
    let noFocus = 0;
    const noFocusNames = {};
    controls.forEach(node => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        const fill = parse(style.backgroundColor);
        const hasFill = (fill && fill.a > 0.02) || style.backgroundImage !== "none";
        const hasBorder = parseFloat(style.borderTopWidth) > 0 && (parse(style.borderTopColor)?.a ?? 0) > 0.05;
        if (node.matches("button, [role=button], a[href]")) {
            const key = [hasFill ? "fill" : "nofill", hasBorder ? "border" : "noborder", `r${Math.round(parseFloat(style.borderTopLeftRadius) || 0)}`, `h${Math.round(box.height)}`, `f${Math.round(parseFloat(style.fontSize))}`].join(" ");
            looks[key] = (looks[key] || 0) + 1;
            if (!hasFill && !hasBorder) {
                const name = label(node);
                if (!looksLikeText[name]) looksLikeText[name] = (node.textContent || node.getAttribute("aria-label") || "").trim().slice(0, 40);
            }
        }
        if (box.height < 24 || box.width < 24) tiny[`${label(node)} (${Math.round(box.width)}x${Math.round(box.height)})`] = (node.textContent || node.getAttribute("aria-label") || "").trim().slice(0, 30);
    });
    controls.slice(0, 80).forEach(node => {
        const before = getComputedStyle(node);
        const was = `${before.outlineStyle}|${before.outlineWidth}|${before.boxShadow}|${before.borderTopColor}`;
        const had = document.activeElement;
        node.focus({ preventScroll: true });
        if (document.activeElement === node) {
            const now = getComputedStyle(node);
            if (`${now.outlineStyle}|${now.outlineWidth}|${now.boxShadow}|${now.borderTopColor}` === was) {
                noFocus++;
                noFocusNames[label(node)] = true;
            }
        }
        if (had && had !== document.body) had.focus({ preventScroll: true }); else node.blur();     // leaves no ring in the screenshot
    });
    // Text centered in its control (2.0.0): the space from the top of the box to
    // the top of a capital, against the space from the baseline to the bottom.
    // A positive number sits high. Menus draw their own text, centered in the
    // content box, so theirs is worked out from the font's own metrics.
    const offCenter = {};
    const measure = document.createElement("canvas").getContext("2d");
    const centerTargets = scope.flatMap(area => [...area.querySelectorAll("button, select, kbd, [role=tab], .launcher-option-action, .badge, .chip, .pill")]);
    [...new Set(centerTargets)].filter(visible).forEach(node => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        if (box.height > 80 || box.height < 14) return;
        // Measured at 100 px and scaled, since the canvas rounds to whole pixels.
        const metricsOf = owner => {
            const own = getComputedStyle(owner);
            measure.font = `${own.fontStyle} ${own.fontWeight} 100px ${own.fontFamily}`;
            const at100 = measure.measureText("H");
            const scale = parseFloat(own.fontSize) / 100;
            return {
                fontBoundingBoxAscent: at100.fontBoundingBoxAscent * scale,
                fontBoundingBoxDescent: at100.fontBoundingBoxDescent * scale,
                actualBoundingBoxAscent: at100.actualBoundingBoxAscent * scale
            };
        };
        let top, metrics;
        if (node.tagName === "SELECT") {
            metrics = metricsOf(node);
            const inner = box.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            top = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + (inner - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
        } else {
            // Only a control's own words, and only on one line.
            const words = [...node.querySelectorAll("*"), node].flatMap(owner => [...owner.childNodes]).filter(child => child.nodeType === 3 && child.textContent.trim());
            if (words.length !== 1 || node.querySelector("button, select, input")) return;
            const range = document.createRange();
            range.selectNodeContents(words[0]);
            const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
            if (rects.length !== 1) return;
            metrics = metricsOf(words[0].parentElement);
            top = rects[0].top + (rects[0].height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
        }
        const baseline = top + metrics.fontBoundingBoxAscent;
        const capTop = baseline - metrics.actualBoundingBoxAscent;
        // A key drawn with a deeper bottom edge centers its text on the face above it.
        const edge = parseFloat(style.borderBottomWidth) - parseFloat(style.borderTopWidth);
        const off = Math.round(((box.bottom - edge - baseline) - (capTop - box.top)) * 10) / 10;
        // This reads about 1 px more than the screen shows (the renderer rounds
        // the font's metrics to whole pixels), so 2.5 means 1.5 on screen.
        if (Math.abs(off) > 2.5) {
            const name = `${label(node)} "${(node.textContent || "").trim().slice(0, 24)}"`;
            if (!(name in offCenter)) offCenter[name] = `${off} at ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)} in ${style.fontFamily.split(",")[0]}`;
        }
    });
    // Text cut off by its box, the first thing larger type can break.
    const clipped = {};
    scope.forEach(area => area.querySelectorAll("*").forEach(node => {
        if (!visible(node) || !node.textContent.trim() || node.closest("svg")) return;
        const style = getComputedStyle(node);
        const wide = style.overflowX !== "visible" && style.overflowX !== "auto" && style.overflowX !== "scroll" && node.scrollWidth > node.clientWidth + 1;
        const tall = style.overflowY !== "visible" && style.overflowY !== "auto" && style.overflowY !== "scroll" && node.scrollHeight > node.clientHeight + 1;
        if (wide || tall) clipped[`${label(node)} (${wide ? "wide" : "tall"})`] = node.textContent.trim().slice(0, 40);
    }));
    // A module holding more than its square (2.0.0), by how many pixels.
    const overfull = {};
    document.querySelectorAll(".view.active [data-module], .view.active .module").forEach(node => {
        if (!visible(node)) return;
        const extra = node.scrollHeight - node.clientHeight;
        let children = 0;
        // A part of it that clips, not one that scrolls by design.
        [...node.children].forEach(child => { if (visible(child) && !/auto|scroll/.test(getComputedStyle(child).overflowY)) children = Math.max(children, child.scrollHeight - child.clientHeight); });
        if (extra > 1 || children > 1) overfull[`${label(node)}${node.closest("[data-module]") ? ` in ${node.closest("[data-module]").dataset.module}` : ""}`] = Math.max(extra, children);
    });
    const pageOverflow = document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll(".view.active")].some(node => node.scrollWidth > node.clientWidth + 1);
    // Text spilling out of its box into whatever is next to it.
    const spilling = {};
    scope.forEach(area => area.querySelectorAll("*").forEach(node => {
        if (!visible(node) || node.children.length || !node.textContent.trim() || node.closest("svg")) return;
        const style = getComputedStyle(node);
        if (style.overflowX === "visible" && style.display !== "inline" && node.scrollWidth > node.clientWidth + 1) spilling[label(node)] = node.textContent.trim().slice(0, 40);
    }));
    const overflowing = {};
    if (root) {
        const edge = root.getBoundingClientRect().right;
        root.querySelectorAll("*").forEach(node => {
            if (!visible(node)) return;
            const box = node.getBoundingClientRect();
            if (box.right <= edge + 1) return;
            for (let at = node.parentElement; at && at !== root; at = at.parentElement) {
                if (getComputedStyle(at).overflowX !== "visible") return;
            }
            overflowing[label(node)] = Math.round(box.right - edge);
        });
    }
    // What actually scrolls vertically, and by how much.
    const scrolling = {};
    for (let at = root; at; at = at.parentElement) {
        const extra = at.scrollHeight - at.clientHeight;
        if (extra > 1 && getComputedStyle(at).overflowY !== "hidden") scrolling[label(at)] = extra;
    }
    const pointerOnly = {};
    scope.forEach(area => area.querySelectorAll("div, span, li, article, section, svg, i, b, strong").forEach(node => {
        if (!visible(node) || getComputedStyle(node).cursor !== "pointer") return;
        if (node.closest("button, a, label, select, input, [role=button], [tabindex]")) return;
        const parentPointer = node.parentElement && getComputedStyle(node.parentElement).cursor === "pointer";
        if (!parentPointer) pointerOnly[label(node)] = (node.textContent || "").trim().slice(0, 30);
    }));

    // How the page uses the window's width.
    let contentLeft = Infinity, contentRight = 0, contentBottom = 0;
    if (root) root.querySelectorAll("*").forEach(node => {
        if (!visible(node) || !node.children.length && !node.textContent.trim()) return;
        const box = node.getBoundingClientRect();
        contentLeft = Math.min(contentLeft, box.left);
        contentRight = Math.max(contentRight, box.right);
        contentBottom = Math.max(contentBottom, box.bottom + (document.scrollingElement?.scrollTop || 0));
    });
    const sidebar = document.querySelector(".sidebar, aside");
    const sideWidth = sidebar ? sidebar.getBoundingClientRect().width : 0;
    const result = {
        scene, width: innerWidth, height: innerHeight, pageErrors,
        pageScroll: Math.max(0, document.scrollingElement.scrollHeight - innerHeight),
        // What reaches lowest on the page, margins included, for a page that scrolls.
        lowest: [...document.querySelectorAll(".main, .main *")].filter(n => n.getClientRects().length).map(n => {
            const style = getComputedStyle(n);
            return [Math.round(n.getBoundingClientRect().bottom + document.scrollingElement.scrollTop + parseFloat(style.marginBottom || 0) + (n.matches(".main, .view") ? 0 : 0)), `${n.tagName.toLowerCase()}#${n.id}.${String(n.className).split(" ").join(".")} pb ${style.paddingBottom} mb ${style.marginBottom} mh ${style.minHeight}`];
        }).sort((a, b) => b[0] - a[0]).slice(0, 6),
        innerScroll: [...document.querySelectorAll(".view.active *")].filter(n => /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1).map(n => `${n.id || n.className}: ${n.clientHeight} of ${n.scrollHeight}`), shift: globalThis.PreviewShift ?? null,
        sizes, small, contrastChecked, contrastFailed, unknownBackground, lowContrast,
        longestLine, longestLineAt,
        clipped, overfull, pageOverflow, overflowing, spilling, scrolling, controls: controls.length, offCenter, looks, looksLikeText, tiny, noFocus, noFocusNames: Object.keys(noFocusNames), pointerOnly,
        sideWidth: Math.round(sideWidth), contentLeft: Math.round(contentLeft), contentRight: Math.round(contentRight), contentBottom: Math.round(contentBottom)
    };
    const pre = document.createElement("pre");
    pre.id = "auditResult";
    pre.style.display = "none";
    pre.textContent = JSON.stringify(result);
    document.body.append(pre);
};
