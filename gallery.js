import * as THREE from 'three';
import { gsap } from 'gsap';
import { FONT, drawStudioTile } from './studio.js';

/* ------------------------------------------------------------------ *
 *  Tunables. Press "g" (or open with ?debug) to tweak them live.      *
 * ------------------------------------------------------------------ */
export const params = {
  mode: 'inside', // 'inside' = you stand inside the sphere (field bows in), 'outside' = globe
  lens: 50, // half-angle (deg) from screen centre to corner. Wider = more stretch at the edges
  push: 0.7, // how far the field recedes while it is bent (fraction of camera distance)
  radius: 1, // 1 = the camera sits exactly at the sphere's centre. < 1 stronger, > 1 gentler
  gather: 1.2, // spacing between pictures while bent (1 = same as at rest, 0.5 = half)
  depth: 0, // px of per-tile depth scatter while bent (0 = every picture sits on the sphere)
  lean: 0, // how much the sphere leans with the drag direction (0 = pivot stays at the centre)
  stiffness: 140, // settle spring
  damping: 0.62, // < 1 gives a small overshoot when it flattens back out
  speedMin: 40, // px/s where motion starts to bend the field
  speedMax: 1500, // px/s where the bend is full
  maxAngle: 1.45, // radians — never wrap a point past this around the sphere
  // the horizon: while bent, off-screen tiles fold in against the edges
  edgeWrap: 1, // 0 = off, 1 = full
  edgeWrapStart: 0.9, // where the fold starts (share of the half-screen from the centre);
  // kept near the edge so the sphere's stretch still carries most of the screen
  // lens band round the screen edges
  lensRest: 0, // lens when still (0 = clean, like essesi)
  lensMotion: 1, // lens while moving
  lensSide: 0.08, // band depth at the left/right edges, share of the width...
  lensSideMax: 130, // ...but never more than this many px
  lensTop: 0.1, // band depth at the top/bottom edges, share of the height...
  lensTopMax: 100, // ...but never more than this many px
  lensStretch: 0.6, // how hard the band squeezes (0 = none, 0.95 = extreme)
  lensFlare: 0.2, // how much pictures swell as they reach an edge
  lensCA: 0.09, // colour split in the band
  lensIri: 0.26, // oil-slick tint in the band
  lensRim: 0.5, // thin rainbow line on the very edge
};

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// wrap v into [-T/2, T/2)
const wrap = (v, T) => v - T * Math.floor((v + T / 2) / T);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const hash = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ------------------------------------------------------------------ *
 *  Shaders                                                            *
 * ------------------------------------------------------------------ */

// Every vertex starts on a flat plane (z = 0, 1 unit = 1 css px at rest).
// While warped, the plane is wrapped onto a sphere that touches it at the
// centre of the screen: arc length is kept, so a tile r px from the centre
// sits at angle a = r / R on the sphere. Concave ("inside") curls the edges
// towards the camera, so the middle feels pushed in and the rim bends round you.
const VERT = /* glsl */ `
  uniform float uWarp;
  uniform float uCurv;
  uniform float uPush;
  uniform float uMaxA;
  uniform vec2  uBend;
  uniform float uDepth;
  uniform float uJitter;
  uniform float uGather;    // 1 = layout spacing, < 1 = pulled together
  uniform vec2  uHalf;      // half the screen, in px
  uniform float uWrap;      // 0..1 how much the edges fold (follows the bend)
  uniform float uWrapStart; // where the fold starts, as a share of the half-screen

  varying vec2 vLocal;

  // The horizon at the screen edges: past uWrapStart, positions ease towards the
  // edge and never quite reach it, so whatever is off-screen gets folded in and
  // compressed against the edge instead of disappearing.
  float foldAxis(float u, float h) {
    float inner = h * uWrapStart;
    float au = abs(u);
    if (au <= inner) return u;
    float band = h - inner;
    float g = inner + band * (1.0 - exp(-(au - inner) / band));
    return sign(u) * mix(au, g, uWrap);
  }

  void main() {
    vLocal = position.xy;
    vec4 w = modelMatrix * vec4(position, 1.0);
    // while bent, the grid pulls together: tile centres move in, tiles keep their size
    w.xy = modelMatrix[3].xy * uGather + position.xy;

    // On the sphere: x is longitude, y is latitude (arc length kept), with the
    // camera at the sphere's centre. Dragging changes the offset, which spins
    // the sphere round that centre: sideways = turning round the vertical axis,
    // up/down = tilting towards the poles.
    vec2 p = w.xy - uBend;
    float k = uCurv * uWarp;
    vec3 s = vec3(p, 0.0);
    if (abs(k) > 1e-8) {
      float lon = clamp(p.x * k, -uMaxA, uMaxA);
      float lat = clamp(p.y * k, -uMaxA, uMaxA);
      s = vec3(cos(lat) * sin(lon), sin(lat), 1.0 - cos(lat) * cos(lon)) / k;
    }
    w.xy = uBend + s.xy;
    w.z = s.z - uPush + uJitter * uDepth * max(uWarp, 0.0);

    vec4 clip = projectionMatrix * viewMatrix * w;
    if (uWrap > 0.0 && clip.w > 0.0) {
      vec2 sp = clip.xy / clip.w * uHalf; // screen px from the centre
      sp = vec2(foldAxis(sp.x, uHalf.x), foldAxis(sp.y, uHalf.y));
      clip.xy = sp / uHalf * clip.w;
    }
    gl_Position = clip;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uCap;
  uniform float uTexAspect;
  uniform float uReveal;
  uniform vec2  uSize;
  uniform vec4  uCapRect;
  uniform float uRadius;
  uniform float uLift;
  uniform float uFade;
  uniform float uAlpha;
  uniform float uHover;
  uniform vec3  uCapColor;
  uniform vec3  uPlaceholder;
  uniform float uCapShift;

  varying vec2 vLocal;

  float sdBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  vec4 over(vec4 s, vec4 d) { return s + d * (1.0 - s.a); }

  void main() {
    vec2 hs = uSize * 0.5;
    float d = sdBox(vLocal, hs, uRadius);
    float aa = max(fwidth(d), 1e-3);
    float inside = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, d);

    // the photo, cover-fit, untouched
    vec2 uv = vLocal / uSize + 0.5;
    float ta = uSize.x / uSize.y;
    vec2 sc = ta > uTexAspect ? vec2(1.0, uTexAspect / ta) : vec2(ta / uTexAspect, 1.0);
    vec3 col = mix(uPlaceholder, texture2D(uMap, (uv - 0.5) * sc + 0.5).rgb, uReveal);

    // soft drop shadow — the plates lift off the page while the field is bent
    float lift = clamp(uLift + uHover * 0.35, 0.0, 1.2);
    float ds = sdBox(vLocal - vec2(0.0, -10.0) * lift, hs, uRadius);
    float blur = 4.0 + 24.0 * lift;
    float sh = (1.0 - smoothstep(-blur, blur, ds)) * 0.2 * min(lift, 1.0);

    // caption under the image
    vec2 cuv = vec2((vLocal.x - uCapShift - uCapRect.x) / uCapRect.z, (uCapRect.y - vLocal.y) / uCapRect.w);
    vec2 cin = step(vec2(0.0), cuv) * step(cuv, vec2(1.0));
    float cap = texture2D(uCap, vec2(cuv.x, 1.0 - cuv.y)).a * cin.x * cin.y;

    // premultiplied compositing: shadow, then caption, then the plate
    vec4 c = vec4(0.0, 0.0, 0.0, sh);
    c = over(vec4(uCapColor * cap, cap), c);
    c = over(vec4(col, 1.0) * inside, c);
    gl_FragColor = c * (uAlpha * uFade);
  }
`;

// Full-screen pass: a lens band runs round all four edges of the screen.
// Whatever moves into the band is squeezed against the edge (it stretches and
// slows, as if wrapping round a curved glass rim), swells a little, splits into
// colour, smears with speed, and the very edge carries a thin rainbow line.
const POST_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const POST_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2  uRes;
  uniform vec2  uBand;    // band depth as a share of the screen: x = sides, y = top/bottom
  uniform float uAmount;  // 0..1 how present the lens is (follows the bend)
  uniform float uEnergy;  // 0..1 extra push from speed
  uniform float uStretch; // how hard the band squeezes
  uniform float uFlare;   // how much things swell as they reach an edge
  uniform float uCA;      // colour split
  uniform float uIri;     // oil-slick tint inside the band
  uniform float uRim;     // rainbow line on the very edge
  uniform float uTime;
  uniform vec3  uBg;
  varying vec2 vUv;

  // the scene composited over the page colour
  vec3 sceneAt(vec2 uv) {
    vec4 c = texture2D(tScene, clamp(uv, 0.0, 1.0));
    return c.rgb + uBg * (1.0 - c.a);
  }

  // 0 on the band's inner line, 1 on the screen edge
  float depthIn(float d, float inner) {
    return clamp((d - inner) / (0.5 - inner), 0.0, 1.0);
  }

  // squeeze one axis into the rim: the sample position eases off towards the
  // edge, so the picture there is stretched (by 1 / (1 - c) at the very edge)
  float squeeze(float x, float inner, float c) {
    float ax = abs(x);
    if (ax <= inner) return x;
    float t = (ax - inner) / (0.5 - inner);
    return sign(x) * (inner + (0.5 - inner) * (t - 0.5 * c * t * t));
  }

  vec2 lens(vec2 p, float c, float flare) {
    vec2 inner = 0.5 - uBand;
    float tx = depthIn(abs(p.x), inner.x);
    float ty = depthIn(abs(p.y), inner.y);
    vec2 s = vec2(squeeze(p.x, inner.x, c), squeeze(p.y, inner.y, c));
    s.y *= 1.0 - flare * tx * tx; // taller near the side edges
    s.x *= 1.0 - flare * ty * ty; // wider near the top and bottom
    return s + 0.5;
  }

  vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }

  void main() {
    vec2 p = vUv - 0.5;
    vec2 inner = 0.5 - uBand;
    float t = max(depthIn(abs(p.x), inner.x), depthIn(abs(p.y), inner.y));
    vec3 col;
    if (t <= 0.0) {
      col = sceneAt(vUv);
    } else {
      float c = uAmount * mix(uStretch, 0.97, uEnergy);
      float flare = uFlare * uAmount;
      float ca = uCA * t * uAmount * (1.0 + 2.0 * uEnergy);
      float smear = t * t * uAmount * (0.12 + 0.35 * uEnergy);
      // 7 taps at slightly different squeeze: colour splits and smears along the band
      col = vec3(0.0);
      for (int i = 0; i < 7; i++) {
        float k = float(i) / 6.0 * smear;
        col.r += sceneAt(lens(p, clamp(c + ca - k, 0.0, 0.98), flare)).r;
        col.g += sceneAt(lens(p, clamp(c - k, 0.0, 0.98), flare)).g;
        col.b += sceneAt(lens(p, clamp(c - ca - k, 0.0, 0.98), flare)).b;
      }
      col /= 7.0;
      // a faint oil-slick tint on the pictures (not the empty page) passing through
      float ink = smoothstep(0.03, 0.3, distance(col, uBg));
      vec3 iri = hue(fract(vUv.y * 0.9 + vUv.x * 0.35 + t * 0.45 + uTime * 0.03));
      col += (iri - 0.5) * 0.9 * uIri * uAmount * t * t * ink;
    }

    // thin rainbow line and soft halo along the very edge, colours drifting round
    vec2 dpx = min(vUv, 1.0 - vUv) * uRes;
    float d = min(dpx.x, dpx.y);
    float rim = (exp(-d / 4.5) * 0.7 + exp(-d / 34.0) * 0.26) * uRim * uAmount;
    float ang = atan(p.y * uRes.y, p.x * uRes.x) / 6.28318 + uTime * 0.05;
    col = mix(col, mix(hue(fract(ang)), vec3(1.0), 0.22), clamp(rim, 0.0, 1.0) * 0.6);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

/* ------------------------------------------------------------------ *
 *  Layout — the essesi-style grid at rest                             *
 * ------------------------------------------------------------------ */
export const IMG_SCALE = 0.065; // square image size as a share of the screen width

function layoutFor(vw, vh, count) {
  const cols = 4; // 4 photos per row
  const margin = 20; // padding on every side
  const captionOf = (img) => {
    const fs = Math.round(clamp(img * 0.085, 9.5, 11) * 2) / 2;
    return { fs, lh: Math.round(fs * 1.3), capGap: Math.round(clamp(img * 0.12, 9, 14)) };
  };

  // image size follows the screen width, but 3 rows (image + one caption line)
  // must always fit in the height with some air between them
  let img = clamp(vw * IMG_SCALE, 48, 128);
  const c0 = captionOf(img);
  const maxImg = (vh - margin * 2 - 48) / 3 - c0.capGap - c0.lh;
  img = Math.max(36, Math.round(Math.min(img, maxImg) / 2) * 2); // even, so edges land on whole pixels
  const { fs, lh, capGap } = captionOf(img);

  // columns: first flush left, last flush right
  const pitchX = Math.floor((vw - margin * 2 - img) / (cols - 1));
  // rows: first row's image at the top padding, third row's caption at the bottom padding,
  // so 3 rows always fill the screen height exactly
  const tileH = img + capGap + lh;
  const pitchY = Math.floor((vh - margin * 2 - tileH) / 2);

  const rows = Math.ceil(count / cols); // rows in one "page" of the archive
  const capH = lh * 3 + 4;
  const pad = 44; // room around the image for the shadow
  // captions may run wider than a small image (so short titles stay on one line),
  // but never into the next column
  const capW = Math.round(Math.min(Math.max(img + 28, 150), pitchX - 16) / 2) * 2;
  // wide enough for a caption that is pinned to the image's outer edge (edge columns)
  const planeW = Math.max(img + pad * 2, capW * 2 - img);
  const top = img / 2 + pad;
  const capTop = -img / 2 - capGap;
  const bottom = Math.min(-img / 2 - pad, capTop - capH - 4);
  return { cols, rows, margin, img, pitchX, pitchY, fs, lh, capGap, capH, capTop, capW, pad, planeW, top, bottom };
}

function wrapText(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function inQuad(x, y, q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cr !== 0) {
      const sg = cr > 0 ? 1 : -1;
      if (!sign) sign = sg;
      else if (sg !== sign) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ *
 *  Gallery                                                            *
 * ------------------------------------------------------------------ */
export class Gallery {
  constructor(canvas, projects, { onOpen, onInteract } = {}) {
    this.canvas = canvas;
    this.projects = projects;
    this.onOpen = onOpen || (() => {});
    this.onInteract = onInteract || (() => {});
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    }));
    r.setClearColor(0x000000, 0);
    r.sortObjects = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.setPixelRatio(this.dpr);
    this.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 50000);

    // lens pass: the grid renders into rt, then a full-screen quad bends its rim
    this.rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: false });
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tScene: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uBand: { value: new THREE.Vector2(0.08, 0.1) },
        uAmount: { value: 0 },
        uEnergy: { value: 0 },
        uStretch: { value: params.lensStretch },
        uFlare: { value: params.lensFlare },
        uCA: { value: params.lensCA },
        uIri: { value: params.lensIri },
        uRim: { value: params.lensRim },
        uTime: { value: 0 },
        uBg: { value: new THREE.Vector3(0.949, 0.949, 0.937) }, // --bg #f2f2ef
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // uniforms shared by every tile
    this.G = {
      uWarp: { value: 0 },
      uCurv: { value: 0 },
      uPush: { value: 0 },
      uMaxA: { value: params.maxAngle },
      uBend: { value: new THREE.Vector2() },
      uDepth: { value: params.depth },
      uGather: { value: 1 },
      uHalf: { value: new THREE.Vector2(1, 1) },
      uWrap: { value: 0 },
      uWrapStart: { value: params.edgeWrapStart },
      uSize: { value: new THREE.Vector2(1, 1) },
      uCapRect: { value: new THREE.Vector4() },
      uRadius: { value: 0 },
      uLift: { value: 0 },
      uFade: { value: 0 },
      uCapColor: { value: new THREE.Vector3(0.085, 0.085, 0.08) },
      uPlaceholder: { value: new THREE.Vector3(0.894, 0.894, 0.878) },
    };

    // motion state (offset is in flat-plane px)
    this.s = {
      offset: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      bend: { x: 0, y: 0 },
      warp: 0,
      warpV: 0,
      dragging: false,
    };
    this.intro = 0;
    this.introHold = 0;
    this.openAmt = 0;
    this.locked = false;
    this.wakeFrames = 0;
    this.restRendered = false;
    this.tiles = [];
    this.hovered = null;
    this.hoverBusy = false;
    this.pd = null;
    this.snapTween = null;
    this.tmp = { x: 0, y: 0, z: 0 };

    this.wake = () => {
      this.wakeFrames = Math.max(this.wakeFrames, 2);
    };

    this.placeholder = new THREE.DataTexture(new Uint8Array([228, 228, 224, 255]), 1, 1);
    this.placeholder.needsUpdate = true;

    this.initProjects();
    this.layout();
    this.bind();

    this.last = performance.now();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  /* ---------- content ---------- */

  initProjects() {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    this.P = this.projects.map((p) => {
      const u = {
        uMap: { value: this.placeholder },
        uCap: { value: null },
        uTexAspect: { value: 1 },
        uReveal: { value: 0 },
      };
      const pr = { p, u, capTex: null };
      const ready = (tex) => {
        tex.anisotropy = this.aniso;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        u.uMap.value = tex;
        const im = tex.image;
        u.uTexAspect.value = (im.width || 1) / (im.height || 1);
        gsap.to(u.uReveal, {
          value: 1,
          duration: 1,
          delay: Math.random() * 0.35,
          ease: 'power2.out',
          onUpdate: this.wake,
        });
      };
      if (p.studio) {
        const cv = drawStudioTile(1024);
        p.thumb = p.hero = cv.toDataURL('image/png');
        ready(new THREE.CanvasTexture(cv));
      } else {
        loader.load(p.thumb, ready, undefined, () => console.warn('[archive] image failed:', p.thumb));
      }
      return pr;
    });
  }

  buildCaptions() {
    const L = this.L;
    const scale = this.dpr;
    for (const pr of this.P) {
      if (pr.capTex) pr.capTex.dispose();
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(L.planeW * scale);
      cv.height = Math.ceil(L.capH * scale);
      const ctx = cv.getContext('2d');
      ctx.scale(scale, scale);
      ctx.font = `400 ${L.fs}px ${FONT}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(L.fs * 0.075).toFixed(2)}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff';
      const lines = wrapText(ctx, pr.p.title.toUpperCase(), L.capW).slice(0, 3);
      lines.forEach((ln, k) => ctx.fillText(ln, L.planeW / 2, 1 + k * L.lh));
      pr.capTextW = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = this.aniso;
      pr.capTex = tex;
      pr.u.uCap.value = tex;
    }
  }

  /* ---------- layout ---------- */

  layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.vw = vw;
    this.vh = vh;
    this.renderer.setSize(vw, vh, false);
    this.G.uHalf.value.set(vw / 2, vh / 2);
    this.rt.setSize(Math.round(vw * this.dpr), Math.round(vh * this.dpr));
    this.post.uniforms.uRes.value.set(vw, vh);

    // camera distance from the lens angle (measured to the screen corner, so every
    // aspect ratio bends the same); the fov then makes z = 0 map 1 unit -> 1 css px
    const cam = this.camera;
    this.D = Math.hypot(vw, vh) / 2 / Math.tan(THREE.MathUtils.degToRad(params.lens));
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(vh / 2 / this.D));
    cam.aspect = vw / vh;
    cam.position.set(0, 0, this.D);
    cam.near = 1;
    cam.far = this.D * 20;
    cam.updateProjectionMatrix();

    const prev = this.L;
    const L = (this.L = layoutFor(vw, vh, this.projects.length));
    if (prev) {
      // keep the visitor's place, counted in cells
      const s = this.s;
      if (this.snapTween) this.snapTween.kill();
      const cx = Math.round(s.target.x / prev.pitchX);
      const cy = Math.round(s.target.y / prev.pitchY);
      s.target.x = s.offset.x = cx * L.pitchX;
      s.target.y = s.offset.y = cy * L.pitchY;
    }

    this.G.uSize.value.set(L.img, L.img);
    this.G.uCapRect.value.set(-L.planeW / 2, L.capTop, L.planeW, L.capH);
    this.buildCaptions();
    this.buildTiles();
    this.wake();
  }

  // How far from the screen centre (flat-plane px) a visible point can come from,
  // at the strongest bend. Decides how many tiles we need so wrapping stays off-screen.
  // curvature (1 / sphere radius) at full bend. With radius = 1 the sphere is
  // centred on the camera once the field has receded by `push`.
  curvature() {
    return (params.mode === 'inside' ? 1 : -1) / (params.radius * (1 + params.push) * this.D);
  }

  coverage() {
    const corner = (Math.hypot(this.vw, this.vh) / 2) * 1.05;
    const D = this.D;
    let need = corner;
    for (const w of [1.1, -0.25]) {
      const k = this.curvature() * w;
      const push = params.push * D * w;
      let r = 0;
      for (; r < 30000; r += 12) {
        if (r * Math.abs(k) >= params.maxAngle) break;
        let rho = r;
        let z = 0;
        if (Math.abs(k) > 1e-8) {
          rho = Math.sin(r * k) / k;
          z = (1 - Math.cos(r * k)) / k;
        }
        const dz = D - (z - push);
        if (dz < 1 || (rho * D) / dz > corner) break;
      }
      need = Math.max(need, r);
    }
    // extra room: the edge fold pulls far-away tiles into view, so keep the wrap
    // seam far enough out that it is squeezed to nothing at the edge
    const fold = params.edgeWrap > 0 ? 1.35 : 1;
    // pulled-together spacing shows more of the grid, so build more of it
    return ((need + Math.max(this.vw, this.vh) * 0.12 + this.L.planeW) * fold) / Math.min(1, params.gather);
  }

  buildTiles() {
    for (const t of this.tiles) {
      this.scene.remove(t.mesh);
      t.mesh.material.dispose();
    }
    if (this.geo) this.geo.dispose();

    const L = this.L;
    this.geo = new THREE.PlaneGeometry(L.planeW, L.top - L.bottom, 10, 14);
    this.geo.translate(0, (L.top + L.bottom) / 2, 0);

    const need = this.coverage();
    const P = this.P.length;

    // Numbering runs on row after row (no page break, so the last projects never
    // sit right next to the first ones again). It repeats every R rows.
    const R = P / gcd(P, L.cols); // 15 rows for 30 projects in 4 columns
    // Blocks of 4 columns side by side are shifted down by `shift` rows, so the
    // same project is never repeated straight across. For the wrap to stay
    // seamless, H blocks x shift must be a whole number of R.
    let H = Math.max(1, Math.ceil(Math.ceil((2 * need) / L.pitchX + 2) / L.cols));
    while (R > 1 && gcd(H, R) === 1 && H < 64) H++;
    const shift = R > 1 ? R / gcd(H, R) : 0;
    const NX = H * L.cols;
    let NY = Math.ceil(Math.ceil((2 * need) / L.pitchY + 2) / R) * R;
    while (NX * NY > 1500 && NY > R) NY -= R;
    L.NX = NX;
    L.NY = NY;
    L.Tx = NX * L.pitchX;
    L.Ty = NY * L.pitchY;

    this.tiles = [];
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const block = Math.floor(i / L.cols);
        const idx = ((((j + block * shift) % R) * L.cols) + (i % L.cols)) % P;
        const pr = this.P[idx];
        const u = {
          uAlpha: { value: 1 },
          uHover: { value: 0 },
          uJitter: { value: hash(i, j) * 2 - 1 },
          uCapShift: { value: 0 },
        };
        // edge columns: a caption wider than its image lines up with the image's
        // outer edge instead of hanging into the side padding
        const over = Math.max(0, ((pr.capTextW || 0) - L.img) / 2);
        const col = i % L.cols;
        u.uCapShift.value = col === 0 ? Math.round(over) : col === L.cols - 1 ? -Math.round(over) : 0;
        const mat = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms: { ...this.G, ...pr.u, ...u },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          premultipliedAlpha: true,
        });
        const mesh = new THREE.Mesh(this.geo, mat);
        mesh.frustumCulled = false; // positions are bent in the shader
        this.scene.add(mesh);
        this.tiles.push({
          i,
          j,
          idx,
          mesh,
          u,
          jitter: u.uJitter.value,
          // resting place of the tile's image centre, same as essesi: first column
          // flush left, last column flush right, rows from the top
          bx: -this.vw / 2 + L.margin + L.img / 2 + i * L.pitchX,
          by: this.vh / 2 - L.margin - L.img / 2 - j * L.pitchY,
          x: 0,
          y: 0,
          hover: 0,
          visible: false,
        });
      }
    }
    this.updateUniforms();
    this.updateTiles(0);
  }

  rebuild() {
    this.buildTiles();
    this.wake();
  }

  /* ---------- the bend, on the CPU (mirrors the vertex shader) ---------- */

  warpPoint(x, y, jitter, out) {
    const G = this.G;
    const w = G.uWarp.value;
    const k = G.uCurv.value * w;
    const bx = G.uBend.value.x;
    const by = G.uBend.value.y;
    const px = x - bx;
    const py = y - by;
    let sx = px;
    let sy = py;
    let sz = 0;
    if (Math.abs(k) > 1e-8) {
      const m = G.uMaxA.value;
      const lon = clamp(px * k, -m, m);
      const lat = clamp(py * k, -m, m);
      sx = (Math.cos(lat) * Math.sin(lon)) / k;
      sy = Math.sin(lat) / k;
      sz = (1 - Math.cos(lat) * Math.cos(lon)) / k;
    }
    out.x = bx + sx;
    out.y = by + sy;
    out.z = sz - G.uPush.value + jitter * G.uDepth.value * Math.max(w, 0);
    return out;
  }

  // flat-plane point -> screen px (origin at centre, y up)
  // (cx, cy) = tile centre, (lx, ly) = point relative to it; the centre is pulled in by uGather
  screenOf(cx, cy, jitter, lx = 0, ly = 0) {
    const gth = this.G.uGather.value;
    const v = this.warpPoint(cx * gth + lx, cy * gth + ly, jitter, this.tmp);
    const dz = this.D - v.z;
    if (dz < 1) return null;
    const s = this.D / dz;
    const wrapAmt = this.G.uWrap.value;
    if (wrapAmt <= 0) return { x: v.x * s, y: v.y * s, s };
    return { x: this.fold(v.x * s, this.vw / 2, wrapAmt), y: this.fold(v.y * s, this.vh / 2, wrapAmt), s };
  }

  // mirrors foldAxis() in the vertex shader
  fold(u, h, amt) {
    const inner = h * this.G.uWrapStart.value;
    const au = Math.abs(u);
    if (au <= inner) return u;
    const band = h - inner;
    const g = inner + band * (1 - Math.exp(-(au - inner) / band));
    return Math.sign(u) * (au + (g - au) * amt);
  }

  tileQuad(t) {
    const h = this.L.img / 2;
    const q = [];
    for (const [cx, cy] of CORNERS) {
      const p = this.screenOf(t.x, t.y, t.jitter, cx * h, cy * h);
      if (!p) return null;
      q.push(p);
    }
    return q;
  }

  tileAt(clientX, clientY) {
    const sx = clientX - this.vw / 2;
    const sy = this.vh / 2 - clientY;
    for (const t of this.tiles) {
      if (!t.visible) continue;
      const q = this.tileQuad(t);
      if (q && inQuad(sx, sy, q)) return t;
    }
    return null;
  }

  // on-screen rect of a tile's image right now (css px)
  screenRect(t) {
    const q = this.tileQuad(t);
    if (!q) return this.restRect(t);
    const xs = q.map((p) => p.x);
    const ys = q.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { left: this.vw / 2 + minX, top: this.vh / 2 - maxY, width: maxX - minX, height: maxY - minY };
  }

  // where a tile's image sits once everything is flat again
  restRect(t) {
    const h = this.L.img / 2;
    return { left: this.vw / 2 + t.x - h, top: this.vh / 2 - t.y - h, width: h * 2, height: h * 2 };
  }

  // the on-screen tile showing project idx that is closest to the centre
  findTile(idx) {
    const h = this.L.img / 2;
    let best = null;
    let bd = Infinity;
    for (const t of this.tiles) {
      if (t.idx !== idx) continue;
      const inView = Math.abs(t.x) + h < this.vw / 2 && Math.abs(t.y) + h < this.vh / 2;
      if (!inView) continue;
      const d = Math.hypot(t.x, t.y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  setTileAlpha(t, a) {
    if (!t) return;
    t.u.uAlpha.value = a;
    this.wake();
  }

  setOpen(v, duration = 0.9, delay = 0) {
    gsap.to(this, { openAmt: v, duration, delay, ease: 'power3.inOut', overwrite: true, onUpdate: this.wake });
  }

  lock(v) {
    this.locked = v;
    if (v) {
      this.pd = null;
      this.s.dragging = false;
      this.canvas.classList.remove('is-dragging');
      this.setHover(null);
      if (this.snapTween) this.snapTween.kill();
      this.snapTween = null;
    } else {
      this.settle(0, 0);
    }
  }

  /* ---------- intro ---------- */

  start() {
    const s = this.s;
    if (this.reduced) {
      this.intro = 1;
      this.wake();
      return;
    }
    const L = this.L;
    s.offset.x = s.target.x = L.pitchX * 1.35;
    s.offset.y = s.target.y = -L.pitchY * 1.1;
    s.warp = 0.9;
    this.introHold = 1;
    gsap.to(this, { intro: 1, duration: 1.4, ease: 'power2.out', onUpdate: this.wake });
    gsap.to(this, { introHold: 0, duration: 1.3, delay: 0.55, ease: 'power2.inOut', onUpdate: this.wake });
    this.snapTween = gsap.to(s.target, {
      x: 0,
      y: 0,
      duration: 2.4,
      delay: 0.15,
      ease: 'expo.out',
      onUpdate: this.wake,
      onComplete: () => (this.snapTween = null),
    });
  }

  // debug helper: hold the sphere for a moment
  preview(hold = 1.6) {
    gsap.killTweensOf(this, 'introHold');
    gsap.to(this, { introHold: 1, duration: 0.5, ease: 'power2.out', onUpdate: this.wake });
    gsap.to(this, { introHold: 0, duration: 0.9, delay: hold, ease: 'power2.inOut', onUpdate: this.wake });
  }

  /* ---------- input ---------- */

  dragFactor() {
    // keep the field under the finger even while it has receded
    // (and the spacing is pulled in, so offsets move the picture less)
    return (this.D + Math.max(this.G.uPush.value, 0)) / this.D / this.G.uGather.value;
  }

  setHover(t) {
    if (this.hovered === t) return;
    this.hovered = t;
    this.canvas.classList.toggle('is-hover', !!t);
    this.wake();
  }

  updateHover(cx, cy) {
    if (this.locked || this.s.dragging || Math.abs(this.s.warp) > 0.1) return this.setHover(null);
    this.setHover(this.tileAt(cx, cy));
  }

  settle(vx, vy) {
    const s = this.s;
    const L = this.L;
    const coast = 0.38; // seconds of glide after a throw
    const tx = Math.round((s.target.x + vx * coast) / L.pitchX) * L.pitchX;
    const ty = Math.round((s.target.y + vy * coast) / L.pitchY) * L.pitchY;
    const dist = Math.hypot(tx - s.target.x, ty - s.target.y);
    const duration = clamp(0.9 + dist / 3000, 0.9, 1.8);
    if (this.snapTween) this.snapTween.kill();
    this.snapTween = gsap.to(s.target, {
      x: tx,
      y: ty,
      duration,
      ease: 'power3.out',
      onUpdate: this.wake,
      onComplete: () => (this.snapTween = null),
    });
  }

  bind() {
    const c = this.canvas;

    c.addEventListener('pointerdown', (e) => {
      if (this.locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {}
      const s = this.s;
      const speed = Math.hypot(s.vel.x, s.vel.y);
      const caught = speed > 150 || Math.abs(s.warp) > 0.2;
      if (this.snapTween) this.snapTween.kill();
      this.snapTween = null;
      clearTimeout(this.wheelTimer);
      if (caught) {
        // grabbing a moving field stops it where it is
        s.target.x = s.offset.x;
        s.target.y = s.offset.y;
      }
      this.pd = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        caught,
        samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
      };
      this.wake();
    });

    c.addEventListener('pointermove', (e) => {
      const pd = this.pd;
      if (!pd || e.pointerId !== pd.id) {
        if (e.pointerType === 'mouse') this.updateHover(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - pd.x;
      const dy = e.clientY - pd.y;
      pd.x = e.clientX;
      pd.y = e.clientY;
      if (!pd.moved && Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) > 5) {
        pd.moved = true;
        this.s.dragging = true;
        c.classList.add('is-dragging');
        this.setHover(null);
        this.onInteract();
      }
      if (!pd.moved) return;
      const f = this.dragFactor();
      this.s.target.x += dx * f;
      this.s.target.y -= dy * f;
      pd.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      while (pd.samples.length > 2 && e.timeStamp - pd.samples[0].t > 120) pd.samples.shift();
      this.wake();
    });

    const up = (e) => {
      const pd = this.pd;
      if (!pd || e.pointerId !== pd.id) return;
      this.pd = null;
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {}
      c.classList.remove('is-dragging');
      if (pd.moved) {
        this.s.dragging = false;
        // throw velocity from the last ~100ms of the gesture
        const recent = pd.samples.filter((p) => e.timeStamp - p.t < 100);
        let vx = 0;
        let vy = 0;
        if (recent.length > 1) {
          const a = recent[0];
          const b = recent[recent.length - 1];
          const dt = (b.t - a.t) / 1000;
          if (dt > 0.008) {
            vx = clamp((b.x - a.x) / dt, -8000, 8000);
            vy = clamp((b.y - a.y) / dt, -8000, 8000);
          }
        }
        const f = this.dragFactor();
        this.settle(vx * f, -vy * f);
      } else if (e.type === 'pointerup' && !pd.caught && !this.locked) {
        const t = this.tileAt(e.clientX, e.clientY);
        if (t) this.onOpen(t);
      } else {
        this.settle(0, 0);
      }
      this.wake();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      if (!this.pd) this.setHover(null);
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) return;
        e.preventDefault();
        if (e.ctrlKey) return; // pinch-zoom gesture: ignore
        let dx = e.deltaX;
        let dy = e.deltaY;
        if (e.deltaMode === 1) {
          dx *= 18;
          dy *= 18;
        } else if (e.deltaMode === 2) {
          dx *= this.vh;
          dy *= this.vh;
        }
        if (e.shiftKey && Math.abs(dx) < 1e-3) {
          dx = dy;
          dy = 0;
        }
        if (this.snapTween) this.snapTween.kill();
        this.snapTween = null;
        const f = this.dragFactor() * 0.9;
        this.s.target.x -= dx * f;
        this.s.target.y += dy * f;
        this.setHover(null);
        this.onInteract();
        clearTimeout(this.wheelTimer);
        this.wheelTimer = setTimeout(() => this.settle(0, 0), 160);
        this.wake();
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (this.locked || e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = { ArrowRight: [-1, 0], ArrowLeft: [1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      if (!dir) return;
      e.preventDefault();
      const s = this.s;
      const L = this.L;
      const x = (Math.round(s.target.x / L.pitchX) + dir[0]) * L.pitchX;
      const y = (Math.round(s.target.y / L.pitchY) + dir[1]) * L.pitchY;
      if (this.snapTween) this.snapTween.kill();
      this.snapTween = gsap.to(s.target, {
        x,
        y,
        duration: 0.9,
        ease: 'power3.inOut',
        onUpdate: this.wake,
        onComplete: () => (this.snapTween = null),
      });
      this.onInteract();
    });

    // some browsers drop the canvas contents while a tab is hidden: redraw on return
    document.addEventListener('visibilitychange', () => {
      this.restRendered = false;
      this.wake();
    });

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => this.layout(), 120);
    });
  }

  /* ---------- frame ---------- */

  updateUniforms() {
    const G = this.G;
    const s = this.s;
    const w01 = clamp(s.warp, 0, 1);
    G.uWarp.value = s.warp;
    G.uCurv.value = this.curvature();
    G.uPush.value = params.push * this.D * s.warp + this.openAmt * this.D * 0.18;
    G.uBend.value.set(s.bend.x, s.bend.y);
    G.uDepth.value = params.depth;
    G.uMaxA.value = params.maxAngle;
    G.uWrap.value = w01 * params.edgeWrap;
    G.uGather.value = 1 + (params.gather - 1) * w01;
    G.uWrapStart.value = params.edgeWrapStart;
    G.uLift.value = w01;
    G.uFade.value = this.intro * (1 - this.openAmt);
  }

  updateTiles(dt) {
    const L = this.L;
    const s = this.s;
    const hx = this.vw / 2;
    const hy = this.vh / 2;
    let hoverBusy = false;
    for (const t of this.tiles) {
      t.x = wrap(t.bx + s.offset.x, L.Tx);
      t.y = wrap(t.by + s.offset.y, L.Ty);
      t.mesh.position.set(t.x, t.y, 0);

      // skip tiles that are bent off-screen
      const p = this.screenOf(t.x, t.y, t.jitter);
      const m = p ? L.planeW * p.s * 1.2 : 0;
      t.visible = !!p && Math.abs(p.x) < hx + m && Math.abs(p.y) < hy + m;
      t.mesh.visible = t.visible;

      const goal = t === this.hovered ? 1 : 0;
      if (t.hover !== goal) {
        t.hover = damp(t.hover, goal, 9, dt);
        if (Math.abs(t.hover - goal) < 0.002) t.hover = goal;
        else hoverBusy = true;
        t.u.uHover.value = t.hover;
      }
    }
    this.hoverBusy = hoverBusy;
  }

  tick(now) {
    requestAnimationFrame(this.tick);
    const dt = clamp((now - this.last) / 1000, 0, 1 / 30);
    this.last = now;
    this.step(dt);
  }

  step(dt) {
    const s = this.s;

    // follow the target (drag / throw / wheel), measure speed
    const px = s.offset.x;
    const py = s.offset.y;
    const lam = s.dragging ? 20 : 11;
    s.offset.x = damp(s.offset.x, s.target.x, lam, dt);
    s.offset.y = damp(s.offset.y, s.target.y, lam, dt);
    if (dt > 0) {
      s.vel.x = damp(s.vel.x, (s.offset.x - px) / dt, 18, dt);
      s.vel.y = damp(s.vel.y, (s.offset.y - py) / dt, 18, dt);
    }
    const speed = Math.hypot(s.vel.x, s.vel.y);

    // the bend: full while dragging, otherwise driven by speed, then springs flat
    const motion = smoothstep(params.speedMin, params.speedMax, speed);
    // speed also pushes the edge lens harder (rises fast, falls back gently)
    this.energy = damp(this.energy || 0, motion, motion > (this.energy || 0) ? 10 : 3, dt);
    const goal =
      Math.max(s.dragging ? 1 : 0, motion, this.introHold) * (this.reduced ? 0.3 : 1) * (1 - this.openAmt);
    const k = params.stiffness;
    const c = 2 * Math.sqrt(k) * params.damping;
    s.warpV += (k * (goal - s.warp) - c * s.warpV) * dt;
    s.warp += s.warpV * dt;

    // the sphere leans a little into the direction of travel
    const lim = Math.max(this.vw, this.vh) * 0.12;
    s.bend.x = damp(s.bend.x, clamp(s.vel.x * params.lean, -lim, lim), 4, dt);
    s.bend.y = damp(s.bend.y, clamp(s.vel.y * params.lean, -lim, lim), 4, dt);

    const settled =
      !s.dragging &&
      Math.abs(s.target.x - s.offset.x) < 0.01 &&
      Math.abs(s.target.y - s.offset.y) < 0.01 &&
      Math.abs(s.warp) < 2e-4 &&
      Math.abs(s.warpV) < 2e-4 &&
      Math.abs(s.bend.x) + Math.abs(s.bend.y) < 0.05 &&
      !this.hoverBusy;

    if (settled) {
      // lock onto exact pixels and stop drawing until something changes
      s.offset.x = s.target.x;
      s.offset.y = s.target.y;
      s.warp = s.warpV = 0;
      s.vel.x = s.vel.y = 0;
      s.bend.x = s.bend.y = 0;
      if (this.wakeFrames <= 0 && this.restRendered) return;
      this.restRendered = true;
    } else {
      this.restRendered = false;
    }
    if (this.wakeFrames > 0) this.wakeFrames--;

    this.updateUniforms();
    this.updateTiles(dt);
    this.draw();
  }

  draw() {
    const r = this.renderer;
    const u = this.post.uniforms;
    const w01 = clamp(this.s.warp, 0, 1);
    const amount = (params.lensRest + (params.lensMotion - params.lensRest) * w01) * (1 - this.openAmt);
    if (amount < 0.002) {
      // nothing to bend: draw straight to the screen, pixel for pixel
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    u.uAmount.value = Math.min(amount, 1.2);
    u.uEnergy.value = this.energy;
    u.uBand.value.set(
      Math.min(this.vw * params.lensSide, params.lensSideMax) / this.vw,
      Math.min(this.vh * params.lensTop, params.lensTopMax) / this.vh
    );
    u.uStretch.value = params.lensStretch;
    u.uFlare.value = params.lensFlare;
    u.uCA.value = params.lensCA;
    u.uIri.value = params.lensIri;
    u.uRim.value = params.lensRim;
    u.uTime.value = this.reduced ? 0 : performance.now() / 1000;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
