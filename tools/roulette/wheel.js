(function exposeRouletteWheel(root, factory) {
    "use strict";
    const core = typeof module === "object" && module.exports ? require("./core.js") : root.OmniRouletteCore;
    const api = factory(core);
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.OmniRouletteWheel = api;
})(typeof globalThis === "undefined" ? window : globalThis, function rouletteWheelFactory(core) {
    "use strict";

    const TAU = Math.PI * 2;
    const TOP = -Math.PI / 2;
    const STEP = TAU / 37;
    const TILT = 0.79;
    const CAPTURE_AT = 0.82;
    const DROP_AT = 0.59;
    const DEFAULT_DURATION = 6800;
    const order = core.WHEEL_ORDER;
    const normalize = (angle) => ((angle % TAU) + TAU) % TAU;
    const easeOut = (value) => 1 - (1 - value) ** 3;
    const smooth = (value) => value * value * (3 - 2 * value);
    const clamp01 = (value) => Math.max(0, Math.min(1, value));

    function createSpinTimeline(number, options = {}) {
        const index = order.indexOf(number);
        if (index < 0) throw new RangeError("Rulet sayısı 0 ile 36 arasında olmalı.");
        const durationMs = options.durationMs ?? DEFAULT_DURATION;
        if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError("Geçerli bir dönüş süresi gerekli.");
        const wheelStart = normalize(Number.isFinite(options.wheelAngle) ? options.wheelAngle : 0);
        const ballStart = normalize(Number.isFinite(options.ballAngle) ? options.ballAngle : TOP);
        const wheelEnd = wheelStart + 3 * TAU + normalize(-index * STEP - wheelStart);
        const wheelCapture = wheelStart + (wheelEnd - wheelStart) * easeOut(CAPTURE_AT);
        const captureTarget = TOP + wheelCapture + index * STEP;
        const ballCapture = ballStart - 7 * TAU - normalize(ballStart - captureTarget);
        return Object.freeze({
            number, index, durationMs, wheelStart, wheelEnd, wheelCapture, ballStart, ballCapture,
            ballEnd: ballCapture + wheelEnd - wheelCapture,
            ballStartRadius: options.ballRadius ?? 0.885,
        });
    }

    function sampleSpin(timeline, elapsedMs) {
        const progress = clamp01(elapsedMs / timeline.durationMs);
        const wheelAngle = timeline.wheelStart + (timeline.wheelEnd - timeline.wheelStart) * easeOut(progress);
        const drop = clamp01((progress - DROP_AT) / (CAPTURE_AT - DROP_AT));
        const captured = clamp01((progress - CAPTURE_AT) / (1 - CAPTURE_AT));
        const freeBall = timeline.ballStart + (timeline.ballCapture - timeline.ballStart) * easeOut(clamp01(progress / CAPTURE_AT));
        const settledBall = timeline.ballCapture + wheelAngle - timeline.wheelCapture;
        const pocketBounce = Math.sin(captured * Math.PI * 6) * (1 - captured) ** 3;
        const radius = 0.885 + (0.615 - 0.885) * smooth(drop);
        const launch = smooth(clamp01(progress / 0.08));
        return {
            number: timeline.number,
            index: timeline.index,
            progress,
            wheelAngle,
            ballAngle: progress === 1 ? timeline.ballEnd : progress < CAPTURE_AT ? freeBall : settledBall + pocketBounce * 0.035,
            ballRadius: progress === 1 ? 0.615 : timeline.ballStartRadius + (radius - timeline.ballStartRadius) * launch + pocketBounce * 0.008,
            ballHeight: Math.sin(drop * Math.PI * 5) ** 2 * (1 - drop) * 0.025,
            phase: progress === 1 ? "settled" : progress >= CAPTURE_AT ? "pocket" : progress >= DROP_AT ? "dropping" : "orbiting",
        };
    }

    function ring(context, outer, inner, fill) {
        context.beginPath();
        context.arc(0, 0, outer, 0, TAU);
        context.arc(0, 0, inner, 0, TAU, true);
        context.fillStyle = fill;
        context.fill();
    }

    function radial(context, radius, stops, x = -0.18, y = -0.3) {
        const gradient = context.createRadialGradient(radius * x, radius * y, 0, 0, 0, radius);
        stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
        return gradient;
    }

    function circle(context, radius, fill, stroke, lineWidth = 1) {
        context.beginPath();
        context.arc(0, 0, radius, 0, TAU);
        context.fillStyle = fill;
        context.fill();
        if (stroke) {
            context.strokeStyle = stroke;
            context.lineWidth = lineWidth;
            context.stroke();
        }
    }

    function sector(context, from, to, inner, outer, fill) {
        context.beginPath();
        context.arc(0, 0, outer, from, to);
        context.arc(0, 0, inner, to, from, true);
        context.closePath();
        context.fillStyle = fill;
        context.fill();
    }

    function createRotorTexture(document) {
        const texture = document.createElement("canvas");
        texture.width = 1200;
        texture.height = 1200;
        const context = texture.getContext("2d");
        const radius = 600;
        context.translate(radius, radius);

        circle(context, radius * 0.818, "#b89a53");
        order.forEach((number, index) => {
            const angle = TOP + index * STEP;
            const start = angle - STEP / 2;
            const end = angle + STEP / 2;
            const color = core.getColor(number);
            const pocket = color === "red" ? "#841f28" : color === "green" ? "#176445" : "#131d1c";
            const label = color === "red" ? "#a42b33" : color === "green" ? "#287b56" : "#1c2423";
            sector(context, start + 0.001, end - 0.001, radius * 0.681, radius * 0.807, label);
            sector(context, start + 0.002, end - 0.002, radius * 0.551, radius * 0.673, pocket);
            context.beginPath();
            context.moveTo(Math.cos(start) * radius * 0.548, Math.sin(start) * radius * 0.548);
            context.lineTo(Math.cos(start) * radius * 0.675, Math.sin(start) * radius * 0.675);
            context.strokeStyle = "#ebd495";
            context.lineWidth = 2.3;
            context.stroke();
            context.beginPath();
            context.moveTo(Math.cos(start + 0.007) * radius * 0.552, Math.sin(start + 0.007) * radius * 0.552);
            context.lineTo(Math.cos(start + 0.007) * radius * 0.67, Math.sin(start + 0.007) * radius * 0.67);
            context.strokeStyle = "#00000066";
            context.lineWidth = 2.5;
            context.stroke();
            context.save();
            context.translate(Math.cos(angle) * radius * 0.748, Math.sin(angle) * radius * 0.748);
            context.rotate(angle + Math.PI / 2);
            context.fillStyle = "#fff4dd";
            context.font = `650 ${radius * 0.044}px Inter, Arial, sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(String(number), 0, 0);
            context.restore();
        });
        ring(context, radius * 0.684, radius * 0.672, "#dfc680");
        ring(context, radius * 0.552, radius * 0.54, "#ab8d4a");
        circle(context, radius * 0.541, radial(context, radius * 0.541, [[0, "#b68b4f"], [0.46, "#79542e"], [0.87, "#30261a"], [1, "#a88c50"]]));
        for (let index = 0; index < 40; index += 1) {
            context.beginPath();
            context.arc(0, 0, radius * (0.36 + index * 0.0043), 0, TAU);
            context.strokeStyle = index % 2 ? "#e4bb6813" : "#1b110f22";
            context.lineWidth = 1.3;
            context.stroke();
        }
        return texture;
    }

    function drawBackdrop(context, width, height, radius, centerX, centerY) {
        context.clearRect(0, 0, width, height);
        context.save();
        context.translate(centerX, centerY);
        context.scale(1, TILT);
        context.save();
        context.translate(0, radius * 0.075);
        context.shadowColor = "#00000099";
        context.shadowBlur = radius * 0.09;
        context.shadowOffsetY = radius * 0.035;
        circle(context, radius, "#20140e");
        context.restore();
        const wood = radial(context, radius, [[0.79, "#70452a"], [0.87, "#a06c40"], [0.92, "#352318"], [0.96, "#815535"], [0.985, "#c49762"], [1, "#54381f"]]);
        circle(context, radius, wood, "#c29b65", radius * 0.004);
        for (let index = 0; index < 22; index += 1) {
            context.beginPath();
            context.ellipse(0, 0, radius * (0.906 + index * 0.0037), radius * (0.906 + index * 0.0037), index * 0.05, 0, TAU);
            context.strokeStyle = index % 3 ? "#24130e30" : "#efc28736";
            context.lineWidth = radius * 0.0016;
            context.stroke();
        }
        const brass = context.createLinearGradient(-radius, -radius, radius, radius);
        [[0, "#8c672f"], [0.2, "#f9e7ae"], [0.38, "#b89b55"], [0.6, "#6c4c24"], [0.83, "#d2b272"], [1, "#f2d89a"]].forEach(([offset, color]) => brass.addColorStop(offset, color));
        ring(context, radius * 0.914, radius * 0.895, brass);
        circle(context, radius * 0.895, radial(context, radius * 0.895, [[0.77, "#3c473f"], [0.91, "#101c19"], [0.97, "#31443a"], [1, "#07100f"]]), "#f3d59955", 1);
        ring(context, radius * 0.854, radius * 0.837, brass);
        ring(context, radius * 0.837, radius * 0.815, "#12221c");
        context.restore();
    }

    function drawSpindle(context, radius, angle) {
        circle(context, radius * 0.355, radial(context, radius * 0.355, [[0, "#f1d99c"], [0.4, "#bf995b"], [0.75, "#725433"], [1, "#b09056"]]));
        context.save();
        context.rotate(angle);
        for (let index = 0; index < 4; index += 1) {
            context.rotate(Math.PI / 2);
            context.beginPath();
            context.moveTo(-radius * 0.024, 0);
            context.lineTo(-radius * 0.012, -radius * 0.24);
            context.lineTo(radius * 0.014, -radius * 0.24);
            context.lineTo(radius * 0.026, 0);
            context.fillStyle = "#eee2b6";
            context.fill();
            context.strokeStyle = "#7e633a";
            context.lineWidth = radius * 0.004;
            context.stroke();
            context.beginPath();
            context.arc(0, -radius * 0.24, radius * 0.025, 0, TAU);
            context.fillStyle = "#f3dfa5";
            context.fill();
        }
        context.restore();
        circle(context, radius * 0.095, "#6c4c25", "#d5b679", radius * 0.008);
        circle(context, radius * 0.072, radial(context, radius * 0.072, [[0, "#fff5cf"], [0.4, "#e0c38a"], [1, "#8b693b"]]));
    }

    function create(canvas) {
        if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("Çark için canvas gerekli.");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Çark çizimi başlatılamadı.");
        const view = canvas.ownerDocument.defaultView;
        const document = canvas.ownerDocument;
        const rotor = createRotorTexture(document);
        const backdrop = document.createElement("canvas");
        let width = 0;
        let height = 0;
        let ratio = 1;
        let radius = 1;
        let centerX = 0;
        let centerY = 0;
        let animation = null;
        let frame = 0;
        let disposed = false;
        let current = { wheelAngle: 0, ballAngle: TOP, ballRadius: 0.885, ballHeight: 0, phase: "idle", number: null };

        function draw() {
            if (!width || !height || disposed) return;
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(backdrop, 0, 0);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.save();
            context.translate(centerX, centerY);
            context.scale(1, TILT);
            context.save();
            context.rotate(current.wheelAngle);
            context.drawImage(rotor, -radius, -radius, radius * 2, radius * 2);
            context.restore();
            drawSpindle(context, radius, current.wheelAngle);
            context.restore();

            if (current.number !== null) {
                const x = centerX + Math.cos(current.ballAngle) * radius * current.ballRadius;
                const groundY = centerY + Math.sin(current.ballAngle) * radius * current.ballRadius * TILT;
                const y = groundY - current.ballHeight * radius;
                const ballSize = Math.max(3, radius * 0.021);
                context.save();
                context.shadowColor = "#000000b3";
                context.shadowBlur = ballSize * 0.7;
                context.fillStyle = "#00000070";
                context.beginPath();
                context.ellipse(x + ballSize * 0.4, groundY + ballSize * 0.6, ballSize * 0.9, ballSize * 0.5, 0, 0, TAU);
                context.fill();
                context.restore();
                const ivory = context.createRadialGradient(x - ballSize * 0.35, y - ballSize * 0.45, ballSize * 0.05, x, y, ballSize);
                ivory.addColorStop(0, "#ffffff");
                ivory.addColorStop(0.58, "#faf6e6");
                ivory.addColorStop(1, "#989e96");
                context.beginPath();
                context.arc(x, y, ballSize, 0, TAU);
                context.fillStyle = ivory;
                context.fill();
            }
        }

        function resize() {
            if (disposed) return;
            const bounds = canvas.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            ratio = Math.min(view.devicePixelRatio || 1, 2.5);
            width = bounds.width;
            height = bounds.height;
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            backdrop.width = canvas.width;
            backdrop.height = canvas.height;
            centerX = width / 2;
            centerY = height * 0.46;
            radius = Math.min(width * 0.475, height * 0.54);
            const background = backdrop.getContext("2d");
            background.setTransform(ratio, 0, 0, ratio, 0, 0);
            drawBackdrop(background, width, height, radius, centerX, centerY);
            draw();
        }

        function result() {
            return { number: current.number, index: order.indexOf(current.number), wheelAngle: current.wheelAngle, ballAngle: current.ballAngle, phase: current.phase };
        }

        function cancel() {
            view.cancelAnimationFrame(frame);
            frame = 0;
            if (!animation) return;
            const resolve = animation.resolve;
            animation = null;
            resolve({ ...result(), cancelled: true });
        }

        function showResult(number) {
            cancel();
            const timeline = createSpinTimeline(number);
            current = sampleSpin(timeline, timeline.durationMs);
            canvas.setAttribute("aria-label", `Rulet çarkı, sonuç ${number}`);
            resize();
            return result();
        }

        function spin(number, options = {}) {
            if (disposed) return Promise.reject(new Error("Çark kapatıldı."));
            cancel();
            const timeline = createSpinTimeline(number, current);
            if (options.reducedMotion) return Promise.resolve(showResult(number));
            resize();
            canvas.setAttribute("aria-label", "Rulet çarkı dönüyor");
            return new Promise((resolve) => {
                animation = { resolve, timeline, start: null, lastPocket: -1, lastTick: -Infinity };
                function advance(timestamp) {
                    const active = animation;
                    if (!active || active.timeline !== timeline) return;
                    if (active.start === null) active.start = timestamp;
                    current = sampleSpin(timeline, timestamp - active.start);
                    const pocket = Math.round(normalize(current.ballAngle - current.wheelAngle - TOP) / STEP) % order.length;
                    if (pocket !== active.lastPocket && timestamp - active.lastTick > 45) {
                        active.lastPocket = pocket;
                        active.lastTick = timestamp;
                        if (typeof options.onTick === "function") {
                            try { options.onTick({ number: order[pocket], index: pocket, phase: current.phase }); } catch { /* Sound does not interrupt the wheel. */ }
                        }
                    }
                    draw();
                    if (current.progress === 1) {
                        animation = null;
                        frame = 0;
                        canvas.setAttribute("aria-label", `Rulet çarkı, sonuç ${number}`);
                        resolve(result());
                    } else frame = view.requestAnimationFrame(advance);
                }
                frame = view.requestAnimationFrame(advance);
            });
        }

        const observer = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(resize) : null;
        observer?.observe(canvas);
        view.addEventListener("resize", resize);
        resize();
        return Object.freeze({
            spin, showResult, cancel,
            destroy() {
                cancel();
                disposed = true;
                observer?.disconnect();
                view.removeEventListener("resize", resize);
            },
        });
    }

    return Object.freeze({ create, createSpinTimeline, sampleSpin, normalize, STEP, TOP, DEFAULT_DURATION });
});
