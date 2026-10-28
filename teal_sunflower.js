function setup() {
  createCanvas(512, 512, WEBGL);
  angleMode(DEGREES);
  background("#f4f1e8");
  brush.load();

  // Stem
  brush.pick("pen");
  brush.stroke("#2a5a3a");
  brush.strokeWeight(2);
  brush.line(0, 40, 0, 200);
  brush.line(-10, 100, 10, 140);
  brush.line(10, 120, -10, 160);

  // Leaves
  brush.pick("pen");
  brush.fill("#3d7a4f", 140);
  brush.bleed(0.1, "in");
  brush.polygon([[0, 140], [60, 110], [80, 150], [40, 170], [10, 160]]);
  brush.polygon([[0, 160], [-70, 120], [-90, 160], [-40, 170], [0, 150]]);

  // Petals layer 1
  brush.pick("pen");
  brush.fill("#2a8a8a", 160);
  brush.bleed(0.2, "in");
  for (let i = 0; i < 12; i++) {
    let a = i * 30;
    let x1 = cos(a) * 60;
    let y1 = sin(a) * 60;
    let x2 = cos(a) * 130;
    let y2 = sin(a) * 130;
    brush.polygon([[0, 0], [x1, y1], [x2, y2], [x1 - 15, y1 + 10], [0, 10]]);
  }

  // Petals layer 2 (teal deeper)
  brush.pick("rotring");
  brush.fill("#1a6a6a", 180);
  brush.bleed(0.15, "in");
  for (let i = 0; i < 12; i++) {
    let a = i * 30 + 15;
    let x1 = cos(a) * 70;
    let y1 = sin(a) * 70;
    let x2 = cos(a) * 140;
    let y2 = sin(a) * 140;
    brush.polygon([[0, 0], [x1, y1], [x2, y2], [x1 - 10, y1 + 10], [0, 5]]);
  }

  // Petal outlines sparse
  brush.pick("2B");
  brush.stroke("#1a3a3a");
  brush.strokeWeight(1);
  for (let i = 0; i < 12; i++) {
    let a = i * 30;
    brush.line(0, 0, cos(a)*140, sin(a)*140);
  }

  // Center wash
  brush.pick("pen");
  brush.fill("#d4902a", 200);
  brush.bleed(0.1, "in");
  brush.circle(0, 0, 55);

  // Center texture
  brush.pick("2B");
  brush.stroke("#4a2e10");
  brush.strokeWeight(1.5);
  for (let i = 0; i < 10; i++) {
    let ang = i * 36;
    brush.line(cos(ang)*20, sin(ang)*20, cos(ang)*45, sin(ang)*45);
  }

  // Center deeper
  brush.pick("marker");
  brush.fill("#8a3a10", 200);
  brush.bleed(0.1, "in");
  brush.circle(0, 0, 35);

  // Small center detail
  brush.pick("rotring");
  brush.fill("#4a1a05", 220);
  brush.circle(0, 0, 18);

  // Stem outline
  brush.pick("2B");
  brush.stroke("#2a3a2a");
  brush.strokeWeight(1);
  brush.line(0, 40, 0, 200);
}