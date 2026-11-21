"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, PenLine, Sparkles } from "lucide-react";
import { BatchImportPanel } from "@/components/batch-import-panel";
import { CorrectionEditor } from "@/components/correction-editor";
import { DirectTextEditor } from "@/components/direct-text-editor";
import { ImageCropper } from "@/components/image-cropper";
import { ImportResultBanner } from "@/components/import-result-banner";
import { TextInputZone } from "@/components/text-input-zone";
import { UploadZone } from "@/components/upload-zone";
import { PageLoading } from "@/components/ui/page-loading";
import { ProgressFeedback } from "@/components/ui/progress-feedback";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { usePageTitle } from "@/lib/page-title";
import { useQuestionImport } from "@/lib/use-question-import";
import type { Notebook } from "@/types/api";

/** 直接录入（不经 AI）提交的内容 */
interface DirectEntry {
    questionText: string;
    answerText: string;
    analysis: string;
    wrongAnswerText: string;
    mistakeAnalysis: string;
    mistakeStatus: string;
    knowledgePoints: string[];
    subjectId: string;
    gradeSemester?: string;
    paperLevel?: string;
}

function HomeContent() {
    const { t } = useLanguage();
    usePageTitle(t.pageTitle.home);
    const searchParams = useSearchParams();
    const initialNotebookId = searchParams.get("notebook");
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [autoSelectedNotebookId, setAutoSelectedNotebookId] = useState<string | null>(null);
    // Input mode: "image" for photo upload, "text" for AI solve, "direct" for manual entry
    const [inputMode, setInputMode] = useState<"image" | "text" | "direct">("image");

    const targetNotebookId = initialNotebookId || autoSelectedNotebookId;
    const targetNotebook = targetNotebookId ? notebooks.find(n => n.id === targetNotebookId) : undefined;

    const flow = useQuestionImport({
        logPrefix: '[Home]',
        analyzeSubjectId: targetNotebookId,
        importSubjectId: initialNotebookId,
        textNotebook: targetNotebook && { id: targetNotebook.id, name: targetNotebook.name },
        // 按识别出的学科自动选择名称相近的错题本
        onParsed: (data) => {
            const matched = data.subject && notebooks.find(n => n.name.includes(data.subject!) || data.subject!.includes(n.name));
            if (matched) setAutoSelectedNotebookId(matched.id);
        },
    });

    useEffect(() => {
        // Fetch notebooks for auto-selection
        apiClient.get<Notebook[]>("/api/notebooks")
            .then(data => setNotebooks(data))
            .catch(err => frontendLogger.error('[Home]', 'Failed to fetch notebooks', { error: err }));
    }, []);

    const handleDirectSave = async (data: DirectEntry): Promise<void> => {
        flow.setAnalysisStep('saving');
        await flow.saveQuestion({
            ...data,
            wrongAnswerText: data.wrongAnswerText || null,
            mistakeAnalysis: data.mistakeAnalysis || null,
            mistakeStatus: data.mistakeStatus || "unknown",
            originalImageUrl: "",
        });
        flow.setAnalysisStep('idle');
    };

    const inputModes = [
        { value: "image" as const, icon: Camera, label: t.app?.uploadImage || "Take Photo" },
        { value: "text" as const, icon: Sparkles, label: t.app?.manualInput || "Manual Input" },
        { value: "direct" as const, icon: PenLine, label: t.app?.directInput || "Manual Entry" },
    ];

    return (
        <main className="min-h-screen">
            <ProgressFeedback status={flow.analysisStep} subject={targetNotebook?.subjectKey || targetNotebook?.name} gradeSemester={targetNotebook?.stage} onCancel={flow.cancelProcessing} />

            <div className={`mx-auto space-y-8 px-4 py-6 md:px-10 md:py-10 ${flow.step === "review" ? "max-w-6xl" : "max-w-6xl"}`}>
                {flow.step === "upload" && (
                    <>
                        <div className="rounded-[1.35rem] border border-border/80 bg-card p-4 md:p-6">
                            <div className="mb-5 flex flex-col gap-2 border-b border-border/70 pb-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold">录入一题，找到一个卡点</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">先保留原题与错答，再让 AI 帮你校对和归档。</p>
                                </div>
                                <span className="text-xs text-muted-foreground">原图会和错题关联保存</span>
                            </div>
                            <SegmentedControl options={inputModes} value={inputMode} onChange={setInputMode} />

                            {flow.lastImported && (
                                <ImportResultBanner imported={flow.lastImported} onDismiss={flow.dismissImported} />
                            )}

                            {flow.batchBlobs ? (
                                <BatchImportPanel
                                    blobs={flow.batchBlobs}
                                    subjectId={initialNotebookId}
                                    paperImage={flow.paperImage}
                                    timeout={flow.aiTimeout}
                                    onClose={flow.closeBatch}
                                />
                            ) : inputMode === "image" ? (
                                <UploadZone onImageSelect={flow.selectImage} isAnalyzing={flow.isBusy} isPreparingImage={flow.isPreparingImage} />
                            ) : inputMode === "text" ? (
                                <TextInputZone
                                    onSubmit={flow.submitText}
                                    isAnalyzing={flow.isBusy}
                                    defaultNotebookName={targetNotebook?.name}
                                />
                            ) : (
                                <DirectTextEditor
                                    onSubmit={handleDirectSave}
                                    defaultNotebookId={targetNotebookId || undefined}
                                    defaultNotebookName={targetNotebook?.name}
                                    isSaving={flow.analysisStep === 'saving'}
                                />
                            )}
                        </div>
                    </>
                )}

                {flow.croppingImage && (
                    <ImageCropper
                        imageSrc={flow.croppingImage}
                        open={flow.isCropperOpen}
                        onClose={flow.closeCropper}
                        onCropComplete={flow.cropComplete}
                        onMultiCropComplete={flow.startBatch}
                    />
                )}

                {flow.step === "review" && flow.parsedData && (
                    <CorrectionEditor
                        initialData={flow.parsedData}
                        onSave={flow.saveReviewed}
                        onCancel={flow.cancelReview}
                        imagePreview={flow.currentImage}
                        initialSubjectId={targetNotebookId || undefined}
                        aiTimeout={flow.aiTimeout}
                    />
                )}
            </div>
        </main>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<PageLoading />}>
            <HomeContent />
        </Suspense>
    );
}
