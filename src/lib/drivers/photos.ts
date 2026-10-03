/**
 * Phone photos are often 5–10 MB. Shrink them before they go in the outbox so
 * they upload quickly on a weak signal and don't fill the phone. If the
 * browser can't decode the image (e.g. some HEIC files), keep the original.
 */
const MAX_EDGE = 1600;

export async function compressPhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
