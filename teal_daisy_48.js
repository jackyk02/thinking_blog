function setup() {
  createCanvas(512, 512, WEBGL);
  angleMode(DEGREES);
  background(250, 248, 240);
  brush.load();

  // Petals
  brush.pick("pen");
  brush.stroke("#1e4e4e");
  brush.strokeWeight(1);
  brush.fill("#2a7a7a", 160);
  brush.bleed(0.15, "in");
  for (let i = 0; i < 12; i++) {
    let a = i * 30;
    let rx = cos(a) * 55;
    let ry = sin(a) * 55;
    brush.circle(rx, ry, 22);
    brush.line(rx * 0.7, ry * 0.7, rx * 1.1, ry * 1.1);
  }

  // Center
  brush.fill("#1a3a3a", 220);
  brush.bleed(0.1, "in");
  brush.circle(0, 0, 32);
  brush.fill("#d4a017", 230);
  brush.bleed(0.05, "in");
  brush.circle(0, 0, 14);

  // Stem
  brush.pick("pen");
  brush.stroke("#2a5a5a");
  brush.strokeWeight(2);
  brush.line(0, 30, 0, 160);
  brush.line(0, 160, 10, 220);
  brush.line(0, 160, -10, 210);

  // Leaves clockwise polygon
  brush.fill("#2a6a5a", 180);
  brush.bleed(0.15, "in");
  brush.polygon([[10,140],[60,130],[70,160],[30,170],[0,150]]);
  brush.polygon([[-10,150],[-60,140],[-70,170],[-30,180],[0,160]]);

  // Extra outline details
  brush.pick("rotring");
  brush.stroke("#1e3a3a");
  brush.strokeWeight(1);
  brush.line(0, 0, 15, -10);
  brush.line(0, 0, -15, -10);
}