"use strict";

(function () {
    const A = globalThis.ASCSAlmanac;
    const { check, equal } = globalThis.TestHarness;
    const near = (name, actual, expected, tolerance) =>
        check(`${name} (expected ${expected} ± ${tolerance}, got ${actual})`, Math.abs(actual - expected) <= tolerance);
    const minutesUtc = date => date.getUTCHours() * 60 + date.getUTCMinutes();

    // Moon: known phases (NASA). The mean-month model is good to about a day.
    let moon = A.moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54)));
    equal("full moon 2024-01-25", moon.name, "Full moon");
    check("full moon is nearly fully lit", moon.illumination > 0.95);
    moon = A.moonPhase(new Date(Date.UTC(2024, 3, 8, 18, 21)));
    equal("new moon 2024-04-08", moon.name, "New moon");
    check("new moon is nearly dark", moon.illumination < 0.05);
    moon = A.moonPhase(new Date(Date.UTC(2024, 0, 18, 3, 53)));
    equal("first quarter 2024-01-18", moon.name, "First quarter");
    near("first quarter is about half lit", moon.illumination, 0.5, 0.12);
    check("first quarter is waxing", moon.waxing === true);
    moon = A.moonPhase(new Date(Date.UTC(2024, 1, 2, 23, 18)));
    equal("last quarter 2024-02-02", moon.name, "Last quarter");
    check("last quarter is waning", moon.waxing === false);
    moon = A.moonPhase(new Date(Date.UTC(1999, 0, 1)));
    check("dates before the reference still work", moon.age >= 0 && moon.age < 29.6);

    equal("dark moon draws nothing", A.moonPath(0), "");
    check("full moon draws a circle", A.moonPath(14.77).startsWith("M16 4a12 12 0 1 1"));
    check("crescent draws an arc pair", /^M16 4a12 12 0 0 1 0 24a[\d.]+ 12 0 0 0 0 -24Z$/.test(A.moonPath(4)));

    // Sun: New York City (40.7128, -74.0060), checked against NOAA, ±3 minutes.
    const nyc = [40.7128, -74.006];
    let sun = A.sunTimes(new Date(Date.UTC(2024, 5, 21, 16)), ...nyc);
    near("NYC summer solstice sunrise 09:25 UTC", minutesUtc(sun.sunrise), 9 * 60 + 25, 3);
    near("NYC summer solstice sunset 00:31 UTC", (minutesUtc(sun.sunset) + 1440) % 1440, 31, 3);
    near("NYC summer daylight 15 h 05 m", sun.daylightMinutes, 905, 4);
    sun = A.sunTimes(new Date(Date.UTC(2024, 11, 21, 17)), ...nyc);
    near("NYC winter solstice sunrise 12:16 UTC", minutesUtc(sun.sunrise), 12 * 60 + 16, 3);
    near("NYC winter solstice sunset 21:32 UTC", minutesUtc(sun.sunset), 21 * 60 + 32, 3);
    equal("polar day returns null", A.sunTimes(new Date(Date.UTC(2024, 5, 21, 12)), 89, 0), null);

    // Wikipedia feeds: only expected fields, cleaned and capped.
    const featured = JSON.stringify({
        onthisday: [
            { year: 1947, text: "The \u0007Spruce Goose\nflies.", pages: [{ title: "Hughes_H-4_Hercules", content_urls: { desktop: { page: "javascript:alert(1)" } } }] },
            { year: "soon", text: "Bad year" },
            { year: 1900, text: "", pages: [] },
            { year: -44, text: "Caesar is assassinated.", pages: [{ title: "Bad<title>" }] }
        ],
        tfa: { title: "Ich_geh_und_suche_mit_Verlangen,_BWV_49", titles: { normalized: "Ich geh und suche mit Verlangen, BWV 49" }, extract: "A cantata. ".repeat(60) }
    });
    const parsed = A.parseFeatured(featured);
    equal("valid events kept", parsed.history.length, 2);
    equal("control characters and newlines become spaces", parsed.history[0].text, "The Spruce Goose flies.");
    equal("titles come through, never URLs", parsed.history[0].title, "Hughes_H-4_Hercules");
    check("no URL fields are returned", !JSON.stringify(parsed).includes("javascript:"));
    equal("unsafe titles are dropped", parsed.history[1].title, "");
    equal("BC years kept", parsed.history[1].year, -44);
    equal("featured display title", parsed.featured.display, "Ich geh und suche mit Verlangen, BWV 49");
    check("featured extract is capped", parsed.featured.extract.length <= 360);
    equal("invalid JSON is empty", A.parseFeatured("{nope").history.length, 0);
    equal("oversized input is refused", A.parseFeatured("x".repeat(1500001)).history.length, 0);
    equal("non-string input is refused", A.parseFeatured({ onthisday: [] }).featured, null);

    const holidays = A.parseHolidays(JSON.stringify({
        holidays: [
            { text: "Christian feast day:\nSaint Example", pages: [{ title: "Saint_Example" }] },
            { text: "Culture Day (Japan)", pages: [{ title: "Culture_Day" }] },
            { text: 42 }
        ]
    }));
    equal("holidays keep text entries", holidays.length, 2);
    equal("national observances come before feast days", holidays[0].text, "Culture Day (Japan)");
    equal("feast day text is flattened", holidays[1].text, "Christian feast day: Saint Example");

    // Countdowns
    const today = new Date(2026, 10, 3);
    const items = A.countdownItems([
        { date: "12-25", name: "Christmas" },
        { date: "01-01", name: "New Year" },
        { date: "11-03", name: "Release day" },
        { date: "11-04", name: "Tomorrow thing" },
        { date: "2026-01-01", name: "Past one-off" },
        { date: "2030-01-01", name: "Too far" },
        { date: "13-40", name: "Bad date" },
        { date: "12-31", name: "" }
    ], today);
    equal("invalid, past and distant countdowns dropped", items.length, 4);
    equal("countdowns sorted soonest first", items[0].text, "Today: Release day");
    equal("tomorrow phrasing", items[1].text, "Tomorrow: Tomorrow thing");
    equal("days until Christmas", items[2].text, "52 days until Christmas");
    equal("yearly date rolls to next year", items[3].days, 59);

    // Rotation: kinds in a fixed order; history cycles through events.
    const sources = {
        history: [{ year: 1947, text: "A", title: "A" }, { year: 1969, text: "B", title: "B" }],
        holidays: [],
        featured: null,
        quote: { text: "Simplify, simplify.", source: "Thoreau" },
        countdowns: items
    };
    equal("step 0 is history", A.rotationItem(sources, 0).kind, "history");
    equal("step 1 is the quote", A.rotationItem(sources, 1).kind, "quote");
    equal("step 2 is a countdown", A.rotationItem(sources, 2).kind, "countdown");
    equal("next cycle shows the next event", A.rotationItem(sources, 3).text, "B");
    equal("rotation reports its position", A.rotationItem(sources, 4).position, 1);
    equal("BC label", A.rotationItem({ history: [{ year: -44, text: "C" }] }, 0).label, "On this day · 44 BC");
    equal("nothing to show is null", A.rotationItem({}, 0), null);
    equal("stepping back wraps to the last kind", A.rotationItem(sources, -1).kind, "countdown");
    equal("stepping back past the start picks the last event", A.rotationItem(sources, -3).text, "B");
    check("deep negative steps stay valid", A.rotationItem(sources, -1000).text !== undefined);

    // Quote of the day: stable through the day, changes the next.
    const quotes = globalThis.ASCSQuotes;
    check("quotes are present", Array.isArray(quotes) && quotes.length >= 60);
    check("every quote has text and a source", quotes.every(q => q.text && q.source));
    equal("same quote all day", A.quoteFor(quotes, new Date(2026, 10, 3, 8)), A.quoteFor(quotes, new Date(2026, 10, 3, 23)));
    check("next day differs", A.quoteFor(quotes, new Date(2026, 10, 3)) !== A.quoteFor(quotes, new Date(2026, 10, 4)));
})();
