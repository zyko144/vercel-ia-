// Épreuve graphique : 60 000 losanges animés et éclairés, rendus en instanciation WebGL2, pendant 8 s.
// On mesure les images par seconde réelles (sans limite de 60 Hz grâce au rendu hors vsync d'Electron).
const c = document.getElementById('c');
const gl = c.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
const hud = document.getElementById('hud');
if (!gl) { window.bench?.done({ fps: null, error: 'WebGL2 indisponible' }); }
const N = 60000;
const vs = `#version 300 es
in vec2 p; in vec4 inst; uniform float t; uniform vec2 res; out vec3 col;
void main(){ float a = inst.z + t * (0.3 + inst.w); vec2 q = vec2(cos(a)*p.x - sin(a)*p.y, sin(a)*p.x + cos(a)*p.y) * 0.012;
  vec2 pos = inst.xy + vec2(sin(t*0.7+inst.w*9.0), cos(t*0.5+inst.z)) * 0.08 + q; pos.x *= res.y / res.x;
  col = mix(vec3(0.18,0.55,1.0), vec3(0.13,0.83,0.93), fract(inst.w*3.0+t*0.1)) * (0.6 + 0.4*sin(t*2.0+inst.z*6.0));
  gl_Position = vec4(pos, 0, 1); }`;
const fs = `#version 300 es
precision highp float; in vec3 col; out vec4 o; void main(){ float l = 0.0; for (int i = 0; i < 24; i++) l += sin(float(i) * col.r + gl_FragCoord.x * 0.01) * 0.002; o = vec4(col + l, 0.9); }`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog); gl.useProgram(prog);
const quad = new Float32Array([0, 1, 1, 0, 0, -1, -1, 0]);
const inst = new Float32Array(N * 4);
for (let i = 0; i < N; i++) { inst[i * 4] = Math.random() * 2 - 1; inst[i * 4 + 1] = Math.random() * 2 - 1; inst[i * 4 + 2] = Math.random() * 6.28; inst[i * 4 + 3] = Math.random(); }
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
const lp = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
const li = gl.getAttribLocation(prog, 'inst'); gl.enableVertexAttribArray(li); gl.vertexAttribPointer(li, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(li, 1);
gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
const ut = gl.getUniformLocation(prog, 't'); const ur = gl.getUniformLocation(prog, 'res');
// Mesure sans limite d'écran : on dessine en boucle et on attend la fin réelle du travail du GPU (lecture d'un pixel,
// qui oblige à attendre que l'image soit vraiment calculée),
// sans passer par la synchro verticale (sinon toutes les bonnes cartes plafonneraient à 60 / 144 images/s).
const px = new Uint8Array(4);
const WARM = 1500; const DUR = 8000; const start = performance.now();
let frames = 0; let busy = 0;
function draw(t) {
  const w = c.clientWidth * devicePixelRatio; const h = c.clientHeight * devicePixelRatio;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
  gl.clearColor(0.03, 0.02, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(ut, t / 1000); gl.uniform2f(ur, w, h);
  gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, N);
}
function batch() {
  const now = performance.now();
  const el = now - start;
  for (let k = 0; k < 4; k++) {
    const t0 = performance.now();
    draw(t0 - start);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (el > WARM) { frames += 1; busy += performance.now() - t0; }
  }
  const fps = busy > 0 ? Math.round(frames / (busy / 1000)) : null;
  hud.textContent = `Benchmark carte graphique · ${Math.max(0, Math.ceil((DUR - el) / 1000))} s · ${fps ?? '…'} images/s`;
  if (el < DUR) setTimeout(batch, 0);
  else window.bench?.done({ fps, width: c.width, height: c.height });
}
setTimeout(batch, 50);
