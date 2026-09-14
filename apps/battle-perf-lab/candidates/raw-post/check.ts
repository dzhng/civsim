import { RawBattlePost } from "../../src/raw/post";
import { createTypegpuPost } from "../typegpu/post";
import { runPostControl } from "./control";

const backend = new URLSearchParams(location.search).get("backend") ?? "raw";
if (backend !== "raw" && backend !== "typegpu") throw new Error(`Unknown post backend: ${backend}`);
await runPostControl(
  backend === "raw" ? async (...args) => new RawBattlePost(...args) : createTypegpuPost,
  backend,
);
