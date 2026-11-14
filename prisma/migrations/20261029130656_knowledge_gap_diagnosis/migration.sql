-- CreateTable
CREATE TABLE "KnowledgeUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerRule" TEXT NOT NULL,
    "boundary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GapDiagnosis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originId" TEXT NOT NULL,
    "errorItemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "practiceReviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GapDiagnosis_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GapDiagnosis_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "KnowledgeUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnitPracticeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "diagnosisId" TEXT NOT NULL,
    "practiceIndex" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitPracticeEvent_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "GapDiagnosis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeUnit_userId_stage_subject_unitKey_key" ON "KnowledgeUnit"("userId", "stage", "subject", "unitKey");

-- CreateIndex
CREATE INDEX "GapDiagnosis_unitId_idx" ON "GapDiagnosis"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "GapDiagnosis_errorItemId_originId_key" ON "GapDiagnosis"("errorItemId", "originId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitPracticeEvent_diagnosisId_requestId_key" ON "UnitPracticeEvent"("diagnosisId", "requestId");
