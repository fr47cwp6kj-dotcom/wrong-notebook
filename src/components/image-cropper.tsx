"use client";

import { useEffect, useState, useRef } from "react";
import type { CSSProperties } from "react";
import ReactCrop from "react-image-crop";
import type { Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RegionSelector } from "@/components/region-selector";
import { ZoomControls } from "@/components/zoom-controls";
import { useLanguage } from "@/contexts/LanguageContext";
import { cropImageRegions, mergeImageRegions } from "@/lib/image-crop";
import type { ImageRegion } from "@/lib/image-crop";
import { frontendLogger } from "@/lib/frontend-logger";
import { useImageZoom } from "@/lib/use-image-zoom";
import { toast } from "@/lib/feedback";

// 未缩放时图片适应弹窗的尺寸
const FIT_STYLE: Record<"single" | "multi" | "merge", CSSProperties> = {
    single: { maxHeight: "70vh", maxWidth: "100%", objectFit: "contain" },
    multi: { maxHeight: "65vh", maxWidth: "100%", objectFit: "contain" },
    merge: { maxHeight: "65vh", maxWidth: "100%", objectFit: "contain" },
};

type CropMode = "single" | "multi" | "merge";

interface ImageCropperProps {
    imageSrc: string;
    open: boolean;
    onClose: () => void;
    onCropComplete: (croppedImageBlob: Blob) => void;
    /** 提供时显示「多题框选」模式，返回每个框裁剪出的图片 */
    onMultiCropComplete?: (croppedImageBlobs: Blob[]) => void;
}

export function ImageCropper({ imageSrc, open, onClose, onCropComplete, onMultiCropComplete }: ImageCropperProps) {
    const { t } = useLanguage();
    // 始终保存百分比坐标，缩放改变图片显示尺寸后仍然准确
    const [crop, setCrop] = useState<Crop>();
    const imgRef = useRef<HTMLImageElement>(null);
    const [mode, setModeState] = useState<CropMode>("single");
    const [rotationState, setRotationState] = useState<{ src: string; data: string; angle: number }>({ src: imageSrc, data: imageSrc, angle: 0 });
    const activeImageSrc = rotationState.src === imageSrc ? rotationState.data : imageSrc;
    const rotation = rotationState.src === imageSrc ? rotationState.angle : 0;
    const { containerRef, zoom, imageStyle, measureImage, zoomIn, zoomOut, reset: resetZoom } = useImageZoom(FIT_STYLE[mode]);
    // 换图后回到 100%
    useEffect(() => {
        resetZoom();
    }, [imageSrc, resetZoom]);
    const setMode = (next: CropMode) => {
        resetZoom();
        setModeState(next);
    };
    // 框选结果与图片绑定，换图后自动清空
    const [regionState, setRegionState] = useState<{ src: string; regions: ImageRegion[] }>({ src: activeImageSrc, regions: [] });
    const regions = regionState.src === activeImageSrc ? regionState.regions : [];
    const setRegions = (next: ImageRegion[]) => setRegionState({ src: activeImageSrc, regions: next });
    const multiImgRef = useRef<HTMLImageElement>(null);

    const handleMultiConfirm = async () => {
        if (!multiImgRef.current || regions.length === 0 || !onMultiCropComplete) return;
        try {
            onMultiCropComplete(await cropImageRegions(multiImgRef.current, regions));
            setRegions([]);
        } catch (e) {
            frontendLogger.error('[ImageCropper]', 'Multi-image crop failed', { error: e });
        }
    };

    /** 一题拼图：多个框按版面顺序拼接为一张完整题图，走单题识别流程 */
    const handleMergeConfirm = async () => {
        if (!multiImgRef.current || regions.length === 0) return;
        try {
            const merged = await mergeImageRegions(multiImgRef.current, regions);
            setRegions([]);
            onCropComplete(merged);
        } catch (e) {
            frontendLogger.error('[ImageCropper]', 'Merge regions failed', { error: e });
            toast.error(t.upload.imagePrepareFailed);
        }
    };

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        // 默认框选整张图片，不拖动直接确认即为整图
        setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
        measureImage(e.currentTarget);
    }

    const handleImageError = () => {
        toast.error(t.upload.imagePrepareFailed);
        onClose();
    };

    const rotateImage = () => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            const quarterTurns = ((rotation / 90) + 1) % 4;
            const swapsSides = quarterTurns % 2 === 1;
            canvas.width = swapsSides ? image.naturalHeight : image.naturalWidth;
            canvas.height = swapsSides ? image.naturalWidth : image.naturalHeight;
            const context = canvas.getContext("2d");
            if (!context) return;
            context.translate(canvas.width / 2, canvas.height / 2);
            context.rotate((quarterTurns * Math.PI) / 2);
            context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
            setRotationState({ src: imageSrc, data: canvas.toDataURL("image/jpeg", 0.95), angle: quarterTurns * 90 });
            setCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
            setRegions([]);
        };
        image.src = activeImageSrc;
    };

    const handleConfirm = async () => {
        if (!imgRef.current?.naturalWidth) return;
        // 没有有效选框（如只点了一下）时使用整张图片
        const region: ImageRegion = crop && crop.width > 0 && crop.height > 0
            ? { x: crop.x / 100, y: crop.y / 100, width: crop.width / 100, height: crop.height / 100 }
            : { x: 0, y: 0, width: 1, height: 1 };
        try {
            const [croppedBlob] = await cropImageRegions(imgRef.current, [region]);
            onCropComplete(croppedBlob);
        } catch (e) {
            frontendLogger.error('[ImageCropper]', 'Crop failed', { error: e });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b shrink-0">
                    <DialogTitle>{t.common.cropper?.title || "Crop Image"}</DialogTitle>
                </DialogHeader>

                <div className="relative min-h-0 flex-1 bg-black">
                    {/* m-auto 居中：图片放大超出容器后仍能滚动到左上角 */}
                    <div ref={containerRef} className="flex h-full w-full overflow-auto p-4">
                        <div className="m-auto">
                            {mode !== "single" ? (
                                <RegionSelector
                                    ref={multiImgRef}
                                    imageSrc={activeImageSrc}
                                    regions={regions}
                                    onChange={setRegions}
                                    imageStyle={imageStyle}
                                    onImageLoad={(e) => measureImage(e.currentTarget)}
                                    onImageError={handleImageError}
                                />
                            ) : (
                                <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)}>
                                    <img
                                        ref={imgRef}
                                        alt="Crop me"
                                        src={activeImageSrc}
                                        onLoad={onImageLoad}
                                        onError={handleImageError}
                                        style={imageStyle}
                                    />
                                </ReactCrop>
                            )}
                        </div>
                    </div>
                    <div className="absolute right-3 top-3 flex items-center gap-2">
                        <Button type="button" variant="secondary" size="icon" onClick={rotateImage} aria-label="旋转图片" title="旋转图片">
                            <RotateCw className="h-4 w-4" />
                        </Button>
                        <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
                    </div>
                </div>

                <div className="p-4 border-t bg-background shrink-0 space-y-3">
                    {onMultiCropComplete && (
                        <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1 sm:w-96">
                            {(["single", "multi", "merge"] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMode(value)}
                                    className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${mode === value ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                                >
                                    {value === "single" ? t.batchImport.singleMode : value === "multi" ? t.batchImport.multiMode : t.batchImport.mergeMode}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                        <p className="text-sm text-muted-foreground">
                            {mode === "multi" || mode === "merge"
                                ? `${mode === "multi" ? t.batchImport.hint : t.batchImport.mergeHint} ${t.batchImport.regionCount.replace("{count}", String(regions.length))}`
                                : (t.common.cropper?.hint || "💡 Drag to adjust crop area")}
                        </p>
                        <div className="flex gap-2 justify-end">
                            {mode !== "single" && regions.length > 0 && (
                                <Button variant="ghost" onClick={() => setRegions([])}>
                                    {t.batchImport.clear}
                                </Button>
                            )}
                            <Button variant="outline" onClick={onClose}>
                                {t.common.cancel || "Cancel"}
                            </Button>
                            {mode === "multi" ? (
                                <Button onClick={handleMultiConfirm} disabled={regions.length === 0}>
                                    {t.batchImport.start.replace("{count}", String(regions.length))}
                                </Button>
                            ) : mode === "merge" ? (
                                <Button onClick={handleMergeConfirm} disabled={regions.length === 0}>
                                    {t.batchImport.mergeStart}
                                </Button>
                            ) : (
                                <Button onClick={handleConfirm}>
                                    {t.common.confirm || "Confirm"}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
