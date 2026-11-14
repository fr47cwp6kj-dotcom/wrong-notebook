"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { ChevronDown, ChevronUp, Code2, Eye } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type EditorMode = "source" | "preview";

interface MarkdownEditorProps extends Omit<ComponentProps<"textarea">, "value" | "onChange"> {
    value: string;
    onChange: (value: string) => void;
    defaultMode?: EditorMode;
    previewMaxHeight?: number;
}

/**
 * 支持 Markdown 与 LaTeX 的编辑框：可在「源代码」和「预览」之间切换，
 * 预览与题目页面使用同一个渲染器，所见即最终显示效果。
 */
export function MarkdownEditor({ value, onChange, className, defaultMode = "source", previewMaxHeight, ...textareaProps }: MarkdownEditorProps) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<EditorMode>(defaultMode);
    const panelId = useId();
    const previewRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflows, setOverflows] = useState(false);
    useEffect(() => {
        if (mode !== "preview" || !previewRef.current || !previewMaxHeight) return;
        const content = previewRef.current;
        const observer = new ResizeObserver(() => setOverflows(content.scrollHeight > previewMaxHeight));
        observer.observe(content);
        return () => observer.disconnect();
    }, [mode, previewMaxHeight]);

    const tabs: { mode: EditorMode; label: string; icon: typeof Code2 }[] = [
        { mode: "source", label: t.markdownEditor.source, icon: Code2 },
        { mode: "preview", label: t.markdownEditor.preview, icon: Eye },
    ];

    return (
        <div className="space-y-1.5">
            <div role="tablist" aria-label={t.markdownEditor.modeLabel} className="flex justify-end">
                <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                    {tabs.map(({ mode: tabMode, label, icon: Icon }) => (
                        <button
                            key={tabMode}
                            type="button"
                            role="tab"
                            aria-selected={mode === tabMode}
                            aria-controls={panelId}
                            onClick={() => setMode(tabMode)}
                            className={cn(
                                "flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors",
                                mode === tabMode ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div id={panelId} role="tabpanel">
                {mode === "source" ? (
                    <Textarea value={value} onChange={(e) => onChange(e.target.value)} className={className} {...textareaProps} />
                ) : (
                    <div className="overflow-hidden rounded-md border bg-muted/20" onDoubleClick={() => setMode("source")} title={t.markdownEditor.doubleClickToEdit}>
                        <div className="relative">
                            <div
                                className="overflow-hidden"
                                style={{ maxHeight: expanded ? undefined : previewMaxHeight }}
                            >
                                <div ref={previewRef} className="min-h-16 cursor-text px-3 py-2">
                                    {value.trim()
                                        ? <MarkdownRenderer content={value} />
                                        : <p className="text-sm italic text-muted-foreground">{t.markdownEditor.empty}</p>}
                                </div>
                            </div>
                            {overflows && !expanded && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />}
                        </div>
                        {overflows && (
                            <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)} onDoubleClick={(event) => event.stopPropagation()} className="flex w-full items-center justify-center gap-1 border-t py-2 text-sm font-medium text-primary hover:bg-muted/50">
                                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                {expanded ? t.markdownEditor.collapse : t.markdownEditor.expand}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
