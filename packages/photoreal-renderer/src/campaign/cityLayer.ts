import { colorGeometry, decalMaterial } from "../landscape/decal";
import { RENDER_ORDER } from "../renderOrder";
import type { SurfaceDomain } from "../../../game-renderer/src/terrain/surface";
import * as THREE from "three/webgpu";
import type { CampaignEntityInstance } from "../../../game-renderer/src/campaign/entityInstance";
import { buildCityMesh } from "../../../game-renderer/src/models/campaign/campaignEntityModels";
import type { RenderedSurface } from "../../../game-renderer/src/terrain/surface";
import type { CampaignWorldObject } from "./campaignWorld";
import { modelMesh, modelGeometry } from "./modelMesh";

/** Cities share the authored model. Only their vertical contact adapts to terrain. */
export class CampaignCityLayer {
  readonly objects: { input: CampaignWorldObject; mesh: THREE.Mesh }[] = [];
  private instances: readonly CampaignEntityInstance[] = [];
  private uploads = 0;
  private readonly authored = buildCityMesh();
  private readonly footprintRadius = Math.max(
    ...[this.authored.opaque, this.authored.shadow].map((part) => {
      let radius = 0;
      for (let i = 0; i < part.vertices.length; i += 10)
        radius = Math.max(radius, Math.hypot(part.vertices[i], part.vertices[i + 1]));
      return radius;
    }),
  );
  constructor(private readonly scene: THREE.Scene) {}

  upload(
    instances: readonly CampaignEntityInstance[],
    surface: Pick<RenderedSurface, "sampleRendered">,
  ) {
    if (
      instances.length === this.instances.length &&
      instances.every((city, i) => sameCity(city, this.instances[i]))
    )
      return false;
    this.instances = instances.map((city) => ({
      ...city,
      faction: [...city.faction],
      allegiance: [...city.allegiance],
    }));
    const live = new Set(instances.map((city) => city.id.toString()));
    for (let i = this.objects.length - 1; i >= 0; i--) {
      if (live.has(this.objects[i].input.id)) continue;
      this.remove(this.objects[i].mesh);
      this.objects.splice(i, 1);
    }
    const byId = new Map(this.objects.map((object) => [object.input.id, object]));
    for (const city of instances) {
      let object = byId.get(city.id.toString());
      const input: CampaignWorldObject = {
        id: city.id.toString(),
        label: city.label,
        x: city.x,
        y: city.y,
        scale: city.radius / 5,
        faction: "azure",
        model: this.authored,
        city,
      };
      if (!object) {
        const mesh = modelMesh(input.model);
        mesh.name = input.id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const contact = new THREE.Mesh(new THREE.BufferGeometry(), decalMaterial());
        contact.name = "city-contact";
        contact.renderOrder = RENDER_ORDER.groundCues;
        mesh.add(contact);
        object = { input, mesh };
        this.objects.push(object);
        this.scene.add(mesh);
      } else {
        const previous = object.input;
        object.input = input;
        if (previous.x === input.x && previous.y === input.y && previous.scale === input.scale) {
          input.model = previous.model;
          input.standardBase = previous.standardBase;
          continue;
        }
      }
      this.seatObject(object, surface);
    }
    this.uploads++;
    return true;
  }

  seat(surface: Pick<RenderedSurface, "sampleRendered">, changed?: readonly SurfaceDomain[]) {
    for (const object of this.objects) {
      const { x, y, scale } = object.input;
      const radius = this.footprintRadius * scale;
      if (
        changed &&
        !changed.some(
          (domain) =>
            x + radius >= domain.ox &&
            y + radius >= domain.oy &&
            x - radius <= domain.ox + (domain.columns - 1) * domain.cell &&
            y - radius <= domain.oy + (domain.rows - 1) * domain.cell,
        )
      )
        continue;
      this.seatObject(object, surface);
    }
  }
  private seatObject(
    object: (typeof this.objects)[number],
    surface: Pick<RenderedSurface, "sampleRendered">,
  ) {
    const { input, mesh } = object;
    const center = surface.sampleRendered(input.x, input.y);
    if (!center) {
      mesh.visible = false;
      return;
    }
    const base = center.position[2];
    const localGround = (x: number, y: number) => {
      const hit = surface.sampleRendered(input.x + x * input.scale, input.y + y * input.scale);
      return ((hit?.position[2] ?? base) - base) / input.scale;
    };
    const model = buildCityMesh(localGround);
    input.model = model;
    mesh.geometry.dispose();
    mesh.geometry = modelGeometry(model);
    // Preserve the authored contact cue; this is not a replacement for sun shadows.
    const shadow = model.shadow.vertices.slice();
    for (let offset = 0; offset < shadow.length; offset += 10)
      shadow[offset + 2] += localGround(shadow[offset], shadow[offset + 1]);
    const contact = mesh.children[0] as THREE.Mesh;
    contact.geometry.dispose();
    contact.geometry = colorGeometry(shadow, 10, 6, model.shadow.indices);
    mesh.position.set(input.x, input.y, base);
    mesh.scale.setScalar(input.scale);
    // Translate the existing full-height settlement pole with its central building.
    input.standardBase = model.standardBase;
  }
  stats() {
    return { instances: this.instances.length, uploads: this.uploads };
  }
  private remove(mesh: THREE.Mesh) {
    for (const child of mesh.children) {
      const contact = child as THREE.Mesh;
      contact.geometry.dispose();
      (contact.material as THREE.Material).dispose();
    }
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  dispose() {
    for (const { mesh } of this.objects) this.remove(mesh);
    this.objects.length = 0;
  }
}

function sameCity(a: CampaignEntityInstance, b: CampaignEntityInstance) {
  return (
    a.id === b.id &&
    a.label === b.label &&
    a.selected === b.selected &&
    a.x === b.x &&
    a.y === b.y &&
    a.radius === b.radius &&
    a.selectionRadius === b.selectionRadius &&
    a.strength === b.strength &&
    a.faction.every((value, i) => value === b.faction[i]) &&
    a.allegiance.every((value, i) => value === b.allegiance[i])
  );
}
