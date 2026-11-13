"use strict";
// The Command Center's added modules (2.0.0): Weather, Top Apps, Network, Audio,
// Controllers, Pinned Notes, Recent Unlocks and Timer. Each starts hidden; Arrange
// shows it. What a module needs is asked for only while it shows.

const homeShowing = id => $("home").classList.contains("active") && !homeModule(id)?.hidden && !windowIsHidden;

// ---- polling: weather every 10 minutes (Maestro answers from a 30-minute
// cache), network and apps every 3 seconds, while their modules show.

let homeExtrasTimer = null;
let homeStatsSoon = null;
let weatherAskedAt = 0;

function askHomeExtras(force = false) {
    if (homeShowing("weather") && (force || Date.now() - weatherAskedAt > 600000)) {
        weatherAskedAt = Date.now();
        send("GetWeather");
    }
    const stats = ["network", "processes"].filter(homeShowing);
    if (stats.length) send("GetHomeStats", stats.join(","));
    // Network and Top Apps are rates, so a first reading only starts one. On
    // opening, the second comes a second later, not at the next poll, so they
    // fill while the start screen is still up (2.2.0).
    if (force && stats.length) {
        clearTimeout(homeStatsSoon);
        homeStatsSoon = setTimeout(() => {
            const showing = ["network", "processes"].filter(homeShowing);
            if (showing.length) send("GetHomeStats", showing.join(","));
        }, 1000);
    }
}

function startHomeExtras() {
    stopHomeExtras();
    askHomeExtras(true);
    homeExtrasTimer = setInterval(() => {
        if (!$("home").classList.contains("active")) stopHomeExtras();
        else askHomeExtras();
    }, 3000);
}

function stopHomeExtras() {
    if (homeExtrasTimer !== null) clearInterval(homeExtrasTimer);
    homeExtrasTimer = null;
    clearTimeout(homeStatsSoon);
}

// ---- Weather

const weatherState = { enabled: null, data: null, error: "" };

function renderHomeWeather() {
    const box = $("homeWeather");
    if (!box) return;
    if (weatherState.enabled === false) {
        box.replaceChildren(element("p", "module-empty", "Weather is off. Turn it on in Today's Settings."));
        return;
    }
    const data = weatherState.data;
    if (!data) {
        box.replaceChildren(weatherState.error ? element("p", "module-empty", weatherState.error) : placeholder("lines", 3));
        return;
    }
    const now = element("div", "weather-now");
    now.append(element("strong", "weather-temp", `${Math.round(data.current.temperature)}°`),
        element("span", "weather-condition", Almanac.weatherName(data.current.code)));
    const details = element("p", "weather-details",
        `Feels like ${Math.round(data.current.feelsLike)}° · wind ${Math.round(data.current.wind)} mph · humidity ${Math.round(data.current.humidity)}%`);
    const days = element("ol", "weather-days");
    data.days.forEach((day, index) => {
        const item = element("li", "weather-day");
        const name = index === 0 ? "Today" : new Date(`${day.date}T12:00`).toLocaleDateString("en-US", { weekday: "short" });
        item.append(element("strong", "", name), element("span", "", Almanac.weatherName(day.code)),
            element("span", "weather-range", `${Math.round(day.high)}° / ${Math.round(day.low)}°`),
            element("small", "", Number.isFinite(day.rain) ? `${Math.round(day.rain)}% rain` : ""));
        days.append(item);
    });
    box.replaceChildren(now, details, days);
    box.title = `From Open-Meteo, ${new Date(data.fetched).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

// The weather location's time zone, kept for RetroAchievements' times (2.3.0).
const WEATHER_ZONE_KEY = "maestro.weatherZone";

function weatherZone() {
    try { return Games.cleanZone(localStorage.getItem(WEATHER_ZONE_KEY) || ""); } catch { return ""; }
}

function handleWeather(text) {
    const data = Almanac.parseWeather(text);
    if (data) {
        weatherState.data = { ...data, fetched: Date.now() };
        weatherState.error = "";
        const zone = Games.cleanZone(data.zone);
        if (zone) try { localStorage.setItem(WEATHER_ZONE_KEY, zone); } catch { /* not kept */ }
    } else if (!weatherState.data) {
        weatherState.error = "The weather couldn't be read.";
    }
    renderHomeWeather();
}

// ---- Top Apps and Network

function renderHomeStats(data) {
    if (data.processes && typeof data.processes === "object") {
        const list = (items, unit) => {
            const rows = element("ol", "stat-list");
            (Array.isArray(items) ? items : []).slice(0, 3).forEach(item => {
                if (!item || typeof item.name !== "string" || !Number.isFinite(item.value)) return;
                const row = element("li", "stat-row");
                row.append(element("span", "stat-name", item.name), element("strong", "stat-value", unit(item.value)));
                rows.append(row);
            });
            if (!rows.children.length) rows.append(element("li", "module-empty", "Nothing yet"));
            return rows;
        };
        const memory = value => value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`;
        $("homeProcesses").replaceChildren(
            element("h3", "stat-heading", "Processor"), list(data.processes.cpu, value => `${value < 10 ? value.toFixed(1) : Math.round(value)}%`),
            element("h3", "stat-heading", "Memory"), list(data.processes.memory, memory));
    }
    if (data.network !== undefined) {
        const box = $("homeNetwork");
        const net = data.network;
        if (!net || !Number.isFinite(net.down) || !Number.isFinite(net.up)) {
            box.replaceChildren(element("p", "module-empty", net === null ? "No network connection is up." : "Measuring…"));
            return;
        }
        const speed = bits => bits >= 1e9 ? `${(bits / 1e9).toFixed(1)} Gb/s` : bits >= 1e6 ? `${(bits / 1e6).toFixed(1)} Mb/s` : `${Math.round(bits / 1e3)} kb/s`;
        const reading = (label, value) => {
            const part = element("div", "net-reading");
            part.append(element("small", "", label), element("strong", "", speed(value * 8)));
            return part;
        };
        const readings = element("div", "net-readings");
        readings.append(reading("Download", net.down), reading("Upload", net.up));
        box.replaceChildren(readings, element("p", "module-empty net-name", typeof net.name === "string" ? net.name.slice(0, 80) : ""));
    }
}

// ---- Audio: the same output list as the power tray, and mute

$("homeMute").addEventListener("click", () => send("Launch", "mute"));

// ---- Controllers: what Games already reads

function renderHomeControllers() {
    const list = $("homeControllers");
    if (!list) return;
    const pads = Array.isArray(gamesState.pads) ? gamesState.pads : null;
    if (!pads) {
        list.replaceChildren(placeholderItem("rows", 2));
        return;
    }
    if (!pads.length) {
        list.replaceChildren(element("li", "module-empty", "No controller connected."));
        return;
    }
    list.replaceChildren(...pads.slice(0, 4).map(pad => {
        const row = element("li", "stat-row");
        const power = pad.rumble ? powerText(pad.power) : "";
        row.append(element("span", "stat-name", String(pad.name || "Controller").slice(0, 60)),
            element("small", "stat-value", power || String(pad.connection || "")));
        return row;
    }));
}

// ---- Pinned Notes

function renderHomePinned() {
    const list = $("homePinned");
    if (!list) return;
    if (!notesLoaded) {
        list.replaceChildren(placeholderItem("lines", 3));
        return;
    }
    const pinned = notesData.notes.filter(note => note.pinned).slice(0, 6);
    if (!pinned.length) {
        list.replaceChildren(element("li", "module-empty", "Pin a note in Quick Notes to keep it here."));
        return;
    }
    list.replaceChildren(...pinned.map(note => {
        const item = element("li");
        const button = element("button", "module-row");
        button.type = "button";
        button.append(element("span", "module-row-name", noteLabel(note)));
        button.addEventListener("click", () => openNote(note.id));
        item.append(button);
        return item;
    }));
}

// ---- Recent Unlocks: only once Games has fetched them; this page asks for nothing.

function renderHomeUnlocks() {
    const list = $("homeUnlocks");
    if (!list) return;
    const ra = gamesState.ra;
    if (ra.state !== "ok" || (!ra.summary && !ra.recent)) {
        list.replaceChildren(element("li", "module-empty", "Recent unlocks show once Games has loaded your RetroAchievements."));
        return;
    }
    const achievements = Games.parseRetroAchievements(ra.summary, ra.recent).achievements.slice(0, 4);
    if (!achievements.length) {
        list.replaceChildren(element("li", "module-empty", "No recent unlocks."));
        return;
    }
    list.replaceChildren(...achievements.map(achievement => {
        const item = element("li", "stat-row");
        const copy = element("span", "stat-name");
        copy.append(element("strong", "", achievement.title), element("small", "", achievement.game || ""));
        item.append(copy, element("span", `ra-points${achievement.hardcore ? " is-hardcore" : ""}`, `${achievement.points}`));
        return item;
    }));
}

// ---- Timer and stopwatch. The timer's end is kept by Maestro, which tells you
// even with the window hidden; the page only draws the time left.

const timerState = { mode: "timer", endsAt: 0, length: 300000, watchStart: 0, watchElapsed: 0 };
let timerTick = null;

function formatClock(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const two = value => String(value).padStart(2, "0");
    return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

function renderHomeTimer() {
    const timer = timerState.mode === "timer";
    const now = Date.now();
    const running = timer ? timerState.endsAt > now : timerState.watchStart > 0;
    const shown = timer
        ? (timerState.endsAt ? timerState.endsAt - now : timerState.length)
        : timerState.watchElapsed + (timerState.watchStart ? now - timerState.watchStart : 0);
    $("timerDisplay").textContent = formatClock(shown);
    $("timerDisplay").classList.toggle("is-done", timer && timerState.endsAt > 0 && timerState.endsAt <= now);
    $("timerPresets").hidden = !timer;
    $("timerStart").textContent = running ? (timer ? "Cancel" : "Stop") : "Start";
    $("timerStart").disabled = timer && !running && timerState.length <= 0;
    $("timerReset").hidden = timer || running || !timerState.watchElapsed;
    document.querySelectorAll("#timerModes [data-timer-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.timerMode === timerState.mode)));
    document.querySelectorAll("#timerPresets [data-minutes]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.minutes) * 60000 === timerState.length)));
    const ticking = (timer && timerState.endsAt > now) || (!timer && timerState.watchStart);
    if (ticking && timerTick === null) timerTick = setInterval(renderHomeTimer, 250);
    if (!ticking && timerTick !== null) {
        clearInterval(timerTick);
        timerTick = null;
    }
}

document.querySelectorAll("#timerModes [data-timer-mode]").forEach(button => button.addEventListener("click", () => {
    timerState.mode = button.dataset.timerMode;
    renderHomeTimer();
}));
document.querySelectorAll("#timerPresets [data-minutes]").forEach(button => button.addEventListener("click", () => {
    if (timerState.endsAt > Date.now()) return;
    timerState.length = Number(button.dataset.minutes) * 60000;
    timerState.endsAt = 0;
    renderHomeTimer();
}));
$("timerStart").addEventListener("click", () => {
    const now = Date.now();
    if (timerState.mode === "timer") {
        if (timerState.endsAt > now) {
            timerState.endsAt = 0;
            send("CountdownTimer", "0");
        } else if (timerState.length > 0) {
            timerState.endsAt = now + timerState.length;
            send("CountdownTimer", String(Math.round(timerState.length / 1000)));
        }
    } else if (timerState.watchStart) {
        timerState.watchElapsed += now - timerState.watchStart;
        timerState.watchStart = 0;
    } else {
        timerState.watchStart = now;
    }
    renderHomeTimer();
});
$("timerReset").addEventListener("click", () => {
    timerState.watchElapsed = 0;
    timerState.watchStart = 0;
    renderHomeTimer();
});

function renderHomeModules() {
    renderHomeWeather();
    renderHomeControllers();
    renderHomePinned();
    renderHomeUnlocks();
    renderHomeTimer();
}

renderHomeModules();

$("weatherEnabled").addEventListener("change", () => {
    $("weatherEnabled").disabled = true;
    send("SetWeather", $("weatherEnabled").checked ? "on" : "off");
});
