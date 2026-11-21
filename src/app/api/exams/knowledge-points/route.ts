import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { getCurrentMathCurriculumTags } from "@/lib/ai/tag-service";

const logger = createLogger('api:exams:knowledge-points');

/** 返回所选错题本已有知识点，以及对应学科的完整知识点库。 */
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });

        const ids = [...new Set(new URL(req.url).searchParams.getAll('subjectId')
            .flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean))];
        if (ids.length === 0) return NextResponse.json({ existing: [], all: [] });

        const subjects = await prisma.subject.findMany({
            where: { id: { in: ids }, userId: session.user.id },
            select: { id: true, subjectKey: true },
        });
        const ownedIds = subjects.map((subject) => subject.id);
        if (ownedIds.length === 0) return NextResponse.json({ existing: [], all: [] });

        const items = await prisma.errorItem.findMany({
            where: { userId: session.user.id, subjectId: { in: ownedIds } },
            select: { knowledgePoints: true, tags: { select: { name: true } } },
        });
        const existing = new Set<string>();
        for (const item of items) {
            for (const tag of item.tags) existing.add(tag.name.trim());
            if (!item.knowledgePoints) continue;
            try {
                const parsed: unknown = JSON.parse(item.knowledgePoints);
                if (Array.isArray(parsed)) {
                    for (const value of parsed) if (typeof value === 'string' && value.trim()) existing.add(value.trim());
                }
            } catch { /* 兼容旧数据中的非 JSON 标签文本 */ }
        }

        const subjectKeys = [...new Set(subjects.map((subject) => subject.subjectKey).filter((value): value is string => Boolean(value)))];
        const systemTags = subjectKeys.length > 0
            ? await prisma.knowledgeTag.findMany({
                where: { subject: { in: subjectKeys }, OR: [{ isSystem: true }, { userId: session.user.id }] },
                select: { name: true, parentId: true, id: true },
                orderBy: [{ order: 'asc' }, { name: 'asc' }],
            })
            : [];
        const all = new Set(systemTags.map((tag) => tag.name.trim()).filter(Boolean));
        if (subjectKeys.includes('math')) {
            for (const tag of await getCurrentMathCurriculumTags()) all.add(tag);
        }
        for (const tag of existing) all.add(tag);

        return NextResponse.json({
            existing: [...existing].sort((a, b) => a.localeCompare(b, 'zh-CN')),
            all: [...all].sort((a, b) => a.localeCompare(b, 'zh-CN')),
        });
    } catch (error) {
        logger.error({ error }, 'Error loading exam knowledge points');
        return NextResponse.json({ message: 'Failed to load knowledge points' }, { status: 500 });
    }
}
