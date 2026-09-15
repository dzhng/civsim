import type { CameraSnapshot } from "@packages/renderer-core/src/cameraUniform";
import {
  blockedRectsKey,
  buildLabelAtlas,
  buildLabelVertices,
  labelAtlasKey,
  labelDebugRects,
  labelText,
  visibleLabels,
  type CampaignLabelDebugRect,
  type CampaignLabelPlacementStyle,
  type CampaignLabelProjection,
} from "./labelLayout";
export interface CampaignLabel {
  text: string;
  x: number;
  y: number;
  kind: "city" | "sea" | "army" | "faction";
  size: number;
  priority: number;
  importance?: number;
  angle?: number;
  curve?: number;
  icon?: "city" | "army" | "sword";
  iconColor?: [number, number, number];
  rightIcon?: "sword";
  rightIconColor?: [number, number, number];
  sideText?: string;
  subText?: string;
  collisionGroup?: string;
  screenOffsetX?: number;
  screenOffsetY?: number;
  screenAnchorX?: "center" | "left" | "right";
  screenAnchorY?: "center" | "top" | "bottom";
  factionRadiusKm?: number;
  factionMinor?: boolean;
}
export interface CampaignLabelFrameStats {
  labels: number;
  visibleLabels: number;
  visibleLabelNames: string[];
  visibleSeaLabelRects: CampaignLabelDebugRect[];
  visibleCityLabelRects: CampaignLabelDebugRect[];
  visibleArmyLabelRects: CampaignLabelDebugRect[];
  visibleFactionLabelRects: CampaignLabelDebugRect[];
  collisionCulls: number;
  collisionCulledLabels: string[];
  atlasWidth: number;
  atlasHeight: number;
  vertices: number;
}

/** Renderer-neutral measured atlas and accepted screen quads. */
export class CampaignLabelFrame {
  private atlasKey = "";
  atlas: ReturnType<typeof buildLabelAtlas> | null = null;
  vertices: Float32Array = new Float32Array();
  private statsValue: CampaignLabelFrameStats = {
    labels: 0,
    visibleLabels: 0,
    visibleLabelNames: [],
    visibleSeaLabelRects: [],
    visibleCityLabelRects: [],
    visibleArmyLabelRects: [],
    visibleFactionLabelRects: [],
    collisionCulls: 0,
    collisionCulledLabels: [],
    atlasWidth: 1,
    atlasHeight: 1,
    vertices: 0,
  };

  update(
    labels: CampaignLabel[],
    snapshot: CameraSnapshot,
    dpr: number,
    placement?: CampaignLabelPlacementStyle,
    project?: CampaignLabelProjection,
  ) {
    const visible = visibleLabels(labels, snapshot, dpr, project);
    if (visible.length === 0) {
      this.vertices = new Float32Array();
      this.atlas = null;
      this.atlasKey = `empty:${labels.length}:${dpr}`;
      this.statsValue = {
        labels: labels.length,
        visibleLabels: 0,
        visibleLabelNames: [],
        visibleSeaLabelRects: [],
        visibleCityLabelRects: [],
        visibleArmyLabelRects: [],
        visibleFactionLabelRects: [],
        collisionCulls: 0,
        collisionCulledLabels: [],
        atlasWidth: 1,
        atlasHeight: 1,
        vertices: 0,
      };
      return this.statsValue;
    }

    // Blocked card rects join the key: a card that moved must re-arbitrate the
    // canvas labels even when every label input is unchanged.
    const atlasKey = `${labelAtlasKey(visible, dpr, labels.length)}#${blockedRectsKey(placement)}#${project ? `${snapshot.width}:${snapshot.height}:${visible.map((v) => `${v.screenX}:${v.screenY}`).join(";")}` : ""}`;
    if (atlasKey === this.atlasKey) return this.statsValue;
    this.atlasKey = atlasKey;
    const atlas = buildLabelAtlas(visible, dpr, snapshot, placement);
    this.atlas = atlas;
    this.vertices = buildLabelVertices(atlas.entries, true);
    const debugRects = labelDebugRects(atlas.entries, dpr);
    this.statsValue = {
      labels: labels.length,
      visibleLabels: atlas.entries.length,
      visibleLabelNames: atlas.entries
        .slice(0, 128)
        .map((entry) => `${entry.label.kind}:${labelText(entry.label)}`),
      visibleSeaLabelRects: debugRects.filter((entry) => entry.kind === "sea"),
      visibleCityLabelRects: debugRects.filter((entry) => entry.kind === "city"),
      visibleArmyLabelRects: debugRects.filter((entry) => entry.kind === "army"),
      visibleFactionLabelRects: debugRects.filter((entry) => entry.kind === "faction"),
      collisionCulls: atlas.collisionCulls,
      collisionCulledLabels: atlas.collisionCulledLabels,
      atlasWidth: atlas.width,
      atlasHeight: atlas.height,
      vertices: this.vertices.length / 6,
    };
    return this.statsValue;
  }

  stats() {
    return this.statsValue;
  }
}
