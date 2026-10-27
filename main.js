import { ProjectView } from './project.js';
import { PROJECTS } from './data.js';

// Phones get a plain grid with normal scrolling; tablets and desktops get the sphere.
const PHONE = '(max-width: 599px)';
const phoneQuery = window.matchMedia(PHONE);
// crossing the breakpoint swaps the whole renderer, simplest done with a reload
phoneQuery.addEventListener('change', () => location.reload());

const canvas = document.getElementById('gl');
const hint = document.getElementById('hint');

function webglOK() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// captions are drawn into textures, so wait (briefly) for the web font
async function fontsReady() {
  try {
    await Promise.race([
      document.fonts.load('500 10px "Hanken Grotesk"'),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
  } catch {}
}

let hintTimer;
function hideHint() {
  if (hint.classList.contains('is-hidden')) return;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.add('is-hidden'), 600);
}

// live tweak panel: press "g" or open with ?debug
let gui = null;
async function toggleDebug(gallery, params) {
  if (gui) {
    gui._hidden ? gui.show() : gui.hide();
    return;
  }
  const { default: GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm');
  gui = new GUI({ title: 'Sphere' });
  const rebuild = () => gallery.rebuild();
  gui.add(params, 'mode', ['inside', 'outside']).name('view').onChange(rebuild);
  gui.add(params, 'lens', 20, 70, 0.5).name('lens angle').onFinishChange(() => gallery.layout());
  gui.add(params, 'radius', 0.5, 3, 0.01).name('sphere radius').onFinishChange(rebuild);
  gui.add(params, 'push', 0, 1, 0.01).name('zoom out').onFinishChange(rebuild);
  gui.add(params, 'depth', 0, 300, 1).name('depth scatter');
  gui.add(params, 'lean', 0, 0.15, 0.001).name('lean');
  gui.add(params, 'stiffness', 30, 400, 1).name('spring stiffness');
  gui.add(params, 'damping', 0.2, 1.2, 0.01).name('spring damping');
  gui.add(params, 'speedMax', 300, 4000, 10).name('speed for full bend');
  gui.add(params, 'gather', 0.25, 2, 0.01).name('spacing while bent').onFinishChange(rebuild);
  gui.add(params, 'edgeWrap', 0, 1, 0.01).name('edge fold').onFinishChange(rebuild);
  gui.add(params, 'edgeWrapStart', 0.2, 0.95, 0.01).name('edge fold starts at');
  const lens = gui.addFolder('Edge lens');
  lens.add(params, 'lensRest', 0, 1, 0.01).name('at rest');
  lens.add(params, 'lensMotion', 0, 1.2, 0.01).name('while moving');
  lens.add(params, 'lensSide', 0, 0.25, 0.005).name('side band');
  lens.add(params, 'lensSideMax', 20, 300, 1).name('side band max px');
  lens.add(params, 'lensTop', 0, 0.25, 0.005).name('top/bottom band');
  lens.add(params, 'lensTopMax', 20, 300, 1).name('top/bottom max px');
  lens.add(params, 'lensStretch', 0, 0.95, 0.01).name('stretch');
  lens.add(params, 'lensFlare', 0, 0.6, 0.01).name('swell');
  lens.add(params, 'lensCA', 0, 0.3, 0.005).name('colour split');
  lens.add(params, 'lensIri', 0, 1, 0.01).name('oil-slick tint');
  lens.add(params, 'lensRim', 0, 1.5, 0.01).name('rainbow rim');
  gui.add({ hold: () => gallery.preview() }, 'hold').name('preview sphere');
  gui.onChange(gallery.wake);
}

(async function boot() {
  // no WebGL 2 on a big screen? fall back to the plain grid as well
  const phone = phoneQuery.matches || !webglOK();
  document.documentElement.classList.toggle('is-phone', phone);

  let view;
  let grid;
  if (phone) {
    const { DomGrid } = await import('./dom-grid.js');
    grid = new DomGrid(document.getElementById('dgrid'), PROJECTS, {
      onOpen: (tile) => view.open(tile.idx, { tile, rect: grid.screenRect(tile) }),
    });
  } else {
    if (window.matchMedia('(pointer: coarse)').matches) {
      hint.firstElementChild.textContent = 'Drag to explore';
      hint.lastElementChild.textContent = 'Tap to open';
    }
    const [{ Gallery, params }] = await Promise.all([import('./gallery.js'), fontsReady()]);
    grid = new Gallery(canvas, PROJECTS, {
      onOpen: (tile) => view.open(tile.idx, { tile, rect: grid.screenRect(tile) }),
      onInteract: hideHint,
    });
    setTimeout(hideHint, 4500); // the hint sits over the bottom row, so it doesn't stay long
    if (/[?&]debug\b/.test(location.search)) toggleDebug(grid, params);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey && !view.isOpen) toggleDebug(grid, params);
    });
    window.__archive = { gallery: grid, params };
  }
  view = new ProjectView({ projects: PROJECTS, gallery: grid });

  // keyboard / screen-reader index
  const nav = document.getElementById('a11y-index');
  PROJECTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.title;
    b.addEventListener('click', () => view.open(i));
    nav.append(b);
  });

  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug && view.indexOf(slug) >= 0) {
    grid.intro = 1;
    view.openBySlug(slug, { push: false, fly: false });
  } else {
    grid.start();
  }

  // handy for poking at it from the console
  window.__archive = { ...(window.__archive || {}), gallery: grid, view };
})();
