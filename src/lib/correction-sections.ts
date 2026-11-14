export interface NumberedSection {
    number: string;
    start: number;
    bodyStart: number;
    bodyEnd: number;
    body: string;
    explicit: boolean;
}

interface CorrectionText {
    questionText: string;
    answerText: string;
    analysis: string;
}

/** 只认行首的大题编号；保留原文偏移，校对一题时不重写其他内容。 */
export function getNumberedSections(text: string): NumberedSection[] {
    const markers: Omit<NumberedSection, 'bodyEnd' | 'body'>[] = [];
    let fence: string | undefined;
    let mathEnd: string | undefined;
    for (const match of text.matchAll(/[^\n]+(?:\n|$)|\n/g)) {
        const line = match[0].replace(/\r?\n$/, '');
        const trimmed = line.trim();
        const codeFence = trimmed.match(/^(`{3,}|~{3,})/);
        if (codeFence) {
            if (!fence) fence = codeFence[1];
            else if (codeFence[1][0] === fence[0] && codeFence[1].length >= fence.length) fence = undefined;
            continue;
        }
        if (fence) continue;
        if (mathEnd) {
            if (trimmed.endsWith(mathEnd)) mathEnd = undefined;
            continue;
        }
        if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
            const end = trimmed.startsWith('$$') ? '$$' : '\\]';
            if (trimmed.length === 2 || !trimmed.endsWith(end)) mathEnd = end;
            continue;
        }
        const marker = line.match(/^(?:#{1,6}[ \t]+)?(?:\*\*|__)?(?:第[ \t]*(\d{1,3})[ \t]*题|(?:Question|Problem)[ \t]+(\d{1,3})\b|(\d{1,3})[ \t]*(?:[．、:：]|\.(?!\d)))(?:\*\*|__)?[ \t]*(?:[:：][ \t]*)?/i);
        if (!marker) continue;
        const start = match.index;
        const contentStart = start + marker[0].length;
        const leadingSpace = text.slice(contentStart).match(/^\r?\n/)?.[0].length ?? 0;
        markers.push({ number: String(Number(marker[1] || marker[2] || marker[3])), start, bodyStart: contentStart + leadingSpace, explicit: !!(marker[1] || marker[2]) });
    }
    return markers.map((marker, index) => {
        const end = markers[index + 1]?.start ?? text.length;
        const bodyEnd = Math.max(marker.bodyStart, end - (text.slice(marker.bodyStart, end).match(/\s*$/)?.[0].length ?? 0));
        return { ...marker, bodyEnd, body: text.slice(marker.bodyStart, bodyEnd) };
    });
}

/** 普通编号还须在答案中出现，避免把一题的条件列表误当成多题。 */
export function getCorrectionQuestionNumbers(data: CorrectionText): string[] {
    const questions = getNumberedSections(data.questionText);
    const numbers = questions.map(section => section.number);
    if (numbers.length < 2 || new Set(numbers).size !== numbers.length) return [];
    if (questions.every(section => section.explicit)) return numbers;
    const answers = getNumberedSections(data.answerText).map(section => section.number);
    if (new Set(answers).size !== answers.length || !numbers.every(number => answers.includes(number))) return [];
    return numbers;
}

export function replaceSectionBody(text: string, section: NumberedSection, value: string): string {
    const suffix = text.slice(section.bodyEnd);
    const separator = value && suffix && !/^\s/.test(suffix) ? (text.includes('\r\n') ? '\r\n' : '\n') : '';
    return text.slice(0, section.bodyStart) + value + separator + suffix;
}
