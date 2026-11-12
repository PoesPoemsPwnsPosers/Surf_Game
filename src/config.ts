/**
 * Every tuning number in the game lives here.
 * Change a value, save, and Vite reloads the game.
 *
 * Units: metres, seconds, radians unless a name says otherwise.
 * World axes: +X runs along the shore, +Z points toward the beach,
 * -Z points out to sea, +Y is up. Waves travel toward +Z.
 */

export interface WaveTuning {
  /** Seconds between the start of one set and the start of the next. */
  setInterval: number;
  /** Waves in each set. */
  wavesPerSet: number;
  /** Seconds between waves inside a set. */
  waveGap: number;
  /** Seconds after the level starts before the first set reaches the lineup. */
  firstSetDelay: number;
  /** How fast the crest travels toward shore. */
  speed: number;
  /** Crest height at full size. */
  height: number;
  /** Extra height at the peak of the wave (fraction of height). */
  peakBonus: number;
  /** How wide the taller peak is along the shore. */
  peakWidth: number;
  /** Width of the steep front face when the wave is breaking. */
  faceWidth: number;
  /** Width of the front slope while the wave is still a gentle swell. */
  swellFaceWidth: number;
  /** Width of the gentle back of the wave. */
  backWidth: number;
  /** Z where a wave first appears on the horizon. */
  spawnZ: number;
  /** Z where the wave starts to break. This is the lineup. */
  breakZ: number;
  /** Z where the wave starts to shrink as it nears the beach. */
  decayStartZ: number;
  /** Z where the wave is gone. */
  endZ: number;
  /** Height of a swell on the horizon, as a fraction of full height. */
  swellFraction: number;
  /** How fast the whitewater peels sideways from the peak. */
  peelSpeed: number;
  /** Height of the broken whitewater, as a fraction of the unbroken wave. */
  foamHeightFraction: number;
  /** The peak of each wave is placed randomly within +/- this distance of x = 0. */
  peakSpread: number;
  /** How far the lip pitches forward (visual only), as a fraction of wave height. */
  lipCurl: number;
}

export const CONFIG = {
  /** Physics steps per second. */
  physicsHz: 120,

  world: {
    /** Half the width of the playable ocean along the shore. */
    halfWidth: 200,
    /** Z of the waterline on the beach. */
    shoreZ: 34,
    /** Farthest the player may paddle out to sea. */
    seaLimitZ: -190,
    /** Where the player starts in milestone 1 (in the water, just inside the lineup). */
    startX: 0,
    startZ: -70,
  },

  /** Which board the player starts on: an index into `boards` below (0 is the starter). */
  startingBoardTier: 0,

  /**
   * The boards, slowest to fastest. Each tier is bigger, faster and more forgiving.
   * Until the shop exists (milestone 3), number keys 1 to 4 swap boards in the game.
   */
  boards: [
    {
      name: 'Foamie',
      /**
       * Guiderails in the air, 0 to 1. At 1 the game steers airs back onto the wave: the wave
       * magnet, the wave-hop helper, and flying out the back only from a near-straight take-off
       * over a small lip. At 0 there are none: you fly where you aim and choose where you land.
       */
      guide: 1,
      /** Fastest upward speed a launch can have on this board. Sets how big its airs are. */
      launchPower: 10.5,
      /** Top speed along the board without pumping, and while pumping. */
      maxSpeed: 11.5,
      pumpMaxSpeed: 15.5,
      /** Thrust from holding Shift. */
      pumpAccel: 6,
      /** Free speed from trimming along a steep face. */
      trimAccel: 6,
      /** How fast the board turns (radians per second). */
      turnRate: 2.3,
      /** A spin lands within this angle of forward or backward; a flip within this angle of flat (radians). */
      spinLandTolerance: 1.0,
      flipLandTolerance: 0.95,
      /** Seconds the board survives in the whitewater at the crest. */
      foamGrace: 1.1,
      /** How fast the flight path can be steered with A and D (radians per second). */
      airSteer: 1.1,
      /** How hard Shift + W / S speeds up or slows the flight (m/s per second). */
      airDrift: 5,
      /** Size of the board model. */
      scale: 0.86,
      color: 0x7ed8f6,
      stripe: 0xffffff,
    },
    {
      name: 'Fish',
      guide: 1,
      launchPower: 12,
      maxSpeed: 14,
      pumpMaxSpeed: 19,
      pumpAccel: 7.5,
      trimAccel: 7.5,
      turnRate: 2.5,
      spinLandTolerance: 1.08,
      flipLandTolerance: 1.05,
      foamGrace: 1.3,
      airSteer: 1.4,
      airDrift: 6.5,
      scale: 1.0,
      color: 0xfff4d6,
      stripe: 0xff4f6d,
    },
    {
      name: 'Shortboard',
      guide: 0.5,
      launchPower: 13.5,
      maxSpeed: 17,
      pumpMaxSpeed: 23,
      pumpAccel: 9,
      trimAccel: 9,
      turnRate: 2.7,
      spinLandTolerance: 1.18,
      flipLandTolerance: 1.2,
      foamGrace: 1.5,
      airSteer: 2.2,
      airDrift: 9,
      scale: 1.14,
      color: 0xffd23f,
      stripe: 0x0d2b45,
    },
    {
      name: 'Pro Gun',
      guide: 0,
      launchPower: 15,
      maxSpeed: 20,
      pumpMaxSpeed: 27,
      pumpAccel: 11,
      trimAccel: 10.5,
      turnRate: 2.9,
      spinLandTolerance: 1.3,
      flipLandTolerance: 1.4,
      foamGrace: 1.8,
      airSteer: 3.4,
      airDrift: 13,
      scale: 1.3,
      color: 0xff5a5f,
      stripe: 0xffd23f,
    },
  ],

  /** Wave settings for each beach. Later beaches add their own entry. */
  waves: {
    venice: {
      setInterval: 20,
      wavesPerSet: 3,
      waveGap: 5,
      firstSetDelay: 14,
      speed: 8.5,
      height: 4.6,
      peakBonus: 0.22,
      peakWidth: 55,
      faceWidth: 4.6,
      swellFaceWidth: 10,
      backWidth: 11,
      spawnZ: -240,
      breakZ: -105,
      decayStartZ: -8,
      endZ: 30,
      swellFraction: 0.32,
      peelSpeed: 6.5,
      foamHeightFraction: 0.5,
      peakSpread: 45,
      lipCurl: 0,
    } satisfies WaveTuning,
  },

  paddle: {
    speed: 6.5,
    /** Speed while holding Shift. */
    sprintSpeed: 10.5,
    /** How quickly the paddler reaches full speed. */
    accel: 5,
    /** How quickly the board turns to face the paddling direction (per second). */
    turnRate: 7,
  },

  popUp: {
    /** The player may pop up when this far in front of the crest (multiples of face width). */
    minAhead: -0.1,
    maxAhead: 1.4,
    /** The wave must be at least this tall where the player is. */
    minWaveHeight: 1.1,
    /** Speed along the board right after popping up. */
    startSpeed: 9,
  },

  surf: {
    /** Pull of gravity along the wave slope. Higher means faster drops and harder climbs. */
/** Whitewater only wipes the board out this close to the crest, in face widths. Lower down the face it can be ridden. */
    foamZone: 0.55,
        slopeGravity: 15,
    /** Fraction of that pull felt when climbing. Below 1 makes it easy to reach the lip. */
    climbEase: 0.3,
    /** With no steering held, the board straightens out along the wave at this rate (radians per second). */
    autoTrim: 1.1,
    /** Where on the face a hands-off board settles, in face widths in front of the crest. */
    trimLine: 0.8,
    /** Water drag on the board (per second). */
    drag: 0.42,
    /** Extra drag while holding S to stall. */
    brakeDrag: 1.6,
    /** Thrust from holding W to lean forward. */
    leanAccel: 2.5,
    /** How quickly the turn reaches full rate (per second). */
    turnResponse: 9,
    /** Below this speed the board slides down the face and turns downhill. */
    slideSpeed: 5,
    /** How fast a stalled board slides down the face. */
    slideRate: 3,
    /** Drag once the wave has left the board behind (per second). */
    offWaveDrag: 1.4,
    /** The ride ends when the board is off the wave and slower than this. */
    endSpeed: 2.2,
  },

  air: {
    /** Gravity while airborne. Lower means floatier, bigger air. */
    gravity: 13,
    /** Upward kick from pressing Space on flat water or low on the wave. */
    jumpImpulse: 5.5,
    /** Extra upward kick from Space, per m/s of board speed, scaled by how high on the face. */
    jumpSpeedBoost: 0.42,
    /** Multiplier on upward speed when the board flies off the lip on its own. */
    lipLaunchBoost: 1.5,
    /** Smallest upward speed that counts as a launch. */
    minLaunchSpeed: 2.6,
    /** How easily the board leaves the lip. 1 is real gravity; lower launches more readily. */
    lipStick: 0.5,
    /** Full spin speed (radians per second). Q and E. */
    spinRate: 7.4,
    /** Full flip speed (radians per second). W and S. */
    flipRate: 6.4,
    /** How quickly spins and flips reach full speed (per second). */
    rotationResponse: 7,
    /** With no trick key held, the board levels out toward upright at this rate (radians per second). */
    settleRate: 3.2,
    /** Pull that brings the surfer back over the wave face while airborne. */
    waveMagnet: 1.6,
    /** Fraction of speed kept on landing. The board keeps the direction it was flying in. */
    landSpeedKeep: 0.94,
    /** Landing against an oncoming wave face keeps only this fraction of the speed into the face. */
    landFaceAbsorb: 0.3,
    /** For this long after landing, the hands-off autopilot carves this many times harder to settle into trim. */
    landCarveTime: 0.9,
    landCarveBoost: 3.2,

    // --- Flying out the back, toward the ocean ---
    /**
     * How squarely the board must point out to sea at take-off to fly out the back
     * instead of dropping back onto the face. 1 is dead straight, 0.7 is within 45 degrees.
     */
    seawardAim: 0.8,
    /** A lip taller than this is "overwhelming": it always throws the surfer back toward the beach. */
    lipOverwhelmHeight: 5.35,
    /** So is the pitching section this close to where the whitewater is peeling. */
    pocketWidth: 8,
    /** Extra speed out to sea given to a launch out the back (multiplier on board speed). */
    seawardFling: 1.1,
    /** How much of the wave's push toward the beach a launch out the back keeps (0 to 1). Lower flies further out. */
    seawardCarry: 0.55,

    /**
     * Landing help when flying out the back: if the flight would overshoot the next wave,
     * it is slowed at up to this rate (m/s per second) so it comes down on the face.
     * It never speeds a flight up, and holding Shift turns it off. 0 disables it.
     */
    hopAssist: 9,

    // --- Air kick (Space in the air) ---
    /** Upward speed added by an air kick. */
    kickUp: 7.5,
    /** Forward speed added by an air kick. */
    kickForward: 4,
    /** Most kicks that can be stored. */
    kickMaxCharges: 2,
    /** Kicks the player starts with. */
    kickStartCharges: 1,
    /** Charge earned by landing an air with at least one spin, flip or grab. */
    kickPerAirTrick: 0.5,
    /** Charge earned by finishing a wave trick. */
    kickPerWaveTrick: 0.25,
    /** Charge earned per second of pumping beyond the board's normal top speed. */
    kickPerSecondFast: 0.1,
    /** "Beyond top speed" means above this multiple of the board's unpumped top speed. */
    kickFastFraction: 1.08,

    // --- Shift in the air: lean to speed up or slow down instead of flipping ---
    /** Slowest and fastest the surfer can make the flight with Shift + S / W (multiples of launch speed). */
    driftMinSpeed: 0.35,
    driftMaxSpeed: 1.5,
    /** A grab has to be held this long to count. */
    grabMinTime: 0.35,
  },

  /**
   * Wave tricks, done while the board trims on its own.
   * Q cutback, E snap, W+Q hang ten (hold), S+Q tail slide (hold), W+E floater (hold).
   */
  tricks: {
    /** Seconds after one trick before the next can start. */
    cooldown: 0.25,
    cutback: {
      /** Seconds for the whole figure. */
      duration: 1.15,
      /** How fast the board swings (radians per second). */
      turnRate: 5.6,
      /** How far past straight-down-the-face the board swings back toward the whitewater (radians). */
      swing: 1.15,
    },
    snap: {
      /** Seconds climbing to the lip, then seconds whipping back down. */
      climbTime: 0.36,
      whipTime: 0.3,
      /** Angle above and below the trim line (radians). */
      angle: 0.95,
      climbTurnRate: 6,
      whipTurnRate: 11,
      /** Speed gained from the whip. */
      speedGain: 1.5,
    },
    hangTen: {
      /** Must be held this long to count. */
      minTime: 0.5,
      /** Longest it can be held. */
      maxTime: 4,
      /** Extra thrust while on the nose. */
      accel: 3.5,
      /** Top speed multiplier while on the nose. */
      topSpeedBoost: 1.15,
    },
    tailSlide: {
      minTime: 0.3,
      maxTime: 1.4,
      /** How far the tail swings out (radians). */
      angle: 1.25,
      /** Extra drag while sliding (per second). */
      drag: 0.35,
    },
    floater: {
      minTime: 0.45,
      maxTime: 1.8,
      /** Where on the wave the board floats, in face widths in front of the crest. */
      line: 0.02,
      /** How fast the board is pulled up to the crest (metres per second). */
      climbSpeed: 9,
      /** Speed gained dropping back down. */
      speedGain: 2,
    },
  },

  /** The barrel: the pocket under the curling lip, just ahead of where the wave is breaking. */
  barrel: {
    /** How far ahead of the whitewater edge the barrel reaches (metres along the wave). */
    width: 9,
    /** How far into the whitewater still counts (negative, metres). */
    inside: -1.5,
    /** Where on the face it counts, in face widths ahead of the crest. */
    minAhead: 0.45,
    maxAhead: 1.4,
    /** The wave must be at least this tall here (metres). */
    minHeight: 2.2,
    /** Shorter visits than this do not score (seconds). */
    minTime: 0.4,
    /** How far the lip throws forward over the face, in face widths, and how far its tip drops (metres). */
    lipReach: 1.6,
    lipDrop: 1.4,
    lipRise: 1.2,
  },

  /** Cool points. Every number the scoring uses. */
  points: {
    /** Riding flat out: this many points every `speedEvery` seconds above `speedFraction` of the board's top speed. */
    speed: 5,
    speedEvery: 1.5,
    speedFraction: 1.08,
    /** Any air that lasts at least `airMinTime`: a base plus points per second. */
    air: 20,
    airPerSecond: 10,
    airMinTime: 0.6,
    /** An air higher than `bigAirHeight` metres earns this on top. */
    bigAir: 50,
    bigAirHeight: 6,
    /** Per half turn of spin, and per full flip. */
    spin180: 30,
    flip: 100,
    /** A grab: a base plus points per second held. */
    grab: 25,
    grabPerSecond: 20,
    /** Each air kick used in a flight that lands. */
    airKick: 10,
    /** Flying out the back of the wave, and landing on a different wave. */
    outTheBack: 30,
    waveHop: 150,
    /** Wave tricks. Hold tricks also pay per second held. */
    cutback: 40,
    snap: 50,
    hangTen: 20,
    hangTenPerSecond: 15,
    tailSlide: 40,
    tailSlidePerSecond: 10,
    floater: 60,
    floaterPerSecond: 15,
    /** Barrel riding, per second, paid on the way out. A long barrel is the big one. */
    barrelPerSecond: 40,
    /** Doing the same wave trick again in one ride is worth this much of the last time, down to the floor. */
    repeatFalloff: 0.7,
    repeatFloor: 0.25,
    /** The multiplier goes up by one for every this many moves in a ride, up to the cap. */
    movesPerMultiplier: 2,
    maxMultiplier: 10,
    /** A wipeout loses the unbanked combo and this fraction of the banked total. */
    wipeoutPenalty: 0.05,
  },

  /** The glowing light trail behind the board, like tail lights in a long-exposure photo. */
  trail: {
    /** Seconds a point of the trail takes to fade out. */
    life: 1.1,
    /** Width of each streak (metres). */
    width: 0.34,
    /** The trail starts to show above this speed and is at full strength at the board's pumped top speed. */
    minSpeed: 7,
    /** Colour at the board and at the fading end. */
    color: 0xff1228,
    fadeColor: 0xff4a3a,
    /** Brightness, 0 to 1. */
    strength: 1,
    /** Extra additive glow on top, 0 to 1. */
    glow: 0.4,
  },

  wipeout: {
    /** Seconds from wiping out to being back on the board. */
    duration: 1.9,
  },

  camera: {
    fov: 62,
    /** Distance behind the surfer. */
    distance: 8.5,
    /** Height above the surfer. */
    height: 3.1,
    /** How far the camera sits toward the beach so the wave face stays in view. */
    shoreBias: 4.5,
    /** How far ahead of the surfer the camera looks. */
    lookAhead: 5,
    /** How quickly the camera swings behind the surfer (per second). */
    yawFollow: 2.6,
    /** How quickly the camera catches up to the surfer (per second). */
    positionFollow: 7,
    /** Mouse look sensitivity (radians per pixel). */
    mouseSensitivity: 0.0026,
    /** Extra pull back while airborne. */
    airPullBack: 3,
    /** Field of view added at top speed. */
    speedFov: 10,
    /** Flying out to sea: how quickly the camera swings in behind the flight, and how much higher it sits. */
    seawardYawFollow: 5,
    seawardHeight: 3.5,
  },
};

export type GameConfig = typeof CONFIG;
export type BoardTuning = (typeof CONFIG.boards)[number];
