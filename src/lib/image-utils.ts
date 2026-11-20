import { frontendLogger } from "@/lib/frontend-logger";
import { prepareImageFile } from "@/lib/image-input";

/**
 * 压缩图片文件
 * @param file 原始图片文件
 * @param maxSizeMB 最大文件大小（MB），默认 1MB
 * @param maxWidth 最大宽度，默认 1920px
 * @param quality 压缩质量 0-1，默认 0.8
 * @returns 压缩后的 Base64 字符串
 */
export async function compressImage(
    file: File,
    maxSizeMB: number = 1,
    maxWidth: number = 1920,
    quality: number = 0.8
): Promise<string> {
    file = await prepareImageFile(file);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('无法获取 Canvas 上下文'));
                    return;
                }

                // 计算新的尺寸（保持宽高比）
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                // 绘制图片
                ctx.drawImage(img, 0, 0, width, height);

                // 转换为 Base64，逐步降低质量直到满足大小要求
                let currentQuality = quality;
                let compressed = canvas.toDataURL('image/jpeg', currentQuality);

                // 检查大小（Base64 字符串长度约等于文件大小的 4/3）
                const sizeInMB = (compressed.length * 3) / 4 / 1024 / 1024;

                // 如果还是太大，继续降低质量
                while (sizeInMB > maxSizeMB && currentQuality > 0.1) {
                    currentQuality -= 0.1;
                    compressed = canvas.toDataURL('image/jpeg', currentQuality);
                    const newSize = (compressed.length * 3) / 4 / 1024 / 1024;

                    frontendLogger.info('[ImageCompress]', 'Compression step', { quality: Number(currentQuality.toFixed(1)), sizeMB: Number(newSize.toFixed(2)) }, { sendToBackend: false });

                    if (newSize <= maxSizeMB) break;
                }

                frontendLogger.info('[ImageCompress]', 'Compression finished', { originalMB: Number((file.size / 1024 / 1024).toFixed(2)), compressedMB: Number(((compressed.length * 3) / 4 / 1024 / 1024).toFixed(2)) });

                resolve(compressed);
            };

            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = e.target?.result as string;
        };

        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

/** 识别环节的最小图片宽度：低于此值视觉模型容易误读小图（多题框选的裁剪图常见） */
const MIN_ANALYZE_WIDTH = 1200;
/** 放大倍数上限，避免把极小图放大到失真 */
const MAX_UPSCALE_FACTOR = 4;

function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = src;
    });
}

/**
 * 放大过小的图片：宽度低于 MIN_ANALYZE_WIDTH 时按倍率放大后再送 AI，降低视觉模型误读率
 * @returns 放大后的 Base64；图片足够大、canvas 不可用或解码失败时返回 null（调用方回退原图）
 */
async function upscaleSmallImage(file: File): Promise<string | null> {
    // canvas 不可用（如测试环境）时直接跳过
    const probe = document.createElement('canvas');
    if (!probe.getContext('2d')) return null;

    try {
        const dataUrl = await readFileAsDataURL(file);
        const img = await loadImageElement(dataUrl);
        if (img.naturalWidth <= 0 || img.naturalWidth >= MIN_ANALYZE_WIDTH) return null;

        const factor = Math.min(MIN_ANALYZE_WIDTH / img.naturalWidth, MAX_UPSCALE_FACTOR);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * factor);
        canvas.height = Math.round(img.naturalHeight * factor);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // 白底避免透明 PNG 转 JPEG 时变黑
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const upscaled = canvas.toDataURL('image/jpeg', 0.92);
        frontendLogger.info('[ImageCompress]', 'Small image upscaled for AI', {
            original: `${img.naturalWidth}x${img.naturalHeight}`,
            upscaled: `${canvas.width}x${canvas.height}`,
        }, { sendToBackend: false });
        return upscaled;
    } catch {
        // 放大失败时回退原图，不阻断识别流程
        return null;
    }
}

/**
 * 检查并压缩图片（如果需要）；过小的图片先放大再送 AI
 * @param file 图片文件
 * @returns Base64 字符串
 */
export async function processImageFile(file: File): Promise<string> {
    file = await prepareImageFile(file);
    const fileSizeMB = file.size / 1024 / 1024;
    const threshold = 1; // 1MB 阈值

    frontendLogger.info('[ImageCompress]', 'File size checked', { sizeMB: Number(fileSizeMB.toFixed(2)) }, { sendToBackend: false });

    if (fileSizeMB > threshold) {
        frontendLogger.info('[ImageCompress]', 'File exceeds threshold, compressing', undefined, { sendToBackend: false });
        return await compressImage(file, threshold);
    }

    frontendLogger.info('[ImageCompress]', 'File size OK, no compression needed', undefined, { sendToBackend: false });
    // 小图先放大，避免视觉模型误读
    const upscaled = await upscaleSmallImage(file);
    if (upscaled) return upscaled;

    // 直接返回 Base64
    return readFileAsDataURL(file);
}
