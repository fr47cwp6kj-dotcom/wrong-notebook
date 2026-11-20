-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PracticeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT,
    "difficulty" TEXT,
    "isCorrect" BOOLEAN,
    "errorItemId" TEXT,
    "result" TEXT,
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "questionText" TEXT,
    "answerText" TEXT,
    "analysis" TEXT,
    "wrongAnswerText" TEXT,
    "mistakeAnalysis" TEXT,
    "originalImageUrl" TEXT,
    "figureSvg" TEXT,
    "source" TEXT NOT NULL DEFAULT 'practice',
    "examQuestionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticeRecord_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticeRecord_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamQuestion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PracticeRecord" ("analysis", "answerText", "createdAt", "difficulty", "errorItemId", "examQuestionId", "figureSvg", "id", "isCorrect", "mistakeAnalysis", "originalImageUrl", "questionText", "result", "source", "subject", "userId", "wrongAnswerText") SELECT "analysis", "answerText", "createdAt", "difficulty", "errorItemId", "examQuestionId", "figureSvg", "id", "isCorrect", "mistakeAnalysis", "originalImageUrl", "questionText", "result", "source", "subject", "userId", "wrongAnswerText" FROM "PracticeRecord";
DROP TABLE "PracticeRecord";
ALTER TABLE "new_PracticeRecord" RENAME TO "PracticeRecord";
CREATE INDEX "PracticeRecord_errorItemId_createdAt_idx" ON "PracticeRecord"("errorItemId", "createdAt");
CREATE INDEX "PracticeRecord_examQuestionId_idx" ON "PracticeRecord"("examQuestionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
