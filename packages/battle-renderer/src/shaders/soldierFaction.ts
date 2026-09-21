import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";

const color = (team: number) => `vec3f(${factionForTeam(team).primary.join(",")})`;
export const linearAlbedoWgsl = `(c:vec3f)->vec3f {
      return select(pow(c*0.9478672986+0.0521327014,vec3f(2.4)),c*0.0773993808,c<=vec3f(0.04045));
    }
`;
export const factionAccentWgsl = `(faction:f32)->vec3f {
      let team=mix(mix(linearAlbedo(${color(0)}),linearAlbedo(${color(1)}),step(0.5,faction)),linearAlbedo(${color(2)}),step(1.5,faction));
      return mix(team,linearAlbedo(vec3f(0.42,0.34,0.26)),0.35);
    }
`;

export const soldierFactionWGSL = `fn linearAlbedo${linearAlbedoWgsl}\nfn factionAccent${factionAccentWgsl}`;
