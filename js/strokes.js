/* Brush strokes for a finished painting we have no sketch for. Runs in a Web Worker (js/painter.js starts it);
   loaded as a plain script it defines self.StrokePlan for a main-thread fallback.

   The image is rebuilt the way a watercolour is painted, coarse to fine, as a list of brush marks:
     1. Washes: k-means on a heavily blurred copy finds the painting's dominant colours; each large connected region
        of one colour becomes a translucent wash with a ragged edge and a darker rim, spreading from where the brush
        lands (one end of the region's long axis, or the top for a sky).
     2. Strokes (after Hertzmann, "Painterly rendering with curved brush strokes", 1998), two sizes then a fine pass:
        where the painting-so-far still differs from a blurred copy of the image (blur ~ brush size), a stroke starts
        at the worst spot, takes that copy's colour and follows the edges (the structure tensor's tangent), bending
        smoothly, until the colour under it changes or the canvas there is already closer. Each mark is drawn onto
        the analysis canvas before the next is chosen, so later marks only go where they are still needed.
     3. Each mark becomes a layer in the cover's format (js/hero.js): a box, a per-pixel alpha and a per-pixel
        reveal order. Strokes reveal along their path (with a tapered, slightly streaky body and a darker rim),
        washes spread out from their start with a wet ragged front. A last "settle" layer brings the exact image in.
   Marks are grouped by colour, lights before darks, and ordered so the brush moves to nearby work.

   Message in:  { id, key, N, pixels (RGBA ArrayBuffer, N×N), S }   (pixels may be omitted once the key is cached)
   Message out: { id, plan: { S, paper, layers: [...], A (alpha bytes), O (order bytes), total } } */
(function (G) {
  'use strict';

  /* ---------- seeded value noise ---------- */
  function Noise(seed) {
    let sd = (seed >>> 0) % 2147483646 + 1;
    const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647, NG = 64, g = new Float32Array(NG * NG);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const f = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, X0 = xi & 63, X1 = (xi + 1) & 63, Y0 = (yi & 63) * NG, Y1 = ((yi + 1) & 63) * NG;
      const a = g[Y0 + X0], b = g[Y0 + X1], c = g[Y1 + X0], d = g[Y1 + X1], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
    f.rnd = rnd;
    return f;
  }
  const smooth = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t) };

  /* ---------- image helpers ---------- */
  // three box passes ≈ gaussian; C channels, interleaved
  function blur(src, W, H, C, r) {
    r = Math.round(r); if (r < 1) return Float32Array.from(src);
    const a = Float32Array.from(src), b = new Float32Array(src.length), inv = 1 / (2 * r + 1);
    const pass = (from, to, horiz) => {
      const L = horiz ? W : H, M = horiz ? H : W;
      for (let m = 0; m < M; m++) for (let c = 0; c < C; c++) {
        const at = horiz ? k => ((m * W + k) * C + c) : k => ((k * W + m) * C + c);
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += from[at(k < 0 ? 0 : k >= L ? L - 1 : k)];
        for (let k = 0; k < L; k++) {
          to[at(k)] = acc * inv;
          acc += from[at(Math.min(L - 1, k + r + 1))] - from[at(Math.max(0, k - r))];
        }
      }
    };
    for (let p = 0; p < 3; p++) { pass(a, b, true); pass(b, a, false) }
    return a;
  }
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4) }
  const fl = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  function lab(r, g, b) {
    const R = LIN[Math.max(0, Math.min(255, r | 0))], Gg = LIN[Math.max(0, Math.min(255, g | 0))], B = LIN[Math.max(0, Math.min(255, b | 0))];
    const x = fl((.4124 * R + .3576 * Gg + .1805 * B) / .9505), y = fl(.2126 * R + .7152 * Gg + .0722 * B), z = fl((.0193 * R + .1192 * Gg + .9505 * B) / 1.089);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const HERO_PAPER = [244, 241, 232]; // the cover sketch's background("#f4f1e8")
  function paperOf(I, N) {
    // the lightest third of the border; a painting with no paper showing gets the cover's paper
    const px = [], m = Math.max(2, Math.round(N * .03));
    for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) if (x < m || y < m || x >= N - m || y >= N - m) { const o = (y * N + x) * 3; px.push([I[o], I[o + 1], I[o + 2], I[o] * .3 + I[o + 1] * .59 + I[o + 2] * .11]) }
    px.sort((a, b) => b[3] - a[3]);
    const top = px.slice(0, Math.max(1, px.length / 3 | 0)), c = [0, 1, 2].map(k => top.reduce((t, p) => t + p[k], 0) / top.length);
    const lum = c[0] * .3 + c[1] * .59 + c[2] * .11, w = lum >= 215 ? 0 : .75;
    return c.map((v, k) => Math.round(v + (HERO_PAPER[k] - v) * w));
  }
  function kmeans(P, n, K) {
    const C = new Float32Array(K * 3), lbl = new Uint8Array(n), dmin = new Float32Array(n).fill(1e9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) C[k] += P[i * 3 + k] / n;
    for (let c = 1; c < K; c++) {
      let best = 0, bi = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 3, q = (c - 1) * 3, d = (P[o] - C[q]) ** 2 + (P[o + 1] - C[q + 1]) ** 2 + (P[o + 2] - C[q + 2]) ** 2;
        if (d < dmin[i]) dmin[i] = d; if (dmin[i] > best) { best = dmin[i]; bi = i }
      }
      C[c * 3] = P[bi * 3]; C[c * 3 + 1] = P[bi * 3 + 1]; C[c * 3 + 2] = P[bi * 3 + 2];
    }
    const sum = new Float64Array(K * 3), cnt = new Uint32Array(K);
    for (let it = 0; it < 12; it++) {
      sum.fill(0); cnt.fill(0);
      for (let i = 0; i < n; i++) {
        const o = i * 3; let best = 1e12, bk = 0;
        for (let k = 0; k < K; k++) { const q = k * 3, d = (P[o] - C[q]) ** 2 + (P[o + 1] - C[q + 1]) ** 2 + (P[o + 2] - C[q + 2]) ** 2; if (d < best) { best = d; bk = k } }
        lbl[i] = bk; cnt[bk]++; sum[bk * 3] += P[o]; sum[bk * 3 + 1] += P[o + 1]; sum[bk * 3 + 2] += P[o + 2];
      }
      for (let k = 0; k < K; k++) if (cnt[k]) for (let j = 0; j < 3; j++) C[k * 3 + j] = sum[k * 3 + j] / cnt[k];
    }
    return { C, lbl };
  }
  function modeFilter(L, Gd) {
    const out = Int16Array.from(L), cnt = new Map();
    for (let y = 0; y < Gd; y++) for (let x = 0; x < Gd; x++) {
      cnt.clear(); let best = L[y * Gd + x], bn = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= Gd || Y >= Gd) continue;
        const v = L[Y * Gd + X], c = (cnt.get(v) || 0) + 1; cnt.set(v, c); if (c > bn) { bn = c; best = v }
      }
      if ((cnt.get(L[y * Gd + x]) || 0) < 3) out[y * Gd + x] = best;
    }
    return out;
  }
  function components(L, Gd) {
    const n = Gd * Gd, seen = new Uint8Array(n), stack = new Int32Array(n), out = [];
    for (let s = 0; s < n; s++) {
      if (seen[s] || L[s] < 0) continue;
      const lb = L[s], cells = []; let sp = 0; stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const c = stack[--sp], x = c % Gd; cells.push(c);
        const nb = [x > 0 ? c - 1 : -1, x < Gd - 1 ? c + 1 : -1, c - Gd, c + Gd];
        for (const q of nb) if (q >= 0 && q < n && !seen[q] && L[q] === lb) { seen[q] = 1; stack[sp++] = q }
      }
      out.push({ lb, cells, area: cells.length / n });
    }
    return out;
  }

  /* ---------- mark footprints (shared by the analysis canvas and the layers) ---------- */
  // A wash: a coarse cell mask, smoothed, sampled bilinearly, cut at 0.5 with a ragged (noisy) threshold.
  function washRaster(w, S, nz, wantOrder) {
    const Gd = w.g, f = S / Gd, ms = w.ms;
    const x0 = Math.max(0, Math.floor((w.bx0 - 1) * f)), y0 = Math.max(0, Math.floor((w.by0 - 1) * f));
    const x1 = Math.min(S, Math.ceil((w.bx1 + 2) * f)), y1 = Math.min(S, Math.ceil((w.by1 + 2) * f));
    const W = x1 - x0, H = y1 - y0, a = new Uint8Array(W * H), o = wantOrder ? new Uint8Array(W * H) : null;
    const sc = 22 / S, sc2 = 7 / S, sx = w.sx * S, sy = w.sy * S, dist = wantOrder ? new Float32Array(W * H) : null;
    let dmax = 1e-6;
    for (let y = 0, j = 0; y < H; y++) {
      const v = (y0 + y + .5) / f - .5, vi = Math.max(0, Math.min(Gd - 2, Math.floor(v))), fv = Math.max(0, Math.min(1, v - vi));
      for (let x = 0; x < W; x++, j++) {
        const u = (x0 + x + .5) / f - .5, ui = Math.max(0, Math.min(Gd - 2, Math.floor(u))), fu = Math.max(0, Math.min(1, u - ui));
        const m = (ms[vi * Gd + ui] * (1 - fu) + ms[vi * Gd + ui + 1] * fu) * (1 - fv) + (ms[(vi + 1) * Gd + ui] * (1 - fu) + ms[(vi + 1) * Gd + ui + 1] * fu) * fv;
        if (m < .15) continue;
        const X = x0 + x, Y = y0 + y;
        const vv = m + .2 * (nz(X * sc + w.seed, Y * sc) - .5) + .1 * (nz(X * sc * 3.1, Y * sc * 3.1 + w.seed) - .5);
        const aa = (vv - .4) / .045; if (aa <= 0) continue;
        const rim = 1 + .5 * (1 - smooth(.4, .62, vv)), mottle = .8 + .4 * nz(X * sc2 + 40 + w.seed, Y * sc2 + 9);
        const al = w.a * Math.min(1, aa) * rim * mottle;
        a[j] = al >= 1 ? 255 : Math.round(al * 255);
        if (wantOrder) { const d = w.sky ? Y : Math.hypot(X - sx, Y - sy); dist[j] = d; if (d > dmax) dmax = d }
      }
    }
    if (wantOrder) {
      const so = 1 / (S / 26);
      for (let j = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, j++) if (a[j]) {
        const n = .65 * nz((x0 + x) * so, (y0 + y) * so + 70) + .35 * nz((x0 + x) * so * 2.3 + 17, (y0 + y) * so * 2.3 + 5);
        o[j] = Math.round(255 * Math.min(1, .8 * dist[j] / dmax + .2 * n));
      }
    }
    return { x: x0, y: y0, w: W, h: H, a, o };
  }
  // A stroke: a tapered body swept along a polyline, with a darker rim, faint streaks along it and a ragged edge.
  function strokeRaster(st, S, nz, wantOrder) {
    const k = S / st.n, pts = st.pts.map(v => v * k), r = st.r * k, np = pts.length / 2;
    const segs = []; let len = 0;
    for (let i = 1; i < np; i++) { const ax = pts[i * 2 - 2], ay = pts[i * 2 - 1], bx = pts[i * 2], by = pts[i * 2 + 1], d = Math.hypot(bx - ax, by - ay); segs.push([ax, ay, bx - ax, by - ay, d, len]); len += d }
    if (!segs.length) segs.push([pts[0], pts[1], 0, 0, 0, 0]);
    const R = r * 1.2 + 1;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let i = 0; i < np; i++) { bx0 = Math.min(bx0, pts[i * 2]); bx1 = Math.max(bx1, pts[i * 2]); by0 = Math.min(by0, pts[i * 2 + 1]); by1 = Math.max(by1, pts[i * 2 + 1]) }
    const x0 = Math.max(0, Math.floor(bx0 - R)), y0 = Math.max(0, Math.floor(by0 - R)), x1 = Math.min(S, Math.ceil(bx1 + R + 1)), y1 = Math.min(S, Math.ceil(by1 + R + 1));
    const W = Math.max(0, x1 - x0), H = Math.max(0, y1 - y0), N = W * H;
    const dd = new Float32Array(N).fill(1e9), par = new Float32Array(N), side = new Float32Array(N);
    for (const [ax, ay, dx, dy, d, s0] of segs) {
      const sx0 = Math.max(x0, Math.floor(Math.min(ax, ax + dx) - R)), sx1 = Math.min(x1, Math.ceil(Math.max(ax, ax + dx) + R + 1));
      const sy0 = Math.max(y0, Math.floor(Math.min(ay, ay + dy) - R)), sy1 = Math.min(y1, Math.ceil(Math.max(ay, ay + dy) + R + 1));
      const dd2 = d * d;
      for (let Y = sy0; Y < sy1; Y++) for (let X = sx0; X < sx1; X++) {
        const px = X + .5 - ax, py = Y + .5 - ay, t = dd2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / dd2)) : 0;
        const ex = px - dx * t, ey = py - dy * t, e = ex * ex + ey * ey, j = (Y - y0) * W + (X - x0);
        if (e < dd[j]) { dd[j] = e; par[j] = s0 + d * t; side[j] = d ? (dx * py - dy * px) / d : ex }
      }
    }
    const a = new Uint8Array(N), o = wantOrder ? new Uint8Array(N) : null, sc = 1 / Math.max(2.5, r * .9), sd = st.seed;
    for (let j = 0; j < N; j++) {
      if (dd[j] > R * R) continue;
      const dist = Math.sqrt(dd[j]), u = len ? par[j] / len : 0;
      // brush pressure: lands a little narrow, full in the middle, lifts off thinner
      const press = len ? (.62 + .38 * smooth(0, .22, u)) * (1 - .42 * smooth(.72, 1, u)) : 1;
      const X = x0 + j % W, Y = y0 + (j / W | 0);
      const rr = r * press * (1 + .22 * (nz(X * sc + sd, Y * sc) - .5));
      const aa = rr + .6 - dist; if (aa <= 0) continue;
      const q = Math.min(1, dist / Math.max(.5, rr));
      const rim = .8 + .34 * smooth(.5, 1, q);
      const streak = len ? .84 + .32 * nz(side[j] / Math.max(.5, rr) * 2.6 + sd, u * 1.4 + sd * .37) : 1;
      const al = st.a * Math.min(1, aa) * rim * streak;
      a[j] = al >= 1 ? 255 : Math.round(al * 255);
      if (wantOrder) o[j] = Math.round(255 * (len ? Math.min(1, u * .94 + .06 * q) : q));
    }
    return { x: x0, y: y0, w: W, h: H, a, o };
  }
  function blendInto(C, N, lay, col) {
    for (let y = 0, j = 0; y < lay.h; y++) for (let x = 0; x < lay.w; x++, j++) {
      const al = lay.a[j]; if (!al) continue;
      const t = al / 255, o = ((lay.y + y) * N + lay.x + x) * 3;
      C[o] += (col[0] - C[o]) * t; C[o + 1] += (col[1] - C[o + 1]) * t; C[o + 2] += (col[2] - C[o + 2]) * t;
    }
  }

  /* ---------- analysis: the marks, in image pixels ---------- */
  function analyse(rgba, N) {
    const n = N * N, I = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { I[i * 3] = rgba[i * 4]; I[i * 3 + 1] = rgba[i * 4 + 1]; I[i * 3 + 2] = rgba[i * 4 + 2] }
    const nz = Noise(N * 7 + 11), paper = paperOf(I, N);
    const C = new Float32Array(n * 3); for (let i = 0; i < n; i++) { C[i * 3] = paper[0]; C[i * 3 + 1] = paper[1]; C[i * 3 + 2] = paper[2] }

    /* 1 · washes */
    const Gd = 48, f = N / Gd, R0 = blur(I, N, N, 3, N / 34), P = new Float32Array(Gd * Gd * 3), Prgb = new Float32Array(Gd * Gd * 3);
    for (let gy = 0; gy < Gd; gy++) for (let gx = 0; gx < Gd; gx++) {
      const o = (Math.min(N - 1, (gy + .5) * f | 0) * N + Math.min(N - 1, (gx + .5) * f | 0)) * 3, c = gy * Gd + gx, l = lab(R0[o], R0[o + 1], R0[o + 2]);
      P[c * 3] = l[0]; P[c * 3 + 1] = l[1]; P[c * 3 + 2] = l[2]; Prgb[c * 3] = R0[o]; Prgb[c * 3 + 1] = R0[o + 1]; Prgb[c * 3 + 2] = R0[o + 2];
    }
    const K = 6, km = kmeans(P, Gd * Gd, K), pl = lab(...paper);
    const isPaper = k => Math.hypot(km.C[k * 3] - pl[0], km.C[k * 3 + 1] - pl[1], km.C[k * 3 + 2] - pl[2]) < 4;
    let L = Int16Array.from(km.lbl, k => isPaper(k) ? -1 : k);
    L = modeFilter(modeFilter(L, Gd), Gd);
    const nbrs = c => { const x = c % Gd; return [x > 0 ? c - 1 : -1, x < Gd - 1 ? c + 1 : -1, c >= Gd ? c - Gd : -1, c < Gd * Gd - Gd ? c + Gd : -1] };
    // thin regions (the soft fringe around a shape, a band between two colours) join the colour they touch most,
    // so a shape is not painted outline first
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (const c of components(L, Gd)) {
        const set = new Set(c.cells); let inner = 0; const votes = new Map();
        for (const cell of c.cells) {
          let all = true;
          for (const q of nbrs(cell)) { if (q < 0) continue; if (!set.has(q)) { all = false; const v = L[q]; if (v >= 0) votes.set(v, (votes.get(v) || 0) + 1) } }
          if (all) inner++;
        }
        if (inner > c.cells.length * .3 || !votes.size) continue;
        let best = -1, bn = 0; votes.forEach((k, v) => { if (k > bn) { bn = k; best = v } });
        for (const cell of c.cells) L[cell] = best; changed = true;
      }
      if (!changed) break;
    }
    const LL = new Float32Array(K); for (let k = 0; k < K; k++) LL[k] = km.C[k * 3];
    const comps = components(L, Gd).filter(c => c.area >= .008).sort((a, b) => b.area - a.area).slice(0, 9);
    const washes = comps.map((c, i) => {
      const m = new Float32Array(Gd * Gd), col = [0, 0, 0]; let bx0 = Gd, by0 = Gd, bx1 = -1, by1 = -1, mx = 0, my = 0;
      for (const cell of c.cells) {
        m[cell] = 1; const x = cell % Gd, y = cell / Gd | 0;
        bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); mx += x; my += y;
        for (let k = 0; k < 3; k++) col[k] += Prgb[cell * 3 + k];
      }
      const cn = c.cells.length; mx /= cn; my /= cn; for (let k = 0; k < 3; k++) col[k] /= cn;
      // a light wash goes on across the darker shapes it surrounds (they are glazed over it later), not around them
      const reach = new Uint8Array(Gd * Gd), stk = [];
      for (let k = 0; k < Gd; k++) for (const q of [k, (Gd - 1) * Gd + k, k * Gd, k * Gd + Gd - 1]) if (!m[q] && !reach[q]) { reach[q] = 1; stk.push(q) }
      while (stk.length) { const q = stk.pop(); for (const r of nbrs(q)) if (r >= 0 && !m[r] && !reach[r]) { reach[r] = 1; stk.push(r) } }
      // a wash over a fifth of the sheet is a ground: it goes under every darker area, enclosed or not
      const ground = c.area >= .2;
      for (let q = 0; q < Gd * Gd; q++) if (!m[q] && (ground || !reach[q]) && L[q] >= 0 && LL[L[q]] < LL[c.lb] - 2) {
        m[q] = 1; const x = q % Gd, y = q / Gd | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      }
      // the long axis; the brush lands at its upper end (a sky is pulled down from the top)
      let sxx = 0, sxy = 0, syy = 0;
      for (const cell of c.cells) { const dx = cell % Gd - mx, dy = (cell / Gd | 0) - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy }
      const th = .5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(th), ay = Math.sin(th);
      let lo = 1e9, hi = -1e9, pLo = 0, pHi = 0;
      for (const cell of c.cells) { const p = (cell % Gd - mx) * ax + ((cell / Gd | 0) - my) * ay; if (p < lo) { lo = p; pLo = cell } if (p > hi) { hi = p; pHi = cell } }
      const endY = q => (q / Gd | 0) + .3 * (q % Gd) / Gd;
      const st = endY(pLo) <= endY(pHi) ? pLo : pHi;
      const sky = c.area > .22 && by0 <= 1;
      const ms = new Float32Array(Gd * Gd);
      for (let y = 0; y < Gd; y++) for (let x = 0; x < Gd; x++) {
        let s = 0, k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < Gd && Y < Gd) s += m[Y * Gd + X]; k++ }
        ms[y * Gd + x] = s / k;
      }
      const a = .66;
      return { kind: 'wash', g: Gd, ms, bx0, by0, bx1, by1, area: c.area, col, a, seed: i * 13.7 + 3,
        sx: sky ? (mx + .5) / Gd : (st % Gd + .5) / Gd, sy: sky ? 0 : ((st / Gd | 0) + .5) / Gd, sky, light: lab(...col)[0] };
    });
    washes.sort((a, b) => (b.light - a.light) || (b.area - a.area));
    for (const w of washes) blendInto(C, N, washRaster(w, N, nz, false), w.col);

    /* 2 · strokes, coarse to fine */
    const TIERS = [
      { name: 'broad', r: 1 / 26, blur: .7, thr: 16, maxLen: 9, minLen: 2, a: .66, cap: 120, fc: .55, tol: 34 },
      { name: 'medium', r: 1 / 52, blur: .6, thr: 13, maxLen: 11, minLen: 2, a: .74, cap: 240, fc: .6, tol: 30 },
      { name: 'fine', r: 1 / 160, blur: 0, thr: 15, maxLen: 16, minLen: 1, a: .84, cap: 560, fc: .65, tol: 34 }
    ];
    const strokes = [], lumOf = (A, i) => .3 * A[i] + .59 * A[i + 1] + .11 * A[i + 2];
    const dist3 = (A, i, B, j) => Math.hypot(A[i] - B[j], A[i + 1] - B[j + 1], A[i + 2] - B[j + 2]);
    TIERS.forEach((T, ti) => {
      // the fine pass works on the image itself, so a one-pixel line keeps its colour
      const r = Math.max(1.2, N * T.r), Rr = T.blur ? blur(I, N, N, 3, Math.max(1, r * T.blur)) : I, Rd = T.blur ? Rr : blur(I, N, N, 3, 1);
      // structure tensor of the luminance: the direction of least change follows the edges
      const Lm = new Float32Array(n); for (let i = 0; i < n; i++) Lm[i] = lumOf(Rd, i * 3);
      const J = new Float32Array(n * 3);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x, gx = (Lm[y * N + Math.min(N - 1, x + 1)] - Lm[y * N + Math.max(0, x - 1)]) / 2, gy = (Lm[Math.min(N - 1, y + 1) * N + x] - Lm[Math.max(0, y - 1) * N + x]) / 2;
        J[i * 3] = gx * gx; J[i * 3 + 1] = gx * gy; J[i * 3 + 2] = gy * gy;
      }
      const Js = blur(J, N, N, 3, Math.max(1, r));
      const tangent = (x, y, out) => {
        const i = ((Math.min(N - 1, Math.max(0, y | 0))) * N + Math.min(N - 1, Math.max(0, x | 0))) * 3, a = Js[i], b = Js[i + 1], c = Js[i + 2], tr = a + c;
        const coh = tr > 1e-6 ? Math.sqrt((a - c) * (a - c) + 4 * b * b) / tr : 0, th = .5 * Math.atan2(2 * b, a - c) + Math.PI / 2;
        // flat areas: a lazy, slightly wavering horizontal stroke
        const dth = (nz(x / N * 3 + ti * 5, y / N * 3) - .5) * .9;
        const w = smooth(.08, .3, coh) * smooth(.4, 4, tr);
        let tx = Math.cos(th) * w + Math.cos(dth) * (1 - w), ty = Math.sin(th) * w + Math.sin(dth) * (1 - w);
        const l = Math.hypot(tx, ty) || 1; out[0] = tx / l; out[1] = ty / l;
      };
      // where to start: the worst spot in each brush-sized cell that is still off by more than the threshold
      const step = Math.max(2, Math.round(r)), cand = [];
      for (let cy = 0; cy < N; cy += step) for (let cx = 0; cx < N; cx += step) {
        let sum = 0, cnt = 0, best = -1, bi = 0;
        const sk = step > 6 ? 2 : 1;
        for (let y = cy; y < Math.min(N, cy + step); y += sk) for (let x = cx; x < Math.min(N, cx + step); x += sk) {
          const i = (y * N + x) * 3, e = dist3(Rr, i, C, i); sum += e; cnt++; if (e > best) { best = e; bi = y * N + x }
        }
        const m = sum / cnt; if (m > T.thr) cand.push([m + nz(cx * .37, cy * .37) * 3, bi]);
      }
      cand.sort((a, b) => b[0] - a[0]);
      const t = [0, 0]; let made = 0;
      for (const [, seed] of cand) {
        if (made >= T.cap) break;
        const sx = seed % N, sy = seed / N | 0, si = seed * 3;
        if (dist3(Rr, si, C, si) < T.thr * .8) continue;
        const col = [Rr[si], Rr[si + 1], Rr[si + 2]];
        const half = dir => {
          const out = []; let x = sx + .5, y = sy + .5, lx = 0, ly = 0;
          for (let i = 1; i <= Math.ceil(T.maxLen / 2); i++) {
            tangent(x, y, t); let dx = t[0], dy = t[1];
            if (i === 1) { dx *= dir; dy *= dir } else if (dx * lx + dy * ly < 0) { dx = -dx; dy = -dy }
            if (i > 1) { dx = T.fc * dx + (1 - T.fc) * lx; dy = T.fc * dy + (1 - T.fc) * ly; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l }
            const nx = x + dx * r, ny = y + dy * r;
            if (nx < 0 || ny < 0 || nx >= N || ny >= N) break;
            const j = ((ny | 0) * N + (nx | 0)) * 3, dc = Math.hypot(Rr[j] - col[0], Rr[j + 1] - col[1], Rr[j + 2] - col[2]);
            if (dc > T.tol) break;
            if (i > T.minLen && dist3(Rr, j, C, j) < dc) break;
            out.push(nx, ny); x = nx; y = ny; lx = dx; ly = dy;
          }
          return out;
        };
        const fw = half(1), bw = half(-1), pts = [];
        for (let i = bw.length - 2; i >= 0; i -= 2) pts.push(bw[i], bw[i + 1]);
        pts.push(sx + .5, sy + .5, ...fw);
        if (pts.length < 4 && ti < 2) { // a lone dab is only worth it in the fine pass
          if (dist3(Rr, si, C, si) < T.thr * 1.6) continue;
        }
        const st = { kind: 'stroke', tier: ti, n: N, pts, r: r * (ti === 2 ? .85 : 1), a: T.a, col, seed: strokes.length * 3.17 + ti * 50 };
        blendInto(C, N, strokeRaster(st, N, nz, false), col);
        strokes.push(st); made++;
      }
    });

    // order for painting: per pass, colours grouped (lights first), the brush moving to the nearest work
    const order = list => {
      if (!list.length) return list;
      const groups = new Map();
      for (const s of list) {
        const l = lab(...s.col); s.L = l[0];
        let bk = 0, bd = 1e9; washes.forEach((w, k) => { const wl = lab(...w.col), d = Math.hypot(wl[0] - l[0], wl[1] - l[1], wl[2] - l[2]); if (d < bd) { bd = d; bk = k } });
        const key = bd < 18 ? bk : 100 + Math.min(5, Math.floor((100 - l[0]) / 17));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
      const gs = [...groups.values()].map(g => ({ g, L: g.reduce((t, s) => t + s.L, 0) / g.length })).sort((a, b) => b.L - a.L);
      const out = []; let px = 0, py = 0;
      for (const { g } of gs) {
        const left = g.slice();
        while (left.length) {
          let bi = 0, bd = 1e18;
          for (let i = 0; i < left.length; i++) { const p = left[i].pts, d = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (d < bd) { bd = d; bi = i } }
          const s = left.splice(bi, 1)[0]; out.push(s); px = s.pts[s.pts.length - 2]; py = s.pts[s.pts.length - 1];
        }
      }
      return out;
    };
    const tiers = [0, 1, 2].map(ti => order(strokes.filter(s => s.tier === ti)));
    // how close the marks got (for tuning): mean RGB error of the analysis canvas against the image
    let err = 0; for (let i = 0; i < n * 3; i += 3) err += dist3(C, i, I, i); err /= n;
    // bare paper (for repainting over another painting): cells where the image is paper
    const bare = new Float32Array(Gd * Gd);
    for (let c = 0; c < Gd * Gd; c++) { const l = P.subarray(c * 3, c * 3 + 3); bare[c] = Math.hypot(l[0] - pl[0], l[1] - pl[1], l[2] - pl[2]) < 6 ? 1 : 0 }
    return { N, paper, washes, tiers, err, bare, Gd };
  }

  /* ---------- layers at display size, with a timeline (seconds at speed 1) ---------- */
  const EASE = { out: 0, inOut: 1, smooth: 2 };
  function build(an, S) {
    const nz = Noise(an.N * 7 + 11), parts = [], L = [];
    let T = 0;
    const push = (lay, meta) => { if (!lay.w || !lay.h) return; parts.push(lay); L.push(Object.assign({ x: lay.x, y: lay.y, w: lay.w, h: lay.h }, meta)) };
    // the paper tone over whatever is there (only used when painting over another painting): pulled down from the top
    {
      const ms = new Float32Array(an.Gd * an.Gd), Gd = an.Gd;
      for (let y = 0; y < Gd; y++) for (let x = 0; x < Gd; x++) { let s = 0, k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < Gd && Y < Gd) s += an.bare[Y * Gd + X]; k++ } ms[y * Gd + x] = s / k }
      const lay = washRaster({ g: Gd, ms, bx0: 0, by0: 0, bx1: Gd - 1, by1: Gd - 1, a: .7, seed: 91, sx: .5, sy: 0, sky: true }, S, nz, true);
      for (let j = 0; j < lay.a.length; j++) lay.a[j] = Math.min(255, lay.a[j] * 1.6);
      push(lay, { kind: 'ground', g: 0, c: an.paper, f: .3, t0: 0, t1: .8, e: EASE.out });
    }
    // washes
    // washes overlap, a beat apart; the three stroke passes start as the one before is ~2/3 done
    const nw = an.washes.length, wslot = nw ? Math.max(.12, Math.min(.26, .95 / nw)) : 0;
    let end = 0;
    an.washes.forEach((w, i) => {
      const lay = washRaster(w, S, nz, true), t0 = .15 + i * wslot, t1 = Math.max(t0 + .68 + .45 * Math.sqrt(w.area), end + .01);
      end = t1; push(lay, { kind: 'wash', g: 1, c: w.col.map(Math.round), f: .3, t0, t1, e: EASE.out });
    });
    const START = [.7, 1.4, 2.1], SPAN = [[.012, .5, .9], [.005, .5, 1.0], [.003, .3, .8]], DUR = [[.46, .3], [.36, .26], [.24, .2]];
    an.tiers.forEach((list, ti) => {
      if (!list.length) return;
      const span = Math.max(SPAN[ti][1], Math.min(SPAN[ti][2], SPAN[ti][0] * list.length)), slot = span / list.length, start = START[ti] + (nw ? 0 : -.4);
      list.forEach((s, i) => {
        const lay = strokeRaster(s, S, nz, true), p = s.pts; let len = 0;
        for (let k = 2; k < p.length; k += 2) len += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
        const t0 = start + i * slot, t1 = Math.max(t0 + DUR[ti][0] + DUR[ti][1] * Math.min(1, len / (an.N * .25)), end);
        end = t1; push(lay, { kind: p.length > 2 ? 'stroke' : 'dab', g: 2 + ti, c: s.col.map(Math.round), f: p.length > 2 ? .14 : .35, t0, t1, e: p.length > 2 ? EASE.inOut : EASE.out });
      });
    });
    const settle = { kind: 'settle', g: 5, x: 0, y: 0, w: S, h: S, t0: Math.max(.3, end - .35), t1: end + .5, e: EASE.smooth, f: 1 };
    // pack the bytes
    let tot = 0; for (const p of parts) tot += p.a.length;
    const A = new Uint8Array(tot), O = new Uint8Array(tot); let off = 0;
    parts.forEach((p, i) => { A.set(p.a, off); O.set(p.o, off); L[i].off = off; off += p.a.length });
    L.push(settle);
    return { S, paper: an.paper, layers: L, A: A.buffer, O: O.buffer, total: settle.t1, err: an.err };
  }

  const cache = new Map();
  function plan(key, rgba, N, S) {
    let an = cache.get(key);
    if (!an) { an = analyse(rgba, N); cache.set(key, an); if (cache.size > 64) cache.delete(cache.keys().next().value) }
    return build(an, S);
  }
  G.StrokePlan = { plan, analyse, build, has: key => cache.has(key) };
  if (typeof document === 'undefined' && typeof G.postMessage === 'function') {
    G.onmessage = e => {
      const { id, key, N, pixels, S } = e.data;
      try {
        if (!pixels && !cache.has(key)) { G.postMessage({ id, need: true }); return }
        const p = plan(key, pixels ? new Uint8ClampedArray(pixels) : null, N, S);
        G.postMessage({ id, plan: p }, [p.A, p.O]);
      } catch (err) { G.postMessage({ id, error: String(err && err.stack || err) }) }
    };
  }
})(self);
