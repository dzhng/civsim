export const UNIT_INFO = {
  x: 0,
  y: 1,
  targetX: 10,
  targetY: 11,
  hasTarget: 12,
};

export async function unitScreen(page, unit) {
  return page.evaluate(({ unit, unitInfo }) => {
    const info = window.__game.unitInfo(unit);
    const [x, y] = window.__cam.worldToScreen(info[unitInfo.x], info[unitInfo.y]);
    const rect = document.getElementById('battlefield').getBoundingClientRect();
    return { unit, x: rect.left + x, y: rect.top + y };
  }, { unit, unitInfo: UNIT_INFO });
}

export async function worldPointNearUnit(page, unit, dx, dy) {
  return page.evaluate(({ unit, unitInfo, dx, dy }) => {
    const info = window.__game.unitInfo(unit);
    const worldX = info[unitInfo.x] + dx;
    const worldY = info[unitInfo.y] + dy;
    const [x, y] = window.__cam.worldToScreen(worldX, worldY);
    const rect = document.getElementById('battlefield').getBoundingClientRect();
    return { unit, worldX, worldY, x: rect.left + x, y: rect.top + y };
  }, { unit, unitInfo: UNIT_INFO, dx, dy });
}
