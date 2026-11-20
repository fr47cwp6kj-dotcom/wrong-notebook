"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { usePageTitle } from '@/lib/page-title';

interface Unit { id: string; name: string; stage: string; subject: string; triggerRule: string; boundary: string; attempts: number; contexts: number; verificationStage: 'pending' | 'preliminary' | 'cross_context' | 'temporary' | 'stable'; mastered: boolean; questions: Array<{ id: string; shortId: string | null; text: string }>; confusable: Array<{ id: string; name: string; triggerRule: string; boundary: string }> }
export default function KnowledgeUnitsPage() {
    const { t } = useLanguage();
    usePageTitle(t.gaps.library);
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const load = useCallback(() => {
        setLoading(true); setError(false);
        apiClient.get<{ units: Unit[] }>('/api/knowledge-units').then(data => setUnits(data.units)).catch(() => setError(true)).finally(() => setLoading(false));
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入页面时加载知识单元。
        load();
    }, [load]);
    return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{t.gaps.library}</h1><Button variant="outline" asChild><Link href="/notebooks">{t.gaps.back}</Link></Button></div>
        <p className="text-muted-foreground">{t.gaps.unitIntro}</p>
        {loading && <p>{t.common.loading}</p>}
        {error && <div role="alert">{t.gaps.failed}<Button variant="ghost" onClick={load}>{t.gaps.reload}</Button></div>}
        {!loading && !error && !units.length && <p>{t.gaps.noUnits}</p>}
        <div className="grid gap-4 md:grid-cols-2">{units.map(unit => <Card key={unit.id}><CardHeader><CardTitle className="text-lg">{unit.name}</CardTitle><Badge className="w-fit" variant="outline">{t.gaps.verificationStages[unit.verificationStage]}</Badge></CardHeader><CardContent className="space-y-3">
            <p className="font-medium">{unit.triggerRule}</p><p className="text-sm text-muted-foreground">{unit.boundary}</p>
            <p className="text-sm">{t.gaps.attempts}：{unit.attempts} · {t.gaps.contexts}：{unit.contexts}</p>
            {unit.confusable.length > 0 && <div className="space-y-2 rounded border p-3 text-sm"><h3 className="font-medium">{t.gaps.confusable}</h3>
                {unit.confusable.map(other => <div key={other.id}><p className="font-medium">{other.name}</p><p>{other.triggerRule}</p><p className="text-muted-foreground">{other.boundary}</p></div>)}
            </div>}
            <h3 className="text-sm font-medium">{t.gaps.questions}</h3><ul className="space-y-2 text-sm">{unit.questions.map(question => <li key={question.id}><Link className="text-primary underline underline-offset-4" href={`/error-items/${question.id}#knowledge-gaps`}>{question.shortId || '↗'} · {question.text}</Link></li>)}</ul>
        </CardContent></Card>)}</div>
    </main>;
}
