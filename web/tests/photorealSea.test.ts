import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSeaDisplacementSource,
  seaDisplacementSourceFromParam,
} from '../../packages/photoreal-renderer/src/battle/seaLayer.ts';

test('photoreal sea: route params select the displacement source', () => {
  assert.equal(seaDisplacementSourceFromParam(null), 'gerstner-tsl');
  assert.equal(seaDisplacementSourceFromParam('gerstner'), 'gerstner-tsl');
  assert.equal(seaDisplacementSourceFromParam('gerstner-tsl'), 'gerstner-tsl');
  assert.equal(seaDisplacementSourceFromParam('ifft'), 'ifft-tsl');
  assert.equal(seaDisplacementSourceFromParam('ifft-tsl'), 'ifft-tsl');
});

test('photoreal sea: Gerstner is the default active source', () => {
  const stats = createSeaDisplacementSource().stats();
  assert.deepEqual(stats, {
    requested: 'gerstner-tsl',
    source: 'gerstner-tsl',
    tier: 'gerstner-tsl',
    fallback: false,
    resolution: 1,
    cascades: 1,
    storageBytes: 0,
  });
});

test('photoreal sea: IFFT publishes its spike identity on hardware-like adapters', () => {
  const stats = createSeaDisplacementSource('ifft-tsl', 'apple / metal-3').stats();
  assert.equal(stats.requested, 'ifft-tsl');
  assert.equal(stats.source, 'ifft-tsl');
  assert.equal(stats.tier, 'ifft-tsl-spectral-spike');
  assert.equal(stats.fallback, false);
  assert.equal(stats.resolution, 256);
  assert.equal(stats.cascades, 3);
  assert.ok(stats.storageBytes > 0);
});

test('photoreal sea: requested IFFT falls back to Gerstner on SwiftShader', () => {
  const stats = createSeaDisplacementSource('ifft-tsl', 'google / swiftshader').stats();
  assert.equal(stats.requested, 'ifft-tsl');
  assert.equal(stats.source, 'gerstner-tsl');
  assert.equal(stats.tier, 'gerstner-tsl-swiftshader-fallback');
  assert.equal(stats.fallback, true);
  assert.equal(stats.storageBytes, 0);
});
