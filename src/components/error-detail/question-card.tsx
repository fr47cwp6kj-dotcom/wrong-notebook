"use client";

import { useState } from "react";
import { Newspaper } from "lucide-react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { QuestionFigure } from "@/components/question-figure";
import { RegenerateFigureButton } from "@/components/regenerate-figure-button";
import { ReplaceQuestionImageButton } from "@/components/replace-question-image-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { EditButton, SaveCancelButtons, SectionHeader } from "./edit-controls";
import { QuestionMetadata } from "./question-metadata";
import { QuestionTags } from "./question-tags";
import { ToggleImage } from "./toggle-image";
import type { ErrorItemDetail, UpdateErrorItem } from "./types";
import { useEditableField } from "./use-editable-field";

interface QuestionCardProps {
    item: ErrorItemDetail;
    educationStage?: string;
    /** 保存字段到服务端并合并到页面状态，失败时抛出 */
    saveFields: (fields: Partial<ErrorItemDetail>) => Promise<void>;
    /** 只合并到页面状态（服务端已更新） */
    onUpdate: UpdateErrorItem;
    reload: () => Promise<void>;
    onEnlarge: (src: string) => void;
}

/** 题目卡片：题干与配图、知识点标签、题目信息和原图 */
export function QuestionCard({ item, educationStage, saveFields, onUpdate, reload, onEnlarge }: QuestionCardProps) {
    const { t } = useLanguage();
    const [showImage, setShowImage] = useState(true);
    const question = useEditableField({
        read: () => item.questionText,
        save: (questionText) => saveFields({ questionText }),
        logLabel: 'question',
    });
    // 整卷原图入口：点击后用全屏查看器翻看当时拍的整张试卷
    const viewPaperButton = item.paperImageUrl ? (
        <Button variant="outline" size="sm" onClick={() => item.paperImageUrl && onEnlarge(item.paperImageUrl)}>
            <Newspaper className="mr-2 h-4 w-4" />
            {t.detail.viewPaperImage || "View full paper"}
        </Button>
    ) : null;
    // AI 重绘配图可能有失真，提示以原图照片为准
    const figureNote = item.figureSvg ? (
        <p className="text-xs text-muted-foreground">{t.detail.figureNote || "The redrawn figure may differ from the original; refer to the original photo."}</p>
    ) : null;

    return (
        <Card>
            <CardHeader><SectionHeader title={<CardTitle>{t.detail.question}</CardTitle>} actions={!question.editing && <EditButton onClick={question.start} />} /></CardHeader>
            <CardContent className="space-y-4">
                {question.editing ? (
                    <div className="space-y-3">
                        <MarkdownEditor value={question.value} onChange={question.setValue} placeholder="Enter question text..." rows={8} className="w-full font-mono text-sm" />
                        <SaveCancelButtons onSave={question.submit} onCancel={question.cancel} />
                    </div>
                ) : item.originalImageUrl && showImage ? (
                    // 原图展开时图文并排，宽屏左右对照，窄屏上下排列
                    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                        <div className="min-w-0 space-y-4">
                            <MarkdownRenderer content={item.questionText} />
                            <QuestionFigure svg={item.figureSvg} />
                            {figureNote}
                        </div>
                        <div className="lg:sticky lg:top-4">
                            <ToggleImage
                                src={item.originalImageUrl}
                                alt={t.detail.originalProblem || "Original Problem"}
                                showLabel={t.replaceImage?.view || "View original image"}
                                hideLabel={t.replaceImage?.hide || "Hide original image"}
                                variant="outline"
                                visible={showImage}
                                onVisibleChange={setShowImage}
                                onEnlarge={onEnlarge}
                                imgClassName="max-h-[70vh] bg-muted object-contain"
                                actions={<>
                                    {viewPaperButton}
                                    <ReplaceQuestionImageButton
                                        errorItemId={item.id}
                                        hasImage={!!item.originalImageUrl}
                                        onDone={(originalImageUrl) => { onUpdate({ originalImageUrl }); setShowImage(true); }}
                                    />
                                    {item.originalImageUrl && <RegenerateFigureButton errorItemId={item.id} onDone={onUpdate} />}
                                </>}
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        <MarkdownRenderer content={item.questionText} />
                        <QuestionFigure svg={item.figureSvg} />
                        {figureNote}
                        <div className="pt-3">
                            <ToggleImage
                                src={item.originalImageUrl}
                                alt={t.detail.originalProblem || "Original Problem"}
                                showLabel={t.replaceImage?.view || "View original image"}
                                hideLabel={t.replaceImage?.hide || "Hide original image"}
                                variant="outline"
                                visible={showImage}
                                onVisibleChange={setShowImage}
                                onEnlarge={onEnlarge}
                                actions={<>
                                    {viewPaperButton}
                                    <ReplaceQuestionImageButton
                                        errorItemId={item.id}
                                        hasImage={!!item.originalImageUrl}
                                        onDone={(originalImageUrl) => { onUpdate({ originalImageUrl }); setShowImage(true); }}
                                    />
                                    {item.originalImageUrl && <RegenerateFigureButton errorItemId={item.id} onDone={onUpdate} />}
                                </>}
                            />
                        </div>
                    </>
                )}

                <QuestionTags item={item} educationStage={educationStage} onChanged={reload} />
                <QuestionMetadata item={item} onChanged={reload} />
            </CardContent>
        </Card>
    );
}
