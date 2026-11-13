// Site badges in Games (1.11.0): the awards on the user's RetroAchievements
// profile, as a grid of game art with tabs. Parsed by Games.parseRaAwards; asked
// for only once the Achievements section is on screen, and each image only as
// it scrolls near view. A game's badge opens its achievements.

let raAwardsWatcher = null;
let raAwardImageWatcher = null;

function askForRaAwards() {
    const ra = gamesState.ra;
    raAwardsWatcher?.disconnect();
    ra.awardsAsked = false;
    raAwardsWatcher = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        raAwardsWatcher.disconnect();
        ra.awardsAsked = true;
        send("GetRaAwards");
    }, { rootMargin: "200px" });
    raAwardsWatcher.observe($("gamesAchievements"));
}

function renderRaAwards(box) {
    const ra = gamesState.ra;
    const section = element("section", "ra-awards");
    section.setAttribute("aria-label", "Site badges");
    const head = element("div", "ra-awards-head");
    head.append(element("h2", "", "Site Badges"));
    section.append(head);
    box.append(section);
    if (!ra.awards) {
        section.append(ra.awardsError ? element("p", "settings-note", ra.awardsError) : placeholder("badges"));
        return;
    }
    const parsed = Games.parseRaAwards(ra.awards);
    if (!parsed.counts.all) {
        section.append(element("p", "settings-note", parsed.hidden ? "Your awards are hidden on your profile." : "No awards yet."));
        return;
    }
    head.append(element("span", "", ["Newest first", parsed.hidden ? `${parsed.hidden} hidden on your profile` : ""].filter(Boolean).join(" · ")));
    if (!parsed.counts[ra.awardsTab]) ra.awardsTab = "all";

    const tabs = element("div", "ra-award-tabs");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Show");
    const content = element("div", "ra-award-content");
    const tip = element("div", "ra-award-tip");
    tip.hidden = true;
    const draw = () => {
        tabs.querySelectorAll(".ra-award-tab").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.tab === ra.awardsTab)));
        drawRaAwardTab(content, Games.awardsInTab(parsed, ra.awardsTab));
        tip.hidden = true;
    };
    Games.AWARD_TABS.filter(tab => tab.id === "all" || parsed.counts[tab.id]).forEach(tab => {
        const node = element("button", "ra-award-tab", tab.label);
        node.type = "button";
        node.dataset.tab = tab.id;
        node.append(element("em", "", String(parsed.counts[tab.id])));
        node.addEventListener("click", () => {
            ra.awardsTab = tab.id;
            draw();
        });
        tabs.append(node);
    });
    enableTabWheel(tabs, ".ra-award-tab");
    section.append(tabs, content, tip);
    draw();

    // One card, moved to whichever badge the pointer or focus is on.
    const showTip = node => {
        const item = node?.raAward;
        if (!item) {
            tip.hidden = true;
            return;
        }
        tip.replaceChildren(element("strong", "", Games.displayTitle(item.title)));
        if (item.console) tip.append(element("small", "", item.console));
        tip.append(element("em", `is-${item.group}`, Games.awardText(item)));
        tip.hidden = false;
        const area = section.getBoundingClientRect();
        const tile = node.getBoundingClientRect();
        const left = tile.left - area.left + tile.width / 2 - tip.offsetWidth / 2;
        tip.style.left = `${Math.max(0, Math.min(area.width - tip.offsetWidth, left))}px`;
        const above = tile.top - area.top - tip.offsetHeight - 8;
        tip.style.top = `${above >= 0 ? above : tile.bottom - area.top + 8}px`;
    };
    content.addEventListener("pointerover", event => showTip(event.target.closest(".ra-award")));
    content.addEventListener("pointerleave", () => { tip.hidden = true; });
    content.addEventListener("focusin", event => showTip(event.target.closest(".ra-award")));
    content.addEventListener("focusout", () => { tip.hidden = true; });
}

function drawRaAwardTab(content, items) {
    const grid = element("div", "ra-award-grid");
    const labels = element("div", "ra-award-labels");
    items.forEach(item => {
        // Only numbered game art is ever fetched; anything else is a text label.
        if (!item.icon) {
            labels.append(element("span", "ra-award-label", item.title));
            return;
        }
        const node = element(item.gameId ? "button" : "span", `ra-award is-${item.group}`);
        if (item.gameId) {
            node.type = "button";
            node.addEventListener("click", () => openRaGame(item.gameId));
        } else {
            node.tabIndex = 0;
        }
        node.raAward = item;
        node.setAttribute("aria-label", `${Games.displayTitle(item.title)}. ${Games.awardText(item)}`);
        node.append(raImage(item.icon, "ra-award-art"));
        grid.append(node);
    });
    content.replaceChildren(...(grid.childElementCount ? [grid] : []), ...(labels.childElementCount ? [labels] : []));

    raAwardImageWatcher?.disconnect();
    raAwardImageWatcher = new IntersectionObserver(entries => {
        const near = entries.filter(entry => entry.isIntersecting);
        near.forEach(entry => raAwardImageWatcher.unobserve(entry.target));
        requestRaImages(near.map(entry => entry.target.dataset.token));
    }, { rootMargin: "300px" });
    grid.querySelectorAll(".ra-image").forEach(holder => raAwardImageWatcher.observe(holder));
}
