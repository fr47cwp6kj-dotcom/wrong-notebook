import type { ParsedQuestion } from "@/lib/ai";

/** 校对页编辑中的题目：AI 识别结果加上归属错题本、年级学期和卷别 */
export interface CorrectionDraft extends ParsedQuestion {
    subjectId?: string;
    gradeSemester?: string;
    paperLevel?: string;
    geogebraCommands?: string;
}

export type UpdateDraft = (fields: Partial<CorrectionDraft>) => void;
