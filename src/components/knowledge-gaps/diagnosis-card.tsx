"use client";

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useLanguage } from '@/contexts/LanguageContext';
import type { GapView } from '@/lib/knowledge-gaps';
import { GapPractice } from './practice';

export interface DiagnosisProps { diagnosis: GapView; busy: boolean; onAction: (body: Record<string, unknown>) => Promise<boolean> }

/** 诊断卡的分段标题：数字圆点 + 标题，桌面与移动端均为纵向分步 */
function StepHeading({ index, title }: { index: number; title: string }) {
    return <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index}</span>
        <h4 className="font-medium">{title}</h4>
    </div>;
}

export function DiagnosisCard({ diagnosis, busy, onAction }: DiagnosisProps) {
    const { t, language } = useLanguage();
    const [step, setStep] = useState(1);
    const [followupAnswer, setFollowupAnswer] = useState('');
    const followupRequestId = useRef<string | null>(null);
    const c = diagnosis.candidate;
    const followups = diagnosis.followups ?? [];
    const replyCount = followups.filter(event => event.source === 'student').length;
    const latestAi = [...followups].reverse().find(event => event.source === 'ai');
    const nextQuestion = latestAi?.nextQuestion || c.questionsToStudent[0];
    const sendFollowup = async (answer: string, mode: 'text' | 'option' | 'unknown') => {
        followupRequestId.current ||= crypto.randomUUID();
        if (await onAction({ action: 'followup', diagnosisId: diagnosis.id, requestId: followupRequestId.current, answer, mode, language })) {
            followupRequestId.current = null;
            setFollowupAnswer('');
        }
    };
    const detailFields = (['unusedSignal', 'hypothesis', 'boundary'] as const).filter(key => c[key]);
    return <article className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{c.unitName}</h3><Badge variant="outline">{t.gaps[diagnosis.status]}</Badge><span className="text-xs text-muted-foreground">{diagnosis.source === 'manual' ? t.gaps.sourceManual : t.gaps.sourceAI}</span></div>
        {diagnosis.stale && <p className="text-sm text-amber-700">{t.gaps.stale}</p>}

        {/* 一、错在哪：首个卡点与作答证据 */}
        <section className="space-y-2 rounded-md bg-destructive/5 p-3">
            <StepHeading index={1} title={t.gaps.stepWhere} />
            {c.firstStuckStep && <p className="whitespace-pre-wrap text-sm">{c.firstStuckStep}</p>}
            <blockquote className="border-l-2 pl-3 text-sm"><span className="text-xs text-muted-foreground">{t.gaps.evidenceSource} · {t.gaps[c.evidenceSource]}</span><MarkdownRenderer content={c.evidenceQuote} /></blockquote>
        </section>

        {/* 二、为什么：表层错因直接给出，深层分析可折叠 */}
        {step >= 2 && <section className="space-y-2 rounded-md bg-primary/5 p-3">
            <StepHeading index={2} title={t.gaps.stepWhy} />
            <p className="rounded bg-background p-2 text-sm font-medium">{c.triggerRule}</p>
            {c.surfaceReason && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{c.surfaceReason}</p>}
            {detailFields.length > 0 && (
                <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-muted-foreground">{t.gaps.stepWhyDetail}</summary>
                    <dl className="mt-2 grid gap-3 md:grid-cols-2">
                        {detailFields.map(key => <div key={key}><dt className="font-medium">{t.gaps[key]}</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{c[key]}</dd></div>)}
                        <div><dt className="font-medium">{t.gaps.gapType}</dt><dd>{t.gaps.gapTypes[c.gapType]}</dd></div>
                    </dl>
                </details>
            )}
        </section>}

        {step >= 2 && !diagnosis.stale && replyCount < 3 && nextQuestion && <section className="space-y-2 rounded-md border p-3">
            <h4 className="font-medium">{t.gaps.followup}</h4>
            <p className="text-sm">{nextQuestion}</p>
            <textarea className="w-full rounded border bg-background p-2 text-sm" rows={2} maxLength={4000}
                placeholder={t.gaps.followupPlaceholder} value={followupAnswer} disabled={busy}
                onChange={event => { setFollowupAnswer(event.target.value); followupRequestId.current = null; }} />
            <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy || !followupAnswer.trim()} onClick={() => sendFollowup(followupAnswer, 'text')}>{t.gaps.followupSend}</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => sendFollowup(t.gaps.followupYes, 'option')}>{t.gaps.followupYes}</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => sendFollowup(t.gaps.followupNo, 'option')}>{t.gaps.followupNo}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => sendFollowup(t.gaps.followupUnknown, 'unknown')}>{t.gaps.followupUnknown}</Button>
            </div>
        </section>}
        {step >= 2 && latestAi?.hypothesis && <p className="text-sm text-muted-foreground">{t.gaps.followupInference}：{latestAi.hypothesis}</p>}
        {step >= 2 && replyCount >= 3 && <p className="text-sm text-muted-foreground">{t.gaps.followupLimit}</p>}

        {/* 三、接下来练什么：给学生的追问与确认目标，练习题在确认诊断后出现 */}
        {step >= 3 && <section className="space-y-2 rounded-md bg-emerald-500/5 p-3">
            <StepHeading index={3} title={t.gaps.stepNext} />
            <div className="text-sm"><ul className="list-disc space-y-1 pl-5">{c.questionsToStudent.slice(0, 2).map((question, index) => <li key={index}>{question}</li>)}</ul></div>
            <p className="text-xs text-muted-foreground">{t.gaps.stepNextGoal}</p>
        </section>
        }

        {step < 3 && <Button size="sm" variant="outline" onClick={() => setStep(step + 1)}>{step === 1 ? t.gaps.nextWhy : t.gaps.nextPractice}</Button>}
        <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t.gaps.fullDiagnosis}</summary>
            <div className="mt-2 space-y-2"><p>{c.surfaceReason}</p><p>{c.hypothesis}</p><p>{c.triggerRule}</p><p>{c.boundary}</p></div>
        </details>

        <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || diagnosis.stale || diagnosis.status === 'confirmed'} onClick={() => onAction({ action: 'status', diagnosisId: diagnosis.id, status: 'confirmed' })}>{t.gaps.confirm}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ action: 'status', diagnosisId: diagnosis.id, status: 'uncertain' })}>{t.gaps.unsure}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction({ action: 'status', diagnosisId: diagnosis.id, status: 'rejected' })}>{t.gaps.reject}</Button>
            {diagnosis.merged && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ action: 'split', diagnosisId: diagnosis.id })}>{t.gaps.splitUnit}</Button>}
        </div>
        {step >= 3 && !diagnosis.stale && diagnosis.status === 'confirmed' && <GapPractice diagnosis={diagnosis} busy={busy} onAction={onAction} />}
    </article>;
}
