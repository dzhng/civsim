import { campaignTerrainWorkerHandler } from "./terrainWorker";

const handle = campaignTerrainWorkerHandler((message, transfer) =>
  self.postMessage(message, { transfer }),
);
self.onmessage = (event) => handle(event.data);
