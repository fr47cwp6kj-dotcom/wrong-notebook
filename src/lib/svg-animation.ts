/**
 * 题目的 SVG 动画讲解（AI 生成）。前后端共用，不要引入服务端模块。
 *
 * 净化规则与题目配图相同（见 figure-svg.ts），保留 SMIL 动画元素和 CSS 动画；
 * 显示时同样通过 <img> 加载，浏览器不会执行其中的脚本。
 */
import { sanitizeFigureSvg } from './figure-svg';

/** 单个动画讲解的最大长度（字符） */
export const MAX_SVG_ANIMATION_LENGTH = 200_000;

// 改写链接属性的动画（<animate attributeName="href" …>、<set attributeName="xlink:href" …>）
const HREF_ANIMATIONS = /<(animate|set)\b[^>]*attributeName\s*=\s*["']?(?:xlink:)?href["']?[^>]*?(\/>|>[\s\S]*?<\/\1\s*>)/gi;

/**
 * 从 AI 回复中取出动画 SVG 并净化；没有有效 SVG 或超长时返回 null
 */
export function sanitizeSvgAnimation(raw: unknown): string | null {
    const svg = sanitizeFigureSvg(raw, MAX_SVG_ANIMATION_LENGTH);
    return svg ? svg.replace(HREF_ANIMATIONS, '') : null;
}

const ANIMATION_TAG = /<(?:animate|animateTransform|animateMotion|set)\b[^>]*>/gi;

function readAttribute(tag: string, name: string): string | null {
    const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
    return match ? (match[2] ?? match[3] ?? '').trim() : null;
}

/** 解析 SMIL 时钟值（如 2s、500ms、1.5、0:05、1min），无法解析时返回 null */
export function parseClockValue(value: string | null): number | null {
    if (!value) return null;
    const v = value.trim();
    const clock = v.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    const timed = v.match(/^(\d+(?:\.\d+)?)(h|min|s|ms)?$/);
    if (!timed) return null;
    const unit = { h: 3600, min: 60, s: 1, ms: 0.001 }[timed[2] ?? 's'] ?? 1;
    return Number(timed[1]) * unit;
}

/**
 * 动画总时长（秒）：各 SMIL 动画元素 begin + dur × repeatCount 的最大值；
 * begin 取列表中第一个时钟值，引用其他元素（如 a.end）或无限循环的动画不计入。
 */
export function getSvgAnimationDuration(svg: string): number {
    let total = 0;
    for (const tag of svg.match(ANIMATION_TAG) || []) {
        const beginRaw = readAttribute(tag, 'begin');
        const begin = beginRaw === null ? 0 : parseClockValue(beginRaw.split(';')[0]);
        if (begin === null) continue;
        const repeat = readAttribute(tag, 'repeatCount');
        if (repeat === 'indefinite' || readAttribute(tag, 'repeatDur') === 'indefinite') continue;
        const dur = parseClockValue(readAttribute(tag, 'dur')) ?? 0;
        const count = repeat && Number.isFinite(Number(repeat)) ? Number(repeat) : 1;
        total = Math.max(total, begin + dur * count);
    }
    return total;
}

/** 由 viewBox（或 width/height）得出宽高比，缺省为 8:5 */
export function getSvgAspectRatio(svg: string): number {
    const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
    const viewBox = readAttribute(root, 'viewBox')?.split(/[\s,]+/).map(Number);
    if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) return viewBox[2] / viewBox[3];
    const width = parseFloat(readAttribute(root, 'width') ?? '');
    const height = parseFloat(readAttribute(root, 'height') ?? '');
    return width > 0 && height > 0 ? width / height : 8 / 5;
}

/**
 * 放进 sandbox iframe 的文档：CSP 禁止加载任何外部资源，SVG 铺满画面
 */
export function buildSvgAnimationDocument(svg: string): string {
    return '<!doctype html><html><head><meta charset="utf-8">'
        + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">'
        + '<style>html,body{margin:0;height:100%;background:#fff;overflow:hidden}svg{display:block;width:100%;height:100%}</style>'
        + `</head><body>${svg}</body></html>`;
}

/** 动画的关键步骤：标题与该步开始的秒数，供播放器分步点击 */
export interface SvgAnimationStep {
    index: number;
    title: string;
    begin: number;
}

/** generateSvgAnimation 的返回：动画 SVG 与步骤时间轴 */
export interface SvgAnimationResult {
    svg: string;
    steps: SvgAnimationStep[];
}

/**
 * 解析 AI 输出的 <animation_steps>：JSON 数组 [{index,title,begin}]，
 * begin 支持 SMIL 时钟值（如 "5s"）或数字（秒）；格式不合法时返回空数组
 */
export function parseSvgAnimationSteps(raw: string | null | undefined): SvgAnimationStep[] {
    if (!raw?.trim()) return [];
    let value: unknown;
    try {
        value = JSON.parse(raw.trim());
    } catch {
        return [];
    }
    if (!Array.isArray(value)) return [];
    const steps: SvgAnimationStep[] = [];
    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null) continue;
        const record = entry as Record<string, unknown>;
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        if (!title) continue;
        const beginRaw = record.begin;
        const begin = typeof beginRaw === 'number' && Number.isFinite(beginRaw)
            ? beginRaw
            : parseClockValue(typeof beginRaw === 'string' ? beginRaw : null);
        if (begin === null || begin < 0) continue;
        const index = typeof record.index === 'number' ? record.index : steps.length + 1;
        steps.push({ index, title, begin });
    }
    // 按开始时间升序；步数过少时不构成时间轴，视为无效
    const sorted = steps.sort((a, b) => a.begin - b.begin);
    return sorted.length >= 2 ? sorted.map((step, i) => ({ ...step, index: i + 1 })) : [];
}

/**
 * 由 AI 回复构造动画结果：净化 SVG（无效返回 null）并解析步骤时间轴
 */
export function buildSvgAnimationResult(svgRaw: string | null, stepsRaw?: string | null): SvgAnimationResult | null {
    const svg = sanitizeSvgAnimation(svgRaw);
    if (!svg) return null;
    return { svg, steps: parseSvgAnimationSteps(stepsRaw) };
}
