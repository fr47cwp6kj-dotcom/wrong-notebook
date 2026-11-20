"use client";

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useLanguage } from '@/contexts/LanguageContext';
import type { GapCandidate } from '@/lib/knowledge-gaps';
import type { DiagnosisProps } from './diagnosis-card';

function PracticeItem({ practice, index, diagnosis, busy, onAction }: DiagnosisProps & { practice: GapCandidate['minimalPractice'][number]; index: number }) {
    const { t } = useLanguage();
    const [answer, setAnswer] = useState('');
    const [showAnswer, setShowAnswer] = useState(false);
    const requestId = useRef<string | null>(null);
    const latest = diagnosis.events.find(event => event.practiceIndex === index);
    return <div className="space-y-3 rounded border p-3">
        <MarkdownRenderer content={practice.question} />
        {!diagnosis.practiceReviewed ? <><MarkdownRenderer content={practice.answer} /><MarkdownRenderer content={practice.explanation} /></> : <>
            <label className="block text-sm">{t.gaps.answer}<textarea className="mt-1 w-full rounded border bg-background p-2" rows={3} value={answer} maxLength={4000} disabled={busy || showAnswer} onChange={e => { setAnswer(e.target.value); requestId.current = null; }} /></label>
            {!showAnswer && <Button size="sm" variant="outline" disabled={busy || !answer.trim()} onClick={() => setShowAnswer(true)}>{t.gaps.showAnswer}</Button>}
            {showAnswer && <div className="space-y-3"><MarkdownRenderer content={practice.answer} /><MarkdownRenderer content={practice.explanation} /><p className="text-xs text-muted-foreground">{t.gaps.recordHint}</p>
                <div className="flex flex-wrap gap-2">{(['correct', 'partial', 'incorrect'] as const).map(result => <Button key={result} size="sm" variant="outline" disabled={busy || !answer.trim()} onClick={async () => {
                    requestId.current ||= crypto.randomUUID();
                    if (await onAction({ action: 'practice', diagnosisId: diagnosis.id, practiceIndex: index, requestId: requestId.current, answer, result })) {
                        setAnswer(''); setShowAnswer(false); requestId.current = null;
                    }
                }}>{t.gaps[result]}</Button>)}</div>
            </div>}
        </>}
        {latest && <p className="text-xs text-muted-foreground">{t.gaps.recorded} · {t.gaps[latest.result as 'correct' | 'partial' | 'incorrect']} · {latest.answer}</p>}
    </div>;
}

export function GapPractice(props: DiagnosisProps) {
    const { t } = useLanguage();
    return <section className="space-y-3 border-t pt-4"><h4 className="font-medium">{t.gaps.practice}</h4>
        {!props.diagnosis.practiceReviewed && <p className="text-sm text-muted-foreground">{t.gaps.reviewHint}</p>}
        {props.diagnosis.candidate.minimalPractice.slice(0, 2).map((practice, index) => <PracticeItem key={index} practice={practice} index={index} {...props} />)}
        {!props.diagnosis.practiceReviewed && <Button disabled={props.busy} variant="outline" onClick={() => props.onAction({ action: 'approve_practice', diagnosisId: props.diagnosis.id })}>{t.gaps.reviewPractice}</Button>}
    </section>;
}
