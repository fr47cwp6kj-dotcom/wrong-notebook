"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { GAP_TYPES } from '@/lib/knowledge-gaps';
import type { GapCandidate } from '@/lib/knowledge-gaps';

const empty = { unitName: '', triggerRule: '', boundary: '', surfaceReason: '', firstStuckStep: '', unusedSignal: '', hypothesis: '', evidenceQuote: '', questionForStudent: '', practiceQuestion: '', practiceAnswer: '', practiceExplanation: '' };
type UnitOption = { id: string; name: string; triggerRule: string; boundary: string; stage: string; subject: string };

export function ManualGapForm({ busy, onSave }: { busy: boolean; onSave: (candidate: GapCandidate) => Promise<void> }) {
    const { t } = useLanguage();
    const [fields, setFields] = useState(empty);
    const [gapType, setGapType] = useState<GapCandidate['gapType']>('unit_connection_missing');
    const [evidenceSource, setEvidenceSource] = useState<GapCandidate['evidenceSource']>('wrongAnswerText');
    const [units, setUnits] = useState<UnitOption[]>([]);
    useEffect(() => { apiClient.get<{ units: UnitOption[] }>('/api/knowledge-units').then(data => setUnits(data.units)).catch(() => undefined); }, []);
    return <form className="space-y-4 rounded-lg border p-4" onSubmit={async e => {
        e.preventDefault();
        await onSave({
            unitName: fields.unitName, triggerRule: fields.triggerRule, boundary: fields.boundary,
            surfaceReason: fields.surfaceReason, firstStuckStep: fields.firstStuckStep, unusedSignal: fields.unusedSignal,
            hypothesis: fields.hypothesis, evidenceQuote: fields.evidenceQuote, evidenceSource, gapType,
            questionsToStudent: [fields.questionForStudent],
            minimalPractice: [{ type: 'unit_drill', question: fields.practiceQuestion, answer: fields.practiceAnswer, explanation: fields.practiceExplanation }],
        });
    }}>
        <p className="text-sm text-muted-foreground">{t.gaps.manualHint}</p>
        <label className="block text-sm">{t.gaps.chooseUnit}<select className="mt-1 w-full rounded border bg-background p-2" defaultValue="" onChange={e => {
            const unit = units.find(u => u.id === e.target.value);
            if (unit) setFields(current => ({ ...current, unitName: unit.name, triggerRule: unit.triggerRule, boundary: unit.boundary }));
        }}><option value="">{t.gaps.newUnit}</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name} · {unit.stage} · {unit.subject}</option>)}</select></label>
        <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(empty) as Array<keyof typeof empty>).map(key => <label key={key} className="block text-sm">{t.gaps[key]}
                <textarea className="mt-1 w-full rounded border bg-background p-2" rows={2} maxLength={key === 'unitName' ? 120 : 2000} required={!['firstStuckStep', 'unusedSignal'].includes(key)} value={fields[key]} onChange={e => setFields(current => ({ ...current, [key]: e.target.value }))} />
            </label>)}
            <label className="text-sm">{t.gaps.gapType}<select className="mt-1 w-full rounded border bg-background p-2" value={gapType} onChange={e => setGapType(e.target.value as GapCandidate['gapType'])}>{GAP_TYPES.map(type => <option key={type} value={type}>{t.gaps.gapTypes[type]}</option>)}</select></label>
            <label className="text-sm">{t.gaps.evidenceSource}<select className="mt-1 w-full rounded border bg-background p-2" value={evidenceSource} onChange={e => setEvidenceSource(e.target.value as GapCandidate['evidenceSource'])}><option value="wrongAnswerText">{t.gaps.wrongAnswerText}</option><option value="questionText">{t.gaps.questionText}</option></select></label>
        </div>
        <Button type="submit" disabled={busy || !(fields.firstStuckStep.trim() || fields.unusedSignal.trim())}>{t.gaps.save}</Button>
    </form>;
}
