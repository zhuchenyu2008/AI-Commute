-- CreateTable
CREATE TABLE "TelegramChatState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chatId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activeAgentSessionId" TEXT,
  "activeTripId" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'idle',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TelegramChatState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TelegramChatState_activeAgentSessionId_fkey" FOREIGN KEY ("activeAgentSessionId") REFERENCES "AgentSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TelegramChatState_activeTripId_fkey" FOREIGN KEY ("activeTripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramBotState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lastUpdateId" INTEGER,
  "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChatState_chatId_key" ON "TelegramChatState"("chatId");

-- CreateIndex
CREATE INDEX "TelegramChatState_userId_idx" ON "TelegramChatState"("userId");

-- CreateIndex
CREATE INDEX "TelegramChatState_activeAgentSessionId_idx" ON "TelegramChatState"("activeAgentSessionId");

-- CreateIndex
CREATE INDEX "TelegramChatState_activeTripId_idx" ON "TelegramChatState"("activeTripId");

-- CreateIndex
CREATE INDEX "TelegramChatState_mode_idx" ON "TelegramChatState"("mode");
