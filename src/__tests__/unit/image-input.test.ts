import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHeicImage, prepareImageFile } from '@/lib/image-input';
import { processImageFile } from '@/lib/image-utils';

const mocks = vi.hoisted(() => ({ heicTo: vi.fn() }));
vi.mock('heic-to/csp', () => ({ heicTo: mocks.heicTo }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { info: vi.fn() } }));

beforeEach(() => {
    mocks.heicTo.mockReset();
    mocks.heicTo.mockResolvedValue(new Blob(['jpeg-content'], { type: 'image/jpeg' }));
});

describe('HEIC 图片准备', () => {
    it.each([
        ['IMG_001.HEIC', ''],
        ['photo.heif', 'application/octet-stream'],
        ['image', 'image/heic'],
        ['image', 'image/heif'],
        ['image', 'image/heic-sequence'],
        ['image', 'image/heif-sequence'],
    ])('识别扩展名或 MIME 类型：%s / %s', (name, type) => {
        expect(isHeicImage(new File(['heic'], name, { type }))).toBe(true);
    });

    it('普通图片保持原文件且不调用 HEIC 解码', async () => {
        const file = new File(['png'], 'photo.png', { type: 'image/png' });
        expect(isHeicImage(file)).toBe(false);
        expect(await prepareImageFile(file)).toBe(file);
        expect(mocks.heicTo).not.toHaveBeenCalled();
    });

    it('生成可供裁剪的 JPEG 文件，保留文件名和时间', async () => {
        const file = new File(['heic'], '题目.HEIC', { lastModified: 123 });
        const result = await prepareImageFile(file);
        expect(mocks.heicTo).toHaveBeenCalledWith({ blob: file, type: 'image/jpeg', quality: 0.95 });
        expect(result).toMatchObject({ name: '题目.jpg', type: 'image/jpeg', lastModified: 123, size: 12 });
    });

    it('小于压缩阈值的 HEIC 也必须先转换，AI 接收 JPEG 数据', async () => {
        const result = await processImageFile(new File(['heic'], 'photo.heic', { type: 'image/heic' }));
        expect(result).toBe('data:image/jpeg;base64,anBlZy1jb250ZW50');
        expect(mocks.heicTo).toHaveBeenCalledTimes(1);
    });

    it('canvas 不可用时小图原样返回 Base64（放大步骤跳过）', async () => {
        const result = await processImageFile(new File(['tiny'], 'crop.jpg', { type: 'image/jpeg' }));
        expect(result).toBe('data:image/jpeg;base64,dGlueQ==');
        expect(mocks.heicTo).not.toHaveBeenCalled();
    });

    it('损坏的 HEIC 不会作为原始数据继续上传', async () => {
        mocks.heicTo.mockRejectedValueOnce(new Error('decode failed'));
        await expect(processImageFile(new File(['broken'], 'photo.heic'))).rejects.toThrow('decode failed');
    });

    it('拒绝空转换结果', async () => {
        mocks.heicTo.mockResolvedValueOnce(new Blob([], { type: 'image/jpeg' }));
        await expect(prepareImageFile(new File(['heic'], 'photo.heic'))).rejects.toThrow('HEIC_CONVERSION_FAILED');
    });
});
