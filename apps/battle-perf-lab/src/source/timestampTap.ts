import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const THREE_WEBGPU_SHA256 =
  "50e4013dd3903e8afb09a4829962dbf105488de7bd47f61308f44bd2e66b3340";
const CLASS_START = "class WebGPUTimestampQueryPool extends TimestampQueryPool {";
const READ = "\t\t\t\tconst duration = Number( endTime - startTime ) / 1e6;";
export function instrumentThreeTimestampReadback(code: string, ledgerImport: string) {
  if (createHash("sha256").update(code).digest("hex") !== THREE_WEBGPU_SHA256)
    throw Error("Pinned Three WebGPU timestamp tap source digest mismatch");
  const at = code.indexOf(CLASS_START);
  if (at < 0 || code.indexOf(CLASS_START, at + 1) !== -1)
    throw Error("Pinned Three WebGPU timestamp pool class mismatch");
  const point = code.indexOf(READ, at);
  const end = code.indexOf("\nclass ", at + CLASS_START.length);
  if (point < at || (end !== -1 && point >= end) || code.indexOf(READ, point + READ.length) !== -1)
    throw Error("Pinned Three WebGPU timestamp readback structure mismatch");
  const tap =
    "\n\t\t\t\trecordSourceTimestampRange( this.device, this.type, uid, startTime, endTime );";
  return (
    `import { enableSourceTimestampRanges, recordSourceTimestampRange } from ${JSON.stringify(ledgerImport)};\nenableSourceTimestampRanges();\n` +
    code.slice(0, point + READ.length) +
    tap +
    code.slice(point + READ.length)
  );
}
export function sourceTimestampTapPlugin() {
  const ledger = fileURLToPath(
    new URL(
      "../../../../packages/photoreal-renderer/src/sourceTimestampRanges.ts",
      import.meta.url,
    ),
  );
  return {
    name: "pinned-three-timestamp-range-tap",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.split("?")[0].replaceAll("\\", "/").endsWith("/three/build/three.webgpu.js"))
        return null;
      return { code: instrumentThreeTimestampReadback(code, ledger), map: null };
    },
  };
}
