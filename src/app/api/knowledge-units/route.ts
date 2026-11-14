import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { unauthorized, internalError } from '@/lib/api-errors';
import { summarizeUnitEvents } from '@/lib/knowledge-gaps';
import { gapDigest } from '@/lib/knowledge-gap-store';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api:knowledge-units');
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user || !user.isActive) return unauthorized();
        const units = await prisma.knowledgeUnit.findMany({ where: { userId: user.id }, include: { diagnoses: {
            where: { errorItem: { userId: user.id } }, include: { errorItem: { include: { subject: true } }, events: true },
        } }, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ units: units.map(({ diagnoses, ...unit }) => {
            const current = diagnoses.filter(d => d.status === 'confirmed' && d.practiceReviewed && d.sourceDigest === gapDigest(d.errorItem));
            const events = current.flatMap(d => d.events.map(e => ({ ...e, errorItemId: d.errorItemId })));
            const questions = [...new Map(diagnoses.map(d => [d.errorItemId, { id: d.errorItemId, shortId: d.errorItem.shortId, text: d.errorItem.questionText?.slice(0, 100), status: d.status }])).values()];
            return { ...unit, ...summarizeUnitEvents(events), questions };
        }) });
    } catch (error) {
        logger.error({ error }, '知识单元读取失败');
        return internalError('GAP_REQUEST_FAILED');
    }
}
