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
type Entry = { mesh: THREE.Mesh; offsets: Float32Array; bounds: THREE.Box3 };
const REGION_SIZE = 128;

/** One material and lifetime for campaign's depth-tested geographic ribbons. */
export class CampaignGeographicLayer {
  private entries: Entry[] = [];
  private sampledVertices = 0;
  private visitedVertices = 0;
  private vertices = 0;
  private cpuBytes = 0;
  private gpuBytes = 0;
  constructor(
    private readonly scene: THREE.Scene,
    private readonly material: THREE.Material,
    private readonly fogAt: (x: number, y: number) => number,
  ) {}

  upload(data: CampaignGeography, surface: Pick<RenderedSurface, "sampleRendered">) {
    this.clear();
    for (const [vertices, stride, order] of [
      [data.roadMeshVertices, 10, 0.02],
      [data.lineVertices, 7, 0.03],
      [data.borderVertices, 7, 0.01],
    ] as const) {
      if (!vertices.length) continue;
      const groups = new Map<string, number[]>();
      for (let start = 0; start < vertices.length; start += stride * 3) {
        const x = (vertices[start] + vertices[start + stride] + vertices[start + stride * 2]) / 3;
        const y =
          (vertices[start + 1] + vertices[start + stride + 1] + vertices[start + stride * 2 + 1]) /
          3;
        const key = `${Math.floor(x / REGION_SIZE + 0.5)}:${Math.floor(y / REGION_SIZE + 0.5)}`;
        let group = groups.get(key);
        if (!group) groups.set(key, (group = []));
        group.push(start);
      }
      for (const group of groups.values()) {
        const chunk = new Float32Array(group.length * stride * 3);
        for (let i = 0; i < group.length; i++)
          chunk.set(vertices.subarray(group[i], group[i] + stride * 3), i * stride * 3);
        const geometry = colorGeometry(chunk, stride, 3);
        const offsets = new Float32Array(chunk.length / stride);
        const fog = new Float32Array(offsets.length);
        for (let i = 0; i < offsets.length; i++) {
          offsets[i] = chunk[i * stride + 2];
          fog[i] = this.fogAt(chunk[i * stride], chunk[i * stride + 1]);
        }
        geometry.setAttribute("campaignFog", new THREE.BufferAttribute(fog, 1));
        const mesh = new THREE.Mesh(geometry, this.material);
        // Keep geographic readability independent of regional batch centers.
        mesh.renderOrder = RENDER_ORDER.groundCues + order;
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!.clone();
        this.entries.push({ mesh, offsets, bounds });
        this.vertices += offsets.length;
        const attributeBytes = Object.values(geometry.attributes).reduce(
          (n, a) => n + a.array.byteLength,
          0,
        );
        this.cpuBytes += attributeBytes + offsets.byteLength;
        this.gpuBytes += attributeBytes;
        this.scene.add(mesh);
      }
    }
    this.seat(surface);
  }

  seat(surface: Pick<RenderedSurface, "sampleRendered">, changed?: readonly Region[]) {
    this.sampledVertices = 0;
    this.visitedVertices = 0;
    for (const { mesh, offsets, bounds } of this.entries) {
      if (
        changed &&
        !changed.some(
          (r) =>
            bounds.max.x >= r.ox &&
            bounds.max.y >= r.oy &&
            bounds.min.x <= r.ox + (r.columns - 1) * r.cell &&
            bounds.min.y <= r.oy + (r.rows - 1) * r.cell,
        )
      )
        continue;
      this.visitedVertices += offsets.length;
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
      vertices: this.vertices,
      cpuBytes: this.cpuBytes,
      gpuBytes: this.gpuBytes,
      sampledVertices: this.sampledVertices,
      visitedVertices: this.visitedVertices,
      regions: this.entries.length,
    };
  }
  private clear() {
    for (const { mesh } of this.entries) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.entries = [];
    this.vertices = this.cpuBytes = this.gpuBytes = 0;
  }
  dispose() {
    this.clear();
    this.material.dispose();
  }
}
