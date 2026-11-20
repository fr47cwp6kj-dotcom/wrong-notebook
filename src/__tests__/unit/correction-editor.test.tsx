import { act } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrectionEditor } from '@/components/correction-editor';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { translations } from '@/lib/translations';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(async (url: string) => url === '/api/notebooks' ? [] : {}), post: vi.fn() } }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/notebook-selector', () => ({ NotebookSelector: () => null }));
vi.mock('@/components/markdown-renderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <span>{content}</span> }));
vi.mock('@/components/geogebra-demo', () => ({ GeogebraDemo: () => null }));
vi.mock('@/components/ui/select', () => ({
    Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
    SelectTrigger: () => null,
    SelectValue: () => null,
}));

let container: HTMLDivElement;
let root: Root;
const onSave = vi.fn(async () => undefined);

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function renderEditor(extra: Partial<ComponentProps<typeof CorrectionEditor>['initialData']> = {}) {
    await act(async () => root.render(
        <LanguageProvider><CorrectionEditor initialData={{
            questionText: '求和', answerText: '4', analysis: '解析', subject: '数学', knowledgePoints: [], requiresImage: false,
            wrongAnswerText: '', mistakeAnalysis: '', mistakeStatus: 'unknown', ...extra,
        }} initialSubjectId="math" onSave={onSave} onCancel={() => undefined} /></LanguageProvider>,
    ));
}
const paperSelect = () => Array.from(container.querySelectorAll('select')).find((select) => select.querySelector('option[value="other"]'))!;
const clickStar = (stars: number) => act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="设为 ${stars} 星"]`)!.click());
const clickButton = (text: string) => act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(text))!.click());
const selectPaper = (value: string) => act(async () => {
    const select = paperSelect();
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
});

describe('校对页的默认卷别与手工覆盖', () => {
    it.each([[1, 'a'], [2, 'a'], [3, 'a'], [4, 'b'], [5, 'b']] as const)('%i 星校对题默认显示并保存为 %s 卷', async (difficultyStars, paperLevel) => {
        await renderEditor({ difficultyStars });
        expect(paperSelect().value).toBe(paperLevel);
        await clickButton(translations.zh.editor.save);
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ paperLevel, difficultyStars }));
    });

    it('未手工选卷时，修改星级会更新默认卷别', async () => {
        await renderEditor({ difficultyStars: 3 });
        await clickStar(4);
        expect(paperSelect().value).toBe('b');
        await clickStar(2);
        expect(paperSelect().value).toBe('a');
    });

    it('手工改为 A 卷后，再修改星级仍保留手工选择', async () => {
        await renderEditor({ difficultyStars: 4 });
        await selectPaper('a');
        await clickStar(5);
        expect(paperSelect().value).toBe('a');
        await clickButton(translations.zh.editor.save);
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ paperLevel: 'a', difficultyStars: 5 }));
    });

    it('重新解题补评星级会更新默认卷别，手工选择「其他」后保留', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ answerText: '4', analysis: '解析', knowledgePoints: [], mistakeStatus: 'unknown', difficultyStars: 5 });
        await renderEditor();
        await clickButton(translations.zh.editor.reanswer);
        expect(paperSelect().value).toBe('b');
        await selectPaper('other');
        await clickButton(translations.zh.editor.reanswer);
        expect(paperSelect().value).toBe('other');
    });
});

describe('校对页分类查看与编辑', () => {
    const grouping = translations.zh.editor.grouping;
    const selectTab = (name: string) => act(async () => {
        const button = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(item => item.textContent === name)!;
        button.focus();
        button.click();
    });

    it('逐题预览并编辑答案，切换分类和题号后保存仍包含所有题目', async () => {
        const questionText = '15. 第一题\n\n16. 第二题';
        const analysis = '**15.**\n第一题推导\n\n**16.**\n第二题推导';
        await renderEditor({ questionText, answerText: '15. 甲\n\n16. 乙', analysis });
        expect(container.textContent).toContain('第一题');
        expect(container.textContent).not.toContain('第二题');
        expect(container.querySelector('textarea')).toBeNull();

        await clickButton(grouping.question.replace('{number}', '16'));
        await selectTab(grouping.answerTab);
        await selectTab(translations.zh.markdownEditor.source);
        const editor = container.querySelector('textarea')!;
        expect(editor.value).toBe('乙');
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, '修正答案');
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await selectTab(grouping.analysisTab);
        expect(container.textContent).toContain('第二题推导');
        expect(container.textContent).not.toContain('第一题推导');
        await clickButton(grouping.question.replace('{number}', '15'));
        expect(container.textContent).toContain('第一题推导');
        expect(container.textContent).not.toContain('第二题推导');

        await clickButton(translations.zh.editor.save);
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ questionText, analysis, answerText: '15. 甲\n\n16. 修正答案' }));
    });

    it('没有可匹配题号的解析通过全文入口查看，不误归到当前题', async () => {
        await renderEditor({ questionText: '第1题\n甲\n第2题\n乙', analysis: '两题共用的解题提示' });
        await selectTab(grouping.analysisTab);
        expect(container.textContent).toContain(grouping.unmatched);
        expect(container.textContent).not.toContain('两题共用的解题提示');
        await clickButton(grouping.viewAll);
        expect(container.textContent).toContain('两题共用的解题提示');
    });
});

describe('校对页原图侧栏', () => {
    it('有原图时常驻显示，点击放大后全屏查看', async () => {
        const imagePreview = 'data:image/png;base64,AAAA';
        await act(async () => root.render(
            <LanguageProvider><CorrectionEditor initialData={{
                questionText: '求和', answerText: '4', analysis: '解析', subject: '数学', knowledgePoints: [], requiresImage: false,
                wrongAnswerText: '', mistakeAnalysis: '', mistakeStatus: 'unknown',
            }} initialSubjectId="math" onSave={onSave} onCancel={() => undefined} imagePreview={imagePreview} /></LanguageProvider>,
        ));
        const preview = Array.from(container.querySelectorAll('img')).find((img) => img.getAttribute('src') === imagePreview)!;
        expect(preview).toBeDefined();
        // 常驻显示：不再折叠在 details 里
        expect(preview.closest('details')).toBeNull();

        await act(async () => preview.click());
        const enlarged = container.querySelector('img[alt="Full size"]')!;
        expect(enlarged.getAttribute('src')).toBe(imagePreview);
    });

    it('没有原图和配图时不渲染图片栏', async () => {
        await renderEditor();
        expect(container.querySelector('aside')).toBeNull();
    });
});

describe('校对页逐题知识点', () => {
    it('编辑某题标签后保留其他题标签，并同步汇总知识点', async () => {
        await renderEditor({
            questionText: '15. 第一题\n\n16. 第二题',
            knowledgePoints: ['轴对称最短路径', '全等三角形'],
            questionKnowledgePoints: { '15': ['轴对称最短路径'], '16': ['全等三角形'] },
        });

        const tagsDetails = Array.from(container.querySelectorAll('summary')).find(summary => summary.textContent?.includes('知识点'))!;
        await act(async () => tagsDetails.click());
        expect(container.textContent).toContain('第15题知识点');
        expect(container.textContent).toContain('第16题知识点');

        const input = container.querySelector<HTMLInputElement>('input[aria-label="第16题知识点"]')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '轴对称图形');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
        await clickButton(translations.zh.editor.save);

        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            questionKnowledgePoints: { '15': ['轴对称最短路径'], '16': ['全等三角形', '轴对称图形'] },
            knowledgePoints: ['轴对称最短路径', '全等三角形', '轴对称图形'],
        }));
    });

    it('重新解题后使用新的逐题知识点，不保留旧对应关系', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ answerText: '新答案', analysis: '新解析', knowledgePoints: ['全等三角形'], questionKnowledgePoints: { '15': [], '16': ['全等三角形'] } });
        await renderEditor({ knowledgePoints: ['轴对称图形'], questionKnowledgePoints: { '15': ['轴对称图形'] } });
        await clickButton(translations.zh.editor.reanswer);
        await clickButton(translations.zh.editor.save);
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ questionKnowledgePoints: { '15': [], '16': ['全等三角形'] } }));
    });
});
