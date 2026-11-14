"use client";

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useLanguage } from '@/contexts/LanguageContext';
import type { GapView } from '@/lib/knowledge-gaps';
import { GapPractice } from './practice';

export interface DiagnosisProps { diagnosis: GapView; busy: boolean; onAction: (body: Record<string, unknown>) => Promise<boolean> }
export function DiagnosisCard({ diagnosis, busy, onAction }: DiagnosisProps) {
    const { t } = useLanguage();
    const c = diagnosis.candidate;
    return <article className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{c.unitName}</h3><Badge variant="outline">{t.gaps[diagnosis.status]}</Badge><span className="text-xs text-muted-foreground">{diagnosis.source === 'manual' ? t.gaps.sourceManual : t.gaps.sourceAI}</span></div>
        {diagnosis.stale && <p className="text-sm text-amber-700">{t.gaps.stale}</p>}
        <p className="rounded bg-primary/5 p-3 font-medium">{c.triggerRule}</p>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
            {(['firstStuckStep', 'unusedSignal', 'surfaceReason', 'hypothesis', 'boundary'] as const).map(key => c[key] && <div key={key}><dt className="font-medium">{t.gaps[key]}</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{c[key]}</dd></div>)}
            <div><dt className="font-medium">{t.gaps.gapType}</dt><dd>{t.gaps.gapTypes[c.gapType]}</dd></div>
        </dl>
        <blockquote className="border-l-2 pl-3 text-sm"><span className="text-muted-foreground">{t.gaps.evidenceSource} · {t.gaps[c.evidenceSource]}</span><MarkdownRenderer content={c.evidenceQuote} /></blockquote>
        <div className="text-sm"><p className="font-medium">{t.gaps.questionForStudent}</p><ul className="list-disc space-y-1 pl-5">{c.questionsToStudent.map((question, index) => <li key={index}>{question}</li>)}</ul></div>
        <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || diagnosis.stale || diagnosis.status === 'confirmed'} onClick={() => onAction({ action: 'status', diagnosisId: diagnosis.id, status: 'confirmed' })}>{t.gaps.confirm}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ action: 'status', diagnosisId: diagnosis.id, status: 'uncertain' })}>{t.gaps.unsure}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction({ action: 'status', diagnosisId: diagnosis.id, status: 'rejected' })}>{t.gaps.reject}</Button>
        </div>
        {!diagnosis.stale && diagnosis.status === 'confirmed' && <GapPractice diagnosis={diagnosis} busy={busy} onAction={onAction} />}
    </article>;
}
