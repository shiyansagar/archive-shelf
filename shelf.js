import { gsap } from 'gsap';
import { drawStudioTile } from './studio.js';

/* ------------------------------------------------------------------ *
 *  Tunables. Press "g" (or open with ?debug) to tweak them live.      *
 * ------------------------------------------------------------------ */
export const params = {
  speed: 34, // px/s the shelf drifts along its axis (negative = towards you)
  hoverSpeed: 0, // share of that speed kept while a card is hovered (0 = comes to rest)
  slowDown: 2.8, // how fast it eases into the hover speed (higher = sooner)
  speedUp: 1.1, // how fast it picks up again afterwards
  size: 0.14, // card width as a share of the screen height
  gap: 1.15, // distance between cards, as a share of a card's width (more = clearer gaps)
  lift: 0.24, // hovered card rises by this share of its height...
  peek: 0.18, // ...its photo rises this much more out of the folder...
  paper: 0.06, // ...and the paper sheet behind the photo this much
  neighbour: 0.16, // the cards either side rise this share of the hovered lift (0 = off)
  rowX: 0.5, // where the middle of the shelf sits, share of the screen width
  rowY: 0.5, // ...and share of the screen height
  frost: 0.62, // milkiness of the glass at rest (0 = clear)
  frostHover: 0.45, // ...and on the hovered card
  tagSize: 1, // size of the hover label's title (1 = default)
};

// True isometric: the three axes meet at 120°, each 30° off the horizontal.
//   X (along the shelf, away from you)  -> screen ( C, -S )
//   Y (across a card)                   -> screen ( C,  S )
//   Z (up)                              -> screen ( 0, -1 )
// A card face lies in the Y-Z plane, so its CSS box needs only a 2D matrix:
// matrix(C, S, 0, 1, tx, ty) = skewY(30deg) scaleX(cos 30deg). No 3D context,
// no perspective, which keeps text crisp and the frost cheap.
const C = Math.cos(Math.PI / 6);
const S = 0.5;
const FACE = `${C.toFixed(6)}, ${S}, 0, 1`;
// The floor (X-Y plane), set up for text that reads along Y (down-right, the
// opposite lean to the shelf) with its letters standing towards +X (up-right):
// local x -> Y = (C, S), local y -> -X = (-C, S).
const FLOOR = `${C.toFixed(6)}, ${S}, ${(-C).toFixed(6)}, ${S}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const approach = (a, b, lambda, dt) => {
  const v = damp(a, b, lambda, dt);
  return Math.abs(v - b) < 1e-3 ? b : v;
};
export const px = (v) => `${Math.round(v * 100) / 100}px`;

// Front glass of a folder (image 2): high on the left, steps down on the right.
function panePath(w, h, r, a, b, s) {
  const m = (a + b) / 2;
  return [
    `M 0 ${r}`,
    `Q 0 0 ${r} 0`,
    `L ${a} 0`,
    `C ${m} 0 ${m} ${s} ${b} ${s}`,
    `L ${w - r} ${s}`,
    `Q ${w} ${s} ${w} ${s + r}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `Q 0 ${h} 0 ${h - r}`,
    'Z',
  ].join(' ');
}

export function el(cls, tag = 'div') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

export function box(e, x, y, w, h) {
  Object.assign(e.style, { left: px(x), top: px(y), width: px(w), height: px(h) });
  return e;
}

/**
 * An isometric shelf of frosted-glass folders that drifts past forever.
 * Hover a card and the shelf slows down, the card rises and its photo slides up
 * out of the folder. Click it and the photo is pulled all the way out, then
 * flies into the project page. It speaks the same small interface as Gallery
 * (lock, setOpen, setTileAlpha, findTile, screenRect, restRect, tiles), so the
 * project page and its flying image work unchanged.
 */
export class Shelf {
  constructor(stage, projects, { onOpen, onHover } = {}) {
    this.stage = stage;
    this.row = stage.querySelector('.iso__row');
    this.tag = stage.querySelector('.tag');
    this.tagTile = null; // the card the floor label sits beside (stays while it fades out)
    this.tagTr = '';
    this.projects = projects;
    this.onOpen = onOpen || (() => {});
    this.onHover = onHover || (() => {});
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.view = null; // the project page, set after construction

    this.offset = 0;
    this.vel = this.reduced ? 0 : params.speed;
    this.tiles = [];
    this.order = [];
    this.hovered = null;
    this.presenting = null;
    this.locked = false;
    this.pointer = null;
    this.drag = null;
    this.intro = 1;
    this.wake = () => {};

    for (const p of projects) if (p.studio) p.thumb = p.hero = drawStudioTile(1024).toDataURL('image/png');

    this.layout();
    this.bind();

    this.last = performance.now();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  /* ---------- layout ---------- */

  layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.vw = vw;
    this.vh = vh;

    const W = Math.round(clamp(Math.min(vh * params.size, vw * 0.24), 84, 210));
    const L = { W, S: Math.max(24, Math.round(W * params.gap)) };
    this.shape(L);
    const H = L.H;
    L.liftPx = H * params.lift;
    L.peekPx = H * params.peek;
    L.paperPx = H * params.paper;

    // screen point of the shelf's axis (X = 0, Y = 0, Z = 0)
    L.ox = vw * params.rowX;
    L.oy = vh * params.rowY + H * 0.5;

    // how far along the shelf a card must travel to be off screen, each way
    const back = Math.min((vw - L.ox + C * W) / C, (L.oy + W) / S);
    const front = Math.min((L.ox + C * W) / C, (vh - L.oy + H * 1.9) / S);
    const need = Math.max(back, front) + L.S * 2;
    const P = this.projects.length;
    const k = Math.max(1, Math.ceil((2 * need) / (P * L.S)));
    L.N = P * k; // a whole number of passes, so the order never breaks at the wrap
    L.T = L.N * L.S;

    if (this.L) this.offset *= L.S / this.L.S; // keep the visitor's place
    this.L = L;

    this.placeTag();
    this.build();
  }

  // the folder's own measurements, in card pixels (a subclass can draw another object)
  shape(L) {
    const W = L.W;
    const H = (L.H = Math.round(W * 1.2));
    Object.assign(L, {
      r: Math.round(W * 0.075),
      t: Math.max(5, Math.round(W * 0.028)), // glass thickness
      y0: Math.round(H * 0.27), // top of the front glass (its high, left part)
      dip: Math.round(H * 0.085), // how much lower its right part sits
      ph: { x: Math.round(W * 0.06), y: Math.round(H * 0.03), s: Math.round(W * 0.88) }, // the photo (square)
      pa: { x: Math.round(W * 0.22), y: -Math.round(H * 0.035), w: Math.round(W * 0.72), h: Math.round(H * 0.6) },
      blur: Math.max(8, Math.round(W * 0.055)),
    });
    L.hp = H - L.y0;
    L.dPhoto = L.t + 4; // the photo sits this far behind the glass
    L.dPaper = L.t + 10; // and the paper a little further
    L.out = L.ph.y + L.ph.s - L.y0 + H * 0.06; // pulled out: the photo clears the glass
    L.path = panePath(W, L.hp, L.r, Math.round(W * 0.34), Math.round(W * 0.5), L.dip);
    this.row.style.setProperty('--r', `${L.r}px`);
    this.row.style.setProperty('--blur', `${L.blur}px`);
  }

  // the floor label: a dot at the foot of the card, a hairline out across the
  // floor, then the text, its title line level with the card
  placeTag() {
    if (!this.tag) return;
    const L = this.L;
    L.tagWord = Math.round(clamp(L.W * 0.19, 18, 34) * params.tagSize); // title size
    L.tagPad = Math.round(L.W * 0.32); // card edge -> start of the text
    L.tagH0 = Math.round(12 * 1.35 + L.tagWord * 0.55); // title's middle sits on the card's plane
    this.tag.style.setProperty('--tag-word', `${L.tagWord}px`);
    const rule = this.tag.querySelector('.tag__rule');
    const dot = this.tag.querySelector('.tag__dot');
    Object.assign(rule.style, { left: px(10 - L.tagPad), top: px(L.tagH0), width: px(L.tagPad - 22) });
    Object.assign(dot.style, { left: px(4 - L.tagPad), top: px(L.tagH0 - 2) });
    this.tagTr = '';
  }

  build() {
    const L = this.L;
    const P = this.projects.length;
    this.row.replaceChildren();
    this.tiles = [];
    for (let i = 0; i < L.N; i++) {
      const idx = i % P;
      const t = {
        i,
        idx,
        p: this.projects[idx],
        x: 0,
        k: null,
        lift: 0,
        peek: 0,
        pp: 0,
        out: 0,
        nb: 0,
        rise: 1,
        present: false,
        visible: true,
        tr: '',
        op: '',
        key: '',
      };
      this.makeCard(t);
      this.tiles.push(t);
    }
    this.hovered = null;
    this.presenting = null;
    this.tagTile = null;
    this.order = [...this.tiles];

    // first stacking: the card nearest you is on top. After that only the card
    // that wraps round changes its z-index (to the very top or the very bottom).
    this.place();
    this.order.sort((a, b) => a.x - b.x);
    this.order.forEach((t, r) => this.setZ(t, L.N - r));
    this.zTop = L.N;
    this.zBottom = 1;
    this.write();
  }

  makeCard(t) {
    const L = this.L;
    const { W, H } = L;
    const p = t.p;
    const card = el(`card${p.studio ? ' is-dark' : ''}`);
    card.style.width = `${W}px`;
    card.style.height = `${H}px`;

    // paper sheet behind the photo (the "Archives" folder in image 2)
    const paper = box(el('card__paper'), L.pa.x, L.pa.y, L.pa.w, L.pa.h);

    // the photo itself, sharp, standing inside the folder
    const photo = box(el('card__photo'), L.ph.x, L.ph.y, L.ph.s, L.ph.s);
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.crossOrigin = 'anonymous'; // same cache entry as the project page images
    img.onload = () => img.classList.add('is-loaded');
    img.src = p.thumb;
    photo.append(img);

    // thickness of the glass: three copies of its outline stepping back along X
    // (a local translate of (d, -d) is exactly d px further back in the world)
    const edges = [3, 2, 1].map((n) => {
      const e = box(el('card__edge'), 0, L.y0, W, L.hp);
      const d = (L.t * n) / 3;
      e.style.clipPath = `path("${L.path}")`;
      e.style.transform = `translate(${px(d)}, ${px(-d)})`;
      return e;
    });

    // the front glass. The frost is faked from what is behind it: a blurred copy
    // of the photo and paper, lined up with them, under a milky veil and grain.
    const pane = box(el('card__pane'), 0, L.y0, W, L.hp);
    pane.style.clipPath = `path("${L.path}")`;
    const base = el('pane__base');
    const bPaper = box(el('pane__paper'), L.pa.x + L.dPaper, L.pa.y - L.dPaper - L.y0, L.pa.w, L.pa.h);
    const bImg = new Image();
    bImg.alt = '';
    bImg.decoding = 'async';
    bImg.crossOrigin = 'anonymous';
    bImg.className = 'pane__img';
    bImg.onload = () => bImg.classList.add('is-loaded');
    bImg.src = p.thumb;
    box(bImg, L.ph.x + L.dPhoto, L.ph.y - L.dPhoto - L.y0, L.ph.s, L.ph.s);
    const veil = el('pane__veil');
    const grain = el('pane__grain');
    const sheen = el('pane__sheen');
    const rim = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    rim.setAttribute('class', 'pane__rim');
    rim.setAttribute('viewBox', `0 0 ${W} ${L.hp}`);
    rim.setAttribute('width', W);
    rim.setAttribute('height', L.hp);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', L.path);
    rim.append(path);

    pane.append(base, bPaper, bImg, veil, grain, sheen, rim);
    card.append(paper, photo, ...edges, pane);
    this.row.append(card);

    Object.assign(t, { el: card, photo, paper, bImg, bPaper, veil });
  }

  setZ(t, z) {
    t.z = z;
    t.el.style.zIndex = z;
  }

  /* ---------- the drift ---------- */

  // every card's position along the shelf, wrapped round an endless loop
  place() {
    const L = this.L;
    for (const t of this.tiles) {
      const u = t.i * L.S + this.offset;
      const k = Math.floor((u + L.T / 2) / L.T);
      t.x = u - k * L.T;
      // wrapped round: from the far end to the front (on top of everything) or back
      if (t.k !== null && k !== t.k) this.setZ(t, k > t.k ? ++this.zTop : --this.zBottom);
      t.k = k;
    }
  }

  // screen position of a card's top-left corner (its CSS origin) for a given lift
  origin(t, lz = 0) {
    const L = this.L;
    return {
      x: L.ox + C * t.x - (C * L.W) / 2,
      y: L.oy - S * t.x - (S * L.W) / 2 - L.H - lz,
    };
  }

  // which card is under a screen point: front to back, each card's resting face
  // (the hovered one also counts the space it has risen into, so it never flickers)
  hitTest(mx, my) {
    const L = this.L;
    for (const t of this.order) {
      if (!t.visible) continue;
      const o = this.origin(t);
      const u = (mx - o.x) / C;
      if (u < 0 || u > L.W) continue;
      const v = my - o.y - S * u;
      const top = t === this.hovered ? -(L.liftPx + Math.max(L.peekPx, L.paperPx)) : 0;
      if (v >= top && v <= L.H) return t;
    }
    return null;
  }

  setHover(t) {
    if (t === this.hovered) return;
    this.hovered = t;
    if (t) this.tagTile = t;
    this.stage.classList.toggle('is-hover', !!t);
    this.onHover(t ? t.p : null);
  }

  // click: stop, lift the card and pull its photo out; it flies once it is out
  present(t) {
    if (!t || this.locked || this.presenting) return;
    if (this.view && (this.view.isOpen || this.view.busy)) return;
    this.presenting = t;
    t.present = true;
    this.setHover(t);
  }

  // open a project from outside (keyboard index): present its nearest card first
  openProject(idx) {
    const t = this.findTile(idx);
    if (t) this.present(t);
    else if (this.view) this.view.open(idx, { fly: false });
  }

  /* ---------- the interface the project page uses ---------- */

  rectFor(t, lift, peek, out, nb = 0) {
    const L = this.L;
    const o = this.origin(t, (lift + nb) * L.liftPx);
    const up = L.peekPx * peek * (1 - out) + L.out * out;
    const lx = L.ph.x + L.dPhoto;
    const ly = L.ph.y - L.dPhoto - up;
    return { left: o.x + C * lx, top: o.y + S * lx + ly, width: L.ph.s, height: L.ph.s, skewY: 30, squash: C };
  }

  // where a card's photo is right now
  screenRect(t) {
    return this.rectFor(t, t.lift, t.peek, t.out, t.nb);
  }

  // where it will be once pulled out (the flight back lands here)
  restRect(t) {
    return this.rectFor(t, 1, 1, 1, 0);
  }

  // the on-screen card for a project, nearest the middle of the screen
  findTile(idx) {
    let best = null;
    let bd = Infinity;
    for (const t of this.tiles) {
      if (t.idx !== idx || !t.visible) continue;
      const r = this.restRect(t);
      const cx = r.left + (C * r.width) / 2;
      const cy = r.top + r.height / 2 + (S * r.width) / 2;
      const m = 24;
      if (cx < m || cx > this.vw - m || cy < m || cy > this.vh - m) continue;
      const d = Math.hypot(cx - this.vw / 2, cy - this.vh / 2);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  setTileAlpha(t, a) {
    if (!t) return;
    t.photo.style.opacity = a;
    if (a === 0) t.present = true; // the flight back lands on a pulled-out photo
  }

  setOpen(v, duration = 0.9, delay = 0) {
    gsap.to(this.stage, { opacity: 1 - v, duration, delay, ease: 'power3.inOut', overwrite: true });
  }

  lock(v) {
    this.locked = v;
    this.drag = null;
    this.stage.classList.remove('is-dragging', 'is-hover');
    if (v) {
      this.hovered = null; // quietly: the heading keeps the project while it opens
    } else {
      for (const t of this.tiles) t.present = false;
      this.presenting = null;
      this.hovered = undefined; // next hover test always reports
    }
  }

  /* ---------- intro ---------- */

  start() {
    if (this.reduced) return;
    const L = this.L;
    const vis = this.order.filter((t) => {
      const o = this.origin(t);
      return o.x < this.vw + 40 && o.x + C * L.W > -40;
    });
    for (const t of this.tiles) t.rise = 0;
    vis.forEach((t, n) => {
      gsap.to(t, { rise: 1, duration: 1.5, delay: 0.15 + n * 0.045, ease: 'expo.out' });
    });
    for (const t of this.tiles) if (!vis.includes(t)) t.rise = 1;
    this.vel = 0;
    gsap.to(this, { vel: params.speed, duration: 2.4, delay: 0.6, ease: 'power2.inOut' });
  }

  /* ---------- input ---------- */

  bind() {
    const st = this.stage;

    st.addEventListener('pointerdown', (e) => {
      if (this.locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try {
        st.setPointerCapture(e.pointerId);
      } catch {}
      gsap.killTweensOf(this, 'vel');
      this.drag = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        sum: 0,
        moved: false,
        samples: [{ d: 0, t: e.timeStamp }],
      };
    });

    st.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.pointer = { x: e.clientX, y: e.clientY };
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
        d.moved = true;
        this.vel = 0;
        st.classList.add('is-dragging');
        this.setHover(null);
      }
      if (!d.moved) return;
      // only the part of the drag that runs along the shelf moves it
      const along = dx * C - dy * S;
      this.offset += along;
      d.sum += along;
      d.samples.push({ d: d.sum, t: e.timeStamp });
      while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 100) d.samples.shift();
    });

    const up = (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      try {
        st.releasePointerCapture(e.pointerId);
      } catch {}
      st.classList.remove('is-dragging');
      if (d.moved) {
        // throw: keep the speed of the last ~100ms, then ease back to the drift
        const a = d.samples[0];
        const b = d.samples[d.samples.length - 1];
        const dt = (b.t - a.t) / 1000;
        this.vel = dt > 0.01 ? clamp((b.d - a.d) / dt, -3000, 3000) : 0;
      } else if (e.type === 'pointerup') {
        this.present(this.hitTest(e.clientX, e.clientY));
      }
      if (e.pointerType !== 'mouse') this.pointer = null;
    };
    st.addEventListener('pointerup', up);
    st.addEventListener('pointercancel', up);
    st.addEventListener('pointerleave', () => {
      if (!this.drag) this.pointer = null;
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) return;
        e.preventDefault();
        if (e.ctrlKey) return; // pinch-zoom gesture
        let d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (e.deltaMode === 1) d *= 18;
        else if (e.deltaMode === 2) d *= this.vh;
        gsap.killTweensOf(this, 'vel');
        this.vel = clamp(this.vel + d * 2.4, -2600, 2600);
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (this.locked || e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      gsap.killTweensOf(this, 'vel');
      this.vel = clamp(this.vel + dir * 700, -2600, 2600);
    });

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (!this.locked) this.layout();
      }, 150);
    });
  }

  /* ---------- frame ---------- */

  tick(now) {
    requestAnimationFrame(this.tick);
    const dt = clamp((now - this.last) / 1000, 0, 1 / 20);
    this.last = now;
    this.step(dt);
  }

  step(dt) {
    const L = this.L;

    // speed: drift, slow down under the pointer, stop dead for a click
    if (!(this.drag && this.drag.moved) && !gsap.isTweening(this)) {
      const stop = this.locked || !!this.presenting;
      const base = this.reduced ? 0 : params.speed;
      const goal = stop ? 0 : this.hovered ? base * params.hoverSpeed : base;
      const lam = stop ? 14 : Math.abs(goal) < Math.abs(this.vel) ? params.slowDown : params.speedUp;
      this.vel = damp(this.vel, goal, lam, dt);
    }
    if (!(this.drag && this.drag.moved)) this.offset += this.vel * dt;

    this.place();
    this.order.sort((a, b) => a.x - b.x);

    // hover follows the pointer, and the cards moving under a still pointer
    if (this.presenting) this.setHover(this.presenting);
    else if (this.locked || (this.drag && this.drag.moved) || !this.pointer) {
      if (!this.locked) this.setHover(null);
    } else this.setHover(this.hitTest(this.pointer.x, this.pointer.y));

    // the cards either side of the hovered one rise a little too
    const nb = new Map();
    const h = this.hovered && !this.locked ? this.order.indexOf(this.hovered) : -1;
    if (h >= 0 && params.neighbour > 0) {
      for (const [d, w] of [
        [1, 1],
        [2, 0.35],
      ]) {
        for (const j of [h - d, h + d]) if (this.order[j]) nb.set(this.order[j], params.neighbour * w);
      }
    }

    for (const t of this.tiles) {
      const on = (t === this.hovered && !this.locked) || t.present ? 1 : 0;
      t.lift = approach(t.lift, on, on ? 10 : 6, dt);
      t.peek = approach(t.peek, on, on ? 7 : 6, dt); // the photo follows a beat later...
      t.pp = approach(t.pp, on, on ? 5 : 6, dt); // ...and the paper later still
      t.out = approach(t.out, t.present ? 1 : 0, t.present ? 9 : 6, dt);
      t.nb = approach(t.nb, nb.get(t) || 0, 7, dt);
    }

    // a click flies once the photo is all the way out
    const pt = this.presenting;
    if (pt && pt.out > 0.97 && pt.lift > 0.97 && Math.abs(this.vel) < 2) {
      this.presenting = null;
      this.onOpen(pt);
    }

    this.write();
  }

  write() {
    const L = this.L;
    const vw = this.vw;
    const vh = this.vh;
    for (const t of this.tiles) {
      const o = this.origin(t, (t.lift + t.nb) * L.liftPx);
      o.y += (1 - t.rise) * L.H * 0.55;

      // skip cards that are off screen
      const vis =
        o.x < vw + 40 &&
        o.x + C * L.W > -40 &&
        o.y - L.H * 0.9 < vh + 40 &&
        o.y + L.H + S * L.W > -40;
      if (vis !== t.visible) {
        t.visible = vis;
        t.el.style.visibility = vis ? '' : 'hidden';
      }
      if (!vis) continue;

      const tr = `matrix(${FACE}, ${o.x.toFixed(2)}, ${o.y.toFixed(2)})`;
      if (tr !== t.tr) {
        t.tr = tr;
        t.el.style.transform = tr;
      }
      const op = t.rise < 1 ? Math.min(1, t.rise * 1.6).toFixed(3) : '';
      if (op !== t.op) {
        t.op = op;
        t.el.style.opacity = op;
      }

      // the children: photo and paper slide up inside the folder, the frost thins
      const up = L.peekPx * t.peek * (1 - t.out) + L.out * t.out;
      const pup = L.paperPx * t.pp + L.paperPx * 1.4 * t.out;
      const lit = Math.max(t.lift, t.out);
      const key = `${up.toFixed(2)}|${pup.toFixed(2)}|${lit.toFixed(3)}`;
      if (key !== t.key) {
        t.key = key;
        this.writeParts(t, up, pup, lit);
      }
    }

    // the floor label stays on the floor (Z = 0) beside its card, even while the
    // card floats above it. Nothing on the shelf can cover that patch of floor.
    const tt = this.tagTile;
    if (this.tag && tt) {
      const X = tt.x + L.tagH0;
      const Y = L.W / 2 + L.tagPad;
      const tx = L.ox + C * X + C * Y;
      const ty = L.oy - S * X + S * Y;
      const tr = `matrix(${FLOOR}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;
      if (tr !== this.tagTr) {
        this.tagTr = tr;
        this.tag.style.transform = tr;
      }
    }
  }

  // the folder's children: photo and paper slide up inside it, the frost thins
  writeParts(t, up, pup, lit) {
    const L = this.L;
    t.photo.style.transform = `translate(${px(L.dPhoto)}, ${px(-L.dPhoto - up)})`;
    t.bImg.style.transform = `translateY(${px(-up)})`;
    t.paper.style.transform = `translate(${px(L.dPaper)}, ${px(-L.dPaper - pup)})`;
    t.bPaper.style.transform = `translateY(${px(-pup)})`;
    t.veil.style.opacity = (params.frost + (params.frostHover - params.frost) * lit).toFixed(3);
  }
}
