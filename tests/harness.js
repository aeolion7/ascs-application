"use strict";

// Minimal shared assertions for the frontend test pages.
globalThis.TestHarness = (() => {
    let passed = 0;
    const failures = [];
    const check = (name, condition) => (condition ? passed++ : failures.push(name));
    const equal = (name, actual, expected) =>
        check(`${name} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`, Object.is(actual, expected));
    const close = (name, actual, expected) =>
        check(`${name} (expected ≈${expected}, got ${actual})`, actual !== null && Math.abs(actual - expected) < 1e-9);
    const report = () => {
        document.getElementById("results").textContent =
            `PASS ${passed} FAIL ${failures.length}\n` + failures.map(name => `FAIL: ${name}`).join("\n");
    };
    return { check, equal, close, report };
})();
