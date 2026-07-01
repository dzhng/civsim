export function nearestIndependentCityFromRoma(map) {
  const neutralIds = new Set(
    map.factions.filter((faction) => !faction.playable).map((faction) => faction.id),
  );
  const roma = map.nodes.findIndex((node) => node.name === "Roma");
  const rpos = map.nodes[roma]?.pos ?? [0, 0];
  let index = -1;
  let distanceKm = Number.POSITIVE_INFINITY;
  for (let i = 0; i < map.nodes.length; i++) {
    const node = map.nodes[i];
    if (node.kind !== "city" || !neutralIds.has(node.owner)) continue;
    const distance = Math.hypot(node.pos[0] - rpos[0], node.pos[1] - rpos[1]);
    if (distance < distanceKm) {
      index = i;
      distanceKm = distance;
    }
  }
  return { index, distanceKm, name: map.nodes[index]?.name ?? "none" };
}

export function approachTilesForCity(map, cityIndex) {
  const cityId = map.nodes[cityIndex]?.id;
  const edgeIndex = map.edges.findIndex(
    (edge) =>
      edge.kind !== "sea" && (edge.a === cityId || edge.b === cityId) && edge.tiles.length >= 4,
  );
  if (edgeIndex < 0) return { edgeIndex, mainTile: 0, detachmentTile: 0 };
  const edge = map.edges[edgeIndex];
  const targetAtLowTile = edge.a === cityId;
  return {
    edgeIndex,
    mainTile: targetAtLowTile ? 1 : edge.tiles.length - 2,
    detachmentTile: targetAtLowTile ? 3 : edge.tiles.length - 4,
  };
}
