/* Test-time scaling, in the style of the RL pipeline figure (same boxes, labels, captions and chevrons):
     Prompt          the prompt types itself in.
     Inkling-Small 2   a Three.js scene streams in, line by line (an excerpt of the selected scene's real source).
     Candidates      six candidate scenes appear one by one (the opening view of each real sample of this prompt).
     Verifier        each candidate gets its score; the scores count up one after another.
     Selected        the highest-scoring candidate moves over, outlined in the verifier colour.
   Candidates and scores are real: the five samples of the black hole prompt from run 1, step 33, plus one base-model
   sample of the same prompt (sample_20), re-scored together as one group by the recipe's pairwise verifier; each score
   is the reward x10. The code excerpt is from the selected sample (g3). Thumbnails are each scene's opening view. Runs only while visible; pause button. Reduced motion: the finished figure, still. */
(function () {
  'use strict';
  const root = document.getElementById('fx-tts'); if (!root || !window.FX) return;
  const { h, reduced, watch, playButton } = FX;
  const RM = reduced();
  const PROMPT = 'black hole with an accretion disk';
  // run 1, step 33: g0..g4 (g3 is the one the verifier selected), then sample_20 from the base model
  const CANDS = ['demos/tts-bh-g0.webp', 'demos/tts-bh-g1.webp', 'demos/tts-bh-g2.webp', 'demos/tts-bh-g3.webp', 'demos/tts-bh-g4.webp', 'demos/tts-bh-s20.webp'];
  // verifier reward x10, re-scored together as one group (Inkling-2-Small, run 1's settings, pivot pairing; 35 calls, none failed)
  const SCORES = [7.54, 6.01, 7.20, 9.50, 6.86, 8.20];
  const BEST = SCORES.indexOf(Math.max(...SCORES));
  const CODE = [
    'const MAX_STEPS = 340;',
    'for (int i = 0; i < MAX_STEPS; i++){',
    '  float r2 = dot(pos, pos);',
    '  float r  = sqrt(r2);',
    '  minR = min(minR, r);',
    '  // captured by the event horizon',
    '  if (r < 0.92 * RS){ absorbed = true; break; }',
    '  float cap  = (r > 20.0) ? 0.80 : 0.60;',
    '  vec3 qAx = toDiskQ(pos);',
    '  …'
  ];
  const STAGES = [
    { k: 'prompt', name: 'Prompt', cap: 'text prompt' },
    { k: 'code', name: 'Inkling-Small 2', cap: 'writes Three.js scenes' },
    { k: 'cands', name: 'Candidates', cap: 'six samples, rendered' },
    { k: 'verify', name: 'LLM-as-a-Verifier', cap: 'fine-grained scores', v: true },
    { k: 'pick', name: 'Selected', cap: 'highest score' }
  ];

  /* ---------------- DOM ---------------- */
  const boxes = {}, sts = {};
  const lis = STAGES.map(st => {
    const box = boxes[st.k] = h('div', { class: 'fx-pp-box', 'aria-hidden': 'true' });
    return sts[st.k] = h('li', { class: 'fx-pp-st s-' + st.k + (st.v ? ' v' : '') }, h('span', { class: 'fx-pp-l' }, st.name), box, h('span', { class: 'fx-pp-c' }, st.cap));
  });
  const qTxt = h('span');
  boxes.prompt.append(h('p', { class: 'fx-pp-q' }, h('span', {}, qTxt, h('i', { class: 'fx-pp-caret' }))));
  const codeIn = h('div', { class: 'fx-pp-in' });
  boxes.code.append(h('div', { class: 'fx-pp-code' }, codeIn));
  const thumbs = CANDS.map(src => h('img', { src, alt: '', width: 384, height: 216, decoding: 'async', loading: 'lazy' }));
  boxes.cands.append(h('div', { class: 'tts-grid' + (CANDS.length % 2 ? ' odd' : '') }, thumbs));
  const rows = CANDS.map((src, i) => {
    const fill = h('i'), num = h('b');
    return { el: h('li', {}, h('img', { src, alt: '', width: 384, height: 216, decoding: 'async', loading: 'lazy' }), h('span', { class: 'tts-bar' }, fill), num), fill, num };
  });
  const list = h('ul', { class: 'tts-rows' }, rows.map(r => r.el)); list.style.gridTemplateRows = 'repeat(' + CANDS.length + ',1fr)';
  boxes.verify.append(list);
  const pickImg = h('img', { src: CANDS[BEST], alt: '', width: 384, height: 216, decoding: 'async', loading: 'lazy' }), pickNum = h('b');
  boxes.pick.append(h('div', { class: 'tts-pick' }, pickImg, pickNum));
  const wrap = h('div', { class: 'fx-pp tts' }, h('ol', { class: 'fx-pp-row' }, lis));
  let playing = !RM;
  const btn = playButton(() => { playing = !playing; btn.set(playing); kick() });
  btn.set(playing);
  if (RM) btn.style.visibility = 'hidden';
  root.append(wrap);   // no pause button: the figure simply loops while it is on screen
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Test-time scaling. The prompt "black hole with an accretion disk" goes to Inkling-Small 2, which writes Three.js scenes. Six candidate scenes are rendered. Inkling-Small 2, as LLM-as-a-Verifier, scores each one, and the highest-scoring scene, 9.50, is selected.');

  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const hl = t => esc(t).replace(/("[^"]*"|'[^']*')/g, '<span class="str">$1</span>').replace(/\b(\d+(\.\d+)?)\b/g, '<span class="num">$1</span>').replace(/\b(const|function|let|var|return)\b/g, '<span class="kw">$1</span>');
  const CODE_LEN = CODE.join('\n').length;
  function typeCode(n) {
    let left = n, html = '', cur = -1;
    for (let i = 0; i < CODE.length && left > 0; i++) { const t = CODE[i].slice(0, left); left -= CODE[i].length + 1; html += '<div class="ln">' + (hl(t) || ' ') + '</div>'; cur = i }
    codeIn.innerHTML = html;
    const lns = codeIn.children; if (lns[cur]) lns[cur].classList.add('cur');
    codeIn.style.transform = 'translateY(' + -Math.max(0, cur - 7) * 14.7 + 'px)';
  }

  /* ---------------- timeline (s) ---------------- */
  const T = { prompt: 0, code: 1.2, cands: 3.6, verify: 6.0, pick: 9.0, hold: 11.2, end: 12.0 };
  const ease = x => 1 - Math.pow(1 - x, 3), cl = x => Math.max(0, Math.min(1, x));
  function render(t) {
    const out = t >= T.hold;
    const stage = t < T.code ? 'prompt' : t < T.cands ? 'code' : t < T.verify ? 'cands' : t < T.pick ? 'verify' : 'pick';
    STAGES.forEach((st, i) => {
      const li = sts[st.k];
      li.classList.toggle('on', !out && st.k === stage);
      li.classList.toggle('seen', !out && t >= T[st.k]);
      li.classList.toggle('go', !out && i < STAGES.length - 1 && t >= T[STAGES[i + 1].k] - .35 && t < T[STAGES[i + 1].k] + .5);
    });
    const n = Math.floor(cl((t - .15) / .9) * PROMPT.length);
    qTxt.textContent = '“' + PROMPT.slice(0, n) + (n >= PROMPT.length ? '”' : '');
    typeCode(Math.floor(cl((t - T.code - .1) / 2.0) * CODE_LEN));
    thumbs.forEach((im, i) => im.classList.toggle('in', t >= T.cands + .15 + i * .32));
    rows.forEach((r, i) => {
      const p = ease(cl((t - T.verify - .15 - i * .4) / .7)), v = SCORES[i] * p;
      r.fill.style.width = (v * 10).toFixed(1) + '%';
      r.num.textContent = p > 0 ? v.toFixed(2) : '';
      r.el.classList.toggle('best', t >= T.verify + .15 + SCORES.length * .4 + .5 && i === BEST);
    });
    pickImg.classList.toggle('in', t >= T.pick + .1);
    pickNum.textContent = t >= T.pick + .1 ? SCORES[BEST].toFixed(2) : '';
  }
  if (RM) { render(T.hold - .01); return }

  let t = 0, last = 0, raf = 0, vis = false;
  function frame(ts) {
    raf = 0; if (!playing || !vis) return;
    t += last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
    if (t >= T.end) t = 0;
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && playing && vis) { last = 0; raf = requestAnimationFrame(frame) } }
  if (typeof watch === 'function') watch(root, v => { vis = v; kick() });
  else { vis = true; kick() }
  render(0);
})();
