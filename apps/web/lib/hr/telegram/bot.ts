const TELEGRAM_API_BASE = "https://api.telegram.org";

export function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

export interface InlineKeyboardButton {
  text: string;
  web_app?: { url: string };
  callback_data?: string;
}

export interface SendMessageOptions {
  requestLocation?: boolean;
  requestContact?: boolean;
  removeKeyboard?: boolean;
  parseMode?: "Markdown";
  inlineKeyboard?: InlineKeyboardButton[][];
}

export async function sendMessage(
  chatId: number,
  text: string,
  opts?: SendMessageOptions,
): Promise<void> {
  const token = getBotToken();

  const payload: Record<string, unknown> = { chat_id: chatId, text };

  if (opts?.parseMode) {
    payload.parse_mode = opts.parseMode;
  }

  if (opts?.inlineKeyboard) {
    // Mutually exclusive with requestLocation/removeKeyboard — Telegram only
    // accepts one reply_markup shape per message. inlineKeyboard wins.
    payload.reply_markup = { inline_keyboard: opts.inlineKeyboard };
  } else if (opts?.requestContact) {
    payload.reply_markup = {
      keyboard: [[{ text: "📱 Share my phone number", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } else if (opts?.requestLocation) {
    payload.reply_markup = {
      keyboard: [[{ text: "📍 Share Location", request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } else if (opts?.removeKeyboard) {
    payload.reply_markup = { remove_keyboard: true };
  }

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${res.status} ${errText}`);
  }
}

export async function getFileBuffer(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
  const token = getBotToken();

  const fileRes = await fetch(
    `${TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  if (!fileRes.ok) {
    throw new Error(`Telegram getFile failed: ${fileRes.status}`);
  }

  const fileJson = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = fileJson.result?.file_path;
  if (!fileJson.ok || !filePath) {
    throw new Error("Telegram getFile returned no file_path");
  }

  const downloadRes = await fetch(`${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`);
  if (!downloadRes.ok) {
    throw new Error(`Telegram file download failed: ${downloadRes.status}`);
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const contentType = downloadRes.headers.get("content-type") || "image/jpeg";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}
