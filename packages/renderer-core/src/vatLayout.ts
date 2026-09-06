import type { VatBake, VatClip } from "../../soldier-assets/src/schema";

export interface VatLayout {
  width: number;
  height: number;
  bones: number;
  clips: Map<string, VatClip>;
}

export function createVatLayout(vat: VatBake): VatLayout {
  return {
    width: vat.width,
    height: vat.height,
    bones: vat.bones,
    clips: new Map(vat.clips.map((clip) => [clip.name, clip])),
  };
}

export function resolveVatClip(layout: VatLayout, name: string): VatClip {
  const clip = layout.clips.get(name);
  if (!clip) throw new Error(`Missing appearance clip: ${name}`);
  return clip;
}

export function sampleVatPhase(phase: number, loop: boolean): number {
  return loop ? ((phase % 1) + 1) % 1 : Math.max(0, Math.min(phase, 1));
}
