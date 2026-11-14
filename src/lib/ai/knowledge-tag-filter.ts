interface KnowledgeTagResult {
    knowledgePoints: string[];
    questionKnowledgePoints?: Record<string, string[]>;
}

/** 识别和重新解题共用过滤规则；无匹配时留空，不把总标签猜分给每题。 */
export function filterKnowledgeTags<T extends KnowledgeTagResult>(result: T, allowedTags: readonly string[]): T {
    const allowed = new Set(allowedTags);
    const filter = (tags: string[]) => [...new Set(tags.filter(tag => allowed.has(tag)))].slice(0, 5);
    const entries = Object.entries(result.questionKnowledgePoints ?? {});
    const questionKnowledgePoints = entries.length
        ? Object.fromEntries(entries.map(([number, tags]) => [number, filter(tags)]))
        : undefined;
    return {
        ...result,
        questionKnowledgePoints,
        knowledgePoints: questionKnowledgePoints
            ? [...new Set(Object.values(questionKnowledgePoints).flat())]
            : filter(result.knowledgePoints),
    };
}
