import { apiClient } from "@/lib/api-client";
import { processImageFile } from "@/lib/image-utils";
import type { ParsedQuestion } from "@/lib/ai";
import type { AnalyzeResponse, UserProfile } from "@/types/api";

/** 导入成功后的题目摘要 */
export interface ImportedQuestion {
    id: string;
    shortId: string | null;
    subjectId: string | null;
    notebookName: string | null;
    duplicate?: boolean;
}

interface CreatedErrorItem {
    id: string;
    shortId?: string | null;
    subjectId?: string | null;
    subject?: { id: string; name: string } | null;
    duplicate?: boolean;
}

/** 读取用户的「导入前人工确认」偏好，读取失败时按默认值（不确认）处理 */
export async function fetchConfirmBeforeImport(): Promise<boolean> {
    try {
        const user = await apiClient.get<UserProfile>("/api/user");
        return !!user.confirmBeforeImport;
    } catch {
        return false;
    }
}

/** 调用 AI 识别一张图片中的题目 */
export async function analyzeQuestionImage(
    imageBase64: string,
    options: { language: 'zh' | 'en'; subjectId?: string | null; timeout?: number }
): Promise<AnalyzeResponse> {
    const data = await apiClient.post<AnalyzeResponse>("/api/analyze", {
        imageBase64,
        language: options.language,
        subjectId: options.subjectId || undefined,
    }, { timeout: options.timeout });
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid API response: data is null or not an object');
    }
    return data;
}

/**
 * 将识别结果（可含校对修改）保存为错题；未指定错题本时由服务端按学科匹配或新建错题本
 */
export async function saveParsedQuestion(
    parsed: ParsedQuestion & { gradeSemester?: string; paperLevel?: string; geogebraCommands?: string },
    options: { subjectId?: string | null; imageUrl?: string | null; paperImageUrl?: string | null }
): Promise<ImportedQuestion> {
    const created = await apiClient.post<CreatedErrorItem>("/api/error-items", {
        questionText: parsed.questionText,
        answerText: parsed.answerText,
        analysis: parsed.analysis,
        wrongAnswerText: parsed.wrongAnswerText || null,
        mistakeAnalysis: parsed.mistakeAnalysis || null,
        mistakeStatus: parsed.mistakeStatus || "unknown",
        knowledgePoints: parsed.knowledgePoints || [],
        questionKnowledgePoints: parsed.questionKnowledgePoints ?? null,
        difficultyStars: parsed.difficultyStars ?? null,
        hasFigure: parsed.hasFigure ?? false,
        figureSvg: parsed.figureSvg ?? null,
        gradeSemester: parsed.gradeSemester ?? null,
        paperLevel: parsed.paperLevel ?? null,
        geogebraCommands: parsed.geogebraCommands ?? null,
        subjectId: options.subjectId || undefined,
        subjectName: options.subjectId ? undefined : parsed.subject,
        originalImageUrl: options.imageUrl || "",
        paperImageUrl: options.paperImageUrl || undefined,
    });
    return {
        id: created.id,
        shortId: created.shortId ?? null,
        subjectId: created.subjectId ?? null,
        notebookName: created.subject?.name ?? null,
        duplicate: created.duplicate,
    };
}

/** analyzeQuestionOnly 的返回值：识别所用图片与 AI 解析结果 */
export interface AnalyzedQuestion {
    imageBase64: string;
    parsed: ParsedQuestion;
}

/**
 * 压缩（含小图放大）并识别一张题目图片，不保存（批量导入校对流程第一步）
 */
export async function analyzeQuestionOnly(
    file: Blob,
    options: { language: 'zh' | 'en'; subjectId?: string | null; timeout?: number }
): Promise<AnalyzedQuestion> {
    const imageBase64 = await processImageFile(file instanceof File ? file : new File([file], "question.jpg", { type: file.type || "image/jpeg" }));
    const parsed = await analyzeQuestionImage(imageBase64, options);
    return { imageBase64, parsed };
}
