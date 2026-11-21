"use client";

import { useEffect, useState } from "react";
import { HomeHero } from "@/components/home-hero";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { usePageTitle } from "@/lib/page-title";
import type { Notebook, PaginatedResponse } from "@/types/api";

interface UnitPracticeTarget { verificationStage: 'pending' | 'preliminary' | 'cross_context' | 'temporary' | 'stable'; questions: Array<{ id: string }>; }

/** 默认学习首页：任务、诊断和掌握证据与录题工作面分开。 */
export default function LearningHomePage() {
    const { t } = useLanguage();
    usePageTitle("学习首页");
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [dueCount, setDueCount] = useState<number | null>(null);
    const [targetPracticeHref, setTargetPracticeHref] = useState('/knowledge-units');
    useEffect(() => {
        apiClient.get<Notebook[]>('/api/notebooks').then(setNotebooks).catch(error => frontendLogger.error('[LearningHome]', 'Failed to load notebooks', { error }));
        apiClient.get<PaginatedResponse<unknown>>('/api/review/due?pageSize=1').then(data => setDueCount(data.total)).catch(error => frontendLogger.error('[LearningHome]', 'Failed to load review count', { error }));
        apiClient.get<{ units: UnitPracticeTarget[] }>('/api/knowledge-units').then(({ units }) => { const unit = units.find(item => !['temporary', 'stable'].includes(item.verificationStage) && item.questions[0]); if (unit?.questions[0]) setTargetPracticeHref(`/practice?id=${encodeURIComponent(unit.questions[0].id)}`); }).catch(error => frontendLogger.error('[LearningHome]', 'Failed to load target practice', { error }));
    }, []);
    const itemCount = notebooks.reduce((sum, notebook) => sum + (notebook._count?.errorItems || 0), 0);
    return <main className="min-h-screen"><div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-10"><HomeHero notebookCount={notebooks.length} itemCount={itemCount} dueCount={dueCount} targetPracticeHref={targetPracticeHref} /><p className="sr-only">{t.pageTitle.home}</p></div></main>;
}
