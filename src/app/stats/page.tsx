"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";
import { GrowthAdvice } from "@/components/growth-advice";
import { PageHeader } from "@/components/ui/page-header";

export default function StatsPage() {
    const { t } = useLanguage();
    usePageTitle(t.stats.headerTitle);

    return (
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
            <PageHeader
                title={t.stats?.headerTitle || "Growth Advice"}
                description={t.stats?.headerDesc || "Start with what you should practice next, then review all data below"}
            />
            <GrowthAdvice />
        </main>
    );
}
