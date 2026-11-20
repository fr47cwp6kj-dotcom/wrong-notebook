import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAIService } from "@/lib/ai";
import { getCurrentUser } from "@/lib/current-user";
import { unauthorized, notFound, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { trackBackgroundTask, describeQuestion } from "@/lib/background-tasks";
import { consumeAiQuota } from "@/lib/ai-quota";
import { normalizeMistakeStatusForSave } from "@/lib/mistake-status";

const logger = createLogger('api:error-items:wrong-answer-recognize');

/**
 * POST /api/error-items/:id/wrong-answer-recognize
 * 上传作答区域照片，AI 摘录学生手写作答并保存为错误解答原文；
 * 图片同时保存为错答图片，识别到作答时作答状态改为做错了。
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const user = await getCurrentUser();
        if (!user) {
            return unauthorized("Authentication required");
        }

        const item = await prisma.errorItem.findUnique({
            where: { id },
            select: { userId: true, shortId: true, questionText: true, mistakeStatus: true },
        });
        if (!item || item.userId !== user.id) {
            return notFound("Item not found");
        }

        const body = await req.json().catch(() => ({}));
        const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : '';
        // 支持完整 data URL 或纯 base64
        const dataUrlMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
        const mimeType = dataUrlMatch?.[1] ?? 'image/jpeg';
        const rawBase64 = dataUrlMatch?.[2] ?? imageBase64;
        if (!rawBase64.trim()) {
            return badRequest("NO_IMAGE");
        }

        const limited = await consumeAiQuota(user, 'analyze');
        if (limited) return limited;

        const result = await trackBackgroundTask(
            { userId: user.id, kind: 'analyze', subject: describeQuestion(item), link: `/error-items/${id}` },
            () => getAIService().recognizeWrongAnswer(rawBase64, mimeType, item.questionText)
        );

        const recognized = result.wrongAnswerText.trim();
        const updated = await prisma.errorItem.update({
            where: { id },
            data: {
                wrongAnswerImageUrl: `data:${mimeType};base64,${rawBase64}`,
                ...(recognized ? {
                    wrongAnswerText: recognized,
                    mistakeStatus: normalizeMistakeStatusForSave('wrong_attempt', recognized),
                } : {}),
            },
            select: { wrongAnswerText: true, wrongAnswerImageUrl: true, mistakeStatus: true },
        });
        logger.info({ errorItemId: id, recognizedLength: recognized.length }, 'Wrong answer recognized');
        return NextResponse.json(updated);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Error recognizing wrong answer');
        return internalError(message.startsWith('AI_') ? message.split(':')[0] : "Failed to recognize wrong answer");
    }
}
