import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { readEnv } from "../src/lib/env";

const prisma = new PrismaClient();

const fallback = (value: string | undefined, defaultValue: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return defaultValue;
  }

  return value;
};

async function main() {
  const appEnv = readEnv(process.env);
  const email = fallback(process.env.SEED_USER_EMAIL, "user@example.com");
  const password = fallback(process.env.SEED_USER_PASSWORD, "password");
  const passwordHash = await hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "本地用户",
      passwordHash,
      settings: {
        create: {
          defaultCity: appEnv.defaultCity,
          timezone: appEnv.defaultTimezone,
          routePreference: "balanced"
        }
      }
    },
    update: {
      passwordHash,
      settings: {
        upsert: {
          create: {
            defaultCity: appEnv.defaultCity,
            timezone: appEnv.defaultTimezone,
            routePreference: "balanced"
          },
          update: {
            defaultCity: appEnv.defaultCity,
            timezone: appEnv.defaultTimezone
          }
        }
      }
    }
  });
}

main()
  .catch((error: unknown) => {
    console.error("种子数据写入失败");
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
