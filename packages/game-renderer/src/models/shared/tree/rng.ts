// Vendored from ez-tree (github.com/dgreenheck/ez-tree, MIT — see README.md).
// Seeded MWC generator: tree shape must be reproducible per seed so the same
// options always build byte-identical mesh data.
export class RNG {
  private mW: number;
  private mZ: number;
  private readonly mask = 0xffffffff;

  constructor(seed: number) {
    this.mW = (123456789 + seed) & this.mask;
    this.mZ = (987654321 - seed) & this.mask;
  }

  /** Returns a random number between min and max. */
  random(max = 1, min = 0): number {
    this.mZ = (36969 * (this.mZ & 65535) + (this.mZ >> 16)) & this.mask;
    this.mW = (18000 * (this.mW & 65535) + (this.mW >> 16)) & this.mask;
    let result = ((this.mZ << 16) + (this.mW & 65535)) >>> 0;
    result /= 4294967296;
    return (max - min) * result + min;
  }
}
