"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, BookOpen, CalendarCheck, ListChecks, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface HomeHeroProps {
    notebookCount: number;
    itemCount: number;
    /** 今日待复习的错题数，加载完成前为 null */
    dueCount: number | null;
    /** 从错题本页进入时的目标错题本名称 */
    targetNotebook?: string;
    /** 优先验证的知识单元所关联错题；没有可验证单元时引导去知识单元页。 */
    targetPracticeHref: string;
}

const subscribeNothing = () => () => {};

interface StatTileProps {
    href: string;
    icon: LucideIcon;
    label: string;
    value: number | null;
}

function StatTile({ href, icon: Icon, label, value }: StatTileProps) {
    return (
        <Link href={href} className="rounded-2xl bg-card px-4 py-4 transition-colors hover:bg-secondary">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
            </div>
            <div className="mt-2 text-3xl font-normal tracking-tight tabular-nums">{value ?? "–"}</div>
        </Link>
    );
}

/** 首页顶部欢迎区：问候语 + 错题本/错题数量 + 今日待复习 */
export function HomeHero({ notebookCount, itemCount, dueCount, targetNotebook, targetPracticeHref }: HomeHeroProps) {
    const { t, language } = useLanguage();
    const { data: session } = useSession();
    // 问候语依赖本地时间，服务端渲染时返回 null，避免两端渲染不一致
    const hour = useSyncExternalStore(subscribeNothing, () => new Date().getHours(), () => null);

    const greeting = hour === null
        ? t.common.welcome.replace(/[，,\s]+$/, "")
        : hour < 12 ? t.home.greetingMorning
            : hour < 18 ? t.home.greetingAfternoon
                : t.home.greetingEvening;
    const name = session?.user?.name || session?.user?.email || "";

    return (
        <section className="space-y-7 py-3 md:py-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", { dateStyle: "full" }).format(new Date())}</p>
                    <h1 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">
                        {greeting}{name && `${language === "zh" ? "，" : ", "}${name}`}
                    </h1>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">{t.home.heroSubtitle}</p>
                    {targetNotebook && (
                        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                            <Target className="h-3.5 w-3.5" />
                            {t.home.targetNotebook.replace("{name}", targetNotebook)}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-3 md:w-[27rem]">
                    <StatTile href="/notebooks" icon={BookOpen} label={t.home.notebookCount} value={notebookCount} />
                    <StatTile href="/notebooks" icon={ListChecks} label={t.home.itemCount} value={itemCount} />
                    <StatTile href="/review" icon={CalendarCheck} label={t.home.dueCount} value={dueCount} />
                </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,.95fr)]">
                <section className="rounded-[1.35rem] border border-border/80 bg-card p-5">
                    <div className="mb-4 flex items-baseline justify-between"><div><h2 className="font-semibold">今天这样学</h2><p className="mt-1 text-xs text-muted-foreground">先复习，再用一道新情境题确认是否真的会。</p></div><Link href="/review" className="text-xs text-primary">查看完整计划</Link></div>
                    <div className="space-y-2">
                        <Link href="/review" className="grid grid-cols-[1.9rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/80 p-3 transition-colors hover:border-primary/35 hover:bg-secondary/50"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs text-primary">01</span><span><b className="block text-sm font-medium">完成今天的间隔复习</b><small className="mt-1 block text-xs text-muted-foreground">{dueCount === null ? "正在计算待复习任务" : dueCount > 0 ? `有 ${dueCount} 道题等待独立作答` : "今天没有到期题，可以先做靶向练习"} · 尽量不使用提示</small></span><span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">现在做</span></Link>
                        <Link href={targetPracticeHref} className="grid grid-cols-[1.9rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/80 p-3 transition-colors hover:border-primary/35 hover:bg-secondary/50"><span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs text-muted-foreground">02</span><span><b className="block text-sm font-medium">做一道靶向验证题</b><small className="mt-1 block text-xs text-muted-foreground">围绕尚未确认的知识漏洞，换一个情境检验规则边界</small></span><span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">待验证</span></Link>
                        <Link href="/entry" className="grid grid-cols-[1.9rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/80 p-3 transition-colors hover:border-primary/35 hover:bg-secondary/50"><span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs text-muted-foreground">03</span><span><b className="block text-sm font-medium">记录今天的新卡点</b><small className="mt-1 block text-xs text-muted-foreground">保留原题、错答和过程，才能形成可信的学习建议</small></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>
                    </div>
                </section>
                <section className="rounded-[1.35rem] border border-primary/15 bg-[oklch(0.975_0.01_160)] p-5">
                    <div className="mb-4 flex items-baseline justify-between"><h2 className="font-semibold">你的学习建议</h2><Link href="/knowledge-units" className="text-xs text-primary">查看依据</Link></div>
                    <ol className="space-y-3 text-sm"><li className="flex gap-3 border-b border-border/70 pb-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] text-primary">1</span><span><b className="block font-medium">错在哪？</b><small className="text-muted-foreground">先记录看得见的错答和遗漏条件。</small></span></li><li className="flex gap-3 border-b border-border/70 pb-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] text-primary">2</span><span><b className="block font-medium">为什么？</b><small className="text-muted-foreground">再判断规则、边界或解题步骤的卡点。</small></span></li><li className="flex gap-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">3</span><span><b className="block font-medium">接下来练什么？</b><small className="text-muted-foreground">用新情境题验证，提示后完成不算独立掌握。</small></span></li></ol>
                    <Link href={targetPracticeHref} className="mt-5 flex items-center justify-center rounded-xl bg-foreground px-3 py-2.5 text-sm font-medium text-background">开始一次靶向练习</Link>
                </section>
            </div>
            <section className="grid gap-4 md:grid-cols-[1.2fr_.8fr]">
                <div className="rounded-[1.35rem] border border-border/80 bg-card p-5"><div className="flex items-baseline justify-between"><h2 className="font-semibold">掌握需要哪些证据？</h2><Link href="/knowledge-units" className="text-xs text-primary">全部记录</Link></div><p className="mt-2 text-xs text-muted-foreground">一题做对不等于掌握。系统会分别记录独立作答、提示依赖、跨题验证与间隔复习。</p><div className="mt-6 grid grid-cols-4 gap-1 text-center text-[11px] text-muted-foreground"><span className="border-t-2 border-primary pt-3">发现错因</span><span className="border-t-2 border-primary pt-3">初步通过</span><span className="border-t-2 border-border pt-3">跨题验证</span><span className="border-t-2 border-border pt-3">间隔复习</span></div></div>
                <div className="rounded-[1.35rem] bg-secondary p-5"><h2 className="font-semibold">成长建议</h2><p className="mt-3 font-serif text-2xl leading-tight tracking-tight">遇到陌生题，先问：<em className="text-primary not-italic">这个规则现在真的能用吗？</em></p><p className="mt-4 text-xs leading-5 text-muted-foreground">这是基于学习记录的审题提醒，不是对学生的标签；持续完成验证题后，建议会逐步更新。</p></div>
            </section>
        </section>
    );
}
