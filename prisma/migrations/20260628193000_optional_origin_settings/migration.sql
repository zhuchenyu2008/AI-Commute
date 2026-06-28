PRAGMA foreign_keys=OFF;

CREATE TABLE "new_UserSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "defaultCity" TEXT NOT NULL DEFAULT '宁波',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "originName" TEXT,
  "originLngLat" TEXT,
  "routePreference" TEXT NOT NULL DEFAULT 'balanced',
  "telegramChatId" TEXT,
  "emailRecipient" TEXT,
  "reminderCadenceJson" TEXT NOT NULL DEFAULT '[30,20,15,10,5,0]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_UserSettings" (
  "id",
  "userId",
  "defaultCity",
  "timezone",
  "originName",
  "originLngLat",
  "routePreference",
  "telegramChatId",
  "emailRecipient",
  "reminderCadenceJson",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "userId",
  "defaultCity",
  "timezone",
  "originName",
  "originLngLat",
  "routePreference",
  "telegramChatId",
  "emailRecipient",
  "reminderCadenceJson",
  "createdAt",
  "updatedAt"
FROM "UserSettings";

DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

PRAGMA foreign_keys=ON;
