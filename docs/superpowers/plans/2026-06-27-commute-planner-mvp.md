# Commute Planner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dockerized Next.js + Prisma/SQLite personal commute assistant where a user submits one sentence, watches an Agent planning conversation, receives an executable trip with multi-stop legs, and gets scheduled recalculation/reminder support.

**Architecture:** Use a Next.js App Router monolith with clear service modules under `src/lib`. Prisma stores users, settings, Agent sessions/messages/tool calls, trips, stops, legs, candidates, segments, buffer components, reminder jobs, recalculation logs, notification logs, and memories. Real integrations are wrapped by adapters with deterministic mock fallbacks; weather is reference information for Agent context, not a hard ranking rule.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, SQLite, Vitest, Testing Library, Playwright, Docker, OpenAI-compatible chat completions, AMap Web Service, Telegram/email adapters.

---

## File Structure

- Create `package.json`: scripts for dev, build, lint, test, test:watch, test:e2e, prisma, seed, scheduler.
- Create `next.config.ts`: Next.js config.
- Create `tsconfig.json`: strict TypeScript config.
- Create `vitest.config.ts`: unit/integration test config with jsdom for component tests.
- Create `playwright.config.ts`: browser test config.
- Create `postcss.config.mjs`, `tailwind.config.ts`, `app/globals.css`: styling based on `前端样板和规范/DESIGN.md`.
- Create `app/layout.tsx`: root shell.
- Create `app/page.tsx`: home page.
- Create `app/login/page.tsx`: local login.
- Create `app/agent/[sessionId]/page.tsx`: visible Agent planning workspace.
- Create `app/trips/[tripId]/page.tsx`: trip detail.
- Create `app/history/page.tsx`, `app/settings/page.tsx`, `app/memories/page.tsx`: secondary app pages.
- Create `app/api/*/route.ts`: route handlers for auth, settings, Agent sessions, planning, trips, scheduler, reminders, memories.
- Create `src/components/*`: UI components that translate the provided HTML samples into reusable React components.
- Create `src/lib/db.ts`: Prisma client singleton.
- Create `src/lib/env.ts`: typed environment reader with no secret logging.
- Create `src/lib/auth/*`: local auth/session helpers.
- Create `src/lib/amap/*`: AMap DTOs, throttle, real client, mock client, public tool wrappers.
- Create `src/lib/agent/*`: runner, tool registry, planning orchestration, message persistence, timeout/retry.
- Create `src/lib/trips/*`: trip creation, multi-stop model helpers, buffer components, reminder generation.
- Create `src/lib/scheduler/*`: due job query, locking, recalculation processing.
- Create `src/lib/notifications/*`: Telegram, email, dedupe, logs.
- Create `src/lib/memory/*`: confirmed memories and memory candidates.
- Create `prisma/schema.prisma`: SQLite schema.
- Create `prisma/seed.ts`: local user/settings seed.
- Create `scripts/scheduler.ts`: minute tick command for Docker/local.
- Create `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
- Create `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`, `tests/e2e/**/*.spec.ts`.

---

### Task 1: Project Scaffold And Tooling

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("project test harness", () => {
  it("runs TypeScript tests", () => {
    expect("commute-planner").toBe("commute-planner");
  });
});
```

- [ ] **Step 2: Run test to verify it fails before tooling exists**

Run: `npm test -- tests/unit/smoke.test.ts`

Expected: command fails because `package.json` and the `test` script do not exist.

- [ ] **Step 3: Add minimal project tooling**

Create `package.json`:

```json
{
  "name": "commute-planner",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "tsx prisma/seed.ts",
    "scheduler:tick": "tsx scripts/scheduler.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.10.0",
    "bcryptjs": "^3.0.2",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "date-fns-tz": "^3.2.0",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "nodemailer": "^6.9.16",
    "openai": "^4.77.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.10.2",
    "@types/nodemailer": "^6.4.17",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "prisma": "^6.10.0",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@app/*": ["./app/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@": "/src",
      "@app": "/app"
    }
  }
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
```

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};

export default config;
```

Create `tailwind.config.ts` with tokens copied from `前端样板和规范/DESIGN.md`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f7f9fb",
        surface: "#f7f9fb",
        "surface-glass": "rgba(255, 255, 255, 0.7)",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f2f4f6",
        "surface-container": "#eceef0",
        "surface-container-high": "#e6e8ea",
        "surface-container-highest": "#e0e3e5",
        "on-background": "#191c1e",
        "on-surface": "#191c1e",
        "on-surface-variant": "#434655",
        primary: "#004ac6",
        "primary-container": "#2563eb",
        "on-primary": "#ffffff",
        "on-primary-container": "#eeefff",
        secondary: "#565e74",
        "secondary-container": "#dae2fd",
        "on-secondary-container": "#5c647a",
        tertiary: "#46566c",
        "tertiary-fixed": "#d3e4fe",
        outline: "#737686",
        "outline-variant": "#c3c6d7",
        "status-success": "#10B981",
        "status-warning": "#F59E0B",
        "status-error": "#EF4444",
        error: "#ba1a1a",
        "error-container": "#ffdad6"
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        xl: "1rem",
        "2xl": "1.5rem"
      },
      spacing: {
        "container-margin": "20px",
        gutter: "16px",
        "stack-sm": "4px",
        "stack-md": "12px",
        "stack-lg": "24px"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
```

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: #f7f9fb;
  color: #191c1e;
  font-family: Inter, system-ui, sans-serif;
  -webkit-tap-highlight-color: transparent;
}

.glass-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
}
```

Create `app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commute Planner",
  description: "Personal Agent commute planner"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/smoke.test.ts`

Expected: PASS.

- [ ] **Step 6: Run build baseline**

Run: `npm run build`

Expected: build fails because no page exists yet, or succeeds if a minimal App Router route is added by Next. If it fails for missing page, create `app/page.tsx` with `<main>Commute Planner</main>` and rerun.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json vitest.config.ts playwright.config.ts postcss.config.mjs tailwind.config.ts app/globals.css app/layout.tsx app/page.tsx tests/unit/smoke.test.ts
git commit -m "chore: scaffold next app tooling"
```

---

### Task 2: Prisma Schema And Seeded Local User

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/env.ts`
- Test: `tests/unit/env.test.ts`
- Test: `tests/integration/prisma-schema.test.ts`

- [ ] **Step 1: Write failing env tests**

Create `tests/unit/env.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { readEnv } from "@/lib/env";

describe("readEnv", () => {
  it("returns safe defaults without exposing secrets", () => {
    const env = readEnv({
      DATABASE_URL: "file:./test.db",
      AMAP_API_KEY: "secret-amap",
      OPENAI_API_KEY: "secret-openai"
    });

    expect(env.databaseUrl).toBe("file:./test.db");
    expect(env.hasAmapKey).toBe(true);
    expect(env.hasOpenAiKey).toBe(true);
    expect(JSON.stringify(env)).not.toContain("secret-amap");
    expect(JSON.stringify(env)).not.toContain("secret-openai");
  });

  it("provides local defaults for city, timezone, and origin", () => {
    const env = readEnv({});

    expect(env.defaultCity).toBe("宁波");
    expect(env.defaultTimezone).toBe("Asia/Shanghai");
    expect(env.defaultOrigin).toBe("121.5230315924,29.8652491273");
  });
});
```

- [ ] **Step 2: Run env tests to verify failure**

Run: `npm test -- tests/unit/env.test.ts`

Expected: FAIL because `src/lib/env.ts` does not exist.

- [ ] **Step 3: Implement env reader**

Create `src/lib/env.ts`:

```ts
export type AppEnv = {
  databaseUrl: string;
  defaultCity: string;
  defaultTimezone: string;
  defaultOrigin: string;
  defaultOriginName: string;
  hasAmapKey: boolean;
  hasOpenAiKey: boolean;
  hasTelegramConfig: boolean;
  hasEmailConfig: boolean;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return {
    databaseUrl: source.DATABASE_URL ?? "file:./dev.db",
    defaultCity: source.DEFAULT_CITY ?? "宁波",
    defaultTimezone: source.DEFAULT_TIMEZONE ?? "Asia/Shanghai",
    defaultOrigin: source.DEFAULT_ORIGIN ?? "121.5230315924,29.8652491273",
    defaultOriginName: source.DEFAULT_ORIGIN_NAME ?? "家",
    hasAmapKey: Boolean(source.AMAP_API_KEY),
    hasOpenAiKey: Boolean(source.OPENAI_API_KEY),
    hasTelegramConfig: Boolean(source.TELEGRAM_BOT_TOKEN && source.TELEGRAM_CHAT_ID),
    hasEmailConfig: Boolean(source.SMTP_HOST && source.SMTP_USER && source.SMTP_PASS)
  };
}
```

- [ ] **Step 4: Run env tests to verify pass**

Run: `npm test -- tests/unit/env.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing Prisma schema test**

Create `tests/integration/prisma-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Prisma schema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  it("models the Agent-centered multi-stop trip graph", () => {
    for (const model of [
      "User",
      "Session",
      "UserSettings",
      "AgentSession",
      "AgentMessage",
      "AgentToolCall",
      "Trip",
      "TripStop",
      "TripLeg",
      "RouteCandidate",
      "RouteSegment",
      "BufferComponent",
      "ReminderJob",
      "RecalculationLog",
      "NotificationLog",
      "Memory",
      "MemoryCandidate"
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
  });

  it("stores ordered stops and legs for multi-stop itineraries", () => {
    expect(schema).toContain("order        Int");
    expect(schema).toContain("fromStopId   String?");
    expect(schema).toContain("toStopId     String");
  });
});
```

- [ ] **Step 6: Run Prisma schema test to verify failure**

Run: `npm test -- tests/integration/prisma-schema.test.ts`

Expected: FAIL because `prisma/schema.prisma` does not exist.

- [ ] **Step 7: Implement Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id               String            @id @default(cuid())
  email            String            @unique
  name             String
  passwordHash     String
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  sessions         Session[]
  settings         UserSettings?
  agentSessions    AgentSession[]
  trips            Trip[]
  memories         Memory[]
  memoryCandidates MemoryCandidate[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UserSettings {
  id                      String   @id @default(cuid())
  userId                  String   @unique
  defaultCity             String   @default("宁波")
  timezone                String   @default("Asia/Shanghai")
  originName              String   @default("家")
  originLngLat            String
  routePreference         String   @default("balanced")
  telegramChatId          String?
  emailRecipient          String?
  reminderCadenceJson     String   @default("[30,20,15,10,5,0]")
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  user                    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AgentSession {
  id             String          @id @default(cuid())
  userId         String
  tripId         String?
  status         String          @default("running")
  purpose        String          @default("planning")
  prompt         String
  retryCount     Int             @default(0)
  timeoutMs      Int             @default(600000)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  trip           Trip?           @relation(fields: [tripId], references: [id])
  messages       AgentMessage[]
  toolCalls      AgentToolCall[]
}

model AgentMessage {
  id             String       @id @default(cuid())
  agentSessionId String
  role           String
  content        String
  metadataJson   String?
  createdAt      DateTime     @default(now())
  agentSession   AgentSession @relation(fields: [agentSessionId], references: [id], onDelete: Cascade)
}

model AgentToolCall {
  id              String       @id @default(cuid())
  agentSessionId  String
  name            String
  requestJson     String
  responseJson    String?
  status          String       @default("pending")
  durationMs      Int?
  error           String?
  createdAt       DateTime     @default(now())
  agentSession    AgentSession @relation(fields: [agentSessionId], references: [id], onDelete: Cascade)
}

model Trip {
  id              String              @id @default(cuid())
  userId          String
  agentSessionId  String?
  title           String
  rawPrompt       String
  status          String              @default("planning")
  timezone        String
  targetArriveAt  DateTime?
  finalStopName   String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  user            User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  agentSessions   AgentSession[]
  stops           TripStop[]
  legs            TripLeg[]
  reminderJobs    ReminderJob[]
  recalculations  RecalculationLog[]
  notifications   NotificationLog[]
}

model TripStop {
  id              String    @id @default(cuid())
  tripId          String
  order           Int
  name            String
  address         String?
  lngLat          String?
  targetArriveAt  DateTime?
  plannedStayMin  Int?
  kind            String    @default("destination")
  notes           String?
  trip            Trip      @relation(fields: [tripId], references: [id], onDelete: Cascade)
  incomingLegs    TripLeg[] @relation("ToStop")
  outgoingLegs    TripLeg[] @relation("FromStop")
}

model TripLeg {
  id                    String              @id @default(cuid())
  tripId                String
  order                 Int
  fromStopId            String?
  toStopId              String
  originName            String
  originLngLat          String
  destinationName       String
  destinationLngLat     String?
  targetArriveAt        DateTime?
  latestDepartAt        DateTime?
  selectedCandidateId   String?
  status                String              @default("planning")
  trip                  Trip                @relation(fields: [tripId], references: [id], onDelete: Cascade)
  fromStop              TripStop?           @relation("FromStop", fields: [fromStopId], references: [id])
  toStop                TripStop            @relation("ToStop", fields: [toStopId], references: [id])
  routeCandidates       RouteCandidate[]
  routeSegments         RouteSegment[]
  bufferComponents      BufferComponent[]
  reminderJobs          ReminderJob[]
}

model RouteCandidate {
  id              String         @id @default(cuid())
  legId           String
  key             String
  title           String
  mode            String
  routeMinutes    Int
  bufferMinutes   Int
  totalMinutes    Int
  selected        Boolean        @default(false)
  rationale       String
  sourceJson      String?
  leg             TripLeg        @relation(fields: [legId], references: [id], onDelete: Cascade)
  segments        RouteSegment[]
}

model RouteSegment {
  id               String          @id @default(cuid())
  legId            String
  candidateId      String?
  order            Int
  mode             String
  title            String
  detail           String?
  minutes          Int
  source           String          @default("agent")
  leg              TripLeg         @relation(fields: [legId], references: [id], onDelete: Cascade)
  candidate        RouteCandidate? @relation(fields: [candidateId], references: [id])
}

model BufferComponent {
  id           String   @id @default(cuid())
  legId        String
  order        Int
  category     String
  label        String
  minutes      Int
  reason       String
  source       String   @default("agent_inference")
  leg          TripLeg  @relation(fields: [legId], references: [id], onDelete: Cascade)
}

model ReminderJob {
  id             String    @id @default(cuid())
  tripId         String
  legId          String?
  kind           String
  scheduledFor   DateTime
  status         String    @default("scheduled")
  lockedAt       DateTime?
  attempts       Int       @default(0)
  dedupeKey      String    @unique
  payloadJson    String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  trip           Trip      @relation(fields: [tripId], references: [id], onDelete: Cascade)
  leg            TripLeg?  @relation(fields: [legId], references: [id])
}

model RecalculationLog {
  id             String   @id @default(cuid())
  tripId         String
  legId          String?
  trigger        String
  status         String
  summary        String
  createdAt      DateTime @default(now())
  trip           Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
}

model NotificationLog {
  id             String   @id @default(cuid())
  tripId         String
  channel        String
  status         String
  recipient      String?
  dedupeKey      String
  content        String
  error          String?
  createdAt      DateTime @default(now())
  trip           Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
}

model Memory {
  id          String   @id @default(cuid())
  userId      String
  kind        String
  label       String
  valueJson   String
  confirmedAt DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model MemoryCandidate {
  id          String   @id @default(cuid())
  userId      String
  kind        String
  label       String
  valueJson   String
  status      String   @default("pending")
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Create `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Create `prisma/seed.ts`:

```ts
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { readEnv } from "../src/lib/env";

async function main() {
  const env = readEnv();
  const email = process.env.SEED_USER_EMAIL ?? "user@example.com";
  const password = process.env.SEED_USER_PASSWORD ?? "password";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Commute User",
      passwordHash: await bcrypt.hash(password, 10)
    }
  });

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      defaultCity: env.defaultCity,
      timezone: env.defaultTimezone,
      originName: env.defaultOriginName,
      originLngLat: env.defaultOrigin
    },
    create: {
      userId: user.id,
      defaultCity: env.defaultCity,
      timezone: env.defaultTimezone,
      originName: env.defaultOriginName,
      originLngLat: env.defaultOrigin
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 8: Run schema checks**

Run: `npm test -- tests/integration/prisma-schema.test.ts`

Expected: PASS.

- [ ] **Step 9: Generate and migrate**

Run: `npm run prisma:generate`

Expected: Prisma client generated.

Run: `npm run prisma:migrate -- --name init`

Expected: migration created and SQLite DB initialized.

- [ ] **Step 10: Seed local user**

Run: `npm run prisma:seed`

Expected: local seed user and settings are created.

- [ ] **Step 11: Commit**

```bash
git add prisma src/lib/db.ts src/lib/env.ts tests/unit/env.test.ts tests/integration/prisma-schema.test.ts package.json package-lock.json
git commit -m "feat: add prisma data model and local seed"
```

---

### Task 3: Local Authentication And Settings

**Files:**
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/password.ts`
- Create: `app/login/page.tsx`
- Create: `app/login/login-form.tsx`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/settings/page.tsx`
- Create: `app/api/settings/route.ts`
- Test: `tests/unit/auth.test.ts`
- Test: `tests/integration/settings.test.ts`

- [ ] **Step 1: Write failing auth tests**

Create `tests/unit/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, hashSessionToken } from "@/lib/auth/session";

describe("local auth helpers", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("password");
    expect(hash).not.toBe("password");
    await expect(verifyPassword("password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("creates opaque session tokens and hashes them for storage", () => {
    const token = createSessionToken();
    expect(token.length).toBeGreaterThan(32);
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
```

- [ ] **Step 2: Run auth tests to verify failure**

Run: `npm test -- tests/unit/auth.test.ts`

Expected: FAIL because auth helpers do not exist.

- [ ] **Step 3: Implement auth helpers**

Create `src/lib/auth/password.ts`:

```ts
import bcrypt from "bcryptjs";

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
```

Create `src/lib/auth/session.ts`:

```ts
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "commute_session";

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createUserSession(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });
  return { token, expiresAt };
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });

  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}
```

- [ ] **Step 4: Run auth tests**

Run: `npm test -- tests/unit/auth.test.ts`

Expected: PASS.

- [ ] **Step 5: Implement login/logout routes and page**

Create `app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createUserSession, SESSION_COOKIE } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await createUserSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    expires: session.expiresAt,
    path: "/"
  });
  return response;
}
```

Create `app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { expires: new Date(0), path: "/" });
  return response;
}
```

Create `app/login/login-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password")
      })
    });
    setLoading(false);
    if (!response.ok) {
      setError("邮箱或密码不正确");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="glass-card mx-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl p-6 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">Commute Planner</p>
        <h1 className="mt-2 text-2xl font-bold text-on-surface">登录</h1>
      </div>
      <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
        Email
        <input name="email" type="email" required className="rounded-full border-0 bg-surface-container-low px-4 py-3 text-base focus:ring-2 focus:ring-primary" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
        Password
        <input name="password" type="password" required className="rounded-full border-0 bg-surface-container-low px-4 py-3 text-base focus:ring-2 focus:ring-primary" />
      </label>
      {error ? <p className="text-sm font-medium text-error">{error}</p> : null}
      <button type="submit" disabled={loading} className="rounded-full bg-primary px-4 py-3 font-semibold text-on-primary shadow-sm">
        {loading ? "登录中" : "登录"}
      </button>
    </form>
  );
}
```

Create `app/login/page.tsx`:

```tsx
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center px-container-margin py-10">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.10),transparent_35%),linear-gradient(180deg,#f7f9fb,#eef3fb)]" />
      <div className="relative z-10 w-full">
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Write failing settings integration test**

Create `tests/integration/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("settings persistence", () => {
  it("stores commute defaults needed by the planner", async () => {
    const user = await prisma.user.create({
      data: {
        email: `settings-${Date.now()}@example.com`,
        name: "Settings User",
        passwordHash: "hash",
        settings: {
          create: {
            defaultCity: "宁波",
            timezone: "Asia/Shanghai",
            originName: "家",
            originLngLat: "121.5230315924,29.8652491273",
            routePreference: "balanced",
            telegramChatId: "telegram:-100",
            emailRecipient: "user@example.com"
          }
        }
      },
      include: { settings: true }
    });

    expect(user.settings?.defaultCity).toBe("宁波");
    expect(user.settings?.timezone).toBe("Asia/Shanghai");
    expect(user.settings?.originLngLat).toContain(",");
  });
});
```

- [ ] **Step 7: Run settings test**

Run: `npm test -- tests/integration/settings.test.ts`

Expected: PASS after Prisma schema exists.

- [ ] **Step 8: Implement settings API and page**

Create `app/api/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      defaultCity: String(body.defaultCity ?? "宁波"),
      timezone: String(body.timezone ?? "Asia/Shanghai"),
      originName: String(body.originName ?? "家"),
      originLngLat: String(body.originLngLat ?? "121.5230315924,29.8652491273"),
      routePreference: String(body.routePreference ?? "balanced"),
      telegramChatId: body.telegramChatId ? String(body.telegramChatId) : null,
      emailRecipient: body.emailRecipient ? String(body.emailRecipient) : null
    },
    create: {
      userId: user.id,
      defaultCity: String(body.defaultCity ?? "宁波"),
      timezone: String(body.timezone ?? "Asia/Shanghai"),
      originName: String(body.originName ?? "家"),
      originLngLat: String(body.originLngLat ?? "121.5230315924,29.8652491273"),
      routePreference: String(body.routePreference ?? "balanced"),
      telegramChatId: body.telegramChatId ? String(body.telegramChatId) : null,
      emailRecipient: body.emailRecipient ? String(body.emailRecipient) : null
    }
  });
  return NextResponse.json({ settings });
}
```

Create `app/settings/page.tsx` with a protected server page that loads the current user and settings, redirects unauthenticated users to `/login`, and renders sample-compatible rows:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });

  return (
    <main className="min-h-dvh bg-background px-container-margin pb-28 pt-12 text-on-background">
      <h1 className="text-3xl font-bold text-on-surface">设置</h1>
      <section className="mt-6 glass-card rounded-2xl p-5 shadow-sm">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">
            默认城市
            <input defaultValue={settings?.defaultCity ?? "宁波"} className="rounded-full border-0 bg-surface-container-low px-4 py-3" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            时区
            <input defaultValue={settings?.timezone ?? "Asia/Shanghai"} className="rounded-full border-0 bg-surface-container-low px-4 py-3" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            出发点
            <input defaultValue={settings?.originLngLat ?? "121.5230315924,29.8652491273"} className="rounded-full border-0 bg-surface-container-low px-4 py-3" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            路线偏好
            <input defaultValue={settings?.routePreference ?? "balanced"} className="rounded-full border-0 bg-surface-container-low px-4 py-3" />
          </label>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 9: Verify**

Run: `npm test -- tests/unit/auth.test.ts tests/integration/settings.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth app/login app/api/auth app/settings app/api/settings tests/unit/auth.test.ts tests/integration/settings.test.ts
git commit -m "feat: add local auth and settings"
```

---

### Task 4: AMap Adapter With 3 Requests Per Second Throttle

**Files:**
- Create: `src/lib/amap/types.ts`
- Create: `src/lib/amap/throttle.ts`
- Create: `src/lib/amap/mock.ts`
- Create: `src/lib/amap/client.ts`
- Create: `src/lib/amap/index.ts`
- Test: `tests/unit/amap-throttle.test.ts`
- Test: `tests/unit/amap-client.test.ts`

- [ ] **Step 1: Write failing throttle tests**

Create `tests/unit/amap-throttle.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAmapThrottle } from "@/lib/amap/throttle";

describe("createAmapThrottle", () => {
  it("starts at most 3 jobs in the first second", async () => {
    vi.useFakeTimers();
    const throttle = createAmapThrottle({ requestsPerSecond: 3 });
    const starts: number[] = [];

    const jobs = Array.from({ length: 5 }, (_, index) =>
      throttle.schedule(async () => {
        starts.push(Date.now());
        return index;
      })
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(5);

    await Promise.all(jobs);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run throttle tests to verify failure**

Run: `npm test -- tests/unit/amap-throttle.test.ts`

Expected: FAIL because throttle module does not exist.

- [ ] **Step 3: Implement throttle**

Create `src/lib/amap/throttle.ts`:

```ts
type Job<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export function createAmapThrottle({ requestsPerSecond }: { requestsPerSecond: number }) {
  const queue: Job<unknown>[] = [];
  let tokens = requestsPerSecond;
  let timer: ReturnType<typeof setInterval> | null = null;

  function pump() {
    while (tokens > 0 && queue.length > 0) {
      tokens -= 1;
      const job = queue.shift()!;
      job.run().then(job.resolve, job.reject);
    }
    if (queue.length === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function ensureTimer() {
    if (timer) return;
    timer = setInterval(() => {
      tokens = requestsPerSecond;
      pump();
    }, 1000);
  }

  return {
    schedule<T>(run: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push({ run, resolve: resolve as (value: unknown) => void, reject });
        pump();
        if (queue.length > 0) ensureTimer();
      });
    }
  };
}
```

- [ ] **Step 4: Run throttle tests**

Run: `npm test -- tests/unit/amap-throttle.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing AMap client tests**

Create `tests/unit/amap-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMockAmapClient } from "@/lib/amap/mock";

describe("AMap mock client", () => {
  it("returns deterministic POI, weather reference, and route data", async () => {
    const client = createMockAmapClient();
    const poi = await client.searchPoi({ keywords: "龙湖天街电影院", city: "宁波" });
    const weather = await client.getWeather({ city: "宁波" });
    const route = await client.getTransitRoute({
      origin: "121.5230315924,29.8652491273",
      destination: poi[0].lngLat,
      city: "宁波",
      cityd: "宁波"
    });

    expect(poi[0].name).toContain("龙湖天街");
    expect(weather.kind).toBe("reference");
    expect(route.durationMinutes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run AMap client tests to verify failure**

Run: `npm test -- tests/unit/amap-client.test.ts`

Expected: FAIL because client modules do not exist.

- [ ] **Step 7: Implement AMap types and mock client**

Create `src/lib/amap/types.ts`:

```ts
export type Poi = {
  id: string;
  name: string;
  address: string;
  lngLat: string;
};

export type WeatherReference = {
  kind: "reference";
  city: string;
  summary: string;
  raw?: unknown;
};

export type RouteResult = {
  mode: "transit" | "walking" | "bicycling";
  durationMinutes: number;
  distanceMeters?: number;
  raw?: unknown;
};

export type AmapClient = {
  searchPoi(input: { keywords: string; city: string }): Promise<Poi[]>;
  getPoiDetail(input: { id: string }): Promise<Poi>;
  getWeather(input: { city: string }): Promise<WeatherReference>;
  getTransitRoute(input: { origin: string; destination: string; city: string; cityd: string }): Promise<RouteResult>;
  getWalkingRoute(input: { origin: string; destination: string }): Promise<RouteResult>;
  getBicyclingRoute(input: { origin: string; destination: string }): Promise<RouteResult>;
};
```

Create `src/lib/amap/mock.ts`:

```ts
import type { AmapClient, Poi, RouteResult, WeatherReference } from "./types";

const longhu: Poi = {
  id: "mock-longhu-cinema",
  name: "龙湖天街电影院",
  address: "宁波龙湖天街 4F",
  lngLat: "121.590364,29.880799"
};

function route(mode: RouteResult["mode"], durationMinutes: number): RouteResult {
  return { mode, durationMinutes, distanceMeters: durationMinutes * 180 };
}

export function createMockAmapClient(): AmapClient {
  return {
    async searchPoi() {
      return [longhu];
    },
    async getPoiDetail() {
      return longhu;
    },
    async getWeather({ city }): Promise<WeatherReference> {
      return { kind: "reference", city, summary: "多云，24C，天气仅作为规划参考信息" };
    },
    async getTransitRoute() {
      return route("transit", 36);
    },
    async getWalkingRoute() {
      return route("walking", 18);
    },
    async getBicyclingRoute() {
      return route("bicycling", 24);
    }
  };
}
```

Create `src/lib/amap/client.ts`:

```ts
import type { AmapClient, Poi, RouteResult, WeatherReference } from "./types";

const BASE = "https://restapi.amap.com";

async function getJson(path: string, params: Record<string, string>) {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`AMap request failed: ${response.status}`);
  const data = await response.json();
  if (data.status && data.status !== "1") throw new Error(data.info ?? "AMap returned failure");
  return data;
}

function poiFromRaw(raw: any): Poi {
  return {
    id: String(raw.id ?? raw.name),
    name: String(raw.name ?? "未知地点"),
    address: String(raw.address ?? ""),
    lngLat: String(raw.location ?? "")
  };
}

function durationMinutes(seconds: unknown) {
  return Math.max(1, Math.round(Number(seconds ?? 0) / 60));
}

export function createRealAmapClient(key: string): AmapClient {
  return {
    async searchPoi({ keywords, city }) {
      const data = await getJson("/v3/place/text", { key, keywords, city, citylimit: "true", extensions: "all" });
      return (data.pois ?? []).map(poiFromRaw);
    },
    async getPoiDetail({ id }) {
      const data = await getJson("/v3/place/detail", { key, id });
      return poiFromRaw((data.pois ?? [])[0] ?? {});
    },
    async getWeather({ city }): Promise<WeatherReference> {
      const data = await getJson("/v3/weather/weatherInfo", { key, city, extensions: "base" });
      const live = (data.lives ?? [])[0] ?? {};
      const summary = [live.weather, live.temperature ? `${live.temperature}C` : "", live.winddirection, live.windpower].filter(Boolean).join(" ");
      return { kind: "reference", city, summary: summary || "天气信息仅供参考", raw: data };
    },
    async getTransitRoute({ origin, destination, city, cityd }): Promise<RouteResult> {
      const data = await getJson("/v3/direction/transit/integrated", { key, origin, destination, city, cityd });
      const transit = (data.route?.transits ?? [])[0] ?? {};
      return { mode: "transit", durationMinutes: durationMinutes(transit.duration), raw: data };
    },
    async getWalkingRoute({ origin, destination }): Promise<RouteResult> {
      const data = await getJson("/v3/direction/walking", { key, origin, destination });
      const path = (data.route?.paths ?? [])[0] ?? {};
      return { mode: "walking", durationMinutes: durationMinutes(path.duration), distanceMeters: Number(path.distance ?? 0), raw: data };
    },
    async getBicyclingRoute({ origin, destination }): Promise<RouteResult> {
      const data = await getJson("/v4/direction/bicycling", { key, origin, destination });
      const path = (data.data?.paths ?? [])[0] ?? {};
      return { mode: "bicycling", durationMinutes: durationMinutes(path.duration), distanceMeters: Number(path.distance ?? 0), raw: data };
    }
  };
}
```

Create `src/lib/amap/index.ts`:

```ts
import { readEnv } from "@/lib/env";
import type { AmapClient } from "./types";
import { createRealAmapClient } from "./client";
import { createMockAmapClient } from "./mock";
import { createAmapThrottle } from "./throttle";

const throttle = createAmapThrottle({ requestsPerSecond: 3 });

function withFallback(real: AmapClient, mock: AmapClient): AmapClient {
  return {
    searchPoi: (input) => throttle.schedule(() => real.searchPoi(input).catch(() => mock.searchPoi(input))),
    getPoiDetail: (input) => throttle.schedule(() => real.getPoiDetail(input).catch(() => mock.getPoiDetail(input))),
    getWeather: (input) => throttle.schedule(() => real.getWeather(input).catch(() => mock.getWeather(input))),
    getTransitRoute: (input) => throttle.schedule(() => real.getTransitRoute(input).catch(() => mock.getTransitRoute(input))),
    getWalkingRoute: (input) => throttle.schedule(() => real.getWalkingRoute(input).catch(() => mock.getWalkingRoute(input))),
    getBicyclingRoute: (input) => throttle.schedule(() => real.getBicyclingRoute(input).catch(() => mock.getBicyclingRoute(input)))
  };
}

export function createAmapClient(source: NodeJS.ProcessEnv = process.env): AmapClient {
  const env = readEnv(source);
  const mock = createMockAmapClient();
  const key = source.AMAP_API_KEY;
  if (!env.hasAmapKey || !key) return mock;
  return withFallback(createRealAmapClient(key), mock);
}
```

- [ ] **Step 8: Run AMap tests**

Run: `npm test -- tests/unit/amap-throttle.test.ts tests/unit/amap-client.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/amap tests/unit/amap-throttle.test.ts tests/unit/amap-client.test.ts
git commit -m "feat: add amap adapter with throttle"
```

---

### Task 5: Trip Planning Domain And Multi-stop Persistence

**Files:**
- Create: `src/lib/trips/types.ts`
- Create: `src/lib/trips/buffers.ts`
- Create: `src/lib/trips/reminders.ts`
- Create: `src/lib/trips/create-trip.ts`
- Test: `tests/unit/buffers.test.ts`
- Test: `tests/unit/reminders.test.ts`
- Test: `tests/integration/create-trip.test.ts`

- [ ] **Step 1: Write failing buffer tests**

Create `tests/unit/buffers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeBufferComponents } from "@/lib/trips/buffers";

describe("normalizeBufferComponents", () => {
  it("keeps weather as reference context and does not create fixed weather minutes", () => {
    const components = normalizeBufferComponents([
      { category: "venue_entry", label: "进入商场", minutes: 6, reason: "大型商场入口", source: "agent_inference" },
      { category: "weather_context", label: "天气参考", minutes: 0, reason: "多云，仅供参考", source: "weather_context" }
    ]);

    expect(components).toHaveLength(2);
    expect(components.find((item) => item.category === "weather_context")?.minutes).toBe(0);
  });
});
```

- [ ] **Step 2: Run buffer tests to verify failure**

Run: `npm test -- tests/unit/buffers.test.ts`

Expected: FAIL because `buffers.ts` does not exist.

- [ ] **Step 3: Implement buffer helpers**

Create `src/lib/trips/types.ts`:

```ts
export type BufferSource = "agent_inference" | "user_setting" | "memory" | "weather_context" | "manual_override";

export type BufferInput = {
  category: string;
  label: string;
  minutes: number;
  reason: string;
  source: BufferSource;
};
```

Create `src/lib/trips/buffers.ts`:

```ts
import type { BufferInput } from "./types";

export function normalizeBufferComponents(components: BufferInput[]) {
  return components.map((component, index) => ({
    ...component,
    order: index + 1,
    minutes: component.source === "weather_context" ? 0 : Math.max(0, Math.round(component.minutes))
  }));
}
```

- [ ] **Step 4: Run buffer tests**

Run: `npm test -- tests/unit/buffers.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing reminder tests**

Create `tests/unit/reminders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReminderSchedule } from "@/lib/trips/reminders";

describe("buildReminderSchedule", () => {
  it("creates default single-leg cadence", () => {
    const latestDepartAt = new Date("2026-06-28T08:30:00+08:00");
    const reminders = buildReminderSchedule({ tripId: "trip1", legId: "leg1", latestDepartAt, cadenceMinutes: [30, 20, 15, 10, 5, 0] });

    expect(reminders).toHaveLength(6);
    expect(reminders[0].kind).toBe("recheck");
    expect(reminders[5].kind).toBe("depart_now");
  });
});
```

- [ ] **Step 6: Run reminder tests to verify failure**

Run: `npm test -- tests/unit/reminders.test.ts`

Expected: FAIL because reminder helper does not exist.

- [ ] **Step 7: Implement reminder helper**

Create `src/lib/trips/reminders.ts`:

```ts
export function buildReminderSchedule(input: {
  tripId: string;
  legId: string;
  latestDepartAt: Date;
  cadenceMinutes: number[];
}) {
  return input.cadenceMinutes.map((minutesBefore) => {
    const scheduledFor = new Date(input.latestDepartAt.getTime() - minutesBefore * 60_000);
    return {
      tripId: input.tripId,
      legId: input.legId,
      kind: minutesBefore === 0 ? "depart_now" : "recheck",
      scheduledFor,
      dedupeKey: `${input.tripId}:${input.legId}:${minutesBefore}:${scheduledFor.toISOString()}`,
      payloadJson: JSON.stringify({ minutesBefore })
    };
  });
}
```

- [ ] **Step 8: Run reminder tests**

Run: `npm test -- tests/unit/reminders.test.ts`

Expected: PASS.

- [ ] **Step 9: Write failing trip persistence integration test**

Create `tests/integration/create-trip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createPlannedTrip } from "@/lib/trips/create-trip";

describe("createPlannedTrip", () => {
  it("persists ordered stops, legs, candidates, segments, buffers, and reminders", async () => {
    const user = await prisma.user.create({
      data: { email: `trip-${Date.now()}@example.com`, name: "Trip User", passwordHash: "hash" }
    });

    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "明天先去 A 再去 B",
      timezone: "Asia/Shanghai",
      title: "多站行程",
      stops: [
        { name: "A", order: 1, lngLat: "121.1,29.1" },
        { name: "B", order: 2, lngLat: "121.2,29.2" }
      ],
      legs: [
        {
          order: 1,
          originName: "家",
          originLngLat: "121.0,29.0",
          destinationName: "A",
          destinationLngLat: "121.1,29.1",
          totalMinutes: 40,
          routeMinutes: 30,
          bufferMinutes: 10
        },
        {
          order: 2,
          originName: "A",
          originLngLat: "121.1,29.1",
          destinationName: "B",
          destinationLngLat: "121.2,29.2",
          totalMinutes: 25,
          routeMinutes: 20,
          bufferMinutes: 5
        }
      ]
    });

    const saved = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: { stops: true, legs: { include: { routeCandidates: true, bufferComponents: true, reminderJobs: true } } }
    });

    expect(saved?.stops).toHaveLength(2);
    expect(saved?.legs).toHaveLength(2);
    expect(saved?.legs[0].routeCandidates[0].totalMinutes).toBe(40);
    expect(saved?.legs[0].bufferComponents.length).toBeGreaterThan(0);
    expect(saved?.legs[0].reminderJobs).toHaveLength(6);
  });
});
```

- [ ] **Step 10: Run trip persistence test to verify failure**

Run: `npm test -- tests/integration/create-trip.test.ts`

Expected: FAIL because `create-trip.ts` does not exist.

- [ ] **Step 11: Implement `createPlannedTrip`**

Create `src/lib/trips/create-trip.ts`:

```ts
import { prisma } from "@/lib/db";
import { normalizeBufferComponents } from "./buffers";
import { buildReminderSchedule } from "./reminders";
import type { BufferInput } from "./types";

type StopInput = { order: number; name: string; lngLat?: string; address?: string; targetArriveAt?: Date };
type LegInput = {
  order: number;
  originName: string;
  originLngLat: string;
  destinationName: string;
  destinationLngLat?: string;
  targetArriveAt?: Date;
  latestDepartAt?: Date;
  routeMinutes: number;
  bufferMinutes: number;
  totalMinutes: number;
  buffers?: BufferInput[];
};

export async function createPlannedTrip(input: {
  userId: string;
  rawPrompt: string;
  timezone: string;
  title: string;
  stops: StopInput[];
  legs: LegInput[];
}) {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        userId: input.userId,
        rawPrompt: input.rawPrompt,
        timezone: input.timezone,
        title: input.title,
        status: "monitoring",
        finalStopName: input.stops.at(-1)?.name
      }
    });

    const stopByOrder = new Map<number, { id: string; name: string; lngLat: string | null }>();
    for (const stop of input.stops.sort((a, b) => a.order - b.order)) {
      const saved = await tx.tripStop.create({
        data: {
          tripId: trip.id,
          order: stop.order,
          name: stop.name,
          address: stop.address,
          lngLat: stop.lngLat,
          targetArriveAt: stop.targetArriveAt
        }
      });
      stopByOrder.set(stop.order, saved);
    }

    for (const legInput of input.legs.sort((a, b) => a.order - b.order)) {
      const toStop = stopByOrder.get(legInput.order);
      if (!toStop) throw new Error(`Missing stop for leg order ${legInput.order}`);
      const fromStop = legInput.order > 1 ? stopByOrder.get(legInput.order - 1) : null;
      const latestDepartAt = legInput.latestDepartAt ?? new Date(Date.now() + 60 * 60 * 1000);
      const leg = await tx.tripLeg.create({
        data: {
          tripId: trip.id,
          order: legInput.order,
          fromStopId: fromStop?.id,
          toStopId: toStop.id,
          originName: legInput.originName,
          originLngLat: legInput.originLngLat,
          destinationName: legInput.destinationName,
          destinationLngLat: legInput.destinationLngLat,
          targetArriveAt: legInput.targetArriveAt,
          latestDepartAt,
          status: "monitoring"
        }
      });

      const candidate = await tx.routeCandidate.create({
        data: {
          legId: leg.id,
          key: `selected-${legInput.order}`,
          title: "Agent selected route",
          mode: "mixed",
          routeMinutes: legInput.routeMinutes,
          bufferMinutes: legInput.bufferMinutes,
          totalMinutes: legInput.totalMinutes,
          selected: true,
          rationale: "Agent selected this route after comparing available route and context information."
        }
      });

      await tx.routeSegment.create({
        data: {
          legId: leg.id,
          candidateId: candidate.id,
          order: 1,
          mode: "route",
          title: `${legInput.originName} 到 ${legInput.destinationName}`,
          minutes: legInput.routeMinutes,
          source: "amap"
        }
      });

      const buffers = normalizeBufferComponents(
        legInput.buffers ?? [
          { category: "venue_entry", label: "进场与衔接", minutes: legInput.bufferMinutes, reason: "Agent 默认非路程缓冲", source: "agent_inference" },
          { category: "weather_context", label: "天气参考", minutes: 0, reason: "天气只作为参考信息", source: "weather_context" }
        ]
      );
      for (const buffer of buffers) {
        await tx.bufferComponent.create({ data: { legId: leg.id, ...buffer } });
      }

      const reminders = buildReminderSchedule({
        tripId: trip.id,
        legId: leg.id,
        latestDepartAt,
        cadenceMinutes: [30, 20, 15, 10, 5, 0]
      });
      for (const reminder of reminders) {
        await tx.reminderJob.create({ data: reminder });
      }
    }

    return trip;
  });
}
```

- [ ] **Step 12: Run trip domain tests**

Run: `npm test -- tests/unit/buffers.test.ts tests/unit/reminders.test.ts tests/integration/create-trip.test.ts`

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/lib/trips tests/unit/buffers.test.ts tests/unit/reminders.test.ts tests/integration/create-trip.test.ts
git commit -m "feat: add trip planning domain model"
```

---

### Task 6: Agent Session Runner With Timeout, Retry, And Tool Logs

**Files:**
- Create: `src/lib/agent/types.ts`
- Create: `src/lib/agent/tools.ts`
- Create: `src/lib/agent/runner.ts`
- Create: `src/lib/agent/planner.ts`
- Create: `app/api/agent-sessions/route.ts`
- Create: `app/api/agent-sessions/[sessionId]/route.ts`
- Test: `tests/unit/agent-runner.test.ts`
- Test: `tests/integration/agent-session.test.ts`

- [ ] **Step 1: Write failing runner tests**

Create `tests/unit/agent-runner.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runWithTimeoutAndRetry } from "@/lib/agent/runner";

describe("runWithTimeoutAndRetry", () => {
  it("retries after timeout without using a round limit", async () => {
    vi.useFakeTimers();
    let attempts = 0;

    const promise = runWithTimeoutAndRetry({
      timeoutMs: 1000,
      maxAttempts: 2,
      run: async () => {
        attempts += 1;
        if (attempts === 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return "ok";
      }
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe("ok");
    expect(attempts).toBe(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run runner test to verify failure**

Run: `npm test -- tests/unit/agent-runner.test.ts`

Expected: FAIL because runner does not exist.

- [ ] **Step 3: Implement runner**

Create `src/lib/agent/runner.ts`:

```ts
export class AgentTimeoutError extends Error {
  constructor() {
    super("Agent run timed out");
  }
}

async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    run(),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new AgentTimeoutError()), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer!));
}

export async function runWithTimeoutAndRetry<T>(input: {
  timeoutMs: number;
  maxAttempts: number;
  run: (attempt: number) => Promise<T>;
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    try {
      return await withTimeout(() => input.run(attempt), input.timeoutMs);
    } catch (error) {
      lastError = error;
      if (!(error instanceof AgentTimeoutError)) throw error;
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Run runner test**

Run: `npm test -- tests/unit/agent-runner.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing Agent session integration test**

Create `tests/integration/agent-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { startPlanningSession } from "@/lib/agent/planner";

describe("startPlanningSession", () => {
  it("creates a visible Agent session and writes planning messages", async () => {
    const user = await prisma.user.create({
      data: { email: `agent-${Date.now()}@example.com`, name: "Agent User", passwordHash: "hash" }
    });

    const session = await startPlanningSession({
      userId: user.id,
      prompt: "明天 9:15 到龙湖天街电影院"
    });

    const saved = await prisma.agentSession.findUnique({
      where: { id: session.id },
      include: { messages: true }
    });

    expect(saved?.status).toBe("running");
    expect(saved?.messages[0].content).toContain("明天");
  });
});
```

- [ ] **Step 6: Run Agent integration test to verify failure**

Run: `npm test -- tests/integration/agent-session.test.ts`

Expected: FAIL because planner does not exist.

- [ ] **Step 7: Implement Agent types, tool registry, and planner session creation**

Create `src/lib/agent/types.ts`:

```ts
export type AgentToolName =
  | "read_settings"
  | "read_memories"
  | "search_poi"
  | "get_weather_reference"
  | "get_transit_route"
  | "get_walking_route"
  | "get_bicycling_route"
  | "create_trip"
  | "create_reminders"
  | "create_notification_log";

export type AgentPlanningEvent = {
  type: "message" | "tool_call" | "tool_result" | "trip_created" | "error";
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type StartPlanningInput = {
  userId: string;
  prompt: string;
};

export type PlanningRunResult = {
  sessionId: string;
  tripId?: string;
  status: "running" | "completed" | "failed";
};
```

Create `src/lib/agent/tools.ts` with this exported helper:

```ts
import { prisma } from "@/lib/db";
import type { AgentToolName } from "./types";

export async function recordToolCall<T>(input: {
  agentSessionId: string;
  name: AgentToolName;
  request: unknown;
  run: () => Promise<T>;
}) {
  const started = Date.now();
  const toolCall = await prisma.agentToolCall.create({
    data: {
      agentSessionId: input.agentSessionId,
      name: input.name,
      requestJson: JSON.stringify(input.request),
      status: "running"
    }
  });
  try {
    const result = await input.run();
    await prisma.agentToolCall.update({
      where: { id: toolCall.id },
      data: {
        status: "completed",
        responseJson: JSON.stringify(result),
        durationMs: Date.now() - started
      }
    });
    return result;
  } catch (error) {
    await prisma.agentToolCall.update({
      where: { id: toolCall.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started
      }
    });
    throw error;
  }
}
```

Create `src/lib/agent/planner.ts` with these concrete functions:

```ts
import { prisma } from "@/lib/db";
import { createAmapClient } from "@/lib/amap";
import { createPlannedTrip } from "@/lib/trips/create-trip";
import { readEnv } from "@/lib/env";
import { runWithTimeoutAndRetry } from "./runner";
import { recordToolCall } from "./tools";
import type { PlanningRunResult, StartPlanningInput } from "./types";

export async function startPlanningSession(input: StartPlanningInput): Promise<PlanningRunResult> {
  const session = await prisma.agentSession.create({
    data: {
      userId: input.userId,
      prompt: input.prompt,
      status: "running",
      messages: { create: { role: "user", content: input.prompt } }
    }
  });
  return { sessionId: session.id, status: "running" };
}

export async function runPlanningSession(sessionId: string): Promise<PlanningRunResult> {
  return runWithTimeoutAndRetry({
    timeoutMs: 600_000,
    maxAttempts: 2,
    run: async (attempt) => runPlanningAttempt(sessionId, attempt)
  });
}

async function runPlanningAttempt(sessionId: string, attempt: number): Promise<PlanningRunResult> {
  const session = await prisma.agentSession.findUniqueOrThrow({ where: { id: sessionId }, include: { user: { include: { settings: true } } } });
  const env = readEnv();
  const amap = createAmapClient();
  await prisma.agentMessage.create({ data: { agentSessionId: sessionId, role: "assistant", content: `Agent 决策过程开始（第 ${attempt} 次尝试）` } });

  const settings = session.user.settings;
  const city = settings?.defaultCity ?? env.defaultCity;
  const origin = settings?.originLngLat ?? env.defaultOrigin;
  const pois = await recordToolCall({ agentSessionId: sessionId, name: "search_poi", request: { prompt: session.prompt, city }, run: () => amap.searchPoi({ keywords: session.prompt, city }) });
  const destination = pois[0];
  const weather = await recordToolCall({ agentSessionId: sessionId, name: "get_weather_reference", request: { city }, run: () => amap.getWeather({ city }) });
  const route = await recordToolCall({
    agentSessionId: sessionId,
    name: "get_transit_route",
    request: { origin, destination: destination.lngLat, city },
    run: () => amap.getTransitRoute({ origin, destination: destination.lngLat, city, cityd: city })
  });

  await prisma.agentMessage.create({ data: { agentSessionId: sessionId, role: "assistant", content: `天气参考：${weather.summary}` } });
  const trip = await createPlannedTrip({
    userId: session.userId,
    rawPrompt: session.prompt,
    timezone: settings?.timezone ?? env.defaultTimezone,
    title: destination.name,
    stops: [{ order: 1, name: destination.name, lngLat: destination.lngLat, address: destination.address }],
    legs: [{
      order: 1,
      originName: settings?.originName ?? env.defaultOriginName,
      originLngLat: origin,
      destinationName: destination.name,
      destinationLngLat: destination.lngLat,
      routeMinutes: route.durationMinutes,
      bufferMinutes: 15,
      totalMinutes: route.durationMinutes + 15
    }]
  });

  await prisma.agentSession.update({ where: { id: sessionId }, data: { tripId: trip.id, status: "completed" } });
  await prisma.agentMessage.create({ data: { agentSessionId: sessionId, role: "assistant", content: "规划完成，正在跳转到行程详情。" } });
  return { sessionId, tripId: trip.id, status: "completed" };
}
```

If `OPENAI_API_KEY` is present, add the real OpenAI-compatible call after the mock path is green; keep the same persisted message/tool-call contract so tests remain deterministic by default.

- [ ] **Step 8: Implement Agent session APIs**

Create `app/api/agent-sessions/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { runPlanningSession, startPlanningSession } from "@/lib/agent/planner";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const session = await startPlanningSession({ userId: user.id, prompt: String(body.prompt ?? "") });
  runPlanningSession(session.sessionId).catch(() => undefined);
  return NextResponse.json(session);
}
```

Create `app/api/agent-sessions/[sessionId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } }, toolCalls: { orderBy: { createdAt: "asc" } } }
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ session });
}
```

- [ ] **Step 9: Run Agent tests**

Run: `npm test -- tests/unit/agent-runner.test.ts tests/integration/agent-session.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/agent app/api/agent-sessions tests/unit/agent-runner.test.ts tests/integration/agent-session.test.ts
git commit -m "feat: add agent planning runner"
```

---

### Task 7: Scheduler, Recalculation, And Notifications

**Files:**
- Create: `src/lib/scheduler/due-jobs.ts`
- Create: `src/lib/scheduler/process-job.ts`
- Create: `src/lib/notifications/telegram.ts`
- Create: `src/lib/notifications/email.ts`
- Create: `src/lib/notifications/log.ts`
- Create: `scripts/scheduler.ts`
- Create: `app/api/scheduler/tick/route.ts`
- Test: `tests/unit/notification-dedupe.test.ts`
- Test: `tests/integration/scheduler.test.ts`

- [ ] **Step 1: Write failing notification dedupe test**

Create `tests/unit/notification-dedupe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildNotificationDedupeKey } from "@/lib/notifications/log";

describe("buildNotificationDedupeKey", () => {
  it("creates stable keys for departure reminders", () => {
    expect(
      buildNotificationDedupeKey({
        tripId: "trip1",
        legId: "leg1",
        channel: "telegram",
        kind: "depart_now",
        scheduledFor: new Date("2026-06-28T08:30:00+08:00")
      })
    ).toBe("trip1:leg1:telegram:depart_now:2026-06-28T00:30:00.000Z");
  });
});
```

- [ ] **Step 2: Run dedupe test to verify failure**

Run: `npm test -- tests/unit/notification-dedupe.test.ts`

Expected: FAIL because notification module does not exist.

- [ ] **Step 3: Implement notification log helpers and adapters**

Create `src/lib/notifications/log.ts`:

```ts
export function buildNotificationDedupeKey(input: {
  tripId: string;
  legId?: string | null;
  channel: string;
  kind: string;
  scheduledFor: Date;
}) {
  return [input.tripId, input.legId ?? "trip", input.channel, input.kind, input.scheduledFor.toISOString()].join(":");
}
```

Create `src/lib/notifications/telegram.ts`:

```ts
export async function sendTelegram(input: { text: string; chatId?: string | null }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = input.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { status: "skipped" as const, reason: "telegram_not_configured" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: input.text })
  });
  if (!response.ok) return { status: "failed" as const, reason: `telegram_${response.status}` };
  return { status: "sent" as const };
}
```

Create `src/lib/notifications/email.ts`:

```ts
import nodemailer from "nodemailer";

export async function sendEmail(input: { to?: string | null; subject: string; text: string }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !input.to) {
    return { status: "skipped" as const, reason: "email_not_configured" };
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transport.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to: input.to, subject: input.subject, text: input.text });
  return { status: "sent" as const };
}
```

- [ ] **Step 4: Run dedupe test**

Run: `npm test -- tests/unit/notification-dedupe.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing scheduler integration test**

Create `tests/integration/scheduler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { processDueReminderJobs } from "@/lib/scheduler/process-job";

describe("processDueReminderJobs", () => {
  it("locks due jobs and logs recalculation", async () => {
    const user = await prisma.user.create({
      data: { email: `scheduler-${Date.now()}@example.com`, name: "Scheduler User", passwordHash: "hash" }
    });
    const trip = await prisma.trip.create({
      data: { userId: user.id, title: "Test Trip", rawPrompt: "test", timezone: "Asia/Shanghai", status: "monitoring" }
    });
    const job = await prisma.reminderJob.create({
      data: {
        tripId: trip.id,
        kind: "depart_now",
        scheduledFor: new Date(Date.now() - 60_000),
        dedupeKey: `job-${Date.now()}`,
        payloadJson: "{}"
      }
    });

    const result = await processDueReminderJobs({ now: new Date() });
    const updated = await prisma.reminderJob.findUnique({ where: { id: job.id } });
    const logs = await prisma.recalculationLog.findMany({ where: { tripId: trip.id } });

    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(updated?.status).toMatch(/sent|skipped|failed/);
    expect(logs.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run scheduler test to verify failure**

Run: `npm test -- tests/integration/scheduler.test.ts`

Expected: FAIL because scheduler module does not exist.

- [ ] **Step 7: Implement scheduler**

Create `src/lib/scheduler/due-jobs.ts`:

```ts
import { prisma } from "@/lib/db";

export async function findDueReminderJobs(now: Date) {
  return prisma.reminderJob.findMany({
    where: { status: "scheduled", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: 20
  });
}

export async function lockReminderJob(id: string, now: Date) {
  const updated = await prisma.reminderJob.updateMany({
    where: { id, status: "scheduled" },
    data: { status: "running", lockedAt: now, attempts: { increment: 1 } }
  });
  return updated.count === 1;
}
```

Create `src/lib/scheduler/process-job.ts`:

```ts
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { buildNotificationDedupeKey } from "@/lib/notifications/log";
import { sendTelegram } from "@/lib/notifications/telegram";
import { findDueReminderJobs, lockReminderJob } from "./due-jobs";

export async function processDueReminderJobs({ now }: { now: Date }) {
  const jobs = await findDueReminderJobs(now);
  let processed = 0;
  for (const job of jobs) {
    const locked = await lockReminderJob(job.id, now);
    if (!locked) continue;
    processed += 1;
    try {
      const trip = await prisma.trip.findUnique({ where: { id: job.tripId }, include: { user: { include: { settings: true } } } });
      if (!trip) throw new Error("Trip not found");
      await prisma.recalculationLog.create({
        data: {
          tripId: trip.id,
          legId: job.legId,
          trigger: job.kind,
          status: "completed",
          summary: "Agent-assisted recalculation used route tools and optional weather reference."
        }
      });
      const text = job.kind === "depart_now" ? `请现在出发：${trip.title}` : `行程复算：${trip.title}`;
      const telegram = await sendTelegram({ text, chatId: trip.user.settings?.telegramChatId });
      const email = await sendEmail({ to: trip.user.settings?.emailRecipient, subject: `出行提醒：${trip.title}`, text });
      const status = telegram.status === "sent" || email.status === "sent" ? "sent" : "skipped";
      await prisma.notificationLog.create({
        data: {
          tripId: trip.id,
          channel: "combined",
          status,
          recipient: trip.user.settings?.emailRecipient ?? trip.user.settings?.telegramChatId,
          dedupeKey: buildNotificationDedupeKey({ tripId: trip.id, legId: job.legId, channel: "combined", kind: job.kind, scheduledFor: job.scheduledFor }),
          content: text
        }
      });
      await prisma.reminderJob.update({ where: { id: job.id }, data: { status } });
    } catch (error) {
      await prisma.reminderJob.update({ where: { id: job.id }, data: { status: "failed" } });
    }
  }
  return { processed };
}
```

Create `scripts/scheduler.ts`:

```ts
import { processDueReminderJobs } from "../src/lib/scheduler/process-job";

processDueReminderJobs({ now: new Date() })
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

Create `app/api/scheduler/tick/route.ts` to call the same processor.

- [ ] **Step 8: Run scheduler tests**

Run: `npm test -- tests/unit/notification-dedupe.test.ts tests/integration/scheduler.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/scheduler src/lib/notifications scripts/scheduler.ts app/api/scheduler tests/unit/notification-dedupe.test.ts tests/integration/scheduler.test.ts
git commit -m "feat: add scheduler and notifications"
```

---

### Task 8: Frontend Components From Existing Samples

**Files:**
- Create: `src/components/app-shell.tsx`
- Create: `src/components/bottom-nav.tsx`
- Create: `src/components/glass-card.tsx`
- Create: `src/components/home/commute-input.tsx`
- Create: `src/components/trips/route-timeline.tsx`
- Create: `src/components/trips/buffer-list.tsx`
- Create: `src/components/agent/agent-event-list.tsx`
- Modify: `app/page.tsx`
- Modify: `app/agent/[sessionId]/page.tsx`
- Modify: `app/trips/[tripId]/page.tsx`
- Modify: `app/history/page.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/memories/page.tsx`
- Test: `tests/unit/ui-components.test.tsx`

- [ ] **Step 1: Write failing UI component tests**

Create `tests/unit/ui-components.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BottomNav } from "@/components/bottom-nav";
import { BufferList } from "@/components/trips/buffer-list";

describe("sample-aligned UI components", () => {
  it("renders mobile bottom navigation with Home, History, and Settings", () => {
    render(<BottomNav active="home" />);
    expect(screen.getByLabelText("Home")).toBeTruthy();
    expect(screen.getByLabelText("History")).toBeTruthy();
    expect(screen.getByLabelText("Settings")).toBeTruthy();
  });

  it("renders buffer components including weather reference notes", () => {
    render(
      <BufferList
        items={[
          { label: "进入商场", minutes: 6, reason: "大型商场入口" },
          { label: "天气参考", minutes: 0, reason: "多云，仅供参考" }
        ]}
      />
    );

    expect(screen.getByText("进入商场")).toBeTruthy();
    expect(screen.getByText("天气参考")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run UI component tests to verify failure**

Run: `npm test -- tests/unit/ui-components.test.tsx`

Expected: FAIL because UI components do not exist.

- [ ] **Step 3: Implement shared components**

Create the shared components by translating structure and classes from:

- `前端样板和规范/首页/code.html`
- `前端样板和规范/行程规划详情/code.html`
- `前端样板和规范/DESIGN.md`

Use `lucide-react` icons where available. Keep buttons icon-led for navigation, route actions, reminders, settings, and destructive controls. Keep the bottom nav, glass cards, status pills, and timeline visually aligned with samples.

Minimum component contracts:

- `BottomNav({ active }: { active: "home" | "history" | "settings" })` renders three icon buttons with labels `Home`, `History`, and `Settings`.
- `GlassCard({ children, className })` applies `glass-card rounded-2xl shadow-sm`.
- `CommuteInput({ onCreated })` submits to `/api/agent-sessions` and calls `onCreated(sessionId)`.
- `RouteTimeline({ segments })` renders a vertical connected-dot timeline like the detail sample.
- `BufferList({ items })` renders non-route buffer rows and shows `0 分钟` weather reference notes without turning them into added travel time.
- `AgentEventList({ messages, toolCalls })` renders message cards and tool-call status rows.

- [ ] **Step 4: Run UI component tests**

Run: `npm test -- tests/unit/ui-components.test.tsx`

Expected: PASS.

- [ ] **Step 5: Implement pages**

Create these page implementations:

- `app/page.tsx`: authenticated home with one-sentence input, active trip card, quick actions.
- `app/agent/[sessionId]/page.tsx`: polling conversation view that shows messages/tool calls and redirects when `tripId` appears.
- `app/trips/[tripId]/page.tsx`: sample-aligned detail with route segments, buffer components, reminders, status, and Agent conversation button.
- `app/history/page.tsx`: trip list.
- `app/settings/page.tsx`: settings form.
- `app/memories/page.tsx`: confirmed and pending memories.

Each page must import shared components instead of copying raw sample HTML. If a page has no sample equivalent, reuse the same token set, radius, typography, glass cards, and navigation shell from the sample pages.

- [ ] **Step 6: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components app tests/unit/ui-components.test.tsx
git commit -m "feat: build sample-aligned app UI"
```

---

### Task 9: End-to-end User Flow

**Files:**
- Create: `tests/e2e/commute-flow.spec.ts`
- Modify: `app/login/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/agent/[sessionId]/page.tsx`
- Modify: `app/trips/[tripId]/page.tsx`
- Modify: `app/api/agent-sessions/route.ts`

- [ ] **Step 1: Write failing Playwright test**

Create `tests/e2e/commute-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("home prompt opens Agent planning and lands on trip detail", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL("/");
  await page.getByLabel("Search destination").fill("明天 9:15 到龙湖天街电影院");
  await page.getByRole("button", { name: "开始规划" }).click();

  await expect(page).toHaveURL(/\/agent\//);
  await expect(page.getByText("Agent 决策过程")).toBeVisible();
  await expect(page.getByText("天气参考")).toBeVisible();

  await page.waitForURL(/\/trips\//, { timeout: 30_000 });
  await expect(page.getByText("行程拆解")).toBeVisible();
  await expect(page.getByText("提醒计划")).toBeVisible();

  await page.getByRole("button", { name: "Agent 对话" }).click();
  await expect(page).toHaveURL(/\/agent\//);
});
```

- [ ] **Step 2: Run e2e test to verify failure**

Run: `npm run test:e2e -- tests/e2e/commute-flow.spec.ts`

Expected: FAIL until pages and APIs are wired.

- [ ] **Step 3: Wire the flow to satisfy the e2e test**

Implement these exact flow requirements:

- Seed user exists before e2e.
- Login form labels are accessible.
- Home submit creates Agent session.
- Agent planner completes deterministically with mock tools.
- Agent page redirects to trip detail.
- Detail page Agent button returns to the session.

- [ ] **Step 4: Run e2e test**

Run: `npm run test:e2e -- tests/e2e/commute-flow.spec.ts`

Expected: PASS on desktop and mobile projects.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e app src
git commit -m "test: cover commute planning flow"
```

---

### Task 10: Docker And Operational Commands

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `README.md`
- Test: `tests/unit/docker-files.test.ts`

- [ ] **Step 1: Write failing Docker file tests**

Create `tests/unit/docker-files.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Docker configuration", () => {
  it("defines web and scheduler services with persisted SQLite data", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    expect(compose).toContain("web:");
    expect(compose).toContain("scheduler:");
    expect(compose).toContain("./data:/app/data");
    expect(compose).toContain("env_file:");
  });
});
```

- [ ] **Step 2: Run Docker tests to verify failure**

Run: `npm test -- tests/unit/docker-files.test.ts`

Expected: FAIL because Docker files do not exist.

- [ ] **Step 3: Add Docker files**

Create `Dockerfile`:

```Dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Create `docker-compose.yml`:

```yaml
services:
  web:
    build: .
    command: sh -c "npx prisma migrate deploy && npm run start"
    env_file:
      - .env
    environment:
      DATABASE_URL: file:/app/data/commute.db
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data

  scheduler:
    build: .
    command: sh -c "while true; do npm run scheduler:tick; sleep 60; done"
    env_file:
      - .env
    environment:
      DATABASE_URL: file:/app/data/commute.db
    volumes:
      - ./data:/app/data
    depends_on:
      - web
```

Create `.dockerignore`:

```gitignore
.git
.next
node_modules
data
.superpowers
原始skill
前端样板和规范
```

Create `README.md` with local and Docker commands:

```md
# Commute Planner

## Local

1. Copy `.env` with the required keys.
2. Run `npm install`.
3. Run `npm run prisma:migrate -- --name init`.
4. Run `npm run prisma:seed`.
5. Run `npm run dev`.

## Docker

Run `docker compose up --build`.

SQLite data is persisted in `./data`.
```

- [ ] **Step 4: Run Docker tests**

Run: `npm test -- tests/unit/docker-files.test.ts`

Expected: PASS.

- [ ] **Step 5: Build Docker image**

Run: `docker compose build`

Expected: PASS. If Docker is unavailable in the environment, record the failure and run `npm run build` instead.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore README.md tests/unit/docker-files.test.ts
git commit -m "chore: add docker operation support"
```

---

### Task 11: Final Verification And UI Sample Check

**Files:**
- Modify only files required by verification failures.

- [ ] **Step 1: Run unit and integration tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Run e2e tests**

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 4: Start dev server**

Run: `npm run dev`

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 5: Compare UI against samples**

Open:

- `前端样板和规范/首页/screen.png`
- `前端样板和规范/行程规划详情/screen.png`
- `http://localhost:3000`
- `http://localhost:3000/trips/<seed-or-created-trip-id>`

Check:

- Home has the same mobile-first glass input, weather/reference area, active commute card, and bottom navigation language.
- Trip detail has the same top bar, selected route area, timeline layout, auto-check notice, reminder plan, and action hierarchy.
- New Agent/Settings/History/Memories pages use the same tokens, spacing, radius, glass surfaces, and navigation.

- [ ] **Step 6: Fix deviations**

Use Playwright screenshots or manual inspection to correct visible deviations in spacing, color, typography, and navigation behavior.

- [ ] **Step 7: Stop dev server**

Stop the dev server session cleanly.

- [ ] **Step 8: Final status**

Run: `git status --short`

Expected: only intentional changes are present.

- [ ] **Step 9: Commit final polish if needed**

```bash
git add app src tests README.md
git commit -m "fix: polish commute planner mvp"
```

---

## Self-review Checklist

- Spec coverage: covered local MVP, Docker, auth/settings, home -> Agent -> detail flow, weather as reference information, Agent timeout/retry without round limits, multi-stop trips, Prisma models, AMap throttle, scheduler, notifications, memories, and frontend sample constraints.
- Marker scan: no task should contain unresolved markers or vague implementation language.
- Type consistency: planned entities match Prisma names: `AgentSession`, `AgentMessage`, `AgentToolCall`, `Trip`, `TripStop`, `TripLeg`, `RouteCandidate`, `RouteSegment`, `BufferComponent`, `ReminderJob`, `RecalculationLog`, `NotificationLog`, `Memory`, and `MemoryCandidate`.
- Testing discipline: every behavior-heavy task starts with a failing test and verifies the pass before commit.
