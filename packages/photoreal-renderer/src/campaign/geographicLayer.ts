import * as THREE from "three/webgpu";
import type { RenderedSurface } from "../../../game-renderer/src/terrain/surface";
import { colorGeometry } from "../landscape/decal";
import { RENDER_ORDER } from "../renderOrder";

/** Existing CPU road/border builder outputs. Build without heightAt: z is the
 * intended surface clearance; this layer owns seating on presented triangles. */
export interface CampaignGeography {
  roadMeshVertices: Float32Array;
  roadAnchors: Float32Array;
  lineVertices: Float32Array;
  borderVertices: Float32Array;
}

type Region = RenderedSurface["domain"];
type Entry = {
  mesh: THREE.Mesh;
  offsets: Float32Array;
  roadLayout?: Float32Array;
  bounds: THREE.Box3;
};
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
        // Immutable center and planar lateral offset; reseating never consumes
        // already-adjusted positions, so terrain updates cannot narrow roads twice.
        const roadLayout = stride === 10 ? new Float32Array(offsets.length * 4) : undefined;
        if (roadLayout) {
          for (let triangle = 0; triangle < group.length; triangle++) {
            for (let v = 0; v < 3; v++) {
              const source = group[triangle] / stride + v;
              const index = triangle * 3 + v;
              const cx = data.roadAnchors[source * 2],
                cy = data.roadAnchors[source * 2 + 1];
              roadLayout.set(
                [cx, cy, chunk[index * stride] - cx, chunk[index * stride + 1] - cy],
                index * 4,
              );
            }
          }
        }
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
        if (roadLayout) {
          let radius = 0;
          for (let i = 0; i < offsets.length; i++)
            radius = Math.max(radius, Math.hypot(roadLayout[i * 4 + 2], roadLayout[i * 4 + 3]));
          bounds.expandByScalar(radius);
        }
        this.entries.push({ mesh, offsets, roadLayout, bounds });
        this.vertices += offsets.length;
        const attributeBytes = Object.values(geometry.attributes).reduce(
          (n, a) => n + a.array.byteLength,
          0,
        );
        this.cpuBytes += attributeBytes + offsets.byteLength + (roadLayout?.byteLength ?? 0);
        this.gpuBytes += attributeBytes;
        this.scene.add(mesh);
      }
    }
    this.seat(surface);
  }

  seat(surface: Pick<RenderedSurface, "sampleRendered">, changed?: readonly Region[]) {
    this.sampledVertices = 0;
    this.visitedVertices = 0;
    for (const { mesh, offsets, roadLayout, bounds } of this.entries) {
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
        const cx = roadLayout ? roadLayout[i * 4] : positions.getX(i);
        const cy = roadLayout ? roadLayout[i * 4 + 1] : positions.getY(i);
        const dx = roadLayout?.[i * 4 + 2] ?? 0;
        const dy = roadLayout?.[i * 4 + 3] ?? 0;
        const radius = Math.hypot(dx, dy);
        if (
          changed &&
          !changed.some(
            (r) =>
              cx + radius >= r.ox &&
              cy + radius >= r.oy &&
              cx - radius <= r.ox + (r.columns - 1) * r.cell &&
              cy - radius <= r.oy + (r.rows - 1) * r.cell,
          )
        )
          continue;
        this.sampledVertices++;
        let x = cx,
          y = cy;
        if (roadLayout && radius > 0) {
          const normal = surface.sampleRendered(cx, cy)?.normal;
          if (normal && normal[2] > 0) {
            // Lift the route tangent onto the triangle, then its perpendicular
            // onto the surface. Its length, rather than its XY projection, owns width.
            const tz = -(normal[0] * dy - normal[1] * dx) / normal[2];
            const lx = normal[1] * tz + normal[2] * dx;
            const ly = normal[2] * dy - normal[0] * tz;
            const lz = -normal[0] * dx - normal[1] * dy;
            const scale = radius / Math.hypot(lx, ly, lz);
            x += lx * scale;
            y += ly * scale;
          } else {
            x += dx;
            y += dy;
          }
        }
        const z = (surface.sampleRendered(x, y)?.position[2] ?? 0) + offsets[i];
        if (
          positions.getX(i) === Math.fround(x) &&
          positions.getY(i) === Math.fround(y) &&
          positions.getZ(i) === Math.fround(z)
        )
          continue;
        positions.setXYZ(i, x, y, z);
        (mesh.geometry.getAttribute("campaignFog") as THREE.BufferAttribute).setX(
          i,
          this.fogAt(x, y),
        );
        firstChanged = Math.min(firstChanged, i);
        lastChanged = i;
      }
      if (lastChanged >= 0) {
        positions.addUpdateRange(firstChanged * 3, (lastChanged - firstChanged + 1) * 3);
        positions.needsUpdate = true;
        const fog = mesh.geometry.getAttribute("campaignFog") as THREE.BufferAttribute;
        // Visibility can refresh the whole region in this same frame.
        // Keep fog uploads full so reseating cannot narrow that pending update.
        fog.needsUpdate = true;
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
