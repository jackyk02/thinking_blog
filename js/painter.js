/* The painter shared by the cover (js/hero.js) and the figures: every painting on the page paints itself the same way.

   A painting is a list of layers, one per brush mark, each with a box, a per-pixel alpha and a per-pixel reveal order.
   A layer grows in along its order (out from where the brush lands for a wash, along the path for a line) with a
   soft front, and finished layers are committed in order, so the last frame is exactly the painting.

   Where the layers come from:
     · A real p5.brush sketch (capture): the sketch runs with every brush call queued and tagged with its source
       line, then the queue runs for real one draw call at a time. p5.brush batches paint exactly as in a one-shot
       run; after each call we read the canvas and p5.brush's mask buffers, and when a batch is composited the change
       is split between its calls by how much each added to the masks. The cover uses this on flower.js, and
       Painter.paint(canvas, { sketch: 'some_sketch.js' }) does the same for any sketch in a hidden iframe.
     · A finished image without its sketch (js/strokes.js, in a Web Worker): washes, then curved strokes coarse to
       fine, rebuilt from the image, and a short settle onto the exact image at the end.

   Painter.paint(canvas, src | { sketch }, { from, speed, max, res, delay, onFrame, fit }) → job   (fit: a sketch's length, s)
     from: 'paper' (default: the cover's paper, then the painting's own), 'blank' (empty; the paper fades in like the
     cover's background call), or an <img>/<canvas> to paint over (the canvas itself keeps what it shows).
     wash: true with an <img>/<canvas>: a new painting, not a revision; paper is washed over the old one first.
     job: { ready, done (true when finished, false if cancelled), total, layers, groups, time(), pause(), resume(), cancel(toEnd) }
   One shared rAF loop drives every job; a job whose canvas is off screen does not advance. */
window.Painter = (function () {
  'use strict';
  const HERO_PAPER = [244, 241, 232];
  const ease = { out: t => 1 - Math.pow(1 - t, 2.2), inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, smooth: t => t * t * (3 - 2 * t) };
  const EASES = [ease.out, ease.inOut, ease.smooth];
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '');

  /* ---------- compositing one layer at progress p (0..1) onto RGBA pixels ---------- */
  function apply(l, p, dst, W) {
    if (l.rgba && l.order) return applyCaptured(l, p, dst, W);
    if (l.rgba) return applyImage(l, p, dst, W);
    if (l.A) return applyMark(l, p, dst, W);
    return applyFlat(l, p, dst, W);
  }
  // a captured sketch call: per-pixel colour, and the alpha that takes "before" to "after" (exact at p = 1)
  function applyCaptured(l, prog, dst, W) {
    const { x, y, w, h, alpha, rgba, order, feather } = l, s = prog * (1 + feather), inv = 1 / feather;
    for (let r = 0, i = 0; r < h; r++) for (let c = 0, o = ((y + r) * W + x) * 4; c < w; c++, i++, o += 4) {
      const al = alpha[i]; if (!al) continue;
      let g = (s - order[i]) * inv; if (g <= 0) continue; g = g >= 1 ? 1 : g * g * (3 - 2 * g);
      const a = al * g, j = i * 4;
      if (dst[o + 3] === 0) { dst[o] = rgba[j]; dst[o + 1] = rgba[j + 1]; dst[o + 2] = rgba[j + 2]; dst[o + 3] = rgba[j + 3] * a }
      else { dst[o] += (rgba[j] - dst[o]) * a; dst[o + 1] += (rgba[j + 1] - dst[o + 1]) * a; dst[o + 2] += (rgba[j + 2] - dst[o + 2]) * a; dst[o + 3] += (rgba[j + 3] - dst[o + 3]) * a }
    }
  }
  // a reconstructed mark: one colour, byte alpha and order in the plan's shared buffers
  function applyMark(l, prog, dst, W) {
    const { x, y, w, h, off, c, f, A, O } = l, s = prog * (1 + f) * 255, inv = 1 / (f * 255), R = c[0], G = c[1], B = c[2];
    for (let r = 0, i = off; r < h; r++) for (let k = 0, o = ((y + r) * W + x) * 4; k < w; k++, i++, o += 4) {
      const al = A[i]; if (!al) continue;
      let g = (s - O[i]) * inv; if (g <= 0) continue; g = g >= 1 ? 1 : g * g * (3 - 2 * g);
      const a = al * g / 255;
      dst[o] += (R - dst[o]) * a; dst[o + 1] += (G - dst[o + 1]) * a; dst[o + 2] += (B - dst[o + 2]) * a; dst[o + 3] += (255 - dst[o + 3]) * a;
    }
  }
  // the exact image over everything (the settle), and a flat sheet of paper (the background call)
  function applyImage(l, a, dst) { const im = l.rgba; for (let i = 0; i < im.length; i++) dst[i] += (im[i] - dst[i]) * a }
  function applyFlat(l, a, dst, W) {
    const { x, y, w, h, c } = l;
    for (let r = 0; r < h; r++) for (let k = 0, o = ((y + r) * W + x) * 4; k < w; k++, o += 4) { dst[o] += (c[0] - dst[o]) * a; dst[o + 1] += (c[1] - dst[o + 1]) * a; dst[o + 2] += (c[2] - dst[o + 2]) * a; dst[o + 3] += (255 - dst[o + 3]) * a }
  }

  /* ---------- playback of timed layers onto a 2D canvas ----------
     render(T): commit the layers finished by T (in order), then draw the ones in flight over them. Only the boxes
     that changed are copied and put. An optional overlay canvas shows a full-canvas 'fade' layer with CSS opacity. */
  function Renderer(ctx, W, H, base, over) {
    const settled = new Uint8ClampedArray(W * H * 4), work = new ImageData(W, H);
    if (base) settled.set(base); work.data.set(settled); ctx.putImageData(work, 0, 0);
    const octx = over && over.getContext('2d'), shown = new Set();
    const R = { layers: [], li: 0, settled, work };
    const prog = (l, T) => l.ease(Math.min(1, (T - l.t0) / (l.t1 - l.t0)));
    R.render = T => {
      const L = R.layers; let rx0 = W, ry0 = H, rx1 = 0, ry1 = 0;
      const dirty = l => { if (l.x < rx0) rx0 = l.x; if (l.y < ry0) ry0 = l.y; if (l.x + l.w > rx1) rx1 = l.x + l.w; if (l.y + l.h > ry1) ry1 = l.y + l.h };
      while (R.li < L.length && L[R.li].t1 <= T) {
        const l = L[R.li++]; apply(l, 1, settled, W); dirty(l);
        if (l.kind === 'fade' && octx) over.style.opacity = 0;
      }
      const live = [];
      for (let k = R.li; k < L.length && L[k].t0 <= T; k++) {
        const l = L[k];
        if (l.kind === 'fade' && octx) { if (!shown.has(l)) { octx.putImageData(l.img || (l.img = new ImageData(l.rgba, l.w, l.h)), l.x, l.y); shown.add(l) } over.style.opacity = prog(l, T); continue }
        live.push(l); dirty(l);
      }
      if (rx1 <= rx0) return;
      const d = work.data;
      for (let y = ry0; y < ry1; y++) d.set(settled.subarray((y * W + rx0) * 4, (y * W + rx1) * 4), (y * W + rx0) * 4);
      for (const l of live) apply(l, prog(l, T), d, W);
      ctx.putImageData(work, 0, 0, rx0, ry0, rx1 - rx0, ry1 - ry0);
    };
    R.done = () => R.li >= R.layers.length;
    // start again from the first layer: from `base`, or keep the picture (a first 'fade' layer covers it)
    R.reset = (base, keep) => { R.li = 0; shown.clear(); if (!keep && base) { settled.set(base); work.data.set(base); ctx.putImageData(work, 0, 0) } };
    // jump to the end
    R.finish = () => { while (R.li < R.layers.length) apply(R.layers[R.li++], 1, settled, W); work.data.set(settled); ctx.putImageData(work, 0, 0); if (octx) over.style.opacity = 0 };
    return R;
  }

  /* ---------- capture: a p5.brush sketch → one layer per brush call ---------- */
  const WRAP = ['pick', 'stroke', 'strokeWeight', 'noStroke', 'fill', 'noFill', 'bleed', 'fillTexture', 'hatch', 'noHatch', 'set', 'scaleBrushes',
                'field', 'noField', 'line', 'polygon', 'circle', 'rect', 'flowLine', 'spline', 'plot'];
  const DRAWS = new Set(['background', 'line', 'polygon', 'circle', 'rect', 'flowLine', 'spline', 'plot']);

  // Install on `win` (the page, or an iframe) after the sketch script and before p5 starts. Resolves to
  // { cv, W, H, Q, recs, C0, total } (recs: one per draw call, with its layers), or { static: true } with reduce.
  function capture(win, file, o) {
    o = o || {};
    const brush = win.brush, REDUCE = !!o.reduce;
    const SRC = new RegExp(file.replace(/^.*\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+):\\d+');
    const lineOf = () => { const m = (new Error().stack || '').match(SRC); return m ? +m[1] : 0 };
    const Q = [], ORIG = {}, graphics = [];
    let realBg, realCG, cv, W = 0, H = 0, N = 0, DENS = 1;
    return new Promise((resolve, reject) => {
      const userSetup = win.setup;
      if (typeof userSetup !== 'function' || !brush) { reject(new Error('no sketch')); return }
      win.setup = function () {
        try {
          win.pixelDensity(o.density || Math.min(2, win.displayDensity()));
          realBg = win.background; realCG = win.createGraphics;
          // p5.brush.load() makes its mask buffers through the global createGraphics; keep hold of them
          win.createGraphics = function (...a) { const g = realCG.apply(this, a); graphics.push(g); return g };
          // with reduced motion the calls run straight through (a plain one-shot render); otherwise they are queued
          win.background = (...a) => { Q.push({ name: 'background', args: a, line: lineOf() }); if (REDUCE) realBg(...a) };
          WRAP.forEach(k => { if (typeof brush[k] === 'function') { ORIG[k] = brush[k]; brush[k] = (...a) => { Q.push({ name: k, args: a, line: lineOf() }); if (REDUCE) ORIG[k](...a) } } });
          userSetup();
          win.background = realBg; WRAP.forEach(k => { if (ORIG[k]) brush[k] = ORIG[k] });
          if (REDUCE) win.createGraphics = realCG;
          win.noLoop(); // no per-frame flushes: p5.brush only composites where the sketch itself would
          cv = win.document.getElementById('defaultCanvas0') || win.document.querySelector('canvas.p5Canvas');
          W = cv.width; H = cv.height; N = W * H; DENS = W / win.width;
          const info = { cv, W, H, Q, total: Q.filter(c => DRAWS.has(c.name)).length };
          if (o.onSetup) o.onSetup(info);
          // reduced motion: after p5.brush's own flush at the end of setup, the canvas holds the finished painting
          setTimeout(() => REDUCE ? resolve(Object.assign(info, { static: true })) : precompute(info), 0);
        } catch (e) { reject(e) }
      };

      const scratch = document.createElement('canvas'), scratchA = document.createElement('canvas'); let sctx, actx;
      function readCanvas() {
        if (!sctx) { scratch.width = W; scratch.height = H; sctx = scratch.getContext('2d', { willReadFrequently: true }); sctx.globalCompositeOperation = 'copy' }
        sctx.drawImage(cv, 0, 0); return sctx.getImageData(0, 0, W, H).data;
      }
      function readAlpha(g) {
        const out = new Uint8Array(N); if (!g) return out;
        // copy through our own canvas: reading p5.brush's buffers directly would push them onto the slow CPU path
        if (!actx) { scratchA.width = W; scratchA.height = H; actx = scratchA.getContext('2d', { willReadFrequently: true }); actx.globalCompositeOperation = 'copy' }
        actx.drawImage(g.elt || g.canvas, 0, 0); const d = actx.getImageData(0, 0, W, H).data;
        for (let i = 0, j = 3; i < N; i++, j += 4) out[i] = d[j];
        return out;
      }
      let masks = null; const cleared = [false, false, false];
      function findMasks() {
        // p5.brush.load() creates [fill mask (2D), image-brush mask (WEBGL), stroke mask (2D)]
        if (masks || graphics.length < 3) return;
        masks = graphics.slice(-3);
        masks.forEach((g, i) => { const c = g.clear.bind(g); g.clear = (...a) => { cleared[i] = true; return c(...a) } });
      }
      const runCall = c => c.name === 'background' ? realBg(...c.args) : ORIG[c.name](...c.args);
      const recs = [];
      function precompute(info) {
        findMasks();
        let qi = 0, prevC = readCanvas(), prevA0 = new Uint8Array(N), prevA2 = new Uint8Array(N), pending = [];
        const C0 = prevC;
        const step = () => {
          try {
            cleared[0] = cleared[1] = cleared[2] = false;
            let call = null;
            while (qi < Q.length) { const c = Q[qi++]; runCall(c); findMasks(); if (DRAWS.has(c.name)) { call = c; break } }
            if (!call) { brush.reBlend(); win.createGraphics = realCG } // end of sketch: the flush p5.brush does after setup()
            const C = readCanvas(), A0 = readAlpha(masks && masks[0]), A2 = readAlpha(masks && masks[2]);
            const rec = call ? { call, layers: [] } : null; if (rec) recs.push(rec);
            // what this call added to p5.brush's masks (its pending paint)
            let w = null;
            if (rec) {
              const b0 = cleared[0] ? null : prevA0, b2 = cleared[2] ? null : prevA2;
              for (let i = 0; i < N; i++) {
                const v = Math.max(0, A0[i] - (b0 ? b0[i] : 0)) + Math.max(0, A2[i] - (b2 ? b2[i] : 0));
                if (v) { (w || (w = new Uint8Array(N)))[i] = v > 255 ? 255 : v }
              }
            }
            if (changed(prevC, C)) {
              if (pending.length) emit(pending, prevC, C);
              else if (rec) emit([{ rec, w: null }], prevC, C); // painted straight onto the canvas (background)
              pending = [];
            }
            if (w) pending.push({ rec, w });
            prevC = C; prevA0 = A0; prevA2 = A2;
            if (call) setTimeout(step, 0);
            else resolve(Object.assign(info, { recs, C0, final: C }));
          } catch (e) { reject(e) }
        };
        step();
      }
      function changed(a, b) { const x = new Uint32Array(a.buffer), y = new Uint32Array(b.buffer); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return true; return false }

      // A composite turned B into F. Share each changed pixel between the calls in the batch, in order.
      function emit(P, B, F) {
        const b = new Uint32Array(B.buffer), f = new Uint32Array(F.buffer), n = P.length, last = n - 1;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) if (b[i] !== f[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
        if (x1 < 0) return;
        const bb = P.map(() => [W, H, -1, -1]);
        const grow = (k, x, y) => { const r = bb[k]; if (x < r[0]) r[0] = x; if (x > r[2]) r[2] = x; if (y < r[1]) r[1] = y; if (y > r[3]) r[3] = y };
        const wt = (k, i) => P[k].w ? P[k].w[i] : 1;
        for (let y = y0; y <= y1; y++) for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
          if (b[i] === f[i]) continue;
          let any = false; for (let k = 0; k < n; k++) if (wt(k, i)) { grow(k, x, y); any = true }
          if (!any) grow(last, x, y);
        }
        const L = bb.map((r, k) => {
          if (r[2] < 0) return null;
          const w = r[2] - r[0] + 1, h = r[3] - r[1] + 1;
          return { x: r[0], y: r[1], w, h, alpha: new Float32Array(w * h), rgba: new Uint8ClampedArray(w * h * 4), rec: P[k].rec };
        });
        for (let y = y0; y <= y1; y++) for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
          if (b[i] === f[i]) continue;
          let T = 0; for (let k = 0; k < n; k++) T += wt(k, i);
          let cum = 0;
          for (let k = 0; k < n; k++) {
            const v = T ? wt(k, i) : (k === last ? 1 : 0); if (!v) continue;
            const before = cum / (T || 1); cum += v; const after = cum / (T || 1);
            const l = L[k], j = (y - l.y) * l.w + (x - l.x);
            // alpha that takes "before" to "after" when drawn over what is already there; the last share is always 1
            l.alpha[j] = after >= 1 ? 1 : (after - before) / (1 - before);
            l.rgba[j * 4] = F[i * 4]; l.rgba[j * 4 + 1] = F[i * 4 + 1]; l.rgba[j * 4 + 2] = F[i * 4 + 2]; l.rgba[j * 4 + 3] = F[i * 4 + 3];
          }
        }
        L.forEach(l => { if (l) { shape(l); l.rec.layers.push(l) } });
      }

      // Reveal order for every pixel of a layer (0 = first): out from where the brush starts, along the path for lines
      const px = (x, y) => [(x + win.width / 2) * DENS, (y + win.height / 2) * DENS]; // WEBGL sketches draw around the centre
      function shape(l) {
        const c = l.rec.call, a = c.args, name = c.name;
        let path = null, og = null;
        if (name === 'line') path = [px(a[0], a[1]), px(a[2], a[3])];
        else if (name === 'spline' && Array.isArray(a[0])) path = a[0].map(p => px(p[0], p[1]));
        else if (name === 'polygon' && Array.isArray(a[0]) && a[0][0]) og = px(a[0][0][0], a[0][0][1]);
        else if (name === 'circle' || name === 'rect' || name === 'flowLine' || name === 'plot') { const i = name === 'plot' ? 1 : 0; if (typeof a[i] === 'number') og = px(a[i], a[i + 1]) }
        const ord = new Float32Array(l.w * l.h);
        l.kind = name === 'background' ? 'fade' : path ? 'path' : 'wash';
        if (l.kind === 'fade') { l.order = ord; l.feather = 1; return }
        if (path) {
          // cumulative length along the path; order = how far along it the nearest point is
          const segs = []; let len = 0;
          for (let k = 1; k < path.length; k++) { const [ax, ay] = path[k - 1], [bx, by] = path[k], d = Math.hypot(bx - ax, by - ay); segs.push([ax, ay, bx - ax, by - ay, d, len]); len += d }
          for (let y = 0, j = 0; y < l.h; y++) for (let x = 0; x < l.w; x++, j++) {
            if (!l.alpha[j]) continue;
            const X = l.x + x, Y = l.y + y; let best = 1e9, at = 0;
            for (const [ax, ay, dx, dy, d, s0] of segs) {
              const t = d ? Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / (d * d))) : 0, ex = ax + dx * t - X, ey = ay + dy * t - Y, e = ex * ex + ey * ey;
              if (e < best) { best = e; at = s0 + d * t }
            }
            ord[j] = len ? at / len : 0;
          }
          l.feather = .1;
        } else {
          // a wash spreads out from the first point of the shape (or its middle) with a ragged wet edge
          if (!og || og[0] < l.x - l.w * .25 || og[0] > l.x + l.w * 1.25 || og[1] < l.y - l.h * .25 || og[1] > l.y + l.h * 1.25) og = [l.x + l.w / 2, l.y + l.h / 2];
          let max = 0;
          for (let y = 0, j = 0; y < l.h; y++) for (let x = 0; x < l.w; x++, j++) if (l.alpha[j]) { const d = Math.hypot(l.x + x - og[0], l.y + y - og[1]); ord[j] = d; if (d > max) max = d }
          const s = 1 / (14 * DENS);
          for (let y = 0, j = 0; y < l.h; y++) for (let x = 0; x < l.w; x++, j++) if (l.alpha[j]) {
            const X = (l.x + x) * s, Y = (l.y + y) * s, nz = .65 * vnoise(X, Y) + .35 * vnoise(X * 2.3 + 17, Y * 2.3 + 5);
            ord[j] = Math.min(1, .82 * ord[j] / (max || 1) + .18 * nz);
          }
          l.feather = .3;
        }
        l.order = ord;
      }
    });
  }
  const NG = 64, GRID = Float32Array.from({ length: NG * NG }, Math.random);
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, X0 = xi & 63, X1 = (xi + 1) & 63, Y0 = (yi & 63) * NG, Y1 = ((yi + 1) & 63) * NG;
    const a = GRID[Y0 + X0], b = GRID[Y0 + X1], c = GRID[Y1 + X0], d = GRID[Y1 + X1], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /* The cover's pacing for captured calls. k scales every duration (the cover runs at k < 1). pass(line) gives the
     time spent on a code line with no brush call (the cover's code panel); without it the calls run back to back.
     Returns segs (one per code line passed or call made, for a code panel), the timed layers and tPaint. */
  const SET = .14, SLOT = { background: .7, circle: .65, polygon: .3, line: .7, spline: .7 }, REVEAL = { background: 1, circle: 1.1, polygon: .75, line: .9, spline: .9 };
  function timeline(cap, o) {
    o = o || {};
    const k = o.k || 1, segs = [], layers = []; let t = 0, cur = 0, di = 0, lastEnd = 0;
    const passTo = to => { if (!o.pass) return; for (let ln = cur + 1; ln < to; ln++) { segs.push({ t0: t, line: ln }); t += o.pass(ln) * k } };
    for (const c of cap.Q) {
      const ln = c.line || cur;
      if (ln > cur + 1) passTo(ln);
      cur = Math.max(cur, ln);
      if (DRAWS.has(c.name)) {
        const rec = cap.recs[di++], has = rec && rec.layers.length;
        segs.push({ t0: t, line: ln, draw: rec, k: di });
        if (has) for (const l of rec.layers) {
          l.t0 = t; l.t1 = Math.max(t + (REVEAL[c.name] || .9) * k, lastEnd + .01); lastEnd = l.t1; // finish in order
          l.ease = l.kind === 'path' ? ease.inOut : l.kind === 'fade' ? ease.smooth : ease.out; layers.push(l);
        }
        t += (has ? (SLOT[c.name] || .5) : .25) * k;
      } else if (o.pass) { segs.push({ t0: t, line: ln }); t += SET * k }
    }
    if (o.lines) passTo(o.lines + 1);
    return { segs, layers, tPaint: Math.max(t, lastEnd) };
  }

  /* ---------- plans: where a job's layers come from ---------- */
  const imgs = new Map();
  function load(src) {
    if (!imgs.has(src)) { const im = new Image(); im.decoding = 'async'; im.src = src; const p = im.decode().then(() => im); p.catch(() => imgs.delete(src)); imgs.set(src, p) }
    return imgs.get(src);
  }
  function pixelsOf(im, S) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, S, S);
    return x.getImageData(0, 0, S, S).data;
  }
  // the stroke worker (js/strokes.js); on file:// or without workers the same code runs here
  let worker = null, wseq = 0, local = null;
  const waiting = new Map();
  function getWorker() {
    if (worker === null) {
      try {
        worker = new Worker(BASE + 'strokes.js');
        worker.onmessage = e => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data) } };
        worker.onerror = () => { worker = false; const ws = [...waiting.values()]; waiting.clear(); ws.forEach(w => w({ retry: true })) };
      } catch (e) { worker = false }
    }
    return worker;
  }
  function localPlanner() {
    if (!local) local = new Promise((res, rej) => { if (window.StrokePlan) return res(window.StrokePlan); const s = document.createElement('script'); s.src = BASE + 'strokes.js'; s.onload = () => res(window.StrokePlan); s.onerror = rej; document.head.appendChild(s) });
    return local;
  }
  function askWorker(msg, transfer) {
    const w = getWorker();
    if (!w) return localPlanner().then(P => ({ plan: P.plan(msg.key, msg.pixels && new Uint8ClampedArray(msg.pixels), msg.N, msg.S) }));
    return new Promise(res => { const id = ++wseq; waiting.set(id, res); w.postMessage(Object.assign({ id }, msg), transfer || []) })
      .then(r => r.retry ? askWorker(msg) : r);
  }
  // one plan is made at a time; a painting that is about to play goes ahead of the ones being prefetched
  const plans = new Map(), MAXP = 10, queue = []; let busy = false;
  function pump() {
    if (busy || !queue.length) return;
    busy = true; const t = queue.shift(); t.queued = false;
    t.run().then(t.ok, t.fail).then(() => { busy = false; pump() });
  }
  function imagePlan(src, S, urgent) {
    const key = src + '|' + S; let p = plans.get(key);
    if (p) {
      plans.delete(key); plans.set(key, p);
      if (urgent && p.task.queued) { queue.splice(queue.indexOf(p.task), 1); queue.unshift(p.task) }
      return p;
    }
    const task = { queued: true };
    p = new Promise((ok, fail) => { task.ok = ok; task.fail = fail });
    task.run = () => load(src).then(im => {
      const N = Math.min(420, im.naturalWidth || 420), pix = pixelsOf(im, N).buffer;
      return askWorker({ key: src + '|' + N, N, pixels: pix, S }, [pix]).then(r => {
        if (r.error || !r.plan) throw new Error(r.error || 'no plan');
        const P = r.plan, A = new Uint8Array(P.A), O = new Uint8Array(P.O);
        const layers = P.layers.map(l => Object.assign(l, l.kind === 'settle' ? { rgba: pixelsOf(im, S) } : { A, O }, { ease: EASES[l.e] }));
        return { S, W: S, H: S, paper: P.paper, layers, total: P.total, err: P.err };
      });
    });
    p.task = task;
    p.catch(() => plans.delete(key));
    plans.set(key, p); while (plans.size > MAXP) plans.delete(plans.keys().next().value);
    if (urgent) queue.unshift(task); else queue.push(task);
    pump();
    return p;
  }
  // a real sketch, run in a hidden same-origin iframe with the page's p5 and p5.brush, captured like the cover
  const sketches = new Map();
  function sketchPlan(url, o) {
    if (sketches.has(url)) return sketches.get(url);
    const lib = re => { const s = [...document.scripts].find(x => re.test(x.src)); return s && s.src };
    const p5src = lib(/\/p5(\.min)?\.js/), brsrc = lib(/p5\.brush/);
    const p = new Promise((resolve, reject) => {
      if (!p5src || !brsrc) { reject(new Error('p5 / p5.brush not on the page')); return }
      const fr = document.createElement('iframe');
      fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
      fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;height:600px;border:0;visibility:hidden;pointer-events:none';
      const id = 'pc' + Math.random().toString(36).slice(2);
      Painter._hooks = Painter._hooks || {};
      Painter._hooks[id] = win => capture(win, url, { density: (o && o.density) || 1 }).then(cap => {
        // the cover's pacing, fitted into the figures' few seconds (o.fit, in seconds at speed 1)
        const tl = timeline(cap), k = Math.min(1, ((o && o.fit) || 3.8) / Math.max(.1, tl.tPaint));
        tl.layers.forEach(l => { l.t0 *= k; l.t1 *= k });
        resolve({ W: cap.W, H: cap.H, layers: tl.layers, total: tl.tPaint * k + .1, base: cap.C0, final: cap.final, capture: cap });
        setTimeout(() => fr.remove(), 0);
      }, e => { reject(e); fr.remove() });
      fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>` +
        `<script src="${p5src}"><\/script><script src="${brsrc}"><\/script><script src="${new URL(url, location.href).href}"><\/script>` +
        `<script>parent.Painter._hooks[${JSON.stringify(id)}](window)<\/script></body></html>`;
      document.body.appendChild(fr);
    });
    p.catch(() => sketches.delete(url));
    sketches.set(url, p);
    return p;
  }
  const resFor = (el, max) => Math.round(Math.min(max || 420, Math.max(96, (el.getBoundingClientRect().width || 160) * Math.min(2, window.devicePixelRatio || 1))));
  const prefetch = (src, el, max) => {
    const known = typeof src === 'string' && window.FIG && FIG.sketches && FIG.sketches[src];
    return typeof src === 'object' || known ? sketchPlan(known || src.sketch) : imagePlan(src, typeof el === 'number' ? el : resFor(el, max));
  };

  /* ---------- jobs, all driven by one rAF loop ---------- */
  const jobs = new Set(); let raf = 0, last = 0;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { e.target.__pvVis = e.isIntersecting; if (e.isIntersecting) kick() }), { rootMargin: '60px' }) : null;
  function loop(ts) {
    const dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
    for (const j of [...jobs]) if (j.canvas.__pvVis !== false) j._tick(dt);
    raf = jobs.size ? requestAnimationFrame(loop) : (last = 0, 0);
  }
  function kick() { if (!raf && jobs.size) { last = 0; raf = requestAnimationFrame(loop) } }

  const GROUPS = ['paper', 'washes', 'broad strokes', 'strokes', 'details', 'settle'];
  function paint(canvas, src, o) {
    o = o || {};
    // a painting whose sketch is listed in FIG.sketches (js/figures/data.js) is replayed from it, like the cover
    const known = typeof src === 'string' && window.FIG && FIG.sketches && FIG.sketches[src];
    if (known) src = { sketch: known, image: src };
    const isSketch = src && typeof src === 'object' && src.sketch;
    let S = o.res || resFor(canvas, o.max);
    const speed = o.speed || 1, ctx = canvas.getContext('2d');
    if (o.from === canvas && canvas.width !== S) o = Object.assign({}, o, { from: 'paper' }); // a resize clears the canvas
    const from = o.from === 'blank' ? 'blank' : o.from && o.from !== 'paper' ? o.from : 'paper', over = from !== 'paper' && from !== 'blank' && !o.wash;
    const start = (W, H) => {
      if (canvas.width !== W) canvas.width = W; if (canvas.height !== H) canvas.height = H;
      if (from === canvas) return;
      ctx.clearRect(0, 0, W, H);
      if (from === 'paper') { ctx.fillStyle = `rgb(${HERO_PAPER})`; ctx.fillRect(0, 0, W, H) }
      else if (from !== 'blank') { try { ctx.drawImage(from, 0, 0, W, H) } catch (e) { ctx.fillStyle = `rgb(${HERO_PAPER})`; ctx.fillRect(0, 0, W, H) } }
    };
    if (!isSketch) start(S, S);

    let R = null, T = 0, resolve, finished = false;
    const job = { canvas, src, paused: false, total: 0, layers: [], groups: [] };
    job.done = new Promise(r => { resolve = r });
    const end = ok => { if (finished) return; finished = true; jobs.delete(job); if (io) io.unobserve(canvas); R = null; resolve(ok) };
    job.ready = (isSketch ? sketchPlan(src.sketch, o) : imagePlan(src, S, true)).then(P => {
      if (finished) return P;
      let L;
      if (isSketch) {
        start(P.W, P.H);
        if (from === 'blank' || from === 'paper') { ctx.clearRect(0, 0, P.W, P.H); ctx.putImageData(new ImageData(new Uint8ClampedArray(P.base), P.W, P.H), 0, 0) }
        L = P.layers;
      } else {
        // painting over another picture: the paper tone first where this one is bare; on paper: its own paper fades in
        L = P.layers.filter(l => l.kind !== 'ground' || over);
        if (!over) L = [{ kind: 'fade', g: 0, x: 0, y: 0, w: P.W, h: P.H, c: P.paper, t0: 0, t1: from === 'paper' ? .35 : .5, ease: ease.smooth }].concat(L);
      }
      R = Renderer(ctx, P.W, P.H, ctx.getImageData(0, 0, P.W, P.H).data, null);
      R.layers = L;
      job.total = P.total / speed;
      job.layers = L.map(l => ({ t0: l.t0 / speed, t1: l.t1 / speed, kind: l.kind, g: l.g }));
      const gs = []; job.layers.forEach(l => { if (l.g == null) return; const g = gs[l.g] || (gs[l.g] = { name: GROUPS[l.g], t0: l.t0, t1: l.t1 }); g.t0 = Math.min(g.t0, l.t0); g.t1 = Math.max(g.t1, l.t1) });
      job.groups = gs.filter(Boolean);
      if (o.delay) T = -o.delay * speed; // delay is in real seconds
      jobs.add(job); if (io) { canvas.__pvVis = undefined; io.observe(canvas) } kick();
      return P;
    });
    job.ready.catch(() => end(false));
    job._tick = dt => {
      if (job.paused || !R || finished) return;
      T += dt * speed; if (T < 0) return;
      R.render(T);
      if (o.onFrame) o.onFrame(T / speed, job); // real seconds, like job.layers and job.total
      if (R.done()) end(true);
    };
    job.time = () => T / speed;
    job.pause = () => { job.paused = true };
    job.resume = () => { job.paused = false; kick() };
    // cancel(true) jumps to the finished painting; cancel(false) leaves the canvas as it is
    job.cancel = toEnd => {
      if (finished) return;
      if (toEnd && R) R.finish();
      else if (toEnd && (!isSketch || src.image)) load(isSketch ? src.image : src).then(im => { canvas.width = canvas.height = S; ctx.drawImage(im, 0, 0, S, S) }).catch(() => {});
      end(false);
    };
    return job;
  }

  const api = { paint, prefetch, load, resFor, capture, timeline, Renderer, apply, ease, vnoise, HERO_PAPER, DRAWS, _plan: imagePlan, _sketch: sketchPlan };
  return api;
})();
