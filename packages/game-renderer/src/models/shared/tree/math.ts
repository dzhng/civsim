// Minimal Y-up vector math for the vendored ez-tree generator: exactly the
// THREE.Vector3 / THREE.Euler / THREE.Quaternion subset the generator calls,
// with the same formulas, so the port stays diffable against upstream without
// pulling three.js into the shared models layer (game-renderer is three-free).

export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  copy(v: Vec3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v: Vec3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v: Vec3): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  subVectors(a: Vec3, b: Vec3): this {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  multiplyScalar(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  divideScalar(s: number): this {
    return this.multiplyScalar(1 / s);
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  normalize(): this {
    const len = this.length() || 1;
    return this.divideScalar(len);
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  crossVectors(a: Vec3, b: Vec3): this {
    const ax = a.x,
      ay = a.y,
      az = a.z;
    const bx = b.x,
      by = b.y,
      bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  lerpVectors(a: Vec3, b: Vec3, t: number): this {
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    this.z = a.z + (b.z - a.z) * t;
    return this;
  }

  applyQuaternion(q: Quat): this {
    const { x: vx, y: vy, z: vz } = this;
    const { x: qx, y: qy, z: qz, w: qw } = q;
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    // v + w*t + cross(q.xyz, t)
    this.x = vx + qw * tx + qy * tz - qz * ty;
    this.y = vy + qw * ty + qz * tx - qx * tz;
    this.z = vz + qw * tz + qx * ty - qy * tx;
    return this;
  }

  applyEuler(e: Euler): this {
    return this.applyQuaternion(new Quat().setFromEuler(e));
  }
}

/** Intrinsic XYZ-order Euler angles (radians), matching THREE's default. */
export class Euler {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  clone(): Euler {
    return new Euler(this.x, this.y, this.z);
  }

  copy(e: Euler): this {
    this.x = e.x;
    this.y = e.y;
    this.z = e.z;
    return this;
  }

  setFromQuaternion(q: Quat): this {
    // Rotation-matrix elements needed for XYZ extraction.
    const { x, y, z, w } = q;
    const m11 = 1 - 2 * (y * y + z * z);
    const m12 = 2 * (x * y - w * z);
    const m13 = 2 * (x * z + w * y);
    const m23 = 2 * (y * z - w * x);
    const m33 = 1 - 2 * (x * x + y * y);
    const m22 = 1 - 2 * (x * x + z * z);
    const m32 = 2 * (y * z + w * x);
    this.y = Math.asin(Math.min(1, Math.max(-1, m13)));
    if (Math.abs(m13) < 0.9999999) {
      this.x = Math.atan2(-m23, m33);
      this.z = Math.atan2(-m12, m11);
    } else {
      this.x = Math.atan2(m32, m22);
      this.z = 0;
    }
    return this;
  }
}

export class Quat {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}

  setFromAxisAngle(axis: Vec3, angle: number): this {
    const half = angle / 2;
    const s = Math.sin(half);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(half);
    return this;
  }

  setFromEuler(e: Euler): this {
    const c1 = Math.cos(e.x / 2);
    const c2 = Math.cos(e.y / 2);
    const c3 = Math.cos(e.z / 2);
    const s1 = Math.sin(e.x / 2);
    const s2 = Math.sin(e.y / 2);
    const s3 = Math.sin(e.z / 2);
    this.x = s1 * c2 * c3 + c1 * s2 * s3;
    this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 + s1 * s2 * c3;
    this.w = c1 * c2 * c3 - s1 * s2 * s3;
    return this;
  }

  /** this = this * q */
  multiply(q: Quat): this {
    return this.multiplyQuaternions(this, q);
  }

  /** this = q * this */
  premultiply(q: Quat): this {
    return this.multiplyQuaternions(q, this);
  }

  multiplyQuaternions(a: Quat, b: Quat): this {
    const { x: ax, y: ay, z: az, w: aw } = a;
    const { x: bx, y: by, z: bz, w: bw } = b;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  slerp(qb: Quat, t: number): this {
    if (t === 0) return this;
    if (t === 1) {
      this.x = qb.x;
      this.y = qb.y;
      this.z = qb.z;
      this.w = qb.w;
      return this;
    }
    const { x, y, z, w } = this;
    let cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z;
    let bx = qb.x,
      by = qb.y,
      bz = qb.z,
      bw = qb.w;
    if (cosHalfTheta < 0) {
      cosHalfTheta = -cosHalfTheta;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    if (cosHalfTheta >= 1.0) return this;
    const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;
    if (sqrSinHalfTheta <= Number.EPSILON) {
      const s = 1 - t;
      this.x = s * x + t * bx;
      this.y = s * y + t * by;
      this.z = s * z + t * bz;
      this.w = s * w + t * bw;
      const len = Math.hypot(this.x, this.y, this.z, this.w) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      this.w /= len;
      return this;
    }
    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
    this.x = x * ratioA + bx * ratioB;
    this.y = y * ratioA + by * ratioB;
    this.z = z * ratioA + bz * ratioB;
    this.w = w * ratioA + bw * ratioB;
    return this;
  }
}
