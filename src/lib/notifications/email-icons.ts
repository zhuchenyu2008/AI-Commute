import icons from "./email-icons.json";
import type { EmailAttachment } from "./email";

export type EmailIconId = keyof typeof icons;

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function emailIconImg(
  id: EmailIconId,
  options: {
    alt?: string;
    width?: number;
    height?: number;
    style?: string;
  } = {}
) {
  const icon = icons[id];
  const width = options.width ?? icon.width;
  const height = options.height ?? icon.height;
  const alt = escapeAttribute(options.alt ?? "");
  const style = options.style ?? "";

  return `<img src="cid:${icon.cid}" width="${width}" height="${height}" alt="${alt}" style="display:block;border:0;outline:none;text-decoration:none;${style}">`;
}

export function buildEmailIconAttachments(
  ids: readonly EmailIconId[]
): EmailAttachment[] {
  const seen = new Set<EmailIconId>();

  return ids
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => {
      const icon = icons[id];

      return {
        filename: icon.filename,
        cid: icon.cid,
        content: Buffer.from(icon.base64, "base64"),
        contentType: icon.contentType,
      };
    });
}
