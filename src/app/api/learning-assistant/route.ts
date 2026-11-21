import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAIService } from "@/lib/ai";
import { unauthorized, validationError, internalError, notFound } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({ message: z.string().min(1).max(4000), pathname: z.string().max(300), errorItemId: z.string().optional(), pageContext: z.string().max(50000).nullable().optional() });

/** V1 学习助手：复用所有现有渠道均支持的解析能力，约束为苏格拉底式下一步。 */
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return validationError("Invalid assistant request", parsed.error.issues);
    try {
        let questionContext = '';
        if (parsed.data.errorItemId) {
            const item = await prisma.errorItem.findUnique({ where: { id: parsed.data.errorItemId }, select: { userId: true, questionText: true, answerText: true, analysis: true, wrongAnswerText: true, mistakeAnalysis: true } });
            if (!item || item.userId !== session.user.id) return notFound('Item not found');
            questionContext = `\n当前题目：${item.questionText || '无文字题干'}\n标准答案：${item.answerText || '未提供'}\n解析：${item.analysis || '未提供'}\n学生原作答：${item.wrongAnswerText || '未提供'}\n已有诊断：${item.mistakeAnalysis || '未提供'}`;
        }
        const transientContext = parsed.data.pageContext ? `\n本次练习的临时上下文（仅本次使用）：${parsed.data.pageContext}` : '';
        const context = `你是学习助手。不要直接代做整题。先指出学生下一步该做什么，最多提出一个追问；学生说不会时，把任务拆成一个最小步骤。当前页面：${parsed.data.pathname}${questionContext}${transientContext}\n学生的问题：${parsed.data.message}`;
        const result = await getAIService().reanswerQuestion(context, 'zh');
        return NextResponse.json({ answer: result.analysis || result.answerText });
    } catch (error) { return internalError(error instanceof Error ? error.message : "Assistant failed"); }
}
