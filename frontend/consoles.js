"use strict";

// The console hub (2.9.0), Games › Consoles: what Maestro says about payloads,
// a Switch in RCM mode and console SD cards, as text and numbers. This file
// only reads Maestro's plain data; consolesview.js puts it on screen.
globalThis.MaestroConsoles = (() => {
    const KINDS = Object.freeze([
        { id: "switch", name: "Nintendo Switch", links: [["hekate", "hekate releases"], ["atmosphere", "Atmosphère releases"]] },
        { id: "3ds", name: "Nintendo 3DS", links: [["luma", "Luma3DS releases"]] },
        { id: "wiiu", name: "Wii U", links: [["aroma", "Aroma"]] }
    ]);
    const text = (value, most = 260) => (typeof value === "string" ? value.slice(0, most) : "");
    const count = value => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
    const stampOk = value => /^\d{14}$/.test(text(value)) ? value : "";

    // Only what's expected, in the shape the rest of this file reads.
    function clean(state) {
        const payloads = (Array.isArray(state?.payloads) ? state.payloads : []).slice(0, 40).map(item => ({
            name: text(item?.name, 120), folder: text(item?.folder), size: count(item?.size), time: stampOk(item?.time), version: /^\d\.\d\.\d$/.test(text(item?.version)) ? item.version : ""
        })).filter(item => item.name);
        const selected = Number.isInteger(state?.selected) && state.selected >= 1 && state.selected <= payloads.length ? state.selected : 0;
        const cards = (Array.isArray(state?.cards) ? state.cards : []).slice(0, 26).map(card => ({
            drive: /^[A-Z]$/.test(text(card?.drive)) ? card.drive : "",
            kind: KINDS.some(kind => kind.id === card?.kind) ? card.kind : "",
            label: text(card?.label, 40), free: count(card?.free), total: count(card?.total), copied: count(card?.copied),
            versions: (Array.isArray(card?.versions) ? card.versions : []).slice(0, 4).map(pair => ({ name: text(pair?.name, 40), version: text(pair?.version, 20) })).filter(pair => pair.name)
        })).filter(card => card.drive && card.kind);
        const updated = Object.fromEntries(KINDS.map(kind => [kind.id, /^\d{4}-\d\d-\d\d$/.test(text(state?.updated?.[kind.id])) ? state.updated[kind.id] : ""]));
        const album = state?.album?.running === true
            ? { running: true, done: count(state.album.done), total: count(state.album.total), drive: text(state.album.drive, 1) }
            : { running: false, done: 0, total: 0, drive: "" };
        return {
            sender: state?.sender === true, rcm: state?.rcm === true, pushing: state?.pushing === true,
            payloads, selected, autoPush: selected > 0 && state?.autoPush === true,
            folder: text(state?.folder), cards, updated, album, albumFolder: text(state?.albumFolder)
        };
    }

    // "126 KB", "1.0 MB".
    function sizeText(bytes) {
        const value = count(bytes);
        return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
    }

    // A yyyyMMddHHmmss time as "Nov 8, 2026".
    function dateText(stamp) {
        const parts = /^(\d{4})(\d\d)(\d\d)/.exec(text(stamp));
        if (!parts) return "";
        return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    // One line for a payload: what it is, how big, when it was made.
    function payloadDetail(item) {
        return [item.version ? `hekate ${item.version}` : "", sizeText(item.size), dateText(item.time)].filter(Boolean).join(" · ");
    }

    const kindName = id => KINDS.find(kind => kind.id === id)?.name ?? "";

    // MB from Windows, as "12.3 GB free of 59.5 GB", and how full in percent.
    function cardSpace(card) {
        const gb = mb => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);
        const used = card.total > 0 ? Math.min(100, Math.max(0, (card.total - card.free) / card.total * 100)) : 0;
        return { text: card.total ? `${gb(card.free)} free of ${gb(card.total)}` : "", used };
    }

    function versionsText(versions) {
        return versions.map(pair => (pair.version ? `${pair.name} ${pair.version}` : pair.name)).join(" · ");
    }

    function rcmText(state) {
        if (!state.sender) return "TegraRcmGUI isn't installed";
        if (state.pushing) return "Sending…";
        return state.rcm ? "Switch in RCM mode: connected" : "No Switch in RCM mode";
    }

    function albumText(album) {
        return album.running ? `Copying the album: ${album.done} of ${album.total}` : "";
    }

    // Base64 to bytes, and bytes to hex.
    function bytesOf(base64) {
        try {
            const raw = atob(base64);
            return Uint8Array.from(raw, character => character.charCodeAt(0));
        } catch {
            return null;
        }
    }

    const hex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");

    return { KINDS, clean, sizeText, dateText, payloadDetail, kindName, cardSpace, versionsText, rcmText, albumText, bytesOf, hex };
})();
