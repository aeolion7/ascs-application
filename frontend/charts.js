"use strict";

// Pure chart geometry for the System page's graphs. No DOM access.
(function (global) {
    // values: numbers 0-100 (oldest first); returns SVG path data for the
    // line and the filled area, plus summary figures. Values are clamped;
    // fewer than two points produce empty paths.
    function sparkline(values, width, height, padding = 2) {
        const points = (Array.isArray(values) ? values : [])
            .map(Number).filter(Number.isFinite).map(v => Math.max(0, Math.min(100, v)));
        if (points.length < 2) return { line: "", area: "", peak: points[0] ?? null, average: points[0] ?? null, count: points.length, values: points };
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
        return { line, area, peak, average, count: points.length, values: points };
    }

    // values: numbers of any size (oldest first), drawn from 0 up to a little
    // above the largest. Returns SVG paths, plus each point's place as percents
    // of the box, for markers laid over a stretched line, and the value at the
    // top of the box. One point sits mid-way with no line.
    function pointGraph(values, width, height) {
        const numbers = (Array.isArray(values) ? values : []).map(Number).filter(v => Number.isFinite(v) && v >= 0);
        if (!numbers.length) return { line: "", area: "", points: [], top: 0 };
        const top = Math.max(...numbers) * 1.15 || 1;
        const percent = value => Math.round(value * 10) / 10;
        const points = numbers.map((v, i) => ({
            x: numbers.length > 1 ? percent(i / (numbers.length - 1) * 100) : 50,
            y: percent(100 - v / top * 100)
        }));
        if (points.length < 2) return { line: "", area: "", points, top };
        const line = points.map((p, i) => `${i ? "L" : "M"}${percent(p.x / 100 * width)} ${percent(p.y / 100 * height)}`).join(" ");
        return { line, area: `${line} L${width} ${height} L0 ${height} Z`, points, top };
    }

    // The index of the point nearest a position across the graph, or -1.
    function nearestPoint(points, x) {
        let best = -1;
        (Array.isArray(points) ? points : []).forEach((point, index) => {
            if (best < 0 || Math.abs(point.x - x) < Math.abs(points[best].x - x)) best = index;
        });
        return best;
    }

    global.ASCSCharts = { sparkline, pointGraph, nearestPoint };
})(globalThis);
