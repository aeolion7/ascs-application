// The power tray's media keys and each app's volume (2.12.0). The keys go to
// whatever player Windows sends them to. Apps opens a list beside the tray:
// each app with sound on the output, its volume and mute, as Windows' own
// mixer has them. The list is read as it opens and every 3 seconds while it
// stays open; a slider being moved is never moved by a reading. AHK checks
// every request (ParseAppVolume in lib\ASCS.Core.ahk).

const mixer = { apps: [], error: "", known: false, timer: 0, sent: new Map(), waiting: new Map() };

// The apps last read, for the routine step that sets one: [{ id, label }].
const mixerApps = () => mixer.apps.map(app => ({ id: app.id, label: app.label }));

function receiveAppVolumes(data) {
    mixer.apps = Array.isArray(data.items) ? data.items.filter(app => app && typeof app.id === "string" && typeof app.label === "string"
        && Number.isInteger(app.level) && app.level >= 0 && app.level <= 100) : [];
    mixer.error = typeof data.error === "string" ? data.error : "";
    mixer.known = true;
    renderTrayApps();
    globalThis.renderRoutines?.();
}

function showTrayApps(show = $("trayApps").hidden) {
    clearInterval(mixer.timer);
    mixer.timer = 0;
    $("trayApps").hidden = !show;
    $("trayAppsButton").setAttribute("aria-expanded", String(show));
    if (!show) return;
    renderTrayApps();
    send("GetAppVolumes");
    mixer.timer = setInterval(() => {
        if ($("trayApps").hidden || document.visibilityState !== "visible") return;
        send("GetAppVolumes");
    }, 3000);
}

function trayAppRow(app) {
    const row = element("div", "tray-app");
    row.dataset.app = app.id;
    const name = element("span", "tray-app-name", app.label);
    name.title = app.id === "system" || app.id === "maestro" ? app.label : `${app.label} (${app.id})`;
    const volume = element("div", "tray-volume");
    volume.classList.toggle("is-muted", app.muted === true);
    const mute = iconButton(app.muted ? "mute" : "speaker", app.muted ? `Unmute ${app.label}` : `Mute ${app.label}`);
    mute.setAttribute("aria-pressed", String(app.muted === true));
    mute.addEventListener("click", () => send("SetAppMute", `${app.id}|${app.muted ? "0" : "1"}`));
    const slider = element("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(app.level);
    slider.setAttribute("aria-label", `${app.label} volume`);
    const value = element("output", "", String(app.level));
    // As the output's own slider: at most every 50 ms while it moves, and
    // where it's let go.
    const sendLevel = () => {
        clearTimeout(mixer.waiting.get(app.id));
        mixer.waiting.delete(app.id);
        mixer.sent.set(app.id, performance.now());
        send("SetAppVolume", `${app.id}|${slider.value}`);
    };
    slider.addEventListener("input", () => {
        value.textContent = slider.value;
        app.level = Number(slider.value);
        const wait = 50 - (performance.now() - (mixer.sent.get(app.id) ?? 0));
        if (wait <= 0) sendLevel();
        else if (!mixer.waiting.has(app.id)) mixer.waiting.set(app.id, setTimeout(sendLevel, wait));
    });
    slider.addEventListener("change", sendLevel);
    volume.append(mute, slider, value);
    row.append(name, volume);
    return row;
}

function renderTrayApps() {
    const list = $("trayAppList");
    if ($("trayApps").hidden) return;
    if (!mixer.known) {
        list.replaceChildren(placeholder("rows", 3));
        return;
    }
    // A slider in use is kept as it is; the rest are drawn again, and a mute
    // button that had the focus gets it back.
    const focused = document.activeElement;
    const active = focused?.matches?.('.tray-app input[type="range"]') ? focused.closest(".tray-app") : null;
    const muteFocus = focused?.matches?.(".tray-app .icon-action") ? focused.closest(".tray-app").dataset.app : "";
    if (mixer.error) {
        list.replaceChildren(element("p", "settings-note", mixer.error));
        return;
    }
    if (!mixer.apps.length) {
        list.replaceChildren(element("p", "settings-note", "No app has made a sound since it started."));
        return;
    }
    const sorted = mixer.apps.slice().sort((a, b) => a.label.localeCompare(b.label));
    list.replaceChildren(...sorted.map(app => active?.dataset.app === app.id && active.isConnected ? active : trayAppRow(app)));
    if (muteFocus) list.querySelector(`[data-app="${CSS.escape(muteFocus)}"] .icon-action`)?.focus();
}

document.querySelectorAll("[data-media-key]").forEach(button =>
    button.addEventListener("click", () => send("MediaKey", button.dataset.mediaKey)));
$("trayAppsButton").addEventListener("click", () => showTrayApps());
