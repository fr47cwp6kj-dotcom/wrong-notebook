"use client";
import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export function LearningAssistant() {
    const pathname = usePathname(); const params = useSearchParams();
    const [open, setOpen] = useState(false); const [message, setMessage] = useState(''); const [answer, setAnswer] = useState(''); const [loading, setLoading] = useState(false);
    const ask = async () => { if (!message.trim()) return; setLoading(true); try { const pageContext = pathname.startsWith('/practice') ? sessionStorage.getItem('learning-assistant-practice-context') : null; const data = await apiClient.post<{ answer: string }>('/api/learning-assistant', { message, pathname, errorItemId: params.get('id') || undefined, pageContext }); setAnswer(data.answer); } finally { setLoading(false); } };
    return <div className="fixed bottom-24 right-4 z-50 md:bottom-6 md:right-6"><Button className="rounded-full shadow-lg" onClick={() => setOpen(value => !value)}><Bot className="mr-2 h-4 w-4" />问小隙</Button>{open && <section className="mt-3 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-card p-4 shadow-xl"><h2 className="font-semibold">小隙</h2><p className="mt-1 text-xs text-muted-foreground">我会参考当前页面；先说说你卡在哪一步。</p>{answer && <div className="mt-3 rounded-xl bg-muted p-3 text-sm leading-6"><MarkdownRenderer content={answer} /></div>}<Textarea className="mt-3 min-h-20" value={message} onChange={event => setMessage(event.target.value)} placeholder="例如：我不知道这一步为什么能这样列式" /><Button className="mt-2 w-full" disabled={loading || !message.trim()} onClick={ask}><Send className="mr-2 h-4 w-4" />{loading ? '正在思考…' : '发送'}</Button></section>}</div>;
}
