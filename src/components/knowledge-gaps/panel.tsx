"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/error-message';
import type { GapView } from '@/lib/knowledge-gaps';
import { DiagnosisCard } from './diagnosis-card';
import { ManualGapForm } from './manual-form';

export function KnowledgeGapPanel({ errorItemId }: { errorItemId: string }) {
    const { t, language } = useLanguage();
    const [diagnoses, setDiagnoses] = useState<GapView[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [reviewed, setReviewed] = useState(false);
    const [manual, setManual] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const endpoint = `/api/error-items/${errorItemId}/knowledge-gaps`;
    const load = useCallback(async () => {
        const data = await apiClient.get<{ diagnoses: GapView[] }>(endpoint);
        setDiagnoses(data.diagnoses);
    }, [endpoint]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入题目详情时加载已保存的诊断。
        load().catch(() => setError(t.gaps.failed)).finally(() => setLoading(false));
    }, [load, t.gaps.failed]);

    const action = async (body: Record<string, unknown>): Promise<boolean> => {
        setBusy(true); setError(''); setNotice('');
        try {
            const result = await apiClient.post<{ status?: string; reason?: string; questions?: string[] }>(endpoint, body, { timeout: 180000 });
            if (result.status === 'needs_more_information') {
                setNotice(result.reason === 'GAP_NEEDS_WORK' ? t.gaps.missing : [result.reason, ...(result.questions || [])].join('\n'));
            }
            await load();
            return true;
        } catch (failure) {
            const code = getApiErrorMessage(failure);
            setError(code === 'GAP_STALE' ? t.gaps.stale : code === 'GAP_CONFIRM_FIRST' ? t.gaps.confirmFirst : code === 'GAP_REVIEW_FIRST' ? t.gaps.reviewFirst : ['GAP_INVALID_DATA', 'GAP_EVIDENCE_MISMATCH'].includes(code || '') ? t.gaps.invalid : t.gaps.failed);
            return false;
        } finally { setBusy(false); }
    };

    return <Card className="my-6 border-primary/30" id="knowledge-gaps">
        <CardHeader>
            <CardTitle>{t.gaps.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{t.gaps.intro}</p>
        </CardHeader>
        <CardContent className="space-y-5">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />{t.gaps.reviewedInput}</label>
            <div className="flex flex-wrap gap-2">
                <Button disabled={!reviewed || busy || loading} onClick={() => action({ action: 'generate', reviewedInput: true, language })}>{busy ? t.gaps.saving : t.gaps.generate}</Button>
                <Button variant="outline" disabled={busy} onClick={() => setManual(!manual)}>{t.gaps.manual}</Button>
                <Button variant="ghost" asChild><Link href="/knowledge-units">{t.gaps.library}</Link></Button>
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {notice && <p role="status" className="whitespace-pre-wrap rounded-md bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
            {manual && <ManualGapForm busy={busy} onSave={async candidate => { if (await action({ action: 'manual', candidate })) setManual(false); }} />}
            {loading ? <p>{t.common.loading}</p> : diagnoses.length === 0 && <p className="text-sm text-muted-foreground">{t.gaps.empty}</p>}
            {(showAll ? diagnoses : [diagnoses.find(d => !d.stale && d.status !== 'rejected') ?? diagnoses[0]].filter((d): d is GapView => Boolean(d))).map(diagnosis => <DiagnosisCard key={diagnosis.id} diagnosis={diagnosis} busy={busy} onAction={action} />)}
            {diagnoses.length > 1 && <Button variant="outline" onClick={() => setShowAll(value => !value)}>{showAll ? t.gaps.showLess : t.gaps.showAll.replace('{count}', String(diagnoses.length))}</Button>}
        </CardContent>
    </Card>;
}
