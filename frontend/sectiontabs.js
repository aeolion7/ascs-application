// Sections within a page (2.0.0): a row of tabs with one panel showing at a
// time. Left and Right move along the row and Home and End go to its ends, each
// showing the section it lands on; Tab goes on into the panel.

(function (global) {
    function create(list, { initial, onChange } = {}) {
        const tabs = [...list.querySelectorAll("[role='tab'][data-section-tab]")];
        let current = "";

        function show(name, { focus = false } = {}) {
            const chosen = tabs.find(tab => tab.dataset.sectionTab === name);
            if (!chosen) return;
            const changed = current !== "" && current !== name;
            const from = tabs.findIndex(tab => tab.dataset.sectionTab === current);
            // The focus stays with the row: never on a tab that isn't selected.
            const keepFocus = tabs.includes(document.activeElement);
            current = name;
            tabs.forEach(tab => {
                const on = tab === chosen;
                tab.setAttribute("aria-selected", String(on));
                tab.tabIndex = on ? 0 : -1;
                const panel = document.getElementById(tab.getAttribute("aria-controls"));
                if (panel) panel.hidden = !on;
            });
            if (focus || keepFocus) chosen.focus();
            // The section comes in from the side its tab is on (2.2.0).
            if (changed) globalThis.MaestroMotion?.sectionEnters(document.getElementById(chosen.getAttribute("aria-controls")), tabs.indexOf(chosen) > from ? 1 : -1);
            if (changed) onChange?.(name);
        }

        list.addEventListener("click", event => {
            const tab = event.target.closest("[data-section-tab]");
            if (tab) show(tab.dataset.sectionTab);
        });
        list.addEventListener("keydown", event => {
            if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
            const at = tabs.findIndex(tab => tab.dataset.sectionTab === current);
            const to = event.key === "ArrowRight" ? (at + 1) % tabs.length
                : event.key === "ArrowLeft" ? (at - 1 + tabs.length) % tabs.length
                : event.key === "Home" ? 0
                : event.key === "End" ? tabs.length - 1
                : -1;
            if (to < 0) return;
            event.preventDefault();
            show(tabs[to].dataset.sectionTab, { focus: true });
        });

        show(initial ?? tabs[0]?.dataset.sectionTab);
        return { show, current: () => current };
    }

    global.MaestroSections = { create };
})(globalThis);
