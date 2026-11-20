/** 以图片宽高为 1 的相对坐标表示的矩形区域 */
export interface ImageRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 规范化拖拽得到的两个角点为矩形，并限制在图片范围内 */
export function regionFromPoints(ax: number, ay: number, bx: number, by: number): ImageRegion {
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const x1 = clamp(Math.min(ax, bx));
    const y1 = clamp(Math.min(ay, by));
    const x2 = clamp(Math.max(ax, bx));
    const y2 = clamp(Math.max(ay, by));
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** 按原图分辨率裁剪出各区域，返回 JPEG 图片 */
export async function cropImageRegions(image: HTMLImageElement, regions: ImageRegion[]): Promise<Blob[]> {
    const { naturalWidth, naturalHeight } = image;
    return Promise.all(regions.map((region) => new Promise<Blob>((resolve, reject) => {
        const canvas = document.createElement("canvas");
        const sx = Math.round(region.x * naturalWidth);
        const sy = Math.round(region.y * naturalHeight);
        canvas.width = Math.max(1, Math.round(region.width * naturalWidth));
        canvas.height = Math.max(1, Math.round(region.height * naturalHeight));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            reject(new Error("Canvas is not supported"));
            return;
        }
        ctx.drawImage(image, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty"))), "image/jpeg", 0.95);
    })));
}

/** 判断两个区域的中心是否处于同一行（相对高度差的阈值） */
const SAME_ROW_TOLERANCE = 0.02;

/**
 * 按版面顺序排列区域：先按纵向位置（y 中心），同一行的按横向位置（x 中心）。
 * 用于把题干与异地配图的多个框按试卷上的阅读顺序拼接。
 */
export function sortRegionsForMerge(regions: ImageRegion[]): ImageRegion[] {
    return [...regions].sort((a, b) => {
        const ay = a.y + a.height / 2;
        const by = b.y + b.height / 2;
        if (Math.abs(ay - by) > SAME_ROW_TOLERANCE) return ay - by;
        return (a.x + a.width / 2) - (b.x + b.width / 2);
    });
}

/** 拼接时各区域之间留出的白色间隔（像素） */
export const MERGE_REGION_GAP_PX = 12;

function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            // 解码完成后即可释放 blob URL
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load cropped region"));
        };
        img.src = url;
    });
}

/**
 * 把多个区域裁剪后按版面顺序纵向拼接为一张完整题图：
 * 题干与几何图/函数图分离时，多个框拼成一道题，宽度对齐最大区域并等比缩放。
 */
export async function mergeImageRegions(image: HTMLImageElement, regions: ImageRegion[]): Promise<Blob> {
    const sorted = sortRegionsForMerge(regions);
    if (sorted.length === 0) throw new Error("No regions to merge");
    const parts = await cropImageRegions(image, sorted);
    const images = await Promise.all(parts.map(loadBlobImage));

    const targetWidth = Math.max(1, ...images.map((img) => img.naturalWidth));
    const scaledHeights = images.map((img) => Math.max(1, Math.round(img.naturalHeight * (targetWidth / img.naturalWidth))));
    const totalHeight = scaledHeights.reduce((sum, height) => sum + height, 0) + MERGE_REGION_GAP_PX * (images.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported");
    // 白底，避免透明区域拼接后发黑
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let offsetY = 0;
    images.forEach((img, index) => {
        ctx.drawImage(img, 0, offsetY, targetWidth, scaledHeights[index]);
        offsetY += scaledHeights[index] + MERGE_REGION_GAP_PX;
    });

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty"))), "image/jpeg", 0.95);
    });
}
