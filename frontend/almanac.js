"use strict";

// Pure almanac logic: moon phase, sunrise and sunset, defensive parsing of
// the Wikipedia feeds, countdowns, and the rotating line. No DOM access and
// no network: ASCS itself fetches the feeds (when enabled) and passes the
// text here. Everything returned is plain, length-capped text.
(function (global) {
    const RAD = Math.PI / 180;
    const DAY_MS = 86400000;
    const J1970 = 2440588;
    const J2000 = 2451545;

    // ------------------------------------------------------------- moon
    // Mean synodic month from a reference new moon (2000-01-06 18:14 UTC).
    // Accurate to within about a day, which suits a daily almanac.
    const SYNODIC = 29.530588853;
    const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);
    const PHASES = [
        [1.84566, "New moon"], [5.53699, "Waxing crescent"], [9.22831, "First quarter"],
        [12.91963, "Waxing gibbous"], [16.61096, "Full moon"], [20.30228, "Waning gibbous"],
        [23.99361, "Last quarter"], [27.68493, "Waning crescent"], [SYNODIC + 1, "New moon"]
    ];

    function moonPhase(date) {
        const days = (date.getTime() - NEW_MOON_REF) / DAY_MS;
        const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
        const illumination = (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
        const name = PHASES.find(([limit]) => age < limit)[1];
        return { age, illumination, name, waxing: age < SYNODIC / 2 };
    }

    // SVG path for the lit part of the moon, centred at (c, c) with radius r.
    // The terminator is an ellipse whose width follows the phase.
    function moonPath(age, r = 12, c = 16) {
        const fraction = (((age % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
        const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
        if (illumination < 0.02) return "";
        if (illumination > 0.98) return `M${c} ${c - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}Z`;
        const waxing = fraction < 0.5;
        const rx = Math.round(Math.abs(Math.cos(2 * Math.PI * fraction)) * r * 100) / 100;
        const outer = waxing ? 1 : 0;                       // lit limb: right when waxing
        const inner = illumination > 0.5 ? outer : 1 - outer; // gibbous bulges past the middle
        return `M${c} ${c - r}a${r} ${r} 0 0 ${outer} 0 ${2 * r}a${rx} ${r} 0 0 ${inner} 0 ${-2 * r}Z`;
    }

    // ------------------------------------------------------------- sun
    // Standard solar position equations (as used by NOAA-derived calculators).
    const toDays = date => date.getTime() / DAY_MS - 0.5 + J1970 - J2000;
    const fromJulian = j => new Date((j + 0.5 - J1970) * DAY_MS);

    function sunTimes(date, latitude, longitude) {
        const lw = RAD * -longitude;
        const phi = RAD * latitude;
        const d = toDays(date);
        const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
        const ds = 0.0009 + lw / (2 * Math.PI) + n;
        const M = RAD * (357.5291 + 0.98560028 * ds);
        const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
        const L = M + C + RAD * 102.9372 + Math.PI;
        const dec = Math.asin(Math.sin(RAD * 23.4397) * Math.sin(L));
        const jNoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
        const cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
        if (cosW < -1 || cosW > 1) return null;   // polar day or night
        const w = Math.acos(cosW);
        const jSet = J2000 + (0.0009 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
        const jRise = jNoon - (jSet - jNoon);
        const sunrise = fromJulian(jRise);
        const sunset = fromJulian(jSet);
        return { sunrise, sunset, daylightMinutes: Math.round((sunset - sunrise) / 60000) };
    }

    // ------------------------------------------------------------- feeds
    // The feeds are treated as untrusted: only expected fields are read,
    // control characters are removed, and lengths are capped. Article titles
    // are returned for ASCS to build links from; URLs are never taken here.
    // Only strings are accepted: numbers or objects in a text field are
    // treated as missing rather than coerced.
    const clean = (value, max) => (typeof value === "string" ? value : "")
        .replace(/[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, " ")
        .replace(/\s{2,}/g, " ").trim().slice(0, max);
    const cleanTitle = value => {
        const title = clean(value, 200);
        return /^[^#<>[\]{}|]+$/.test(title) ? title : "";
    };
    const parse = raw => {
        if (typeof raw !== "string" || raw.length > 1500000) return null;
        try {
            const data = JSON.parse(raw);
            return data && typeof data === "object" ? data : null;
        } catch {
            return null;
        }
    };
    const firstTitle = pages => (Array.isArray(pages) && pages[0] ? cleanTitle(pages[0].title) : "");

    function parseFeatured(raw) {
        const data = parse(raw);
        const result = { history: [], featured: null };
        if (!data) return result;
        const events = Array.isArray(data.onthisday) ? data.onthisday : [];
        events.slice(0, 40).forEach(event => {
            const text = clean(event?.text, 320);
            const year = Number(event?.year);
            if (!text || !Number.isInteger(year) || year < -5000 || year > 3000) return;
            result.history.push({ year, text, title: firstTitle(event.pages) });
        });
        const tfa = data.tfa;
        if (tfa && typeof tfa === "object") {
            const title = cleanTitle(tfa.title);
            const display = clean(tfa.titles?.normalized || tfa.normalizedtitle || title, 160);
            const extract = clean(tfa.extract, 360);
            if (title && display) result.featured = { title, display, extract };
        }
        return result;
    }

    function parseHolidays(raw) {
        const data = parse(raw);
        if (!data || !Array.isArray(data.holidays)) return [];
        // Most entries are saints' feast days; national and cultural
        // observances are more interesting, so they come first.
        const feast = item => /feast day/i.test(item.text) ? 1 : 0;
        return data.holidays.slice(0, 40)
            .map(item => ({ text: clean(item?.text, 200), title: firstTitle(item?.pages) }))
            .filter(item => item.text)
            .sort((a, b) => feast(a) - feast(b))
            .slice(0, 20);
    }

    // ------------------------------------------------------------- countdowns
    // Each countdown is {date, name}: "YYYY-MM-DD" (one-off) or "MM-DD" (yearly).
    // Builds a local date, rejecting impossible ones (13-40, 02-30) instead
    // of letting them roll over into another month.
    function makeDate(year, month, day) {
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }

    function nextOccurrence(date, today) {
        const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
        if (match) return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
        match = /^(\d{2})-(\d{2})$/.exec(date);
        if (!match) return null;
        const month = Number(match[1]);
        const day = Number(match[2]);
        // 02-29 is allowed as a yearly date; it falls on leap years only.
        if (!makeDate(2024, month, day)) return null;
        for (let year = base.getFullYear(); year <= base.getFullYear() + 4; year++) {
            const next = makeDate(year, month, day);
            if (next && next >= base) return next;
        }
        return null;
    }

    function countdownItems(countdowns, today = new Date()) {
        const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return (Array.isArray(countdowns) ? countdowns : [])
            .map(item => {
                const target = nextOccurrence(String(item?.date ?? ""), today);
                const name = clean(item?.name, 60);
                if (!target || !name) return null;
                const days = Math.round((target - base) / DAY_MS);
                if (days < 0 || days > 366) return null;
                const text = days === 0 ? `Today: ${name}` : days === 1 ? `Tomorrow: ${name}` : `${days} days until ${name}`;
                return { name, days, text };
            })
            .filter(Boolean)
            .sort((a, b) => a.days - b.days);
    }

    // ------------------------------------------------------------- rotation
    // One line, advanced only when the Command Center opens or ↻ is pressed.
    // Kinds rotate in a fixed order; history cycles through today's events.
    function rotationItem(sources, step) {
        const kinds = [];
        if (sources.history?.length) kinds.push("history");
        if (sources.holidays?.length) kinds.push("observance");
        if (sources.featured) kinds.push("featured");
        if (sources.quote) kinds.push("quote");
        if (sources.countdowns?.length) kinds.push("countdown");
        if (!kinds.length) return null;
        const position = ((step % kinds.length) + kinds.length) % kinds.length;
        const cycle = Math.floor(step / kinds.length);
        const pick = list => list[((cycle % list.length) + list.length) % list.length];
        const kind = kinds[position];
        const base = { kind, position, count: kinds.length };
        switch (kind) {
            case "history": {
                const event = pick(sources.history);
                return { ...base, label: `On this day · ${event.year < 0 ? `${-event.year} BC` : event.year}`, text: event.text, title: event.title };
            }
            case "observance": {
                const item = pick(sources.holidays);
                return { ...base, label: "Observed today", text: item.text, title: item.title };
            }
            case "featured":
                return { ...base, label: "Today's featured article", text: `${sources.featured.display}. ${sources.featured.extract}`.trim(), title: sources.featured.title };
            case "quote":
                return { ...base, label: "Quote of the day", text: `“${sources.quote.text}”`, attribution: sources.quote.source };
            default: {
                const item = pick(sources.countdowns);
                return { ...base, label: "Countdown", text: item.text };
            }
        }
    }

    // Quote of the day: stable for a calendar day; ↻ can step further.
    function quoteFor(quotes, date, offset = 0) {
        if (!Array.isArray(quotes) || !quotes.length) return null;
        const start = new Date(date.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - start) / DAY_MS);
        return quotes[(dayOfYear + date.getFullYear() * 7 + offset) % quotes.length];
    }

    global.ASCSAlmanac = {
        moonPhase, moonPath, sunTimes, parseFeatured, parseHolidays,
        countdownItems, nextOccurrence, rotationItem, quoteFor, clean
    };
})(globalThis);
