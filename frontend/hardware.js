"use strict";

// System > Hardware (2.0.0): turns what ASCS reports into what the page shows.
// No DOM here. Anything Windows doesn't report is left out, not shown as empty.
globalThis.MaestroHardware = (() => {
    const GB = 1024 ** 3;

    const number = value => {
        const parsed = Number(value);
        return value !== null && value !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const oneDecimal = value => String(Number(value.toFixed(1)));
    const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
    const text = value => (typeof value === "string" ? value.trim() : "");

    function capacity(bytes) {
        const size = number(bytes);
        if (size === null) return "";
        if (size >= 1024 * GB) return `${oneDecimal(size / (1024 * GB))} TB`;
        if (size >= GB) return `${oneDecimal(size / GB)} GB`;
        return `${Math.max(1, Math.round(size / (1024 ** 2)))} MB`;
    }

    function cache(kilobytes) {
        const size = number(kilobytes);
        if (size === null) return "";
        return size >= 1024 ? `${oneDecimal(size / 1024)} MB` : `${size} KB`;
    }

    // ASCS sends "2025-06-12T00:00:00": local time, so it's read part by part
    // (a date alone would be taken as UTC and could land on the day before).
    function parseDate(value) {
        const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)$/.exec(text(value));
        if (!match) return null;
        const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
        const date = new Date(year, month - 1, day, hour, minute, second);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function shortDate(value) {
        return parseDate(value)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? "";
    }

    function dateAndTime(value) {
        return parseDate(value)?.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) ?? "";
    }

    function onOff(value, on, off) {
        if (value === true) return on;
        return value === false ? off : "";
    }

    // Keeps only the rows that have something to say.
    const facts = rows => rows.filter(([, value]) => value !== "" && value !== null && value !== undefined)
        .map(([label, value]) => [label, String(value)]);

    // The one value every item shares, or "" if they differ.
    function shared(items, read) {
        const values = [...new Set(items.map(read).filter(value => value !== "" && value !== null && value !== undefined))];
        return values.length === 1 ? values[0] : "";
    }

    function processorTile(cpu) {
        const cores = number(cpu?.cores);
        const clock = number(cpu?.clockMHz);
        return {
            title: "Processor",
            lead: cores ? plural(cores, "core") : text(cpu?.name) || "Unavailable",
            name: cores ? text(cpu?.name) : "",
            groups: [{
                facts: facts([
                    ["Maker", text(cpu?.maker)],
                    ["Threads", number(cpu?.threads)],
                    ["Base clock", clock ? `${oneDecimal(clock / 1000)} GHz` : ""],
                    ["Socket", text(cpu?.socket)],
                    ["L2 cache", cache(cpu?.l2KB)],
                    ["L3 cache", cache(cpu?.l3KB)],
                    ["Architecture", text(cpu?.architecture)],
                    ["Revision", text(cpu?.revision)],
                    ["Virtualization", onOff(cpu?.virtualization, "Enabled", "Off")]
                ])
            }]
        };
    }

    function graphicsFacts(gpu, withMemory) {
        const width = number(gpu.width);
        const height = number(gpu.height);
        const refresh = number(gpu.refresh);
        const low = number(gpu.minRefresh);
        const high = number(gpu.maxRefresh);
        return facts([
            ["Video memory", withMemory ? capacity(gpu.memoryBytes) : ""],
            ["Maker", text(gpu.maker)],
            ["Driver", text(gpu.driver)],
            ["Driver date", shortDate(gpu.driverDate)],
            ["Video BIOS", text(gpu.vbios)],
            ["Display", width && height ? `${width} × ${height}` : ""],
            ["Refresh rate", refresh ? `${refresh} Hz` : ""],
            ["Refresh range", low && high ? `${low} to ${high} Hz` : ""],
            ["Color depth", number(gpu.bits) ? `${gpu.bits}-bit` : ""]
        ]);
    }

    function graphicsTile(graphics) {
        const cards = Array.isArray(graphics) ? graphics : [];
        const [first, ...others] = cards;
        return {
            title: "Graphics",
            lead: text(first?.name) || "Unavailable",
            name: capacity(first?.memoryBytes) ? `${capacity(first.memoryBytes)} video memory` : "",
            groups: first
                ? [{ facts: graphicsFacts(first, false) }, ...others.map(gpu => ({ title: text(gpu.name), facts: graphicsFacts(gpu, true) }))]
                : []
        };
    }

    function memoryTile(memory) {
        const modules = Array.isArray(memory?.modules) ? memory.modules : [];
        const size = shared(modules, module => number(module.sizeBytes));
        const type = shared(modules, module => text(module.type));
        const running = number(shared(modules, module => number(module.runningMHz)));
        const rated = number(shared(modules, module => number(module.ratedMHz)));
        const voltage = number(shared(modules, module => number(module.voltageMV)));
        const slots = number(memory?.slots);
        const width = number(shared(modules, module => number(module.widthBits)));
        const layout = modules.length && size ? `${modules.length} × ${capacity(size)}` : modules.length ? plural(modules.length, "module") : "";
        const rows = modules.map((module, index) => [
            text(module.bank) || text(module.slot) || `Module ${index + 1}`,
            [capacity(module.sizeBytes), text(module.bank) ? text(module.slot) : ""].filter(Boolean).join(", ")
        ]);
        return {
            title: "Memory",
            lead: capacity(memory?.totalBytes) || "Unavailable",
            name: [layout, type].filter(Boolean).join(" "),
            groups: [{
                facts: facts([
                    ["Form", shared(modules, module => text(module.form))],
                    ["Running at", running ? `${running} MHz` : ""],
                    ["Base speed", rated ? `${rated} MHz` : ""],
                    ["Voltage", voltage ? `${oneDecimal(voltage / 1000)} V` : ""],
                    ["Data width", width ? `${width}-bit` : ""],
                    ["Slots", slots ? `${modules.length} of ${slots} used` : ""],
                    ["Maximum", capacity(memory?.maxBytes)],
                    ["Maker", shared(modules, module => text(module.maker))],
                    ["Part number", shared(modules, module => text(module.part))],
                    ...rows
                ])
            }]
        };
    }

    function storageTile(disks) {
        const total = disks.reduce((sum, disk) => sum + (number(disk.sizeBytes) ?? 0), 0);
        const partitions = disks.flatMap(disk => (Array.isArray(disk.partitions) ? disk.partitions : []));
        const letters = partitions.map(partition => text(partition.letter)).filter(Boolean).sort();
        const health = disks.map(disk => text(disk.health)).filter(Boolean);
        const healthy = health.filter(value => value === "Healthy" || value === "OK").length;
        return {
            title: "Storage",
            lead: capacity(total) || "Unavailable",
            name: disks.length ? plural(disks.length, "drive") : "",
            groups: [{
                facts: facts([
                    ...disks.map((disk, index) => [text(disk.model) || `Drive ${index + 1}`, capacity(disk.sizeBytes)]),
                    ["Partitions", partitions.length || ""],
                    ["Drive letters", letters.join(", ")],
                    ["Health", !health.length ? "" : healthy === health.length ? "All healthy"
                        : `${plural(health.length - healthy, "drive")} with a warning`]
                ])
            }]
        };
    }

    function partitionName(partition, index) {
        return [text(partition.letter), text(partition.label)].filter(Boolean).join(" ")
            || text(partition.kind) || `Partition ${index + 1}`;
    }

    function driveCard(disk, index) {
        const total = number(disk.sizeBytes);
        const partitions = (Array.isArray(disk.partitions) ? [...disk.partitions] : [])
            .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
        const logical = number(disk.logicalSector);
        const physical = number(disk.physicalSector);
        return {
            model: text(disk.model) || `Drive ${index + 1}`,
            capacity: capacity(disk.sizeBytes),
            facts: facts([
                ["Connection", text(disk.bus)],
                ["Type", text(disk.media)],
                ["Health", text(disk.health)],
                ["Firmware", text(disk.firmware)],
                ["Sectors", logical && physical ? `${logical} B logical, ${physical} B physical` : ""]
            ]),
            partitions: partitions.map((partition, partitionIndex) => ({
                name: partitionName(partition, partitionIndex),
                detail: [
                    partition.windows === true ? "Windows" : "",
                    text(partition.fileSystem),
                    text(partition.letter) ? text(partition.kind) : "",
                    capacity(partition.sizeBytes)
                ].filter(Boolean).join(", "),
                share: total ? Math.min(100, (number(partition.sizeBytes) ?? 0) / total * 100) : 0,
                mounted: Boolean(text(partition.letter))
            }))
        };
    }

    function displayGroup(monitor, index) {
        const width = number(monitor.widthCm);
        const height = number(monitor.heightCm);
        const inches = width && height ? Math.round(Math.hypot(width, height) / 2.54) : null;
        const year = number(monitor.year);
        const week = number(monitor.week);
        return {
            title: text(monitor.name) || `Display ${index + 1}`,
            facts: facts([
                ["Maker", text(monitor.maker)],
                ["Product code", text(monitor.product)],
                ["Size", inches ? `${inches} in (${width} × ${height} cm)` : ""],
                ["Connection", text(monitor.connection)],
                ["Made", year ? (week ? `Week ${week}, ${year}` : String(year)) : ""]
            ])
        };
    }

    function soundGroup(device, index) {
        return {
            title: text(device.name) || `Sound device ${index + 1}`,
            facts: facts([
                ["Maker", text(device.maker)],
                ["Connection", text(device.bus)],
                ["Status", text(device.status)]
            ])
        };
    }

    function networkGroup(adapter, index) {
        return {
            title: text(adapter.name) || `Adapter ${index + 1}`,
            facts: facts([
                ["Type", text(adapter.kind)],
                ["Windows calls it", text(adapter.windowsName) === text(adapter.kind) ? "" : text(adapter.windowsName)],
                ["Driver from", text(adapter.driverMaker)],
                ["Driver", text(adapter.driver)],
                ["Driver date", shortDate(adapter.driverDate)]
            ])
        };
    }

    const listOf = value => (Array.isArray(value) ? value : []);

    function describe(hardware) {
        if (!hardware || typeof hardware !== "object" || hardware.failed === true) return null;
        const disks = Array.isArray(hardware.storage) ? hardware.storage : [];
        const device = hardware.device;
        const board = hardware.board;
        const bios = hardware.bios;
        const windows = hardware.windows;
        return {
            tiles: [processorTile(hardware.processor), graphicsTile(hardware.graphics), memoryTile(hardware.memory), storageTile(disks)],
            drives: disks.map(driveCard),
            devices: [
                { title: "Displays", groups: listOf(hardware.displays).map(displayGroup) },
                { title: "Sound", groups: listOf(hardware.sound).map(soundGroup) },
                { title: "Network", groups: listOf(hardware.network).map(networkGroup) }
            ].filter(device => device.groups.length),
            details: [
                {
                    title: "Device",
                    facts: facts([
                        ["Maker", text(device?.maker)],
                        ["Model", text(device?.model)],
                        ["Family", text(device?.family)],
                        ["Kind", text(device?.kind)],
                        ["System type", text(device?.systemType)],
                        ["Computer name", text(device?.name)]
                    ])
                },
                {
                    title: "Motherboard",
                    facts: facts([
                        ["Maker", text(board?.maker)],
                        ["Model", text(board?.product)],
                        ["Version", text(board?.version)]
                    ])
                },
                {
                    title: "BIOS",
                    facts: facts([
                        ["Maker", text(bios?.maker)],
                        ["Version", text(bios?.version)],
                        ["Date", shortDate(bios?.date)],
                        ["SMBIOS", text(bios?.smbios)],
                        ["Secure Boot", onOff(bios?.secureBoot, "On", "Off")]
                    ])
                },
                {
                    title: "Windows",
                    facts: facts([
                        ["Edition", text(windows?.edition)],
                        ["Version", text(windows?.version)],
                        ["Build", text(windows?.build)],
                        ["Architecture", text(windows?.architecture)],
                        ["Installed", shortDate(windows?.installed)],
                        ["Last started", dateAndTime(windows?.started)]
                    ])
                }
            ]
        };
    }

    return { capacity, cache, shortDate, dateAndTime, describe };
})();
