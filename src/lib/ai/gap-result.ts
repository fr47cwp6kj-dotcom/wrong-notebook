import { GapResultSchema } from '../knowledge-gaps';
import { extractJsonObject } from './schema';

export function parseGapResult(text: string) {
    return GapResultSchema.parse(extractJsonObject(text));
}
