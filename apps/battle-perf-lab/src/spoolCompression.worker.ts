self.onmessage = async ({
  data,
}: MessageEvent<{
  id: number;
  blob: Blob;
  png?: Blob;
  draws?: unknown;
  resources?: { id: string; blob: Blob }[];
  sink: string;
}>) => {
  try {
    let resourceBytes = 0;
    while (data.resources?.length) {
      const resource = data.resources.shift()!;
      const compressed = await new Response(
        resource.blob.stream().pipeThrough(new CompressionStream("gzip")),
      ).blob();
      const response = await fetch(`${data.sink}/resource/${resource.id}`, {
        method: "POST",
        body: compressed,
      });
      if (!response.ok) throw Error(`Resource write failed: ${await response.text()}`);
      resourceBytes += compressed.size;
      self.postMessage({ id: data.id, progress: resource.id });
    }
    const blob = await new Response(
      data.blob.stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();
    for (const [kind, body] of [
      ["packet", blob],
      ["image", data.png],
      ["draws", data.draws ? new Blob([JSON.stringify(data.draws)]) : undefined],
    ] as const) {
      if (!body) continue;
      const response = await fetch(`${data.sink}/${data.id}/${kind}`, { method: "POST", body });
      if (!response.ok) throw Error(`Spool disk write failed: ${await response.text()}`);
    }
    self.postMessage({ id: data.id, bytes: resourceBytes + blob.size + (data.png?.size ?? 0) });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
