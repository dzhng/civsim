import type { MeshData } from './meshBuilder';
import {
  buildBroadleafTreeMesh,
  buildCartMesh,
  buildConiferTreeMesh,
  buildMountainMesh,
  buildRockMesh,
} from './sceneryPropModels';

// The shared ownership seam for reusable scenery props. Trees, rocks,
// mountains, and carts are the same models whether they dress a campaign road
// or a battlefield, so the builder list lives here once and every surface
// (campaign scenery pass, battle terrain props, the model-sheet review route)
// places by id instead of re-declaring its own table. Geometry stays in
// `sceneryPropModels.ts`; this module names it.

export type SceneryPropId = 'conifer' | 'broadleaf' | 'rock' | 'mountain' | 'cart';

export interface SceneryPropModel {
  id: SceneryPropId;
  /** Human label for review sheets. */
  label: string;
  build: () => MeshData;
  /** Size a lone prop reads well at the campaign/battle pitch. */
  defaultScale: number;
}

export const SCENERY_PROP_MODELS: Record<SceneryPropId, SceneryPropModel> = {
  conifer: { id: 'conifer', label: 'Conifer', build: buildConiferTreeMesh, defaultScale: 4.1 },
  broadleaf: { id: 'broadleaf', label: 'Broadleaf', build: buildBroadleafTreeMesh, defaultScale: 4.1 },
  rock: { id: 'rock', label: 'Rock cluster', build: buildRockMesh, defaultScale: 4.0 },
  mountain: { id: 'mountain', label: 'Mountain massif', build: buildMountainMesh, defaultScale: 4.6 },
  cart: { id: 'cart', label: 'Cart', build: buildCartMesh, defaultScale: 3.4 },
};

// One placed prop on the neutral review ground. `kind` is a prop id; sizes are
// authored per-sheet so each family frames tightly at its own camera.
export interface PropReviewInstance {
  kind: SceneryPropId;
  x: number;
  y: number;
  size: number;
  shade?: number;
  yaw?: number;
}

export interface PropReviewCamera {
  x: number;
  y: number;
  zoom: number;
  pitch: number;
  yaw: number;
  perspective: number;
}

// A review sheet: one reusable prop family posed on neutral ground with no
// cities, labels, roads, water, or fog competing for the eye. These are the
// canonical compositions battle and campaign both trust the props at.
export interface PropReviewGroup {
  id: string;
  label: string;
  camera: PropReviewCamera;
  props: PropReviewInstance[];
}

const TREE_CAMERA: PropReviewCamera = { x: 0, y: -0.3, zoom: 40, pitch: 0.56, yaw: 0, perspective: 0.016 };
const SINGLE_CAMERA: PropReviewCamera = { x: 0, y: -0.36, zoom: 54, pitch: 0.56, yaw: 0, perspective: 0.018 };
const STONE_CAMERA: PropReviewCamera = { x: 0, y: -0.4, zoom: 40, pitch: 0.56, yaw: 0, perspective: 0.014 };

export const PROP_REVIEW_GROUPS: PropReviewGroup[] = [
  {
    id: 'trees',
    label: 'Mixed Trees',
    camera: TREE_CAMERA,
    props: [
      { kind: 'conifer', x: -3.8, y: -0.6, size: 3.7 },
      { kind: 'broadleaf', x: -1.5, y: -0.8, size: 3.2 },
      { kind: 'broadleaf', x: 1.2, y: -0.5, size: 4.0 },
      { kind: 'conifer', x: 3.6, y: -0.9, size: 3.0 },
    ],
  },
  {
    id: 'conifer',
    label: 'Conifer',
    camera: SINGLE_CAMERA,
    props: [{ kind: 'conifer', x: 0.0, y: -0.55, size: 4.1, shade: 0.62 }],
  },
  {
    id: 'broadleaf',
    label: 'Broadleaf',
    camera: SINGLE_CAMERA,
    props: [{ kind: 'broadleaf', x: 0.0, y: -0.55, size: 4.1, shade: 0.66 }],
  },
  {
    id: 'rocks',
    label: 'Rock Cluster',
    camera: STONE_CAMERA,
    props: [
      { kind: 'rock', x: -3.2, y: -1.0, size: 4.0 },
      { kind: 'rock', x: 0.2, y: -1.2, size: 4.8 },
      { kind: 'rock', x: 3.3, y: -0.8, size: 3.5 },
    ],
  },
  {
    id: 'mountain',
    label: 'Mountain Massif',
    camera: STONE_CAMERA,
    props: [
      { kind: 'mountain', x: -2.4, y: -0.6, size: 4.6 },
      { kind: 'mountain', x: 2.7, y: -0.9, size: 3.9 },
    ],
  },
  {
    id: 'cart',
    label: 'Cart',
    camera: SINGLE_CAMERA,
    props: [
      { kind: 'cart', x: -1.6, y: -0.5, size: 3.4, yaw: -0.18 },
      { kind: 'cart', x: 2.0, y: -0.7, size: 2.9, yaw: 0.22 },
    ],
  },
];
