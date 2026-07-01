import React from "react";
import { Brain, History, Home, Settings } from "lucide-react";
import { RouteTransitionLink } from "@/components/route-transition-link";

export type NavKey = "home" | "history" | "settings" | "memories";

const navItems = [
  { key: "home", href: "/", label: "首页", icon: Home },
  { key: "history", href: "/history", label: "历史", icon: History },
  { key: "memories", href: "/memories", label: "记忆", icon: Brain },
  { key: "settings", href: "/settings", label: "设置", icon: Settings },
] as const;

export function BottomNav({ active }: { active: NavKey }) {
  const activeIndex = navItems.findIndex((item) => item.key === active);

  return (
    <nav
      aria-label="主导航"
      className="bottom-nav-transition-layer fixed inset-x-0 bottom-0 z-50 border-t border-white/60 bg-white/70 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 shadow-lg shadow-slate-200/80 backdrop-blur-md md:hidden"
    >
      <div
        className="relative mx-auto grid max-w-md grid-cols-4"
        style={
          {
            "--active-index": activeIndex,
          } as React.CSSProperties
        }
      >
        <span aria-hidden="true" className="nav-active-pill" />
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;

          return (
            <RouteTransitionLink
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              className={`nav-item-motion relative z-10 flex min-h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? "nav-item-active text-white"
                  : "text-[#434655] hover:bg-white/80 hover:text-[#2563eb]"
              }`}
              href={item.href}
              key={item.key}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={2.2} />
              <span>{item.label}</span>
            </RouteTransitionLink>
          );
        })}
      </div>
    </nav>
  );
}
