import type { GpuTimestampRange } from "../../renderer-core/src/gpuTimestampRanges";

type Kind = "render" | "compute";
const MAX_RANGES = 4096;
interface Ledger {
  ranges: Map<string, GpuTimestampRange>;
  overflow: boolean;
}
const devices = new WeakMap<object, Ledger>();
const closed = new WeakSet<object>();
let enabled = false;
/** Called only by the pinned lab transform. No GPU APIs are invoked here. */
export function enableSourceTimestampRanges() {
  enabled = true;
}
export function sourceTimestampRangesEnabled() {
  return enabled;
}
function ledger(device: object) {
  let value = devices.get(device);
  if (!value) {
    value = { ranges: new Map(), overflow: false };
    devices.set(device, value);
  }
  return value;
}
function key(kind: Kind, uid: string) {
  return `${kind}:${uid}`;
}
export function recordSourceTimestampRange(
  device: object,
  kind: Kind,
  uid: string,
  beginNs: bigint,
  endNs: bigint,
) {
  if (closed.has(device)) return;
  const target = ledger(device);
  const id = key(kind, uid);
  // A lost or overwritten result makes this device's range stream unreliable.
  // Keep rendering and legacy durations, but never manufacture a complete range.
  if (target.ranges.has(id) || target.ranges.size >= MAX_RANGES) {
    target.overflow = true;
    return;
  }
  target.ranges.set(id, { beginNs, endNs });
}
export function sourceTimestampRange(device: object, kind: Kind, uid: string) {
  const target = devices.get(device);
  return target?.overflow ? null : (target?.ranges.get(key(kind, uid)) ?? null);
}
export function sourceTimestampRangeOverflow(device: object) {
  return devices.get(device)?.overflow ?? false;
}
export function pruneSourceTimestampRanges(device: object, needed: ReadonlySet<string>) {
  const target = devices.get(device);
  if (!target) return;
  for (const id of target.ranges.keys()) if (!needed.has(id)) target.ranges.delete(id);
}
export function disposeSourceTimestampRanges(device: object) {
  closed.add(device);
  devices.delete(device);
}
