import type { Metadata } from "next";
import React from "react";
import { PublicTripShare } from "@/components/trips/public-trip-share";
import { getPublicTripShareByToken } from "@/lib/trips/share-service";

export const metadata: Metadata = {
  title: "公开行程 | AI Commute",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trip = await getPublicTripShareByToken(token);

  if (!trip) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f9fb] p-5">
        <section className="w-full max-w-md border-y border-[#e0e3e5] bg-white px-5 py-8 text-center">
          <p className="text-sm font-bold text-[#2563eb]">AI Commute</p>
          <h1 className="mt-3 text-xl font-bold text-[#191c1e]">
            分享链接无效或已关闭
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#434655]">
            请联系行程分享者获取新的链接。
          </p>
        </section>
      </main>
    );
  }

  return <PublicTripShare trip={trip} />;
}
