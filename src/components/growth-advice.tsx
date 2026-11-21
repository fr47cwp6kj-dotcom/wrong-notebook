"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, CalendarCheck, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { buildGrowthAdvice } from "@/lib/growth-advice";
import { frontendLogger } from "@/lib/frontend-logger";

type UnitResponse = {
    id: string;
    name: string;
    verificationStage: 'pending' | 'preliminary' | 'cross_context' | 'temporary' | 'stable';
    attempts: number;
    contexts: number;
    questions: Array<{ id: string }>;
};

/** 用已有学习证据生成可执行建议；不新增 AI 调用，也不把推测当作结论。 */
export function GrowthAdvice() {
    const { t } = useLanguage();
    const [units, setUnits] = useState<UnitResponse[] | null>(null);
    const [reviewCount, setReviewCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const loadAdvice = () => {
            Promise.all([
                apiClient.get<{ units: UnitResponse[] }>('/api/knowledge-units'),
                apiClient.get<{ total: number }>('/api/review/due?pageSize=1'),
            ]).then(([unitData, reviewData]) => {
                if (cancelled) return;
                setUnits(unitData.units);
                setReviewCount(reviewData.total);
            }).catch(error => frontendLogger.error('[GrowthAdvice]', 'Failed to load growth advice', { error }));
        };
        const handleDataUpdated = () => loadAdvice();
        const handleVisibilityChange = () => { if (document.visibilityState === 'visible') loadAdvice(); };
        loadAdvice();
        window.addEventListener('wrong-notebook:data-updated', handleDataUpdated);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            cancelled = true;
            window.removeEventListener('wrong-notebook:data-updated', handleDataUpdated);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    if (units === null) return <section className="rounded-[1.35rem] border border-border/80 bg-card p-5"><p className="text-sm text-muted-foreground">{t.stats.adviceLoading}</p></section>;

    const advice = buildGrowthAdvice(units, reviewCount);
    const actionLabel = advice.dataStatus === 'empty' ? t.stats.adviceStartRecording
        : advice.reviewCount > 0 ? t.stats.adviceReviewNow : t.stats.adviceVerifyNow;
    const priorityDetail = advice.priorityUnit?.verificationStage === 'pending' ? t.stats.advicePendingDetail
        : advice.priorityUnit?.verificationStage === 'preliminary' ? t.stats.advicePreliminaryDetail
            : t.stats.adviceBoundaryDetail;

    return (
        <section className="rounded-[1.35rem] border border-primary/15 bg-[oklch(0.975_0.01_160)] p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
                <div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t.stats.adviceTitle}</h2></div><p className="mt-1 text-sm text-muted-foreground">{t.stats.adviceDesc}</p></div>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(14rem,.8fr)]">
                <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium"><BrainCircuit className="h-4 w-4 text-primary" />{t.stats.adviceNext}</div>
                    {advice.priorityUnit ? <><p className="mt-3 text-base font-semibold">{advice.priorityUnit.name}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{priorityDetail.replace('{name}', advice.priorityUnit.name).replace('{count}', String(advice.priorityUnit.contexts))}</p></> : advice.dataStatus === 'empty' ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.stats.adviceEmpty}</p> : <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.stats.adviceConsolidating}</p>}
                    <Link href={advice.nextHref} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">{actionLabel}<ArrowRight className="h-4 w-4" /></Link>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium"><CalendarCheck className="h-4 w-4 text-primary" />{t.stats.adviceProgress}</div>
                    {advice.progressUnit ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.stats.adviceProgressDetail.replace('{name}', advice.progressUnit.name).replace('{count}', String(advice.progressUnit.contexts))}</p> : <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.stats.adviceProgressEmpty}</p>}
                    <p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">{reviewCount > 0 ? t.stats.adviceReviewCount.replace('{count}', String(reviewCount)) : t.stats.adviceNoReview}</p>
                </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t.stats.adviceEvidence}</p>
        </section>
    );
}
