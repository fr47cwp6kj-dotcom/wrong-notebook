/**
 * 题目导入流程：免确认直接入库、人工校对后保存、文字解题与识别失败提示
 */
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useQuestionImport } from '@/lib/use-question-import';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    push: vi.fn(),
    confirmBeforeImport: false,
    saveParsedQuestion: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    prepareImageFile: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get, post: mocks.post } }));
vi.mock('@/lib/question-import', () => ({
    fetchConfirmBeforeImport: vi.fn(async () => mocks.confirmBeforeImport),
    saveParsedQuestion: mocks.saveParsedQuestion,
}));
vi.mock('@/lib/image-utils', () => ({ processImageFile: vi.fn(async () => 'data:image/jpeg;base64,AAAA') }));
vi.mock('@/lib/image-input', () => ({ prepareImageFile: mocks.prepareImageFile }));
vi.mock('@/lib/feedback', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const parsed = { questionText: '1 + 1 = ?', answerText: '2', analysis: '加法', knowledgePoints: ['加法'], subject: '数学', requiresImage: false };

type Flow = ReturnType<typeof useQuestionImport>;
type Options = Parameters<typeof useQuestionImport>[0];

let root: Root;
let container: HTMLDivElement;
let flow: Flow;

// 每次渲染后把 hook 的最新返回值交给测试
function Probe({ options, onRender }: { options: Options; onRender: (value: Flow) => void }) {
    const value = useQuestionImport(options);
    useEffect(() => onRender(value));
    return null;
}

async function render(options: Partial<Options> = {}) {
    await act(async () => {
        root.render(<LanguageProvider><Probe options={{ logPrefix: '[Test]', ...options }} onRender={(value) => { flow = value; }} /></LanguageProvider>);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmBeforeImport = false;
    mocks.get.mockResolvedValue({ timeouts: { analyze: 120000 } });
    mocks.saveParsedQuestion.mockResolvedValue({ id: 'saved', duplicate: false });
    mocks.prepareImageFile.mockReset().mockImplementation(async (file: File) => file);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:prepared'), revokeObjectURL: vi.fn() });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('题目导入流程', () => {
    it('HEIC 转换完成后才打开裁剪器，使用转换后的图片并在关闭页面时释放', async () => {
        let finish!: (file: File) => void;
        mocks.prepareImageFile.mockReturnValueOnce(new Promise<File>(resolve => { finish = resolve; }));
        await render();
        const source = new File(['heic'], 'photo.HEIC');
        const jpeg = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' });
        let pending!: Promise<void>;
        await act(async () => { pending = flow.selectImage(source); });
        expect(flow.isPreparingImage).toBe(true);
        expect(flow.isBusy).toBe(true);
        expect(flow.isCropperOpen).toBe(false);
        expect(mocks.post).not.toHaveBeenCalled();
        await act(async () => { finish(jpeg); await pending; });
        expect(URL.createObjectURL).toHaveBeenCalledWith(jpeg);
        expect(flow.croppingImage).toBe('blob:prepared');
        expect(flow.isCropperOpen).toBe(true);
        expect(flow.isBusy).toBe(false);
        await act(async () => root.render(null));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared');
    });

    it('HEIC 转换失败后提示错误并允许重新选择，不调用 AI', async () => {
        mocks.prepareImageFile.mockRejectedValueOnce(new Error('broken heic'));
        await render();
        await act(async () => { await flow.selectImage(new File(['broken'], 'photo.heic')); });
        expect(flow.isBusy).toBe(false);
        expect(flow.isCropperOpen).toBe(false);
        expect(flow.croppingImage).toBeNull();
        expect(mocks.toastError).toHaveBeenCalled();
        expect(mocks.post).not.toHaveBeenCalled();
        await act(async () => { await flow.selectImage(new File(['jpeg'], 'photo.jpg')); });
        expect(flow.isCropperOpen).toBe(true);
    });

    it('慢速转换不会覆盖后来选择的图片', async () => {
        let finish!: (file: File) => void;
        mocks.prepareImageFile.mockReturnValueOnce(new Promise<File>(resolve => { finish = resolve; }));
        await render();
        let pending!: Promise<void>;
        await act(async () => { pending = flow.selectImage(new File(['heic'], 'old.heic')); });
        const current = new File(['jpeg'], 'current.jpg');
        await act(async () => { await flow.selectImage(current); });
        await act(async () => { finish(new File(['jpeg'], 'old.jpg')); await pending; });
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(URL.createObjectURL).toHaveBeenCalledWith(current);
    });

    it('即使旧偏好关闭人工确认，图片识别后也先进入校对页', async () => {
        const onParsed = vi.fn();
        mocks.post.mockResolvedValueOnce(parsed);
        await render({ analyzeSubjectId: 'nb-1', importSubjectId: 'nb-1', onParsed });

        await act(async () => flow.cropComplete(new Blob(['x'])));
        await act(async () => {});

        expect(mocks.post).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({ imageBase64: 'data:image/jpeg;base64,AAAA', subjectId: 'nb-1' }), { timeout: 120000 });
        expect(mocks.saveParsedQuestion).not.toHaveBeenCalled();
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(flow.lastImported).toBeNull();
        expect(flow.step).toBe('review');
        expect(flow.parsedData).toEqual(parsed);
        expect(onParsed).toHaveBeenCalledWith(parsed);
        expect(flow.analysisStep).toBe('idle');
    });

    it('开启人工确认时进入校对页，保存到固定错题本后跳转', async () => {
        mocks.confirmBeforeImport = true;
        const onParsed = vi.fn();
        mocks.post.mockResolvedValueOnce(parsed);
        await render({ fixedSubjectId: 'nb-2', onParsed });

        await act(async () => flow.cropComplete(new Blob(['x'])));
        await act(async () => {});
        expect(flow.step).toBe('review');
        expect(flow.parsedData).toEqual(parsed);
        expect(flow.currentImage).toBe('data:image/jpeg;base64,AAAA');
        expect(onParsed).toHaveBeenCalledWith(parsed);

        mocks.post.mockResolvedValueOnce({ id: 'item-1' });
        await act(async () => flow.saveReviewed({ ...parsed, subjectId: 'other' } as never));
        expect(mocks.post).toHaveBeenLastCalledWith('/api/error-items', expect.objectContaining({ subjectId: 'nb-2', originalImageUrl: 'data:image/jpeg;base64,AAAA' }));
        expect(mocks.push).toHaveBeenCalledWith('/notebooks/nb-2');
        expect(flow.step).toBe('upload');
    });

    it('保存时识别为重复题则跳到原题', async () => {
        await render();
        mocks.post.mockResolvedValueOnce({ id: 'existing', duplicate: true });
        await act(async () => { await flow.saveQuestion({ questionText: 'q', subjectId: 'nb-1' }); });
        expect(mocks.push).toHaveBeenCalledWith('/error-items/existing');
    });

    it('旧偏好关闭时文字解题仍进入校对页，并规范化作答状态', async () => {
        mocks.confirmBeforeImport = false;
        mocks.post.mockResolvedValueOnce({ answerText: '2', analysis: '加法', knowledgePoints: ['加法'], questionKnowledgePoints: { '15': ['加法'], '16': [] }, wrongAnswerText: '', mistakeAnalysis: '', mistakeStatus: 'bogus' });
        await render({ textNotebook: { id: 'nb-3', name: '数学' } });

        await act(async () => { await flow.submitText('1 + 1 = ?'); });
        expect(mocks.post).toHaveBeenCalledWith('/api/reanswer', expect.objectContaining({ questionText: '1 + 1 = ?', subject: '数学', subjectId: 'nb-3' }), { timeout: 120000 });
        expect(flow.parsedData).toMatchObject({ questionText: '1 + 1 = ?', mistakeStatus: 'unknown', subject: '其他', questionKnowledgePoints: { '15': ['加法'], '16': [] } });
        expect(flow.currentImage).toBeNull();
        expect(flow.step).toBe('review');
        expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    it('识别失败时提示错误并恢复空闲状态', async () => {
        mocks.post.mockRejectedValueOnce(new Error('boom'));
        await render();
        await act(async () => flow.cropComplete(new Blob(['x'])));
        await act(async () => {});
        expect(mocks.toastError).toHaveBeenCalled();
        expect(flow.analysisStep).toBe('idle');
        expect(mocks.saveParsedQuestion).not.toHaveBeenCalled();
    });
});
