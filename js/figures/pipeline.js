/* RL training pipeline, on Jacky's diagram: five boxes in a row (label above, a short italic caption below, chevrons
   between) and a dashed loop from GRPO back to Inkling-Small. One cycle plays left to right, and each box keeps what
   it made, so by the end the whole pipeline is filled in:
     Prompt         the prompt types itself in.
     Inkling-Small  a p5.brush sketch streams in, line by line, with a caret.
     Render         a blank white canvas; the painting paints itself on it (the shared painter, js/painter.js).
     Verifier       the painting moves over and joins its group of five; each gets a score distribution and its
                    expected score (green).
     GRPO           the five scores as dots, the group mean as a dashed line, then each painting's advantage as a bar
                    from the mean (green above, grey below).
   Then the loop lights up and carries the updated policy back to Inkling-Small, and the next group starts.
   Phones: the boxes stack with the label beside each, arrows point down, the loop runs up the right side.
   Paintings: two real groups at step 250 (FIG.groups). Code: a real p5.brush sketch; the painting's own once it is in
   FIG.sketches (then Render replays it exactly), until then flower.js / teal_daisy.js. Scores: PLACEHOLDER.
   Runs only while visible; pause button. Reduced motion: the filled-in pipeline, still. */
(function () {
  'use strict';
  const root = document.getElementById('fx-pipeline'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, reduced, responsive, watch, playButton, tag } = FX;
  const RM = reduced() || !window.Painter;
  const G = FIG.groups, PH = FIG.placeholder.pipeline, SK = FIG.sketches || {};
  const CYC = [['pear', 'flower.js'], ['hydrangea', 'teal_daisy.js']].map(([k, file]) => {
    const g = G[k], r = PH[k], m = r.reduce((a, b) => a + b) / r.length;
    return { prompt: g.short, imgs: g.imgs, r, m, adv: r.map(v => v - m), file: SK[g.imgs[0]] || file, lines: null };
  });
  const STAGES = [
    { k: 'prompt', name: 'Prompt', cap: 'text prompt' },
    { k: 'code', name: 'Inkling-Small', cap: 'writes p5.brush JS' },
    { k: 'render', name: 'Render', cap: 'Puppeteer → PNG' },
    { k: 'verify', name: 'LLM-as-a-Verifier', cap: 'fine-grained scores', v: true },
    { k: 'grpo', name: 'GRPO', cap: 'normalize → update' }
  ];
  const NB = 12; // bars in each tiny score distribution

  /* ---------------- DOM ---------------- */
  const boxes = {}, sts = STAGES.map(st => {
    const box = boxes[st.k] = h('div', { class: 'fx-pp-box', 'aria-hidden': 'true' });
    return h('li', { class: 'fx-pp-st s-' + st.k + (st.v ? ' v' : '') }, h('span', { class: 'fx-pp-l' }, st.name), box, h('span', { class: 'fx-pp-c' }, st.cap));
  });
  // prompt
  const qTxt = h('span'), qCaret = h('i', { class: 'fx-pp-caret' });
  boxes.prompt.append(h('p', { class: 'fx-pp-q' }, h('span', {}, qTxt, qCaret)));
  // code
  const codeIn = h('div', { class: 'fx-pp-in' }), codeCaret = h('i', { class: 'fx-pp-caret' });
  boxes.code.append(h('div', { class: 'fx-pp-code' }, codeIn));
  // render: a white canvas
  const cv = RM ? null : h('canvas'), rImg = h('img', { class: 'fx-pp-rimg', alt: '', width: 420, height: 420, decoding: 'async' });
  const rframe = h('div', { class: 'fx-pp-frame' }, rImg, cv);
  boxes.render.append(rframe);
  // verifier: the group, one row per painting
  const rows = [0, 1, 2, 3, 4].map(i => {
    const im = h('img', { class: 'fx-paint', alt: '', width: 420, height: 420, decoding: 'async', style: { '--i': i } });
    const bars = Array.from({ length: NB }, (_, b) => h('i', { style: { '--d': i * 110 + b * 14 + 'ms' } }));
    const sc = h('b', { style: { '--i': i } });
    return { el: h('li', {}, im, h('span', { class: 'fx-pp-dist' }, bars), sc), im, bars, sc };
  });
  boxes.verify.append(h('ul', { class: 'fx-pp-rows' }, rows.map(r => r.el)));
  // GRPO: scores as dots, the mean, advantages as bars
  const mean = h('i', { class: 'fx-pp-mean' });
  const cols = [0, 1, 2, 3, 4].map(i => { const dot = h('i', { class: 'dot', style: { '--i': i } }), bar = h('i', { class: 'bar', style: { '--i': i } }); return { el: h('span', { class: 'col' }, bar, dot), dot, bar } });
  const adv = h('div', { class: 'fx-pp-adv' }, mean, cols.map(c => c.el));
  boxes.grpo.append(adv);
  // the loop back to Inkling-Small
  const track = s('path', { class: 'track' }), head = s('path', { class: 'head' }), pkt = s('circle', { class: 'pkt', r: 3.5 });
  const loop = s('svg', { class: 'fx-pp-loop', 'aria-hidden': 'true' }, track, head, pkt);
  const loopL = h('span', { class: 'fx-pp-loopl', 'aria-hidden': 'true' }, 'updated policy');
  const ol = h('ol', { class: 'fx-pp-row' }, sts);
  const wrap = h('div', { class: 'fx-pp' }, ol, loop, loopL);
  let playing = !RM;
  const btn = playButton(() => setPlaying(!playing));
  btn.set(playing);
  if (RM) btn.style.visibility = 'hidden';
  root.append(h('div', { class: 'fx-top split' }, btn, tag()), wrap);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'RL training loop. A text prompt goes to Inkling-Small, which writes a p5.brush sketch. The sketch is rendered to a PNG. Inkling-Small, as LLM-as-a-Verifier, gives each painting in the group of five a fine-grained score. GRPO centers the scores on the group mean and updates the model, and the updated policy writes the next group.');

  /* ---------------- content for a group ---------------- */
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const hl = t => esc(t).replace(/"[^"]*"|\b(?:function|let|for|const)\b|\b\d+(?:\.\d+)?\b/g, m => `<span class="${m[0] === '"' ? 'str' : /^\d/.test(m) ? 'num' : 'kw'}">${m}</span>`);
  const codeOf = c => c.lines || (c.lines = fetch(c.file).then(r => r.ok ? r.text() : Promise.reject()).then(t => t.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() && !l.trim().startsWith('//')))
    .catch(() => ['brush.pick("pen");', 'brush.fill("#d98b6a", 160);', 'brush.bleed(0.2, "in");', 'brush.polygon([[0, -60], [50, 40], [-50, 40]]);']));
  let ci = 0, cyc = CYC[0], code = [], codeLen = 0, lineEls = [], typed = -1, LH = 14, visLines = 8;
  function fill(c) {
    cyc = c;
    qTxt.textContent = ''; typed = -1;
    codeIn.textContent = ''; lineEls = []; codeIn.style.transform = '';
    codeOf(c).then(L => { if (cyc === c) { code = L; codeLen = L.reduce((a, l) => a + l.length + 1, 0) } });
    rImg.src = c.imgs[0]; rImg.alt = `A painting of ${c.prompt}`;
    if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    rows.forEach((r, i) => {
      r.im.src = c.imgs[i]; r.im.alt = `Painting ${'ABCDE'[i]}`;
      const v = c.r[i];
      r.bars.forEach((b, k) => { const u = (k + .5) / NB, g = Math.exp(-((u - v) ** 2) / (2 * .085 * .085)); b.style.setProperty('--h', (g < .06 ? 0 : g).toFixed(3)) });
      r.sc.textContent = v.toFixed(2);
    });
    placeAdv();
  }
  // GRPO box: dot heights from the scores, the mean in the middle, bars from the mean to each dot
  function placeAdv() {
    const H = adv.clientHeight || 100, pad = 6, mx = Math.max(...cyc.adv.map(Math.abs)) || 1;
    cols.forEach((c, i) => {
      const a = cyc.adv[i], y = H / 2 - a / mx * (H / 2 - pad);
      c.dot.style.top = y + 'px';
      c.bar.className = 'bar ' + (a >= 0 ? 'up' : 'dn');
      c.bar.style.top = Math.min(y, H / 2) + 'px'; c.bar.style.height = Math.max(1.5, Math.abs(H / 2 - y)) + 'px';
    });
  }
  // the sketch, typed up to n characters; the view keeps the line being written in sight
  function typeCode(n) {
    if (!code.length || n === typed) return;
    typed = n;
    let left = n, li = 0;
    for (; li < code.length; li++) {
      const full = code[li].length + 1;
      if (!lineEls[li]) { if (left <= 0) break; lineEls[li] = codeIn.appendChild(h('div', { class: 'ln' })); lineEls[li]._n = -1 }
      const k = Math.min(code[li].length, left), el = lineEls[li];
      if (el._n !== k) {
        if (k >= code[li].length) el.innerHTML = hl(code[li]) || ' ';
        else el.textContent = code[li].slice(0, k);
        el._n = k;
      }
      left -= full; if (left < 0) { li++; break }
    }
    const cur = Math.max(0, Math.min(code.length, li) - 1);
    lineEls.forEach((e, k) => e.classList.toggle('cur', k === cur));
    if (lineEls[cur] && codeCaret.parentNode !== lineEls[cur]) lineEls[cur].appendChild(codeCaret);
    const off = Math.max(0, cur + 1 - visLines) * LH;
    codeIn.style.transform = `translateY(${-off}px)`;
  }
  function measure() {
    const cs = getComputedStyle(codeIn), box = codeIn.parentNode;
    LH = parseFloat(cs.lineHeight) || 14;
    visLines = Math.max(3, Math.floor((box.clientHeight - parseFloat(getComputedStyle(box).paddingTop) * 2) / LH));
  }

  /* ---------------- the loop path ---------------- */
  let pathLen = 0;
  function layout() {
    measure(); placeAdv();
    const wb = wrap.getBoundingClientRect(), rb = el => el.getBoundingClientRect();
    const bC = rb(boxes.code), bG = rb(boxes.grpo), vert = bG.top > bC.bottom + 4;
    loop.setAttribute('viewBox', `0 0 ${wb.width} ${wb.height}`); loop.setAttribute('width', wb.width); loop.setAttribute('height', wb.height);
    let d, hd, lx, ly;
    if (!vert) {
      // under the captions: down from GRPO, back along the bottom, up into Inkling-Small
      const caps = [...wrap.querySelectorAll('.fx-pp-c')].map(c => rb(c).bottom - wb.top), yT = Math.max(...caps) + 10, yB = wb.height - 9;
      const x1 = bC.left - wb.left + bC.width / 2, x2 = bG.left - wb.left + bG.width / 2;
      d = `M${x2} ${yT}V${yB - 6}Q${x2} ${yB} ${x2 - 6} ${yB}H${x1 + 6}Q${x1} ${yB} ${x1} ${yB - 6}V${yT + 8}`;
      hd = `M${x1 - 4.5} ${yT + 8.5}L${x1 + 4.5} ${yT + 8.5}L${x1} ${yT + 1}z`;
      lx = (x1 + x2) / 2; ly = yB;
      loopL.classList.remove('vert');
    } else {
      // phones: out of GRPO's right side, up the gutter, into Inkling-Small's right side
      const xg = wb.width - 10, y1 = bG.top - wb.top + bG.height / 2, y2 = bC.top - wb.top + bC.height / 2, x0 = bG.right - wb.left + 4, x1 = bC.right - wb.left + 2;
      d = `M${x0} ${y1}H${xg - 6}Q${xg} ${y1} ${xg} ${y1 - 6}V${y2 + 6}Q${xg} ${y2} ${xg - 6} ${y2}H${x1 + 8}`;
      hd = `M${x1 + 8.5} ${y2 - 4.5}L${x1 + 8.5} ${y2 + 4.5}L${x1 + 1} ${y2}z`;
      lx = xg; ly = (y1 + y2) / 2;
      loopL.classList.add('vert');
    }
    track.setAttribute('d', d); head.setAttribute('d', hd);
    loopL.style.left = lx + 'px'; loopL.style.top = ly + 'px';
    pathLen = track.getTotalLength();
  }

  /* ---------------- the cycle ----------------
     phases: [name, seconds]; 'hand' passes from box k to the next; Render lasts as long as the painting takes. */
  const PHASES = [['prompt', 1.9], ['hand', .45, 0], ['code', 3.2], ['hand', .45, 1], ['render', 0], ['hand', .85, 2], ['verify', 3.2], ['hand', .45, 3], ['grpo', 3.0], ['loop', 2.3], ['clear', .6]];
  let pi = -1, t = 0, renderEnd = Infinity, job = null, vis = false, raf = 0, last = 0, started = false;
  const on = (k, v) => root.classList.toggle(k, v);
  const stage = i => sts.forEach((el, k) => el.classList.toggle('on', k === i));
  const seen = i => sts[i].classList.add('seen');
  function enter(i) {
    pi = i % PHASES.length; t = 0;
    const [name, , k] = PHASES[pi];
    sts.forEach(el => el.classList.remove('go'));
    if (name === 'prompt') {
      if (started) { ci = (ci + 1) % CYC.length; fill(CYC[ci]) }
      started = true;
      ['clr', 'looping', 'upd', 'pkt', 'v0', 'v1', 'v2', 'v3', 'g1', 'g2', 'g3', 'g4'].forEach(c => on(c, false));
      sts.forEach(el => el.classList.remove('seen'));
      stage(0); seen(0);
    } else if (name === 'hand') {
      stage(-1); sts[k].classList.add('go');
      if (k === 2) fly();
    } else if (name === 'code') { stage(1); seen(1); measure() }
    else if (name === 'render') { stage(2); seen(2); startPaint() }
    else if (name === 'verify') { stage(3); seen(3); on('v1', true) }
    else if (name === 'grpo') { stage(4); seen(4); placeAdv(); on('g1', true) }
    else if (name === 'loop') { stage(-1); on('looping', true) }
    else if (name === 'clear') { on('looping', false); on('upd', false); on('clr', true) }
  }
  function update() {
    const [name] = PHASES[pi];
    if (name === 'prompt') {
      const n = Math.min(cyc.prompt.length, Math.floor(Math.max(0, t - .15) * 30));
      qTxt.textContent = '“' + cyc.prompt.slice(0, n) + (n >= cyc.prompt.length ? '”' : '');
    } else if (name === 'code') typeCode(Math.floor(Math.min(1, t / 2.75) * codeLen));
    else if (name === 'verify') { on('v2', t > .45); on('v3', t > 1.25) }
    else if (name === 'grpo') { on('g2', t > .55); on('g3', t > 1.15); on('g4', t > 2.2) }
    else if (name === 'loop') {
      const p = Math.min(1, Math.max(0, (t - .25) / 1.45)), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      if (pathLen) { const pt = track.getPointAtLength(e * pathLen); pkt.setAttribute('cx', pt.x); pkt.setAttribute('cy', pt.y) }
      on('pkt', p > 0 && p < 1); on('upd', t > 1.7);
    }
  }
  function dur() { const [name, d] = PHASES[pi]; return name === 'render' ? renderEnd : name === 'code' && !codeLen ? Infinity : d }
  function frame(ts) {
    raf = 0; if (!playing || !vis) return;
    const dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
    t += dt;
    let guard = 0;
    while (t >= dur() && guard++ < 20) { const over = t - dur(); enter(pi + 1); t = over }
    update();
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && playing && vis) { last = 0; raf = requestAnimationFrame(frame) } }
  function setPlaying(v) {
    playing = v; btn.set(v); on('paused', !v);
    if (job) v ? job.resume() : job.pause();
    kick();
  }

  // Render: a blank canvas, then the painting paints itself; the phase ends a beat after it is done
  function startPaint() {
    renderEnd = Infinity;
    if (job) { job.cancel(false); job = null }
    rframe.classList.remove('done');
    const my = job = Painter.paint(cv, cyc.imgs[0], { from: 'blank', max: 320, speed: 1.15, delay: .45 });
    if (!playing) my.pause();
    my.done.then(ok => {
      if (job !== my) return;
      job = null;
      if (!ok) rframe.classList.add('done'); // no plan: the picture itself
      renderEnd = t + .4;
    });
  }
  // the finished painting moves from the canvas to the top of the verifier's group
  function fly() {
    const wb = wrap.getBoundingClientRect(), a = rframe.getBoundingClientRect(), b = rows[0].im.getBoundingClientRect();
    const im = h('img', { class: 'fx-pp-fly', src: cyc.imgs[0], alt: '', style: { left: a.left - wb.left + 'px', top: a.top - wb.top + 'px', width: a.width + 'px', height: a.height + 'px' } });
    wrap.append(im);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      im.style.transform = `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width})`;
      im.style.borderRadius = 3 * a.width / b.width + 'px';
    }));
    const done = () => { im.remove(); on('v0', true) };
    im.addEventListener('transitionend', e => { if (e.propertyName === 'transform') done() }, { once: false });
    setTimeout(() => im.isConnected && done(), 1400);
  }

  /* ---------------- start ---------------- */
  fill(CYC[0]);
  responsive(root, layout);
  window.addEventListener('load', layout);
  if (document.fonts) document.fonts.ready.then(layout);
  if (RM) {
    // the filled-in pipeline
    codeOf(cyc).then(L => { code = L; codeLen = L.reduce((a, l) => a + l.length + 1, 0); typed = -1; codeIn.textContent = ''; lineEls = []; typeCode(codeLen); codeIn.style.transform = ''; lineEls.forEach(e => e.classList.remove('cur')); codeCaret.remove() });
    qTxt.textContent = '“' + cyc.prompt + '”';
    rframe.classList.add('done');
    sts.forEach(el => el.classList.add('seen'));
    ['v0', 'v1', 'v2', 'v3', 'g1', 'g2', 'g3'].forEach(c => on(c, true));
    return;
  }
  // the brush marks for both groups' first paintings are worked out (in a worker) once the figure is near
  const pio = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { pio.disconnect(); CYC.forEach(c => { Painter.prefetch(c.imgs[0], cv, 320); codeOf(c) }) } }, { rootMargin: '700px 0px' });
  pio.observe(root);
  watch(root, v => {
    vis = v;
    if (v && pi < 0) enter(0);
    if (!v) { if (raf) cancelAnimationFrame(raf); raf = 0 }
    kick();
  }, .3);
})();
