import { bannerGallery } from '../worlds.mjs';

export const meta = {
  name: 'banner-gallery',
  kind: 'visual',
  world: 'banner-gallery',
  tier: 'quick',
  snapshots: ['banner-gallery'],
  describe: 'Standalone unit-banner component snapshot.',
};

export async function run(ctx) {
  const page = await bannerGallery(ctx);
  await ctx.snap(page, 'banner-gallery');
  await page.close();
}
