"use strict";

// Pure chart geometry for the Dashboard's history sparklines. No DOM access.
(function (global) {
    // values: numbers 0-100 (oldest first); returns SVG path data for the
    // line and the filled area, plus summary figures. Values are clamped;
    // fewer than two points produce empty paths.
    function sparkline(values, width, height, padding = 2) {
        const points = (Array.isArray(values) ? values : [])
            .map(Number).filter(Number.isFinite).map(v => Math.max(0, Math.min(100, v)));
        if (points.length < 2) return { line: "", area: "", peak: points[0] ?? null, average: points[0] ?? null, count: points.length };
        const usable = height - padding * 2;
        const step = width / (points.length - 1);
        const coords = points.map((v, i) => [
            Math.round(i * step * 10) / 10,
            Math.round((padding + usable - (v / 100) * usable) * 10) / 10
        ]);
        const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
        const area = `${line} L${coords[coords.length - 1][0]} ${height} L0 ${height} Z`;
        const peak = Math.max(...points);
        const average = Math.round(points.reduce((sum, v) => sum + v, 0) / points.length);
        return { line, area, peak, average, count: points.length };
    }

    global.ASCSCharts = { sparkline };
})(globalThis);
