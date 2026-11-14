import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:error-items:geogebra');

/** GeoGebra 已移除，旧客户端不再触发 AI 生成。 */
export async function POST() {
    return NextResponse.json({ message: "GEOGEBRA_REMOVED" }, { status: 410 });
}

/**
 * DELETE /api/error-items/:id/geogebra
 * 删除已生成的 GeoGebra 演示命令
 */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        const user = session?.user?.email
            ? await prisma.user.findUnique({ where: { email: session.user.email } })
            : null;
        if (!user) {
            return unauthorized("Authentication required");
        }

        const errorItem = await prisma.errorItem.findUnique({ where: { id }, select: { userId: true } });
        if (!errorItem) {
            return notFound("Item not found");
        }
        if (errorItem.userId !== user.id) {
            return forbidden("Not authorized to access this item");
        }

        await prisma.errorItem.update({ where: { id }, data: { geogebraCommands: null } });
        logger.info({ id }, 'GeoGebra commands deleted');
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ error }, 'Error deleting GeoGebra commands');
        return internalError("Failed to delete GeoGebra commands");
    }
}
