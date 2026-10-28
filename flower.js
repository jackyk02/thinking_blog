function setup() {
  createCanvas(512, 512, WEBGL);
  angleMode(DEGREES);
  background("#f4f1e8");
  brush.load();

  // No outlines
  brush.noStroke();

  // Center wash
  brush.pick("pen");
  brush.fill("#d4902a", 200);
  brush.bleed(0.1, "in");
  brush.circle(0, 0, 55);

  // Center deeper
  brush.pick("marker");
  brush.fill("#8a3a10", 200);
  brush.bleed(0.1, "in");
  brush.circle(0, 0, 35);

  // Small center detail
  brush.pick("rotring");
  brush.fill("#4a1a05", 220);
  brush.circle(0, 0, 18);

  // Petals layer 1
  brush.pick("pen");
  brush.fill("#7B8FD9", 160);
  brush.bleed(0.2, "in");
  let r0 = 55;
  for (let i = 0; i < 12; i++) {
    let a = i * 30;
    let x1 = cos(a) * 60;
    let y1 = sin(a) * 60;
    let x2 = cos(a) * 130;
    let y2 = sin(a) * 130;
    brush.polygon([[cos(a - 6) * r0, sin(a - 6) * r0], [x1, y1], [x2, y2], [x1 - 15, y1 + 10], [cos(a + 6) * r0, sin(a + 6) * r0]]);
  }

  // Petals layer 2
  brush.pick("rotring");
  brush.fill("#5466B8", 180);
  brush.bleed(0.15, "in");
  for (let i = 0; i < 12; i++) {
    let a = i * 30 + 15;
    let x1 = cos(a) * 70;
    let y1 = sin(a) * 70;
    let x2 = cos(a) * 140;
    let y2 = sin(a) * 140;
    brush.polygon([[cos(a - 6) * r0, sin(a - 6) * r0], [x1, y1], [x2, y2], [x1 - 10, y1 + 10], [cos(a + 6) * r0, sin(a + 6) * r0]]);
  }

  // Leaves
  brush.pick("pen");
  brush.fill("#3d7a4f", 140);
  brush.bleed(0.1, "in");
  brush.polygon([[0, 140], [60, 110], [80, 150], [40, 170], [10, 160]]);
  brush.polygon([[0, 160], [-70, 120], [-90, 160], [-40, 170], [0, 150]]);

  // Stem
  brush.pick("pen");
  brush.stroke("#3d7a4f");
  brush.strokeWeight(1.5);
  brush.line(0, 130, 0, 205);
}
