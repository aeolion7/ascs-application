"use strict";

// Dragging items into a new order (2.0.0). Pointer events, so it behaves the same
// with a mouse, pen or touch: the item stays in the list as a marked slot that
// moves as you drag, and a copy follows the pointer. Escape puts everything back.
(function (global) {
    function reorder(items, from, to) {
        const next = [...items];
        next.splice(to, 0, ...next.splice(from, 1));
        return next;
    }

    // Which box's center is closest to a point; -1 with no boxes.
    function nearestIndex(boxes, x, y) {
        let best = -1;
        let bestDistance = Infinity;
        boxes.forEach((box, index) => {
            const distance = (box.left + box.width / 2 - x) ** 2 + (box.top + box.height / 2 - y) ** 2;
            if (distance < bestDistance) {
                best = index;
                bestDistance = distance;
            }
        });
        return best;
    }

    // Puts a list's children in this order (nodes not given are taken out)
    // without moving the one holding the focus: a node taken out of the page
    // loses its focus, and with it the focus ring (2.0.0 manual pass).
    function placeChildren(list, nodes) {
        [...list.children].forEach(child => { if (!nodes.includes(child)) child.remove(); });
        const keep = nodes.find(node => node.parentNode === list && node.contains(document.activeElement));
        if (!keep) {
            list.replaceChildren(...nodes);
            return;
        }
        const at = nodes.indexOf(keep);
        nodes.slice(0, at).forEach(node => list.insertBefore(node, keep));
        let last = keep;
        nodes.slice(at + 1).forEach(node => {
            last.after(node);
            last = node;
        });
    }

    // The handle an item shows. The caller adds the arrow keys, which depend on the layout.
    function gripButton(label) {
        const grip = document.createElement("button");
        grip.type = "button";
        grip.className = "drag-grip";
        grip.dataset.dragHandle = "";
        grip.setAttribute("aria-label", `Move ${label}. Use the arrow keys.`);
        grip.title = "Drag to move, or use the arrow keys";
        grip.append(MaestroIcons.create("grip"));
        return grip;
    }

    // list: the parent; item: a selector for its children, each with data-sort-id;
    // notFrom: what a drag can't start on, such as other buttons in an item.
    // onDrop runs when the order changed; onEnd after any drag, since moving an
    // item in the page takes focus away from it.
    function attach(list, { item, notFrom = "button:not([data-drag-handle]), a, input, select", threshold = 5, onDrop, onEnd }) {
        let press = null;

        const items = () => [...list.querySelectorAll(item)];
        const ids = () => items().map(node => node.dataset.sortId);

        function begin(event) {
            const box = press.node.getBoundingClientRect();
            press.dragging = true;
            press.offsetX = press.x - box.left;
            press.offsetY = press.y - box.top;
            press.ghost = press.node.cloneNode(true);
            press.ghost.classList.add("drag-ghost");
            press.ghost.setAttribute("aria-hidden", "true");
            press.ghost.removeAttribute("data-sort-id");
            press.ghost.style.width = `${box.width}px`;
            press.ghost.style.height = `${box.height}px`;
            document.body.append(press.ghost);
            press.node.classList.add("is-dragging");
            list.classList.add("is-sorting");
            follow(event);
        }

        function follow(event) {
            press.ghost.style.transform = `translate(${event.clientX - press.offsetX}px, ${event.clientY - press.offsetY}px)`;
            const nodes = items();
            const to = nearestIndex(nodes.map(node => node.getBoundingClientRect()), event.clientX, event.clientY);
            const from = nodes.indexOf(press.node);
            if (to < 0 || to === from) return;
            list.insertBefore(press.node, to > from ? nodes[to].nextSibling : nodes[to]);
        }

        function finish(save) {
            const current = press;
            press = null;
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onCancel);
            document.removeEventListener("keydown", onKey, true);
            if (!current.dragging) return;
            current.ghost.remove();
            current.node.classList.remove("is-dragging");
            list.classList.remove("is-sorting");
            const order = ids();
            const id = current.node.dataset.sortId;
            if (!save) {
                current.order.forEach(sortId => {
                    const node = items().find(other => other.dataset.sortId === sortId);
                    if (node) list.append(node);
                });
            } else if (order.join("\n") !== current.order.join("\n")) {
                onDrop?.(order, id);
            }
            onEnd?.(id);
        }

        function onMove(event) {
            if (!press) return;
            if (!press.dragging) {
                if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < threshold) return;
                begin(event);
                return;
            }
            follow(event);
        }
        const onUp = () => { if (press) finish(true); };
        const onCancel = () => { if (press) finish(false); };
        const onKey = event => {
            if (event.key !== "Escape" || !press?.dragging) return;
            event.preventDefault();
            event.stopPropagation();
            finish(false);
        };

        list.addEventListener("pointerdown", event => {
            if (event.button !== 0 || press || event.target.closest(notFrom)) return;
            const node = event.target.closest(item);
            if (!node || !list.contains(node)) return;
            press = { node, x: event.clientX, y: event.clientY, order: ids(), dragging: false };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
            document.addEventListener("pointercancel", onCancel);
            document.addEventListener("keydown", onKey, true);
        });

        return { isDragging: () => Boolean(press?.dragging) };
    }

    global.MaestroDragSort = { reorder, nearestIndex, placeChildren, gripButton, attach };
})(globalThis);
