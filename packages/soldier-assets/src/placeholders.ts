import type { SoldierKitManifest, VatBake } from './schema';

export const PLACEHOLDER_KIT_URL = '/assets/soldiers/kit.json';
export const PLACEHOLDER_VAT_URL = '/assets/soldiers/baked/human-placeholder.vat.json';

export async function loadPlaceholderKit(): Promise<SoldierKitManifest> {
  const res = await fetch(PLACEHOLDER_KIT_URL);
  if (!res.ok) throw new Error(`failed to load placeholder kit: ${res.status}`);
  return await res.json() as SoldierKitManifest;
}

export async function loadPlaceholderVat(): Promise<VatBake> {
  const res = await fetch(PLACEHOLDER_VAT_URL);
  if (!res.ok) throw new Error(`failed to load placeholder VAT: ${res.status}`);
  return await res.json() as VatBake;
}

export function placeholderClipNames(kit: SoldierKitManifest): string[] {
  return Object.keys(kit.clips).sort((a, b) => kit.clips[a].start - kit.clips[b].start);
}

