export interface CamView {
  x: number;
  y: number;
  scale: number; // backing pixels per km at the look-at point (CSS scale × DPR)
  /** User yaw about the look target, radians; 0 (or absent) = north-up. */
  yaw?: number;
}
