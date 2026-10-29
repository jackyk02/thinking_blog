# Review notes for Jacky (branch `sn/figures`)

Surya's figure proposal. The prose is unchanged. These are things in the draft that look wrong or unsupported, plus what the new placeholder figures need. Numbers were checked against the post's own chart data (now in `js/figures/data.js`) and the Oct 17 run report (`paint_rl_report_v2 (1).html`).

## Numbers to check before publishing

1. **"+7%" on the held-out chart, and "7% absolute improvement" in its caption.** 0.761 − 0.693 = 0.068: that is 6.8 points absolute, or 9.8% relative. "+7%" reads as relative. Suggest "+0.07" or "+6.8 pts (9.8% relative)". The chart still shows "+7%" as before. Also, the plotted end values are 0.7618 and 0.6938, which round to 0.762 and 0.694. The caption says 0.761 and 0.693.
2. **Steps 410–500 come from two seeds, traced by hand.** The old chart code says this tail is "mean of the 2 seeds that ran longer, traced from the report chart (approximate)", but the caption says three seeds. Either say so, or end at step 400, where the three-seed means are 0.720 vs 0.686 (report table, steps 380–400: 0.719 vs 0.684).
3. **The sample-efficiency table doesn't match the plotted curves.** None of the rules I tried reproduces the table:

   | Target | Table J / V (speedup) | First crossing of the plotted mean J / V (speedup) | Mean of per-seed first crossings J / V |
   |---|---|---|---|
   | 0.60 | 180 / 140 (1.29×) | 160 / 140 (1.14×) | 155 / 133 |
   | 0.65 | 330 / 200 (1.65×) | 320 / 190 (1.68×) | 245 / 193 |
   | 0.68 | 400 / 260 (1.54×) | 390 / 250 (1.56×) | 355 / 262 |

   Please state the rule (smoothing? per seed?). Because of this mismatch, I left out the "drag a target score" figure: it would print the curve's crossings right next to the table's different numbers.
4. **Judge scale.** The report says the v3 judge writes one letter A–J per criterion, on three criteria. The post only says the judge "may assign both a score of 5" and "scores each painting separately on a discrete scale". Please name the scale. The daisy figure draws the judge on 10 levels (A–J), with both paintings at 5.
5. **Verifier scale and settings.** The prompt box shows `SCORE_1_TO_20`, but the report says the verifier reads A–T letter tokens (G = 20), each pair judged four times (K = 4), on three criteria (C = 3). The post never gives the values of C, K and G that were used. Worth one line.
6. **"Normalized within each group".** The report says advantages are *centered* (reward minus group mean) within groups of 5, not divided by the standard deviation. The pipeline and GRPO figures follow the report. Consider writing "centered".
7. **Pairwise scoring isn't explained.** The prompt compares paintings A and B, and the report says every pair in the group is scored, in both orders. The post never says how pairwise scores become one reward per painting (the mean over its pairings?).
8. **Intro claims 2 and 3 have no evidence in the post.** "Verifiers better align with human preferences" and "better signals for test-time scaling" are also repeated in the conclusion ("improves alignment with human preferences"). I added two short placeholder subsections under Results (see below). Delete them if those results won't exist by publication, and soften the intro and conclusion.
9. **The daisy tie example.** `1.jpg` and `2.jpg` are byte-identical to `demos/crimson-daisy-iter3.jpg` and `-iter4.jpg`, i.e. steps 300 and 400 of the verifier run. Was the judge actually run on them? If not, the "5 = 5" is illustrative and the caption should say so.
10. **The tie-rate series** runs to step 286 (judge) and 275 (verifier), from one run each? The caption doesn't say which seed(s). The quoted numbers check out: 26.6% over steps 0–49, 42.5% at step 250.
11. **The example groups** used in the new figures (coral pear, sepia hydrangea) are real paintings from the *Phase 1 pairwise* run at step 250, not from v3. That's fine for illustration, but swap them for a v3 group once one is logged.
12. **The violet-daisy row was `hidden`** in the old step grid. Its images exist and are fine. They looked broken in screenshots only because lazy images inside a hidden row never load. The new figure shows the row. If it was hidden on purpose, remove it from `FIG.demos.top` in `js/figures/data.js`.
13. Minor: the heading "Painting Quality over RL training" has mixed capitalisation.

## Figures that use placeholder or simulated data

Each one carries an amber "placeholder data" or "simulated" tag. All placeholder values are in `FIG.placeholder` / `FIG.sim` in `js/figures/data.js`.

| Figure | What is placeholder | Data needed |
|---|---|---|
| Daisies (Limitations) | judge token, verifier distributions | for all four crimson daisies (`demos/crimson-daisy-iter1/2.jpg`, `1.jpg`, `2.jpg`): the judge's actual outputs and the verifier's 20 score-token probabilities (one call per criterion) |
| Break the tie (How it works) | simulated | the verifier's token probabilities for one group at C = 3, K = 4, G = 20 (keep K = 8 to subsample), plus judge outputs for the same group |
| Pipeline | verifier scores per painting | one logged v3 training group: 5 sketches, renders, pairwise scores, advantages |
| Ties give GRPO nothing (Pipeline) | judge and verifier scores | the same 5 renders re-scored with the judge prompt and the verifier |
| Agreement with human preferences (new) | everything | BrushArena pairs with vote counts; judge and verifier run on each pair, both orders. Suggested "clear majority" threshold: ≥ 80% of ≥ 5 voters |
| Test-time scaling (new) | the curve | ~50 held-out prompts × 32 samples from the final checkpoint; judge, verifier and Kimi-K2.6 score for every sample |

Real data: the held-out curves, the tie-rate chart, the table, and all paintings.

## What changed (for orientation)

- Figures live in `js/figures/*.js`, styles in `css/figures.css`, data in `js/figures/data.js`. No new libraries.
- Removed the inline chart and pipeline code and their CSS. The tie-rate chart moved to `js/figures/tie-rate.js` unchanged.
- The two new subsections are marked with `<!-- PROPOSAL -->` comments in `index.html`.

## Round 2: animated figures (Surya's visual review)

- **The paintings now paint themselves, but these are not replays.** The cover replays the real `flower.js`. For the other paintings (`demos/`, `img/group/`) there are no sketches in the repo, so `js/figures/painter.js` rebuilds a reveal from each image: it splits the image into colour regions, lays them down as washes (lights first, darks last, each blooming from its deepest point with a ragged wet edge), then sharpens to the real image. The last frame is the image itself. **To make these exact replays, we need the p5.brush sketches** for: `demos/*-iter{1..4}.jpg` (9 prompts × 4 steps) and the pear and hydrangea groups in `img/group/`. With them, the cover's capture code (`js/hero.js`, `precompute`) can produce per-call layers for the same playback.
  - Painting quality over training: each step's three paintings paint in as the curves reach that step (rows ~0.5 s apart, ~3 s each). Off-screen paintings wait.
  - Limitations of LLM-as-a-Judge: redesigned to read from the paintings alone. Four crimson daisies from one prompt (steps 100–400; `1.jpg` and `2.jpg` are steps 300 and 400) land in one pile at 5 on the judge's 10-level scale, then the same four slide apart on the verifier's 20-token scale, each with a soft glow for its distribution. **The two extra paintings add two more placeholder distributions** (`FIG.placeholder.daisies`), and the order of the four on the verifier scale is a guess. The caption now says "four daisies". If you would rather keep exactly the two paintings from the text, set `imgs` to the last two entries.
  - RL Training Pipeline: at Render, each of the five sketches' code lines lights up in turn and dissolves as the washes it stands for bloom on the paper, the five a beat apart; then Verify, Normalise, Update as before. The code lines are schematic (grey bars, not real code). With the group's real sketches, the bars could be the real lines, as on the cover. The rail now has fewer sub-labels (Inkling-Small under Code and Verify, GRPO under Update).
  - Results: the "more paintings" figure is now one painting, a quiet step scrubber (100–400) and the six prompts as small thumbnails. On first view, and when a prompt is picked, it paints step 100 and then repaints itself at 200, 300 and 400. Dragging the scrubber cross-fades between steps. The figure's title and subtitle became its caption (same words). The sample-efficiency table keeps its numbers, restyled to be quieter (no row rules, judge and verifier columns in their colours).
