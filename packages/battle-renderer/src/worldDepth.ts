import {
  GPU_DEPTH_CLEAR,
  GPU_DEPTH_FORMAT,
  isGpuReverseZ,
} from "../../renderer-core/src/depthContract";
import { gpuWorldDepthStencil } from "../../renderer-core/src/pipelineContracts";

/** The battle world's depth decision, in one place: the frame allocates and
 * clears this attachment and every world pipeline declares its state from here,
 * so the published depth diagnostics describe resources and pipelines that are
 * actually installed instead of repeating a constant beside them.
 *
 * Equal-depth overlaps must draw (coincident ground layers, the terrain depth
 * prepass feeding its own beauty pass), so the world compare is `greater-equal`
 * in both read and write modes rather than the shared default `greater`. */
export function battleWorldDepth(mode: "read" | "read-write" | "write"): GPUDepthStencilState {
  return gpuWorldDepthStencil(mode, "greater-equal");
}

/** Overlays and the backdrop deliberately ignore world depth: they still write
 * into the same attachment's pass, so they declare its format and no test. */
export function battleDepthBypass(): GPUDepthStencilState {
  return { format: GPU_DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "always" };
}

/** What the frame's depth-stencil attachment does with the buffer each frame. */
export const BATTLE_DEPTH_ATTACHMENT = {
  format: GPU_DEPTH_FORMAT,
  clearValue: GPU_DEPTH_CLEAR,
  loadOp: "clear",
  storeOp: "store",
} as const;

/** Read off the world compare and the attachment's clear, not declared. */
export function battleDepthReversed(): boolean {
  return isGpuReverseZ(
    battleWorldDepth("read-write").depthCompare!,
    BATTLE_DEPTH_ATTACHMENT.clearValue,
  );
}
