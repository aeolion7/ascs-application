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

    // SVG path for the lit part of the moon, centered at (c, c) with radius r.
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

    // altitude: -0.833 for sunrise and sunset (the sun's edge, with refraction);
    // 6, -4 and -6 bound golden hour and blue hour.
    function sunTimes(date, latitude, longitude, altitude = -0.833) {
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
        const cosW = (Math.sin(RAD * altitude) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
        if (cosW < -1 || cosW > 1) return null;   // polar day or night
        const w = Math.acos(cosW);
        const jSet = J2000 + (0.0009 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
        const jRise = jNoon - (jSet - jNoon);
        const sunrise = fromJulian(jRise);
        const sunset = fromJulian(jSet);
        return { sunrise, sunset, daylightMinutes: Math.round((sunset - sunrise) / 60000) };
    }

    // Golden hour (the sun between 6° and -4°) and blue hour (-4° to -6°), morning
    // and evening. Any part the sun never reaches is null.
    function goldenHours(date, latitude, longitude) {
        const at = altitude => sunTimes(date, latitude, longitude, altitude);
        const high = at(6), low = at(-4), deep = at(-6);
        return {
            morningBlue: deep && low ? [deep.sunrise, low.sunrise] : null,
            morningGolden: low && high ? [low.sunrise, high.sunrise] : null,
            eveningGolden: high && low ? [high.sunset, low.sunset] : null,
            eveningBlue: low && deep ? [low.sunset, deep.sunset] : null
        };
    }

    // The sun's apparent ecliptic longitude, radians from the March equinox
    // (Meeus, Astronomical Algorithms, ch. 25: good to about 0.01 degrees, so
    // an equinox or solstice to within minutes).
    function solarLongitude(date) {
        const T = toDays(date) / 36525;
        const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
        const M = RAD * (357.52911 + 35999.05029 * T - 0.0001537 * T * T);
        const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
            + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
        const omega = RAD * (125.04 - 1934.136 * T);
        const apparent = RAD * (L0 + C - 0.00569 - 0.00478 * Math.sin(omega));
        return ((apparent % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    }

    // Equinoxes and solstices of a year, found where the sun's longitude passes
    // each quarter; good to well within a day. Named for the northern hemisphere.
    const SEASON_EVENTS = [
        [0, "spring equinox", "Spring"], [90, "summer solstice", "Summer"],
        [180, "fall equinox", "Fall"], [270, "winter solstice", "Winter"]
    ];
    function seasonEvents(year) {
        return SEASON_EVENTS.map(([degrees, name, season]) => {
            const target = RAD * degrees;
            const past = date => {
                const gap = solarLongitude(date) - target;
                return Math.sin(gap) >= 0 && Math.cos(gap) > 0;
            };
            // From a week before the usual date, a day at a time, then halving.
            let low = Date.UTC(year, [2, 5, 8, 11][degrees / 90], 12);
            while (!past(new Date(low + DAY_MS))) low += DAY_MS;
            let high = low + DAY_MS;
            for (let i = 0; i < 20; i++) {
                const middle = (low + high) / 2;
                if (past(new Date(middle))) high = middle;
                else low = middle;
            }
            return { name, season, date: new Date(Math.round(high)) };
        });
    }

    // Where the year is: the season, how far through it, and what comes next.
    function seasonNow(date = new Date()) {
        const year = date.getFullYear();
        const events = [...seasonEvents(year - 1), ...seasonEvents(year), ...seasonEvents(year + 1)];
        const nextIndex = events.findIndex(event => event.date > date);
        const previous = events[nextIndex - 1];
        const next = events[nextIndex];
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const nextDay = new Date(next.date.getFullYear(), next.date.getMonth(), next.date.getDate());
        return {
            season: previous.season,
            progress: Math.round((date - previous.date) / (next.date - previous.date) * 100),
            next: next.name,
            nextDate: next.date,
            days: Math.round((nextDay - start) / DAY_MS)
        };
    }

    function dayOfYear(date) {
        return Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(date.getFullYear(), 0, 0)) / DAY_MS);
    }

    // ISO 8601: weeks start on Monday, and week 1 holds the year's first Thursday.
    function isoWeek(date) {
        const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const weekday = day.getUTCDay() || 7;
        day.setUTCDate(day.getUTCDate() + 4 - weekday);
        const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
        return Math.ceil(((day - yearStart) / DAY_MS + 1) / 7);
    }

    // ------------------------------------------------------------- moon in the sky
    // Low-precision lunar position (good to a few minutes for rising and setting).
    const OBLIQUITY = RAD * 23.4397;
    function moonAltitude(date, latitude, longitude) {
        const d = toDays(date);
        const L = RAD * (218.316 + 13.176396 * d);
        const M = RAD * (134.963 + 13.064993 * d);
        const F = RAD * (93.272 + 13.22935 * d);
        const l = L + RAD * 6.289 * Math.sin(M);
        const b = RAD * 5.128 * Math.sin(F);
        const ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
        const dec = Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
        const phi = RAD * latitude;
        const hourAngle = RAD * (280.16 + 360.9856235 * d) + RAD * longitude - ra;
        return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle));
    }

    // Moonrise and moonset on a local calendar day; either can be null, since the
    // moon skips one about once a month.
    function moonTimes(date, latitude, longitude) {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const horizon = RAD * 0.133;
        const step = 10 * 60000;
        let rise = null;
        let set = null;
        let before = moonAltitude(new Date(start), latitude, longitude) - horizon;
        for (let time = start + step; time <= start + DAY_MS; time += step) {
            const now = moonAltitude(new Date(time), latitude, longitude) - horizon;
            if ((before < 0) !== (now < 0)) {
                const crossed = new Date(Math.round(time - step + step * before / (before - now)));
                if (now > 0 && !rise) rise = crossed;
                if (now < 0 && !set) set = crossed;
            }
            before = now;
        }
        return { rise, set };
    }

    // The next full moon and the next new moon, from the same mean month.
    function nextMoonPhases(date) {
        const { age } = moonPhase(date);
        const untilFull = ((SYNODIC / 2 - age) % SYNODIC + SYNODIC) % SYNODIC;
        const untilNew = (SYNODIC - age) % SYNODIC;
        return {
            full: new Date(date.getTime() + untilFull * DAY_MS),
            new: new Date(date.getTime() + untilNew * DAY_MS)
        };
    }

    // ------------------------------------------------------------- meteor showers
    // The major annual showers: when each is active, and its usual peak (IMO).
    const SHOWERS = [
        ["Quadrantids", [12, 28], [1, 12], [1, 3]],
        ["Lyrids", [4, 14], [4, 30], [4, 22]],
        ["Eta Aquariids", [4, 19], [5, 28], [5, 6]],
        ["Southern Delta Aquariids", [7, 12], [8, 23], [7, 30]],
        ["Perseids", [7, 17], [8, 24], [8, 12]],
        ["Draconids", [10, 6], [10, 10], [10, 8]],
        ["Orionids", [10, 2], [11, 7], [10, 21]],
        ["Leonids", [11, 6], [11, 30], [11, 17]],
        ["Geminids", [12, 4], [12, 20], [12, 14]],
        ["Ursids", [12, 17], [12, 26], [12, 22]]
    ];
    function activeShowers(date) {
        const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const year = today.getFullYear();
        const found = [];
        SHOWERS.forEach(([name, from, to, peak]) => {
            // A shower that runs across New Year is tried from both years.
            [year - 1, year].forEach(startYear => {
                const start = new Date(startYear, from[0] - 1, from[1]);
                const endYear = to[0] < from[0] ? startYear + 1 : startYear;
                const end = new Date(endYear, to[0] - 1, to[1]);
                if (today < start || today > end) return;
                const peakYear = peak[0] < from[0] ? startYear + 1 : startYear;
                const peakDate = new Date(peakYear, peak[0] - 1, peak[1]);
                found.push({ name, peak: peakDate, days: Math.round((peakDate - today) / DAY_MS) });
            });
        });
        return found.sort((left, right) => Math.abs(left.days) - Math.abs(right.days));
    }

    // Composers born on this day, from composers.js.
    function bornOn(composers, date) {
        const key = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return (Array.isArray(composers) ? composers : []).filter(entry => entry[0] === key);
    }

    // ------------------------------------------------------------- weather (2.0.0)
    // Open-Meteo's reply, read strictly: only the numbers the Weather module
    // shows, each checked; anything else, or a wrong shape, is null.
    const WEATHER_NAMES = [
        [[0], "Clear"], [[1], "Mostly clear"], [[2], "Partly cloudy"], [[3], "Cloudy"], [[45, 48], "Fog"],
        [[51, 53, 55], "Drizzle"], [[56, 57], "Freezing drizzle"], [[61], "Light rain"], [[63], "Rain"], [[65], "Heavy rain"],
        [[66, 67], "Freezing rain"], [[71], "Light snow"], [[73], "Snow"], [[75], "Heavy snow"], [[77], "Snow grains"],
        [[80, 81], "Showers"], [[82], "Heavy showers"], [[85, 86], "Snow showers"], [[95], "Thunderstorms"], [[96, 99], "Thunderstorms with hail"]
    ];
    function weatherName(code) {
        return WEATHER_NAMES.find(([codes]) => codes.includes(code))?.[1] ?? "Unknown";
    }

    function parseWeather(text) {
        let raw;
        try { raw = JSON.parse(String(text ?? "")); } catch { return null; }
        if (!raw || typeof raw !== "object") return null;
        const number = (value, low, high) => (typeof value === "number" && Number.isFinite(value) && value >= low && value <= high ? value : null);
        const code = value => (Number.isInteger(value) && value >= 0 && value <= 99 ? value : null);
        const now = raw.current || {};
        const current = {
            temperature: number(now.temperature_2m, -100, 150),
            feelsLike: number(now.apparent_temperature, -120, 170),
            humidity: number(now.relative_humidity_2m, 0, 100),
            wind: number(now.wind_speed_10m, 0, 300),
            code: code(now.weather_code)
        };
        if (Object.values(current).some(value => value === null)) return null;
        const daily = raw.daily || {};
        const days = [];
        const dates = Array.isArray(daily.time) ? daily.time.slice(0, 3) : [];
        dates.forEach((date, index) => {
            const day = {
                date: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
                high: number(daily.temperature_2m_max?.[index], -100, 150),
                low: number(daily.temperature_2m_min?.[index], -100, 150),
                code: code(daily.weather_code?.[index]),
                rain: number(daily.precipitation_probability_max?.[index], 0, 100)
            };
            if (day.date && day.high !== null && day.low !== null && day.code !== null) days.push(day);
        });
        return { current, days };
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

    // ------------------------------------------------------------- US holidays
    // Worked out here (1.8.0), with nothing downloaded: the 11 federal
    // holidays on their actual dates (not the observed weekday), plus common
    // observances. Each is {date: "YYYY-MM-DD", name}.
    const pad2 = value => String(value).padStart(2, "0");
    const isoDay = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

    // The nth weekday (0 = Sunday) of a month; n = -1 for the last.
    function nthWeekday(year, month, weekday, n) {
        if (n < 0) {
            const last = new Date(year, month, 0);
            return last.getDate() - ((last.getDay() - weekday + 7) % 7);
        }
        const first = new Date(year, month - 1, 1).getDay();
        return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    }

    // Easter Sunday (Gregorian), by the anonymous algorithm: [month, day].
    function easterDate(year) {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
    }

    function usHolidays(year) {
        const [easterMonth, easterDay] = easterDate(year);
        return [
            [1, 1, "New Year's Day"],
            [1, nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day"],
            [2, 14, "Valentine's Day"],
            [2, nthWeekday(year, 2, 1, 3), "Presidents' Day"],
            [easterMonth, easterDay, "Easter"],
            [5, nthWeekday(year, 5, 0, 2), "Mother's Day"],
            [5, nthWeekday(year, 5, 1, -1), "Memorial Day"],
            [6, nthWeekday(year, 6, 0, 3), "Father's Day"],
            [6, 19, "Juneteenth"],
            [7, 4, "Independence Day"],
            [9, nthWeekday(year, 9, 1, 1), "Labor Day"],
            [10, nthWeekday(year, 10, 1, 2), "Columbus Day"],
            [10, 31, "Halloween"],
            [11, 11, "Veterans Day"],
            [11, nthWeekday(year, 11, 4, 4), "Thanksgiving"],
            [12, 24, "Christmas Eve"],
            [12, 25, "Christmas"],
            [12, 31, "New Year's Eve"]
        ].map(([month, day, name]) => ({ date: isoDay(year, month, day), name }))
            .sort((x, y) => x.date.localeCompare(y.date));
    }

    // Your countdowns plus this year's and next year's holidays, each as a
    // one-off date. A holiday is left out when one of yours has the same
    // name, or falls on the same day, so "Christmas" isn't counted twice.
    function withHolidays(countdowns, today = new Date()) {
        const own = Array.isArray(countdowns) ? countdowns : [];
        const names = new Set(own.map(item => clean(item?.name, 60).toLowerCase()));
        const days = new Set(own.map(item => nextOccurrence(String(item?.date ?? ""), today))
            .filter(Boolean).map(date => isoDay(date.getFullYear(), date.getMonth() + 1, date.getDate())));
        const year = today.getFullYear();
        const holidays = [...usHolidays(year), ...usHolidays(year + 1)]
            .filter(item => !names.has(item.name.toLowerCase()) && !days.has(item.date));
        return [...own, ...holidays];
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
        if (sources.composers?.length) kinds.push("composer");
        if (sources.golden) kinds.push("golden");
        if (sources.moon) kinds.push("moon");
        if (sources.showers?.length) kinds.push("meteors");
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
            case "composer": {
                const [, name, year, note] = pick(sources.composers);
                return { ...base, label: "Born today", text: `${name}, in ${year}${note ? ` (${note})` : ""}` };
            }
            case "golden":
            case "moon":
            case "meteors":
                return { ...base, label: { golden: "Golden hour", moon: "The moon", meteors: "Meteor shower" }[kind], text: sources[{ golden: "golden", moon: "moon", meteors: "showerText" }[kind]] };
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
        moonPhase, moonPath, sunTimes, goldenHours, solarLongitude, seasonEvents, seasonNow, dayOfYear, isoWeek,
        moonAltitude, moonTimes, nextMoonPhases, activeShowers, bornOn, weatherName, parseWeather, parseFeatured, parseHolidays,
        countdownItems, nextOccurrence, rotationItem, quoteFor, clean, usHolidays, withHolidays
    };
})(globalThis);
