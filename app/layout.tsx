import "./globals.css";
import type { Metadata } from "next";
import React from "react";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/project";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  icons: {
    icon: [
      {
        url: "/logo_1.png",
        sizes: "1254x1254",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/logo_1.png",
        sizes: "1254x1254",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
