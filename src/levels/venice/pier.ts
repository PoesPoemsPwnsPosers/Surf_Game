import * as THREE from 'three';
import { BOARDWALK, PIER, SAND_PROFILE, veniceLand } from './layout';

/**
 * Venice Pier, the surf shop on its sea end, and a few boardwalk props.
 * All simple shapes for now (see CREDITS.md).
 */

function flat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** A sign painted onto a canvas, so no font or image file is needed. */
function makeSign(text: string, bg: string, fg: string, width: number, height: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const g = canvas.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = fg;
  g.font = `900 italic ${Math.round(canvas.height * 0.62)}px "Trebuchet MS", "Avenir Next", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex }));
}

function makeRailing(group: THREE.Group, x: number, z0: number, z1: number, y: number, mat: THREE.Material): void {
  const len = Math.abs(z1 - z0);
  group.add(box(0.14, 0.12, len, mat, x, y + 1.05, (z0 + z1) / 2));
  group.add(box(0.1, 0.08, len, mat, x, y + 0.55, (z0 + z1) / 2));
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1) + 0.01; z += 3) group.add(box(0.16, 1.1, 0.16, mat, x, y + 0.55, z));
}

function makeLifeguardTower(): THREE.Group {
  const g = new THREE.Group();
  const wood = flat(0xf4f1e8);
  const blue = flat(0x4aa3df);
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) g.add(box(0.22, 3, 0.22, wood, x, 1.5, z));
  g.add(box(3.6, 0.2, 3.6, wood, 0, 3, 0));
  g.add(box(2.6, 2, 2.6, blue, 0, 4.1, 0.3));
  const roof = box(3.4, 0.2, 3.6, flat(0xff5a5f), 0, 5.3, 0.2);
  roof.rotation.x = 0.12;
  g.add(roof);
  const ramp = box(1.2, 0.14, 4.2, wood, 0, 1.5, -3.6);
  ramp.rotation.x = -0.75;
  g.add(ramp);
  return g;
}

export function buildPier(scene: THREE.Scene): void {
  const P = PIER;
  const g = new THREE.Group();
  const planks = flat(0xb98a5e);
  const planksDark = flat(0x9c7149);
  const post = flat(0x6f5138);
  const rail = flat(0xf4f1e8, 0.7);
  const thick = 0.5;

  // Deck: level section, then the ramp down to the boardwalk.
  const levelLen = P.rampTopZ - P.seaEndZ;
  g.add(box(P.width, thick, levelLen, planks, P.x, P.deckY - thick / 2, (P.seaEndZ + P.rampTopZ) / 2));
  // Darker cross planks so movement along the pier reads.
  for (let z = P.seaEndZ + 2; z < P.rampTopZ; z += 4) g.add(box(P.width, 0.03, 0.5, planksDark, P.x, P.deckY + 0.01, z));
  const bottomY = SAND_PROFILE[4].y;
  const rampLen = Math.hypot(P.rampBottomZ - P.rampTopZ, P.deckY - bottomY);
  const ramp = box(P.width, thick, rampLen, planks, P.x, (P.deckY + bottomY) / 2 - thick / 2, (P.rampTopZ + P.rampBottomZ) / 2);
  ramp.rotation.x = Math.atan2(P.deckY - bottomY, P.rampBottomZ - P.rampTopZ);
  g.add(ramp);

  // The wide platform at the sea end.
  const headZ = P.seaEndZ + P.headLength / 2;
  g.add(box(P.headWidth, thick, P.headLength, planks, P.x, P.deckY - thick / 2 - 0.01, headZ));

  // Pilings down into the sea.
  for (let z = P.seaEndZ + 2; z <= P.rampTopZ; z += 9) {
    for (const side of [-1, 1]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, P.deckY + 5, 6), post);
      pile.position.set(P.x + side * (P.width / 2 - 0.7), (P.deckY - 5) / 2 - 0.2, z);
      g.add(pile);
    }
    g.add(box(P.width, 0.3, 0.3, post, P.x, P.deckY - 0.75, z));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [0, 1]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, P.deckY + 5, 6), post);
      pile.position.set(P.x + sx * (P.headWidth / 2 - 0.8), (P.deckY - 5) / 2 - 0.2, P.seaEndZ + 1 + sz * (P.headLength - 2));
      g.add(pile);
    }
  }

  // Railings along the sides. The sea end is left open: that is where you jump in.
  const headEnd = P.seaEndZ + P.headLength;
  for (const side of [-1, 1]) {
    makeRailing(g, P.x + side * (P.width / 2 - 0.1), headEnd, P.rampTopZ, P.deckY, rail);
    makeRailing(g, P.x + side * (P.headWidth / 2 - 0.1), P.seaEndZ + 4, headEnd, P.deckY, rail);
  }

  // The surf shop.
  const S = P.shop;
  const hut = new THREE.Group();
  hut.position.set(S.x, P.deckY, S.z);
  hut.add(box(S.width, 3, S.depth, flat(0x29b6c8), 0, 1.5, 0));
  const roof = box(S.width + 1.2, 0.3, S.depth + 1.6, flat(0xff5a5f), 0, 3.25, 0);
  roof.rotation.z = -0.1;
  hut.add(roof);
  // Counter and awning on the side facing the pier walkway.
  hut.add(box(0.7, 1.1, S.depth - 1, flat(0xfff4d6), -S.width / 2 - 0.35, 0.55, 0));
  const awning = box(2.2, 0.16, S.depth + 0.4, flat(0xffd23f), -S.width / 2 - 0.9, 2.75, 0);
  awning.rotation.z = 0.28;
  hut.add(awning);
  hut.add(box(0.06, 1.3, S.depth - 1.4, flat(0x0d2b45), -S.width / 2 - 0.02, 1.85, 0));
  const sign = makeSign('SURF SHOP', '#fffaf0', '#ff5a5f', 5.2, 1.2);
  sign.position.set(-S.width / 2 - 1.1, 4.15, 0);
  sign.rotation.y = -Math.PI / 2;
  hut.add(sign);
  const signBack = makeSign('SURF SHOP', '#fffaf0', '#ff5a5f', 5.2, 1.2);
  signBack.position.set(0, 4.15, -S.depth / 2 - 0.82);
  signBack.rotation.y = Math.PI;
  hut.add(signBack);
  hut.add(box(0.16, 1.4, 0.16, post, -S.width / 2 - 1.1, 3.5, 2));
  hut.add(box(0.16, 1.4, 0.16, post, -S.width / 2 - 1.1, 3.5, -2));
  // Boards for sale, leaning on the wall.
  const colors = [0xfff4d6, 0x7bd389, 0xffd23f, 0xff5a5f];
  colors.forEach((c, i) => {
    const b = box(0.5, 2.1 + i * 0.25, 0.08, flat(c, 0.5), -S.width / 2 + 0.9 + i * 1.15, 1.1 + i * 0.12, S.depth / 2 + 0.25);
    b.rotation.x = -0.16;
    hut.add(b);
  });
  g.add(hut);

  // A mat in front of the counter marks where to stand.
  const mat = new THREE.Mesh(new THREE.CircleGeometry(1.5, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  mat.position.set(veniceLand.shop.x, P.deckY + 0.03, veniceLand.shop.z);
  g.add(mat);

  // Lamp posts along the pier.
  for (let z = headEnd + 8; z < P.rampTopZ; z += 22) {
    g.add(box(0.16, 3.4, 0.16, post, P.x + P.width / 2 - 0.4, P.deckY + 1.7, z));
    const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
    lamp.position.set(P.x + P.width / 2 - 0.4, P.deckY + 3.5, z);
    g.add(lamp);
  }

  // Boardwalk: a strip of planks along the back of the beach, with benches and lifeguard towers on the sand.
  const walkY = SAND_PROFILE[4].y;
  const walk = box(760, 0.12, BOARDWALK.farZ - BOARDWALK.nearZ, flat(0xcbb08a), 0, walkY + 0.02, (BOARDWALK.nearZ + BOARDWALK.farZ) / 2);
  g.add(walk);
  for (let x = -180; x <= 180; x += 45) {
    if (Math.abs(x - P.x) < 12) continue;
    g.add(box(3, 0.14, 0.7, flat(0x2f6f8f), x, walkY + 0.6, BOARDWALK.farZ - 2));
    g.add(box(3, 0.6, 0.12, flat(0x2f6f8f), x, walkY + 1.0, BOARDWALK.farZ - 1.7));
    g.add(box(0.14, 0.6, 0.6, post, x - 1.3, walkY + 0.3, BOARDWALK.farZ - 2));
    g.add(box(0.14, 0.6, 0.6, post, x + 1.3, walkY + 0.3, BOARDWALK.farZ - 2));
  }
  for (const x of [-120, -20, 80]) {
    const tower = makeLifeguardTower();
    tower.position.set(x, 1.1, SAND_PROFILE[2].z + 14);
    tower.rotation.y = Math.PI;
    g.add(tower);
  }
  scene.add(g);
}
