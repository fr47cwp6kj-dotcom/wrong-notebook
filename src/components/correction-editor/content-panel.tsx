"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { DraftField } from "@/components/correction-editor/draft-field";
import { MistakeFields } from "@/components/correction-editor/mistake-fields";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCorrectionQuestionNumbers } from "@/lib/correction-sections";
import type { CorrectionDraft, UpdateDraft } from "./types";

interface ContentPanelProps {
    data: CorrectionDraft;
    onChange: UpdateDraft;
    onReanswer: () => void;
    isReanswering: boolean;
}

/** 题号与内容分类独立切换，所有修改仍写回同一份完整草稿。 */
export function ContentPanel({ data, onChange, onReanswer, isReanswering }: ContentPanelProps) {
    const { t } = useLanguage();
    const numbers = getCorrectionQuestionNumbers(data);
    const [selected, setSelected] = useState<string | undefined>(undefined);
    const activeNumber = selected === "all" ? undefined : numbers.includes(selected ?? "") ? selected : numbers[0];
    const viewAll = () => setSelected("all");
    const fieldProps = { questionNumber: activeNumber, onViewAll: viewAll };

    return (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
            {numbers.length > 1 && (
                <div className="space-y-2 border-b p-4">
                    <p className="text-sm text-muted-foreground">{t.editor.grouping.count.replace("{count}", String(numbers.length))}</p>
                    <div role="group" aria-label={t.editor.grouping.byQuestion} className="flex flex-wrap gap-2">
                        {numbers.map(number => (
                            <Button key={number} type="button" size="sm" variant={activeNumber === number ? "default" : "outline"} aria-pressed={activeNumber === number} onClick={() => setSelected(number)}>
                                {t.editor.grouping.question.replace("{number}", number)}
                            </Button>
                        ))}
                        <Button type="button" size="sm" variant={!activeNumber ? "default" : "ghost"} aria-pressed={!activeNumber} onClick={viewAll}>{t.editor.grouping.all}</Button>
                    </div>
                </div>
            )}
            <Tabs defaultValue="question" className="p-3 sm:p-5">
                <TabsList aria-label={t.editor.grouping.byContent} className="mb-4 grid h-auto grid-cols-4">
                    <TabsTrigger value="question">{t.editor.grouping.questionTab}</TabsTrigger>
                    <TabsTrigger value="answer">{t.editor.grouping.answerTab}</TabsTrigger>
                    <TabsTrigger value="analysis">{t.editor.grouping.analysisTab}</TabsTrigger>
                    <TabsTrigger value="mistake">{t.editor.grouping.mistakeTab}</TabsTrigger>
                </TabsList>
                <TabsContent value="question" className="space-y-4">
                    <DraftField {...fieldProps} label={t.editor.question} value={data.questionText} onChange={(questionText) => onChange({ questionText })} />
                    <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                        <Button type="button" variant="outline" size="sm" onClick={onReanswer} disabled={isReanswering || !data.questionText.trim()}>
                            {isReanswering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            {isReanswering ? t.editor.reanswering : numbers.length > 1 ? t.editor.grouping.reanswerAll : t.editor.reanswer}
                        </Button>
                        <p className="text-xs text-muted-foreground">{t.editor.reanswerHint}</p>
                    </div>
                </TabsContent>
                <TabsContent value="answer">
                    <DraftField {...fieldProps} compact label={t.editor.answer} value={data.answerText} onChange={(answerText) => onChange({ answerText })} />
                </TabsContent>
                <TabsContent value="analysis">
                    <DraftField {...fieldProps} compact label={t.editor.analysis} value={data.analysis} onChange={(analysis) => onChange({ analysis })} />
                </TabsContent>
                <TabsContent value="mistake">
                    <MistakeFields data={data} onChange={onChange} questionNumber={activeNumber} onViewAll={viewAll} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
