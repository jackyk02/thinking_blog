function setup() {
  createCanvas(512, 512, WEBGL);
  angleMode(DEGREES);
  background("#f6f2e0");
  brush.load();

  // Stem
  brush.pick("pen");
  brush.stroke("#2a5a40");
  brush.strokeWeight(2);
  brush.line(0, 80, 0, 220);

  // Petals
  brush.pick("pen");
  brush.stroke("#1a4a3a");
  brush.strokeWeight(1.5);

  for (let i = 0; i < 8; i++) {
    let a = i * 45;
    let cx = cos(a) * 45;
    let cy = sin(a) * 45;
    brush.fill("#2e8a7a", 160);
    brush.bleed(0.15, "in");
    brush.polygon([
      [cx, cy],
      [cx + cos(a - 20) * 55, cy + sin(a - 20) * 55],
      [cx + cos(a) * 75, cy + sin(a) * 75],
      [cx + cos(a + 20) * 55, cy + sin(a + 20) * 55]
    ]);
  }

  // Second layer petals for depth
  for (let i = 0; i < 8; i++) {
    let a = i * 45 + 22.5;
    let cx = cos(a) * 40;
    let cy = sin(a) * 40;
    brush.fill("#1f6b5a", 140);
    brush.bleed(0.1, "in");
    brush.polygon([
      [cx, cy],
      [cx + cos(a - 15) * 50, cy + sin(a - 15) * 50],
      [cx + cos(a) * 70, cy + sin(a) * 70],
      [cx + cos(a + 15) * 50, cy + sin(a + 15) * 50]
    ]);
  }

  // Center
  brush.pick("pen");
  brush.stroke("#bfa100");
  brush.strokeWeight(1);
  brush.fill("#e6b800", 200);
  brush.bleed(0.05, "in");
  brush.circle(0, 0, 30);

  brush.fill("#c98a00", 220);
  brush.bleed(0.1, "in");
  brush.circle(0, 0, 20);

  // Small center detail
  brush.pick("rotring");
  brush.stroke("#5a3a00");
  brush.strokeWeight(1);
  brush.line(-8, -2, 8, 2);
  brush.line(-5, 4, 5, -4);
}