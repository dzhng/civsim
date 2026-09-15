self.onmessage = async ({
  data,
}: MessageEvent<{ id: number; blob: Blob; png?: Blob; sink: string }>) => {
  try {
    const blob = await new Response(
      data.blob.stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();
    for (const [kind, body] of [
      ["packet", blob],
      ["image", data.png],
    ] as const) {
      if (!body) continue;
      const response = await fetch(`${data.sink}/${data.id}/${kind}`, { method: "POST", body });
      if (!response.ok) throw Error(`Spool disk write failed: ${await response.text()}`);
    }
    self.postMessage({ id: data.id, bytes: blob.size + (data.png?.size ?? 0) });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
