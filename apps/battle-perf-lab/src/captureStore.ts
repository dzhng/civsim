export interface ReplayManifest {
  source: "production-presented";
  grassDraws: Awaited<ReturnType<typeof import("./threeInspection").readGrassDraws>>;
  sourceUrl: string;
  benchmark: import("../../../web/src/battle/benchmark/benchmarkRun").BenchmarkStatus | null;
  boundaryBenchmark: ReplayManifest["benchmark"];
  provisional: true;
  capturedAt: string;
  stopped: "frame-limit" | "byte-limit" | "cancelled" | "running-boundary";
  timing: "capture-overhead-not-a-performance-run";
  framebuffer: { width: number; height: number };
  referenceImageHash: string | null;
  referenceFrameId: number | null;
  frameCount: number;
  frameBytes: number;
  assetsHash: string;
  groundHash: string;
  groundBytes: number;
  settingsHash: string;
  loadedAppearanceHash: string;
  assetsBytes: number;
  settingsBytes: number;
  loadedAppearanceEncodedBytes: number;
  largestAppearanceBytes: number;
  frameHashes: string[];
  poseHashes: string[];
  windowBytes: number;
  poseBytes: number;
}

export interface ReplayArchive {
  manifest: ReplayManifest;
  assets: Blob;
  settings: Blob;
  frames: Blob[];
  poses: Blob[];
  referenceImage?: Blob;
}

async function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("battle-perf-lab-capture", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("capture");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveReplayArchive(archive: ReplayArchive): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("capture", "readwrite");
      transaction.objectStore("capture").put(archive, "latest");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadReplayArchive(): Promise<ReplayArchive | null> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("capture", "readonly");
      const request = transaction.objectStore("capture").get("latest");
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function replayArchiveDownload(archive: ReplayArchive): Blob {
  const parts: BlobPart[] = [
    '{"manifest":',
    JSON.stringify(archive.manifest),
    ',"assets":',
    archive.assets,
    ',"settings":',
    archive.settings,
    ',"frames":[',
  ];
  archive.frames.forEach((frame, index) => {
    if (index) parts.push(",");
    parts.push(frame);
  });
  parts.push('],"poses":[');
  archive.poses.forEach((pose, index) => {
    if (index) parts.push(",");
    parts.push(pose);
  });
  parts.push("]}");
  return new Blob(parts, { type: "application/json" });
}
