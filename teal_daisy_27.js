function setup() {
  createCanvas(512, 512, WEBGL);
  angleMode(DEGREES);
  background("#fdfcf7");
  brush.load();

  // light teal wash background hint
  brush.pick("spray");
  brush.fill("#2a6b6b", 80);
  brush.bleed(0.15, "in");
  brush.circle(0, 0, 140);

  // petals
  brush.pick("pen");
  brush.stroke("#1a4d4d");
  brush.strokeWeight(1.5);
  brush.fill("#2a7a7a", 130);
  brush.bleed(0.2, "in");

  for (let i = 0; i < 12; i++) {
    let ang = i * 30;
    let cx = cos(ang) * 90;
    let cy = sin(ang) * 90;
    brush.polygon([
      [cx, cy],
      [cx + cos(ang - 15) * 55, cy + sin(ang - 15) * 55],
      [cx + cos(ang) * 90, cy + sin(ang) * 90],
      [cx + cos(ang + 15) * 55, cy + sin(ang + 15) * 55]
    ]);
  }

  // second layer petals deeper
  brush.fill("#1a5a5a", 160);
  brush.bleed(0.1, "in");
  for (let i = 0; i < 12; i++) {
    let ang = i * 30 + 15;
    let cx = cos(ang) * 85;
    let cy = sin(ang) * 85;
    brush.polygon([
      [cx, cy],
      [cx + cos(ang - 10) * 50, cy + sin(ang - 10) * 50],
      [cx + cos(ang) * 85, cy + sin(ang) * 85],
      [cx + cos(ang + 10) * 50, cy + sin(ang + 10) * 50]
    ]);
  }

  // center
  brush.pick("rotring");
  brush.stroke("#143333");
  brush.strokeWeight(2);
  brush.fill("#0e3a3a", 200);
  brush.bleed(0.1, "in");
  brush.circle(0, 0, 38);

  // center detail
  brush.pick("2B");
  brush.stroke("#0a2a2a");
  brush.strokeWeight(1);
  brush.fill("#082f2f", 220);
  brush.circle(0, 0, 22);

  // sparse outlines
  brush.pick("pen");
  brush.stroke("#164d4d");
  brush.strokeWeight(1);
  for (let i = 0; i < 12; i++) {
    let ang = i * 30;
    brush.line(0, 0, cos(ang)*95, sin(ang)*95);
  }

  // stem
  brush.pick("pen");
  brush.stroke("#145454");
  brush.strokeWeight(2.5);
  brush.line(0, 35, 0, 160);
  brush.line(10, 40, 8, 150);

  // small leaf
  brush.fill("#2d6a6a", 140);
  brush.bleed(0.15, "in");
  brush.polygon([[10, 100], [45, 90], [30, 120], [10, 115]]);

  brush.pick("pen");
  brush.stroke("#164d4d");
  brush.line(10, 100, 40, 95);
  brush.line(10, 115, 30, 120);
}