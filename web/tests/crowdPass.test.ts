import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveBattleCrowdFrame } from "../../packages/game-renderer/src/battle/crowdPass.ts";
import { UNIT_INFO } from "../../packages/game-renderer/src/battle/unitInfoLayout.ts";

const SOLDIERS = 2;
const STRIDE = 33;

function makeCrowdFrameGame(running = false) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const ptrs = {
    alive: 0,
    fighting: 8,
    switchCd: 16,
    soldierUnit: 32,
    positions: 64,
    facings: 96,
    unitInfo: 128,
  };

  new Uint8Array(memory.buffer, ptrs.alive, SOLDIERS).fill(1);
  new Uint32Array(memory.buffer, ptrs.soldierUnit, SOLDIERS).fill(0);
  new Float32Array(memory.buffer, ptrs.positions, SOLDIERS * 2).set([0, 0, 1, 0]);
  const unitInfo = new Float32Array(memory.buffer, ptrs.unitInfo, STRIDE);
  unitInfo[UNIT_INFO.total] = SOLDIERS;
  unitInfo[UNIT_INFO.classId] = 0;
  unitInfo[UNIT_INFO.alive] = 1;
  unitInfo[UNIT_INFO.running] = running ? 1 : 0;

  const game = {
    alive_ptr: () => ptrs.alive,
    facings_ptr: () => ptrs.facings,
    fighting_ptr: () => ptrs.fighting,
    positions_ptr: () => ptrs.positions,
    soldier_count: () => SOLDIERS,
    soldier_unit_ptr: () => ptrs.soldierUnit,
    switch_cd_ptr: () => ptrs.switchCd,
    unit_count: () => 1,
    unit_info_ptr: () => ptrs.unitInfo,
    unit_info_stride: () => STRIDE,
  };

  return { game, memory };
}

test("crowd pass keeps each soldier gait frame stable across slowed phase ticks", () => {
  const marching = makeCrowdFrameGame(false);
  const marchBefore = buildLiveBattleCrowdFrame(marching.game, marching.memory, 53).instances;
  const marchAfter = buildLiveBattleCrowdFrame(marching.game, marching.memory, 54).instances;

  assert.deepEqual(
    marchAfter.map((inst) => inst.frame),
    marchBefore.map((inst) => inst.frame),
  );

  const running = makeCrowdFrameGame(true);
  const runBefore = buildLiveBattleCrowdFrame(running.game, running.memory, 35).instances;
  const runAfter = buildLiveBattleCrowdFrame(running.game, running.memory, 36).instances;

  assert.deepEqual(
    runAfter.map((inst) => inst.frame),
    runBefore.map((inst) => inst.frame),
  );
});
