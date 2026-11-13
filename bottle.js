/* Ambere — 3D perfume favour, modelled on the owner's bottle photos.
   Square thick-glass bottle with champagne perfume, slanted black cap, knurled gold collar
   and the gold monogram clip on the front. Lit by a procedural photo studio (softboxes) so the glass
   shows the long bright highlights of a product photograph. Loaded only when its section is near. */
import * as THREE from 'three';

/* ---------- geometry helpers ---------- */
function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// block (outer size w×h×d) with one flat 45° chamfer on every edge: the cut-glass facet
function facetBlock(w, h, d, bevel, r = 0.012) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, h - 2 * bevel, r), {
    depth: d - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3
  });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g.toNonIndexed();
}
// square prism / frustum (cylinder with 4 sides, turned 45° so the faces line up with x/z)
function squarePrism(sideBottom, sideTop, h) {
  const g = new THREE.CylinderGeometry(sideTop / Math.SQRT2, sideBottom / Math.SQRT2, h, 4, 1);
  g.rotateY(Math.PI / 4); return g.toNonIndexed();
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- procedural photo studio: softboxes reflected by the glass ---------- */
function studio(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x1c1915, side: THREE.BackSide })));
  const box = (w, h, x, y, z, k, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  box(1.1, 9, -6, 1.5, 3, 5);           // tall strip, left front: the long highlight down the glass
  box(0.9, 9, 6.5, 1, 1.5, 4);          // tall strip, right
  box(9, 5, 0, 9, 0, 1.8, 0xfff1dc);      // big warm overhead
  box(10, 3, 0, 1, -8, 2.5, 0xffd7a0);  // warm light behind: makes the perfume glow
  box(14, 2, 0, -6, 0, 0.6);            // floor bounce
  box(7, 6, 0, -0.6, 8, 1.25, 0xffe9c4);  // broad front fill, set low: a camera looking slightly down sees flat gold mirror this
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture; pm.dispose();
  return tex;
}
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), gr = x.createRadialGradient(128, 128, 6, 128, 128, 128);
  gr.addColorStop(0, 'rgba(40,28,10,.55)'); gr.addColorStop(.45, 'rgba(40,28,10,.2)'); gr.addColorStop(1, 'rgba(40,28,10,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function mount(stage, { reduced = false } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch (e) { stage.classList.add('no3d'); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xFBF8F1);
  scene.environment = studio(renderer);
  // no direct 'sun': on smooth flat glass it flashes whole faces white; the softboxes carry the highlights
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6d9c3, 2.2));

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

  /* ---- proportions (body width = 1), measured from the owner's photos:
     height ≈ 0.95 W, depth ≈ 0.55 W, cap ≈ 0.38 W square, collar ≈ 0.35 W wide ---- */
  const W = 1, H = 0.95, D = 0.55, R = 0.055, WALL = 0.095, BASE = 0.16, TOP = 0.11;
  const mat = {
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x000000, roughness: 0, metalness: 0, specularIntensity: 1, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0,
      envMapIntensity: 1.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }),
    inner: new THREE.MeshPhysicalMaterial({
      color: 0x000000, roughness: 0.02, metalness: 0, specularIntensity: 0.7, ior: 1.52, envMapIntensity: 1.1,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
    }),
    tint: new THREE.MeshBasicMaterial({ color: 0xf7f3ea, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false }),
    perfume: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0, metalness: 0, transmission: 1, thickness: 0.6, ior: 1.4, dispersion: 2,
      attenuationColor: new THREE.Color(0xf4b45a), attenuationDistance: 0.7, specularIntensity: 0.8, envMapIntensity: 1.3
    }),
    cap: new THREE.MeshPhysicalMaterial({ color: 0x020202, roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4, flatShading: false }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xf2cf86, metalness: 1, roughness: 0.34, envMapIntensity: 2.6, emissive: 0x4d3510, emissiveIntensity: 0.35 })
  };

  // In three r170 a material's envMapIntensity only applies when the map is set on the material itself
  // (scene.environment always uses full strength), so the glass and cap get the studio map directly.
  const envTex = scene.environment;
  [[mat.glass, 0.22], [mat.inner, 0.15], [mat.cap, 0.22]].forEach(([m, k]) => { m.envMap = envTex; m.envMapIntensity = k; });

  // upright rounded block: rounded vertical edges (radius r) and softly eased top/bottom edges
  function prismY(w, d, h, r, b) {
    const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * b, d - 2 * b, Math.max(r - b, 0.004)), {
      depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10
    });
    g.rotateX(-Math.PI / 2); g.translate(0, b, 0); g.computeVertexNormals(); return g;
  }

  const bottle = new THREE.Group();
  // the rounded cavity inside the thick glass; perfume fills most of it
  const cw = W - 2 * WALL, cd = D - 2 * WALL, cavH = H - BASE - TOP, juiceH = cavH * 0.86;
  const perfume = new THREE.Mesh(prismY(cw - 0.006, cd - 0.006, juiceH, 0.1, 0.035), mat.perfume);
  perfume.position.y = BASE + 0.003; bottle.add(perfume);
  const surface = new THREE.Mesh(prismY(cw - 0.01, cd - 0.01, 0.005, 0.1, 0.002), mat.glass);
  surface.position.y = BASE + 0.003 + juiceH - 0.002; surface.renderOrder = 3; bottle.add(surface);
  const cavity = new THREE.Mesh(prismY(cw, cd, cavH, 0.1, 0.045), mat.inner); cavity.position.y = BASE; cavity.renderOrder = 2; bottle.add(cavity);
  // thin clear dip tube from the neck to the bottom of the cavity
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, H - 0.02, 0), V(0.01, H * 0.6, 0.02), V(0.05, BASE + 0.04, 0.03), V(0.09, BASE + 0.012, 0.03)]), 40, 0.008, 8), mat.inner);
  tube.material = mat.glass; tube.renderOrder = 3; bottle.add(tube);
  // outer glass: warm absorption layer + additive reflections
  const bodyGeo = prismY(W, D, H, R, 0.022);
  const tint = new THREE.Mesh(bodyGeo, mat.tint); tint.renderOrder = 4; bottle.add(tint);
  const body = new THREE.Mesh(bodyGeo, mat.glass); body.renderOrder = 5; bottle.add(body);

  // gold collar with a dense diamond knurl (staggered rows of tiny beads around a gold core)
  const rows = 9, perRow = 52, CR = 0.168, rowGap = 0.0135, collarH = rows * rowGap + 0.01;
  const beads = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.0085, 0), mat.gold, rows * perRow), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1.25, 0.7);
  for (let r = 0; r < rows; r++) for (let i = 0; i < perRow; i++) {
    const a = (i + (r % 2) * 0.5) / perRow * Math.PI * 2;
    q.setFromAxisAngle(V(0, 1, 0), -a);
    m4.compose(V(Math.cos(a) * CR, H + 0.01 + r * rowGap, Math.sin(a) * CR), q, sc); beads.setMatrixAt(r * perRow + i, m4);
  }
  bottle.add(beads);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(CR - 0.002, CR - 0.002, collarH, 48), mat.gold);
  core.position.y = H + collarH / 2; bottle.add(core);
  const collarTop = H + collarH;
  [H + 0.004, collarTop - 0.003].forEach(y => { const lip = new THREE.Mesh(new THREE.TorusGeometry(CR + 0.003, 0.0065, 10, 56), mat.gold); lip.rotation.x = Math.PI / 2; lip.position.y = y; bottle.add(lip); });
  // thin dark gap between collar and cap, as on the real bottle
  const GAP = 0.012, gap = new THREE.Mesh(new THREE.CylinderGeometry(CR - 0.02, CR - 0.02, GAP, 32), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
  gap.position.y = collarTop + GAP / 2; bottle.add(gap);

  // black cap: a square block with softly bevelled edges whose top is cut by one slanted plane
  // (tall side 0.42 W, short side 0.3 W)
  const capW = 0.38, hiH = 0.42, loH = 0.30;
  const capGeo = prismY(capW, capW, hiH, 0.014, 0.009), cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setY(i, cp.getY(i) * (loH + (hiH - loH) * (0.5 - cp.getX(i) / capW)) / hiH);
  capGeo.computeVertexNormals();
  const cap = new THREE.Mesh(capGeo, mat.cap); cap.position.y = collarTop + GAP; bottle.add(cap);
  const capTopY = collarTop + GAP + hiH;

  // Gold monogram. Front: traced from the official product photo (3x crop, glass face 780 px wide).
  // Left side: traced from the owner's side photo (side face 263 px deep, 537 px per unit).
  // Every piece is a smooth strip that follows its centre line with its real width, raised well off the glass.
  const polished = new THREE.MeshPhysicalMaterial({ color: 0xf0c468, metalness: 1, roughness: 0.4, emissive: 0x8a5f18, emissiveIntensity: 0.5 });
  const mono = new THREE.Group(), sideG = new THREE.Group(), z0 = D / 2 + 0.003, TH = 0.022, BV = 0.0048;
  sideG.rotation.y = -Math.PI / 2; sideG.position.set(-W / 2 - 0.003, 0, D / 2); mono.add(sideG);   // its local x runs back along the side, local z points out of the side
  const front = { map: (X, Y) => { const x = (X - 605) / 620 - 0.01; return [x, 1.075 - 0.001398 * Y - 0.16 * (0.47 - x)]; }, px: 715, grp: mono };
  const side = { map: (X, Y) => [(X - 435) / 263 * D, (830 - Y) / 510 * H], px: 537, grp: sideG };
  const plate = (shape, z, grp) => {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: TH - 2 * BV, bevelEnabled: true, bevelThickness: BV, bevelSize: BV * 0.8, bevelSegments: 3, curveSegments: 12 }), polished);
    m.position.z = z + BV; grp.add(m); return m;
  };
  // strip along a centre line: pts in photo pixels, widths (px) spread evenly along its length
  const stroke = (f, pts, wpx, z, n = 56) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([X, Y]) => { const [x, y] = f.map(X, Y); return V(x, y, 0); }), false, 'centripetal');
    const ws = Array.isArray(wpx) ? wpx : [wpx, wpx], left = [], right = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPoint(u), tg = curve.getTangent(u);
      const k = u * (ws.length - 1), a = Math.min(Math.floor(k), ws.length - 2), w = (ws[a] + (ws[a + 1] - ws[a]) * (k - a)) / f.px / 2 - BV * 0.8;
      left.push(new THREE.Vector2(p.x - tg.y * w, p.y + tg.x * w)); right.push(new THREE.Vector2(p.x + tg.y * w, p.y - tg.x * w));
    }
    return plate(new THREE.Shape(left.concat(right.reverse())), z, f.grp);
  };
  const rivet = (f, X, Y, z) => {
    const [x, y] = f.map(X, Y), r = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.011, 20), polished);
    r.rotation.x = Math.PI / 2; r.position.set(x, y, z + TH + 0.0045); f.grp.add(r);
  };
  const L1 = z0, L2 = z0 + 0.015, L3 = z0 + 0.03;          // stacked layers: the pieces weave over each other

  // ---- front face ----
  // two strands that leave the left corner and cross: one runs right and down, one rises to the main bar
  stroke(front, [[300, 308], [330, 312], [400, 332], [470, 375], [540, 415], [598, 440]], [44, 46, 46], L1);
  stroke(front, [[300, 412], [330, 405], [400, 378], [450, 340], [485, 312]], 44, L1 + 0.006);
  // the "S" loop: up and over, down the right side, ending in a small hook
  stroke(front, [[478, 268], [520, 232], [580, 208], [650, 212], [710, 250], [745, 320], [752, 400], [745, 470], [722, 525], [690, 548], [668, 548]], [44, 46, 46, 44, 40, 34, 30, 26], L2, 90);
  // main bar: upper-left, through the junction, bending into the long diagonal to the bottom-right rivet
  stroke(front, [[300, 226], [430, 268], [540, 312], [640, 352], [700, 420], [780, 510], [850, 592], [905, 662]], [46, 48, 46, 42, 38, 34, 30], L3, 80);
  rivet(front, 893, 648, L3);
  // right arm: from the junction almost level to the top-right rivet
  stroke(front, [[625, 348], [760, 318], [918, 288]], [40, 42, 40], L3);
  rivet(front, 906, 291, L3);

  // ---- left side face: the same bars carry on round the corner to the back edge ----
  const S1 = 0.002, S2 = 0.017;
  const sideY = y => 830 - y * 510 / H;                       // bottle height -> side-photo pixel row
  const [, yMain] = front.map(300, 226), [, yUp] = front.map(300, 308), [, yLow] = front.map(300, 412);
  // long bar: from the corner (continuing the front's upper strand) to the back edge
  stroke(side, [[470, sideY(yUp)], [400, sideY(yUp) - 6], [300, 540], [186, 512]], [40, 40, 38], S2);
  // leg dropping from the back end of the bar to the rivet near the base
  stroke(side, [[204, 528], [212, 640], [234, 778]], [38, 36, 32], S1);
  rivet(side, 220, 750, S1);
  // C-shaped arc: from its rivet above the bar, round and down to the corner (continuing the front's lower strand)
  stroke(side, [[388, 410], [334, 438], [306, 480], [296, 545], [318, 600], [380, sideY(yLow) + 4], [470, sideY(yLow)]], [30, 34, 36, 36, 36], S1, 80);
  rivet(side, 352, 428, S1);
  // the front's main bar wraps the corner and ends in a short stub
  stroke(side, [[470, sideY(yMain)], [425, sideY(yMain) - 2]], 42, S1);
  // rounded bends that carry each bar round the corner: a quarter ring hugging the glass edge
  const bend = (yc, h, lift) => {
    const ri = R + 0.004, ro = ri + TH + lift, q = new THREE.Shape();
    q.absarc(0, 0, ro, Math.PI, 1.5 * Math.PI, false); q.lineTo(0, -ri); q.absarc(0, 0, ri, 1.5 * Math.PI, Math.PI, true); q.lineTo(-ro, 0);
    const g = new THREE.ExtrudeGeometry(q, { depth: h, bevelEnabled: false, curveSegments: 16 }); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, polished); m.position.set(-W / 2 + R, yc - h / 2, D / 2 - R); mono.add(m);
  };
  bend(yMain, 0.058, 0.03); bend(yUp, 0.06, 0.012); bend(yLow, 0.06, 0.004);
  bottle.add(mono);

  const lift = -capTopY / 2;
  bottle.position.y = lift; scene.add(bottle);

  // soft contact shadow on the paper
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = lift - 0.002; scene.add(shadow);

  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 128;
  { const g2 = glowC.getContext('2d'), gr = g2.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(240,176,70,.5)'); gr.addColorStop(1, 'rgba(240,176,70,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128); }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowC), transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0.22, lift + 0.001, 0.3); scene.add(glow);

  /* ---- drag to turn (sideways only, so vertical swipes still scroll the page) ---- */
  let angle = -0.42, vel = 0, dragging = false, lastX = 0, moved = false;
  let running = false, onScreen = false, last = 0, held = false;
  const el = renderer.domElement;
  function draw() { bottle.rotation.y = angle; renderer.render(scene, camera); }

  /* ---- framing ---- */
  const target = new THREE.Vector3(0, 0.02, 0);
  function resize() {
    const w = stage.clientWidth - 16, h = stage.clientHeight - 16; if (w < 50 || h < 50) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const dist = w / h < 0.8 ? 5.2 : 4.9;
    camera.position.set(0, 0.9, dist); camera.lookAt(target); camera.updateProjectionMatrix();
    if (!running) draw();
  }

  el.addEventListener('pointerdown', e => { dragging = true; moved = true; lastX = e.clientX; vel = 0; el.setPointerCapture(e.pointerId); stage.classList.add('touched'); update(); });
  el.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.011; angle += vel; });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  stage.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    angle += e.key === 'ArrowRight' ? 0.25 : -0.25; vel = 0; moved = true; e.preventDefault(); stage.classList.add('touched'); if (!running) draw();
  });

  /* ---- render loop: only while on screen and the tab is visible ---- */
  function tick(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000 || 0, 0.05); last = t;
    if (!dragging) { vel *= 0.93; angle += vel; if (!reduced && Math.abs(vel) < 0.002) angle += dt * 0.3; }
    draw(); requestAnimationFrame(tick);
  }
  function update() {
    const want = !held && onScreen && !document.hidden && (!reduced || moved || dragging);
    if (want && !running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
    if (!want) running = false;
  }
  resize(); new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; update(); }).observe(stage);
  document.addEventListener('visibilitychange', update);
  draw(); stage.classList.add('ready');
  // setAngle holds the bottle still at one angle (used when checking the model against photos)
  return { scene, setAngle: a => { held = true; angle = a; vel = 0; running = false; draw(); } };
}
