/* Data for the pipeline figure (js/figures/pipeline.js). Main's version cycles a coral-pear and a hydrangea group;
   here it is one grape group: the three grape paintings from the judge-tie figure plus demos/grape-pipe-4.webp.
   Render paints the first (g15_orig_moved.png, sample g15 of judge_s1 moved and enlarged) from the image; the code box shows the sketch that drew it (g15_orig_moved.js).
   Scores: PLACEHOLDER, not measured. */
window.FIG = {
  sketches: {}, // empty: Render paints from the image itself and ends exactly on it
  groups: {
    grapes: { short: "a bunch of grapes",
      code: "sketches/grape-g15.js",
      imgs: ["demos/grape-pipe-1.webp?v=stem", "demos/grape-tie-2.webp", "demos/grape-tie-1.webp", "demos/grape-pipe-4.webp"] }
  },
  placeholder: {
    pipeline: { grapes: [0.74,0.62,0.55,0.43] }
  }
};
