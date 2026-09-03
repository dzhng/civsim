// Vendored from ez-tree (github.com/dgreenheck/ez-tree, MIT — see README.md):
// the upstream preset library, trimmed to the geometry fields the vendored
// generator consumes (texture/tint/trellis fields dropped). These are the
// upstream artist-tuned shapes; civsim's production trees start from these
// and override for silhouette and poly budget.
import type { TreeOptions } from './options';

const ashMedium: TreeOptions = {
  seed: 36330,
  type: 'deciduous',
  branch: {
    levels: 3,
    angle: {
      1: 48,
      2: 75,
      3: 60
    },
    children: {
      0: 7,
      1: 4,
      2: 3
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: 0.01
    },
    gnarliness: {
      0: 0.03,
      1: 0.25,
      2: 0.2,
      3: 0.09
    },
    length: {
      0: 43.47,
      1: 27.14,
      2: 9.51,
      3: 4.6
    },
    radius: {
      0: 2,
      1: 0.63,
      2: 0.76,
      3: 0.7
    },
    sections: {
      0: 12,
      1: 8,
      2: 6,
      3: 4
    },
    segments: {
      0: 12,
      1: 6,
      2: 4,
      3: 3
    },
    start: {
      1: 0.23,
      2: 0.33,
      3: 0
    },
    taper: {
      0: 0.7,
      1: 0.7,
      2: 0.7,
      3: 0.7
    },
    twist: {
      0: 0.09,
      1: -0.07,
      2: 0,
      3: 0
    }
  },
  leaves: {
    billboard: 'double',
    angle: 55,
    count: 16,
    start: 0,
    size: 2.67,
    sizeVariance: 0.72,
    roundedNormals: true
  }
};

const aspenMedium: TreeOptions = {
  seed: 18020,
  type: 'deciduous',
  branch: {
    levels: 2,
    angle: {
      1: 75,
      2: 32,
      3: 7
    },
    children: {
      0: 10,
      1: 3,
      2: 3
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: 0.0148
    },
    gnarliness: {
      0: 0.05,
      1: 0.12,
      2: 0.12,
      3: 0.02
    },
    length: {
      0: 50,
      1: 6.07,
      2: 11.19,
      3: 1
    },
    radius: {
      0: 0.72,
      1: 0.41,
      2: 0.7,
      3: 0.7
    },
    sections: {
      0: 12,
      1: 10,
      2: 8,
      3: 6
    },
    segments: {
      0: 8,
      1: 6,
      2: 4,
      3: 3
    },
    start: {
      1: 0.59,
      2: 0.35,
      3: 0
    },
    taper: {
      0: 0.37,
      1: 0.13,
      2: 0.7,
      3: 0.7
    },
    twist: {
      0: 0,
      1: 0,
      2: 0,
      3: 0
    }
  },
  leaves: {
    billboard: 'double',
    angle: 30,
    count: 11,
    start: 0.124,
    size: 2.5,
    sizeVariance: 0.7,
    roundedNormals: true
  }
};

const bush1: TreeOptions = {
  seed: 45590,
  type: 'deciduous',
  branch: {
    levels: 3,
    angle: {
      1: 21.521739130434785,
      2: 62.608695652173914,
      3: 60
    },
    children: {
      0: 7,
      1: 3,
      2: 2
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: 0
    },
    gnarliness: {
      0: 0.11,
      1: 0.09,
      2: 0.05,
      3: 0.09
    },
    length: {
      0: 0.1,
      1: 15.302173913043479,
      2: 5.59,
      3: 4.6
    },
    radius: {
      0: 0.5793478260869566,
      1: 0.9521739130434783,
      2: 0.76,
      3: 0.7
    },
    sections: {
      0: 6,
      1: 6,
      2: 10,
      3: 10
    },
    segments: {
      0: 4,
      1: 4,
      2: 4,
      3: 3
    },
    start: {
      1: 0.53,
      2: 0.33,
      3: 0
    },
    taper: {
      0: 0.7,
      1: 0.7,
      2: 0.7,
      3: 0.7
    },
    twist: {
      0: 0.3,
      1: -0.07,
      2: 0,
      3: 0
    }
  },
  leaves: {
    billboard: 'double',
    angle: 55,
    count: 12,
    start: 0,
    size: 2.4456521739130435,
    sizeVariance: 0.717,
    roundedNormals: true
  }
};

const oakMedium: TreeOptions = {
  seed: 35729,
  type: 'deciduous',
  branch: {
    levels: 3,
    angle: {
      1: 54,
      2: 58,
      3: 32
    },
    children: {
      0: 6,
      1: 4,
      2: 3
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: 0.02
    },
    gnarliness: {
      0: 0,
      1: -0.1,
      2: -0.15,
      3: 0.09
    },
    length: {
      0: 37.24,
      1: 11.08,
      2: 12.39,
      3: 7.16
    },
    radius: {
      0: 1.41,
      1: 0.9,
      2: 0.69,
      3: 1.19
    },
    sections: {
      0: 8,
      1: 6,
      2: 3,
      3: 1
    },
    segments: {
      0: 7,
      1: 5,
      2: 3,
      3: 3
    },
    start: {
      1: 0.49,
      2: 0.06,
      3: 0.12
    },
    taper: {
      0: 0.73,
      1: 0.42,
      2: 0.69,
      3: 0.75
    },
    twist: {
      0: -0.23,
      1: 0.42,
      2: 0,
      3: 0
    }
  },
  leaves: {
    billboard: 'double',
    angle: 42,
    count: 18,
    start: 0.16,
    size: 2.5,
    sizeVariance: 0.7,
    roundedNormals: true
  }
};

const pineMedium: TreeOptions = {
  seed: 13977,
  type: 'evergreen',
  branch: {
    levels: 1,
    angle: {
      1: 110,
      2: 16,
      3: 60
    },
    children: {
      0: 82,
      1: 3,
      2: 5
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: -0.003
    },
    gnarliness: {
      0: 0.05,
      1: 0.08,
      2: 0,
      3: 0
    },
    length: {
      0: 50,
      1: 23.87,
      2: 14.08,
      3: 1
    },
    radius: {
      0: 1.05,
      1: 0.36,
      2: 0.7,
      3: 0.7
    },
    sections: {
      0: 12,
      1: 10,
      2: 8,
      3: 6
    },
    segments: {
      0: 8,
      1: 6,
      2: 4,
      3: 3
    },
    start: {
      1: 0.27,
      2: 0.14,
      3: 0.3
    },
    taper: {
      0: 0.7,
      1: 0.7,
      2: 0.7,
      3: 0.7
    },
    twist: {
      0: 0,
      1: 0,
      2: 0,
      3: 0
    }
  },
  leaves: {
    billboard: 'double',
    angle: 39,
    count: 30,
    start: 0.09,
    size: 1.435,
    sizeVariance: 0.201,
    roundedNormals: true
  }
};

export const TREE_PRESETS = {
  ashMedium,
  aspenMedium,
  bush1,
  oakMedium,
  pineMedium,
} as const;
