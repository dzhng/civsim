import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
process.chdir(fileURLToPath(new URL(".", import.meta.url)));
const results = {};
for (const backend of ["typegpu", "vgpu"]) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2023",
      "--module",
      "ESNext",
      "--moduleResolution",
      "bundler",
      "--types",
      "@webgpu/types",
      `checks/${backend}-invalid.ts`,
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  results[backend] = { exitCode: result.status, diagnostics: result.stdout + result.stderr };
}
assert.equal(results.typegpu.exitCode, 2);
assert.match(results.typegpu.diagnostics, /camTypo/);
assert.equal(results.vgpu.exitCode, 0);
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/type-safety.json", JSON.stringify(results, null, 2) + "\n");
console.log(
  "Binding-name typo: TypeGPU rejects at compile time; vgpu accepts at compile time (runtime validation tested in browser).",
);
