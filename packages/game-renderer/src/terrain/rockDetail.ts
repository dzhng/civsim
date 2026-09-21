import heightUrl from "../../assets/rock-detail-height.png?url";

/** Height data bypasses display colour conversion. The caller owns the bitmap. */
export async function decodeRockDetail(url = heightUrl): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`rock detail map ${url}: ${response.status}`);
  return createImageBitmap(await response.blob(), { colorSpaceConversion: "none" });
}
