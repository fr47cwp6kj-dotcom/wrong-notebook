/**
 * 不调用 AI 的本地判题：只在能确定答案相同时返回 true，其余情况返回 null，交给 AI 或用户判定。
 * 本地无法可靠判断"错误"（等价写法、多个答案等），因此从不返回 false。
 */

// 去掉"答案是""答："等前缀，只比较结论
const ANSWER_PREFIX = /^(?:答案?(?:是|为)?|解|answer(?: is)?|the answer is)[:：]?/i;
// 选择题答案：大写选项字母后接分隔符或结束，如 "B"、"B. 3"、"(B)"、"AC"；区分大小写，避免把英文单词当成选项
const CHOICE_ANSWER = /^\(?([A-H]{1,4})\)?(?:$|[.、:：)]|\s+(?![a-zA-Z]))/;

/** 比较最终数值：允许 AI 一方保留变量名或省略单位，但不把不同单位视为相同。 */
function terminalNumber(value: string): { value: number; unit: string } | null {
    const match = value.match(/^(?:[a-z]+=?)*(-?\d+(?:\.\d+)?)([a-z%°]*)$/i);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isFinite(number) ? { value: number, unit: match[2] } : null;
}

export function normalizeAnswer(value: string): string {
    return value
        // 全角字母、数字、符号转半角
        .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
        .replace(/　/g, ' ')
        .replace(/\$|\\\(|\\\)|\\\[|\\\]/g, '')
        .replace(/\\(?:text|mathrm)\{([^}]*)\}/g, '$1')
        .replace(/[\s。.，,；;！!]+$/g, '')
        .trim()
        .replace(ANSWER_PREFIX, '')
        .replace(/\s+/g, '')
        .toLowerCase();
}

export function matchAnswer(userAnswer: string, correctAnswer: string): true | null {
    const user = normalizeAnswer(userAnswer);
    const correct = normalizeAnswer(correctAnswer);
    if (!user || !correct) return null;
    if (user === correct) return true;

    // 例如“BD = 10cm”与“10 cm”：复核模型常省略变量名或单位，数值和已写出的单位不冲突即可视为同一结论。
    const userNumber = terminalNumber(user);
    const correctNumber = terminalNumber(correct);
    if (userNumber && correctNumber && Math.abs(userNumber.value - correctNumber.value) < 1e-10
        && (!userNumber.unit || !correctNumber.unit || userNumber.unit === correctNumber.unit)) return true;

    // 选择题：学生只填选项字母时，与标准答案开头的选项字母比较（不区分顺序）
    const choice = correctAnswer.trim().replace(ANSWER_PREFIX, '').trim().match(CHOICE_ANSWER);
    const userLetters = user.replace(/^\((.*)\)$/, '$1');
    if (choice && /^[a-h]{1,4}$/.test(userLetters)) {
        const sorted = (letters: string) => [...letters.toLowerCase()].sort().join('');
        return sorted(userLetters) === sorted(choice[1]) ? true : null;
    }
    return null;
}
