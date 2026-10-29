# Figures

How the figures work, and which ones still wait on data.

## Animation

- **One painter for every painting** (`js/painter.js`). A painting with its p5.brush sketch replays call by call, like the cover. One without a sketch is rebuilt from the image as watercolour strokes (`js/strokes.js`, in a Web Worker): washes, then strokes along the edges, then detail, ending on the exact image.
- **Motion** is eased and calm, and runs only while a figure is on screen. With reduced motion, every figure shows its finished state.
- **Colour:** green for the verifier, grey for the judge.

## Placeholder data

Figures tagged "placeholder data" on the page use stand-in numbers until the real ones are in:

| Figure | Needs |
|---|---|
| Judge vs. verifier (four daisies) | The judge's scores and the verifier's 20 score-token probabilities for these four paintings |
| Break the tie | Verifier score-token probabilities from a multi-sample run (now simulated) |
| RL training pipeline | One logged training group: paintings, verifier scores, advantages, and the pear's sketch |
| Ties give GRPO no signal | The same logged group, scored by both the judge and the verifier |
| Human preference *(proposed section)* | Judge and verifier agreement and tie rate on the expert preference pairs |
| Best-of-N *(proposed section)* | About 50 prompts × 32 samples, each with judge, verifier and held-out scores |

The training-progress paintings replay exactly once their sketches are listed in `FIG.sketches` (`js/figures/data.js`).

## Files

`js/painter.js`, `js/strokes.js`, `js/hero.js`, `js/figures/*.js` (one per figure, plus `core.js` and `data.js`), `css/figures.css`.
