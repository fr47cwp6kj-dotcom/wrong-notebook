"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SvgAnimationPlayer } from "@/components/svg-animation-player";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { toast, confirmDialog } from "@/lib/feedback";
import type { Language } from "@/lib/translations";

/** 动画 SVG 较长，AI 通常需要几分钟才能写完，前端等待上限与服务端 AI 请求超时一致 */
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;

// 合并同一页面中尚未结束的自动请求，避免重复挂载重复消耗 AI。
const pendingAnimations = new Map<string, Promise<{ svgAnimation: string; svgAnimationSteps?: string | null }>>();
function requestAnimation(errorItemId: string, language: Language, reuseExisting: boolean, signal?: AbortSignal) {
    const key = `${errorItemId}:${language}`;
    const pending = pendingAnimations.get(key);
    if (pending) return pending;
    const request = apiClient.post<{ svgAnimation: string; svgAnimationSteps?: string | null }>(
        `/api/error-items/${errorItemId}/svg-animation`,
        { language, ...(reuseExisting ? { reuseExisting: true } : {}) },
        { timeout: GENERATE_TIMEOUT_MS, signal },
    ).finally(() => { pendingAnimations.delete(key); });
    pendingAnimations.set(key, request);
    return request;
}

interface SvgAnimationExplainerProps {
    errorItemId: string;
    /** 首次打开自动补齐动画；已有动画直接复用。 */
    autoGenerate?: boolean;
    /** 当前界面语言对应的动画 */
    svgAnimation: string | null | undefined;
    /** 当前界面语言对应的分步时间轴（JSON，旧动画可能没有） */
    svgAnimationSteps?: string | null;
    /** 另一语言是否已有动画（当前语言未生成时提示切换语言查看） */
    hasOtherLanguage?: boolean;
    /** 生成或删除后回调该语言的新动画与分步时间轴（删除后为 null） */
    onChange: (language: Language, svgAnimation: string | null, stepsJson?: string | null) => void;
}

/**
 * 题目的 SVG 动画讲解，按界面语言分别生成和显示：中文界面用中文版动画，英文界面用英文版动画。
 * 未生成时显示生成入口；已生成时可播放/暂停、拖动进度、分步点击、重新生成和删除（删除需二次确认，只删除当前语言的动画）。
 */
export function SvgAnimationExplainer({ errorItemId, svgAnimation, svgAnimationSteps, hasOtherLanguage, onChange, autoGenerate = true }: SvgAnimationExplainerProps) {
    const { t, language } = useLanguage();
    const attempted = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const [generating, setGenerating] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const controller = useRef<AbortController | null>(null);

    const handleGenerate = useCallback(async (reuseExisting = false) => {
        attempted.current = true;
        setGenerating(true);
        const requestController = new AbortController();
        controller.current = requestController;
        setError(null);
        try {
            const result = await requestAnimation(errorItemId, language, reuseExisting, requestController.signal);
            if (mounted.current) onChange(language, result.svgAnimation, result.svgAnimationSteps ?? null);
        } catch (err) {
            if (requestController.signal.aborted) return;
            const code = (err as { data?: { message?: string } })?.data?.message || "";
            const mapped = (t.errors as Record<string, unknown>)[code];
            frontendLogger.error('[SvgAnimation]', 'Failed to generate SVG animation', { code });
            if (mounted.current) setError(
                code === "NO_QUESTION_TEXT" ? t.svgAnimation.noQuestionText
                    : code === "NO_VALID_ANIMATION" ? t.svgAnimation.invalid
                        : typeof mapped === "string" ? mapped : t.svgAnimation.failed
            );
        } finally {
            if (mounted.current) setGenerating(false);
            if (controller.current === requestController) controller.current = null;
        }
    }, [errorItemId, language, onChange, t.errors, t.svgAnimation]);

    useEffect(() => {
        if (!autoGenerate || svgAnimation || attempted.current) return;
        void handleGenerate(true);
    }, [autoGenerate, svgAnimation, handleGenerate]);

    const handleDelete = async () => {
        if (!(await confirmDialog(t.svgAnimation.confirmDelete, { destructive: true }))) return;
        attempted.current = true;
        setDeleting(true);
        try {
            await apiClient.delete(`/api/error-items/${errorItemId}/svg-animation?language=${language}`);
            onChange(language, null, null);
            setError(null);
        } catch (err) {
            frontendLogger.error('[SvgAnimation]', 'Failed to delete SVG animation', { error: err instanceof Error ? err.message : String(err) });
            toast.error(t.svgAnimation.deleteFailed);
        } finally {
            setDeleting(false);
        }
    };

    if (!svgAnimation) {
        return (
            <div className="rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clapperboard className="h-4 w-4" />
                        <span>{t.svgAnimation.title}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void handleGenerate()} disabled={generating}>
                        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
                        {generating ? t.svgAnimation.generating : t.svgAnimation.generate}
                    </Button>
                    {generating && <Button variant="ghost" size="sm" onClick={() => controller.current?.abort()}>{t.common.progress.cancel}</Button>}
                </div>
                {error && <p className="text-xs text-destructive mt-2">{error}</p>}
                {generating && <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">{t.svgAnimation.generatingHint}</p>}
                <p className="mt-2 text-sm text-muted-foreground">{t.svgAnimation.hint}</p>
                {hasOtherLanguage && <p className="mt-1 text-sm text-muted-foreground">{t.svgAnimation.otherLanguageAvailable}</p>}
            </div>
        );
    }

    const busy = generating || deleting;
    return (
        <div className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t.svgAnimation.title}</span>
                    {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => void handleGenerate()} disabled={busy}>
                        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        <span>{generating ? t.svgAnimation.generating : t.svgAnimation.regenerate}</span>
                    </Button>
                    {generating && <Button variant="ghost" size="sm" onClick={() => controller.current?.abort()}>{t.common.progress.cancel}</Button>}
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive" onClick={handleDelete} disabled={busy}>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t.svgAnimation.delete}</span>
                    </Button>
                </div>
            </div>
            {error && <p className="px-3 pt-2 text-xs text-destructive">{error}</p>}
            {generating && <p className="px-3 pt-2 text-xs leading-5 text-muted-foreground">{t.svgAnimation.generatingHint}</p>}
            <div className="p-2 sm:p-3">
                <SvgAnimationPlayer svg={svgAnimation} stepsJson={svgAnimationSteps} />
                <p className="mx-auto mt-2 max-w-3xl text-sm text-muted-foreground">{t.svgAnimation.controlsHint}</p>
            </div>
        </div>
    );
}
