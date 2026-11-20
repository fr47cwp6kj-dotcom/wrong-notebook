import { createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { findOrCreatePaperImage } from "@/lib/paper-image";

type CreateData = { userId: string; hash: string; dataUrl: string };

function createClient(existing: { id: string } | null): Prisma.TransactionClient {
    return {
        paperImage: {
            findUnique: vi.fn(async () => existing),
            create: vi.fn(async ({ data }: { data: CreateData }) => ({ id: `created-${data.hash.slice(0, 6)}` })),
        },
    } as unknown as Prisma.TransactionClient;
}

const DATA_URL = "data:image/jpeg;base64,cGFwZXI=";

describe("findOrCreatePaperImage", () => {
    it("已存在相同内容的整卷图时直接复用，不新建", async () => {
        const client = createClient({ id: "existing-1" });
        const result = await findOrCreatePaperImage(client, "user-1", DATA_URL);
        expect(result.id).toBe("existing-1");
        expect(client.paperImage.create).not.toHaveBeenCalled();
        expect(client.paperImage.findUnique).toHaveBeenCalledWith({
            where: { userId_hash: { userId: "user-1", hash: createHash("sha256").update(DATA_URL).digest("hex") } },
            select: { id: true },
        });
    });

    it("不存在时按内容哈希创建并返回新记录", async () => {
        const client = createClient(null);
        const result = await findOrCreatePaperImage(client, "user-1", DATA_URL);
        expect(result.id).toBe(`created-${createHash("sha256").update(DATA_URL).digest("hex").slice(0, 6)}`);
        expect(client.paperImage.create).toHaveBeenCalledWith({
            data: { userId: "user-1", hash: createHash("sha256").update(DATA_URL).digest("hex"), dataUrl: DATA_URL },
            select: { id: true },
        });
    });
});
