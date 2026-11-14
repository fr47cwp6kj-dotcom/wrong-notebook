"use client";

import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getNumberedSections, replaceSectionBody } from "@/lib/correction-sections";

interface DraftFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    questionNumber?: string;
    onViewAll: () => void;
    compact?: boolean;
    placeholder?: string;
}

/** 单题只编辑对应正文；无法可靠匹配时引导查看全文，避免错配答案。 */
export function DraftField({ label, value, onChange, questionNumber, onViewAll, compact, placeholder }: DraftFieldProps) {
    const { t } = useLanguage();
    const sections = questionNumber ? getNumberedSections(value) : [];
    const matches = sections.filter(section => section.number === questionNumber);
    const section = matches.length === 1 ? matches[0] : undefined;
    const prefix = sections.length ? value.slice(0, sections[0].start).trim() : "";

    return (
        <div className="min-w-0 space-y-2">
            <Label>{label}</Label>
            {questionNumber && !section ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    <p>{value.trim() ? t.editor.grouping.unmatched : t.editor.grouping.empty}</p>
                    <Button type="button" variant="link" className="h-auto px-0 pb-0 pt-2" onClick={onViewAll}>{t.editor.grouping.viewAll}</Button>
                </div>
            ) : (
                <MarkdownEditor
                    key={questionNumber ?? "all"}
                    defaultMode="preview"
                    value={section?.body ?? value}
                    onChange={(next) => onChange(section ? replaceSectionBody(value, section, next) : next)}
                    previewMaxHeight={compact ? 240 : undefined}
                    className="min-h-40 font-mono text-sm"
                    aria-label={label}
                    placeholder={placeholder ?? t.editor.placeholder}
                />
            )}
            {questionNumber && prefix && (
                <details className="rounded-md border px-3 py-2 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">{t.editor.grouping.shared}</summary>
                    <div className="mt-2"><MarkdownRenderer content={prefix} /></div>
                    <Button type="button" variant="link" className="h-auto px-0 pb-0 pt-2" onClick={onViewAll}>{t.editor.grouping.viewAll}</Button>
                </details>
            )}
        </div>
    );
}
