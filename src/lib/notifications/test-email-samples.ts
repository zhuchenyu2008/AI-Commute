import {
  buildDepartureReminderEmail,
  buildRouteChangeEmail,
  type BuiltEmailTemplate,
} from "@/lib/notifications/email-templates";
import { buildAmapLink } from "@/lib/notifications/map-links";

export type TemplateTestEmail = BuiltEmailTemplate & {
  label: "到点提醒" | "时间更新";
};

export function buildTemplateTestEmails({
  now = new Date(),
}: {
  now?: Date;
} = {}): TemplateTestEmail[] {
  const latestDepartAt = new Date(now.getTime() + 35 * 60_000);
  const previousLatestDepartAt = new Date(now.getTime() + 30 * 60_000);
  const targetArriveAt = new Date(now.getTime() + 75 * 60_000);
  const base = {
    tripTitle: "测试通勤路线",
    destinationName: "科技园区A座",
    destinationAddress: "创新大道 123 号",
    latestDepartAt,
    targetArriveAt,
    totalMinutes: 40,
    routeTitle: "地铁 4 号线 -> 共享单车",
    weatherSummary: "以行程详情为准",
    detailsUrl: buildAmapLink({
      destinationName: "科技园区A座",
      destinationAddress: "创新大道 123 号",
    }),
    stopMonitoringUrl: undefined,
  };

  return [
    {
      label: "到点提醒",
      ...buildDepartureReminderEmail(base),
    },
    {
      label: "时间更新",
      ...buildRouteChangeEmail({
        ...base,
        previousLatestDepartAt,
        changeMinutes: 5,
      }),
    },
  ];
}
