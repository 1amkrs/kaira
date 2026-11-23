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

  window.initFlicxLightPillar = function() {
    const container = document.querySelector('.light-pillar-container');
    const canvas = document.querySelector('canvas.light-pillar-canvas');
    if (!container || !canvas) return;

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
        maxFps: 0
      }
    };

    try {
      let e=document.querySelector('.light-pillar-container'), t=document.querySelector('canvas.light-pillar-canvas'),r=t?.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,powerPreference:"high-performance"});if(!e||!t||!r)return;let l=!!r.getExtension("EXT_color_buffer_float"),a=M(r,b),i=M(r,E);if(!a||!i)return;let n=e=>{e.preventDefault()},o=()=>void 0;t.addEventListener("webglcontextlost",n),t.addEventListener("webglcontextrestored",o);let s=r.createBuffer(),c=r.createVertexArray();r.bindVertexArray(c),r.bindBuffer(r.ARRAY_BUFFER,s),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0);let u=null,h=r.createFramebuffer(),m={width:0,height:0},d=document.createElement("canvas").getContext("2d",{willReadFrequently:!0}),f=new Map,p=e=>{if(f.has(e))return f.get(e);let t=[1,1,1];if(d){d.clearRect(0,0,1,1),d.fillStyle="#ffffff",d.fillStyle=e,d.fillRect(0,0,1,1);let[r,l,a]=d.getImageData(0,0,1,1).data;t=[r/255,l/255,a/255]}return f.set(e,t),t},x=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??!1,g={width:1,height:1,ratio:1},v={x:0,y:0,inside:!1},w=[],y=new Float32Array(12),A={clock:0,intro:q.current.intro&&!x?0:1,touch:0,spin:0,lean:0,shift:0,governor:1,slow:0,quick:0},R=0,F=0,L=!0,T=()=>{let e,n=q.current,o=Math.max(.25,n.scale*A.governor);((e,t)=>{if(m.width===e&&m.height===t)return;m.width=e,m.height=t,u&&r.deleteTexture(u),u=r.createTexture(),r.bindTexture(r.TEXTURE_2D,u);let a=Math.floor(Math.log2(Math.max(e,t)))+1;r.texStorage2D(r.TEXTURE_2D,a,l?r.RGBA16F:r.RGBA8,e,t),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR_MIPMAP_LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,h),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,u,0)})(Math.max(1,Math.round(g.width*o)),Math.max(1,Math.round(g.height*o)));let s=(e=A.intro)*e*e*(e*(6*e-15)+10),d=1-Math.pow(1-A.intro,3),f=(n.pillarRotation+A.lean)*Math.PI/180,x=.3*A.clock+A.spin,v=n.pillarWidth*(.3+.7*s);r.bindVertexArray(c);let b=a.uniforms;r.bindFramebuffer(r.FRAMEBUFFER,h),r.viewport(0,0,m.width,m.height),r.useProgram(a.program),r.uniform1f(b.uTime,A.clock*n.flow),r.uniform2f(b.uResolution,g.width,g.height),r.uniform2f(b.uTarget,m.width,m.height),r.uniform2f(b.uRot,Math.cos(x),Math.sin(x)),r.uniform2f(b.uPillarRot,Math.cos(f),Math.sin(f)),r.uniform2f(b.uWave,Math.sin(n.twist),Math.cos(n.twist)),r.uniform1f(b.uShift,A.shift),r.uniform1f(b.uPillarWidth,v),r.uniform1f(b.uPillarHeight,n.pillarHeight),r.uniform1i(b.uDetail,n.detail),r.uniform3fv(b.uTopColor,p(n.topColor)),r.uniform3fv(b.uBottomColor,p(n.bottomColor)),r.uniform1f(b.uGlowAmount,n.glowAmount),r.uniform1f(b.uWidthNorm,v/3),r.drawArrays(r.TRIANGLES,0,3),r.bindTexture(r.TEXTURE_2D,u),n.bloom>0&&r.generateMipmap(r.TEXTURE_2D),y.fill(0),w.forEach((e,t)=>{y.set([e.axis+1.7*e.age,Math.exp(-e.age/.63),0,0],4*t)});let E=i.uniforms;r.bindFramebuffer(r.FRAMEBUFFER,null),r.viewport(0,0,t.width,t.height),r.useProgram(i.program),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,u),r.uniform1i(E.uField,0),r.uniform2f(E.uFieldSize,m.width,m.height),r.uniform2f(E.uView,t.width,t.height),r.uniform2f(E.uAspect,g.width/g.height,1),r.uniform2f(E.uPillarRot,Math.cos(f),Math.sin(f)),r.uniform1f(E.uShift,A.shift),r.uniform1f(E.uIntensity,n.intensity*(.15+.85*d)*(1+.12*A.touch)),r.uniform1f(E.uNoiseIntensity,n.noiseIntensity),r.uniform1f(E.uLightMode,+!!n.lightMode);let R=e=>Math.max(...e)-Math.min(...e),M=Math.max(R(p(n.topColor)),R(p(n.bottomColor)));r.uniform1f(E.uNeutral,1-j((M-.08)/.12,0,1)),r.uniform1f(E.uBloom,n.bloom),r.uniform1f(E.uFade,n.fade);let F=g.width/g.height+1.2;r.uniform1f(E.uReveal,A.intro>=1?1e4:-F+d*(2*F+1.2)),r.uniform1f(E.uFlare,A.intro>=1?0:(1-d)*1.3*Math.min(1,8*A.intro)),r.uniform4fv(E.uPulses,y),r.drawArrays(r.TRIANGLES,0,3)},S=e=>{var t;if(R=0,!L||document.hidden)return;let r=q.current;if(r.maxFps>0&&F&&e-F<1e3/r.maxFps-2){R=requestAnimationFrame(S);return}let l=F?Math.min(.05,(e-F)/1e3):1/60;F&&((t=(e-F)/1e3*(r.maxFps>0?Math.min(1,r.maxFps/60):1))>.025?(A.slow+=1,A.quick=0):t<1/55&&(A.quick+=1,A.slow=0),A.slow>20?(A.governor=Math.max(.5,.85*A.governor),A.slow=0):A.quick>180&&A.governor<1&&(A.governor=Math.min(1,1.1*A.governor),A.quick=0)),F=e;let a=!r.paused&&!x&&0!==r.rotationSpeed;a&&(A.clock+=.96*l*r.rotationSpeed),!r.intro||x?A.intro=1:A.intro<1&&(A.intro=Math.min(1,A.intro+l/2.1));let i=r.interactive&&v.inside&&!x,n=i?v.x/g.width-.5:0,o=1-Math.exp(-(2.4*l));A.spin+=(1.4*n-A.spin)*o,A.lean+=(9*n-A.lean)*o,A.shift+=(.35*n*(g.width/g.height)-A.shift)*o,A.touch+=(!!i-A.touch)*(1-Math.exp(-(3*l)));for(let e=w.length-1;e>=0;e--)w[e].age+=l,w[e].age>3.08&&w.splice(e,1);T();let s=A.intro<1||w.length>0||Math.abs(1.4*n-A.spin)>5e-4||Math.abs(!!i-A.touch)>.002;a||s?R=requestAnimationFrame(S):F=0},N=()=>{R||!L||document.hidden||(R=requestAnimationFrame(S))},P=()=>{let r=Math.max(1,e.clientWidth),l=Math.max(1,e.clientHeight),a=Math.min(window.devicePixelRatio||1,q.current.maxPixelRatio);g.width=r,g.height=l,g.ratio=a,t.width=Math.max(1,Math.round(r*a)),t.height=Math.max(1,Math.round(l*a)),T(),N()},I=t=>{let r=e.getBoundingClientRect(),l=t.clientX-r.left,a=t.clientY-r.top;return{x:l,y:a,inside:l>=0&&a>=0&&l<=r.width&&a<=r.height}},U=e=>{let t=I(e);v.x=t.x,v.y=t.y,v.inside=t.inside,N()},D=e=>{var t,r;let l,a=q.current;if(!a.clickPulse||x)return;let i=I(e);if(!i.inside)return;let n=(a.pillarRotation+A.lean)*Math.PI/180;w.push({axis:(t=i.x,r=i.y,l=g.width/g.height,Math.sin(n)*((t/g.width*2-1)*l-A.shift)+Math.cos(n)*(1-r/g.height*2)),age:0}),w.length>3&&w.shift(),N()},B=()=>{v.inside=!1,N()},V=()=>{F=0,N()},$=new ResizeObserver(P);$.observe(e);let z=new IntersectionObserver(e=>{(L=e.some(e=>e.isIntersecting))&&(F=0,N())});return z.observe(e),window.addEventListener("pointermove",U,{passive:!0}),window.addEventListener("pointerdown",D,{passive:!0}),document.documentElement.addEventListener("pointerleave",B),document.addEventListener("visibilitychange",V),P(),k.current=()=>{R||T(),N()};
} catch (err) {
      console.warn('WebGL2 light pillar init notice:', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initFlicxLightPillar);
  } else {
    window.initFlicxLightPillar();
  }
})();

