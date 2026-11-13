"use strict";

(function () {
    const C = globalThis.ASCSCalendar;
    const { check, equal } = globalThis.TestHarness;
    const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
    const ymdhm = ms => { const t = new Date(ms); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };
    const cal = (...lines) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...lines, "END:VCALENDAR"].join("\r\n");
    const ev = (...lines) => ["BEGIN:VEVENT", "UID:test-1", ...lines, "END:VEVENT"];

    // Reading
    equal("unfold: continuation lines", C.unfold("SUMMARY:Long\r\n  title\r\nUID:x").join("|"), "SUMMARY:Long title|UID:x");
    const line = C.parseLine('ATTENDEE;CN="Doe; John":mailto:j@example.com');
    equal("line: quoted parameter with ; and :", `${line.name}|${line.params.CN}|${line.value}`, "ATTENDEE|Doe; John|mailto:j@example.com");
    equal("text: escapes", C.unescapeText("a\\, b\\; c\\nd\\\\e"), "a, b; c\nd\\e");
    equal("text: escape round trip", C.unescapeText(C.escapeText("Dinner; Mom, Dad\nback\\slash")), "Dinner; Mom, Dad\nback\\slash");
    const long = "DESCRIPTION:" + "é".repeat(60);
    check("fold: lines at most 75 octets", C.fold(long).split("\r\n").every(part => new TextEncoder().encode(part).length <= 75));
    equal("fold: unfolds back", C.unfold(C.fold(long)).join(""), long);

    const timed = C.readResource(cal(...ev("DTSTART:20261110T150000", "DTEND:20261110T163000", "SUMMARY:Dentist\\, Dr. Lee", "LOCATION:Main St")));
    equal("event: floating time is local", ymdhm(timed.master.start), "2026-11-10 15:00");
    equal("event: summary unescaped", timed.master.summary, "Dentist, Dr. Lee");
    equal("event: length", (timed.master.end - timed.master.start) / 60000, 90);
    const allDay = C.readResource(cal(...ev("DTSTART;VALUE=DATE:20261225", "DTEND;VALUE=DATE:20261226", "SUMMARY:Christmas")));
    equal("event: all-day", `${allDay.master.allDay} ${ymdhm(allDay.master.start)}`, "true 2026-12-25 00:00");
    const utc = C.readResource(cal(...ev("DTSTART:20261110T200000Z", "DURATION:PT1H")));
    equal("event: UTC instant", new Date(utc.master.start).toISOString(), "2026-11-10T20:00:00.000Z");
    equal("event: DURATION", (utc.master.end - utc.master.start) / 60000, 60);
    const tokyo = C.readResource(cal(...ev("DTSTART;TZID=Asia/Tokyo:20261111T090000", "DTEND;TZID=Asia/Tokyo:20261111T100000")));
    equal("event: another time zone (Tokyo 09:00 = 00:00 UTC)", new Date(tokyo.master.start).toISOString(), "2026-11-11T00:00:00.000Z");
    const la = C.readResource(cal(...ev("DTSTART;TZID=America/Los_Angeles:20260701T120000", "DTEND;TZID=America/Los_Angeles:20260701T130000")));
    equal("event: summer time in another zone (LA noon in July = 19:00 UTC)", new Date(la.master.start).toISOString(), "2026-07-01T19:00:00.000Z");
    const unknownZone = C.readResource(cal(...ev("DTSTART;TZID=Eastern Standard Time:20261110T150000", "DTEND;TZID=Eastern Standard Time:20261110T160000")));
    equal("event: an unknown zone name is read as local time", ymdhm(unknownZone.master.start), "2026-11-10 15:00");
    equal("event: garbage", C.readResource("not a calendar"), null);
    equal("event: no start", C.readResource(cal(...ev("SUMMARY:x"))), null);

    // Reminders
    const withAlarm = C.readResource(cal("BEGIN:VEVENT", "UID:a", "DTSTART:20261110T150000", "DTEND:20261110T160000", "SUMMARY:Dentist",
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "END:VALARM", "END:VEVENT"));
    const due = C.reminders(withAlarm, local(2026, 11, 10, 14, 0), local(2026, 11, 10, 16, 0));
    equal("reminder: 15 minutes before", due.length && ymdhm(due[0].at), "2026-11-10 14:45");
    equal("reminder: outside the window", C.reminders(withAlarm, local(2026, 11, 11), local(2026, 11, 12)).length, 0);
    equal("trigger: minutes / hours / days", [15, 60, 1440, 0].map(C.formatTrigger).join(" "), "-PT15M -PT1H -P1D PT0S");
    equal("duration: parsed", C.parseDuration("-P1DT2H"), -(26 * 3600000));

    // Repeats
    const starts = (lines, from, to) => C.occurrences(C.readResource(cal(...ev(...lines))), from, to).map(o => ymdhm(o.start));
    equal("weekly: Tue and Thu", starts(["DTSTART:20261103T090000", "DTEND:20261103T100000", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH"], local(2026, 11, 1), local(2026, 11, 13)).join(", "),
        "2026-11-03 09:00, 2026-11-05 09:00, 2026-11-10 09:00, 2026-11-12 09:00");
    equal("weekly: stays at 09:00 across the end of daylight saving (1 Nov 2026)",
        starts(["DTSTART:20261026T090000", "DTEND:20261026T100000", "RRULE:FREQ=WEEKLY"], local(2026, 10, 20), local(2026, 11, 10)).join(", "),
        "2026-10-26 09:00, 2026-11-02 09:00, 2026-11-09 09:00");
    equal("weekly: every 2 weeks, count 3", starts(["DTSTART:20261102T180000", "DTEND:20261102T190000", "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3"], local(2026, 1, 1), local(2027, 6, 1)).join(", "),
        "2026-11-02 18:00, 2026-11-16 18:00, 2026-11-30 18:00");
    equal("daily: until (inclusive)", starts(["DTSTART:20261101T070000", "DTEND:20261101T073000", "RRULE:FREQ=DAILY;UNTIL=20261103T120000Z"], local(2026, 10, 1), local(2026, 12, 1)).length, 3);
    equal("daily: skipped dates", starts(["DTSTART:20261101T070000", "DTEND:20261101T073000", "RRULE:FREQ=DAILY;COUNT=4", "EXDATE:20261102T070000"], local(2026, 10, 1), local(2026, 12, 1)).join(", "),
        "2026-11-01 07:00, 2026-11-03 07:00, 2026-11-04 07:00");
    equal("monthly: the 31st skips short months", starts(["DTSTART:20260131T120000", "DTEND:20260131T130000", "RRULE:FREQ=MONTHLY;COUNT=4"], local(2026, 1, 1), local(2027, 1, 1)).join(", "),
        "2026-01-31 12:00, 2026-03-31 12:00, 2026-05-31 12:00, 2026-07-31 12:00");
    equal("monthly: 2nd Tuesday", starts(["DTSTART:20261110T190000", "DTEND:20261110T200000", "RRULE:FREQ=MONTHLY;BYDAY=2TU"], local(2026, 11, 1), local(2027, 2, 1)).join(", "),
        "2026-11-10 19:00, 2026-12-08 19:00, 2027-01-12 19:00");
    equal("monthly: last Friday", starts(["DTSTART:20261127T170000", "DTEND:20261127T180000", "RRULE:FREQ=MONTHLY;BYDAY=-1FR"], local(2026, 11, 1), local(2027, 2, 1)).join(", "),
        "2026-11-27 17:00, 2026-12-25 17:00, 2027-01-29 17:00");
    equal("yearly: 29 February only in leap years", starts(["DTSTART;VALUE=DATE:20280229", "DTEND;VALUE=DATE:20280301", "RRULE:FREQ=YEARLY"], local(2028, 1, 1), local(2033, 1, 1)).join(", "),
        "2028-02-29 00:00, 2032-02-29 00:00");
    equal("yearly: birthdays (all-day)", starts(["DTSTART;VALUE=DATE:19900315", "DTEND;VALUE=DATE:19900316", "RRULE:FREQ=YEARLY"], local(2026, 1, 1), local(2028, 1, 1)).join(", "),
        "2026-03-15 00:00, 2027-03-15 00:00");
    const overridden = C.readResource(cal(...ev("DTSTART:20261103T090000", "DTEND:20261103T100000", "RRULE:FREQ=WEEKLY;COUNT=3", "SUMMARY:Standup"),
        "BEGIN:VEVENT", "UID:test-1", "RECURRENCE-ID:20261110T090000", "DTSTART:20261110T113000", "DTEND:20261110T123000", "SUMMARY:Standup (moved)", "END:VEVENT"));
    equal("override: a moved occurrence replaces the original", C.occurrences(overridden, local(2026, 11, 1), local(2026, 12, 1)).map(o => `${ymdhm(o.start)} ${o.event.summary}`).join(", "),
        "2026-11-03 09:00 Standup, 2026-11-10 11:30 Standup (moved), 2026-11-17 09:00 Standup");
    equal("rule: round trip", C.formatRrule(C.parseRrule("FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;COUNT=5")), "FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;COUNT=5");
    equal("rule: unknown frequency ignored", C.parseRrule("FREQ=SECONDLY"), null);
    check("rule: a daily rule from long ago stays bounded", starts(["DTSTART:19000101T000000", "DTEND:19000101T010000", "RRULE:FREQ=DAILY"], local(2026, 1, 1), local(2026, 1, 2)).length <= 1);

    const skipped = C.skipOccurrence(C.serializeComponent(overridden.calendar), local(2026, 11, 10, 9, 0));
    equal("skip one: the moved override is gone and the date skipped", C.occurrences(C.readResource(skipped), local(2026, 11, 1), local(2026, 12, 1)).map(o => ymdhm(o.start)).join(", "),
        "2026-11-03 09:00, 2026-11-17 09:00");
    const skipped2 = C.skipOccurrence(C.serializeComponent(overridden.calendar), local(2026, 11, 17, 9, 0));
    equal("skip one: a plain occurrence", C.occurrences(C.readResource(skipped2), local(2026, 11, 1), local(2026, 12, 1)).length, 2);
    equal("skip one: keeps the series' reminder settings untouched", C.skipOccurrence(withAlarm.calendar ? C.serializeComponent(withAlarm.calendar) : "", local(2026, 11, 10, 15)).includes("TRIGGER:-PT15M"), true);

    // Writing
    const fresh = C.newResource("ascs-test@ascs", { summary: "Raid night; bring snacks", location: "", description: "Line one\nLine two", start: local(2026, 11, 12, 20, 0), end: local(2026, 11, 12, 23, 0), allDay: false, rrule: { freq: "WEEKLY", interval: 1, byday: [{ n: 0, day: 4 }] }, exdates: [], reminder: 30 }, Date.UTC(2026, 10, 3, 12));
    const back = C.readResource(fresh);
    equal("new: reads back", `${back.master.summary}|${ymdhm(back.master.start)}|${back.master.rrule.freq}|${back.master.alarms[0].offset / 60000}`, "Raid night; bring snacks|2026-11-12 20:00|WEEKLY|-30");
    equal("new: multi-line notes", back.master.description, "Line one\nLine two");
    check("new: CRLF line endings and a PRODID", /\r\nPRODID:-\/\/Aeolionware\/\/ASCS/.test(fresh) && !/[^\r]\n/.test(fresh));
    const iphone = cal("BEGIN:VTIMEZONE", "TZID:America/New_York", "END:VTIMEZONE", "BEGIN:VEVENT", "UID:iphone-1", "DTSTART;TZID=America/New_York:20261110T150000",
        "DTEND;TZID=America/New_York:20261110T160000", "SUMMARY:From the phone", "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC", "ATTENDEE;CN=Sam:mailto:sam@example.com",
        "SEQUENCE:2", "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "END:VALARM", "END:VEVENT");
    const edited = C.editResource(iphone, { summary: "Edited in ASCS", location: "", description: "", start: local(2026, 11, 10, 16, 0), end: local(2026, 11, 10, 17, 0), allDay: false, rrule: null, exdates: [] });
    check("edit: keeps the phone's own properties and attendees", edited.includes("X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC") && edited.includes("ATTENDEE;CN=Sam:mailto:sam@example.com"));
    check("edit: keeps the time zone component", edited.includes("BEGIN:VTIMEZONE"));
    check("edit: keeps the alarm when the reminder isn't changed", edited.includes("TRIGGER:-PT10M"));
    equal("edit: bumps SEQUENCE", /SEQUENCE:3/.test(edited), true);
    equal("edit: new title and time", (r => `${r.master.summary} ${ymdhm(r.master.start)}`)(C.readResource(edited)), "Edited in ASCS 2026-11-10 16:00");
    const noAlarm = C.editResource(iphone, { summary: "x", start: local(2026, 11, 10, 16), end: local(2026, 11, 10, 17), allDay: false, rrule: null, exdates: [], reminder: null });
    equal("edit: removing the reminder", noAlarm.includes("VALARM"), false);
    check("uid: shape", /^ascs-\d{14}-[0-9a-f]{8}$/.test(C.uidNew(Date.UTC(2026, 10, 3), () => 0.5)));

    // Server replies
    const xml = `<?xml version="1.0"?><multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:ICAL="http://apple.com/ns/ical/">
        <response><href>/ascs/</href><propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response>
        <response><href>/ascs/gaming/</href><propstat><prop><resourcetype><collection/><C:calendar/></resourcetype><displayname>Gaming &amp; Retro</displayname><ICAL:calendar-color>#E3C072FF</ICAL:calendar-color></prop><status>HTTP/1.1 200 OK</status></propstat>
        <propstat><prop><getctag/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response>
        <response><href>/ascs/gaming/a%40ascs.ics</href><propstat><prop><getetag>"e1"</getetag><C:calendar-data>BEGIN:VCALENDAR&#13;
END:VCALENDAR</C:calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
    const responses = C.parseMultistatus(xml);
    equal("multistatus: calendars found", responses.filter(r => r.isCalendar).map(r => `${r.href} ${r.displayName} ${r.color}`).join(), "/ascs/gaming/ Gaming & Retro #E3C072FF");
    equal("multistatus: event data and version", `${responses[2].href} ${responses[2].etag} ${responses[2].data.startsWith("BEGIN:VCALENDAR")}`, '/ascs/gaming/a@ascs.ics "e1" true');
    equal("multistatus: garbage", C.parseMultistatus("<not xml").length, 0);

    // Quick add (reference: Tuesday 3 November 2026, 10:00)
    const ref = local(2026, 11, 3, 10, 0);
    const qa = text => { const r = C.parseQuickAdd(text, ref); return r ? `${r.summary} | ${ymdhm(r.start)}${r.allDay ? " all day" : ` – ${ymdhm(r.end).slice(11)}`}${r.calendar ? ` #${r.calendar}` : ""}` : null; };
    equal("quick add: weekday and time", qa("Dentist tue 3pm"), "Dentist | 2026-11-03 15:00 – 16:00");
    equal("quick add: today's weekday with a time already gone means next week", qa("Dentist tue 9am"), "Dentist | 2026-11-10 09:00 – 10:00");
    equal("quick add: 'this' keeps today", qa("Dentist this tue 9am"), "Dentist | 2026-11-03 09:00 – 10:00");
    equal("quick add: a range with one meridiem", qa("PSO raid fri 8-11pm #gaming"), "PSO raid | 2026-11-06 20:00 – 23:00 #gaming");
    equal("quick add: across noon", qa("Workshop thu 11-2pm"), "Workshop | 2026-11-05 11:00 – 14:00");
    equal("quick add: tomorrow at a bare hour (afternoon)", qa("Call Sam tomorrow at 3"), "Call Sam | 2026-11-04 15:00 – 16:00");
    equal("quick add: a bare morning hour", qa("Gym at 9 thursday"), "Gym | 2026-11-05 09:00 – 10:00");
    equal("quick add: 24-hour time and a length", qa("Standup 09:30 for 15m"), "Standup | 2026-11-04 09:30 – 09:45");
    equal("quick add: a time already past today means tomorrow", qa("Coffee 8am"), "Coffee | 2026-11-04 08:00 – 09:00");
    equal("quick add: month name, all day", qa("Mom's birthday nov 12"), "Mom's birthday | 2026-11-12 00:00 all day");
    equal("quick add: day before month", qa("Trip 3 Dec"), "Trip | 2026-12-03 00:00 all day");
    equal("quick add: a past date means next year", qa("New year party jan 1"), "New year party | 2027-01-01 00:00 all day");
    equal("quick add: US numeric date", qa("Taxes 4/15 noon"), "Taxes | 2027-04-15 12:00 – 13:00");
    equal("quick add: ISO date", qa("Launch 2026-12-01 at 10:30am for 2h"), "Launch | 2026-12-01 10:30 – 12:30");
    equal("quick add: next friday", qa("Review next fri"), "Review | 2026-11-13 00:00 all day");
    equal("quick add: in N days", qa("Follow up in 10 days"), "Follow up | 2026-11-13 00:00 all day");
    equal("quick add: tonight", qa("Movie tonight"), "Movie | 2026-11-03 19:00 – 20:00");
    equal("quick add: numbers in titles stay", qa("Halo 3 tournament sat"), "Halo 3 tournament | 2026-11-07 00:00 all day");
    equal("quick add: connectors trimmed", qa("Lunch with Sam on wed at 12:30pm"), "Lunch with Sam | 2026-11-04 12:30 – 13:30");
    equal("quick add: overnight range", qa("Stream sat 10pm-2am"), "Stream | 2026-11-07 22:00 – 02:00");
    equal("quick add: no title", C.parseQuickAdd("tomorrow 3pm", ref), null);
    equal("quick add: an impossible date isn't a date", qa("Party feb 30"), "Party feb 30 | 2026-11-03 00:00 all day");

    // .ics files
    const file = cal("BEGIN:VTIMEZONE", "TZID:America/New_York", "END:VTIMEZONE",
        "BEGIN:VEVENT", "UID:a@x", "DTSTART;TZID=America/New_York:20261110T090000", "DTEND;TZID=America/New_York:20261110T100000", "RRULE:FREQ=WEEKLY", "SUMMARY:Series", "END:VEVENT",
        "BEGIN:VEVENT", "UID:a@x", "RECURRENCE-ID;TZID=America/New_York:20261117T090000", "DTSTART;TZID=America/New_York:20261117T110000", "DTEND;TZID=America/New_York:20261117T120000", "SUMMARY:Moved", "END:VEVENT",
        "BEGIN:VEVENT", "UID:b@x", "DTSTART;VALUE=DATE:20261201", "DTEND;VALUE=DATE:20261202", "SUMMARY:Other", "END:VEVENT");
    const parts = C.splitIcs(file);
    equal("ics split: one resource per event, overrides kept with their series", parts.map(p => `${p.uid}:${(p.text.match(/BEGIN:VEVENT/g) || []).length}`).join(" "), "a@x:2 b@x:1");
    check("ics split: time zones travel with each resource", parts.every(p => p.text.includes("TZID:America/New_York")));
    equal("ics split: each resource reads back", parts.map(p => C.readResource(p.text).master.summary).join(", "), "Series, Other");
    const joined = C.joinIcs(parts.map(p => p.text), "Gaming, retro");
    equal("ics join: one time zone, all events, the calendar's name", `${(joined.match(/BEGIN:VTIMEZONE/g) || []).length} ${(joined.match(/BEGIN:VEVENT/g) || []).length} ${/X-WR-CALNAME:Gaming\\, retro/.test(joined)}`, "1 3 true");
    equal("ics split: not a calendar", C.splitIcs("hello").length, 0);
    equal("resource name: a safe id is used as it is", C.resourceNameFor("imp-1@example.com"), "imp-1@example.com");
    check("resource name: an unsafe id gets a safe, stable name", /^imp-[0-9a-f]{16}$/.test(C.resourceNameFor("not a valid/name")) && C.resourceNameFor("not a valid/name") === C.resourceNameFor("not a valid/name"));
    check("resource name: different ids, different names", C.resourceNameFor("a/b") !== C.resourceNameFor("a/c"));

    // Spanning bars
    const sunday = local(2026, 11, 1);
    const span = (id, startDay, endDayExclusive, allDay = true) => ({ id, start: local(2026, 11, startDay), end: local(2026, 11, endDayExclusive), allDay });
    equal("spans: all-day", C.spansDays(span("a", 3, 4)), true);
    equal("spans: a timed event crossing midnight", C.spansDays({ start: local(2026, 11, 3, 22), end: local(2026, 11, 4, 2), allDay: false }), true);
    equal("spans: a timed event within a day", C.spansDays({ start: local(2026, 11, 3, 9), end: local(2026, 11, 3, 17), allDay: false }), false);
    equal("spans: ending exactly at midnight stays on its day", C.spansDays({ start: local(2026, 11, 3, 22), end: local(2026, 11, 4, 0), allDay: false }), false);
    const bars = C.layoutSpans([span("trip", 5, 10), span("conf", 2, 4), span("talk", 3, 4), span("before", 28 - 30, 3)], sunday, 7);
    const describe = id => { const b = bars.find(x => x.id === id); return `${b.startCol}-${b.endCol} lane ${b.lane}${b.continuesBefore ? " <" : ""}${b.continuesAfter ? " >" : ""}`; };
    equal("spans: a trip into next week continues with an arrow", describe("trip"), "4-6 lane 0 >");
    equal("spans: started last week continues from the left", describe("before"), "0-1 lane 0 <");
    equal("spans: overlapping bars take separate lanes, and a lane is reused once free", `${describe("before")} | ${describe("conf")} | ${describe("talk")}`, "0-1 lane 0 < | 1-2 lane 1 | 2-2 lane 0");
    const nextWeek = C.layoutSpans([span("trip", 5, 10)], local(2026, 11, 8), 7);
    equal("spans: the next week picks the trip up from the left", `${nextWeek[0].startCol}-${nextWeek[0].endCol}${nextWeek[0].continuesBefore ? " <" : ""}${nextWeek[0].continuesAfter ? " >" : ""}`, "0-1 <");
    equal("spans: outside the row", C.layoutSpans([span("x", 20, 22)], sunday, 7).length, 0);
    equal("spans: across the end of daylight saving (1 Nov)", C.layoutSpans([span("dst", 1, 3)], local(2026, 10, 25), 14).map(b => `${b.startCol}-${b.endCol}`).join(), "7-8");

    // Countdowns as all-day days
    const days = list => list.map(d => `${new Date(d.start).toDateString().slice(4)} ${d.name}`).join(", ");
    const countdowns = [{ date: "12-25", name: "Christmas" }, { date: "2026-11-26", name: "Thanksgiving" }, { date: "02-29", name: "Leap day" },
        { date: "13-40", name: "Impossible" }, { date: "2026-02-30", name: "Also impossible" }, { date: "11-10", name: "  " }];
    equal("countdowns: yearly and one-off in range", days(C.countdownDays(countdowns, local(2026, 11, 1), local(2027, 1, 1))), "Nov 26 2026 Thanksgiving, Dec 25 2026 Christmas");
    equal("countdowns: yearly repeats every year", days(C.countdownDays(countdowns, local(2027, 12, 1), local(2029, 1, 1)).filter(d => d.name === "Christmas")), "Dec 25 2027 Christmas, Dec 25 2028 Christmas");
    // Next Up (2.2.0): by day, a day's all-day events first, ended ones left out.
    const occ = (name, start, end, allDay = false) => ({ name, start, end, allDay });
    const coming = [
        occ("Thanksgiving", local(2026, 11, 26), local(2026, 11, 27), true),
        occ("Veterans Day", local(2026, 11, 11), local(2026, 11, 12), true),
        occ("Family visit", local(2026, 11, 20, 18), local(2026, 11, 20, 20)),
        occ("Dinner", local(2026, 11, 12, 19), local(2026, 11, 12, 21)),
        occ("Lunch", local(2026, 11, 12, 12), local(2026, 11, 12, 13)),
        occ("Trip", local(2026, 11, 12), local(2026, 11, 15), true),
        occ("Standup", local(2026, 11, 12, 9), local(2026, 11, 12, 9, 30)),
        occ("Late call", local(2026, 11, 11, 23), local(2026, 11, 12, 16))
    ];
    const names = list => list.map(item => item.name).join(", ");
    const noon = local(2026, 11, 12, 12, 30);
    equal("next up: by day, all-day first, ended left out", names(C.nextUp(coming, noon, 10)), "Late call, Trip, Lunch, Dinner, Family visit, Thanksgiving");
    equal("next up: a holiday weeks out doesn't push out tonight", names(C.nextUp(coming, noon, 3)), "Late call, Trip, Lunch");
    equal("next up: five by default", C.nextUp(coming, local(2026, 11, 1)).length, 5);
    equal("next up: the list given isn't reordered", coming[0].name, "Thanksgiving");
    equal("countdowns: a one-off appears once",C.countdownDays(countdowns, local(2027, 11, 1), local(2028, 1, 1)).some(d => d.name === "Thanksgiving"), false);
    equal("countdowns: 02-29 on leap years only", days(C.countdownDays(countdowns, local(2026, 1, 1), local(2029, 1, 1)).filter(d => d.name === "Leap day")), "Feb 29 2028 Leap day");
    const christmas = C.countdownDays(countdowns, local(2026, 12, 25), local(2026, 12, 26))[0];
    equal("countdowns: a whole local day", `${christmas.start === local(2026, 12, 25)} ${christmas.end === local(2026, 12, 26)} ${christmas.date}`, "true true 12-25");
    equal("countdowns: nothing given", C.countdownDays(undefined, local(2026, 1, 1), local(2027, 1, 1)).length, 0);

    // Week layout
    const lanes = C.layoutDay([{ id: "a", start: 9, end: 11 }, { id: "b", start: 10, end: 12 }, { id: "c", start: 11, end: 12 }, { id: "d", start: 13, end: 14 }]);
    equal("layout: overlapping events side by side", lanes.map(p => `${p.id}${p.lane}/${p.lanes}`).join(" "), "a0/2 b1/2 c0/2 d0/1");

    // Dragging in Day and Week (1.8.0): 15-minute steps, kept within the day.
    equal("drag: snaps to the nearest 15 minutes", [C.snapStart(607, 0, 60), C.snapStart(608, 0, 60), C.snapStart(622, 0, 60)].join(), "600,615,615");
    equal("drag: where it was grabbed is kept", C.snapStart(630, 25, 60), 600);
    equal("drag: not before midnight", C.snapStart(5, 40, 60), 0);
    equal("drag: the end stays within the day", C.snapStart(1430, 0, 90), 1350);
    equal("drag: a 50-minute event can start at 11 PM", C.snapStart(1439, 0, 50), 1380);
    equal("drag: other steps", C.snapStart(611, 0, 30, 5), 610);

    // 1.9.0: resizing
    equal("resize: the end snaps to 15 minutes", C.resizeEdge(667, 540, "end"), 660);
    equal("resize: at least one step long", C.resizeEdge(500, 540, "end"), 555);
    equal("resize: the end stays within the day", C.resizeEdge(1500, 540, "end"), 1440);
    equal("resize: the start snaps", C.resizeEdge(488, 600, "start"), 495);
    equal("resize: the start keeps one step", C.resizeEdge(700, 600, "start"), 585);
    equal("resize: not before midnight", C.resizeEdge(-40, 600, "start"), 0);

    // 1.9.0: moving between days in Month
    equal("days: forward", C.daysBetween(new Date(2026, 10, 4, 15).getTime(), new Date(2026, 10, 12, 1).getTime()), 8);
    equal("days: backward", C.daysBetween(new Date(2026, 10, 4).getTime(), new Date(2026, 9, 30).getTime()), -5);
    equal("days: across daylight saving", C.daysBetween(new Date(2026, 2, 7).getTime(), new Date(2026, 2, 9).getTime()), 2);
    const moved = new Date(C.shiftDays(new Date(2026, 2, 6, 15, 30).getTime(), 3));
    equal("days: the clock time is kept across daylight saving", `${moved.getDate()} ${moved.getHours()}:${moved.getMinutes()}`, "9 15:30");

    // 1.9.0: the wheel time picker
    equal("time: parts", JSON.stringify(C.timeParts("14:05")), JSON.stringify({ hour: 2, minute: 5, meridiem: "PM" }));
    equal("time: midnight is 12 AM", C.timeParts("00:30").hour + C.timeParts("00:30").meridiem, "12AM");
    equal("time: noon is 12 PM", C.timeParts("12:00").hour + C.timeParts("12:00").meridiem, "12PM");
    equal("time: hour up crosses into PM", C.stepTime("11:30", "hour", 1), "12:30");
    equal("time: hour wraps at midnight", C.stepTime("23:15", "hour", 1), "00:15");
    equal("time: hour down", C.stepTime("00:15", "hour", -1), "23:15");
    equal("time: minutes step by 5", C.stepTime("09:30", "minute", 1), "09:35");
    equal("time: minutes snap up first", C.stepTime("09:07", "minute", 1), "09:10");
    equal("time: minutes snap down first", C.stepTime("09:07", "minute", -1), "09:05");
    equal("time: minutes carry into the hour", C.stepTime("09:55", "minute", 1), "10:00");
    equal("time: minutes borrow from the hour", C.stepTime("10:00", "minute", -1), "09:55");
    equal("time: AM to PM", C.stepTime("09:30", "meridiem", 1), "21:30");
    equal("time: PM to AM either way", C.stepTime("21:30", "meridiem", -1), "09:30");
    equal("time: nothing to read starts at 9 AM", C.stepTime("", "minute", 0), "09:00");
    equal("time: typed hour keeps PM", C.setTimePart("14:20", "hour", 3), "15:20");
    equal("time: typed 12 in the morning is midnight", C.setTimePart("09:20", "hour", 12), "00:20");
    equal("time: typed minute", C.setTimePart("14:20", "minute", 45), "14:45");
    equal("time: typed PM", C.setTimePart("09:20", "meridiem", "PM"), "21:20");
    equal("time: out of range is ignored", C.setTimePart("09:20", "minute", 75), "09:20");

    // 1.9.0: the wheel date picker
    equal("date: parts", JSON.stringify(C.dateParts("2026-11-05")), JSON.stringify({ month: 11, day: 5, year: 2026 }));
    equal("date: day up", C.stepDate("2026-11-05", "day", 1), "2026-11-06");
    equal("date: day carries into the next month", C.stepDate("2026-11-30", "day", 1), "2026-12-01");
    equal("date: day carries into the next year", C.stepDate("2026-12-31", "day", 1), "2027-01-01");
    equal("date: day borrows from the month before", C.stepDate("2026-03-01", "day", -1), "2026-02-28");
    equal("date: month keeps the day where it can", C.stepDate("2026-01-31", "month", 1), "2026-02-28");
    equal("date: month across the year", C.stepDate("2026-12-15", "month", 1), "2027-01-15");
    equal("date: month back across the year", C.stepDate("2026-01-15", "month", -1), "2025-12-15");
    equal("date: year from a leap day", C.stepDate("2028-02-29", "year", 1), "2029-02-28");
    equal("date: not past 2100", C.stepDate("2100-06-01", "year", 1), "2100-06-01");
    equal("date: typed month keeps the day where it can", C.setDatePart("2026-03-31", "month", 4), "2026-04-30");
    equal("date: typed day", C.setDatePart("2026-11-05", "day", 23), "2026-11-23");
    equal("date: a day the month lacks is ignored", C.setDatePart("2026-02-10", "day", 30), "2026-02-10");
    equal("date: typed year", C.setDatePart("2026-11-05", "year", 2027), "2027-11-05");
    equal("date: a year out of range is ignored", C.setDatePart("2026-11-05", "year", 1850), "2026-11-05");
    equal("date: nothing to read stays empty", C.stepDate("", "day", 1), "");

    // 1.9.0: "Only this one" stays in its series (an override)
    const weekly = { summary: "Standup", location: "", description: "", start: new Date(2026, 10, 2, 9, 30).getTime(), end: new Date(2026, 10, 2, 9, 45).getTime(),
        allDay: false, rrule: { freq: "WEEKLY", interval: 1, byday: [] }, exdates: [], reminder: 5 };
    const seriesText = C.newResource("standup@ascs", weekly, 0);
    const second = new Date(2026, 10, 9, 9, 30).getTime();
    const changed = { ...C.fieldsOf(C.readResource(seriesText).master), start: new Date(2026, 10, 9, 11, 0).getTime(), end: new Date(2026, 10, 9, 11, 30).getTime(), rrule: null };
    const withOverride = C.overrideOccurrence(seriesText, second, changed, 0);
    const parsedOverride = C.readResource(withOverride);
    equal("override: kept in the same resource", parsedOverride.overrides.length, 1);
    equal("override: it replaces that date", parsedOverride.overrides[0].recurrenceId, second);
    equal("override: same UID as the series", parsedOverride.overrides[0].uid, parsedOverride.master.uid);
    const week = C.occurrences(parsedOverride, new Date(2026, 10, 8).getTime(), new Date(2026, 10, 10).getTime());
    equal("override: shown at its new time, once", week.map(o => new Date(o.start).getHours()).join(), "11");
    equal("override: still knows its date in the series", week[0].original, second);
    equal("override: the series keeps no gap (no EXDATE)", parsedOverride.master.exdates.length, 0);
    const changedAgain = C.overrideOccurrence(withOverride, second, { ...changed, summary: "Standup (long)" }, 0);
    equal("override: changing it again edits the same override", C.readResource(changedAgain).overrides.length, 1);
    const putBack = C.overrideOccurrence(withOverride, second, { ...changed, start: second, end: second + 15 * 60000 }, 0);
    equal("override: back exactly as the series has it rejoins", C.readResource(putBack).overrides.length, 0);
    equal("override: a different title doesn't count as back", C.readResource(C.overrideOccurrence(withOverride, second, { ...changed, start: second, end: second + 15 * 60000, summary: "Other" }, 0)).overrides.length, 1);
    equal("override: Back to the series", C.readResource(C.restoreOccurrence(withOverride, second)).overrides.length, 0);
    const later = ms => ms + 3600000;
    const shifted = C.readResource(C.moveOverrides(withOverride, later, null, null, 0));
    equal("override: moves with the series (its date)", shifted.overrides[0].recurrenceId, later(second));
    equal("override: moves with the series (its own time)", new Date(shifted.overrides[0].start).getHours(), 12);
    const editedOne = C.readResource(C.moveOverrides(withOverride, later, second, { ...changed, summary: "Renamed", start: later(changed.start), end: later(changed.end) }, 0));
    equal("override: the edited one takes the edit", editedOne.overrides[0].summary, "Renamed");
})();
