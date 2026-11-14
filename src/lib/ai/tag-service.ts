/**
 * 从数据库获取 AI 分析所需的标签
 * 替代原有的 getMathTagsByGrade 函数
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { MATH_CURRICULUM_PROFILE, ZHEJIANG_MATH_TAGS } from '@/lib/tag-data/math-zhejiang';
import type { CandidateTags, GradeLevel } from './types';
import { isGradeInStage, SUBJECT_DISPLAY_NAMES, type NotebookScope, type NotebookStage, type NotebookSubject } from '@/lib/notebook-scope';

const logger = createLogger('ai:tag-service');

export { MATH_CURRICULUM_PROFILE };

export async function getCurrentMathCurriculumTags(): Promise<string[]> {
    return [...ZHEJIANG_MATH_TAGS];
}

/**
 * 从数据库获取指定年级的数学标签
 * @param grade - 年级 (1-6:小学, 7-9:初中, 10-12:高中) 或 null
 * @returns 标签名称数组
 */
export async function getMathTagsFromDB(grade: GradeLevel | null, gradeSemester?: string | null): Promise<string[]> {
    const gradeToSemesterMap: Record<number, string[]> = {
        1: ['一年级'],
        2: ['二年级'],
        3: ['三年级'],
        4: ['四年级'],
        5: ['五年级'],
        6: ['六年级'],
        7: ['七年级上', '七年级下'],
        8: ['八年级上', '八年级下'],
        9: ['九年级上', '九年级下'],
        10: ['高一上', '高一下'],
        11: ['高二上', '高二下'],
        12: ['高三上', '高三下', '高三'],
    };

    // 指定学期时保留此前学期，但排除当前年级尚未学到的内容。
    const semesterNames: string[] = [];
    const scopedGrade = gradeSemester ? gradeFromSemester(gradeSemester) || grade : grade;
    const scopedSemester = gradeSemester ? semesterFromString(gradeSemester) : null;

    if (!scopedGrade) {
        // 无年级信息，返回初中和高中全部标签（与以往行为一致，不含小学）
        for (let g = 7; g <= 12; g++) {
            semesterNames.push(...gradeToSemesterMap[g]);
        }
    } else if (scopedGrade <= 6) {
        // 小学累进式：一年级到当前年级（含课内与课外拓展）
        for (let g = 1; g <= scopedGrade; g++) {
            semesterNames.push(...gradeToSemesterMap[g]);
        }
    } else if (scopedGrade >= 7 && scopedGrade <= 9) {
        // 初中累进式：当前年级及之前
        for (let g = 7; g <= scopedGrade; g++) {
            const semesters = gradeToSemesterMap[g] || [];
            semesterNames.push(...(g === scopedGrade && scopedSemester !== null ? semesters.slice(0, scopedSemester + 1) : semesters));
        }
    } else {
        // 高中累进式：从高一开始
        for (let g = 10; g <= scopedGrade; g++) {
            const semesters = gradeToSemesterMap[g] || [];
            semesterNames.push(...(g === scopedGrade && scopedSemester !== null ? semesters.slice(0, scopedSemester + 1) : semesters));
        }
    }

    try {
        // 获取所有顶层节点（年级学期）
        const topLevelTags = await prisma.knowledgeTag.findMany({
            where: {
                subject: 'math',
                parentId: null,
                name: { in: semesterNames },
            },
            select: { id: true },
        });

        const topLevelIds = topLevelTags.map(t => t.id);

        // 递归获取所有叶子节点标签
        const allTags = await prisma.knowledgeTag.findMany({
            where: {
                subject: 'math',
                isSystem: true,
            },
            select: {
                id: true,
                name: true,
                parentId: true,
            },
        });

        // 构建父子关系映射
        const childMap = new Map<string, string[]>();
        allTags.forEach(tag => {
            if (tag.parentId) {
                const children = childMap.get(tag.parentId) || [];
                children.push(tag.id);
                childMap.set(tag.parentId, children);
            }
        });

        // 递归收集所有后代ID
        const collectDescendants = (nodeId: string): string[] => {
            const children = childMap.get(nodeId) || [];
            if (children.length === 0) return [nodeId]; // 叶子节点
            return children.flatMap(cid => collectDescendants(cid));
        };

        // 收集所有目标年级的叶子节点
        const leafIds = new Set<string>();
        topLevelIds.forEach(id => {
            collectDescendants(id).forEach(leafId => leafIds.add(leafId));
        });

        // 获取叶子节点名称
        const tagNameMap = new Map(allTags.map(t => [t.id, t.name]));
        const result = Array.from(leafIds)
            .map(id => tagNameMap.get(id))
            .filter((name): name is string => !!name);

        return result;
    } catch (error) {
        logger.error({ error }, 'getMathTagsFromDB error');
        return [];
    }
}

function gradeFromSemester(value: string): GradeLevel | null {
    const text = value.toLowerCase();
    if (text.includes('初一') || text.includes('七年级') || /grade\s*7\b/.test(text)) return 7;
    if (text.includes('初二') || text.includes('八年级') || /grade\s*8\b/.test(text)) return 8;
    if (text.includes('初三') || text.includes('九年级') || /grade\s*9\b/.test(text)) return 9;
    if (text.includes('高一') || /grade\s*10\b/.test(text)) return 10;
    if (text.includes('高二') || /grade\s*11\b/.test(text)) return 11;
    if (text.includes('高三') || /grade\s*12\b/.test(text)) return 12;
    return null;
}

function semesterFromString(value: string): number | null {
    if (value.includes('上') || /1st|first/i.test(value)) return 0;
    if (value.includes('下') || /2nd|second/i.test(value)) return 1;
    return null;
}

/**
 * 从数据库获取指定学科的标签
 * @param subject - 学科 (math, physics, chemistry, english, etc.)
 * @returns 标签名称数组
 */
export async function getTagsFromDB(subject: string): Promise<string[]> {
    try {
        const tags = await prisma.knowledgeTag.findMany({
            where: {
                subject,
                isSystem: true,
                // 只获取叶子节点
                children: { none: {} },
            },
            select: { name: true },
            orderBy: { order: 'asc' },
        });

        return tags.map(t => t.name);
    } catch (error) {
        logger.error({ error }, 'getTagsFromDB error');
        return [];
    }
}

/**
 * 获取某学科、某学段下的全部知识点（该学段所有年级节点下的叶子标签，按名称去重，保持标签库顺序）
 */
export async function getScopeTagsFromDB(subject: NotebookSubject, stage: NotebookStage): Promise<string[]> {
    try {
        const tags = await prisma.knowledgeTag.findMany({
            where: { subject, isSystem: true },
            select: { id: true, name: true, parentId: true },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        });

        const children = new Map<string, typeof tags>();
        for (const tag of tags) {
            if (tag.parentId) {
                const list = children.get(tag.parentId) || [];
                list.push(tag);
                children.set(tag.parentId, list);
            }
        }

        const names = new Set<string>();
        const collect = (tag: (typeof tags)[number]) => {
            const kids = children.get(tag.id);
            if (!kids?.length) {
                names.add(tag.name);
                return;
            }
            kids.forEach(collect);
        };
        tags.filter((tag) => !tag.parentId && isGradeInStage(tag.name, stage)).forEach(collect);
        return Array.from(names);
    } catch (error) {
        logger.error({ error, subject, stage }, 'getScopeTagsFromDB error');
        return [];
    }
}

/** 数学采用用户指定教材，其余学科沿用错题本的学段范围。 */
export async function getNotebookCandidateTags(scope: NotebookScope): Promise<CandidateTags | undefined> {
    if (!scope.subject) return undefined;
    if (scope.subject === 'math') {
        return {
            subjectName: SUBJECT_DISPLAY_NAMES.math,
            curriculumLabel: MATH_CURRICULUM_PROFILE.label,
            gradeSemester: MATH_CURRICULUM_PROFILE.gradeSemester,
            tags: await getCurrentMathCurriculumTags(),
        };
    }
    return {
        subjectName: SUBJECT_DISPLAY_NAMES[scope.subject],
        tags: await getScopeTagsFromDB(scope.subject, scope.stage),
    };
}

/**
 * 未指定错题本时数学仍使用指定教材，其他学科沿用原范围。
 */
export async function prefetchSubjectTags(subject: string | null | undefined) {
    return {
        prefetchedMathTags: (subject === '数学' || !subject) ? await getCurrentMathCurriculumTags() : [],
        mathCurriculumLabel: (subject === '数学' || !subject) ? MATH_CURRICULUM_PROFILE.label : undefined,
        prefetchedPhysicsTags: (subject === '物理' || !subject) ? await getTagsFromDB('physics') : [],
        prefetchedChemistryTags: (subject === '化学' || !subject) ? await getTagsFromDB('chemistry') : [],
        prefetchedBiologyTags: (subject === '生物' || !subject) ? await getTagsFromDB('biology') : [],
        prefetchedEnglishTags: (subject === '英语' || !subject) ? await getTagsFromDB('english') : [],
    };
}
