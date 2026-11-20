import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";

/** 整卷图 data URL 的最大长度，与 originalImageUrl 上限一致 */
export const MAX_PAPER_IMAGE_LENGTH = 20 * 1024 * 1024;

/** 按内容哈希在用户内查找整卷图，不存在时创建；同一张试卷的多道错题共享一条记录 */
export async function findOrCreatePaperImage(
    client: Prisma.TransactionClient,
    userId: string,
    dataUrl: string,
): Promise<{ id: string }> {
    const hash = createHash("sha256").update(dataUrl).digest("hex");
    const existing = await client.paperImage.findUnique({
        where: { userId_hash: { userId, hash } },
        select: { id: true },
    });
    if (existing) return existing;
    return client.paperImage.create({
        data: { userId, hash, dataUrl },
        select: { id: true },
    });
}
