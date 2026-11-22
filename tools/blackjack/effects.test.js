"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const effects = require("./effects.js");

function harness() {
    const animations = [];
    class Element {
        constructor(tag = "div") {
            this.tagName = tag;
            this.style = {};
            this.children = [];
            this.values = new Map();
            this.className = "";
            this.classList = { contains: (name) => this.className.split(/\s+/).includes(name) };
        }
        get attributes() { return [...this.values].map(([name, value]) => ({ name, value })); }
        setAttribute(name, value) { this.values.set(name, String(value)); }
        getAttribute(name) { return this.values.get(name) ?? null; }
        removeAttribute(name) { this.values.delete(name); }
        append(...nodes) { nodes.forEach((node) => { node.parent = this; this.children.push(node); }); }
        replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
        querySelectorAll(selector) {
            const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
            if (selector === "*") return descendants;
            return descendants.filter((child) => selector.split(",").some((part) => child.classList.contains(part.trim().slice(1))));
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        cloneNode(deep) {
            const clone = new Element(this.tagName);
            clone.className = this.className;
            clone.style = { ...this.style };
            this.values.forEach((value, name) => clone.setAttribute(name, value));
            if (deep) clone.append(...this.children.map((child) => child.cloneNode(true)));
            return clone;
        }
        animate(frames, timing) {
            let resolve;
            let reject;
            const animation = {
                node: this, frames, timing,
                finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
                finish: () => resolve(), cancel: () => reject(new Error("cancelled")),
            };
            animations.push(animation);
            return animation;
        }
    }
    const listeners = new Map();
    const document = {
        hidden: false, body: new Element("body"), createElement: (tag) => new Element(tag),
        addEventListener(name, callback) { listeners.set(name, callback); },
        removeEventListener(name) { listeners.delete(name); },
    };
    const host = {
        document,
        addEventListener(name, callback) { listeners.set(name, callback); },
        removeEventListener(name) { listeners.delete(name); },
    };
    function card(hidden = false) {
        const node = new Element("article");
        node.className = `blackjack-card ${hidden ? "is-hidden" : "is-face-up"}`;
        node.setAttribute("id", "live-card");
        node.setAttribute("data-card-id", "secret-card");
        node.setAttribute("aria-label", "private rank");
        const inner = new Element();
        inner.className = "blackjack-card-inner";
        const front = new Element();
        front.className = "blackjack-card-front";
        const pattern = new Element("pattern");
        pattern.setAttribute("id", "paper");
        const face = new Element("rect");
        face.setAttribute("fill", "url(#paper)");
        front.append(pattern, face);
        const back = new Element();
        back.className = "blackjack-card-back";
        inner.append(front, back);
        node.append(inner);
        return node;
    }
    return { document, host, animations, listeners, card, Element };
}

const from = { left: 500, top: 20, width: 50, height: 70 };
const to = { left: 100, top: 300, width: 80, height: 112 };

test("card flights remap SVG references, retain the original node and clean up at landing", async () => {
    const env = harness();
    const motion = effects.create(env);
    const card = env.card();
    const flying = motion.flyCard(card, from, to);
    assert.equal(card.style.visibility, "hidden");
    assert.equal(env.document.body.children.length, 1);
    const portal = env.document.body.children[0];
    assert.equal(portal.getAttribute("inert"), "");
    const clone = portal.children[0];
    assert.equal(clone.getAttribute("data-card-id"), null);
    assert.equal(clone.getAttribute("aria-label"), null);
    const pattern = clone.querySelectorAll("*").find((node) => node.tagName === "pattern");
    const face = clone.querySelectorAll("*").find((node) => node.tagName === "rect");
    assert.notEqual(pattern.getAttribute("id"), "paper");
    assert.equal(face.getAttribute("fill"), `url(#${pattern.getAttribute("id")})`);
    assert.equal(card.getAttribute("data-card-id"), "secret-card");
    env.animations[0].finish();
    assert.deepEqual(await flying, { cancelled: false });
    assert.equal(card.style.visibility, undefined);
    assert.equal(env.document.body.children.length, 0);
    motion.destroy();
});

test("a hidden card cannot reveal its front even if a caller requests a flip", async () => {
    const env = harness();
    const motion = effects.create(env);
    const card = env.card(true);
    const flying = motion.flyCard(card, from, to, { flip: true });
    assert.equal(env.animations.length, 1);
    assert.equal(env.document.body.children[0].children[0].querySelector(".blackjack-card-front").children.length, 0);
    assert.equal(card.querySelector(".blackjack-card-front").children.length, 2);
    motion.cancel();
    assert.deepEqual(await flying, { cancelled: true });
    assert.equal(env.document.body.children.length, 0);
});

test("face-up flips animate the inner surface independently and speed scales timings", async () => {
    const env = harness();
    const motion = effects.create({ ...env, speed: 2 });
    const flying = motion.flyCard(env.card(), from, to, { flip: true, duration: 400, delay: 100 });
    assert.equal(env.animations.length, 2);
    assert.equal(env.animations[0].timing.duration, 200);
    assert.equal(env.animations[0].timing.delay, 50);
    assert.equal(env.animations[1].frames[0].transform, "rotateY(180deg)");
    assert.equal(env.animations[1].frames[1].transform, "rotateY(0deg)");
    env.animations.forEach((animation) => animation.finish());
    assert.deepEqual(await flying, { cancelled: false });
});

test("a duplicate flight cancels its predecessor and pagehide removes every overlay", async () => {
    const env = harness();
    const motion = effects.create(env);
    const card = env.card();
    const first = motion.flyCard(card, from, to);
    const second = motion.flyCard(card, from, to);
    assert.deepEqual(await first, { cancelled: true });
    assert.equal(env.document.body.children.length, 1);
    env.listeners.get("pagehide")();
    assert.deepEqual(await second, { cancelled: true });
    assert.equal(env.document.body.children.length, 0);
    assert.equal(card.style.visibility, undefined);
    motion.destroy();
    assert.equal(env.listeners.size, 0);
});

test("chip flights retain denomination styling while reduced motion and inactive views skip safely", async () => {
    const env = harness();
    const chip = new env.Element("button");
    chip.setAttribute("data-blackjack-chip", "100");
    const motion = effects.create(env);
    const flying = motion.flyChip(chip, from, to, { hide: false });
    assert.equal(env.document.body.children[0].className, "blackjack-chip-flight");
    assert.equal(env.document.body.children[0].children[0].getAttribute("data-blackjack-chip"), "100");
    assert.equal(chip.style.visibility, undefined);
    motion.cancel();
    await flying;
    const reduced = effects.create({ ...env, reduceMotion: true });
    assert.deepEqual(await reduced.flyCard(env.card(), from, to), { cancelled: false });
    assert.equal(env.document.body.children.length, 0);
    const inactive = effects.create({ ...env, isActive: () => false });
    assert.deepEqual(await inactive.flyChip(chip, from, to), { cancelled: true });
});

test("layout FLIP animates existing nodes and cancellation resolves every pending promise", async () => {
    const env = harness();
    const motion = effects.create(env);
    const node = env.card();
    const moving = motion.layoutFLIP(new Map([["one", from]]), new Map([["one", { node, rect: to }]]));
    assert.equal(env.animations.length, 1);
    assert.match(env.animations[0].frames[0].transform, /translate\(400px,-280px\)/);
    assert.equal(env.document.body.children.length, 0);
    motion.destroy();
    assert.deepEqual(await moving, { cancelled: true });
    assert.deepEqual(await motion.flyCard(node, from, to), { cancelled: true });
});
