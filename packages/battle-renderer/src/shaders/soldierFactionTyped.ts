import { tgpu, d, std } from "typegpu";
import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";

/** Typed TypeGPU twin of the `soldierFaction` WGSL bodies: same sRGB transfer, same
 * canonical palette owner, expressed as TypeScript shader functions instead of string
 * concatenation. The raw bodies remain the reference for non-TypeGPU consumers and for
 * the numerical oracle that pins these two implementations to identical output. */

const teamPrimary = (team: number) => d.vec3f(...factionForTeam(team).primary);
const TEAM_0 = teamPrimary(0);
const TEAM_1 = teamPrimary(1);
const TEAM_NEUTRAL = teamPrimary(2);
const ACCENT_CLOTH = d.vec3f(0.42, 0.34, 0.26);
const ACCENT_CLOTH_SHARE = 0.35;

export const linearAlbedo = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((c) => {
  "use gpu";
  return std.select(
    std.pow(std.add(std.mul(c, 0.9478672986), 0.0521327014), d.vec3f(2.4)),
    std.mul(c, 0.0773993808),
    std.le(c, d.vec3f(0.04045)),
  );
});

export const factionAccent = tgpu.fn(
  [d.f32],
  d.vec3f,
)((faction) => {
  "use gpu";
  const team = std.mix(
    std.mix(linearAlbedo(TEAM_0), linearAlbedo(TEAM_1), std.step(0.5, faction)),
    linearAlbedo(TEAM_NEUTRAL),
    std.step(1.5, faction),
  );
  return std.mix(team, linearAlbedo(ACCENT_CLOTH), ACCENT_CLOTH_SHARE);
});
