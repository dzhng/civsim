import type { CrowdProjectionView } from "./visibility";

/** Copied visibility inputs survive mutable camera matrices. Time is absent:
 * only a changed frustum or projected body size requires audience preparation. */
export class CrowdViewState {
  private values: number[] | undefined;

  matches(views: readonly CrowdProjectionView[]): boolean {
    if (!this.values) return false;
    const next = valuesFor(views);
    return (
      next.length === this.values.length && next.every((value, i) => value === this.values![i])
    );
  }

  commit(views: readonly CrowdProjectionView[]): void {
    this.values = valuesFor(views);
  }

  clear(): void {
    this.values = undefined;
  }
}

function valuesFor(views: readonly CrowdProjectionView[]): number[] {
  const values: number[] = [views.length];
  for (const { shadow, frustum, projection } of views) {
    values.push(shadow ? 1 : 0, frustum.planes.length);
    for (const { normal, constant } of frustum.planes)
      values.push(normal.x, normal.y, normal.z, constant);
    values.push(projection.pixelsPerViewUnit, projection.perspective ? 1 : 0, projection.near);
    for (let i = 0; i < 16; i++) values.push(projection.view[i]);
  }
  return values;
}
