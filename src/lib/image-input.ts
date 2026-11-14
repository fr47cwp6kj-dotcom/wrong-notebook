/** 兼容系统只提供文件扩展名的情况。 */
const IMAGE_EXTENSIONS = [".jpeg", ".jpg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp", ".avif"];
export const IMAGE_FILE_ACCEPT = ["image/*", ...IMAGE_EXTENSIONS].join(",");
export const IMAGE_DROP_ACCEPT = { "image/*": IMAGE_EXTENSIONS };

export function isImageFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return file.type.startsWith("image/") || IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function isHeicImage(file: File): boolean {
    return /^image\/hei[cf](?:-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** 在裁剪、预览或发送给 AI 前解码 HEIC；转换仅在浏览器本地进行。 */
export async function prepareImageFile(file: File): Promise<File> {
    if (!isHeicImage(file)) return file;

    // 按需加载，普通 JPG/PNG 上传不需要下载 HEIC 解码器。
    const { heicTo } = await import("heic-to/csp");
    const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
    if (!jpeg.size) throw new Error("HEIC_CONVERSION_FAILED");

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([jpeg], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}
