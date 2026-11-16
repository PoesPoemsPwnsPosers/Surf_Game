import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { LevelEnvironment, WaterSurface } from '../../core/level';
import { SAND_PROFILE } from './layout';
import { buildPier } from './pier';

/**
 * Venice Beach scenery: sky, sun, sand, palms, a row of bright boardwalk
 * buildings and lineup buoys, plus the pier and shop from ./pier. All of it
 * is built from simple shapes for now. Where things are comes from ./layout,
 * which the walking rules share.
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness });
}

function makeSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(3000, 24, 12);
  const top = new THREE.Color(0x2f8fe8);
  const mid = new THREE.Color(0x8fd3ff);
  const low = new THREE.Color(0xdff4ff);
  const colors: number[] = [];
  const pos = geo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 3000;
    if (h > 0.25) c.copy(mid).lerp(top, Math.min(1, (h - 0.25) / 0.6));
    else c.copy(low).lerp(mid, Math.max(0, h) / 0.25);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }),
  );
}

function makeCloud(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xbfd4e6,
    emissiveIntensity: 0.55,
    flatShading: true,
    roughness: 1,
    fog: false,
  });
  const puffs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < puffs; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(14 + rand() * 12, 0), mat);
    m.position.set(i * 18 - puffs * 9, rand() * 6, rand() * 10);
    m.scale.y = 0.55;
    g.add(m);
  }
  return g;
}

function makePalm(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = flat(0x9a7350);
  const leafMat = flat(0x2fa85a);
  const height = 9 + rand() * 6;
  const segs = 5;
  const bend = (rand() - 0.5) * 0.12;
  let y = 0;
  let x = 0;
  for (let i = 0; i < segs; i++) {
    const h = height / segs;
    const r0 = 0.34 - i * 0.035;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.03, r0, h, 6), trunkMat);
    seg.position.set(x, y + h / 2, 0);
    seg.rotation.z = -bend * i;
    seg.castShadow = true;
    g.add(seg);
    y += h * Math.cos(bend * i);
    x += h * Math.sin(bend * i);
  }
  const crown = new THREE.Group();
  crown.position.set(x, y, 0);
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.6, 4), leafMat);
    frond.scale.set(1, 1, 0.18);
    frond.geometry.translate(0, 2.3, 0);
    const holder = new THREE.Group();
    holder.rotation.y = (i / fronds) * Math.PI * 2 + rand() * 0.4;
    frond.rotation.z = -(1.15 + rand() * 0.5);
    frond.castShadow = true;
    holder.add(frond);
    crown.add(holder);
  }
  g.add(crown);
  return g;
}

function makeBuoy(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.75, 1.5, 6), flat(0xff5a36, 0.6));
  body.position.y = 0.55;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.3, 6), flat(0xffffff, 0.6));
  band.position.y = 0.4;
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), flat(0xffe14d, 0.4));
  top.position.y = 1.45;
  g.add(body, band, top);
  return g;
}

export function buildVeniceEnvironment(scene: THREE.Scene, water: WaterSurface): LevelEnvironment {
  const rand = rng(77);
  const W = CONFIG.world;
  const waveTuning = CONFIG.waves.venice;

  scene.fog = new THREE.Fog(0xcdeeff, 260, 1500);
  scene.add(makeSky());

  // Bright midday sun from over the left shoulder when looking out to sea.
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0xbfe6e0, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.7);
  sun.position.set(-130, 170, 110);
  scene.add(sun);
  const sunBall = new THREE.Mesh(
    new THREE.IcosahedronGeometry(110, 1),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  sunBall.position.set(-900, 1500, -2200);
  scene.add(sunBall);

  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const c = makeCloud(rand);
    c.position.set((rand() - 0.5) * 2600, 260 + rand() * 200, -700 - rand() * 1200);
    c.scale.setScalar(2 + rand() * 2.5);
    scene.add(c);
    clouds.push(c);
  }

  // Sand: slopes up out of the water, then levels off toward the boardwalk.
  const rows = SAND_PROFILE;
  const cols = 41;
  const halfSpan = 700;
  const verts: number[] = [];
  const cols3: number[] = [];
  const wet = new THREE.Color(0xc9a878);
  const dry = new THREE.Color(0xf5dfae);
  const pave = new THREE.Color(0xd9d4c8);
  const cc = new THREE.Color();
  rows.forEach((row, r) => {
    for (let i = 0; i < cols; i++) {
      const x = -halfSpan + (i / (cols - 1)) * halfSpan * 2;
      // Tiny bumps only: the walking rules use the smooth profile.
      const bump = r > 1 && r < 4 ? (rand() - 0.5) * 0.12 : 0;
      verts.push(x, row.y + bump, row.z);
      if (r <= 1) cc.copy(wet);
      else if (r <= 3) cc.copy(dry);
      else cc.copy(pave);
      cols3.push(cc.r, cc.g, cc.b);
    }
  });
  const idx: number[] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = r * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const sandGeo = new THREE.BufferGeometry();
  sandGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  sandGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols3, 3));
  sandGeo.setIndex(idx);
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(
    sandGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
  );
  scene.add(sand);

  buildPier(scene);

  // Palms along the back of the beach, like the boardwalk in the reference photos.
  for (let i = 0; i < 26; i++) {
    const palm = makePalm(rand);
    palm.position.set(-330 + i * 26 + (rand() - 0.5) * 10, 2.0, W.shoreZ + 56 + rand() * 8);
    palm.rotation.y = rand() * Math.PI * 2;
    scene.add(palm);
  }

  // A row of bright boardwalk shopfronts behind the palms.
  const paints = [0x29b6c8, 0xffd23f, 0xff7096, 0xf4f1e8, 0x7bd389, 0xff8c42, 0x9b8cff, 0xfdfdfd];
  let bx = -360;
  while (bx < 360) {
    const w = 14 + rand() * 16;
    const h = 6 + rand() * 11;
    const d = 16;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(paints[Math.floor(rand() * paints.length)]));
    b.position.set(bx + w / 2, 2.2 + h / 2, W.shoreZ + 96);
    scene.add(b);
    // Awning over the shopfront.
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, 0.3, 3),
      flat(paints[Math.floor(rand() * paints.length)]),
    );
    awning.position.set(bx + w / 2, 5.4, W.shoreZ + 96 - d / 2 - 1.3);
    awning.rotation.x = -0.25;
    scene.add(awning);
    bx += w + 0.6;
  }

  // Hazy hills up the coast.
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x8fb7c9, flatShading: true, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(260 + rand() * 200, 130 + rand() * 110, 6), hillMat);
    hill.position.set(-1500 - i * 160 + rand() * 80, 30, 300 - i * 260);
    scene.add(hill);
  }

  // Buoys mark the lineup: wait just inside them.
  const buoys: THREE.Group[] = [];
  for (const x of [-120, -60, 0, 60, 120]) {
    const b = makeBuoy();
    b.position.set(x, 0, waveTuning.breakZ - 14);
    scene.add(b);
    buoys.push(b);
  }

  return {
    update(_dt: number, time: number): void {
      for (let i = 0; i < buoys.length; i++) {
        buoys[i].position.y = water.height(buoys[i].position.x, buoys[i].position.z) - 0.1;
        buoys[i].rotation.z = Math.sin(time * 1.3 + i) * 0.12;
        buoys[i].rotation.x = Math.cos(time * 1.1 + i * 2) * 0.1;
      }
      for (const c of clouds) {
        c.position.x += _dt * 3;
        if (c.position.x > 1500) c.position.x = -1500;
      }
    },
  };
}
