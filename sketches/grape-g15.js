function setup() {
  createCanvas(512, 512, WEBGL);
  angleMode(DEGREES);
  background(245, 240, 235);
  brush.load();

  // Background wet wash
  brush.fill('#d6cce8', 160);
  brush.bleed(0.15, 'in');
  brush.beginShape(0.3);
  brush.vertex(-340, -340);
  brush.vertex(340, -340);
  brush.vertex(340, 340);
  brush.vertex(-340, 340);
  brush.endShape(CLOSE);

  // Stem and tendril
  brush.stroke('#3d2b4f');
  brush.strokeWeight(2);
  brush.line(84, -136, 58, -244);
  brush.line(58, -244, 17, -217);
  brush.line(58, -244, 84, -298);

  // Main grape clusters (clockwise circles via polygon approximation)
  brush.fill('#4a2c7a', 140);
  brush.bleed(0.2, 'out');

  const clusters = [
    [-24, -28], [17, -96], [-37, -123], [-78, -69], [-64, -15],
    [44, -42], [71, -109], [4, -163], [-50, -150], [-91, -96],
    [17, 39], [71, 12], [58, 93], [-10, 66], [-50, 39]
  ];
  for (let i = 0; i < clusters.length; i++) {
    const cx = clusters[i][0];
    const cy = clusters[i][1];
    const pts = [];
    for (let a = 0; a <= 360; a += 30) {
      pts.push([cx + 30 * cos(a), cy + 30 * sin(a)]);
    }
    brush.polygon(pts);
  }

  // Lighter violet highlights / overlapping grapes
  brush.fill('#8a6ecf', 110);
  brush.bleed(0.15, 'in');
  const highlights = [
    [-10, -42], [30, -82], [-50, -82], [4, 12], [64, -1], [-37, 26]
  ];
  for (let h of highlights) {
    brush.circle(h[0], h[1], 24);
  }

  // Outline accents sparse
  brush.stroke('#2e1a45');
  brush.strokeWeight(1);
  brush.line(-24, -28, 17, -96);
  brush.line(17, -96, -37, -123);
  brush.line(-78, -69, -64, -15);
  brush.line(58, -244, 84, -298);

  // Leaf
  brush.fill('#4d7a3d', 160);
  brush.bleed(0.2, 'out');
  brush.beginShape(0.4);
  brush.vertex(-91, -191);
  brush.vertex(-186, -110);
  brush.vertex(-145, -83);
  brush.vertex(-64, -151);
  brush.endShape(CLOSE);

  // Stem base
  brush.stroke('#3d2b4f');
  brush.strokeWeight(3);
  brush.line(58, -244, 58, -15);
}
