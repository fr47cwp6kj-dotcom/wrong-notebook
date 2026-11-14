"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageCropper } from "@/components/image-cropper";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { processImageFile } from "@/lib/image-utils";
import { IMAGE_FILE_ACCEPT, isImageFile, prepareImageFile } from "@/lib/image-input";
import { toast, confirmDialog } from "@/lib/feedback";

interface ReplaceQuestionImageButtonProps {
    errorItemId: string;
    /** 题目已有原图时替换前二次确认 */
    hasImage: boolean;
    onDone: (originalImageUrl: string) => void;
}

/**
 * 替换原题图片：与导入题目一样，先选择图片并截取题目所在区域，再保存截取结果（超过 1MB 时压缩）
 */
export function ReplaceQuestionImageButton({ errorItemId, hasImage, onDone }: ReplaceQuestionImageButtonProps) {
    const { t } = useLanguage();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const imageSelection = useRef(0);
    // 待裁剪图片的 object URL，关闭裁剪框或换图时释放
    const [croppingImage, setCroppingImage] = useState<string | null>(null);

    useEffect(() => () => {
        if (croppingImage) URL.revokeObjectURL(croppingImage);
    }, [croppingImage]);

    useEffect(() => () => { imageSelection.current += 1; }, []);

    const handleClick = async () => {
        if (hasImage && !(await confirmDialog(t.replaceImage.confirm))) return;
        inputRef.current?.click();
    };

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (!isImageFile(file)) {
            toast.error(t.replaceImage.invalid);
            return;
        }
        const selection = ++imageSelection.current;
        setCroppingImage(null);
        setPreparing(true);
        try {
            const prepared = await prepareImageFile(file);
            if (selection === imageSelection.current) setCroppingImage(URL.createObjectURL(prepared));
        } catch {
            if (selection === imageSelection.current) toast.error(t.upload.imagePrepareFailed);
        } finally {
            if (selection === imageSelection.current) setPreparing(false);
        }
    };

    const handleCropComplete = async (croppedBlob: Blob) => {
        setCroppingImage(null);
        setUploading(true);
        try {
            const file = new File([croppedBlob], "question-image.jpg", { type: croppedBlob.type || "image/jpeg" });
            const imageDataUrl = await processImageFile(file);
            const result = await apiClient.put<{ originalImageUrl: string }>(`/api/error-items/${errorItemId}/image`, { imageDataUrl });
            onDone(result.originalImageUrl);
            toast.success(t.replaceImage.done);
        } catch (error) {
            const code = (error as { data?: { message?: string } })?.data?.message || "";
            frontendLogger.error('[ReplaceImage]', 'Failed to replace original image', { code });
            toast.error(code === "INVALID_IMAGE" ? t.replaceImage.invalid : t.replaceImage.failed);
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = "";
                }}
            />
            {croppingImage && (
                <ImageCropper
                    imageSrc={croppingImage}
                    open
                    onClose={() => setCroppingImage(null)}
                    onCropComplete={handleCropComplete}
                />
            )}
            <Button variant="outline" size="sm" onClick={handleClick} disabled={uploading || preparing} className="flex items-center gap-2">
                {uploading || preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {preparing ? t.upload.preparingImage : uploading ? t.replaceImage.uploading : hasImage ? t.replaceImage.replace : t.replaceImage.add}
            </Button>
        </>
    );
}
