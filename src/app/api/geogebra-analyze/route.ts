import { NextResponse } from "next/server";

/** GeoGebra 已移除，旧客户端不再触发 AI 生成。 */
export async function POST() {
    return NextResponse.json({ message: "GEOGEBRA_REMOVED" }, { status: 410 });
}
