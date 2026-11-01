"use strict";

const $ = id => document.getElementById(id);
const validViews = new Set(["home", "notes", "search", "dashboard", "commands"]);
const viewLabels = {
    home: "COMMAND CENTER",
    notes: "QUICK NOTES",
    search: "EVERYTHING SEARCH",
    dashboard: "SYSTEM DASHBOARD",
    commands: "F24 COMMANDS"
};

let saveTimer = null;
let noteSavePendingContent = null;
let toastTimer = null;

function send(type, content = "") {
    const webview = window.chrome?.webview;

    if (!webview) {
        showToast("WebView2 communication unavailable.");
        return false;
    }

    webview.postMessage(`${type}\n${content}`);
    return true;
}

function showToast(message) {
    const toast = $("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function setSaveStatus(label, state) {
    const status = $("saveStatus");

    if (!status) return;

    status.lastChild.textContent = ` ${label}`;
    status.dataset.state = state;
}

function navigate(view) {
    if (!validViews.has(view)) return;

    document.querySelectorAll(".view").forEach(element => {
        element.classList.toggle("active", element.id === view);
        element.setAttribute("aria-hidden", String(element.id !== view));
    });

    document.querySelectorAll(".nav").forEach(button => {
        const isCurrent = button.dataset.view === view;
        button.classList.toggle("active", isCurrent);

        if (isCurrent) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    $("breadcrumb").textContent = viewLabels[view];

    if (view === "notes") {
        send("GetNotes");
    }

    if (view === "dashboard" || view === "home") {
        send("GetMetrics");
    }

    if (view === "search") {
        $("searchQuery").focus();
    }
}

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
        navigate(button.dataset.view);
    });
});

document.querySelectorAll("[data-launch]").forEach(button => {
    button.addEventListener("click", () => {
        send("Launch", button.dataset.launch);
    });
});

$("noteText").addEventListener("input", () => {
    setSaveStatus("SAVING...", "saving");
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        const content = $("noteText").value;

        if (send("SaveNote", content)) {
            noteSavePendingContent = content;
        } else {
            setSaveStatus("SAVE FAILED", "error");
        }
    }, 400);
});

function searchFiles() {
    const query = $("searchQuery").value.trim();

    if (!query) {
        $("searchQuery").focus();
        return;
    }

    send("SearchFiles", query);
}

$("searchButton").addEventListener("click", searchFiles);

$("searchQuery").addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        searchFiles();
    }
});

function handleWebMessage(event) {
    let data = event.data;

    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch {
            return;
        }
    }

    if (!data || typeof data !== "object") return;

    switch (data.type) {
        case "navigate":
            navigate(data.view);
            break;

        case "notes":
            if (typeof data.content === "string") {
                $("noteText").value = data.content;
                noteSavePendingContent = null;
                setSaveStatus("ALL CHANGES SAVED", "saved");
            }
            break;

        case "saved":
            if (noteSavePendingContent === $("noteText").value) {
                noteSavePendingContent = null;
                setSaveStatus("ALL CHANGES SAVED", "saved");
            } else {
                setSaveStatus("CHANGES PENDING", "saving");
            }
            break;

        case "metrics":
            updateMetrics(data);
            break;

        case "error":
            if ($("notes").classList.contains("active")) {
                setSaveStatus("SAVE FAILED", "error");
            }
            showToast(
                typeof data.message === "string"
                    ? data.message
                    : "An error occurred."
            );
            break;
    }
}

window.chrome?.webview?.addEventListener("message", handleWebMessage);

function formatMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number)}%` : "--%";
}

function setProgressBar(id, value) {
    const bar = $(id);
    if (!bar) return;

    const number = Number(value);
    const amount = Number.isFinite(number)
        ? Math.max(0, Math.min(100, number))
        : 0;

    bar.style.width = `${amount}%`;

    const progress = bar.parentElement;
    if (progress?.getAttribute("role") === "progressbar") {
        progress.setAttribute("aria-valuenow", String(Math.round(amount)));
    }
}

function formatCapacity(used, total) {
    const usedValue = Number(used);
    const totalValue = Number(total);

    if (!Number.isFinite(usedValue) || !Number.isFinite(totalValue)) {
        return "Capacity unavailable";
    }

    return `${usedValue.toFixed(1)} / ${totalValue.toFixed(1)} GB`;
}

function updateMetrics(data) {
    const metrics = [
        { name: "cpu", value: data.cpu },
        { name: "ram", value: data.ram },
        { name: "disk", value: data.disk }
    ];

    metrics.forEach(({ name, value }) => {
        const display = $(name);

        if (display) {
            display.textContent = formatMetric(value);
        }

        setProgressBar(`${name}Bar`, value);
    });

    $("homeCpu").textContent = formatMetric(data.cpu);
    $("homeRam").textContent = formatMetric(data.ram);
    $("homeDisk").textContent = formatMetric(data.disk);
    setProgressBar("homeCpuBar", data.cpu);
    setProgressBar("homeRamBar", data.ram);
    setProgressBar("homeDiskBar", data.disk);

    $("ramDetail").textContent = formatCapacity(data.ramUsed, data.ramTotal);
    $("homeRamDetail").textContent = formatCapacity(data.ramUsed, data.ramTotal);
    $("diskDetail").textContent = formatCapacity(data.diskUsed, data.diskTotal)
        .replace(" GB", " GB used");
    $("homeDiskDetail").textContent = formatCapacity(data.diskUsed, data.diskTotal)
        .replace(" GB", " GB used");
    $("metricsUpdated").textContent =
        `Last updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

send("Ready");
