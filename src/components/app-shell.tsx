"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { BarChart3, BookOpen, CalendarCheck, FileText, LogOut, PlusCircle, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSetupRedirect } from "@/lib/use-setup-redirect";
import { cn } from "@/lib/utils";

/** 登录、注册与打印页不显示导航 */
const BARE_PATHS = [/^\/login/, /^\/register/, /^\/setup/, /^\/print-preview/, /^\/exams\/[^/]+\/print/];

type NavKey = "home" | "entry" | "notebooks" | "review" | "stats" | "exams" | "units";

interface NavItem {
    key: NavKey;
    href: string;
    icon: LucideIcon;
    match: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
    { key: "home", href: "/home", icon: BookOpen, match: (p) => p === "/" || p === "/home" },
    { key: "entry", href: "/entry", icon: PlusCircle, match: (p) => p.startsWith("/entry") },
    { key: "review", href: "/review", icon: CalendarCheck, match: (p) => p.startsWith("/review") },
    {
        key: "notebooks",
        href: "/notebooks",
        icon: BookOpen,
        match: (p) => p.startsWith("/notebooks") || p.startsWith("/error-items") || p.startsWith("/practice"),
    },
    { key: "units", href: "/knowledge-units", icon: BookOpen, match: (p) => p.startsWith("/knowledge-units") },
    { key: "exams", href: "/exams", icon: FileText, match: (p) => p.startsWith("/exams") },
    { key: "stats", href: "/stats", icon: BarChart3, match: (p) => p.startsWith("/stats") || p.startsWith("/tags") },
];

/** 全局导航外壳：桌面端顶部导航栏，移动端顶部标题栏 + 底部标签栏 */
export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || "/";
    const { t } = useLanguage();
    const { data: session, status } = useSession();
    const isAdmin = session?.user?.role === "admin";
    const isBare = BARE_PATHS.some((pattern) => pattern.test(pathname));
    useSetupRedirect(isAdmin && !isBare);

    if (isBare || status === "unauthenticated") {
        return <>{children}</>;
    }

    const userName = session?.user?.name || session?.user?.email || "";

    return (
        <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="hidden min-h-screen border-r border-border/80 bg-background px-4 py-7 md:flex md:flex-col print:hidden">
                <Link href="/home" className="flex items-center gap-2 px-2">
                    <Image src="/icons/icon.png" alt="" width={30} height={30} className="rounded-[9px]" priority unoptimized />
                    <span className="text-base font-semibold tracking-tight">{t.pageTitle.base}</span>
                </Link>
                <p className="mt-8 px-2 text-xs text-muted-foreground">学习</p>
                <nav className="mt-2 grid gap-1">
                    {NAV_ITEMS.map((item) => {
                        const active = item.match(pathname);
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.key}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                    active
                                        ? "bg-accent text-accent-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                                aria-current={active ? "page" : undefined}
                            >
                                <Icon className="h-4 w-4" />
                                {item.key === "home" ? "学习首页" : item.key === "entry" ? "录入错题" : t.nav[item.key]}
                            </Link>
                        );
                    })}
                </nav>
                <div className="mt-auto space-y-2 border-t border-border/80 pt-4">
                    {userName && <p className="truncate px-2 text-sm text-muted-foreground">{userName}</p>}
                    <div className="flex items-center gap-1">
                        {isAdmin && <Link href="/admin" title={t.nav.admin}><Button variant="ghost" size="icon"><Shield className="h-4 w-4" /></Button></Link>}
                        <SettingsDialog />
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => signOut({ callbackUrl: "/login" })} title={t.app.logout}><LogOut className="h-4 w-4" /></Button>
                    </div>
                </div>
            </aside>

            <div className="pb-20 md:pb-0">{children}</div>

            <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 backdrop-blur-md md:hidden print:hidden">
                <div className="grid h-16 grid-cols-6">
                    {NAV_ITEMS.filter((item) => item.key !== "entry").map((item) => {
                        const active = item.match(pathname);
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.key}
                                href={item.href}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                                    active ? "text-primary" : "text-muted-foreground"
                                )}
                                aria-current={active ? "page" : undefined}
                            >
                                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent")}>
                                    <Icon className="h-5 w-5" />
                                </span>
                                {t.nav[item.key]}
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
