import { loadAppearanceBundle } from "../../src/appearanceBundle";
import {
  loadImpostorAtlas,
  packImpostorAtlas,
  impostorAtlasContentHash,
} from "../../src/impostorAtlas";
Object.assign(window, {
  __atlasRuntime: async (artifactUrl: string, appearanceUrl: string) => {
    const bundle = await loadAppearanceBundle(appearanceUrl);
    const atlas = await loadImpostorAtlas(artifactUrl, bundle);
    const bytes = packImpostorAtlas(atlas);
    return {
      contentHash: await impostorAtlasContentHash(atlas, bytes),
      decodedBytes: bytes.length,
      center: atlas.center,
      worldSpan: atlas.worldSpan,
    };
  },
});
