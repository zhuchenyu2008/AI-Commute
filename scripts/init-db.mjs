import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const statements = [
  `CREATE TABLE IF NOT EXISTS "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL DEFAULT '宁波',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "defaultOriginName" TEXT NOT NULL DEFAULT '家',
    "defaultOriginAddress" TEXT NOT NULL DEFAULT '金都嘉园52号',
    "defaultOriginLngLat" TEXT NOT NULL DEFAULT '121.5230315924,29.8652491273',
    "insideVenueMinutes" INTEGER NOT NULL DEFAULT 12,
    "waitAndFrictionMinutes" INTEGER NOT NULL DEFAULT 8,
    "notifyThresholdMinutes" INTEGER NOT NULL DEFAULT 5,
    "routePreferenceJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "destinationName" TEXT NOT NULL,
    "destinationAddress" TEXT,
    "destinationLngLat" TEXT NOT NULL,
    "originName" TEXT NOT NULL,
    "originLngLat" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '宁波',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "arriveByLocal" TEXT NOT NULL,
    "latestDepartLocal" TEXT,
    "estimatedArriveLocal" TEXT,
    "totalMinutes" INTEGER,
    "routeType" TEXT NOT NULL DEFAULT 'mixed',
    "chosenPlanKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "riskLevel" TEXT NOT NULL DEFAULT 'onTime',
    "mapImageUrl" TEXT,
    "bufferJson" TEXT NOT NULL DEFAULT '{}',
    "notificationJson" TEXT NOT NULL DEFAULT '{}',
    "deletedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "TripRouteOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "routeType" TEXT NOT NULL,
    "baseMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "latestDepartLocal" TEXT NOT NULL,
    "isChosen" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "TripRouteOption_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "TripRouteOption_tripId_idx" ON "TripRouteOption"("tripId")`,
  `CREATE TABLE IF NOT EXISTS "TripSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "TripSegment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "TripSegment_tripId_idx" ON "TripSegment"("tripId")`,
  `CREATE TABLE IF NOT EXISTS "ReminderJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "agentSessionId" TEXT,
    "kind" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "ranAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderJob_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReminderJob_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "ReminderJob_status_scheduledAt_idx" ON "ReminderJob"("status", "scheduledAt")`,
  `CREATE INDEX IF NOT EXISTS "ReminderJob_tripId_idx" ON "ReminderJob"("tripId")`,
  `CREATE INDEX IF NOT EXISTS "ReminderJob_agentSessionId_idx" ON "ReminderJob"("agentSessionId")`,
  `CREATE TABLE IF NOT EXISTS "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentSessionId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "label" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "sourceText" TEXT,
    "confidence" REAL,
    "deletedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Memory_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "AgentSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Memory_type_status_idx" ON "Memory"("type", "status")`,
  `CREATE INDEX IF NOT EXISTS "Memory_agentSessionId_idx" ON "Memory"("agentSessionId")`,
  `CREATE TABLE IF NOT EXISTS "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL DEFAULT 'Agent session',
    "tripId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentSession_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentSession_tripId_idx" ON "AgentSession"("tripId")`,
  `CREATE INDEX IF NOT EXISTS "AgentSession_status_updatedAt_idx" ON "AgentSession"("status", "updatedAt")`,
  `CREATE TABLE IF NOT EXISTS "AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentMessage_sessionId_createdAt_idx" ON "AgentMessage"("sessionId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "AgentToolCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "toolName" TEXT NOT NULL,
    "argumentsJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'done',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentToolCall_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentToolCall_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AgentMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentToolCall_sessionId_createdAt_idx" ON "AgentToolCall"("sessionId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AgentToolCall_messageId_idx" ON "AgentToolCall"("messageId")`,
  `CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "NotificationLog_dedupeKey_idx" ON "NotificationLog"("dedupeKey")`,
  `CREATE INDEX IF NOT EXISTS "NotificationLog_tripId_idx" ON "NotificationLog"("tripId")`
];

async function main() {
  ensureSqliteDirectory();
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  await ensureCompatibilityColumns();
  await seed();
}

function ensureSqliteDirectory() {
  const raw = process.env.DATABASE_URL || "file:./data/commute.db";
  if (!raw.startsWith("file:")) return;
  const filePath = raw.slice("file:".length);
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

async function seed() {
  await prisma.profile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      city: "宁波",
      timezone: "Asia/Shanghai",
      defaultOriginName: "家",
      defaultOriginAddress: "金都嘉园52号",
      defaultOriginLngLat: "121.5230315924,29.8652491273"
    }
  });

  const existing = await prisma.appSetting.findUnique({ where: { key: "passwordHash" } });
  if (!existing) {
    const raw = process.env.APP_INITIAL_PASSWORD || "change-me-now";
    await prisma.appSetting.create({
      data: { key: "passwordHash", value: await bcrypt.hash(raw, 12) }
    });
  }

  await prisma.memory.upsert({
    where: { id: "mem_company" },
    update: {},
    create: {
      id: "mem_company",
      type: "place",
      label: "公司",
      status: "confirmed",
      valueJson: JSON.stringify({
        name: "科技园中心",
        address: "宁波科技园中心",
        city: "宁波",
        lngLat: "121.624600,29.864300",
        estimateMinutes: 25
      })
    }
  });
  await prisma.memory.upsert({
    where: { id: "mem_gym" },
    update: {},
    create: {
      id: "mem_gym",
      type: "place",
      label: "健身房",
      status: "confirmed",
      valueJson: JSON.stringify({
        name: "健身房",
        address: "宁波健身房",
        city: "宁波",
        lngLat: "121.553500,29.858900",
        estimateMinutes: 15
      })
    }
  });
}

async function ensureCompatibilityColumns() {
  await addColumnIfMissing("ReminderJob", "agentSessionId", "TEXT");
  await addColumnIfMissing("ReminderJob", "payloadJson", "TEXT NOT NULL DEFAULT '{}'");
  await addColumnIfMissing("ReminderJob", "reason", "TEXT");
  await addColumnIfMissing("Memory", "agentSessionId", "TEXT");
  await addColumnIfMissing("Memory", "metadataJson", "TEXT NOT NULL DEFAULT '{}'");
}

async function addColumnIfMissing(table, column, definition) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
  if (columns.some((item) => item.name === column)) {
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
}

main()
  .then(() => console.log("Database initialized"))
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
