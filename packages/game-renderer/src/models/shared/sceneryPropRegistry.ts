import type { TreeDetail } from './sceneryPropModels';
import type { MeshData } from './meshBuilder';
import {
  buildCartMesh,
  buildMountainMesh,
  buildRockMesh,
  buildTreeSpeciesMesh,
} from './sceneryPropModels';

// The shared ownership seam for reusable scenery props. Trees, rocks,
// mountains, and carts are the same models whether they dress a campaign road
// or a battlefield, so the builder list lives here once and every surface
// (campaign scenery pass, battle terrain props, the model-sheet review route)
// places by id instead of re-declaring its own table. Geometry stays in
// `sceneryPropModels.ts`; this module names it.

export type SceneryPropId =
  | 'conifer'
  | 'broadleaf'
  | 'ash'
  | 'aspen'
  | 'bush'
  | 'rock'
  | 'mountain'
  | 'cart';

/** Coarse grouping surfaces use for placement mixes and stats. */
type SceneryPropFamily = 'tree' | 'rock' | 'mountain' | 'cart';

interface SceneryPropModel {
  id: SceneryPropId;
  /** Human label for review sheets. */
  label: string;
  family: SceneryPropFamily;
  build: (detail?: TreeDetail, variant?: number) => MeshData;
  /** Size a lone prop reads well at the campaign/battle pitch. */
  defaultScale: number;
}

export const SCENERY_PROP_MODELS: Record<SceneryPropId, SceneryPropModel> = {
  conifer: { id: 'conifer', label: 'Conifer', family: 'tree', build: (detail, variant) => buildTreeSpeciesMesh('conifer', detail, variant), defaultScale: 4.1 },
  broadleaf: { id: 'broadleaf', label: 'Broadleaf', family: 'tree', build: (detail, variant) => buildTreeSpeciesMesh('broadleaf', detail, variant), defaultScale: 4.1 },
  ash: { id: 'ash', label: 'Ash', family: 'tree', build: (detail, variant) => buildTreeSpeciesMesh('ash', detail, variant), defaultScale: 4.1 },
  aspen: { id: 'aspen', label: 'Aspen', family: 'tree', build: (detail, variant) => buildTreeSpeciesMesh('aspen', detail, variant), defaultScale: 4.1 },
  bush: { id: 'bush', label: 'Bush', family: 'tree', build: (detail, variant) => buildTreeSpeciesMesh('bush', detail, variant), defaultScale: 3.0 },
  rock: { id: 'rock', label: 'Rock cluster', family: 'rock', build: buildRockMesh, defaultScale: 4.0 },
  mountain: { id: 'mountain', label: 'Mountain massif', family: 'mountain', build: buildMountainMesh, defaultScale: 4.6 },
  cart: { id: 'cart', label: 'Cart', family: 'cart', build: buildCartMesh, defaultScale: 3.4 },
};

export const SCENERY_PROP_IDS = Object.keys(SCENERY_PROP_MODELS) as SceneryPropId[];

// One placed prop on the neutral review ground. `kind` is a prop id; sizes are
// authored per-sheet so each family frames tightly at its own camera.
interface PropReviewInstance {
  kind: SceneryPropId;
  x: number;
  y: number;
  size: number;
  shade?: number;
  yaw?: number;
}

interface PropReviewCamera {
  x: number;
  y: number;
  zoom: number;
  pitch: number;
  yaw: number;
}

// A review sheet: one reusable prop family posed on neutral ground with no
// cities, labels, roads, water, or fog competing for the eye. These are the
// canonical compositions battle and campaign both trust the props at.
interface PropReviewGroup {
  id: string;
  label: string;
  camera: PropReviewCamera;
  props: PropReviewInstance[];
}

// Oblique review pitch: prop elevation is scaled by sin(pitch) under camera3d,
// so the sheets read the props' height like the old full-z contact sheets.
const TREE_CAMERA: PropReviewCamera = { x: 0, y: -0.3, zoom: 34, pitch: 1.0, yaw: 0 };
const TREE_SINGLE_CAMERA: PropReviewCamera = { x: 0, y: -0.36, zoom: 45, pitch: 1.0, yaw: 0 };
const SINGLE_CAMERA: PropReviewCamera = { x: 0, y: -0.36, zoom: 54, pitch: 1.0, yaw: 0 };
const STONE_CAMERA: PropReviewCamera = { x: 0, y: -0.4, zoom: 40, pitch: 1.0, yaw: 0 };

export const PROP_REVIEW_GROUPS: PropReviewGroup[] = [
  {
    id: 'trees',
    label: 'Mixed Trees',
    camera: TREE_CAMERA,
    props: [
      { kind: 'conifer', x: -5.2, y: -0.6, size: 3.7 },
      { kind: 'ash', x: -2.6, y: -0.9, size: 3.6 },
      { kind: 'broadleaf', x: 0.0, y: -0.5, size: 4.0 },
      { kind: 'aspen', x: 2.6, y: -0.8, size: 3.4 },
      { kind: 'bush', x: 4.4, y: -1.2, size: 2.6 },
      { kind: 'conifer', x: 5.8, y: -0.7, size: 3.1 },
    ],
  },
  {
    id: 'conifer',
    label: 'Conifer',
    camera: TREE_SINGLE_CAMERA,
    props: [{ kind: 'conifer', x: 0.0, y: -0.55, size: 4.1, shade: 0.62 }],
  },
  {
    id: 'broadleaf',
    label: 'Broadleaf',
    camera: TREE_SINGLE_CAMERA,
    props: [{ kind: 'broadleaf', x: 0.0, y: -0.55, size: 4.1, shade: 0.66 }],
  },
  {
    id: 'ash',
    label: 'Ash',
    camera: TREE_SINGLE_CAMERA,
    props: [{ kind: 'ash', x: 0.0, y: -0.55, size: 4.1, shade: 0.6 }],
  },
  {
    id: 'aspen',
    label: 'Aspen',
    camera: TREE_SINGLE_CAMERA,
    props: [{ kind: 'aspen', x: 0.0, y: -0.55, size: 4.1, shade: 0.6 }],
  },
  {
    id: 'bush',
    label: 'Bush',
    camera: TREE_SINGLE_CAMERA,
    props: [
      { kind: 'bush', x: -1.4, y: -0.5, size: 3.0, shade: 0.6 },
      { kind: 'bush', x: 1.2, y: -0.7, size: 2.4, shade: 0.4, yaw: 2.1 },
    ],
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
    // Two carts facing OUTWARD (shafts point away from centre) so the front
    // poles never clip the neighbour; spaced enough to read as two separate carts.
    props: [
      { kind: 'cart', x: -1.9, y: -0.4, size: 3.3, yaw: 2.78 },
      { kind: 'cart', x: 1.9, y: -0.7, size: 2.9, yaw: 0.16 },
    ],
  },
];
