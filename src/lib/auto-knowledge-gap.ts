import type { User } from '@prisma/client';
import { getAIService } from '@/lib/ai';
import { consumeAiQuota } from '@/lib/ai-quota';
import { GapResultSchema } from '@/lib/knowledge-gaps';
import { gapDigest, saveGap } from '@/lib/knowledge-gap-store';
import { prisma } from '@/lib/prisma';

interface DiagnosableInput {
    questionText: string | null | undefined;
    wrongAnswerText: string | null | undefined;
}

export type AutoKnowledgeGapStatus = 'created' | 'already_exists' | 'needs_evidence' | 'rate_limited';

/** 只有学生留下原始错答时才允许自动归纳，避免 AI 仅凭题目猜测漏洞。 */
export function shouldAutoDiagnoseKnowledgeGap(input: DiagnosableInput): boolean {
    return Boolean(input.questionText?.trim() && input.wrongAnswerText?.trim());
}

/**
 * 新错题保存后自动生成候选知识单元。失败不会影响错题本身入库，
 * 候选仍需要后续追问或练习证据确认，不能直接当作学生已掌握/未掌握的事实。
 */
export async function autoGenerateKnowledgeGap(user: Pick<User, 'id' | 'role' | 'educationStage'>, errorItemId: string): Promise<AutoKnowledgeGapStatus> {
    const item = await prisma.errorItem.findFirst({
        where: { id: errorItemId, userId: user.id },
        include: { subject: true },
    });
    if (!item || !shouldAutoDiagnoseKnowledgeGap(item)) return 'needs_evidence';

    const sourceDigest = gapDigest(item);
    const existing = await prisma.gapDiagnosis.findFirst({ where: { errorItemId: item.id, sourceDigest }, select: { id: true } });
    if (existing) return 'already_exists';

    const limited = await consumeAiQuota(user, 'analyze');
    if (limited) return 'rate_limited';

    const scope = {
        stage: item.subject?.stage || user.educationStage || 'unknown',
        subject: item.subject?.subjectKey || item.subject?.name || 'unknown',
    };
    const units = await prisma.knowledgeUnit.findMany({
        where: { userId: user.id, ...scope },
        select: { name: true, triggerRule: true, boundary: true },
        take: 50,
        orderBy: { createdAt: 'desc' },
    });
    const result = GapResultSchema.parse(await getAIService().diagnoseKnowledgeGaps({
        questionText: item.questionText || '',
        wrongAnswerText: item.wrongAnswerText || '',
        answerText: item.answerText || '',
        analysis: item.analysis || '',
        ...scope,
        language: 'zh',
        units,
        imageDataUrl: item.originalImageUrl || undefined,
    }));
    if (result.status === 'needs_more_information') return 'needs_evidence';

    await prisma.$transaction(async tx => {
        const current = await tx.errorItem.findFirst({ where: { id: item.id, userId: user.id }, include: { subject: true } });
        if (!current || gapDigest(current) !== sourceDigest) return;
        const duplicate = await tx.gapDiagnosis.findFirst({ where: { errorItemId: item.id, sourceDigest }, select: { id: true } });
        if (duplicate) return;
        for (const candidate of result.diagnoses) await saveGap(tx, current, scope, candidate, 'ai');
    });
    return 'created';
}
