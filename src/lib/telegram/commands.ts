import type { TelegramInlineKeyboardMarkup } from "./types";

export type TelegramCommand =
  | { kind: "start" }
  | { kind: "new"; prompt: string }
  | { kind: "trips" }
  | { kind: "status" }
  | { kind: "cancel" }
  | { kind: "plain_text"; text: string }
  | { kind: "unknown"; text: string };

export type TelegramCallbackAction =
  | { kind: "switch_trip"; tripId: string }
  | { kind: "unknown" };

export type TripSwitchButtonInput = {
  id: string;
  title: string;
};

function stripBotSuffix(command: string) {
  return command.replace(/@[\w_]+$/i, "");
}

export function parseTelegramCommand(text: string): TelegramCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return { kind: "plain_text", text: trimmed };
  }

  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = stripBotSuffix(rawCommand).toLowerCase();
  const payload = rest.join(" ").trim();

  if (command === "/start") return { kind: "start" };
  if (command === "/new") return { kind: "new", prompt: payload };
  if (command === "/trips") return { kind: "trips" };
  if (command === "/status") return { kind: "status" };
  if (command === "/cancel") return { kind: "cancel" };
  return { kind: "unknown", text: trimmed };
}

export function parseTelegramCallbackData(data?: string): TelegramCallbackAction {
  if (!data) return { kind: "unknown" };
  if (data.startsWith("sw:")) {
    const tripId = data.slice(3).trim();
    return tripId ? { kind: "switch_trip", tripId } : { kind: "unknown" };
  }
  return { kind: "unknown" };
}

export function buildTripSwitchKeyboard(
  trips: TripSwitchButtonInput[]
): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: trips.map((trip) => {
      const callbackData = `sw:${trip.id}`;
      if (Buffer.byteLength(callbackData, "utf8") > 64) {
        throw new Error("Telegram callback_data exceeds 64 bytes.");
      }
      return [
        {
          text: `切换到此行程：${trip.title}`,
          callback_data: callbackData,
        },
      ];
    }),
  };
}
