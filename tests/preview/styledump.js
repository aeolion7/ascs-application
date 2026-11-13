"use strict";
// For preview.ps1 -Styles (2.2.0): in place of the audit, every element's
// computed style (and its ::before, ::after and ::placeholder where it has
// one), hashed and keyed by its place in the page. compare-styles.ps1 compares
// two runs, to prove a stylesheet merge or removal changes nothing.
globalThis.PreviewAudit = async () => {
    // What moves on its own is settled first, so two runs differ only where the
    // styles do: fonts loaded, the keymap's labels fitted to them again, the
    // clock at one time, nothing focused, and the tab marker placed.
    await document.fonts.ready;
    document.querySelectorAll("#keymap svg").forEach(svg => {
        svg.querySelectorAll(".km-label, .km-caption").forEach(text => { text.style.fontSize = ""; });
        globalThis.fitKeyText?.(svg);
    });
    await new Promise(done => { requestAnimationFrame(() => requestAnimationFrame(done)); setTimeout(done, 100); });
    const clock = document.getElementById("topClock");
    if (clock) clock.textContent = "Wed, Nov 11 12:00 PM";
    document.activeElement?.blur();
    const hash = text => {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(36);
    };
    // Sorted: custom properties come back in no fixed order.
    const read = (node, pseudo) => {
        const style = getComputedStyle(node, pseudo);
        const out = [];
        for (let i = 0; i < style.length; i++) out.push(`${style[i]}:${style.getPropertyValue(style[i])}`);
        return out.sort().join(";");
    };
    const path = node => {
        const parts = [];
        for (let at = node; at && at !== document.documentElement; at = at.parentElement) {
            parts.unshift(`${at.tagName.toLowerCase()}${at.id ? `#${at.id}` : ""}[${at.parentElement ? [...at.parentElement.children].indexOf(at) : 0}]`);
        }
        return parts.join(">") || "html";
    };
    const lines = [];
    [document.documentElement, ...document.body.querySelectorAll("*")].forEach(node => {
        const where = path(node);
        lines.push(`${hash(read(node, null))} ${where}`);
        ["::before", "::after"].forEach(pseudo => {
            if (getComputedStyle(node, pseudo).content !== "none") lines.push(`${hash(read(node, pseudo))} ${where}${pseudo}`);
        });
        if (/^(INPUT|TEXTAREA)$/.test(node.tagName)) lines.push(`${hash(read(node, "::placeholder"))} ${where}::placeholder`);
    });
    const pre = document.createElement("pre");
    pre.id = "auditResult";
    pre.style.display = "none";
    pre.textContent = lines.join("\n");
    document.body.append(pre);
};
