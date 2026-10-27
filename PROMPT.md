# CD Jewel-Case Shelf — reproduction prompt

Paste everything inside the block below into Claude (Opus) as one message. It rebuilds the CD jewel-case shelf (`carousel-cd.html` in this repo) from scratch with every size, colour, formula and timing spelled out, so the result comes out the same each time.

````text
Build a single-page web experience: an endless ISOMETRIC SHELF of CD JEWEL CASES drifting past on a white page. Plain HTML + CSS + ES modules, no build step. GSAP 3.12.5 via importmap ("gsap": "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js"). Every card is plain DOM with a 2D CSS matrix (NO preserve-3d, NO perspective, NO canvas/WebGL). Follow every number below exactly.

FILES
index.html, style.css, data.js, shelf.js, main.js, project.js, dev-server.py (python http.server subclass that sends "Cache-Control: no-store" and serves .js as text/javascript; port from argv, default 8095).

FONTS + PAGE
- Google Fonts: family=Google+Sans+Flex:opsz,wght@6..144,1..1000 and family=Hanken+Grotesk:wght@500 (Hanken only for the studio tile canvas).
- --font: "Google Sans Flex", ui-sans-serif, system-ui, sans-serif. --ease: cubic-bezier(0.16,1,0.3,1). --ink: #151515.
- body background #ffffff, html/body overflow hidden, antialiased.
- .caps = 10px, weight 500, letter-spacing .075em, line-height 1.3, uppercase.
- A fixed full-screen film grain on top (z-index 9, pointer-events none): SVG feTurbulence fractalNoise baseFrequency .9 numOctaves 2 as a data URI, background-size 180px, opacity .28, mix-blend-mode soft-light.
- Top-right fixed mark: 30x30 SVG (three small parallelograms: "M5 9.5 11 13v9.5L5 19z", "M10 6.6 16 10.1v9.5l-6-3.5z", "M15 3.7 21 7.2v9.5l-6-3.5z" at opacity .55), padding clamp(16px,3vh,32px) clamp(16px,3.5vw,48px).

DATA (data.js)
Export PROJECTS: 30 items {i, slug, title, discipline, year, location, client, studio?, thumb, hero, images[]}. Images from https://picsum.photos/seed/<slug>/800/800 (thumb) and /1600/1600 (hero), crossOrigin anonymous. Item 0 is {studio:true, title:"Studio & Info"}; its thumb/hero is a 1024px black canvas tile with the word "archives" in white Hanken Grotesk 500.

ISOMETRIC MATHS (true isometric)
C = cos30°, S = 0.5. World axes: X along the shelf going away (screen (C,-S)), Y across a card (screen (C,S)), Z up (screen (0,-1)).
- Card face lies in the Y-Z plane: transform = matrix(C, S, 0, 1, tx, ty), transform-origin 0 0.
- Inside a card, a local translate(d, -d) moves an element exactly d px deeper (further along X).
- Floor plane for the label: FLOOR = matrix(C, S, -C, S, tx, ty) (local x runs along +Y, local y along -X, so text reads down-right, opposite lean to the shelf).

PARAMS (exported object, live-tweakable with lil-gui 0.19.2 from jsdelivr +esm, opened with key "g" or ?debug)
speed 34 (px/s), hoverSpeed 0, slowDown 2.8, speedUp 1.1, size 0.15, gap 1, lift 0.39, peek 0.04 (booklet), paper 0.24 (disc), neighbour 0.41, rowX 0.5, rowY 0.56, tagSize 0.72.

LAYOUT (recompute on resize, debounced 150ms, keep offset scaled)
W = round(clamp(min(vh*size, vw*0.24), 84, 210)); H = round(W*125/142)   // a jewel case is 142 x 125 x 10.4 mm
Spacing = max(24, round(W*gap)); th = max(6, round(W*10.4/142)); spine = max(6, round(W*0.07)); lip = max(2, round(W*0.018)).
s = round(W*120/142) (booklet side = disc diameter).
Booklet (the project photo): x = W - s - round(W*0.035), y = round((H-s)/2), depth dPhoto = max(1, round(th*0.15)).
Disc: x = round(W*0.528 - s/2), same y, depth dDisc = round(th*0.76).
liftPx = H*lift, peekPx = H*peek, discPx = H*paper, outPx = booklet.y + s + 0.06H.
Row origin: ox = vw*rowX, oy = vh*rowY + H/2.
Card screen origin for shelf position X and lift lz: x = ox + C*X - C*W/2, y = oy - S*X - S*W/2 - H - lz.
Card count N = P*k (P = 30), k = smallest integer so N*Spacing covers twice the distance a card needs to leave the screen either way (+2 spacings). Total loop T = N*Spacing. Each card i: u = i*Spacing + offset, wrap X into [-T/2, T/2).
Stacking: sort by X once, z-index = N - rank (nearest on top). Afterwards only a card that wraps changes z-index: ++zTop when it wraps to the front, --zBottom when it wraps to the back.

ONE CARD (DOM order back -> front; every child position:absolute, left/top 0, transform-origin 0 0)
1. .cd__inlay: W x H, translate(round(.9th), -round(.9th)). background linear-gradient(180deg,#eef1f4,#dfe4ea), inset 0 0 0 1px rgba(120,132,146,.18).
2. top face, back part (depth dDisc..th): box W x (th-dDisc), transform matrix(1,0,-1,1, th, -th). background rgba(214,222,231,.75).
3. right side face: box th x H, transform matrix(1,-1,0,1, W, 0). background linear-gradient(90deg, rgba(240,245,250,.92) 0 29%, rgba(150,162,176,.55) 29% 35%, rgba(205,214,224,.8) 35% 100%).
4. .cd__disc: s x s at disc x/y, border-radius 50%.
   background: radial-gradient(circle closest-side, #eef1f4 0 27.5%, #e3e7eb 27.5% 38%, rgba(255,255,255,.7) 38% 39%, transparent 39% 97%, #c3c9d0 97%),
               conic-gradient(from 20deg, #d3d7dc 0%, #eef0f2 6%, #ffd3e6 11%, #fff3c4 14%, #cdf6d8 17%, #c9e6ff 20%, #ddd2ff 23%, #e9ecef 28%, #c8cdd3 40%, #f4f5f7 50%, #ffd3e6 61%, #fff3c4 64%, #cdf6d8 67%, #c9e6ff 70%, #ddd2ff 73%, #e9ecef 78%, #c8cdd3 90%, #d3d7dc 100%);
   mask: radial-gradient(circle closest-side, transparent 12.5%, rgba(0,0,0,.45) 12.5% 27.5%, #000 27.5%)  (centre hole + clear hub).
5. top face, front part (depth 0..dDisc): box W x dDisc, matrix(1,0,-1,1, dDisc, -dDisc). background linear-gradient(180deg, rgba(226,233,240,.7) 0 60%, rgba(150,162,176,.55) 60% 66%, rgba(246,249,252,.92) 66% 100%) (the lid seam).
6. .cd__book: s x s, overflow hidden, radius 1px, bg #d6d6d2, contains <img> object-fit cover that fades in (opacity 0 -> 1, .9s var(--ease)) on load. ::after fold line: linear-gradient(90deg, rgba(255,255,255,.35) 0 1px, rgba(0,0,0,.12) 1px 2px, transparent 2px).
7. .cd__lid: W x H, radius 2px. background: linear-gradient(116deg, transparent 38%, rgba(255,255,255,.3) 41%, transparent 47%), linear-gradient(116deg, rgba(255,255,255,.5) 0%, transparent 30%, transparent 64%, rgba(255,255,255,.22) 100%), rgba(222,232,244,.1). box-shadow: inset 0 0 0 1px rgba(255,255,255,.9), inset 0 0 0 <lip>px rgba(168,179,192,.42).
   Inside the lid: .cd__spine (spine x H at left) background linear-gradient(90deg, rgba(140,150,160,.75) 0 12%, rgba(248,250,252,.9) 12% 22%, transparent 22%), repeating-linear-gradient(90deg, rgba(88,97,107,.5) 0 1px, rgba(250,251,252,.85) 1px 2px), rgba(214,222,231,.6).
   Two .cd__tab clips: width max(3, round(W*.035)), height round(H*.072), at x = W - lip - tabW, centred at y = .18H and .82H; radius 1px, rgba(176,187,199,.55), inset 0 0 0 1px rgba(255,255,255,.6).
No drop shadows anywhere.

MOTION (one rAF loop, dt clamped to 1/20 s)
damp(a,b,λ,dt) = a + (b-a)*(1-exp(-λdt)); approach = damp that snaps when |v-b| < 1e-3.
- Velocity: goal = 0 if locked/presenting, else speed*(hovered ? hoverSpeed : 1). λ = 14 when stopping, slowDown when slowing, speedUp when speeding up. offset += vel*dt.
- Hit test (no DOM events per card): front to back over the sorted cards, invert the face matrix: u = (mx - o.x)/C, inside if 0<=u<=W; v = my - o.y - S*u, inside if top<=v<=H, where top = -(liftPx + max(peekPx, discPx)) for the currently hovered card (prevents flicker), else 0. Hover follows the pointer every frame (cards move under a still pointer).
- Neighbours in sorted order: ±1 get neighbour*1, ±2 get neighbour*0.35 of the lift.
- Per card: lift -> on (λ 10 up / 6 down), peek (7/6), pp (5/6), out -> present (9/6), nb (7).
- Card y uses (lift + nb)*liftPx. booklet up = peekPx*peek*(1-out) + outPx*out; disc up = discPx*pp + discPx*1.4*out.
  booklet transform translate(dPhoto, -dPhoto - up); disc transform translate(dDisc, -dDisc - discUp).
- Cull cards off screen with visibility hidden; only write a transform when its string changed.
- Intro: visible cards rise with stagger .045s (delay .15), 1.5s expo.out, y offset (1-rise)*.55H, opacity min(1, rise*1.6); vel tweens 0 -> speed over 2.4s, delay .6, power2.inOut. prefers-reduced-motion: speed 0, no intro.

INPUT
Pointer drag moves only along the shelf: offset += dx*C - dy*S, starts after 6px; release throws with the speed of the last 100ms (clamp ±3000). Wheel: vel += delta*2.4 (clamp ±2600, preventDefault, ignore ctrl). Arrow keys ±700. A press without movement = click on the hit card. Cursor pointer on hover, grabbing while dragging. touch-action none.

CLICK -> PROJECT PAGE
Click presents the card: shelf stops, card lifts fully, booklet slides all the way up (out). When out>.97 and lift>.97 and |vel|<2, open the project page. A FLIP "flyer" (fixed img) starts exactly on the booklet: rect = {left, top, width: s, height: s, skewY: 30, squash: C} where left/top = card origin + (C*bx, S*bx + by) with bx = booklet.x + dPhoto, by = booklet.y - dPhoto - up. Flyer start matrix: a = s/heroW * C, b = a*tan30°, c = 0, d = s/heroW, x/y = offset to hero box; tween every matrix field to identity over 1.15s expo.inOut (close: reverse over 1.05s, landing back on the pulled-out booklet, then the card settles). Shelf stage fades to 0 behind the page. Project page: full-screen white overlay, "← Shelf" caps button + "NN / 30" counter, square hero image, caps kicker, big title, text, meta list, image gallery, "Next project" button; content lines reveal upward; Escape/back closes; URL hash = #slug (opening with a hash opens that project directly without flying).

HOVER LABEL ON THE FLOOR (only while hovering)
One .tag element (z-index 2, opacity 0) placed every frame with FLOOR matrix: X = card X + h0, Y = W/2 + pad; tx = ox + C*X + C*Y, ty = oy - S*X + S*Y. It stays on the floor (Z=0) even while the card floats.
word = round(clamp(W*.19, 18, 34) * tagSize); pad = round(W*.32); h0 = round(12*1.35 + word*.55).
Children: 5px black dot (box-shadow 0 0 0 3px rgba(27,27,26,.08)) at left 4-pad, top h0-2; 1px hairline rule linear-gradient(90deg, rgba(21,21,21,.5), rgba(21,21,21,.18)) at left 10-pad, top h0, width pad-22, origin left; text: term "<discipline lowercase>, <year>:" 12px/1.35 weight 500 #8b8b86; title lowercase, font-size word px, weight 500, line-height 1.1, letter-spacing -.035em, #1b1b1a; meta caps "<NN> / 30 · <LOCATION>" #6f6f6a, margin-top .7em. Each line sits in an overflow-hidden mask.
Show: opacity 1; dot scale 0->1 .55s back.out(3); rule scaleX 0->1 .7s delay .05 expo.out; lines yPercent 115->0 .8s delay .12 stagger .05 expo.out. Hide: fade out .3s power2.out.

FLAT HEADINGS (not isometric)
Top-left (left clamp(18px,5.5vw,96px), top clamp(40px,9vh,110px)): term "archive:" (clamp(12px,1.1vw,17px), weight 500, #8b8b86, margin-bottom .7em) and word on two lines "objects, rooms" / "& images" (clamp(30px,4.2vw,66px), weight 500, line-height 1, letter-spacing -.03em, #1b1b1a).
Bottom-right (right clamp(18px,5vw,90px), bottom clamp(40px,9vh,120px), width min(20em,44vw)): "index:", "30 projects" (clamp(26px,3.3vw,52px)), caps hint "Hover to slow · click to open" ("Drag to scroll · tap to open" on coarse pointers), #6f6f6a. Fade in 1.2s after .5s. Phones (<600px): top 72px, bottom 56px.

ACCESSIBILITY
Visually hidden h1 and a hidden <nav> with one button per project that presents its nearest visible card (or opens the page directly). Wait up to 1.5s for fonts before the first layout.

Give me all files complete, then the command to run: python dev-server.py 8095 and open http://localhost:8095.
````
