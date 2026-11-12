export async function compressImage(
  file: Blob,
  maxDimension = 1600,
  quality = 0.85
): Promise<Blob> {
  if (
    typeof document === "undefined" ||
    !("createElement" in document) ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return file;
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      el.src = url;
    });

    let { width, height } = img;
    if (width <= maxDimension && height <= maxDimension && file.size < 1.5 * 1024 * 1024) {
      return file;
    }

    if (width > height && width > maxDimension) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else if (height > maxDimension) {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, width, height);

    const compressed = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    return compressed || file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
