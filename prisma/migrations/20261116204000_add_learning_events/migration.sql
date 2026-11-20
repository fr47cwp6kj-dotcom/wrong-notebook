CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "errorItemId" TEXT,
    "questionKey" TEXT,
    "result" TEXT,
    "independent" BOOLEAN NOT NULL DEFAULT false,
    "hintLevel" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "KnowledgeUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LearningEvent_userId_requestId_key" ON "LearningEvent"("userId", "requestId");
CREATE INDEX "LearningEvent_unitId_createdAt_idx" ON "LearningEvent"("unitId", "createdAt");
CREATE INDEX "LearningEvent_userId_kind_createdAt_idx" ON "LearningEvent"("userId", "kind", "createdAt");
