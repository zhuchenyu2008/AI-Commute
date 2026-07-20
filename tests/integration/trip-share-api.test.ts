import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ensureTestDatabase } from "./test-db";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const getCurrentUserMock = vi.hoisted(() =>
  vi.fn<() => Promise<CurrentUser | null>>()
);

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getCurrentUser: getCurrentUserMock };
});

describe("trip share owner API", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  beforeEach(async () => {
    getCurrentUserMock.mockReset();
    await prisma.user.deleteMany({
      where: { email: { startsWith: "trip-share-api-" } },
    });
  });

  it("creates one stable link, revokes it, and rotates the token", async () => {
    const { GET, POST, DELETE } = await import(
      "@app/api/trips/[tripId]/share/route"
    );
    const { owner, trip } = await createOwnerTrip("lifecycle");
    getCurrentUserMock.mockResolvedValue(owner);
    const context = { params: Promise.resolve({ tripId: trip.id }) };

    const first = await POST(
      new Request("http://localhost:3000/api/trips/x/share"),
      context
    );
    const second = await POST(
      new Request("http://localhost:3000/api/trips/x/share"),
      context
    );
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({ enabled: true });
    expect(firstBody.url).toMatch(/^http:\/\/localhost:3000\/share\//);
    expect(secondBody.url).toBe(firstBody.url);

    const revoked = await DELETE(
      new Request("http://localhost:3000/api/trips/x/share", {
        method: "DELETE",
      }),
      context
    );
    expect(revoked.status).toBe(200);

    const disabled = await GET(
      new Request("http://localhost:3000/api/trips/x/share"),
      context
    );
    await expect(disabled.json()).resolves.toEqual({
      enabled: false,
      url: null,
    });

    const reenabled = await POST(
      new Request("http://localhost:3000/api/trips/x/share"),
      context
    );
    const reenabledBody = await reenabled.json();
    expect(reenabledBody.url).not.toBe(firstBody.url);
  });

  it("returns 401 when no user is logged in", async () => {
    const { POST } = await import("@app/api/trips/[tripId]/share/route");
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ tripId: "unknown" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  it("returns 404 for another user's trip", async () => {
    const { POST } = await import("@app/api/trips/[tripId]/share/route");
    const { trip } = await createOwnerTrip("private");
    const intruder = await prisma.user.create({
      data: {
        email: `trip-share-api-intruder-${Date.now()}@example.com`,
        name: "Trip Share Intruder",
        passwordHash: "hash",
      },
      include: { settings: true },
    });
    getCurrentUserMock.mockResolvedValue(intruder);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ tripId: trip.id }),
    });

    expect(response.status).toBe(404);
  });

  it("cascades the share when the trip is deleted", async () => {
    const { POST } = await import("@app/api/trips/[tripId]/share/route");
    const { owner, trip } = await createOwnerTrip("cascade");
    getCurrentUserMock.mockResolvedValue(owner);
    const context = { params: Promise.resolve({ tripId: trip.id }) };

    await POST(new Request("http://localhost"), context);
    await prisma.trip.delete({ where: { id: trip.id } });

    await expect(
      prisma.tripShare.count({ where: { tripId: trip.id } })
    ).resolves.toBe(0);
  });
});

async function createOwnerTrip(key: string) {
  const owner = await prisma.user.create({
    data: {
      email: `trip-share-api-${key}-${Date.now()}@example.com`,
      name: "Trip Share Owner",
      passwordHash: "hash",
    },
    include: { settings: true },
  });
  const trip = await prisma.trip.create({
    data: {
      userId: owner.id,
      title: `Trip share API ${key}`,
      rawPrompt: "share this trip",
      timezone: "Asia/Shanghai",
    },
  });

  return { owner, trip };
}
