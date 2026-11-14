"use client";

import { TagInput } from "@/components/tag-input";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CorrectionDraft, UpdateDraft } from "./types";

interface TagFieldsProps {
    data: CorrectionDraft;
    onChange: UpdateDraft;
    subject?: string;
    gradeStage?: string;
}

/** 有逐题结果时分别校对，旧记录保留整份标签，避免把总标签误分给每一题。 */
export function TagFields({ data, onChange, subject, gradeStage }: TagFieldsProps) {
    const { t } = useLanguage();
    const entries = Object.entries(data.questionKnowledgePoints ?? {});
    const inputProps = { subject, gradeStage, placeholder: t.editor.tagsPlaceholder, enterHint: t.editor.createTagHint };
    const changeQuestionTags = (number: string, tags: string[]) => {
        const questionKnowledgePoints = { ...data.questionKnowledgePoints, [number]: tags };
        onChange({ questionKnowledgePoints, knowledgePoints: [...new Set(Object.values(questionKnowledgePoints).flat())] });
    };

    return (
        <details className="rounded-lg border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">{t.editor.grouping.tags.replace("{count}", String(data.knowledgePoints.length))}</summary>
            <div className="mt-3 space-y-4">
                {subject === "math" && <p className="text-sm text-muted-foreground">{t.editor.grouping.mathCurriculum}</p>}
                {entries.length > 0 ? entries.map(([number, tags]) => {
                    const label = t.editor.grouping.questionTags.replace("{number}", number);
                    return (
                        <div key={number} className="space-y-2">
                            <p className="text-sm font-medium">{label}</p>
                            <TagInput {...inputProps} ariaLabel={label} value={tags} maxTags={5} onChange={(value) => changeQuestionTags(number, value)} />
                        </div>
                    );
                }) : (
                    <TagInput {...inputProps} ariaLabel={t.editor.tags} value={data.knowledgePoints} maxTags={5} onChange={(knowledgePoints) => onChange({ knowledgePoints, questionKnowledgePoints: undefined })} />
                )}
                <p className="text-xs text-muted-foreground">{t.editor.tagsHint}</p>
            </div>
        </details>
    );
}
