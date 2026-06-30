import { buildCrowdInstances, type CrowdInstance, type CrowdBuildStats } from '../../../crowd-runtime/src/instanceData';
import { UNIT_INFO } from './unitInfoLayout';

export interface LiveBattleCrowdGame {
  alive_ptr(): number;
  facings_ptr(): number;
  fighting_ptr(): number;
  positions_ptr(): number;
  soldier_count(): number;
  soldier_unit_ptr(): number;
  switch_cd_ptr(): number;
  unit_count(): number;
  unit_info_ptr(): number;
  unit_info_stride(): number;
}

export interface LiveBattleCrowdFrame {
  instances: CrowdInstance[];
  stats: CrowdBuildStats & {
    units: number;
    fighting: number;
    fallen: number;
    switching: number;
    running: number;
    atEase: number;
  };
}

const FRAME_IDLE = 0;
const FRAME_MARCH_A = 1;
const FRAME_ATTACK = 3;
const FRAME_FALLEN = 4;
const FRAME_SWITCH = 5;
const FRAME_AT_EASE = 6;
const FRAME_RUN_A = 8;

export function buildLiveBattleCrowdFrame(game: LiveBattleCrowdGame, memory: WebAssembly.Memory, simTick: number): LiveBattleCrowdFrame {
  const count = game.soldier_count();
  const units = game.unit_count();
  const stride = game.unit_info_stride();
  const positions = new Float32Array(memory.buffer, game.positions_ptr(), count * 2);
  const facings = new Float32Array(memory.buffer, game.facings_ptr(), count);
  const aliveBytes = new Uint8Array(memory.buffer, game.alive_ptr(), count);
  const fighting = new Uint8Array(memory.buffer, game.fighting_ptr(), count);
  const switchCd = new Float32Array(memory.buffer, game.switch_cd_ptr(), count);
  const soldierUnit = new Uint32Array(memory.buffer, game.soldier_unit_ptr(), count);
  const unitInfo = new Float32Array(memory.buffer, game.unit_info_ptr(), units * stride);
  const unitTeam = new Uint8Array(units);
  const unitClass = new Uint8Array(units);
  const frames = new Float32Array(count);

  const statsExtra = { units, fighting: 0, fallen: 0, switching: 0, running: 0, atEase: 0 };
  for (let u = 0; u < units; u++) {
    const o = u * stride;
    unitTeam[u] = unitInfo[o + UNIT_INFO.team] === 1 ? 1 : 0;
    unitClass[u] = unitInfo[o + UNIT_INFO.classId] ?? 0;
  }

  for (let i = 0; i < count; i++) {
    const unit = soldierUnit[i];
    const alive = aliveBytes[i] > 0 && (unitInfo[unit * stride + UNIT_INFO.alive] ?? 0) > 0;
    if (!alive) {
      frames[i] = FRAME_FALLEN;
      statsExtra.fallen++;
      continue;
    }
    if (switchCd[i] > 0) {
      frames[i] = FRAME_SWITCH;
      statsExtra.switching++;
      continue;
    }
    if (fighting[i] > 0) {
      frames[i] = FRAME_ATTACK;
      statsExtra.fighting++;
      continue;
    }
    const running = unitInfo[unit * stride + UNIT_INFO.running] > 0.5;
    const atEase = unitInfo[unit * stride + UNIT_INFO.atEase] > 0.5;
    if (running) {
      frames[i] = FRAME_RUN_A + ((simTick + i) & 1);
      statsExtra.running++;
    } else if (atEase) {
      frames[i] = FRAME_AT_EASE;
      statsExtra.atEase++;
    } else {
      frames[i] = FRAME_MARCH_A + ((simTick + i) & 1);
      if (frames[i] < FRAME_MARCH_A) frames[i] = FRAME_IDLE;
    }
  }

  const built = buildCrowdInstances({
    positions,
    facings,
    frames,
    alive: aliveBytes,
    soldierUnit,
    unitTeam,
    unitClass,
    simTick,
    count,
  });
  return { instances: built.instances, stats: { ...built.stats, ...statsExtra } };
}
