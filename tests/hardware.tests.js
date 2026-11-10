"use strict";

(function () {
    const H = globalThis.MaestroHardware;
    const { check, equal } = globalThis.TestHarness;
    const GB = 1024 ** 3;
    const factOf = (tile, label) => tile.groups.flatMap(group => group.facts).find(([name]) => name === label)?.[1];
    const detailOf = (described, title, label) => described.details.find(item => item.title === title).facts.find(([name]) => name === label)?.[1];

    // Sizes.
    equal("capacity: terabytes", H.capacity(2000396321280), "1.8 TB");
    equal("capacity: gigabytes", H.capacity(1000202273280), "931.5 GB");
    equal("capacity: a whole number has no .0", H.capacity(32 * GB), "32 GB");
    equal("capacity: megabytes", H.capacity(104857600), "100 MB");
    equal("capacity: nothing", H.capacity(null), "");
    equal("capacity: junk", H.capacity("big"), "");
    equal("capacity: video memory rounds up", H.capacity(8546942976), "8 GB");
    equal("cache: megabytes", H.cache(16384), "16 MB");
    equal("cache: kilobytes", H.cache(512), "512 KB");
    equal("cache: nothing", H.cache(null), "");

    // Dates are local, so they can't slip back a day.
    equal("date", H.shortDate("2025-06-12T00:00:00"), "Jun 12, 2025");
    equal("date: not a date", H.shortDate("yesterday"), "");
    equal("date: nothing", H.shortDate(""), "");
    check("date and time", /^Nov 9, 2026.*7:46.AM$/.test(H.dateAndTime("2026-11-09T07:46:01")));

    // What the real machine reports, trimmed.
    const sample = {
        processor: { name: "AMD Ryzen 7 8700F 8-Core Processor", maker: "AMD", cores: 8, threads: 16, clockMHz: 4101, socket: "AM5", l2KB: 8192, l3KB: 16384, architecture: "x64", revision: "Model 5, Stepping 2", virtualization: true },
        graphics: [{ name: "NVIDIA GeForce RTX 5060 Ti", maker: "NVIDIA", memoryBytes: 8546942976, vbios: "98.6.1f.80.50", driver: "32.0.16.1088", driverDate: "2026-07-22T00:00:00", width: 3440, height: 1440, refresh: 240, minRefresh: 50, maxRefresh: 240, bits: 32 }],
        memory: {
            totalBytes: 34359738368, slots: 4, maxBytes: 137438953472,
            modules: [
                { sizeBytes: 17179869184, type: "DDR5", form: "DIMM", ratedMHz: 4800, runningMHz: 5200, voltageMV: 1100, bank: "P0 CHANNEL A", slot: "DIMM 1", maker: "", part: "UD5-5200", widthBits: 64 },
                { sizeBytes: 17179869184, type: "DDR5", form: "DIMM", ratedMHz: 4800, runningMHz: 5200, voltageMV: 1100, bank: "P0 CHANNEL B", slot: "DIMM 1", maker: "", part: "UD5-5200", widthBits: 64 }
            ]
        },
        storage: [
            {
                model: "CT1000P3PSSD8", sizeBytes: 1000202273280, bus: "NVMe", media: "Solid state", health: "Healthy", firmware: "P9CR413", logicalSector: 512, physicalSector: 4096,
                partitions: [
                    { number: 4, sizeBytes: 999451262976, kind: "Basic data", letter: "C:", label: "Windows", fileSystem: "NTFS", windows: true },
                    { number: 1, sizeBytes: 104857600, kind: "EFI system", letter: "", label: "", fileSystem: "", windows: false }
                ]
            },
            { model: "ST2000LX001-1RG174", sizeBytes: 2000396321280, bus: "SATA", media: "Hard disk", health: "Healthy", firmware: "SDM1", logicalSector: 512, physicalSector: 4096, partitions: [{ number: 2, sizeBytes: 2000381018112, kind: "Basic data", letter: "J:", label: "Game Vault", fileSystem: "NTFS", windows: false }] }
        ],
        device: { maker: "iBUYPOWER", model: "AMD Ryzen 7 8700F 8-Core Processor", family: "I-Series", kind: "Desktop", systemType: "x64-based PC", name: "PC" },
        board: { maker: "ASRock", product: "B650M-C", version: "" },
        bios: { maker: "American Megatrends International, LLC.", version: "3.30", date: "2025-06-12T00:00:00", smbios: "3.4", secureBoot: false },
        windows: { edition: "Windows 11 Home", version: "26H2", build: "26300.9711", architecture: "64-bit", installed: "2025-11-11T07:35:43", started: "2026-11-09T07:46:01" }
    };
    const seen = H.describe(sample);
    const [cpu, gpu, ram, storage] = seen.tiles;

    equal("the tiles, in order", seen.tiles.map(tile => tile.title).join(), "Processor,Graphics,Memory,Storage");
    equal("processor leads with its cores", cpu.lead, "8 cores");
    equal("and names itself", cpu.name, "AMD Ryzen 7 8700F 8-Core Processor");
    equal("processor clock", factOf(cpu, "Base clock"), "4.1 GHz");
    equal("processor socket", factOf(cpu, "Socket"), "AM5");
    equal("processor cache", factOf(cpu, "L3 cache"), "16 MB");
    equal("processor threads", factOf(cpu, "Threads"), "16");
    equal("virtualization", factOf(cpu, "Virtualization"), "Enabled");

    equal("graphics leads with its name", gpu.lead, "NVIDIA GeForce RTX 5060 Ti");
    equal("video memory is under the name", gpu.name, "8 GB video memory");
    equal("and not repeated", factOf(gpu, "Video memory"), undefined);
    equal("the display", factOf(gpu, "Display"), "3440 × 1440");
    equal("driver date", factOf(gpu, "Driver date"), "Jul 22, 2026");
    equal("refresh range", factOf(gpu, "Refresh range"), "50 to 240 Hz");

    equal("memory leads with its total", ram.lead, "32 GB");
    equal("matching modules are summed up", ram.name, "2 × 16 GB DDR5");
    equal("running speed", factOf(ram, "Running at"), "5200 MHz");
    equal("base speed", factOf(ram, "Base speed"), "4800 MHz");
    equal("voltage", factOf(ram, "Voltage"), "1.1 V");
    equal("slots", factOf(ram, "Slots"), "2 of 4 used");
    equal("maximum", factOf(ram, "Maximum"), "128 GB");
    equal("a shared part number shows once", factOf(ram, "Part number"), "UD5-5200");
    equal("each module has a row", factOf(ram, "P0 CHANNEL B"), "16 GB, DIMM 1");
    equal("an empty maker has no row", factOf(ram, "Maker"), undefined);

    equal("storage leads with its total", storage.lead, "2.7 TB");
    equal("and counts the drives", storage.name, "2 drives");
    equal("each drive has a row", factOf(storage, "CT1000P3PSSD8"), "931.5 GB");
    equal("drive letters", factOf(storage, "Drive letters"), "C:, J:");
    equal("health", factOf(storage, "Health"), "All healthy");

    // A drive and how it's divided.
    const nvme = seen.drives[0];
    equal("a drive's capacity", nvme.capacity, "931.5 GB");
    equal("its connection", nvme.facts.find(([label]) => label === "Connection")[1], "NVMe");
    equal("its sectors", nvme.facts.find(([label]) => label === "Sectors")[1], "512 B logical, 4096 B physical");
    equal("partitions go in disk order", nvme.partitions[0].name, "EFI system");
    equal("a partition with no letter doesn't say its kind twice", nvme.partitions[0].detail, "100 MB");
    equal("a volume goes by letter and label", nvme.partitions[1].name, "C: Windows");
    equal("Windows' volume says so", nvme.partitions[1].detail, "Windows, NTFS, Basic data, 930.8 GB");
    check("the bar is in proportion", nvme.partitions[1].share > 99 && nvme.partitions[0].share < 1);
    check("a mounted partition is marked", nvme.partitions[1].mounted && !nvme.partitions[0].mounted);

    // The quieter details.
    equal("device", detailOf(seen, "Device", "Maker"), "iBUYPOWER");
    equal("motherboard", detailOf(seen, "Motherboard", "Model"), "B650M-C");
    equal("an empty version has no row", detailOf(seen, "Motherboard", "Version"), undefined);
    equal("Secure Boot off is said, not left out", detailOf(seen, "BIOS", "Secure Boot"), "Off");
    equal("BIOS date", detailOf(seen, "BIOS", "Date"), "Jun 12, 2025");
    equal("Windows build", detailOf(seen, "Windows", "Build"), "26300.9711");

    // Displays, sound and network.
    const devices = H.describe({
        displays: [{ name: "LG ULTRAGEAR", maker: "LG", product: "784F", year: 2025, week: 8, widthCm: 79, heightCm: 35, connection: "DisplayPort" }],
        sound: [{ name: "USB Audio Device", maker: "Generic USB Audio", bus: "USB", status: "OK" }],
        network: [{ name: "RZ616 Wi-Fi 6E 160MHz", windowsName: "Wi-Fi", kind: "Wi-Fi", driverMaker: "MediaTek, Inc.", driver: "3.3.0.908", driverDate: "2023-11-27T00:00:00" }]
    }).devices;
    const deviceFact = (title, label) => devices.find(item => item.title === title).groups[0].facts.find(([name]) => name === label)?.[1];
    equal("the devices, in order", devices.map(item => item.title).join(), "Displays,Sound,Network");
    equal("a display is named by itself", devices[0].groups[0].title, "LG ULTRAGEAR");
    equal("its size", deviceFact("Displays", "Size"), "34 in (79 × 35 cm)");
    equal("when it was made", deviceFact("Displays", "Made"), "Week 8, 2025");
    equal("a sound device's connection", deviceFact("Sound", "Connection"), "USB");
    equal("an adapter's type", deviceFact("Network", "Type"), "Wi-Fi");
    equal("Windows' name for it isn't repeated when it's the same", deviceFact("Network", "Windows calls it"), undefined);
    equal("but is when it differs", H.describe({ network: [{ name: "A", kind: "Ethernet", windowsName: "Ethernet 2" }] }).devices[0].groups[0].facts[1][1], "Ethernet 2");
    equal("its driver date", deviceFact("Network", "Driver date"), "Nov 27, 2023");
    equal("kinds of device with nothing to list are left out", H.describe({ sound: [{ name: "A" }] }).devices.map(item => item.title).join(), "Sound");
    equal("nothing to list at all", H.describe({ displays: "no" }).devices.length, 0);
    const noWeek = H.describe({ displays: [{ year: 2024 }] }).devices[0].groups[0];
    equal("an unnamed display still has a title", noWeek.title, "Display 1");
    equal("a year alone", noWeek.facts[0][1], "2024");

    // Differences and gaps.
    const mixed = H.describe({ memory: { totalBytes: 24 * GB, modules: [{ sizeBytes: 16 * GB, runningMHz: 3200 }, { sizeBytes: 8 * GB, runningMHz: 2666 }] } });
    equal("different modules are counted, not summed up", mixed.tiles[2].name, "2 modules");
    equal("different speeds have no shared row", factOf(mixed.tiles[2], "Running at"), undefined);

    const two = H.describe({ graphics: [{ name: "Card A", driver: "1" }, { name: "Card B", driver: "2", memoryBytes: 8 * GB }] });
    equal("a second card gets its own group", two.tiles[1].groups[1].title, "Card B");
    equal("with its own details", factOf(two.tiles[1], "Driver"), "1");
    equal("including its memory", two.tiles[1].groups[1].facts[0][1], "8 GB");

    const warned = H.describe({ storage: [{ model: "A", health: "Healthy" }, { model: "B", health: "Warning" }] });
    equal("a drive in trouble is said", factOf(warned.tiles[3], "Health"), "1 drive with a warning");

    const empty = H.describe({});
    equal("nothing reported still draws tiles", empty.tiles[0].lead, "Unavailable");
    equal("and no drives", empty.drives.length, 0);
    equal("failed", H.describe({ failed: true }), null);
    equal("no data", H.describe(null), null);
    equal("junk", H.describe("no"), null);
    equal("junk in the fields is safe", H.describe({ storage: "no", graphics: 3, memory: { modules: 1 } }).tiles[3].lead, "Unavailable");
})();
