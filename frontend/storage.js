"use strict";

// Storage (2.9.0): what Preferences says about Maestro's caches. This file
// only turns Maestro's plain data into text and numbers; app.js puts them on
// screen.
globalThis.MaestroStorage = (() => {
    const CACHES = [
        { id: "images", label: "RetroAchievements images", name: "RetroAchievements image cache", unit: ["image", "images"] },
        { id: "almanac", label: "Wikipedia almanac", name: "almanac cache", unit: ["feed", "feeds"] },
        { id: "forecast", label: "Forecast", name: "forecast cache", unit: ["file", "files"] }
    ];
    const LIMITS = [100, 250, 500, 1000];
    const MB = 1024 * 1024;

    const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

    // Only what's expected, in the shape the rest of this file reads.
    function clean(state) {
        const given = Array.isArray(state?.caches) ? state.caches : [];
        const caches = CACHES.map(cache => {
            const found = given.find(item => item?.id === cache.id) || {};
            return { ...cache, bytes: count(found.bytes), files: count(found.files), limit: count(found.limit) };
        });
        const limits = Array.isArray(state?.limits) ? state.limits.filter(value => LIMITS.includes(value)) : [];
        return {
            error: typeof state?.error === "string" ? state.error.slice(0, 200) : "",
            limitMB: LIMITS.includes(state?.limitMB) ? state.limitMB : 500,
            limits: limits.length ? limits : LIMITS,
            caches
        };
    }

    // "0 bytes", "812 KB", "10.4 MB", "1.2 GB": KB rounds to whole numbers.
    function formatBytes(bytes) {
        const value = count(bytes);
        if (value < 1024) return `${value} bytes`;
        if (value < MB) return `${Math.round(value / 1024)} KB`;
        if (value < 1024 * MB) return `${(value / MB).toFixed(1)} MB`;
        return `${(value / 1024 / MB).toFixed(1)} GB`;
    }

    const limitLabel = mb => (mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`);

    // One line per cache: its size, and for a cache with a limit, how full.
    function rows(state) {
        return clean(state).caches.map(cache => {
            const files = `${cache.files.toLocaleString("en-US")} ${cache.unit[cache.files === 1 ? 0 : 1]}`;
            const row = { id: cache.id, label: cache.label, name: cache.name, empty: cache.files === 0, percent: null };
            if (cache.limit) {
                row.percent = Math.min(100, cache.bytes / cache.limit * 100);
                row.detail = `${files} · ${formatBytes(cache.bytes)} of ${limitLabel(cache.limit / MB)}`;
            } else {
                row.detail = cache.files ? `${files} · ${formatBytes(cache.bytes)}` : "Empty";
            }
            return row;
        });
    }

    // What clearing a cache costs, for the confirmation.
    function clearMessage(id) {
        if (id === "images") return "Badges, game icons and your picture are downloaded again as they're shown.";
        if (id === "almanac") return "Today's Wikipedia feeds are downloaded again when the Today module next shows them.";
        return "The forecast is downloaded again when the Weather module next shows it.";
    }

    return { CACHES, LIMITS, clean, formatBytes, limitLabel, rows, clearMessage };
})();
