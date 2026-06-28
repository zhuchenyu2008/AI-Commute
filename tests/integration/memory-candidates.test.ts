import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureTestDatabase } from "./test-db";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
const getCurrentUserMock = vi.hoisted(() =>
  vi.fn<() => Promise<CurrentUser | null>>()
);

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getCurrentUser: getCurrentUserMock };
});

describe("memory candidate actions", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("confirms a candidate into a reusable memory", async () => {
    const { POST } = await import(
      "@app/api/memory-candidates/[candidateId]/confirm/route"
    );
    const user = await prisma.user.create({
      data: {
        email: `confirm-memory-${Date.now()}@example.com`,
        name: "Memory User",
        passwordHash: "hash",
      },
    });
    const candidate = await prisma.memoryCandidate.create({
      data: {
        userId: user.id,
        kind: "origin",
        label: "常从外事学校出发",
        valueJson: JSON.stringify({
          originName: "外事学校",
          originLngLat: "121.1,29.1",
        }),
      },
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ candidateId: candidate.id }),
    });

    expect(response.status).toBe(200);
    await expect(
      prisma.memory.findFirstOrThrow({
        where: { userId: user.id, label: "常从外事学校出发" },
      })
    ).resolves.toMatchObject({
      kind: "origin",
      label: "常从外事学校出发",
    });
    await expect(
      prisma.memoryCandidate.findUniqueOrThrow({ where: { id: candidate.id } })
    ).resolves.toMatchObject({
      status: "confirmed",
    });
  });

  it("ignores a candidate without creating memory", async () => {
    const { POST } = await import(
      "@app/api/memory-candidates/[candidateId]/ignore/route"
    );
    const user = await prisma.user.create({
      data: {
        email: `ignore-memory-${Date.now()}@example.com`,
        name: "Ignore User",
        passwordHash: "hash",
      },
    });
    const candidate = await prisma.memoryCandidate.create({
      data: {
        userId: user.id,
        kind: "preference",
        label: "偏好骑行",
        valueJson: JSON.stringify({ mode: "bike" }),
      },
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ candidateId: candidate.id }),
    });

    expect(response.status).toBe(200);
    await expect(
      prisma.memory.count({ where: { userId: user.id, label: "偏好骑行" } })
    ).resolves.toBe(0);
    await expect(
      prisma.memoryCandidate.findUniqueOrThrow({ where: { id: candidate.id } })
    ).resolves.toMatchObject({
      status: "ignored",
    });
  });
});
