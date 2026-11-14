"use client";

import { DraftField } from "@/components/correction-editor/draft-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MistakeStatus } from "@/lib/mistake-status";
import type { CorrectionDraft, UpdateDraft } from "./types";

interface MistakeFieldsProps {
    data: CorrectionDraft;
    onChange: UpdateDraft;
    questionNumber?: string;
    onViewAll: () => void;
}

/** 作答状态、错误解答原文与错因分析；填写错误解答时作答状态自动改为做错了 */
export function MistakeFields({ data, onChange, questionNumber, onViewAll }: MistakeFieldsProps) {
    const { t } = useLanguage();

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>{questionNumber ? t.editor.grouping.statusAll : t.editor.mistakeStatus}</Label>
                <Select value={data.mistakeStatus || "unknown"} onValueChange={(val) => onChange({ mistakeStatus: val as MistakeStatus })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="not_attempted">{t.editor.mistakeStatuses?.notAttempted || "Not attempted"}</SelectItem>
                        <SelectItem value="wrong_attempt">{t.editor.mistakeStatuses?.wrongAttempt || "Wrong attempt"}</SelectItem>
                        <SelectItem value="unknown">{t.editor.mistakeStatuses?.unknown || "Unknown"}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <DraftField
                label={t.editor.wrongAnswerText}
                questionNumber={questionNumber}
                onViewAll={onViewAll}
                compact
                value={data.wrongAnswerText || ""}
                onChange={(value) => onChange({ wrongAnswerText: value, mistakeStatus: value.trim() ? "wrong_attempt" : data.mistakeStatus })}
                placeholder={t.editor.wrongAnswerPlaceholder || "Leave blank if no wrong answer is visible"}
            />
            <DraftField
                label={t.editor.mistakeAnalysis}
                questionNumber={questionNumber}
                onViewAll={onViewAll}
                compact
                value={data.mistakeAnalysis || ""}
                onChange={(value) => onChange({ mistakeAnalysis: value })}
                placeholder={t.editor.mistakeAnalysisPlaceholder || "Explain where and why the mistake happened"}
            />
        </div>
    );
}
