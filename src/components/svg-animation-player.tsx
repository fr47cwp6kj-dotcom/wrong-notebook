"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildSvgAnimationDocument, getSvgAnimationDuration, getSvgAspectRatio, parseSvgAnimationSteps } from "@/lib/svg-animation";
import type { SvgAnimationStep } from "@/lib/svg-animation";
import { cn } from "@/lib/utils";

interface SvgAnimationPlayerProps {
    svg: string;
    /** 分步时间轴（JSON），点击步骤跳到该步开始处播放；为空时不显示步骤条 */
    stepsJson?: string | null;
}

function formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * SVG 动画播放器：支持播放/暂停、拖动进度条、重播和全屏。
 * 全屏优先用浏览器的 Fullscreen API；不支持时（如 iPhone Safari）改为铺满窗口的浮层。
 * SVG 放在不允许脚本的 sandbox iframe 中（仅 allow-same-origin，便于本页调用 SMIL 时间轴接口），
 * 其中的脚本和事件属性都不会执行。
 */
export function SvgAnimationPlayer({ svg, stepsJson }: SvgAnimationPlayerProps) {
    const { t, language } = useLanguage();
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [nativeFullscreen, setNativeFullscreen] = useState(false);
    const [overlayFullscreen, setOverlayFullscreen] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const fullscreen = nativeFullscreen || overlayFullscreen;

    const steps = useMemo<SvgAnimationStep[]>(() => parseSvgAnimationSteps(stepsJson), [stepsJson]);
    // 当前播放到的时间落在哪一步（取开始时间不晚于当前的最后一步）
    const activeStepIndex = useMemo(() => {
        if (steps.length === 0) return -1;
        let active = 0;
        for (let i = 0; i < steps.length; i++) {
            if (steps[i].begin <= current + 0.05) active = i;
        }
        return active;
    }, [steps, current]);

    const duration = useMemo(() => getSvgAnimationDuration(svg), [svg]);
    const aspectRatio = useMemo(() => getSvgAspectRatio(svg), [svg]);
    const srcDoc = useMemo(() => buildSvgAnimationDocument(svg), [svg]);

    const speakStep = useCallback((step: SvgAnimationStep | undefined) => {
        if (!step || typeof window === "undefined" || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(`${step.index}. ${step.title}`);
        utterance.lang = language === "zh" ? "zh-CN" : "en-US";
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    }, [language]);

    useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

    useEffect(() => {
        if (voiceEnabled && activeStepIndex >= 0) speakStep(steps[activeStepIndex]);
    }, [activeStepIndex, speakStep, steps, voiceEnabled]);

    /** CSS 动画（若有）跟随 SMIL 时间轴 */
    const cssAnimations = useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        return typeof doc?.getAnimations === "function" ? doc.getAnimations() : [];
    }, []);

    const pause = useCallback(() => {
        svgRef.current?.pauseAnimations();
        cssAnimations().forEach((animation) => animation.pause());
        setPlaying(false);
    }, [cssAnimations]);

    const seek = useCallback((time: number) => {
        svgRef.current?.setCurrentTime(time);
        cssAnimations().forEach((animation) => { animation.currentTime = time * 1000; });
        setCurrent(time);
    }, [cssAnimations]);

    const play = useCallback(() => {
        const element = svgRef.current;
        if (!element) return;
        // 已播完时从头开始
        if (duration > 0 && element.getCurrentTime() >= duration) seek(0);
        element.unpauseAnimations();
        cssAnimations().forEach((animation) => animation.play());
        setPlaying(true);
    }, [cssAnimations, duration, seek]);

    const handleLoad = () => {
        svgRef.current = iframeRef.current?.contentDocument?.querySelector("svg") ?? null;
        setCurrent(0);
        setPlaying(!!svgRef.current);
    };

    const toggleFullscreen = async () => {
        if (overlayFullscreen) {
            setOverlayFullscreen(false);
            return;
        }
        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => undefined);
            return;
        }
        const container = containerRef.current;
        if (container && typeof container.requestFullscreen === "function") {
            try {
                await container.requestFullscreen();
                return;
            } catch {
                // 浏览器拒绝时退回浮层
            }
        }
        setOverlayFullscreen(true);
    };

    // 跟随浏览器全屏状态（包括按 Esc 退出）
    useEffect(() => {
        const handleChange = () => setNativeFullscreen(document.fullscreenElement === containerRef.current);
        document.addEventListener("fullscreenchange", handleChange);
        return () => document.removeEventListener("fullscreenchange", handleChange);
    }, []);

    // 浮层全屏：按 Esc 退出，并禁止背后页面滚动
    useEffect(() => {
        if (!overlayFullscreen) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOverlayFullscreen(false); };
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", handleKey);
        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener("keydown", handleKey);
        };
    }, [overlayFullscreen]);

    // 播放时跟踪进度，到结尾自动暂停在最后一帧
    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        const tick = () => {
            const time = svgRef.current?.getCurrentTime() ?? 0;
            if (duration > 0 && time >= duration) {
                svgRef.current?.setCurrentTime(duration);
                pause();
                setCurrent(duration);
                return;
            }
            setCurrent(time);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing, duration, pause]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "space-y-2",
                fullscreen && "flex flex-col items-center justify-center bg-black p-4",
                overlayFullscreen && "fixed inset-0 z-50"
            )}
        >
            <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                sandbox="allow-same-origin"
                title={t.svgAnimation.alt}
                onLoad={handleLoad}
                className={cn("mx-auto block rounded border bg-white", !fullscreen && "w-full max-w-3xl")}
                // 全屏时按宽高比放到最大，留出控制栏的高度
                style={fullscreen
                    ? { aspectRatio, width: `min(100%, calc((100dvh - 96px) * ${aspectRatio}))` }
                    : { aspectRatio }}
            />
            {steps.length > 0 && (
                <div className={cn("mx-auto flex w-full flex-wrap items-center gap-1.5", fullscreen ? "max-w-5xl" : "max-w-3xl")}>
                    <span className={cn("mr-1 shrink-0 text-xs", fullscreen ? "text-white/70" : "text-muted-foreground")}>{t.svgAnimation.stepsLabel}</span>
                    {steps.map((step, index) => (
                        <Button
                            key={step.index}
                            variant={index === activeStepIndex ? "default" : "outline"}
                            size="sm"
                            className={cn("h-7 gap-1.5 px-2.5 text-xs", fullscreen && index !== activeStepIndex && "border-white/40 bg-transparent text-white hover:bg-white/20")}
                            onClick={() => { seek(step.begin); play(); }}
                            aria-label={`${t.svgAnimation.stepJump.replace("{index}", String(step.index))} ${step.title}`}
                        >
                            <span className="tabular-nums opacity-70">{step.index}</span>
                            <span>{step.title}</span>
                        </Button>
                    ))}
                </div>
            )}
            <div className={cn("mx-auto flex w-full items-center gap-2", fullscreen ? "max-w-5xl text-white" : "max-w-3xl")}>
                {steps.length > 0 && <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-8 gap-1 px-2", fullscreen && "text-white hover:bg-white/20 hover:text-white")}
                    onClick={() => {
                        const next = !voiceEnabled;
                        setVoiceEnabled(next);
                        if (next) speakStep(steps[Math.max(0, activeStepIndex)]);
                        else window.speechSynthesis?.cancel();
                    }}
                    aria-label={voiceEnabled ? t.svgAnimation.voiceOff : t.svgAnimation.voiceOn}
                    title={voiceEnabled ? t.svgAnimation.voiceOff : t.svgAnimation.voiceOn}
                >
                    {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    <span className="hidden sm:inline">{voiceEnabled ? t.svgAnimation.voiceOff : t.svgAnimation.voiceOn}</span>
                </Button>}
                <Button
                    variant="outline"
                    size="sm"
                    // 全屏时控制栏文字为白色，播放按钮是白底，图标需保持深色
                    className="h-8 w-8 shrink-0 p-0 text-foreground"
                    onClick={playing ? pause : play}
                    aria-label={playing ? t.svgAnimation.pause : t.svgAnimation.play}
                    title={playing ? t.svgAnimation.pause : t.svgAnimation.play}
                >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-8 w-8 shrink-0 p-0", fullscreen && "text-white hover:bg-white/20 hover:text-white")}
                    onClick={() => { seek(0); play(); }}
                    aria-label={t.svgAnimation.replay}
                    title={t.svgAnimation.replay}
                >
                    <RotateCcw className="h-4 w-4" />
                </Button>
                {duration > 0 && (
                    <>
                        <input
                            type="range"
                            min={0}
                            max={duration}
                            step={0.1}
                            value={Math.min(current, duration)}
                            onChange={(e) => seek(Number(e.target.value))}
                            aria-label={t.svgAnimation.progress}
                            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
                        />
                        <span className={cn("shrink-0 text-xs tabular-nums", fullscreen ? "text-white/80" : "text-muted-foreground")}>
                            {formatTime(current)} / {formatTime(duration)}
                        </span>
                    </>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn("ml-auto h-8 w-8 shrink-0 p-0", fullscreen && "text-white hover:bg-white/20 hover:text-white")}
                    onClick={toggleFullscreen}
                    aria-label={fullscreen ? t.svgAnimation.exitFullscreen : t.svgAnimation.fullscreen}
                    title={fullscreen ? t.svgAnimation.exitFullscreen : t.svgAnimation.fullscreen}
                >
                    {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );
}
