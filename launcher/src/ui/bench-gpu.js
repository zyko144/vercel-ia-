// Épreuve graphique du Benchmark History : 3 scènes rendues en 2560×1440 (même charge sur tous les PC,
// quelle que soit la taille de la fenêtre), mesurées sans la limite de l'écran.
//  1. Géométrie : 150 000 cubes éclairés par 8 lumières, anticrénelage 4×  (≈ 1,8 million de triangles par image)
//  2. Shaders : scène entièrement calculée par pixel (raymarching, ombres douces, occlusion, relief fractal)
//  3. Post-traitement : rendu HDR + halo lumineux (bloom) en 6 passes de flou + tone mapping
const c = document.getElementById('c');
const hud = document.getElementById('hud');
const gl = c.getContext('webgl2', { antialias: false, depth: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
const W = 2560; const H = 1440;
const fail = (error) => window.bench?.done({ fps: null, error });
if (!gl) fail('WebGL2 indisponible');

function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
const U = (p, n) => gl.getUniformLocation(p, n);

// ---------- Matrices ----------
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2); const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(e, t) {
  const z = norm3([e[0] - t[0], e[1] - t[1], e[2] - t[2]]); const x = norm3(cross([0, 1, 0], z)); const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
function mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function norm3(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// ---------- Cibles de rendu ----------
function target(w, h, { msaa = 0, depth = false, hdr = false } = {}) {
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const fmt = hdr ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
  let tex = null;
  if (msaa) {
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, fmt[0], w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  } else {
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, fmt[1], fmt[2], null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }
  if (depth) {
    const db = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, db);
    if (msaa) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.DEPTH_COMPONENT24, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db);
  }
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('cible de rendu refusée');
  return { fb, tex, w, h };
}

// ---------- Scène 1 et 3 : cubes éclairés (instanciation) ----------
const CUBE = (() => {
  const f = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; const out = [];
  for (const n of f) {
    const u = n[1] !== 0 ? [1, 0, 0] : [0, 1, 0]; const v = cross(n, u);
    const P = (a, b) => [n[0] + u[0] * a + v[0] * b, n[1] + u[1] * a + v[1] * b, n[2] + u[2] * a + v[2] * b];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) out.push(...P(a, b), ...n);
  }
  return new Float32Array(out);
})();
const CUBES_VS = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm; layout(location=2) in vec4 inst;
uniform mat4 vp; uniform float t; out vec3 wp; out vec3 wn; out float hue;
mat3 rot(float a){ float c=cos(a), s=sin(a); vec3 k=normalize(vec3(0.3,1.0,0.5)); return mat3(c+k.x*k.x*(1.0-c), k.y*k.x*(1.0-c)+k.z*s, k.z*k.x*(1.0-c)-k.y*s, k.x*k.y*(1.0-c)-k.z*s, c+k.y*k.y*(1.0-c), k.z*k.y*(1.0-c)+k.x*s, k.x*k.z*(1.0-c)+k.y*s, k.y*k.z*(1.0-c)-k.x*s, c+k.z*k.z*(1.0-c)); }
void main(){ mat3 r = rot(t*(0.6+inst.w)+inst.w*20.0); vec3 p = inst.xyz + vec3(0.0, sin(t+inst.w*30.0)*0.6, 0.0);
  wp = p + r*pos*0.32; wn = r*nrm; hue = inst.w; gl_Position = vp*vec4(wp,1.0); }`;
const CUBES_FS = `#version 300 es
precision highp float; in vec3 wp; in vec3 wn; in float hue; uniform float t; uniform vec3 eye; uniform float gain; out vec4 o;
void main(){ vec3 n = normalize(wn); vec3 v = normalize(eye-wp); vec3 base = mix(vec3(0.15,0.45,1.0), vec3(0.1,0.85,0.95), hue);
  vec3 col = base*0.06;
  for(int i=0;i<8;i++){ float a = t*0.4+float(i)*0.785; vec3 lp = vec3(cos(a)*30.0, 8.0+sin(t+float(i))*6.0, sin(a)*30.0);
    vec3 lc = 0.5+0.5*cos(vec3(0.0,2.0,4.0)+float(i)); vec3 l = lp-wp; float d = length(l); l/=d;
    float diff = max(dot(n,l),0.0); float spec = pow(max(dot(n,normalize(l+v)),0.0), 48.0);
    col += (base*diff + spec*0.8)*lc*(40.0/(1.0+d*d*0.05)); }
  float fog = exp(-length(eye-wp)*0.012); o = vec4(mix(vec3(0.02,0.02,0.05), col*gain, fog), 1.0); }`;
let cubes = null;
function makeCubes(count) {
  const prog = program(CUBES_VS, CUBES_FS);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, CUBE, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  const inst = new Float32Array(count * 4); let s = 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) { inst[i * 4] = (rnd() - 0.5) * 90; inst[i * 4 + 1] = (rnd() - 0.5) * 40; inst[i * 4 + 2] = (rnd() - 0.5) * 90; inst[i * 4 + 3] = rnd(); }
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
  return { prog, vao, count, vp: U(prog, 'vp'), t: U(prog, 't'), eye: U(prog, 'eye'), gain: U(prog, 'gain') };
}
function drawCubes(k, t, w, h, count, gain = 1) {
  const eye = [Math.cos(t * 0.15) * 55, 18, Math.sin(t * 0.15) * 55];
  gl.useProgram(k.prog); gl.bindVertexArray(k.vao);
  gl.uniformMatrix4fv(k.vp, false, mul(perspective(1.0, w / h, 0.5, 300), lookAt(eye, [0, 0, 0])));
  gl.uniform1f(k.t, t); gl.uniform3fv(k.eye, eye); gl.uniform1f(k.gain, gain);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, count);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
}

// ---------- Écran entier (scène 2 et post-traitement) ----------
const FULL_VS = `#version 300 es
out vec2 uv; void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); uv = p; gl_Position = vec4(p*2.0-1.0,0.0,1.0); }`;
const RAY_FS = `#version 300 es
precision highp float; in vec2 uv; uniform float t; uniform vec2 res; out vec4 o;
float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
float map(vec3 p){ vec3 q = p; q.xz = mod(q.xz+2.0,4.0)-2.0;
  float sph = length(q-vec3(0.0,1.0+0.3*sin(t+p.x),0.0))-0.9; float box = length(max(abs(q)-vec3(0.6,2.2,0.6),0.0))-0.1;
  float ground = p.y + 0.4*fbm(p*0.6+vec3(0.0,0.0,t*0.2));
  return min(ground, mix(sph, box, 0.5+0.5*sin(t*0.7+p.z*0.3))); }
vec3 normal(vec3 p){ vec2 e=vec2(0.002,0.0); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float shadow(vec3 ro, vec3 rd){ float r=1.0, d=0.05; for(int i=0;i<40;i++){ float h=map(ro+rd*d); r=min(r,10.0*h/d); d+=clamp(h,0.03,0.5); if(h<0.001||d>20.0) break; } return clamp(r,0.0,1.0); }
float ao(vec3 p, vec3 n){ float s=0.0; for(int i=1;i<=6;i++){ float h=0.08*float(i); s+=(h-map(p+n*h))/float(i); } return clamp(1.0-3.0*s,0.0,1.0); }
void main(){ vec2 p = (uv*2.0-1.0)*vec2(res.x/res.y,1.0);
  vec3 ro = vec3(sin(t*0.2)*8.0, 3.0, t*1.5); vec3 ta = ro + vec3(sin(t*0.3), -0.35, 1.0);
  vec3 f = normalize(ta-ro), r = normalize(cross(vec3(0,1,0),f)), u = cross(f,r); vec3 rd = normalize(p.x*r+p.y*u+1.6*f);
  float d = 0.0; bool hit = false;
  for(int i=0;i<140;i++){ float h = map(ro+rd*d); if(h<0.0008*d){ hit=true; break; } d += h*0.8; if(d>60.0) break; }
  vec3 sky = mix(vec3(0.05,0.07,0.15), vec3(0.2,0.45,0.9), max(rd.y,0.0)); vec3 col = sky;
  if(hit){ vec3 pos = ro+rd*d; vec3 n = normal(pos); vec3 l = normalize(vec3(0.6,0.8,-0.3));
    float dif = max(dot(n,l),0.0)*shadow(pos+n*0.01,l); float occ = ao(pos,n);
    vec3 alb = mix(vec3(0.15,0.5,1.0), vec3(0.1,0.9,0.9), fbm(pos*2.0));
    col = alb*(dif*1.2+0.15*occ) + pow(max(dot(reflect(-l,n),-rd),0.0),32.0)*dif; col = mix(col, sky, 1.0-exp(-0.03*d)); }
  o = vec4(pow(col, vec3(0.4545)),1.0); }`;
const BRIGHT_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D src; out vec4 o; void main(){ vec3 c = texture(src,uv).rgb; o = vec4(max(c-1.0,0.0),1.0); }`;
const BLUR_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D src; uniform vec2 dir; out vec4 o;
void main(){ float w[5] = float[](0.227,0.195,0.122,0.054,0.016); vec3 c = texture(src,uv).rgb*w[0];
  for(int i=1;i<5;i++){ c += texture(src,uv+dir*float(i)).rgb*w[i]; c += texture(src,uv-dir*float(i)).rgb*w[i]; } o = vec4(c,1.0); }`;
const TONE_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D scene; uniform sampler2D bloom; out vec4 o;
void main(){ vec3 c = texture(scene,uv).rgb + texture(bloom,uv).rgb*1.4; c = c/(1.0+c); o = vec4(pow(c,vec3(0.4545)),1.0); }`;

// ---------- Déroulé : chaque scène 1,2 s d'échauffement puis 6 s de mesure ----------
const px = new Uint8Array(4);
const WARM = 1200; const DUR = 6000;
const results = {};
const view = () => { const w = c.clientWidth * devicePixelRatio; const h = c.clientHeight * devicePixelRatio; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } };
function show(from) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.blitFramebuffer(0, 0, from.w, from.h, 0, 0, c.width, c.height, gl.COLOR_BUFFER_BIT, gl.LINEAR); }
function runScene(name, label, frame) {
  return new Promise((resolve) => {
    const start = performance.now(); let frames = 0; let busy = 0;
    const batch = () => {
      const el = performance.now() - start;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        frame((t0 - start) / 1000);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // attend la fin réelle du calcul de l'image
        if (el > WARM) { frames += 1; busy += performance.now() - t0; }
      }
      const fps = busy > 0 ? frames / (busy / 1000) : null;
      hud.textContent = `Carte graphique · ${label} · ${Math.max(0, Math.ceil((WARM + DUR - el) / 1000))} s · ${fps ? fps.toFixed(1) : '…'} images/s (2560×1440)`;
      if (el < WARM + DUR) setTimeout(batch, 0);
      else { results[name] = fps ? Math.round(fps * 10) / 10 : null; resolve(); }
    };
    setTimeout(batch, 30);
  });
}

async function main() {
  view();
  const msaa = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  const hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
  const geo = target(W, H, { msaa, depth: true }); const geoOut = target(W, H);
  cubes = makeCubes(150_000);
  await runScene('geometry', '1/3 Géométrie : 150 000 cubes, 8 lumières', (t) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, geo.fb); gl.viewport(0, 0, W, H);
    gl.clearColor(0.02, 0.02, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawCubes(cubes, t, W, H, 150_000);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, geo.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, geoOut.fb);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST); // résolution de l'anticrénelage
    view(); show(geoOut); gl.bindFramebuffer(gl.FRAMEBUFFER, geoOut.fb);
  });

  const ray = program(FULL_VS, RAY_FS); const rayOut = target(W, H);
  const vao = gl.createVertexArray();
  await runScene('shader', '2/3 Shaders : raymarching, ombres douces, relief fractal', (t) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, rayOut.fb); gl.viewport(0, 0, W, H);
    gl.useProgram(ray); gl.bindVertexArray(vao); gl.uniform1f(U(ray, 't'), t); gl.uniform2f(U(ray, 'res'), W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    view(); show(rayOut); gl.bindFramebuffer(gl.FRAMEBUFFER, rayOut.fb);
  });

  const scene = target(W, H, { depth: true, hdr }); const half = [target(W / 2, H / 2, { hdr }), target(W / 2, H / 2, { hdr })]; const out = target(W, H);
  const bright = program(FULL_VS, BRIGHT_FS); const blur = program(FULL_VS, BLUR_FS); const tone = program(FULL_VS, TONE_FS);
  const tex = (p, name, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(p, name), unit); };
  await runScene('post', '3/3 Post-traitement : HDR, halo lumineux, tone mapping', (t) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb); gl.viewport(0, 0, W, H);
    gl.clearColor(0.02, 0.02, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawCubes(cubes, t, W, H, 60_000, hdr ? 2.5 : 1);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, half[0].fb); gl.viewport(0, 0, W / 2, H / 2); gl.useProgram(bright); tex(bright, 'src', scene.tex, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(blur);
    for (let i = 0; i < 6; i++) {
      const a = half[i % 2]; const b = half[(i + 1) % 2];
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); tex(blur, 'src', a.tex, 0);
      gl.uniform2f(U(blur, 'dir'), i % 2 ? 0 : 2 / W, i % 2 ? 2 / H : 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, W, H); gl.useProgram(tone); tex(tone, 'scene', scene.tex, 0); tex(tone, 'bloom', half[0].tex, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
    view(); show(out); gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
  });
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  window.bench?.done({ scenes: results, width: W, height: H, msaa, hdr, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null });
}
if (gl) main().catch((err) => fail(err.message));
