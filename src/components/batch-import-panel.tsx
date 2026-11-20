"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CorrectionEditor } from "@/components/correction-editor";
import { ImageViewer } from "@/components/image-viewer";
import { useLanguage } from "@/contexts/LanguageContext";
import { frontendLogger } from "@/lib/frontend-logger";
import { analyzeQuestionOnly, saveParsedQuestion } from "@/lib/question-import";
import type { AnalyzedQuestion, ImportedQuestion } from "@/lib/question-import";
import type { CorrectionDraft } from "@/components/correction-editor/types";

interface BatchImportPanelProps {
    blobs: Blob[];
    /** 指定错题本；为空时按 AI 识别的学科匹配或新建错题本 */
    subjectId?: string | null;
    /** 本次框选所用整卷图（base64），入库时随每道错题关联 */
    paperImage?: string | null;
    timeout?: number;
    onClose: () => void;
}

type ItemStatus = "pending" | "analyzing" | "review" | "saving" | "success" | "failed";

interface BatchItem {
    id: string;
    blob: Blob;
    status: ItemStatus;
    parsed?: AnalyzedQuestion["parsed"];
    imageBase64?: string;
    imported?: ImportedQuestion;
    error?: string;
}

// 同时识别的题目数，避免一次性压垮 AI 服务
const CONCURRENCY = 3;

/** 一图多题：逐框识别后先校对，确认一道再入库一道 */
export function BatchImportPanel({ blobs, subjectId, paperImage, timeout, onClose }: BatchImportPanelProps) {
    const { t, language } = useLanguage();
    const [items, setItems] = useState<BatchItem[]>(() => blobs.map((blob, index) => ({ id: `item-${index}`, blob, status: "pending" as const })));
    const [editingId, setEditingId] = useState<string | null>(null);
    const [enlargedUrl, setEnlargedUrl] = useState<string | null>(null);
    const startedRef = useRef(false);
    // 保存最新列表，供回调按 id 定位条目
    const itemsRef = useRef(items);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    }, []);

    /** 识别单题：成功后停在待确认状态，由用户校对 */
    const runOne = useCallback(async (id: string) => {
        const item = itemsRef.current.find((entry) => entry.id === id);
        if (!item) return;
        updateItem(id, { status: "analyzing", error: undefined });
        try {
            const { imageBase64, parsed } = await analyzeQuestionOnly(item.blob, { language, subjectId, timeout });
            updateItem(id, { status: "review", imageBase64, parsed, error: undefined });
        } catch (error) {
            const data = (error as { data?: { message?: string } })?.data;
            const backendError = data?.message || (error instanceof Error ? error.message : String(error));
            const mapped = (t.errors as Record<string, unknown>)[backendError];
            updateItem(id, { status: "failed", error: typeof mapped === "string" ? mapped : backendError });
            frontendLogger.error('[BatchImport]', 'Question analysis failed', { id, error: backendError });
        }
    }, [language, subjectId, timeout, t.errors, updateItem]);

    const runAll = useCallback(async (ids: string[]) => {
        const queue = [...ids];
        const worker = async () => {
            while (queue.length > 0) {
                await runOne(queue.shift()!);
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    }, [runOne]);

    /** 确认入库：draft 为校对修改后的数据，缺省用 AI 原始识别结果 */
    const confirmOne = useCallback(async (item: BatchItem, draft?: CorrectionDraft) => {
        const parsed = draft ?? item.parsed;
        if (!parsed) return;
        updateItem(item.id, { status: "saving", error: undefined });
        try {
            const imported = await saveParsedQuestion(parsed, { subjectId, imageUrl: item.imageBase64, paperImageUrl: paperImage });
            updateItem(item.id, { status: "success", imported });
        } catch (error) {
            const data = (error as { data?: { message?: string } })?.data;
            const backendError = data?.message || (error instanceof Error ? error.message : String(error));
            const mapped = (t.errors as Record<string, unknown>)[backendError];
            updateItem(item.id, { status: "failed", error: typeof mapped === "string" ? mapped : backendError, parsed });
            frontendLogger.error('[BatchImport]', 'Question save failed', { id: item.id, error: backendError });
        }
    }, [subjectId, paperImage, t.errors, updateItem]);

    const confirmAll = useCallback(async () => {
        const queue = itemsRef.current.filter((item) => item.status === "review");
        const worker = async () => {
            while (queue.length > 0) {
                await confirmOne(queue.shift()!);
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    }, [confirmOne]);

    const discardOne = useCallback((id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        runAll(itemsRef.current.map((item) => item.id));
    }, [runAll]);

    const done = items.filter((item) => item.status === "success").length;
    const failedCount = items.filter((item) => item.status === "failed").length;
    const reviewCount = items.filter((item) => item.status === "review").length;
    const retryIds = items.flatMap((item) => (item.status === "failed" && !item.parsed ? [item.id] : []));
    const running = items.some((item) => item.status === "pending" || item.status === "analyzing" || item.status === "saving");
    const editingItem = editingId === null ? undefined : items.find((item) => item.id === editingId && item.parsed);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{t.batchImport.title}</CardTitle>
                <span className="text-sm text-muted-foreground">
                    {t.batchImport.summary
                        .replace("{done}", String(done))
                        .replace("{total}", String(items.length))
                        .replace("{review}", String(reviewCount))
                        .replace("{failed}", String(failedCount))}
                </span>
            </CardHeader>
            <CardContent className="space-y-4">
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item, index) => (
                        <li key={item.id} className="flex gap-3 rounded-lg border p-3">
                            <BlobThumbnail blob={item.blob} onEnlarge={setEnlargedUrl} />
                            <div className="min-w-0 flex-1 space-y-1 text-sm">
                                <div className="font-medium">{t.batchImport.question.replace("{index}", String(index + 1))}</div>
                                <StatusLine item={item} />
                                {(item.status === "review" || (item.status === "failed" && item.parsed)) && item.parsed && (
                                    <p className="line-clamp-2 text-xs text-muted-foreground">{item.parsed.questionText}</p>
                                )}
                                {item.status === "success" && item.imported && (
                                    <Link href={`/error-items/${item.imported.id}`} className="block truncate text-xs text-primary hover:underline">
                                        {item.imported.notebookName} · {item.imported.shortId}
                                    </Link>
                                )}
                                {item.status === "review" && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingId(item.id)}>
                                            <Pencil className="mr-1 h-3 w-3" />
                                            {t.batchImport.edit}
                                        </Button>
                                        <Button size="sm" className="h-7" onClick={() => confirmOne(item)}>
                                            <CheckCircle className="mr-1 h-3 w-3" />
                                            {t.batchImport.confirm}
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => discardOne(item.id)}>
                                            <Trash2 className="mr-1 h-3 w-3" />
                                            {t.batchImport.discard}
                                        </Button>
                                    </div>
                                )}
                                {item.status === "failed" && (
                                    <>
                                        {item.error && <p className="line-clamp-2 text-xs text-destructive">{item.error}</p>}
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {item.parsed ? (
                                                <Button size="sm" className="h-7" onClick={() => confirmOne(item)}>
                                                    <CheckCircle className="mr-1 h-3 w-3" />
                                                    {t.batchImport.confirm}
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" className="h-7" onClick={() => runOne(item.id)}>
                                                    <RotateCcw className="mr-1 h-3 w-3" />
                                                    {t.batchImport.retry}
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => discardOne(item.id)}>
                                                <Trash2 className="mr-1 h-3 w-3" />
                                                {t.batchImport.discard}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                {reviewCount > 0 && (
                    <p className="text-xs text-muted-foreground">{t.batchImport.finishBlocked}</p>
                )}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    {retryIds.length > 1 && !running && (
                        <Button variant="outline" onClick={() => runAll(retryIds)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t.batchImport.retryFailed}
                        </Button>
                    )}
                    {reviewCount > 1 && !running && (
                        <Button variant="outline" onClick={confirmAll}>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {t.batchImport.confirmAll}
                        </Button>
                    )}
                    <Button onClick={onClose} disabled={running || reviewCount > 0}>
                        {t.batchImport.finish}
                    </Button>
                </div>
            </CardContent>

            {editingItem && (
                <Dialog open onOpenChange={(open) => { if (!open) setEditingId(null); }}>
                    <DialogContent className="max-h-[85vh] w-[95vw] max-w-5xl overflow-y-auto">
                        <DialogTitle className="sr-only">{t.batchImport.editTitle}</DialogTitle>
                        <CorrectionEditor
                            initialData={editingItem.parsed!}
                            initialSubjectId={subjectId ?? undefined}
                            imagePreview={editingItem.imageBase64}
                            aiTimeout={timeout}
                            onCancel={() => setEditingId(null)}
                            onSave={async (data) => {
                                setEditingId(null);
                                await confirmOne(editingItem, data);
                            }}
                        />
                    </DialogContent>
                </Dialog>
            )}

            <ImageViewer src={enlargedUrl} onClose={() => setEnlargedUrl(null)} />
        </Card>
    );
}

function StatusLine({ item }: { item: BatchItem }) {
    const { t } = useLanguage();
    const label = t.batchImport.status[item.status];
    if (item.status === "success") {
        return <span className="flex items-start gap-1 text-green-700"><CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />{item.imported?.duplicate ? t.importFlow.duplicate : label}</span>;
    }
    if (item.status === "failed") {
        return <span className="flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" />{label}</span>;
    }
    if (item.status === "review") {
        return <span className="flex items-center gap-1 text-amber-700"><Pencil className="h-4 w-4" />{label}</span>;
    }
    return (
        <span className="flex items-center gap-1 text-muted-foreground">
            {item.status !== "pending" && <Loader2 className="h-4 w-4 animate-spin" />}
            {label}
        </span>
    );
}

/** 题目图片缩略图：在组件内创建并回收 blob URL，点击可放大查看 */
function BlobThumbnail({ blob, onEnlarge }: { blob: Blob; onEnlarge: (url: string) => void }) {
    const { t } = useLanguage();
    const imageRef = useRef<HTMLImageElement>(null);
    const urlRef = useRef<string | null>(null);

    useEffect(() => {
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        if (imageRef.current) imageRef.current.src = url;
        return () => {
            URL.revokeObjectURL(url);
            urlRef.current = null;
        };
    }, [blob]);

    return (
        <button
            type="button"
            aria-label={t.batchImport.enlargeImage}
            className="h-28 w-28 shrink-0 self-start overflow-hidden rounded border bg-muted"
            onClick={() => {
                if (urlRef.current) onEnlarge(urlRef.current);
            }}
        >
            <img ref={imageRef} alt="" className="h-full w-full cursor-zoom-in object-contain" />
        </button>
    );
}
