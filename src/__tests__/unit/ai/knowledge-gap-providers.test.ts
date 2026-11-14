import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gapFixture } from '../../fixtures/knowledge-gap';
import type { GapInput } from '@/lib/knowledge-gaps';

const mocks = vi.hoisted(() => ({ openai: vi.fn(), anthropic: vi.fn(), gemini: vi.fn() }));
vi.mock('openai', () => ({
    default: class { chat = { completions: { create: mocks.openai } }; },
    AzureOpenAI: class { chat = { completions: { create: mocks.openai } }; },
}));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mocks.anthropic }; } }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: mocks.gemini }; } }));
vi.mock('@/lib/minimax-code/auth', () => ({ withAccessToken: (call: (token: string) => Promise<unknown>) => call('test-only') }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() }) }));
import { OpenAIProvider } from '@/lib/ai/openai-provider';
import { AzureOpenAIProvider } from '@/lib/ai/azure-provider';
import { AnthropicProvider } from '@/lib/ai/anthropic-provider';
import { GeminiProvider } from '@/lib/ai/gemini-provider';
import { MiniMaxCodeProvider } from '@/lib/ai/minimax-code-provider';

const input: GapInput = { questionText: 'x + 2 = 5', wrongAnswerText: 'x = 7', answerText: 'x = 3', analysis: '等式变形', stage: 'junior_high', subject: 'math', language: 'zh', units: [] };
const result = { status: 'candidate_diagnosis', diagnoses: [gapFixture] };
beforeEach(() => {
    const text = JSON.stringify(result);
    mocks.openai.mockResolvedValue({ choices: [{ message: { content: text }, finish_reason: 'stop' }] });
    mocks.anthropic.mockResolvedValue({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
    mocks.gemini.mockResolvedValue({ text });
});
describe('所有提供商使用同一知识漏洞输出契约', () => {
    const providers = [
        ['OpenAI 兼容', () => new OpenAIProvider({ apiKey: 'test-only' })],
        ['Azure', () => new AzureOpenAIProvider({ apiKey: 'test-only', endpoint: 'https://example.test', deploymentName: 'test' })],
        ['Anthropic', () => new AnthropicProvider({ apiKey: 'test-only' })],
        ['Gemini', () => new GeminiProvider({ apiKey: 'test-only' })],
        ['MiniMax Code', () => new MiniMaxCodeProvider()],
    ] as const;
    for (const [name, create] of providers) it(name, async () => {
        expect(await create().diagnoseKnowledgeGaps(input)).toEqual(result);
    });
});
