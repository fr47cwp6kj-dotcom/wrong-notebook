import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchImportPanel } from '@/components/batch-import-panel';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { translations } from '@/lib/translations';
import type { AnalyzedQuestion, ImportedQuestion } from '@/lib/question-import';

const mocks = vi.hoisted(() => ({
    analyzeQuestionOnly: vi.fn(),
    saveParsedQuestion: vi.fn(),
}));

vi.mock('@/lib/question-import', () => ({
    analyzeQuestionOnly: mocks.analyzeQuestionOnly,
    saveParsedQuestion: mocks.saveParsedQuestion,
}));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { info: vi.fn(), error: vi.fn() } }));
// 校对编辑器与弹窗按行为 mock，聚焦批量面板自身的流程控制
vi.mock('@/components/correction-editor', () => ({
    CorrectionEditor: ({ initialData, onSave, onCancel }: { initialData: { questionText: string }; onSave: (data: unknown) => Promise<void>; onCancel: () => void }) => (
        <div>
            <button onClick={() => onSave({ ...initialData, questionText: 'edited' })}>mock-save</button>
            <button onClick={onCancel}>mock-cancel</button>
        </div>
    ),
}));
vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogContent: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// 测试只关心流程控制用的少数字段，其余必填字段省略，经 unknown 断言收窄
const parsed = { questionText: '第 9 题', answerText: '答案', analysis: '解析', subject: '数学', knowledgePoints: [], requiresImage: false } as unknown as AnalyzedQuestion['parsed'];
const imported: ImportedQuestion = { id: 'err-1', shortId: 'A1', subjectId: 'sub-1', notebookName: '数学', duplicate: false };
const blobs = [new Blob(['q1'], { type: 'image/jpeg' }), new Blob(['q2'], { type: 'image/jpeg' })];

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => 'blob:mock'),
        revokeObjectURL: vi.fn(),
    }));
    mocks.analyzeQuestionOnly.mockReset();
    mocks.analyzeQuestionOnly.mockImplementation(async (_file: Blob, options: { language: string }) => ({
        imageBase64: `data:image/jpeg;base64,${options.language}`,
        parsed,
    }));
    mocks.saveParsedQuestion.mockReset();
    mocks.saveParsedQuestion.mockResolvedValue(imported);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function renderPanel() {
    await act(async () => root.render(
        <LanguageProvider><BatchImportPanel blobs={blobs} subjectId="sub-1" onClose={onClose} /></LanguageProvider>,
    ));
}

/** 等待识别完成（runAll 的并发 worker 全部落定） */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const clickButton = (text: string) => act(async () => {
    const button = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes(text))!;
    button.click();
});

describe('批量导入校对流程', () => {
    it('识别完成后停在待确认，不会自动入库', async () => {
        await renderPanel();
        await settle();
        expect(mocks.analyzeQuestionOnly).toHaveBeenCalledTimes(2);
        expect(mocks.saveParsedQuestion).not.toHaveBeenCalled();
        expect(container.textContent).toContain(translations.zh.batchImport.status.review);
    });

    it('待确认时完成按钮禁用，全部确认后可完成', async () => {
        await renderPanel();
        await settle();
        const finish = () => Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent === translations.zh.batchImport.finish)!;
        expect(finish().disabled).toBe(true);
        await clickButton(translations.zh.batchImport.confirmAll);
        await settle();
        expect(mocks.saveParsedQuestion).toHaveBeenCalledTimes(2);
        expect(finish().disabled).toBe(false);
    });

    it('确认入库传递识别结果、错题本和图片', async () => {
        await renderPanel();
        await settle();
        await clickButton(translations.zh.batchImport.confirm);
        await settle();
        expect(mocks.saveParsedQuestion).toHaveBeenCalledWith(parsed, { subjectId: 'sub-1', imageUrl: 'data:image/jpeg;base64,zh' });
        expect(container.textContent).toContain(imported.notebookName!);
    });

    it('丢弃待确认题后不再出现', async () => {
        await renderPanel();
        await settle();
        const before = container.querySelectorAll('li').length;
        await clickButton(translations.zh.batchImport.discard);
        expect(container.querySelectorAll('li').length).toBe(before - 1);
        expect(container.textContent).toContain(translations.zh.batchImport.summary.replace('{done}', '0').replace('{total}', '1').replace('{review}', '1').replace('{failed}', '0'));
    });

    it('保存失败保留识别结果，可再次确认', async () => {
        mocks.saveParsedQuestion.mockRejectedValueOnce(new Error('保存失败'));
        await renderPanel();
        await settle();
        await clickButton(translations.zh.batchImport.confirm);
        await settle();
        expect(container.textContent).toContain(translations.zh.batchImport.status.failed);
        await clickButton(translations.zh.batchImport.confirm);
        await settle();
        expect(mocks.saveParsedQuestion).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain(imported.notebookName!);
    });

    it('编辑弹窗保存的是修改后的草稿', async () => {
        await renderPanel();
        await settle();
        await clickButton(translations.zh.batchImport.edit);
        await clickButton('mock-save');
        await settle();
        expect(mocks.saveParsedQuestion).toHaveBeenCalledWith(expect.objectContaining({ questionText: 'edited' }), expect.anything());
    });

    it('识别失败可重试', async () => {
        mocks.analyzeQuestionOnly.mockRejectedValueOnce(new Error('识别失败'));
        await renderPanel();
        await settle();
        expect(container.textContent).toContain(translations.zh.batchImport.status.failed);
        await clickButton(translations.zh.batchImport.retry);
        await settle();
        expect(mocks.analyzeQuestionOnly).toHaveBeenCalledTimes(3);
        expect(container.textContent).toContain(translations.zh.batchImport.status.review);
    });
});
