import { test } from "node:test";
import assert from "node:assert/strict";
import { appearanceDeadline, AppearanceTimeoutError } from "./safety.mjs";

test("a stalled appearance aborts its operation and closes the authoring session", async () => {
  let aborted = false,
    closed = 0;
  await assert.rejects(
    appearanceDeadline(
      "appearance 7",
      10,
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(signal.reason);
          });
        }),
      () => {
        closed++;
      },
    ),
    AppearanceTimeoutError,
  );
  assert.equal(aborted, true);
  assert.equal(closed, 1);
});

import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outputBudget } from "./safety.mjs";
test("quota refusal preserves the previous catalog and leaves no partial write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-budget-"));
  try {
    const catalog = join(dir, "catalog.json");
    await writeFile(catalog, "previous");
    const budget = outputBudget(100, 20);
    await assert.rejects(budget.write(catalog, Buffer.alloc(81)), /quota/);
    assert.equal(await readFile(catalog, "utf8"), "previous");
    assert.deepEqual(await readdir(dir), ["catalog.json"]);
    assert.equal(budget.writtenBytes, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed atomic publication removes only its own temporary file", async () => {
  const { mkdir } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "atlas-cleanup-"));
  try {
    await writeFile(join(dir, "prior.atlas"), "retained");
    await mkdir(join(dir, "catalog.json"));
    const budget = outputBudget(100, 20);
    await assert.rejects(budget.write(join(dir, "catalog.json"), "new catalog"));
    assert.deepEqual((await readdir(dir)).sort(), ["catalog.json", "prior.atlas"]);
    assert.equal(await readFile(join(dir, "prior.atlas"), "utf8"), "retained");
    assert.equal(budget.writtenBytes, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a timed-out appearance cannot publish after its delayed operation resumes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-late-"));
  try {
    const catalog = join(dir, "catalog.json");
    await writeFile(catalog, "previous");
    const budget = outputBudget(100, 20);
    let release, operation;
    await assert.rejects(
      appearanceDeadline(
        "late appearance",
        10,
        (signal) =>
          (operation = (async () => {
            await new Promise((resolve) => (release = resolve));
            await budget.write(catalog, "late", { signal });
          })()),
        () => {},
      ),
      AppearanceTimeoutError,
    );
    release();
    await assert.rejects(operation, AppearanceTimeoutError);
    assert.equal(await readFile(catalog, "utf8"), "previous");
    assert.deepEqual(await readdir(dir), ["catalog.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
