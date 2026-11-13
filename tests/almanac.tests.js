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

    // US holidays (1.8.0), against published dates.
    const on = (year, name) => A.usHolidays(year).find(item => item.name === name)?.date;
    equal("holidays: 18 a year", A.usHolidays(2026).length, 18);
    equal("holidays: 2026 floating dates", ["Martin Luther King Jr. Day", "Presidents' Day", "Easter", "Mother's Day", "Memorial Day", "Father's Day", "Labor Day", "Columbus Day", "Thanksgiving"].map(name => on(2026, name)).join(" "),
        "2026-01-19 2026-02-16 2026-04-05 2026-05-10 2026-05-25 2026-06-21 2026-09-07 2026-10-12 2026-11-26");
    equal("holidays: 2027 floating dates", ["Martin Luther King Jr. Day", "Easter", "Memorial Day", "Thanksgiving"].map(name => on(2027, name)).join(" "), "2027-01-18 2027-03-28 2027-05-31 2027-11-25");
    equal("holidays: Easter in other years", `${on(2024, "Easter")} ${on(2025, "Easter")} ${on(2038, "Easter")}`, "2024-03-31 2025-04-20 2038-04-25");
    equal("holidays: fixed dates", `${on(2026, "Juneteenth")} ${on(2026, "Independence Day")} ${on(2026, "Veterans Day")} ${on(2026, "Christmas")}`, "2026-06-19 2026-07-04 2026-11-11 2026-12-25");
    check("holidays: in date order", A.usHolidays(2027).every((item, i, all) => !i || all[i - 1].date <= item.date));
    const merged = A.withHolidays([{ date: "12-25", name: "Christmas" }, { date: "2026-11-26", name: "Turkey day" }], new Date(2026, 10, 4));
    check("holidays: yours replace one with the same name", merged.filter(item => /^christmas$/i.test(item.name)).length === 1);
    check("holidays: yours replace one on the same day", !merged.some(item => item.name === "Thanksgiving" && item.date === "2026-11-26"));
    check("holidays: next year's still counted", merged.some(item => item.name === "Thanksgiving" && item.date === "2027-11-25"));
    equal("holidays: nearest countdown includes them", A.countdownItems(A.withHolidays([], new Date(2026, 10, 4)), new Date(2026, 10, 4))[0].text, "7 days until Veterans Day");

    // 2.0.0: seasons, against the published 2026 times (UTC), within half an hour.
    const events = A.seasonEvents(2026);
    const hoursOff = (date, expected) => Math.abs(date.getTime() - expected) / 3600000;
    near("2026 spring equinox (Mar 20 14:46 UTC)", hoursOff(events[0].date, Date.UTC(2026, 2, 20, 14, 46)), 0, 0.5);
    near("2026 summer solstice (Jun 21 08:24 UTC)", hoursOff(events[1].date, Date.UTC(2026, 5, 21, 8, 24)), 0, 0.5);
    near("2026 fall equinox (Sep 23 00:05 UTC)", hoursOff(events[2].date, Date.UTC(2026, 8, 23, 0, 5)), 0, 0.5);
    near("2026 winter solstice (Dec 21 20:50 UTC)", hoursOff(events[3].date, Date.UTC(2026, 11, 21, 20, 50)), 0, 0.5);
    const season = A.seasonNow(new Date(2026, 10, 9, 12));
    equal("Nov 9 is fall, with the winter solstice next", `${season.season} ${season.next}`, "Fall winter solstice");
    equal("in 42 days", season.days, 42);
    check("and about halfway through fall", season.progress > 45 && season.progress < 60);
    equal("in late December it's winter, spring next", A.seasonNow(new Date(2026, 11, 28)).next, "spring equinox");

    equal("day of the year", A.dayOfYear(new Date(2026, 10, 9)), 313);
    equal("the first day of the year", A.dayOfYear(new Date(2026, 0, 1)), 1);
    equal("ISO week of Nov 9, 2026", A.isoWeek(new Date(2026, 10, 9)), 46);
    equal("Jan 1, 2026 (a Thursday) is in week 1", A.isoWeek(new Date(2026, 0, 1)), 1);
    equal("Jan 1, 2027 (a Friday) is in 2026's week 53", A.isoWeek(new Date(2027, 0, 1)), 53);

    // Golden and blue hour come in order, around sunset.
    const hours = A.goldenHours(new Date(2026, 10, 9, 12), 40.7, -74);
    const sunset = A.sunTimes(new Date(2026, 10, 9, 12), 40.7, -74).sunset;
    check("evening golden hour comes before blue hour", hours.eveningGolden[0] < hours.eveningGolden[1] && hours.eveningGolden[1] <= hours.eveningBlue[0] && hours.eveningBlue[0] < hours.eveningBlue[1]);
    check("and sunset falls within golden hour", hours.eveningGolden[0] < sunset && sunset < hours.eveningGolden[1]);
    check("morning blue hour comes first", hours.morningBlue[0] < hours.morningBlue[1] && hours.morningBlue[1] <= hours.morningGolden[0]);
    equal("the sun never reaches 6° near the pole in winter", A.goldenHours(new Date(2026, 11, 21, 12), 80, 0).eveningGolden, null);

    // The moon: rising means climbing through the horizon.
    const moonDay = A.moonTimes(new Date(2026, 10, 9), 40.7, -74);
    check("the moon rises or sets on a given day", moonDay.rise || moonDay.set);
    if (moonDay.rise) check("at moonrise it's climbing", A.moonAltitude(new Date(moonDay.rise.getTime() + 600000), 40.7, -74) > A.moonAltitude(new Date(moonDay.rise.getTime() - 600000), 40.7, -74));
    if (moonDay.set) check("at moonset it's sinking", A.moonAltitude(new Date(moonDay.set.getTime() + 600000), 40.7, -74) < A.moonAltitude(new Date(moonDay.set.getTime() - 600000), 40.7, -74));
    const nextPhases = A.nextMoonPhases(new Date(Date.UTC(2024, 0, 20)));
    near("the next full moon from Jan 20, 2024 is Jan 25 (days)", (nextPhases.full - Date.UTC(2024, 0, 25, 17, 54)) / 86400000, 0, 1);
    check("a full moon is lit at the time given", A.moonPhase(nextPhases.full).illumination > 0.97);

    // Meteor showers, including one across New Year.
    equal("on Nov 9 the Leonids are active", A.activeShowers(new Date(2026, 10, 9)).map(shower => `${shower.name} ${shower.days}`).join(), "Leonids 8");
    equal("on Dec 30 the Quadrantids peak in 4 days", A.activeShowers(new Date(2026, 11, 30)).map(shower => `${shower.name} ${shower.days}`).join(), "Quadrantids 4");
    equal("and on Jan 2 in 1", A.activeShowers(new Date(2027, 0, 2))[0].days, 1);
    equal("none in early June", A.activeShowers(new Date(2026, 5, 3)).length, 0);

    // Composers born today: a well-formed list.
    const composers = globalThis.ASCSComposers;
    check("composers: every entry has a real date, a name and a year", composers.every(([day, name, year]) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day) && typeof name === "string" && name.length > 3 && year > 1000 && year < 2000));
    check("composers: none twice", new Set(composers.map(entry => entry[1])).size === composers.length);
    equal("composers: born on Dec 16", A.bornOn(composers, new Date(2026, 11, 16)).map(entry => entry[1]).join(), "Ludwig van Beethoven,Zoltán Kodály");
    equal("composers: in the rotating line", A.rotationItem({ composers: A.bornOn(composers, new Date(2026, 0, 27)) }, 0).text, "Wolfgang Amadeus Mozart, in 1756");
    equal("the moon in the rotating line", A.rotationItem({ moon: "Full moon on Sat, Nov 21." }, 0).label, "The moon");

    // Weather (2.0.0): Open-Meteo's reply, read strictly.
    const reply = { current: { temperature_2m: 48.3, apparent_temperature: 44.1, relative_humidity_2m: 61, weather_code: 3, wind_speed_10m: 9.4 },
        daily: { time: ["2026-11-09", "2026-11-10", "2026-11-11"], temperature_2m_max: [52, 55, 49], temperature_2m_min: [40, 43, 38], weather_code: [3, 61, 0], precipitation_probability_max: [10, 80, 0] } };
    const weather = A.parseWeather(JSON.stringify(reply));
    equal("weather: the temperature now", weather.current.temperature, 48.3);
    equal("weather: three days", weather.days.map(day => `${day.date} ${day.high}/${day.low} ${A.weatherName(day.code)} ${day.rain}%`).join("; "), "2026-11-09 52/40 Cloudy 10%; 2026-11-10 55/43 Light rain 80%; 2026-11-11 49/38 Clear 0%");
    equal("weather: not JSON", A.parseWeather("<html>"), null);
    equal("weather: the location's time zone (2.3.0)", A.parseWeather(JSON.stringify({ ...reply, timezone: "America/New_York" })).zone, "America/New_York");
    equal("weather: no time zone named", A.parseWeather(JSON.stringify(reply)).zone, "");
    equal("weather: a missing reading", A.parseWeather(JSON.stringify({ current: { ...reply.current, temperature_2m: "48" }, daily: reply.daily })), null);
    equal("weather: a reading out of range", A.parseWeather(JSON.stringify({ current: { ...reply.current, relative_humidity_2m: 400 }, daily: reply.daily })), null);
    equal("weather: an unknown code", A.parseWeather(JSON.stringify({ current: { ...reply.current, weather_code: 3.5 }, daily: reply.daily })), null);
    equal("weather: a day with a bad date is dropped", A.parseWeather(JSON.stringify({ ...reply, daily: { ...reply.daily, time: ["<b>x</b>", "2026-11-10", "2026-11-11"] } })).days.length, 2);
    equal("weather: markup in a field isn't kept", JSON.stringify(A.parseWeather(JSON.stringify({ ...reply, extra: "<script>" }))).includes("script"), false);
    equal("weather: a name for every code", A.weatherName(95), "Thunderstorms");
    equal("weather: and a fallback", A.weatherName(42), "Unknown");
})();
