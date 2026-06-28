import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createUserSession, getCurrentUser } from "@/lib/auth/session";
import { ensureTestDatabase } from "./test-db";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const getCurrentUserMock = vi.hoisted(() => vi.fn<() => Promise<CurrentUser | null>>());

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getCurrentUser: getCurrentUserMock
  };
});

describe("settings API", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("rejects unauthenticated settings requests", async () => {
    const { GET } = await import("@app/api/settings/route");
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns default settings for authenticated users without saved settings", async () => {
    const { GET } = await import("@app/api/settings/route");
    const user = await prisma.user.create({
      data: {
        email: `settings-default-${Date.now()}@example.com`,
        name: "默认设置用户",
        passwordHash: "hash"
      },
      include: { settings: true }
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.defaultCity).toBe("宁波");
    expect(body.settings.originLngLat).toBe("");
    expect(body.settings.routePreference).toBe("balanced");
  });

  it("returns blank origin fields when the user has not selected a default origin", async () => {
    const { GET } = await import("@app/api/settings/route");
    const user = await prisma.user.create({
      data: {
        email: `settings-no-origin-${Date.now()}@example.com`,
        name: "No Origin User",
        passwordHash: "hash",
      },
      include: { settings: true },
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.originName).toBe("");
    expect(body.settings.originLngLat).toBe("");
  });

  it("searches origin candidates for authenticated users", async () => {
    const { GET } = await import("@app/api/places/search/route");
    const user = await prisma.user.create({
      data: {
        email: `place-search-${Date.now()}@example.com`,
        name: "Place Search User",
        passwordHash: "hash",
      },
      include: { settings: true },
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await GET(
      new Request("http://localhost/api/places/search?keywords=外事学校&city=宁波")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.places[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        lngLat: expect.stringMatching(/^-?\d/),
      })
    );
  });

  it("persists valid settings updates", async () => {
    const { PUT } = await import("@app/api/settings/route");
    const user = await prisma.user.create({
      data: {
        email: `settings-put-${Date.now()}@example.com`,
        name: "设置更新用户",
        passwordHash: "hash"
      },
      include: { settings: true }
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          defaultCity: "宁波",
          timezone: "Asia/Shanghai",
          originName: "家",
          originLngLat: "121.5230315924,29.8652491273",
          routePreference: "fastest",
          emailRecipient: "user@example.com"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.routePreference).toBe("fastest");
    expect(body.settings.emailRecipient).toBe("user@example.com");
  });

  it("returns 400 for invalid planner settings", async () => {
    const { PUT } = await import("@app/api/settings/route");
    const user = await prisma.user.create({
      data: {
        email: `settings-invalid-${Date.now()}@example.com`,
        name: "无效设置用户",
        passwordHash: "hash"
      },
      include: { settings: true }
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          timezone: "Mars/Base",
          originLngLat: "not-coordinates",
          routePreference: "teleport",
          emailRecipient: "not-email"
        })
      })
    );

    expect(response.status).toBe(400);
  });

  it("allows saving planner settings without an origin and requires origin name and coordinates as a pair", async () => {
    const { PUT } = await import("@app/api/settings/route");
    const user = await prisma.user.create({
      data: {
        email: `settings-origin-pair-${Date.now()}@example.com`,
        name: "Origin Pair User",
        passwordHash: "hash",
      },
      include: { settings: true },
    });
    getCurrentUserMock.mockResolvedValue(user);

    const withoutOrigin = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          defaultCity: "宁波",
          timezone: "Asia/Shanghai",
          routePreference: "balanced",
        }),
      })
    );
    const saved = await withoutOrigin.json();

    expect(withoutOrigin.status).toBe(200);
    expect(saved.settings.originName).toBeNull();
    expect(saved.settings.originLngLat).toBeNull();

    const missingCoordinates = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          defaultCity: "宁波",
          timezone: "Asia/Shanghai",
          originName: "外事学校",
          routePreference: "balanced",
        }),
      })
    );

    expect(missingCoordinates.status).toBe(400);
  });

  it.each([
    ["defaultCity", ""],
    ["timezone", ""],
    ["routePreference", ""],
    ["timezone", 123],
    ["routePreference", {}]
  ])("returns 400 when %s is supplied as an invalid value", async (field, value) => {
    const { PUT } = await import("@app/api/settings/route");
    const user = await prisma.user.create({
      data: {
        email: `settings-invalid-supplied-${field}-${Date.now()}@example.com`,
        name: "无效字段用户",
        passwordHash: "hash"
      },
      include: { settings: true }
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        body: JSON.stringify({ [field]: value })
      })
    );

    expect(response.status).toBe(400);
  });
});

describe("logout API", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  it("clears malformed session cookies without throwing", async () => {
    const { POST } = await import("@app/api/auth/logout/route");

    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { cookie: "commute_session=%E0%A4%A" }
      })
    );

    expect(response.status).toBe(200);
  });

  it("deletes a valid session token on logout", async () => {
    const { POST } = await import("@app/api/auth/logout/route");
    const user = await prisma.user.create({
      data: {
        email: `logout-${Date.now()}@example.com`,
        name: "退出登录用户",
        passwordHash: "hash"
      }
    });
    const session = await createUserSession(user.id);

    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { cookie: `commute_session=${encodeURIComponent(session.token)}` }
      })
    );
    const remaining = await prisma.session.count({ where: { userId: user.id } });

    expect(response.status).toBe(200);
    expect(remaining).toBe(0);
  });
});

