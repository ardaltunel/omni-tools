"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const core = require("./core.js");

test("corrupt and unknown persisted preferences produce safe defaults", () => {
    for (const value of [null, undefined, [], "invalid", true]) {
        assert.deepEqual(core.normalizeSettings(value, "en-US"), { ...core.DEFAULTS, language: "en" });
    }
    const settings = core.normalizeSettings({ design: "missing", size: Infinity, intensity: null, wake: "true", seconds: 1, unknown: "discard" });
    assert.deepEqual(settings, core.DEFAULTS);
    assert.equal(Object.hasOwn(settings, "unknown"), false);
});

test("persisted controls validate each choice and clamp numeric values", () => {
    const settings = core.normalizeSettings({ design: "cyber", palette: "ivory", language: "en", hourFormat: "12", position: "right", size: "999", intensity: -10, seconds: true, animations: false, date: false, drift: true, wake: true });
    assert.deepEqual(settings, { design: "cyber", palette: "ivory", language: "en", hourFormat: "12", position: "right", size: 130, intensity: 0, seconds: true, animations: false, date: false, drift: true, wake: true, quality: "balanced" });
    assert.equal(core.normalizeSettings({ size: "", intensity: "" }).size, 100);
    assert.equal(core.normalizeSettings({ size: false, intensity: true }).intensity, 65);
    assert.equal(core.normalizeSettings({ size: 64, intensity: 101 }).size, 65);
});

test("legacy preferences migrate to balanced without losing display choices", () => {
    const legacy = { design: "cyber", language: "en", seconds: true, size: 120, intensity: 40, wake: true };
    const settings = core.normalizeSettings(legacy);
    assert.equal(settings.quality, "balanced");
    for (const [key, value] of Object.entries(legacy)) assert.equal(settings[key], value);
    for (const quality of ["low", "balanced", "high"]) assert.equal(core.normalizeSettings({ quality }).quality, quality);
    for (const quality of [null, true, "ultra", 0]) assert.equal(core.normalizeSettings({ quality }).quality, "balanced");
});

test("the clock uses device local time and distinguishes midnight from noon", () => {
    const midnight = new Date(2026, 0, 1, 0, 5, 9);
    const noon = new Date(2026, 0, 1, 12, 5, 9);
    assert.deepEqual(core.formatClock(midnight, "12", "en"), { hours: "12", minutes: "05", seconds: "09", period: "AM" });
    assert.deepEqual(core.formatClock(noon, "12", "en"), { hours: "12", minutes: "05", seconds: "09", period: "PM" });
    assert.equal(core.formatClock(midnight, "24").hours, "00");
    assert.equal(core.formatClock(new Date(2026, 0, 1, 23), "12", "tr").period, "ÖS");
    assert.equal(core.formatClock(midnight, "12", "tr").period, "ÖÖ");
});

test("date and machine-readable clock preserve the local year boundary", () => {
    const last = new Date(2026, 11, 31, 23, 59, 59);
    const next = new Date(2027, 0, 1, 0, 0, 0);
    assert.match(core.formatDate(last, "en"), /Thursday, 31 December 2026/);
    assert.match(core.formatDate(next, "tr"), /1 Ocak 2027 Cuma/);
    assert.match(core.localDateTime(last), /^2026-12-31T23:59:59[+-]\d{2}:\d{2}$/);
    assert.match(core.localDateTime(next), /^2027-01-01T00:00:00/);
});

test("clock scheduling aligns to the next visible time boundary", () => {
    assert.equal(core.nextClockDelay(new Date(2026, 0, 1, 1, 2, 30, 250), true), 762);
    assert.equal(core.nextClockDelay(new Date(2026, 0, 1, 1, 2, 30, 250), false), 29762);
    assert.equal(core.nextClockDelay(new Date(2026, 11, 31, 23, 59, 59, 999), false), 13);
});
