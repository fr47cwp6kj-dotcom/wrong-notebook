import { NextResponse } from 'next/server';

export function GET() {
    return NextResponse.json({ app: 'cuoyin-agent-fork', upstream: 'v2026.10.26', feature: 'knowledge-gaps' });
}
