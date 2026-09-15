import { factories } from "./factories";
import { runPostControl } from "./control";
const backend = new URLSearchParams(location.search).get("backend") ?? "raw";
const factory = factories[backend];
if (!factory) throw new Error(`Unknown post backend: ${backend}`);
await runPostControl(factory, backend);
