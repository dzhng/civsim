// Vendored from ez-tree (github.com/dgreenheck/ez-tree, MIT — see README.md):
// the upstream preset library, trimmed to the geometry fields the vendored
// generator consumes (texture/tint/trellis fields dropped). These are the
// upstream artist-tuned shapes; civsim's production trees start from these
// and override for silhouette and poly budget.
import type { TreeOptions } from './options';

const ashLarge: TreeOptions = {
  seed: 29919,
  type: 'deciduous',
  branch: {
    levels: 3,
    angle: {
      1: 39,
      2: 39,
      3: 51
    },
    children: {
      0: 10,
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
      0: -0.05,
      1: 0.2,
      2: 0.16,
      3: 0.049999999999999996
    },
    length: {
      0: 45,
      1: 29.42,
      2: 15.3,
      3: 4.6
    },
    radius: {
      0: 3.03,
      1: 0.53,
      2: 0.79,
      3: 1.11
    },
    sections: {
      0: 12,
      1: 8,
      2: 6,
      3: 4
    },
    segments: {
      0: 8,
      1: 6,
      2: 4,
      3: 3
    },
    start: {
      1: 0.32,
      2: 0.34,
      3: 0
    },
    taper: {
      0: 0.7,
      1: 0.6199999999999999,
      2: 0.7599999999999999,
      3: 0
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
    angle: 30,
    count: 10,
    start: 0.01,
    size: 4.62,
    sizeVariance: 0.72,
    roundedNormals: true
  }
};

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

const ashSmall: TreeOptions = {
  seed: 26867,
  type: 'deciduous',
  branch: {
    levels: 2,
    angle: {
      1: 48,
      2: 75,
      3: 60
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
      strength: 0.01
    },
    gnarliness: {
      0: 0.11,
      1: 0.09,
      2: 0.05,
      3: 0.09
    },
    length: {
      0: 23.87,
      1: 18,
      2: 5.59,
      3: 4.6
    },
    radius: {
      0: 0.81,
      1: 0.56,
      2: 0.76,
      3: 0.7
    },
    sections: {
      0: 12,
      1: 10,
      2: 10,
      3: 10
    },
    segments: {
      0: 8,
      1: 6,
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
    count: 30,
    start: 0,
    size: 2.05,
    sizeVariance: 0.717,
    roundedNormals: true
  }
};

const aspenLarge: TreeOptions = {
  seed: 30631,
  type: 'deciduous',
  branch: {
    levels: 2,
    angle: {
      1: 47,
      2: 63,
      3: 7
    },
    children: {
      0: 10,
      1: 6,
      2: 0
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: 0.021739130434782622
    },
    gnarliness: {
      0: 0.05,
      1: -0.030000000000000006,
      2: 0.12,
      3: 0.02
    },
    length: {
      0: 69.60000000000001,
      1: 18.56,
      2: 11.19,
      3: 1
    },
    radius: {
      0: 1.11,
      1: 0.5800000000000001,
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
      1: 0.62,
      2: 0.049999999999999975,
      3: 0
    },
    taper: {
      0: 0.7000000000000001,
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
    angle: 36,
    count: 20,
    start: 0.15217391304347827,
    size: 3.4782608695652173,
    sizeVariance: 0.7,
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

const aspenSmall: TreeOptions = {
  seed: 36330,
  type: 'deciduous',
  branch: {
    levels: 2,
    angle: {
      1: 70,
      2: 35,
      3: 7
    },
    children: {
      0: 4,
      1: 3,
      2: 3
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: 0.010869565217391311
    },
    gnarliness: {
      0: 0.04,
      1: -0.010000000000000007,
      2: 0.12,
      3: 0.02
    },
    length: {
      0: 23.99,
      1: 3.36,
      2: 7.699999999999999,
      3: 1
    },
    radius: {
      0: 0.36999999999999994,
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
      1: 0.44999999999999996,
      2: 0.32999999999999996,
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
    count: 13,
    start: 0.2,
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

const bush2: TreeOptions = {
  seed: 45590,
  type: 'deciduous',
  branch: {
    levels: 2,
    angle: {
      1: 19.565217391304348,
      2: 27.39130434782609,
      3: 60
    },
    children: {
      0: 10,
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
      0: 0.021739130434782594,
      1: 0.10869565217391308,
      2: 0.05,
      3: 0.09
    },
    length: {
      0: 0.1,
      1: 19.645652173913046,
      2: 7.701086956521739,
      3: 4.6
    },
    radius: {
      0: 0.5793478260869566,
      1: 0.9521739130434783,
      2: 0.76,
      3: 0.7
    },
    sections: {
      0: 3,
      1: 4,
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
      1: 0.6413043478260869,
      2: 0.7065217391304348,
      3: 0
    },
    taper: {
      0: 0.7,
      1: 0.7,
      2: 0.7,
      3: 0.7
    },
    twist: {
      0: 0.3586956521739131,
      1: -0.043478260869565244,
      2: 0,
      3: 0
    }
  },
  leaves: {
    billboard: 'double',
    angle: 55,
    count: 7,
    start: 0,
    size: 2.4456521739130435,
    sizeVariance: 0.717,
    roundedNormals: true
  }
};

const bush3: TreeOptions = {
  seed: 31343,
  type: 'evergreen',
  branch: {
    levels: 3,
    angle: {
      1: 66.52173913043478,
      2: 52.82608695652174,
      3: 0
    },
    children: {
      0: 13,
      1: 4,
      2: 4
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
      0: 0.05434782608695654,
      1: 0.06521739130434778,
      2: 0.05,
      3: 0.09
    },
    length: {
      0: 10.958695652173914,
      1: 21.81739130434783,
      2: 13.130434782608695,
      3: 5.529347826086957
    },
    radius: {
      0: 0.5793478260869566,
      1: 0.9521739130434783,
      2: 0.6858695652173914,
      3: 0.7391304347826086
    },
    sections: {
      0: 4,
      1: 3,
      2: 3,
      3: 10
    },
    segments: {
      0: 3,
      1: 3,
      2: 3,
      3: 3
    },
    start: {
      1: 0.14130434782608695,
      2: 0.29347826086956524,
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
      1: -0.03260869565217389,
      2: 0,
      3: 0
    }
  },
  leaves: {
    billboard: 'double',
    angle: 54,
    count: 3,
    start: 0.15217391304347827,
    size: 3.0434782608695654,
    sizeVariance: 0.45652173913043476,
    roundedNormals: true
  }
};

const oakLarge: TreeOptions = {
  seed: 23399,
  type: 'deciduous',
  branch: {
    levels: 3,
    angle: {
      1: 54,
      2: 43,
      3: 32
    },
    children: {
      0: 9,
      1: 5,
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
      0: -0.04,
      1: 0.16,
      2: -0.06,
      3: 0.09
    },
    length: {
      0: 47.7,
      1: 29.39,
      2: 17.62,
      3: 7.16
    },
    radius: {
      0: 3,
      1: 0.69,
      2: 0.69,
      3: 1.19
    },
    sections: {
      0: 16,
      1: 9,
      2: 8,
      3: 3
    },
    segments: {
      0: 12,
      1: 5,
      2: 3,
      3: 3
    },
    start: {
      1: 0.35,
      2: 0.1,
      3: 0
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
    angle: 36,
    count: 10,
    start: 0.16,
    size: 4.5,
    sizeVariance: 0.7,
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

const oakSmall: TreeOptions = {
  seed: 30895,
  type: 'deciduous',
  branch: {
    levels: 3,
    angle: {
      1: 54,
      2: 58,
      3: 32
    },
    children: {
      0: 4,
      1: 2,
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
      0: 0.07,
      1: -0.08,
      2: 0.11,
      3: 0.09
    },
    length: {
      0: 28.08,
      1: 4.55,
      2: 9.78,
      3: 7.16
    },
    radius: {
      0: 1,
      1: 1.02,
      2: 0.69,
      3: 1.19
    },
    sections: {
      0: 16,
      1: 9,
      2: 8,
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
    count: 14,
    start: 0.16,
    size: 1.38,
    sizeVariance: 0.7,
    roundedNormals: true
  }
};

const pineLarge: TreeOptions = {
  seed: 44166,
  type: 'evergreen',
  branch: {
    levels: 1,
    angle: {
      1: 129.1304347826087,
      2: 16,
      3: 60
    },
    children: {
      0: 100,
      1: 3,
      2: 0
    },
    force: {
      direction: {
        x: 0,
        y: 1,
        z: 0
      },
      strength: 0.009000000000000001
    },
    gnarliness: {
      0: 0.05,
      1: 0.08,
      2: 0,
      3: 0
    },
    length: {
      0: 65.25217391304348,
      1: 34.84782608695652,
      2: 27.246739130434783,
      3: 1
    },
    radius: {
      0: 1.271739130434783,
      1: 0.366304347826087,
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
      1: 0.29347826086956524,
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
    angle: 17,
    count: 18,
    start: 0.07608695652173914,
    size: 2.608695652173913,
    sizeVariance: 0.201,
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

const pineSmall: TreeOptions = {
  seed: 11744,
  type: 'evergreen',
  branch: {
    levels: 1,
    angle: {
      1: 117,
      2: 60,
      3: 60
    },
    children: {
      0: 91,
      1: 7,
      2: 5
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
      0: 0.05,
      1: 0.08,
      2: 0,
      3: 0
    },
    length: {
      0: 39.55,
      1: 12.12,
      2: 10,
      3: 1
    },
    radius: {
      0: 0.55,
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
      1: 0.16,
      2: 0.3,
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
    angle: 10,
    count: 21,
    start: 0,
    size: 0.965,
    sizeVariance: 0.7,
    roundedNormals: true
  }
};

export const TREE_PRESETS = {
  ashLarge,
  ashMedium,
  ashSmall,
  aspenLarge,
  aspenMedium,
  aspenSmall,
  bush1,
  bush2,
  bush3,
  oakLarge,
  oakMedium,
  oakSmall,
  pineLarge,
  pineMedium,
  pineSmall,
} as const;
