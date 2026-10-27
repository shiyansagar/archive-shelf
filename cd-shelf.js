import { Shelf, params, px, el, box } from './shelf.js';

// On hover the disc slides up out of the case and the booklet barely moves;
// on click the booklet (the project photo) is pulled out and flies, as before.
Object.assign(params, { gap: 1, lift: 0.39, peek: 0.04, paper: 0.24, neighbour: 0.41, tagSize: 0.72 });

/**
 * The same isometric shelf, but every card is a CD jewel case (after ../cdcase):
 * clear lid with a grey frame, the photo as the booklet, ribbed hinge on the left,
 * a silver disc inside, and the case's top and side as thin plastic faces.
 */
export class CdShelf extends Shelf {
  // a jewel case is 142 x 125 x 10.4 mm; the booklet is 120 mm square, the disc 120 mm across
  shape(L) {
    const W = L.W;
    const H = (L.H = Math.round((W * 125) / 142));
    const s = Math.round((W * 120) / 142);
    L.th = Math.max(6, Math.round((W * 10.4) / 142)); // case thickness (L.T is the shelf's length)
    L.spine = Math.max(6, Math.round(W * 0.07));
    L.lip = Math.max(2, Math.round(W * 0.018));
    L.ph = { x: W - s - Math.round(W * 0.035), y: Math.round((H - s) / 2), s }; // booklet
    L.disc = { x: Math.round(W * 0.528 - s / 2), y: Math.round((H - s) / 2), s };
    L.dPhoto = Math.max(1, Math.round(L.th * 0.15)); // booklet just under the lid
    L.dDisc = Math.round(L.th * 0.76); // disc deep in the tray
    L.out = L.ph.y + L.ph.s + H * 0.06; // pulled out: the booklet clears the case
    this.row.style.setProperty('--lip', `${L.lip}px`);
  }

  makeCard(t) {
    const L = this.L;
    const { W, H, th } = L;
    const card = el('cd');
    card.style.width = px(W);
    card.style.height = px(H);
    const back = (e, d) => {
      e.style.transform = `translate(${px(d)}, ${px(-d)})`; // d px further back along the shelf
      return e;
    };
    // the top face between two depths (a local (1, -1) step is 1px further back)
    const top = (d0, d1, cls) => {
      const e = box(el(`cd__top ${cls}`), 0, 0, W, d1 - d0);
      e.style.transform = `matrix(1, 0, -1, 1, ${d1}, ${-d1})`;
      return e;
    };

    // back to front: inlay, the top behind the disc, side, disc, the top in front of it, booklet, lid
    const inlay = back(box(el('cd__inlay'), 0, 0, W, H), Math.round(th * 0.9));
    const topBack = top(L.dDisc, th, 'cd__top--back');
    const side = box(el('cd__side'), 0, 0, th, H);
    side.style.transform = `matrix(1, -1, 0, 1, ${W}, 0)`;
    const disc = box(el('cd__disc'), L.disc.x, L.disc.y, L.disc.s, L.disc.s);
    const topFront = top(0, L.dDisc, 'cd__top--front');

    const photo = box(el('cd__book'), L.ph.x, L.ph.y, L.ph.s, L.ph.s);
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.crossOrigin = 'anonymous'; // same cache entry as the project page images
    img.onload = () => img.classList.add('is-loaded');
    img.src = t.p.thumb;
    photo.append(img);

    const lid = box(el('cd__lid'), 0, 0, W, H);
    const spine = box(el('cd__spine'), 0, 0, L.spine, H);
    const tabH = Math.round(H * 0.072);
    const tabW = Math.max(3, Math.round(W * 0.035));
    const tabs = [0.18, 0.82].map((f) =>
      box(el('cd__tab'), W - L.lip - tabW, Math.round(H * f - tabH / 2), tabW, tabH)
    );
    lid.append(spine, ...tabs);

    card.append(inlay, topBack, side, disc, topFront, photo, lid);
    this.row.append(card);
    Object.assign(t, { el: card, photo, disc });
  }

  writeParts(t, up, pup) {
    const L = this.L;
    t.photo.style.transform = `translate(${px(L.dPhoto)}, ${px(-L.dPhoto - up)})`;
    t.disc.style.transform = `translate(${px(L.dDisc)}, ${px(-L.dDisc - pup)})`;
  }
}
