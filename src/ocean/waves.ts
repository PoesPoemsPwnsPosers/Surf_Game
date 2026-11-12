import type { WaveTuning } from '../config';

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** One wave. Its position is a pure function of time, so it never drifts. */
export interface Wave {
  id: number;
  /** Index of the set this wave belongs to, and its place in the set. */
  setIndex: number;
  indexInSet: number;
  /** Time at which the crest reaches the lineup and starts to break. */
  arrival: number;
  /** X of the peak. The whitewater peels outward from here. */
  peakX: number;
  // Values below are refreshed every step by WaveSystem.update().
  crestZ: number;
  /** Crest height before the along-shore shape is applied. */
  amp: number;
  /** Width of the front face right now. */
  faceWidth: number;
  /** Half-width of the broken section. Negative before the wave breaks. */
  brokenHalfWidth: number;
  /** 0 as a swell, 1 once it reaches the lineup. */
  growth: number;
}

/** What one wave looks like at one point. */
export interface WaveSample {
  wave: Wave;
  /** Distance in front of the crest (positive is toward the beach). */
  ahead: number;
  /** Crest height of this wave at this X. */
  localAmp: number;
  /** 0 on a clean face, 1 in whitewater. */
  foam: number;
}

export interface SurfaceSample {
  height: number;
  /** 0 to 1 whitewater. */
  foam: number;
  /** Forward (toward +Z) shift of the surface, for the pitching lip. Visual only. */
  curl: number;
  /** 0 to 1, how high up a wave this point is. */
  rise: number;
}

/**
 * Schedules wave sets and answers "how high is the water here?".
 * Physics and the ocean mesh both read from this, so they always agree.
 */
export class WaveSystem {
  readonly waves: Wave[] = [];
  time = 0;
  private nextSetIndex = 0;
  private nextId = 1;
  private leadTime: number;
  private rand: () => number;

  constructor(
    readonly tuning: WaveTuning,
    private halfWidth: number,
    seed = 1234,
  ) {
    this.leadTime = (tuning.breakZ - tuning.spawnZ) / tuning.speed;
    // Small seeded generator so the wave peaks are the same every run.
    let s = seed >>> 0;
    this.rand = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Time at which the first wave of set `k` reaches the lineup. */
  private setArrival(k: number): number {
    return this.tuning.firstSetDelay + k * this.tuning.setInterval;
  }

  update(dt: number): void {
    const T = this.tuning;
    this.time += dt;

    // Spawn a set early enough for its waves to travel in from the horizon.
    while (this.setArrival(this.nextSetIndex) - this.leadTime <= this.time) {
      const base = this.setArrival(this.nextSetIndex);
      const setPeak = (this.rand() * 2 - 1) * T.peakSpread;
      for (let i = 0; i < T.wavesPerSet; i++) {
        this.waves.push({
          id: this.nextId++,
          setIndex: this.nextSetIndex,
          indexInSet: i,
          arrival: base + i * T.waveGap,
          peakX: clamp(setPeak + (this.rand() * 2 - 1) * 18, -T.peakSpread, T.peakSpread),
          crestZ: T.spawnZ,
          amp: 0,
          faceWidth: T.swellFaceWidth,
          brokenHalfWidth: -1,
          growth: 0,
        });
      }
      this.nextSetIndex++;
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.crestZ = T.breakZ - T.speed * (w.arrival - this.time);
      if (w.crestZ > T.endZ) {
        this.waves.splice(i, 1);
        continue;
      }
      const growth = smoothstep(T.spawnZ, T.breakZ, w.crestZ);
      const fadeIn = smoothstep(T.spawnZ, T.spawnZ + 25, w.crestZ);
      const decay = 1 - smoothstep(T.decayStartZ, T.endZ, w.crestZ);
      w.growth = growth;
      w.amp = T.height * lerp(T.swellFraction, 1, growth * growth) * fadeIn * decay;
      w.faceWidth = lerp(T.swellFaceWidth, T.faceWidth, growth);
      const since = this.time - w.arrival;
      w.brokenHalfWidth = since > 0 ? since * T.peelSpeed : -1;
    }
  }

  /** Seconds until the next set reaches the lineup, and whether one is passing through now. */
  setStatus(): { secondsToNext: number; setActive: boolean; wavesArrived: number } {
    const T = this.tuning;
    const setLength = (T.wavesPerSet - 1) * T.waveGap;
    const sinceFirst = this.time - T.firstSetDelay;
    if (sinceFirst < 0) return { secondsToNext: -sinceFirst, setActive: false, wavesArrived: 0 };
    const k = Math.floor(sinceFirst / T.setInterval);
    const into = sinceFirst - k * T.setInterval;
    // A little slack so the cue stays up while the last wave is still rideable.
    const active = into <= setLength + 2.5;
    return {
      secondsToNext: T.setInterval - into,
      setActive: active,
      wavesArrived: active ? Math.min(T.wavesPerSet, Math.floor(into / T.waveGap) + 1) : 0,
    };
  }

  /** Crest height of one wave at a given X, and how broken it is there. */
  alongShore(w: Wave, x: number): { amp: number; foam: number } {
    const T = this.tuning;
    const px = (x - w.peakX) / T.peakWidth;
    const edge = 1 - smoothstep(this.halfWidth - 10, this.halfWidth + 25, Math.abs(x));
    let amp = w.amp * (1 + T.peakBonus * Math.exp(-px * px)) * edge;
    let foam = 0;
    if (w.brokenHalfWidth >= 0) {
      const dist = Math.abs(x - w.peakX);
      const soft = Math.min(5, w.brokenHalfWidth + 1.5);
      foam = 1 - smoothstep(w.brokenHalfWidth - soft, w.brokenHalfWidth + soft * 0.6, dist);
      amp *= lerp(1, T.foamHeightFraction, foam);
    }
    return { amp, foam };
  }

  /** Small background chop so flat water still has some life. */
  private chop(x: number, z: number): number {
    const t = this.time;
    return (
      0.1 * Math.sin(x * 0.21 + t * 1.1) * Math.cos(z * 0.17 - t * 0.8) +
      0.06 * Math.sin(x * 0.07 - z * 0.33 + t * 1.6)
    );
  }

  /**
   * Chop plus fine ripples for a whole grid in one go. Every term splits into
   * an X part and a Z part, so this needs a few sines per row and column
   * instead of six per vertex. Must match chop() above.
   * `xs` holds the column X values for even rows, then for odd rows.
   */
  chopGrid(xs: Float32Array, zs: Float32Array, nx: number, nz: number, out: Float32Array): void {
    const t = this.time;
    const cols = nx * 2;
    if (this.gridCols.length < cols * 4) this.gridCols = new Float32Array(cols * 4);
    if (this.gridRows.length < nz * 4) this.gridRows = new Float32Array(nz * 4);
    const C = this.gridCols;
    const R = this.gridRows;
    for (let i = 0; i < cols; i++) {
      const x = xs[i];
      C[i * 4] = Math.sin(x * 0.21 + t * 1.1);
      C[i * 4 + 1] = Math.sin(x * 0.07 + t * 1.6);
      C[i * 4 + 2] = Math.cos(x * 0.07 + t * 1.6);
      C[i * 4 + 3] = Math.sin(x * 0.9 + t * 1.9);
    }
    for (let j = 0; j < nz; j++) {
      const z = zs[j];
      R[j * 4] = Math.cos(z * 0.17 - t * 0.8);
      R[j * 4 + 1] = Math.sin(z * 0.33);
      R[j * 4 + 2] = Math.cos(z * 0.33);
      R[j * 4 + 3] = Math.sin(z * 1.1 - t * 1.4);
    }
    let o = 0;
    for (let j = 0; j < nz; j++) {
      const r = j * 4;
      const c0 = (j & 1) * nx * 4;
      for (let i = 0; i < nx; i++) {
        const c = c0 + i * 4;
        out[o++] =
          0.1 * C[c] * R[r] + 0.06 * (C[c + 1] * R[r + 2] - C[c + 2] * R[r + 1]) + 0.07 * C[c + 3] * R[r + 3];
      }
    }
  }
  private gridCols = new Float32Array(0);
  private gridRows = new Float32Array(0);

  /** Water flattens out as it reaches the beach. */
  private shoreFade(z: number): number {
    return 1 - smoothstep(this.tuning.endZ - 26, this.tuning.endZ + 2, z);
  }

  /** Height of the water surface. This is the one function physics relies on. */
  height(x: number, z: number): number {
    const T = this.tuning;
    let h = this.chop(x, z);
    for (const w of this.waves) {
      const d = z - w.crestZ;
      if (d > w.faceWidth * 3.2 || d < -T.backWidth * 3.2) continue;
      const { amp } = this.alongShore(w, x);
      const k = d >= 0 ? d / w.faceWidth : d / T.backWidth;
      h += amp * Math.exp(-k * k);
    }
    return h * this.shoreFade(z);
  }

  /** Slope of the surface: (dh/dx, dh/dz). */
  gradient(x: number, z: number, out: { x: number; z: number }): void {
    const e = 0.35;
    out.x = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    out.z = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
  }

  /**
   * Full surface detail for the ocean mesh.
   *
   * `pre` is an optional speed-up: the along-shore amp and foam of every wave
   * at this X, laid out as [amp0, foam0, amp1, foam1, ...] starting at
   * `preAt`. The mesh fills it once per column instead of once per vertex.
   */
  sample(x: number, z: number, out: SurfaceSample, pre?: Float32Array, preAt = 0, base?: number): void {
    const T = this.tuning;
    const waves = this.waves;
    // `base` is the chop and ripple, when the caller has already worked it out with chopGrid().
    let h =
      base !== undefined
        ? base
        : this.chop(x, z) + 0.07 * Math.sin(x * 0.9 + this.time * 1.9) * Math.sin(z * 1.1 - this.time * 1.4);
    let foam = 0;
    let curl = 0;
    let rise = 0;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      const d = z - w.crestZ;
      if (d > w.faceWidth * 3.2 || d < -T.backWidth * 3.2) continue;
      let amp: number;
      let wFoam: number;
      if (pre) {
        amp = pre[preAt + i * 2];
        wFoam = pre[preAt + i * 2 + 1];
      } else {
        const a = this.alongShore(w, x);
        amp = a.amp;
        wFoam = a.foam;
      }
      const k = d >= 0 ? d / w.faceWidth : d / T.backWidth;
      const shape = Math.exp(-k * k);
      h += amp * shape;
      rise = Math.max(rise, shape * Math.min(1, amp / (T.height * 0.6)));
      // Whitewater: on the crest and tumbling down the front of broken sections.
      if (wFoam > 0.01) {
        const tumble = d >= 0 ? Math.exp(-((d / (w.faceWidth * 1.5)) ** 2)) : Math.exp(-((d / 5) ** 2));
        foam = Math.max(foam, wFoam * tumble);
      }
      // A thin white line along the lip once the wave is close to breaking.
      if (w.growth > 0.75 && d > -4 && d < 3.5) {
        const lip = Math.exp(-(((d + 0.4) / 1.3) ** 2)) * smoothstep(0.75, 1, w.growth);
        foam = Math.max(foam, lip * 0.75 * Math.min(1, amp / 2));
      }
      // Pitch the top of the wave forward to make a lip.
      if (T.lipCurl > 0) {
        const c = (d - w.faceWidth * 0.15) / (w.faceWidth * 0.75);
        curl += T.lipCurl * amp * Math.exp(-c * c) * smoothstep(0.55, 1, w.growth) * (1 - wFoam * 0.7);
      }
    }
    const fade = this.shoreFade(z);
    // Whitewater churns.
    if (foam > 0.02) h += foam * 0.45 * Math.sin(x * 1.3 + this.time * 7) * Math.sin(z * 1.7 + this.time * 5);
    out.height = h * fade;
    out.foam = foam;
    out.curl = curl * fade;
    out.rise = rise;
  }

  /**
   * The wave that would carry a surfer at this point: the tallest one whose
   * face or crest is here. Returns null on open water.
   */
  waveAt(x: number, z: number, out: WaveSample): WaveSample | null {
    const T = this.tuning;
    let best: Wave | null = null;
    let bestScore = 0;
    for (const w of this.waves) {
      const d = z - w.crestZ;
      if (d > w.faceWidth * 3.5 || d < -T.backWidth * 1.2) continue;
      const { amp, foam } = this.alongShore(w, x);
      const score = amp * (d >= 0 ? 1 - d / (w.faceWidth * 3.5) : 1 + d / (T.backWidth * 1.2));
      if (score > bestScore) {
        bestScore = score;
        best = w;
        out.wave = w;
        out.ahead = d;
        out.localAmp = amp * this.shoreFade(z);
        out.foam = foam;
      }
    }
    return best ? out : null;
  }

  /** Same as waveAt but for one known wave. */
  sampleWave(w: Wave, x: number, z: number, out: WaveSample): WaveSample {
    const { amp, foam } = this.alongShore(w, x);
    out.wave = w;
    out.ahead = z - w.crestZ;
    out.localAmp = amp * this.shoreFade(z);
    out.foam = foam;
    return out;
  }
}
