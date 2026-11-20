import { describe, expect, it } from "vitest";
import { sortRegionsForMerge } from "@/lib/image-crop";
import type { ImageRegion } from "@/lib/image-crop";

describe("sortRegionsForMerge", () => {
    it("按纵向位置排序，题干在上配图在下", () => {
        const figure: ImageRegion = { x: 0.5, y: 0.6, width: 0.3, height: 0.2 };
        const text: ImageRegion = { x: 0.1, y: 0.05, width: 0.8, height: 0.4 };

        expect(sortRegionsForMerge([figure, text])).toEqual([text, figure]);
    });

    it("同一行的多个区域按横向顺序排列", () => {
        const left: ImageRegion = { x: 0.55, y: 0.5, width: 0.4, height: 0.1 };
        const right: ImageRegion = { x: 0.05, y: 0.5, width: 0.4, height: 0.1 };

        expect(sortRegionsForMerge([left, right])).toEqual([right, left]);
    });

    it("多个区域跨行时先按行再按列", () => {
        const text: ImageRegion = { x: 0.05, y: 0.0, width: 0.9, height: 0.3 };
        const leftFigure: ImageRegion = { x: 0.05, y: 0.4, width: 0.4, height: 0.3 };
        const rightFigure: ImageRegion = { x: 0.55, y: 0.4, width: 0.4, height: 0.3 };

        expect(sortRegionsForMerge([rightFigure, text, leftFigure])).toEqual([text, leftFigure, rightFigure]);
    });

    it("不修改传入的数组", () => {
        const regions: ImageRegion[] = [
            { x: 0, y: 0.8, width: 0.5, height: 0.1 },
            { x: 0, y: 0.1, width: 0.5, height: 0.1 },
        ];
        const snapshot = [...regions];

        sortRegionsForMerge(regions);

        expect(regions).toEqual(snapshot);
    });
});
