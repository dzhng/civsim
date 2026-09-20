import { runShadowOverlapCheck } from "./shadow-check";
import { isShadowCheckMutation } from "./shadowOverlapFixture";

// Opt-in mutations are requested by the page URL so the default entry cannot
// accidentally run one; an unknown request fails rather than silently baselining.
const requested = new URLSearchParams(location.search).get("mutation") ?? "none";
if (!isShadowCheckMutation(requested)) throw Error(`Unknown shadow check mutation: ${requested}`);
const report = await runShadowOverlapCheck(requested);
document.querySelector("#result")!.textContent = JSON.stringify(report, null, 2);
Object.assign(window, { __typegpuShadowOverlap: report });
