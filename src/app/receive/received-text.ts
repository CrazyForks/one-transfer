export const RECEIVED_TEXT_EVENT = "one-transfer:received-text";

// Keep only the latest text in memory; never write received content to storage.
let receivedText: string | null = null;

export function getReceivedText() {
  return receivedText;
}

export function setReceivedText(text: string) {
  receivedText = text;
}

export function getTextLinks(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'\u3000-\u303f\uff00-\uffef]+/gi) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,;!?)\]]+$/, "")))].filter((url) => {
    try {
      const parsed = new URL(url);
      return Boolean(parsed.hostname) && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  });
}
