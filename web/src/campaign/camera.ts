export interface CamView {
  x: number;
  y: number;
  scale: number; // px per km at the look-at point
  /** User yaw about the look target, radians; 0 (or absent) = north-up. */
  yaw?: number;
}
