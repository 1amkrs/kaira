// Standalone Flicx WebGL2 Light Pillar Background Engine
(function() {
  let y = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
  let b=`#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uTarget;
uniform vec2 uRot;
uniform vec2 uPillarRot;
uniform vec2 uWave;
uniform float uShift;
uniform float uPillarWidth;
uniform float uPillarHeight;
uniform int uDetail;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uGlowAmount;
uniform float uWidthNorm;
out vec4 outColor;

void main() {
  vec2 vUv = gl_FragCoord.xy / uTarget;
  vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
  uv.x -= uShift;
  uv = vec2(uPillarRot.x * uv.x - uPillarRot.y * uv.y, uPillarRot.y * uv.x + uPillarRot.x * uv.y);

  vec3 ro = vec3(0.0, 0.0, -10.0);
  vec3 rd = normalize(vec3(uv, 1.0));
  vec3 origin = vec3(uRot.x * ro.x - uRot.y * ro.z, ro.y, uRot.y * ro.x + uRot.x * ro.z);
  vec3 dir = vec3(uRot.x * rd.x - uRot.y * rd.z, rd.y, uRot.y * rd.x + uRot.x * rd.z);

  float glow = 0.0;
  float lift = 0.0;
  float t = 0.1;
  for (int i = 0; i < 80; i++) {
    vec3 p = origin + dir * t;
    vec3 q = p;
    q.y = p.y * uPillarHeight + uTime;

    float freq = 1.0;
    float amp = 1.0;
    for (int j = 0; j < 6; j++) {
      if (j >= uDetail) break;
      q.xz = vec2(uWave.y * q.x - uWave.x * q.z, uWave.x * q.x + uWave.y * q.z);
      q += cos(q.zxy * freq - uTime * float(j) * 2.0) * amp;
      freq *= 2.0;
      amp *= 0.5;
    }

    float d = length(cos(q.xz)) - 0.2;
    float bound = length(p.xz) - uPillarWidth;
    float h = max(4.0 - abs(d - bound), 0.0);
    d = max(d, bound) + h * h * 0.015625;
    d = abs(d) * 0.15 + 0.01;

    float weight = 1.0 / d;
    glow += weight;
    lift += clamp((15.0 - p.y) / 30.0, 0.0, 1.0) * weight;

    t += d;
    if (t > 50.0) break;
  }

  vec3 col = tanh((uBottomColor * glow + (uTopColor - uBottomColor) * lift) * uGlowAmount / uWidthNorm);
  float peak = max(col.r, max(col.g, col.b));
  outColor = vec4(col, smoothstep(0.62, 1.0, peak));
}`;
  let E=`#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uFieldSize;
uniform vec2 uView;
uniform vec2 uAspect;
uniform vec2 uPillarRot;
uniform float uShift;
uniform float uIntensity;
uniform float uNoiseIntensity;
uniform float uLightMode;
uniform float uNeutral;
uniform float uBloom;
uniform float uFade;
uniform float uReveal;
uniform float uFlare;
uniform vec4 uPulses[3];
out vec4 outColor;

vec3 tap(vec2 uv) {
  return textureLod(uField, uv, 0.0).rgb;
}

vec3 bicubic(vec2 uv) {
  vec2 position = uv * uFieldSize;
  vec2 center = floor(position - 0.5) + 0.5;
  vec2 f = position - center;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (center - 1.0) / uFieldSize;
  vec2 t3 = (center + 2.0) / uFieldSize;
  vec2 t12 = (center + w2 / w12) / uFieldSize;
  vec3 result = vec3(0.0);
  result += tap(vec2(t0.x, t0.y)) * w0.x * w0.y;
  result += tap(vec2(t12.x, t0.y)) * w12.x * w0.y;
  result += tap(vec2(t3.x, t0.y)) * w3.x * w0.y;
  result += tap(vec2(t0.x, t12.y)) * w0.x * w12.y;
  result += tap(vec2(t12.x, t12.y)) * w12.x * w12.y;
  result += tap(vec2(t3.x, t12.y)) * w3.x * w12.y;
  result += tap(vec2(t0.x, t3.y)) * w0.x * w3.y;
  result += tap(vec2(t12.x, t3.y)) * w12.x * w3.y;
  result += tap(vec2(t3.x, t3.y)) * w3.x * w3.y;
  return max(result, 0.0);
}

float smootherstep01(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uView;
  vec3 col = bicubic(uv);

  if (uBloom > 0.0) {
    vec4 l3 = textureLod(uField, uv, 3.0);
    vec4 l4 = textureLod(uField, uv, 4.0);
    vec4 l5 = textureLod(uField, uv, 5.0);
    vec4 l6 = textureLod(uField, uv, 6.0);
    float halo = l3.a * 0.3 + l4.a * 0.3 + l5.a * 0.25 + l6.a * 0.15;
    vec3 tint = l4.rgb + l5.rgb;
    tint /= max(max(tint.r, max(tint.g, tint.b)), 0.001);
    vec3 glow = clamp(tint * halo * uBloom * 1.1, 0.0, 1.0);
    col = 1.0 - (1.0 - clamp(col, 0.0, 1.0)) * (1.0 - glow);
  }

  vec2 p = (uv * 2.0 - 1.0) * uAspect;
  p.x -= uShift;
  float axis = uPillarRot.y * p.x + uPillarRot.x * p.y;

  float boost = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 pulse = uPulses[i];
    if (pulse.y <= 0.0) continue;
    float offset = (axis - pulse.x) / 0.24;
    boost += exp(-offset * offset) * pulse.y;
  }
  float head = (axis - uReveal + 0.35) / 0.3;
  boost += exp(-head * head) * uFlare;
  float lum = max(col.r, max(col.g, col.b));
  col += mix(col, vec3(lum), 0.45) * boost * 1.8;

  col -= fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 15.0 * uNoiseIntensity;
  vec3 result = clamp(col * uIntensity, 0.0, 1.0);

  float mask = smoothstep(uReveal, uReveal - 0.9, axis);
  float edge = uFade * 0.5;
  if (edge > 0.0) {
    mask *= smootherstep01(uv.x / edge) * smootherstep01((1.0 - uv.x) / edge);
    mask *= smootherstep01(uv.y / edge) * smootherstep01((1.0 - uv.y) / edge);
  }

  if (uLightMode > 0.5) {
    float energy = max(result.r, max(result.g, result.b));
    vec3 hue = result / max(energy, 0.001);
    float coverage = smoothstep(0.025, 0.95, energy);
    hue = pow(clamp(hue, 0.0, 1.0), vec3(1.25));
    vec3 tinted = mix(vec3(1.0), hue, coverage * 0.94 * mask);
    vec3 ink = vec3(1.0) - pow(result, vec3(1.6)) * 0.85 * mask;
    result = mix(tinted, ink, uNeutral);
  } else {
    result *= mask;
  }
  outColor = vec4(result, 1.0);
}`;
  let A={low:.35,medium:.5,high:.6},j=(e,t,r)=>Math.min(r,Math.max(t,e)),R=(e,t,r)=>{let l=e.createShader(t);return l?(e.shaderSource(l,r),e.compileShader(l),e.getShaderParameter(l,e.COMPILE_STATUS))?l:(e.deleteShader(l),null):null},M=(e,t)=>{let r=R(e,e.VERTEX_SHADER,y),l=R(e,e.FRAGMENT_SHADER,t),a=e.createProgram();if(!r||!l||!a)return null;if(e.attachShader(a,r),e.attachShader(a,l),e.bindAttribLocation(a,0,"aPosition"),e.linkProgram(a),e.deleteShader(r),e.deleteShader(l),!e.getProgramParameter(a,e.LINK_STATUS))return e.deleteProgram(a),null;let i={},n=e.getProgramParameter(a,e.ACTIVE_UNIFORMS);for(let t=0;t<n;t++){let r=e.getActiveUniform(a,t);r&&(i[r.name.replace(/\[0\]$/,"")]=e.getUniformLocation(a,r.name))}return{program:a,uniforms:i}};

  let activeCleanup = null;
  let activeCanvas = null;

  window.destroyFlicxLightPillar = function() {
    if (typeof activeCleanup === 'function') {
      try { activeCleanup(); } catch {}
    }
    activeCleanup = null;
    activeCanvas = null;
  };

  window.initFlicxLightPillar = function() {
    const container = document.querySelector('.light-pillar-container');
    const canvas = document.querySelector('canvas.light-pillar-canvas');
    if (!container || !canvas) {
      window.destroyFlicxLightPillar();
      return;
    }

    // Prevent spawning duplicate concurrent WebGL2 loops on the same mounted canvas
    if (activeCanvas === canvas && activeCleanup) {
      return;
    }
    window.destroyFlicxLightPillar();

    const q = {
      current: {
        topColor: "#5227FF",
        bottomColor: "#FF9FFC",
        intensity: 0.7,
        rotationSpeed: 0.3,
        flow: 1,
        interactive: true,
        clickPulse: false,
        glowAmount: 0.002,
        bloom: 0.5,
        pillarWidth: 8,
        pillarHeight: 0.4,
        pillarRotation: 25,
        twist: 0.4,
        detail: 4,
        noiseIntensity: 0.5,
        fade: 0,
        intro: true,
        scale: 0.6,
        lightMode: false,
        paused: false,
        maxPixelRatio: 2,
        maxFps: 60
      }
    };

    try {
      const e = container;
      const t = canvas;
      const r = t.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance"
      });
      if (!r) return;

      // Detect software WebGL renderers (SwiftShader, llvmpipe, Mesa) and throttle to avoid main-thread stalls
      let isSoftwareGl = false;
      try {
        const dbg = r.getExtension("WEBGL_debug_renderer_info");
        const rendererStr = dbg ? String(r.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : String(r.getParameter(r.RENDERER) || '');
        if (/swiftshader|llvmpipe|software|mesa|microsoft basic/i.test(rendererStr)) {
          isSoftwareGl = true;
        }
      } catch {}

      if (isSoftwareGl) {
        q.current.scale = 0.25;
        q.current.detail = 2;
        q.current.bloom = 0;
        q.current.maxPixelRatio = 1;
        q.current.maxFps = 12;
        q.current.rotationSpeed = 0;
        q.current.intro = false;
      }

      const l = !!r.getExtension("EXT_color_buffer_float");
      const a = M(r, b);
      const i = M(r, E);
      if (!a || !i) return;

      const onContextLost = (ev) => { ev.preventDefault(); };
      const onContextRestored = () => {};
      t.addEventListener("webglcontextlost", onContextLost);
      t.addEventListener("webglcontextrestored", onContextRestored);

      const s = r.createBuffer();
      const c = r.createVertexArray();
      r.bindVertexArray(c);
      r.bindBuffer(r.ARRAY_BUFFER, s);
      r.bufferData(r.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), r.STATIC_DRAW);
      r.enableVertexAttribArray(0);
      r.vertexAttribPointer(0, 2, r.FLOAT, false, 0, 0);

      let u = null;
      const h = r.createFramebuffer();
      const m = { width: 0, height: 0 };
      const d = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const f = new Map();
      const p = (colorStr) => {
        if (f.has(colorStr)) return f.get(colorStr);
        let rgb = [1, 1, 1];
        if (d) {
          d.clearRect(0, 0, 1, 1);
          d.fillStyle = "#ffffff";
          d.fillStyle = colorStr;
          d.fillRect(0, 0, 1, 1);
          const [cr, cg, cb] = d.getImageData(0, 0, 1, 1).data;
          rgb = [cr / 255, cg / 255, cb / 255];
        }
        f.set(colorStr, rgb);
        return rgb;
      };

      const x = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const g = { width: 1, height: 1, ratio: 1 };
      const v = { x: 0, y: 0, inside: false };
      const w = [];
      const pulseArr = new Float32Array(12);
      const st = { clock: 0, intro: q.current.intro && !x ? 0 : 1, touch: 0, spin: 0, lean: 0, shift: 0, governor: 1, slow: 0, quick: 0 };
      let rafId = 0;
      let lastTs = 0;
      let isVisible = true;
      let disposed = false;

      const renderFrame = () => {
        if (disposed) return;
        const cfg = q.current;
        const scale = Math.max(0.2, cfg.scale * st.governor);
        const tw = Math.max(1, Math.round(g.width * scale));
        const th = Math.max(1, Math.round(g.height * scale));
        if (m.width !== tw || m.height !== th) {
          m.width = tw;
          m.height = th;
          if (u) r.deleteTexture(u);
          u = r.createTexture();
          r.bindTexture(r.TEXTURE_2D, u);
          const levels = Math.floor(Math.log2(Math.max(tw, th))) + 1;
          r.texStorage2D(r.TEXTURE_2D, levels, l ? r.RGBA16F : r.RGBA8, tw, th);
          r.texParameteri(r.TEXTURE_2D, r.TEXTURE_MIN_FILTER, r.LINEAR_MIPMAP_LINEAR);
          r.texParameteri(r.TEXTURE_2D, r.TEXTURE_MAG_FILTER, r.LINEAR);
          r.texParameteri(r.TEXTURE_2D, r.TEXTURE_WRAP_S, r.CLAMP_TO_EDGE);
          r.texParameteri(r.TEXTURE_2D, r.TEXTURE_WRAP_T, r.CLAMP_TO_EDGE);
          r.bindFramebuffer(r.FRAMEBUFFER, h);
          r.framebufferTexture2D(r.FRAMEBUFFER, r.COLOR_ATTACHMENT0, r.TEXTURE_2D, u, 0);
        }

        const introT = st.intro;
        const smoothIntro = introT * introT * introT * (introT * (6 * introT - 15) + 10);
        const easeIntro = 1 - Math.pow(1 - st.intro, 3);
        const rotRad = ((cfg.pillarRotation + st.lean) * Math.PI) / 180;
        const spinVal = 0.3 * st.clock + st.spin;
        const widthVal = cfg.pillarWidth * (0.3 + 0.7 * smoothIntro);

        r.bindVertexArray(c);
        const bu = a.uniforms;
        r.bindFramebuffer(r.FRAMEBUFFER, h);
        r.viewport(0, 0, m.width, m.height);
        r.useProgram(a.program);
        r.uniform1f(bu.uTime, st.clock * cfg.flow);
        r.uniform2f(bu.uResolution, g.width, g.height);
        r.uniform2f(bu.uTarget, m.width, m.height);
        r.uniform2f(bu.uRot, Math.cos(spinVal), Math.sin(spinVal));
        r.uniform2f(bu.uPillarRot, Math.cos(rotRad), Math.sin(rotRad));
        r.uniform2f(bu.uWave, Math.sin(cfg.twist), Math.cos(cfg.twist));
        r.uniform1f(bu.uShift, st.shift);
        r.uniform1f(bu.uPillarWidth, widthVal);
        r.uniform1f(bu.uPillarHeight, cfg.pillarHeight);
        r.uniform1i(bu.uDetail, cfg.detail);
        r.uniform3fv(bu.uTopColor, p(cfg.topColor));
        r.uniform3fv(bu.uBottomColor, p(cfg.bottomColor));
        r.uniform1f(bu.uGlowAmount, cfg.glowAmount);
        r.uniform1f(bu.uWidthNorm, widthVal / 3);
        r.drawArrays(r.TRIANGLES, 0, 3);

        r.bindTexture(r.TEXTURE_2D, u);
        if (cfg.bloom > 0) r.generateMipmap(r.TEXTURE_2D);

        pulseArr.fill(0);
        w.forEach((pulse, idx) => {
          pulseArr.set([pulse.axis + 1.7 * pulse.age, Math.exp(-pulse.age / 0.63), 0, 0], 4 * idx);
        });

        const eu = i.uniforms;
        r.bindFramebuffer(r.FRAMEBUFFER, null);
        r.viewport(0, 0, t.width, t.height);
        r.useProgram(i.program);
        r.activeTexture(r.TEXTURE0);
        r.bindTexture(r.TEXTURE_2D, u);
        r.uniform1i(eu.uField, 0);
        r.uniform2f(eu.uFieldSize, m.width, m.height);
        r.uniform2f(eu.uView, t.width, t.height);
        r.uniform2f(eu.uAspect, g.width / g.height, 1);
        r.uniform2f(eu.uPillarRot, Math.cos(rotRad), Math.sin(rotRad));
        r.uniform1f(eu.uShift, st.shift);
        r.uniform1f(eu.uIntensity, cfg.intensity * (0.15 + 0.85 * easeIntro) * (1 + 0.12 * st.touch));
        r.uniform1f(eu.uNoiseIntensity, cfg.noiseIntensity);
        r.uniform1f(eu.uLightMode, +!!cfg.lightMode);
        const chroma = (rgb) => Math.max(...rgb) - Math.min(...rgb);
        const maxChroma = Math.max(chroma(p(cfg.topColor)), chroma(p(cfg.bottomColor)));
        r.uniform1f(eu.uNeutral, 1 - j((maxChroma - 0.08) / 0.12, 0, 1));
        r.uniform1f(eu.uBloom, cfg.bloom);
        r.uniform1f(eu.uFade, cfg.fade);
        const aspectPad = g.width / g.height + 1.2;
        r.uniform1f(eu.uReveal, st.intro >= 1 ? 1e4 : -aspectPad + easeIntro * (2 * aspectPad + 1.2));
        r.uniform1f(eu.uFlare, st.intro >= 1 ? 0 : (1 - easeIntro) * 1.3 * Math.min(1, 8 * st.intro));
        r.uniform4fv(eu.uPulses, pulseArr);
        r.drawArrays(r.TRIANGLES, 0, 3);
      };

      const tick = (now) => {
        rafId = 0;
        if (disposed || !isVisible || document.hidden || !t.isConnected) return;
        const cfg = q.current;
        if (cfg.maxFps > 0 && lastTs && now - lastTs < 1000 / cfg.maxFps - 2) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        const dt = lastTs ? Math.min(0.05, (now - lastTs) / 1000) : 1 / 60;
        if (lastTs) {
          const frameCost = ((now - lastTs) / 1000) * (cfg.maxFps > 0 ? Math.min(1, cfg.maxFps / 60) : 1);
          if (frameCost > 0.025) { st.slow += 1; st.quick = 0; }
          else if (frameCost < 1 / 55) { st.quick += 1; st.slow = 0; }
          if (st.slow > 20) { st.governor = Math.max(0.5, 0.85 * st.governor); st.slow = 0; }
          else if (st.quick > 180 && st.governor < 1) { st.governor = Math.min(1, 1.1 * st.governor); st.quick = 0; }
        }
        lastTs = now;

        const isAnimated = !cfg.paused && !x && cfg.rotationSpeed !== 0;
        if (isAnimated) st.clock += 0.96 * dt * cfg.rotationSpeed;
        if (!cfg.intro || x) st.intro = 1;
        else if (st.intro < 1) st.intro = Math.min(1, st.intro + dt / 2.1);

        const interactive = cfg.interactive && v.inside && !x && !isSoftwareGl;
        const normX = interactive ? v.x / g.width - 0.5 : 0;
        const lerp = 1 - Math.exp(-(2.4 * dt));
        st.spin += (1.4 * normX - st.spin) * lerp;
        st.lean += (9 * normX - st.lean) * lerp;
        st.shift += (0.35 * normX * (g.width / g.height) - st.shift) * lerp;
        st.touch += ((interactive ? 1 : 0) - st.touch) * (1 - Math.exp(-(3 * dt)));

        for (let idx = w.length - 1; idx >= 0; idx--) {
          w[idx].age += dt;
          if (w[idx].age > 3.08) w.splice(idx, 1);
        }

        renderFrame();

        const needsMore =
          st.intro < 1 ||
          w.length > 0 ||
          Math.abs(1.4 * normX - st.spin) > 5e-4 ||
          Math.abs((interactive ? 1 : 0) - st.touch) > 0.002;
        if (isAnimated || needsMore) {
          rafId = requestAnimationFrame(tick);
        } else {
          lastTs = 0;
        }
      };

      const schedule = () => {
        if (disposed || rafId || !isVisible || document.hidden || !t.isConnected) return;
        rafId = requestAnimationFrame(tick);
      };

      const resize = () => {
        if (disposed) return;
        const cw = Math.max(1, e.clientWidth);
        const ch = Math.max(1, e.clientHeight);
        const pr = Math.min(window.devicePixelRatio || 1, q.current.maxPixelRatio);
        g.width = cw;
        g.height = ch;
        g.ratio = pr;
        t.width = Math.max(1, Math.round(cw * pr));
        t.height = Math.max(1, Math.round(ch * pr));
        renderFrame();
        schedule();
      };

      const toLocal = (ev) => {
        const rect = e.getBoundingClientRect();
        const lx = ev.clientX - rect.left;
        const ly = ev.clientY - rect.top;
        return { x: lx, y: ly, inside: lx >= 0 && ly >= 0 && lx <= rect.width && ly <= rect.height };
      };

      const onMove = (ev) => {
        if (isSoftwareGl) return;
        const loc = toLocal(ev);
        v.x = loc.x;
        v.y = loc.y;
        v.inside = loc.inside;
        schedule();
      };

      const onDown = (ev) => {
        const cfg = q.current;
        if (!cfg.clickPulse || x || isSoftwareGl) return;
        const loc = toLocal(ev);
        if (!loc.inside) return;
        const rad = ((cfg.pillarRotation + st.lean) * Math.PI) / 180;
        const aspect = g.width / g.height;
        const axis = Math.sin(rad) * (((loc.x / g.width) * 2 - 1) * aspect - st.shift) + Math.cos(rad) * (1 - (loc.y / g.height) * 2);
        w.push({ axis, age: 0 });
        if (w.length > 3) w.shift();
        schedule();
      };

      const onLeave = () => { v.inside = false; schedule(); };
      const onVis = () => { lastTs = 0; schedule(); };

      const ro = new ResizeObserver(resize);
      ro.observe(e);
      const io = new IntersectionObserver((entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
        if (isVisible) {
          lastTs = 0;
          schedule();
        }
      });
      io.observe(e);

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVis);

      resize();

      activeCanvas = t;
      activeCleanup = () => {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        document.removeEventListener("visibilitychange", onVis);
        t.removeEventListener("webglcontextlost", onContextLost);
        t.removeEventListener("webglcontextrestored", onContextRestored);
        try {
          if (u) r.deleteTexture(u);
          if (h) r.deleteFramebuffer(h);
          if (s) r.deleteBuffer(s);
          if (c) r.deleteVertexArray(c);
          if (a?.program) r.deleteProgram(a.program);
          if (i?.program) r.deleteProgram(i.program);
        } catch {}
      };
    } catch (err) {
      console.warn('WebGL2 light pillar init notice:', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initFlicxLightPillar, { once: true });
  } else {
    window.initFlicxLightPillar();
  }
})();

