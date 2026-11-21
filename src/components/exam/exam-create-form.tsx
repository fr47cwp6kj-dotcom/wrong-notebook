"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import type { ExamPickRule, ExamScope, Notebook } from "@/types/api";

const SCOPES: ExamScope[] = ["unmastered", "mastered", "all"];
const PICK_RULES: ExamPickRule[] = ["least_practiced", "random"];
const DIFFICULTIES = ["easy", "medium", "hard", "harder"] as const;

/** 新建试卷：选择错题本、范围、题量与难度 */
export function ExamCreateForm() {
    const { t, language } = useLanguage();
    const router = useRouter();
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [subjectIds, setSubjectIds] = useState<string[]>([]);
    const [tagNames, setTagNames] = useState<string[]>([]);
    const [scope, setScope] = useState<ExamScope>("unmastered");
    const [pickRule, setPickRule] = useState<ExamPickRule>("least_practiced");
    const [count, setCount] = useState(10);
    const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>("medium");
    const [title, setTitle] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [knowledgePoints, setKnowledgePoints] = useState<{ existing: string[]; all: string[] }>({ existing: [], all: [] });
    const [tagPickerOpen, setTagPickerOpen] = useState(false);
    const [tagGroupOpen, setTagGroupOpen] = useState<"existing" | "all" | null>(null);
    const [tagSearch, setTagSearch] = useState("");

    useEffect(() => {
        apiClient.get<Notebook[]>("/api/notebooks")
            .then((data) => {
                setNotebooks(data);
                if (data.length === 1) setSubjectIds([data[0].id]);
            })
            .catch(() => setNotebooks([]));
    }, []);

    useEffect(() => {
        if (subjectIds.length === 0) {
            return;
        }
        const query = subjectIds.map((id) => `subjectId=${encodeURIComponent(id)}`).join('&');
        apiClient.get<{ existing: string[]; all: string[] }>(`/api/exams/knowledge-points?${query}`)
            .then(setKnowledgePoints)
            .catch(() => setKnowledgePoints({ existing: [], all: [] }));
    }, [subjectIds]);

    const toggleNotebook = (id: string) => {
        const next = subjectIds.includes(id) ? subjectIds.filter((value) => value !== id) : [...subjectIds, id];
        setSubjectIds(next);
        if (next.length === 0) setKnowledgePoints({ existing: [], all: [] });
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (subjectIds.length === 0) {
            setError(t.exam.noNotebook);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const paper = await apiClient.post<{ id: string }>("/api/exams", {
                subjectIds,
                tagNames,
                scope,
                pickRule,
                count,
                difficulty,
                title: title.trim() || undefined,
                language,
            });
            router.push(`/exams/${paper.id}`);
        } catch (err) {
            const message = (err as { data?: { message?: string } })?.data?.message;
            setError(message === "NO_SOURCE_ITEMS" ? t.exam.noSource : t.common.messages?.saveFailed || "Failed");
            setSubmitting(false);
        }
    };

    const difficultyLabels = t.practice.difficulty as Record<string, string>;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">{t.exam.createTitle}</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>{t.exam.notebooks}</Label>
                            {notebooks.length > 1 && (
                                <button
                                    type="button"
                                    className="text-xs text-primary hover:underline"
                                    onClick={() => setSubjectIds(subjectIds.length === notebooks.length ? [] : notebooks.map((n) => n.id))}
                                >
                                    {t.exam.selectAll}
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {notebooks.map((notebook) => (
                                <label key={notebook.id} className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/50">
                                    <Checkbox checked={subjectIds.includes(notebook.id)} onCheckedChange={() => toggleNotebook(notebook.id)} />
                                    <span className="truncate">{notebook.name}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">{notebook._count?.errorItems ?? ""}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{t.exam.tags}</Label>
                        <button type="button" className="flex min-h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm" onClick={() => setTagPickerOpen((open) => !open)} aria-expanded={tagPickerOpen}>
                            <span className={tagNames.length > 0 ? "text-foreground" : "text-muted-foreground"}>
                                {tagNames.length > 0 ? `已选择 ${tagNames.length} 个知识点` : t.exam.tagsPlaceholder}
                            </span>
                            <ChevronDown className={`h-4 w-4 transition-transform ${tagPickerOpen ? "rotate-180" : ""}`} />
                        </button>
                        {tagNames.length > 0 && <div className="flex flex-wrap gap-1">{tagNames.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs">{tag}<button type="button" aria-label={`移除 ${tag}`} onClick={() => setTagNames((prev) => prev.filter((value) => value !== tag))}><X className="h-3 w-3" /></button></span>)}</div>}
                        {tagPickerOpen && <div className="space-y-2 rounded-md border bg-background p-3 shadow-sm"><div className="grid gap-2 sm:grid-cols-2">
                            {(["existing", "all"] as const).map((group) => {
                                const isOpen = tagGroupOpen === group;
                                const count = knowledgePoints[group].length;
                                return <button key={group} type="button" className={`flex min-h-10 items-center justify-between rounded-md border bg-background px-3 text-left text-sm transition-colors ${isOpen ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => { setTagGroupOpen(isOpen ? null : group); setTagSearch(""); }} aria-expanded={isOpen}>
                                    <span>{group === "existing" ? `错题中已有${count ? ` (${count})` : ""}` : `完整知识点库${count ? ` (${count})` : ""}`}</span>
                                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                </button>;
                            })}
                        </div>
                        {tagGroupOpen && <div>
                            <Input value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="搜索知识点…" className="mb-3" />
                            <div className="max-h-64 overflow-y-auto">
                                <TagGroup title={tagGroupOpen === "existing" ? "错题中已有" : "完整知识点库"} tags={knowledgePoints[tagGroupOpen]} selected={tagNames} search={tagSearch} onToggle={(tag) => setTagNames((prev) => prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag])} />
                                {knowledgePoints[tagGroupOpen].filter((tag) => tag.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase())).length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">{subjectIds.length === 0 ? "请先选择错题本" : "暂无匹配知识点"}</p>}
                            </div>
                        </div>}</div>}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label>{t.exam.scope}</Label>
                            <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
                                {SCOPES.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setScope(value)}
                                        className={`rounded px-2 py-1.5 text-sm transition-colors ${scope === value ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
                                    >
                                        {t.exam.scopes[value]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="exam-count">{t.exam.count}</Label>
                            <Input
                                id="exam-count"
                                type="number"
                                min={1}
                                max={50}
                                value={count}
                                onChange={(e) => setCount(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="exam-difficulty">{t.exam.difficulty}</Label>
                            <select
                                id="exam-difficulty"
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value as typeof DIFFICULTIES[number])}
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            >
                                {DIFFICULTIES.map((value) => (
                                    <option key={value} value={value}>{difficultyLabels[value]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>{t.exam.pickRule}</Label>
                        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 sm:max-w-sm">
                            {PICK_RULES.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setPickRule(value)}
                                    className={`rounded px-2 py-1.5 text-sm transition-colors ${pickRule === value ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
                                >
                                    {t.exam.pickRules[value]}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{t.exam.pickRuleHints[pickRule]}</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="exam-title">{t.exam.titleLabel}</Label>
                        <Input id="exam-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                        {submitting ? t.exam.creating : t.exam.generate}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function TagGroup({ title, tags, selected, search, onToggle }: { title: string; tags: string[]; selected: string[]; search: string; onToggle: (tag: string) => void }) {
    const filtered = tags.filter((tag) => tag.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    if (filtered.length === 0) return null;
    return <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">{title}</p>{filtered.map((tag) => <label key={tag} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"><Checkbox checked={selected.includes(tag)} onCheckedChange={() => onToggle(tag)} /><span>{tag}</span>{selected.includes(tag) && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}</label>)}</div>;
}
