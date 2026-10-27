import { gsap } from 'gsap';
import { drawStudioTile } from './studio.js';

/**
 * Phone version: a plain HTML grid with normal page scrolling. No WebGL, no
 * sphere, no lens. It speaks the same small interface as Gallery, so the
 * project page (and its flying image) works the same on both.
 */
export class DomGrid {
  constructor(root, projects, { onOpen } = {}) {
    this.root = root;
    this.projects = projects;
    this.tiles = [];
    this.intro = 1;
    this.wake = () => {};

    for (const p of projects) {
      if (p.studio) p.thumb = p.hero = drawStudioTile(1024).toDataURL('image/png');

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('aria-label', `Open ${p.title}`);

      const box = document.createElement('span');
      box.className = 'cell__img';
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.crossOrigin = 'anonymous'; // same cache entry as the project page images
      img.onload = () => img.classList.add('is-loaded');
      img.src = p.thumb;
      box.append(img);

      const cap = document.createElement('span');
      cap.className = 'cell__cap caps';
      cap.textContent = p.title;

      cell.append(box, cap);
      const tile = { idx: p.i, el: cell, img: box };
      cell.addEventListener('click', () => onOpen && onOpen(tile));
      root.append(cell);
      this.tiles.push(tile);
    }
  }

  start() {}

  screenRect(t) {
    const r = t.img.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  restRect(t) {
    return this.screenRect(t);
  }

  // the tile for project idx, if it is on screen
  findTile(idx) {
    const t = this.tiles.find((t) => t.idx === idx);
    if (!t) return null;
    const r = t.img.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight ? t : null;
  }

  setTileAlpha(t, a) {
    if (t) t.img.style.opacity = a;
  }

  setOpen(v, duration = 0.9, delay = 0) {
    gsap.to(this.root, { opacity: 1 - v, duration, delay, ease: 'power3.inOut', overwrite: true });
  }

  // freeze page scrolling while a project is open
  lock(v) {
    document.documentElement.classList.toggle('is-locked', v);
  }
}
