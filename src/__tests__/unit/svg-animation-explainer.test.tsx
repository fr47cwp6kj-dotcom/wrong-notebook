/**
 * SVG 动画讲解组件：按界面语言生成、删除和提示动画
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SvgAnimationExplainer } from '@/components/svg-animation-explainer';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({
    post: vi.fn(),
    delete: vi.fn(),
    confirmDialog: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiClient: { post: mocks.post, delete: mocks.delete } }));
vi.mock('@/lib/feedback', () => ({ toast: { error: vi.fn() }, confirmDialog: mocks.confirmDialog }));
vi.mock('@/components/svg-animation-player', () => ({ SvgAnimationPlayer: ({ svg }: { svg: string }) => <div data-testid="player">{svg}</div> }));

const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
});

async function render(props: { svgAnimation?: string | null; hasOtherLanguage?: boolean; onChange?: () => void; autoGenerate?: boolean }) {
    await act(async () => root.render(
        <LanguageProvider>
            <SvgAnimationExplainer autoGenerate={props.autoGenerate} errorItemId="e1" svgAnimation={props.svgAnimation} hasOtherLanguage={props.hasOtherLanguage} onChange={props.onChange ?? vi.fn()} />
        </LanguageProvider>,
    ));
}

const clickButton = (text: string) => act(async () => {
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
    if (!button) throw new Error(`找不到按钮：${text}`);
    button.click();
});

describe('SVG 动画讲解按界面语言生成', () => {
    it('中文界面生成中文版动画', async () => {
        mocks.post.mockResolvedValue({ svgAnimation: svg });
        const onChange = vi.fn();
        await render({ onChange, autoGenerate: false });

        await clickButton('生成动画讲解');

        expect(mocks.post).toHaveBeenCalledWith('/api/error-items/e1/svg-animation', { language: 'zh' }, expect.anything());
        expect(onChange).toHaveBeenCalledWith('zh', svg);
    });

    it('英文界面生成英文版动画', async () => {
        localStorage.setItem('app-language', 'en');
        mocks.post.mockResolvedValue({ svgAnimation: svg });
        const onChange = vi.fn();
        await render({ onChange, autoGenerate: false });

        await clickButton('Generate animation');

        expect(mocks.post).toHaveBeenCalledWith('/api/error-items/e1/svg-animation', { language: 'en' }, expect.anything());
        expect(onChange).toHaveBeenCalledWith('en', svg);
    });

    it('英文界面只删除英文版动画', async () => {
        localStorage.setItem('app-language', 'en');
        mocks.confirmDialog.mockResolvedValue(true);
        mocks.delete.mockResolvedValue({ success: true });
        const onChange = vi.fn();
        await render({ svgAnimation: svg, onChange });

        await clickButton('Delete');

        expect(mocks.delete).toHaveBeenCalledWith('/api/error-items/e1/svg-animation?language=en');
        expect(onChange).toHaveBeenCalledWith('en', null);
    });

    it('当前语言未生成但另一语言已有动画时提示切换语言查看', async () => {
        await render({ hasOtherLanguage: true, autoGenerate: false });
        expect(container.textContent).toContain('已有英文版动画讲解');
    });
});


describe('打开题目自动提供动画', () => {
    it('没有动画时自动生成当前语言并保存到页面，不要求点击按钮', async () => {
        mocks.post.mockResolvedValue({ svgAnimation: svg });
        const onChange = vi.fn();
        await render({ onChange });
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(mocks.post).toHaveBeenCalledWith('/api/error-items/e1/svg-animation', { language: 'zh', reuseExisting: true }, expect.anything());
        expect(onChange).toHaveBeenCalledWith('zh', svg);
    });
    it('已有动画时直接显示播放器，不重新调用 AI', async () => {
        await render({ svgAnimation: svg });
        expect(container.querySelector('[data-testid="player"]')).not.toBeNull();
        expect(mocks.post).not.toHaveBeenCalled();
    });
    it('自动生成失败不循环重试，可手动重试', async () => {
        mocks.post.mockRejectedValueOnce(new Error('timeout'));
        await render({});
        expect(mocks.post).toHaveBeenCalledTimes(1);
        mocks.post.mockResolvedValueOnce({ svgAnimation: svg });
        await clickButton('生成动画讲解');
        expect(mocks.post).toHaveBeenCalledTimes(2);
    });
    it('删除后保持为空，不会立刻自动重新生成', async () => {
        mocks.confirmDialog.mockResolvedValue(true);
        mocks.delete.mockResolvedValue({ success: true });
        await render({ svgAnimation: svg });
        await clickButton('删除');
        await render({ svgAnimation: null });
        expect(mocks.post).not.toHaveBeenCalled();
    });
});
