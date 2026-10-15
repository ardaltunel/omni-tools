(function ambientRendererModule(root) {
    "use strict";

    // Follow the display's pixel density while bounding the work on large monitors.
    // No textures, network requests, frame allocations or work while out of view.
    const vertexSource = "attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}";
    const fragmentSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 resolution;
uniform float time;
uniform float intensity;
uniform float scene;
uniform vec2 pointer;
float hash(vec2 p) {
#ifdef GL_FRAGMENT_PRECISION_HIGH
    p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);
#else
    // Bounded arithmetic retains fractional detail on older mobile GPUs.
    return fract(sin(dot(mod(p,64.0),vec2(2.17,5.83)))*63.37);
#endif
}
float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);
}
float fbm(vec2 p) { float n=0.;float a=.5;for(int i=0;i<3;i++){n+=a*noise(p);p=mat2(1.6,-1.2,1.2,1.6)*p+3.7;a*=.5;}return n; }
void main() {
    vec2 uv=gl_FragCoord.xy/resolution;
    float aspect=resolution.x/resolution.y;
    vec2 cursor=vec2(.5+pointer.x*.34,.5-pointer.y*.29);
    vec2 p=vec2((uv.x-pointer.x*.045)*min(aspect,2.5),uv.y+pointer.y*.04);
    float t=time;
    vec3 color=vec3(.009,.014,.034);
    if(scene<.5) {
        float mist=fbm(p*2.2+vec2(t*.033,-t*.025));
        float warp=fbm(vec2(p.x*1.35-t*.045,p.y*.8+t*.032));
        float bend=(-pointer.y*.12+pointer.x*.055)*exp(-pow((uv.x-cursor.x)*2.4,2.));
        // Different 26 to 43 second phases keep the folds evolving without flashing.
        float curve=.47+.14*sin(p.x*2.35+t*.20)+.065*sin(p.x*4.1-t*.15)+.10*(warp-.5)+bend;
        float fold=uv.y-curve;
        float core=exp(-abs(fold)*23.0);
        float veil=exp(-abs(fold+.055)*6.0);
        float threads=.76+.24*sin(p.x*9.+warp*5.-t*.24);
        float upperFold=uv.y-(.78-.17*uv.x+.075*sin(p.x*2.1-t*.145+1.8)+bend*.55);
        float upper=exp(-abs(upperFold)*9.);
        float upperCore=exp(-abs(upperFold)*27.);
        float lowerFold=uv.y-(.20+.09*sin(p.x*2.8-t*.17+1.2)+.035*sin(p.x*6.+t*.13)+bend*.35);
        float lower=exp(-abs(lowerFold)*12.);
        vec3 teal=vec3(.085,.47,.44);
        vec3 blue=vec3(.18,.22,.55);
        vec3 violet=vec3(.39,.18,.59);
        vec3 ribbon=mix(teal,blue,smoothstep(.1,.65,uv.x+.055*sin(t*.16)));
        ribbon=mix(ribbon,violet,smoothstep(.45,.95,uv.x));
        float breath=.88+.12*sin(t*.18);
        color+=ribbon*(core*.42+veil*.44)*(mist*.6+.5)*threads*breath;
        color+=violet*(upper*.23+upperCore*.12)*(.55+mist);
        color+=mix(teal,blue,uv.x)*lower*.17*(.8+.2*sin(t*.21+1.));
        color+=vec3(.06,.08,.23)*mist*.36;
        float ray=fbm(vec2(p.x*5.+warp*3.-t*.055,uv.y*.6+t*.018));
        color+=ribbon*pow(ray,3.)*veil*.24;
        // A broad light pool follows the same inertial pointer as the ribbon bend.
        vec2 poolDistance=(uv-cursor)*vec2(min(aspect,2.5),1.45);
        float pool=exp(-dot(poolDistance,poolDistance)*3.2);
        color+=mix(vec3(.055,.24,.29),vec3(.22,.12,.4),uv.x)*pool*.28;
    } else {
        vec2 fieldCenter=vec2(.5+.10*sin(t*.16)+pointer.x*.19,.29+.025*sin(t*.21)-pointer.y*.11);
        float glow=exp(-length((uv-fieldCenter)*vec2(2.2,4.))*2.);
        float wave=exp(-abs(uv.y-(.27+.045*sin(p.x*2.1+t*.19)-pointer.y*.07))*10.);
        float secondWave=exp(-abs(uv.y-(.45+.055*sin(p.x*2.6-t*.15+1.4)-pointer.y*.035))*12.);
        float sweep=.72+.28*sin(p.x*2.1-uv.y*3.+t*.20);
        color+=mix(vec3(.04,.16,.34),vec3(.25,.07,.38),uv.x)*glow*(.78+.14*sin(t*.17));
        color+=mix(vec3(.035,.18,.31),vec3(.20,.065,.34),uv.x)*(wave*.22+secondWave*.13)*sweep;
    }
    color=vec3(.004,.006,.014)+(color-vec3(.004,.006,.014))*(.18+intensity*1.35);
    float vignette=1.0-smoothstep(.18,.92,length((uv-.5)*vec2(.9,1.)));
    color*=.55+.45*vignette;
    gl_FragColor=vec4(color,1.);
}`;

    function create(canvas) {
        let gl;
        try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }); } catch { /* The CSS backdrop is always available. */ }
        if (!gl) return { update() {}, setPointer() {}, destroy() {} };
        let program = null, buffer = null, uniforms = null, shaders = [];
        function releaseResources(canDelete) {
            if (canDelete) {
                if (buffer) gl.deleteBuffer(buffer);
                shaders.forEach(shader => gl.deleteShader(shader));
                if (program) gl.deleteProgram(program);
            }
            program = null;
            buffer = null;
            uniforms = null;
            shaders = [];
        }
        function buildResources() {
            function compile(type, source) {
                const shader = gl.createShader(type);
                if (!shader) throw new Error("Shader unavailable");
                shaders.push(shader);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader unavailable");
                return shader;
            }
            program = gl.createProgram();
            if (!program) throw new Error("Renderer unavailable");
            gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Renderer unavailable");
            gl.useProgram(program);
            buffer = gl.createBuffer();
            if (!buffer) throw new Error("Buffer unavailable");
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, "position");
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            uniforms = Object.fromEntries(["resolution", "time", "intensity", "scene", "pointer"].map(name => [name, gl.getUniformLocation(program, name)]));
        }
        try {
            buildResources();
        } catch {
            releaseResources(true);
            return { update() {}, setPointer() {}, destroy() {} };
        }
        let config = { design: "aurora", animated: false, intensity: .65, active: false };
        let timer = 0, frame = 0, lost = false, destroyed = false, elapsed = 0, lastTime = null;
        let targetX = 0, targetY = 0, pointerX = 0, pointerY = 0;
        function stop() { root.clearTimeout(timer); root.cancelAnimationFrame(frame); timer = 0; frame = 0; lastTime = null; }
        function resetPointer() { targetX = 0; targetY = 0; pointerX = 0; pointerY = 0; }
        function canPaint() { return !destroyed && !lost && uniforms && config.active && config.design !== "studio" && !root.document?.hidden; }
        function setPointer(x, y) {
            if (!canPaint() || !config.animated) { resetPointer(); return; }
            targetX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
            targetY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
            // Input only changes a target. The existing 24fps loop supplies every frame.
        }
        function resize() {
            const bounds = canvas.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            const density = Number.isFinite(root.devicePixelRatio) ? Math.max(1, Math.min(1.5, root.devicePixelRatio)) : 1;
            const scale = Math.min(density, 3200 / bounds.width, Math.sqrt(3200000 / (bounds.width * bounds.height)));
            const width = Math.max(1, Math.floor(bounds.width * scale));
            const height = Math.max(1, Math.floor(bounds.height * scale));
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        }
        function paint(now) {
            frame = 0;
            if (!canPaint()) return;
            const delta = lastTime === null ? 0 : Math.max(0, Math.min((now - lastTime) / 1000, .15));
            if (config.animated) {
                elapsed += delta;
                const follow = 1 - Math.exp(-delta / .24);
                pointerX += (targetX - pointerX) * follow;
                pointerY += (targetY - pointerY) * follow;
            }
            lastTime = now;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
            gl.uniform2f(uniforms.pointer, pointerX, pointerY);
            gl.uniform1f(uniforms.time, elapsed);
            gl.uniform1f(uniforms.intensity, config.intensity);
            gl.uniform1f(uniforms.scene, config.design === "cyber" ? 1 : 0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            canvas.classList.add("is-ready");
            if (config.animated) timer = root.setTimeout(() => {
                timer = 0;
                if (canPaint()) frame = root.requestAnimationFrame(paint);
            }, 1000 / 24);
        }
        function update(next) {
            config = { ...config, ...next };
            config.intensity = Math.max(0, Math.min(1, Number(config.intensity) || 0));
            if (!config.active || !config.animated || config.design === "studio" || root.document?.hidden) resetPointer();
            stop();
            if (canPaint()) { resize(); frame = root.requestAnimationFrame(paint); }
        }
        const observer = typeof root.ResizeObserver === "function" ? new root.ResizeObserver(() => update(config)) : null;
        observer?.observe(canvas);
        function onResize() { update(config); }
        if (!observer) root.addEventListener("resize", onResize);
        function onContextLost(event) {
            event.preventDefault();
            lost = true;
            stop();
            resetPointer();
            // Context loss invalidates these objects; deleting them would do no work.
            releaseResources(false);
            canvas.classList.remove("is-ready");
        }
        function onContextRestored() {
            if (destroyed) return;
            stop();
            releaseResources(!lost);
            lost = false;
            try { buildResources(); } catch {
                releaseResources(true);
                canvas.classList.remove("is-ready");
                return;
            }
            update(config);
        }
        canvas.addEventListener("webglcontextlost", onContextLost);
        canvas.addEventListener("webglcontextrestored", onContextRestored);
        function destroy() {
            destroyed = true; stop(); resetPointer(); observer?.disconnect();
            root.removeEventListener("resize", onResize);
            canvas.removeEventListener("webglcontextlost", onContextLost);
            canvas.removeEventListener("webglcontextrestored", onContextRestored);
            releaseResources(!lost);
            canvas.classList.remove("is-ready");
        }
        return { update, setPointer, destroy };
    }
    root.AmbientRenderer = Object.freeze({ create });
}(window));
