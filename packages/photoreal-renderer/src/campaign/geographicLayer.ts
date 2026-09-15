import * as THREE from "three/webgpu";
import type { RenderedSurface } from "../../../game-renderer/src/terrain/surface";
import { colorGeometry } from "../landscape/decal";
import { RENDER_ORDER } from "../renderOrder";

/** Existing CPU road/border builder outputs. Build without heightAt: z is the
 * intended surface clearance; this layer owns seating on presented triangles. */
export interface CampaignGeography {
  roadMeshVertices: Float32Array;
  lineVertices: Float32Array;
  borderVertices: Float32Array;
}

type Region = RenderedSurface["domain"];
type Entry = { mesh: THREE.Mesh; offsets: Float32Array };

/** One material and lifetime for campaign's depth-tested geographic ribbons. */
export class CampaignGeographicLayer {
  private entries: Entry[] = [];
  private sampledVertices = 0;
  constructor(
    private readonly scene: THREE.Scene,
    private readonly material: THREE.Material,
    private readonly fogAt: (x: number, y: number) => number,
  ) {}

  upload(data: CampaignGeography, surface: Pick<RenderedSurface, "sampleRendered">) {
    this.clear();
    for (const [vertices, stride] of [
      [data.roadMeshVertices, 10],
      [data.lineVertices, 7],
      [data.borderVertices, 7],
    ] as const) {
      if (!vertices.length) continue;
      const geometry = colorGeometry(vertices, stride, 3);
      const offsets = new Float32Array(vertices.length / stride);
      const fog = new Float32Array(offsets.length);
      for (let i = 0; i < offsets.length; i++) {
        offsets[i] = vertices[i * stride + 2];
        fog[i] = this.fogAt(vertices[i * stride], vertices[i * stride + 1]);
      }
      geometry.setAttribute("campaignFog", new THREE.BufferAttribute(fog, 1));
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.renderOrder = RENDER_ORDER.groundCues;
      this.entries.push({ mesh, offsets });
      this.scene.add(mesh);
    }
    this.seat(surface);
  }

  seat(surface: Pick<RenderedSurface, "sampleRendered">, changed?: readonly Region[]) {
    this.sampledVertices = 0;
    for (const { mesh, offsets } of this.entries) {
      const positions = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      let firstChanged = positions.count,
        lastChanged = -1;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i);
        if (
          changed &&
          !changed.some(
            (r) =>
              x >= r.ox &&
              y >= r.oy &&
              x <= r.ox + (r.columns - 1) * r.cell &&
              y <= r.oy + (r.rows - 1) * r.cell,
          )
        )
          continue;
        this.sampledVertices++;
        const z = (surface.sampleRendered(x, y)?.position[2] ?? 0) + offsets[i];
        if (positions.getZ(i) === Math.fround(z)) continue;
        positions.setZ(i, z);
        firstChanged = Math.min(firstChanged, i);
        lastChanged = i;
      }
      if (lastChanged >= 0) {
        positions.addUpdateRange(firstChanged * 3, (lastChanged - firstChanged + 1) * 3);
        positions.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
      }
    }
  }

  stats() {
    return {
      vertices: this.entries.reduce((n, e) => n + e.offsets.length, 0),
      sampledVertices: this.sampledVertices,
    };
  }
  private clear() {
    for (const { mesh } of this.entries) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.entries = [];
  }
  dispose() {
    this.clear();
    this.material.dispose();
  }
}
