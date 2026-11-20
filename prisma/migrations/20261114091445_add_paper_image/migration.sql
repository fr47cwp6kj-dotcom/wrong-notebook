-- CreateTable
CREATE TABLE "PaperImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ErrorItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortId" TEXT,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "originalImageUrl" TEXT NOT NULL,
    "ocrText" TEXT,
    "paperImageId" TEXT,
    "questionText" TEXT,
    "answerText" TEXT,
    "analysis" TEXT,
    "wrongAnswerText" TEXT,
    "mistakeAnalysis" TEXT,
    "mistakeStatus" TEXT,
    "knowledgePoints" TEXT,
    "questionKnowledgePoints" TEXT,
    "geogebraCommands" TEXT,
    "svgAnimation" TEXT,
    "svgAnimationEn" TEXT,
    "source" TEXT,
    "errorType" TEXT,
    "userNotes" TEXT,
    "masteryLevel" INTEGER NOT NULL DEFAULT 0,
    "gradeSemester" TEXT,
    "paperLevel" TEXT,
    "difficultyStars" INTEGER,
    "hasFigure" BOOLEAN NOT NULL DEFAULT false,
    "figureSvg" TEXT,
    "lastPractice" TEXT,
    "masteryProbability" REAL,
    "masteryReason" TEXT,
    "masterySource" TEXT,
    "masteryEvaluatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ErrorItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorItem_paperImageId_fkey" FOREIGN KEY ("paperImageId") REFERENCES "PaperImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ErrorItem" ("analysis", "answerText", "createdAt", "difficultyStars", "errorType", "figureSvg", "geogebraCommands", "gradeSemester", "hasFigure", "id", "knowledgePoints", "lastPractice", "masteryEvaluatedAt", "masteryLevel", "masteryProbability", "masteryReason", "masterySource", "mistakeAnalysis", "mistakeStatus", "ocrText", "originalImageUrl", "paperLevel", "questionKnowledgePoints", "questionText", "shortId", "source", "subjectId", "svgAnimation", "svgAnimationEn", "updatedAt", "userId", "userNotes", "wrongAnswerText") SELECT "analysis", "answerText", "createdAt", "difficultyStars", "errorType", "figureSvg", "geogebraCommands", "gradeSemester", "hasFigure", "id", "knowledgePoints", "lastPractice", "masteryEvaluatedAt", "masteryLevel", "masteryProbability", "masteryReason", "masterySource", "mistakeAnalysis", "mistakeStatus", "ocrText", "originalImageUrl", "paperLevel", "questionKnowledgePoints", "questionText", "shortId", "source", "subjectId", "svgAnimation", "svgAnimationEn", "updatedAt", "userId", "userNotes", "wrongAnswerText" FROM "ErrorItem";
DROP TABLE "ErrorItem";
ALTER TABLE "new_ErrorItem" RENAME TO "ErrorItem";
CREATE UNIQUE INDEX "ErrorItem_shortId_key" ON "ErrorItem"("shortId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PaperImage_userId_hash_key" ON "PaperImage"("userId", "hash");
