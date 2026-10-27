import { gsap } from 'gsap';

const pad2 = (n) => String(n).padStart(2, '0');
const BASE_TITLE = document.title;
// the flyer's transform as a 2D matrix (origin top-left): identity = sitting on the hero
const FLAT = { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 };

/**
 * The project page. Opening flies the clicked tile's image into the hero spot
 * (and back again on close), while the grid fades and recedes underneath.
 */
export class ProjectView {
  constructor({ projects, gallery }) {
    this.projects = projects;
    this.gallery = gallery;

    const el = (this.el = document.querySelector('.pv'));
    this.bg = el.querySelector('.pv__bg');
    this.bar = el.querySelector('.pv__bar');
    this.scroller = el.querySelector('.pv__scroll');
    this.inner = el.querySelector('.pv__inner');
    this.heroBox = el.querySelector('.pv__hero');
    this.heroImg = this.heroBox.querySelector('img');
    this.heroImg.crossOrigin = 'anonymous';
    this.kicker = el.querySelector('.pv__kicker');
    this.title = el.querySelector('.pv__title');
    this.text = el.querySelector('.pv__text');
    this.meta = el.querySelector('.pv__meta');
    this.galleryEl = el.querySelector('.pv__gallery');
    this.nextBtn = el.querySelector('.pv__next');
    this.nextTitle = el.querySelector('.pv__next-title');
    this.closeBtn = el.querySelector('.pv__close');
    this.count = el.querySelector('.pv__count');
    this.reveals = [...el.querySelectorAll('.reveal')];
    this.flyer = document.querySelector('.flyer');
    this.flyerImg = this.flyer.querySelector('img');
    this.fly = { ...FLAT };
    this.applyFly = () => {
      const f = this.fly;
      this.flyer.style.transform = `matrix(${f.a}, ${f.b}, ${f.c}, ${f.d}, ${f.x}, ${f.y})`;
    };

    this.isOpen = false;
    this.busy = false;
    this.current = -1;
    this.tile = null;
    this.pushed = false;
    this.tl = null;

    this.closeBtn.addEventListener('click', () => this.requestClose());
    this.nextBtn.addEventListener('click', () => this.next());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.requestClose();
    });
    window.addEventListener('popstate', () => {
      const slug = decodeURIComponent(location.hash.slice(1));
      if (!slug && this.isOpen) {
        this.pushed = false;
        this.close();
      } else if (slug && !this.isOpen) {
        this.openBySlug(slug, { push: false });
      }
    });
  }

  indexOf(slug) {
    return this.projects.findIndex((p) => p.slug === slug);
  }

  openBySlug(slug, opts = {}) {
    const i = this.indexOf(slug);
    if (i >= 0) this.open(i, opts);
  }

  /* ---------- content ---------- */

  setHero(p) {
    const img = this.heroImg;
    img.alt = p.title;
    img.src = p.thumb; // already cached from the grid
    if (p.hero && p.hero !== p.thumb) {
      const hi = new Image();
      hi.crossOrigin = 'anonymous';
      hi.onload = () => {
        if (this.projects[this.current] === p) img.src = p.hero;
      };
      hi.src = p.hero;
    }
  }

  fill(i) {
    const P = this.projects.length;
    const p = this.projects[i];
    const n = this.projects[(i + 1) % P];

    this.kicker.textContent = `${p.discipline} — ${p.year}`;
    this.title.textContent = p.title;
    this.text.textContent = p.text;
    this.count.textContent = `${pad2(i + 1)} / ${pad2(P)}`;
    this.nextTitle.textContent = n.title;

    const rows = [
      ['Year', p.year],
      ['Discipline', p.discipline],
      ['Location', p.location],
      ['With', p.client],
    ];
    this.meta.replaceChildren(
      ...rows.map(([k, v]) => {
        const d = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        d.append(dt, dd);
        return d;
      })
    );

    this.setHero(p);

    this.galleryEl.replaceChildren(
      ...p.images.map((im, k) => {
        const fig = document.createElement('figure');
        fig.style.aspectRatio = `${im.w} / ${im.h}`;
        const img = new Image();
        img.alt = `${p.title}, image ${k + 2}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onload = () => img.classList.add('is-loaded');
        img.src = im.src;
        fig.append(img);
        return fig;
      })
    );

    document.title = `${p.title} — ${BASE_TITLE}`;
  }

  /* ---------- flyer ---------- */

  showFlyer(src, rect) {
    this.flyerImg.src = src;
    Object.assign(this.flyer.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  hideFlyer() {
    this.flyer.style.display = 'none';
    Object.assign(this.fly, FLAT);
    this.flyer.style.transform = '';
  }

  // The flyer transform that lays the hero box onto a tile's image. A flat tile
  // only scales; an isometric one also leans: `skewY` (deg) plus a horizontal
  // `squash` turn the square into the tile's parallelogram. (left, top) is the
  // image's top-left corner, width its unprojected size.
  flip(rect, hero) {
    const s = rect.width / hero.width;
    const sx = s * (rect.squash || 1);
    const k = Math.tan(((rect.skewY || 0) * Math.PI) / 180);
    return { a: sx, b: sx * k, c: 0, d: s, x: rect.left - hero.left, y: rect.top - hero.top };
  }

  setFly(v) {
    Object.assign(this.fly, v);
    this.applyFly();
  }

  /* ---------- open / close ---------- */

  open(i, { tile = null, rect = null, push = true, fly = true } = {}) {
    if (this.isOpen || this.busy) return;
    const p = this.projects[i];
    this.isOpen = true;
    this.busy = true;
    this.current = i;
    if (push) {
      history.pushState({ pv: p.slug }, '', `#${p.slug}`);
      this.pushed = true;
    }

    this.fill(i);
    this.gallery.lock(true);
    this.el.classList.add('is-open');
    this.el.setAttribute('aria-hidden', 'false');
    this.scroller.scrollTop = 0;

    gsap.killTweensOf([this.bg, this.bar, this.inner, this.heroBox, this.galleryEl, this.flyer, this.fly, ...this.reveals]);
    gsap.set(this.inner, { opacity: 1, y: 0 });
    gsap.set([this.bg, this.bar, this.galleryEl], { opacity: 0 });
    gsap.set(this.reveals, { opacity: 0, y: 16 });

    if (fly && !tile) tile = this.gallery.findTile(i);
    if (tile && !rect) rect = this.gallery.screenRect(tile);
    this.tile = tile;
    const hero = this.heroBox.getBoundingClientRect();

    const tl = (this.tl = gsap.timeline({
      paused: true,
      onComplete: () => {
        this.busy = false;
        this.closeBtn.focus({ preventScroll: true });
      },
    }));
    let go = () => {
      this.gallery.setOpen(1, 0.95);
      tl.play();
    };

    if (fly && tile && rect) {
      // FLIP: the flyer sits on the hero spot, transformed back to the tile
      gsap.set(this.heroBox, { opacity: 0 });
      this.showFlyer(p.thumb, hero);
      this.setFly(this.flip(rect, hero));
      const start = go;
      go = () => {
        // swap the tile for the flyer only once the flyer's image is painted
        this.gallery.setTileAlpha(tile, 0);
        start();
      };
      tl.to(this.fly, { ...FLAT, duration: 1.15, ease: 'expo.inOut', onUpdate: this.applyFly }, 0);
      tl.call(() => {
        gsap.set(this.heroBox, { opacity: 1 });
        this.hideFlyer();
      }, null, 1.15);
    } else {
      gsap.set(this.heroBox, { opacity: 0 });
      tl.to(this.heroBox, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.35);
    }
    tl.to(this.bg, { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0.25);
    tl.to(this.bar, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0.7);
    tl.to(this.reveals, { opacity: 1, y: 0, duration: 0.9, stagger: 0.06, ease: 'power3.out' }, 0.75);
    tl.to(this.galleryEl, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 1.0);

    // wait (briefly) for the flyer's image to decode so it never flies as an empty plate
    const decoded = this.flyer.style.display === 'block' ? this.flyerImg.decode().catch(() => {}) : null;
    Promise.race([decoded, new Promise((r) => setTimeout(r, 150))]).then(() => {
      if (this.tl === tl) go();
    });
  }

  requestClose() {
    if (!this.isOpen || this.busy) return;
    if (this.pushed && history.state && history.state.pv) history.back(); // popstate closes
    else this.close();
  }

  close() {
    if (!this.isOpen) return;
    if (this.tl) this.tl.kill();
    this.hideFlyer();
    this.busy = true;
    this.pushed = false;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);

    // fly back to the tile we came from if it is still there, otherwise the nearest copy
    const stillThere =
      this.tile && this.gallery.tiles.includes(this.tile) && this.tile.idx === this.current;
    const tile = stillThere ? this.tile : this.gallery.findTile(this.current);
    if (this.tile && this.tile !== tile) this.gallery.setTileAlpha(this.tile, 1);

    const hero = this.heroBox.getBoundingClientRect();
    const heroVisible = hero.bottom > 60 && hero.top < window.innerHeight - 60;

    const finish = () => {
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      gsap.set(this.heroBox, { opacity: 1 });
      if (tile) this.gallery.setTileAlpha(tile, 1);
      this.hideFlyer();
      this.isOpen = false;
      this.busy = false;
      this.current = -1;
      this.tile = null;
      document.title = BASE_TITLE;
      this.gallery.lock(false);
      if (document.activeElement && this.el.contains(document.activeElement)) document.activeElement.blur();
    };

    const tl = (this.tl = gsap.timeline({ onComplete: finish }));
    tl.to([this.bar, this.galleryEl, ...this.reveals], { opacity: 0, duration: 0.35, ease: 'power2.in' }, 0);
    tl.to(this.bg, { opacity: 0, duration: 0.65, ease: 'power2.inOut' }, 0.25);
    this.gallery.setOpen(0, 1.0, 0.15);

    if (tile && heroVisible) {
      const rect = this.gallery.restRect(tile);
      this.gallery.setTileAlpha(tile, 0);
      this.showFlyer(this.heroImg.currentSrc || this.heroImg.src, hero);
      this.setFly(FLAT);
      gsap.set(this.heroBox, { opacity: 0 });
      tl.to(
        this.fly,
        { ...this.flip(rect, hero), duration: 1.05, ease: 'expo.inOut', onUpdate: this.applyFly },
        0.1
      );
    } else {
      if (tile) this.gallery.setTileAlpha(tile, 1);
      tl.to(this.heroBox, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 0);
    }
  }

  next() {
    if (this.busy || !this.isOpen) return;
    this.busy = true;
    const n = (this.current + 1) % this.projects.length;
    gsap.to(this.inner, {
      opacity: 0,
      y: -24,
      duration: 0.45,
      ease: 'power2.in',
      onComplete: () => {
        if (this.tile) this.gallery.setTileAlpha(this.tile, 1);
        this.tile = null;
        this.current = n;
        this.fill(n);
        this.scroller.scrollTop = 0;
        history.replaceState({ pv: this.projects[n].slug }, '', `#${this.projects[n].slug}`);
        gsap.set([this.heroBox, this.galleryEl, ...this.reveals], { opacity: 1, y: 0 });
        gsap.fromTo(
          this.inner,
          { opacity: 0, y: 32 },
          { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', onComplete: () => (this.busy = false) }
        );
      },
    });
  }
}
