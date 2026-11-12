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
    maxAhead: 1.5,
    /** The wave must be at least this tall where the player is. */
    minWaveHeight: 1.1,
    /** Speed along the board right after popping up. */
    startSpeed: 9,
  },

  surf: {
    /** Pull of gravity along the wave slope. Higher means faster drops and harder climbs. */
    slopeGravity: 15,
    /** Fraction of that pull felt when climbing. Below 1 makes it easy to reach the lip. */
    climbEase: 0.3,
    /** With no steering held, the board straightens out along the wave at this rate (radians per second). */
    autoTrim: 1.1,
    /** Where on the face a hands-off board settles, in face widths in front of the crest. */
    trimLine: 0.8,
    /** Free speed from trimming along a steep face. */
    trimAccel: 9,
    /** Water drag on the board (per second). */
    drag: 0.42,
    /** Extra drag while holding S to stall. */
    brakeDrag: 1.6,
    /** Thrust from holding Shift to pump. */
    pumpAccel: 9,
    /** Thrust from holding W to lean forward. */
    leanAccel: 2.5,
    /** Top speed along the board without pumping. */
    maxSpeed: 17,
    /** Top speed along the board while pumping. */
    pumpMaxSpeed: 23,
    /** How fast the board turns (radians per second). */
    turnRate: 2.7,
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
    /** Seconds the player can sit in the whitewater at the crest before it eats them. */
    foamGrace: 1.1,
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
    /** Fastest upward speed any launch can have. Caps how high big airs go. */
    maxLaunchSpeed: 15,
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
    /** A spin lands if the board is within this angle of pointing forward or backward. */
    spinLandTolerance: 1.0,
    /** A flip lands if the board is within this angle of flat. */
    flipLandTolerance: 0.9,
    /** Fraction of speed kept on landing. */
    landSpeedKeep: 0.92,
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
  },
};

export type GameConfig = typeof CONFIG;
