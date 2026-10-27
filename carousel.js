import { gsap } from 'gsap';
import { ProjectView } from './project.js';
import { PROJECTS } from './data.js';
import { Shelf, params } from './shelf.js';

const pad2 = (n) => String(n).padStart(2, '0');
const P = PROJECTS.length;
const HINT = window.matchMedia('(pointer: coarse)').matches
  ? 'Drag to scroll · tap to open'
  : 'Hover to slow · click to open';

// captions in the heading use the web font, so wait (briefly) for it
async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('500 40px "Hanken Grotesk"'), // the studio tile
        document.fonts.load(`500 40px ${getComputedStyle(document.body).fontFamily}`), // the page
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {}
}

/* ---------- term : definition ---------- */

class Definition {
  constructor(root) {
    this.term = root.querySelector('.def__term');
    this.word = root.querySelector('.def__word');
    this.sub = root.querySelector('.def__sub');
    this.state = {};
  }

  fill(el, rows, animate, delay) {
    const ins = rows.map((text) => {
      const line = document.createElement('span');
      line.className = 'def__line';
      const inner = document.createElement('span');
      inner.className = 'def__in';
      inner.textContent = text;
      line.append(inner);
      return line;
    });
    el.replaceChildren(...ins);
    const targets = el.querySelectorAll('.def__in');
    gsap.killTweensOf(targets);
    if (animate) {
      gsap.fromTo(targets, { yPercent: 112 }, { yPercent: 0, duration: 0.8, delay, stagger: 0.05, ease: 'expo.out' });
    }
  }

  // only the parts that changed slide in
  set({ term, word, sub }, animate = true) {
    const s = this.state;
    if (term !== s.term) this.fill(this.term, [term], animate, 0);
    if (word.join('|') !== s.word) this.fill(this.word, word, animate, 0.04);
    if (this.sub && sub !== s.sub) this.fill(this.sub, [sub], animate, 0.1);
    this.state = { term, word: word.join('|'), sub };
  }
}

const top = new Definition(document.getElementById('def-top'));
const bottom = new Definition(document.getElementById('def-bottom'));

// the flat page headings stay put; the hovered project goes on the floor label
function describe() {
  top.set({ term: 'archive:', word: ['objects, rooms', '& images'] }, false);
  bottom.set({ term: 'index:', word: [`${P} projects`], sub: HINT }, false);
}

/* ---------- the floor label (shown only on hover) ---------- */

function masked(el, text) {
  const line = document.createElement('span');
  line.className = 'tag__line';
  const inner = document.createElement('span');
  inner.className = 'tag__in';
  inner.textContent = text;
  line.append(inner);
  el.replaceChildren(line);
}

class FloorTag {
  constructor(root) {
    this.root = root;
    this.term = root.querySelector('.tag__term');
    this.word = root.querySelector('.tag__word');
    this.meta = root.querySelector('.tag__meta');
    this.rule = root.querySelector('.tag__rule');
    this.dot = root.querySelector('.tag__dot');
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  show(p) {
    masked(this.term, `${p.discipline.toLowerCase()}, ${p.year}:`);
    masked(this.word, p.title.toLowerCase());
    masked(this.meta, `${pad2(p.i + 1)} / ${pad2(P)} · ${p.location}`);
    gsap.killTweensOf([this.root, this.rule, this.dot]);
    gsap.set(this.root, { opacity: 1 });
    if (this.reduced) return;
    // the dot lands at the card's foot, the hairline runs out across the floor,
    // then each line rises up out of the floor
    gsap.fromTo(this.dot, { scale: 0 }, { scale: 1, duration: 0.55, ease: 'back.out(3)' });
    gsap.fromTo(this.rule, { scaleX: 0 }, { scaleX: 1, duration: 0.7, delay: 0.05, ease: 'expo.out' });
    gsap.fromTo(
      this.root.querySelectorAll('.tag__in'),
      { yPercent: 115 },
      { yPercent: 0, duration: 0.8, delay: 0.12, stagger: 0.05, ease: 'expo.out' }
    );
  }

  hide() {
    gsap.killTweensOf(this.root);
    gsap.to(this.root, { opacity: 0, duration: this.reduced ? 0 : 0.3, ease: 'power2.out' });
  }
}

const tag = new FloorTag(document.querySelector('.tag'));
const onHover = (p) => (p ? tag.show(p) : tag.hide());

/* ---------- live tweak panel: press "g" or open with ?debug ---------- */

let gui = null;
async function toggleDebug(shelf) {
  if (gui) {
    gui._hidden ? gui.show() : gui.hide();
    return;
  }
  const { default: GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm');
  gui = new GUI({ title: 'Shelf' });
  const relayout = () => shelf.layout();
  const drift = gui.addFolder('Drift');
  drift.add(params, 'speed', -200, 200, 1).name('speed (px/s)');
  drift.add(params, 'hoverSpeed', 0, 1, 0.01).name('speed while hovered');
  drift.add(params, 'slowDown', 0.5, 10, 0.1).name('slow-down rate');
  drift.add(params, 'speedUp', 0.2, 6, 0.1).name('pick-up rate');
  const look = gui.addFolder('Shelf');
  look.add(params, 'size', 0.1, 0.4, 0.005).name('card size').onFinishChange(relayout);
  look.add(params, 'gap', 0.12, 1.4, 0.01).name('card spacing').onFinishChange(relayout);
  look.add(params, 'rowX', 0.2, 0.8, 0.01).name('row x').onFinishChange(relayout);
  look.add(params, 'rowY', 0.3, 0.8, 0.01).name('row y').onFinishChange(relayout);
  const hov = gui.addFolder('Hover');
  hov.add(params, 'lift', 0, 0.6, 0.01).name('card lift').onFinishChange(relayout);
  hov.add(params, 'peek', 0, 0.4, 0.01).name('photo lift').onFinishChange(relayout);
  hov.add(params, 'paper', 0, 0.3, 0.01).name('paper lift').onFinishChange(relayout);
  hov.add(params, 'neighbour', 0, 0.6, 0.01).name('neighbour lift');
  const glass = gui.addFolder('Frost');
  glass.add(params, 'frost', 0, 1, 0.01).name('milk at rest').onChange(() => shelf.tiles.forEach((t) => (t.key = '')));
  glass.add(params, 'frostHover', 0, 1, 0.01).name('milk on hover');
}

/* ---------- boot ---------- */

(async function boot() {
  await fontsReady();
  describe();

  let view;
  const Kind = document.body.dataset.shelf === 'cd' ? (await import('./cd-shelf.js')).CdShelf : Shelf;
  const shelf = new Kind(document.getElementById('iso'), PROJECTS, {
    onOpen: (tile) => view.open(tile.idx, { tile, rect: shelf.screenRect(tile) }),
    onHover,
  });
  view = new ProjectView({ projects: PROJECTS, gallery: shelf });
  shelf.view = view;

  // keyboard / screen-reader index
  const nav = document.getElementById('a11y-index');
  PROJECTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.title;
    b.addEventListener('click', () => shelf.openProject(i));
    nav.append(b);
  });

  if (/[?&]debug\b/.test(location.search)) toggleDebug(shelf);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey && !view.isOpen) toggleDebug(shelf);
  });

  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug && view.indexOf(slug) >= 0) {
    view.openBySlug(slug, { push: false, fly: false });
  } else {
    shelf.start();
    gsap.from('.def', { opacity: 0, duration: 1.2, delay: 0.5, ease: 'power2.out' });
  }

  window.__shelf = { shelf, view, params };
})();
