import type { SoldierKitManifest, VatBake, VatClip } from '../../soldier-assets/src/schema';

interface VatClipLayout extends VatClip {
  loop: boolean;
}

export interface VatLayout {
  width: number;
  height: number;
  bones: number;
  clips: Map<string, VatClipLayout>;
}

export function createVatLayout(vat: VatBake, kit?: SoldierKitManifest): VatLayout {
  return {
    width: vat.width,
    height: vat.height,
    bones: vat.bones,
    clips: new Map(vat.clips.map((clip) => [
      clip.name,
      { ...clip, loop: kit?.clips?.[clip.name]?.loop ?? ['idle', 'march', 'run', 'at_ease'].includes(clip.name) },
    ])),
  };
}

export function resolveVatClip(layout: VatLayout, name: string): VatClipLayout {
  return layout.clips.get(name) ?? layout.clips.get('idle') ?? Array.from(layout.clips.values())[0];
}

