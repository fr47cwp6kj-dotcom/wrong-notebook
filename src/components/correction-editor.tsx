"use client";

import { useState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import { MetaFields } from "@/components/correction-editor/meta-fields";
import { ContentPanel } from "@/components/correction-editor/content-panel";
import { TagFields } from "@/components/correction-editor/tag-fields";
import { QuestionFigure } from "@/components/question-figure";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import { calculateGrade } from "@/lib/grade-calculator";
import { inferSubjectFromName } from "@/lib/knowledge-tags";
import { normalizeMistakeStatusForSave } from "@/lib/mistake-status";
import { getDefaultPaperLevel } from "@/lib/paper-level";
import { getReanswerErrorMessage } from "@/lib/reanswer-error";
import { buildReanswerRequestBody } from "@/lib/reanswer-request";
import type { CorrectionDraft } from "@/components/correction-editor/types";
import type { ReanswerQuestionResult } from "@/lib/ai/types";
import type { Notebook, UserProfile } from "@/types/api";

interface CorrectionEditorProps {
    initialData: CorrectionDraft;
    onSave: (data: CorrectionDraft) => Promise<void>;
    onCancel: () => void;
    imagePreview?: string | null;
    initialSubjectId?: string;
    aiTimeout?: number;
}

/** AI 识别后的校对页：按题号与内容分类预览，确认后保存到错题本。 */
export function CorrectionEditor({ initialData, onSave, onCancel, imagePreview, initialSubjectId, aiTimeout }: CorrectionEditorProps) {
    const { timeZone } = useTimeZone();
    const { t, language } = useLanguage();
    const [data, setData] = useState<CorrectionDraft>({
        ...initialData,
        wrongAnswerText: initialData.wrongAnswerText || "",
        mistakeAnalysis: initialData.mistakeAnalysis || "",
        mistakeStatus: initialData.mistakeStatus || "unknown",
        subjectId: initialSubjectId,
        gradeSemester: "",
    });
    const update = (fields: Partial<CorrectionDraft>) => setData(prev => ({ ...prev, ...fields }));
    // 未手工选卷时随星级更新默认值，手工选择后优先保留。
    const paperLevel = data.paperLevel ?? getDefaultPaperLevel(data.difficultyStars) ?? "a";
    const [isReanswering, setIsReanswering] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [educationStage, setEducationStage] = useState<string | undefined>(undefined);
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);

    // 加载错题本（推断知识点学科）和用户信息（计算当前年级）
    useEffect(() => {
        apiClient.get<Notebook[]>("/api/notebooks")
            .then(setNotebooks)
            .catch(err => frontendLogger.error('[CorrectionEditor]', 'Failed to fetch notebooks', { error: err }));

        apiClient.get<UserProfile>("/api/user")
            .then(user => {
                if (user && user.educationStage && user.enrollmentYear) {
                    const grade = calculateGrade(user.educationStage, user.enrollmentYear, new Date(), language, timeZone);
                    setData(prev => ({ ...prev, gradeSemester: grade }));
                    setEducationStage(user.educationStage);
                }
            })
            .catch(err => frontendLogger.error('[CorrectionEditor]', 'Failed to fetch user info for grade calculation', { error: err }));
    }, [language, timeZone]);

    // 按修正后的题目重新解题
    const handleReanswer = async () => {
        if (!data.questionText.trim()) {
            toast.warning(t.editor.enterQuestionFirst || 'Please enter question text first');
            return;
        }

        setIsReanswering(true);
        try {
            const requestBody = buildReanswerRequestBody({
                questionText: data.questionText,
                language,
                subject: data.subject,
                imagePreview,
                gradeSemester: data.gradeSemester,
                subjectId: data.subjectId,
            });
            frontendLogger.info('[Reanswer]', requestBody.imageBase64 ? 'Sending image + text (image available for mistake analysis)' : 'Sending text only (no image available)', { timeout: aiTimeout });

            const result = await apiClient.post<ReanswerQuestionResult>("/api/reanswer", requestBody, { timeout: aiTimeout || 180000 });
            setData(prev => ({
                ...prev,
                answerText: result.answerText,
                analysis: result.analysis,
                knowledgePoints: result.knowledgePoints,
                questionKnowledgePoints: result.questionKnowledgePoints,
                wrongAnswerText: result.wrongAnswerText || "",
                mistakeAnalysis: result.mistakeAnalysis || "",
                mistakeStatus: normalizeMistakeStatusForSave(result.mistakeStatus, result.wrongAnswerText),
                // 重新解题给出星级时更新，否则保留原星级
                difficultyStars: result.difficultyStars ?? prev.difficultyStars,
            }));
            toast.success(t.editor.reanswerSuccess || '✅ Answer and analysis updated!');
        } catch (error) {
            frontendLogger.error('[CorrectionEditor]', 'Reanswer failed', { error });
            toast.error(getReanswerErrorMessage(error, t));
        } finally {
            setIsReanswering(false);
        }
    };

    const handleSave = async () => {
        if (!data.subjectId) {
            toast.warning(t.editor.messages?.selectNotebook || "Please select a notebook");
            return;
        }
        if (isSaving) return; // 防止重复点击
        setIsSaving(true);
        try {
            await onSave({ ...data, paperLevel, mistakeStatus: normalizeMistakeStatusForSave(data.mistakeStatus, data.wrongAnswerText) });
        } finally {
            setIsSaving(false);
        }
    };

    const notebook = notebooks.find(n => n.id === data.subjectId);
    const tagSubject = notebook?.subjectKey || inferSubjectFromName(notebook?.name || null) || inferSubjectFromName(data.subject || null) || undefined;

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold">{t.editor.title}</h2>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onCancel}>
                        {t.editor.cancel}
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? (t.common?.pleaseWait || "Please wait...") : t.editor.save}
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetaFields data={data} paperLevel={paperLevel} onChange={update} />
            </div>

            <ContentPanel data={data} onChange={update} onReanswer={handleReanswer} isReanswering={isReanswering} />

            <div className="space-y-3">
                {(imagePreview || data.figureSvg) && (
                    <details className="rounded-lg border bg-card p-4">
                        <summary className="cursor-pointer text-sm font-medium">{t.editor.grouping.images}</summary>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            {imagePreview && <img src={imagePreview} alt={t.editor.grouping.images} className="max-h-96 w-full rounded-md object-contain" />}
                            <QuestionFigure svg={data.figureSvg} />
                        </div>
                    </details>
                )}
                <TagFields data={data} onChange={update} subject={tagSubject} gradeStage={notebook?.stage || educationStage} />

            </div>
        </div>
    );
}
