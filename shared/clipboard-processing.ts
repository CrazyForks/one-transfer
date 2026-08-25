import { zip } from "fflate";

import type { EncodedClipboardTransfer } from "./clipboard-transfer";

export interface ClipboardDirectoryEntry {
  readonly path: string;
  readonly blob: Blob;
}

export type ClipboardProcessingRequest =
  | {
      readonly type: "encode";
      readonly itemType: "file" | "directory";
      readonly name: string;
      readonly bytes: Uint8Array;
      readonly codec: "base91";
      readonly mediaType: string;
    }
  | {
      readonly type: "archive-directory";
      readonly entries: ClipboardDirectoryEntry[];
    };

export type ClipboardProcessingResponse =
  | { readonly type: "encoded"; readonly encoded: EncodedClipboardTransfer }
  | { readonly type: "archive"; readonly bytes: Uint8Array }
  | { readonly type: "error"; readonly message: string };

export async function createClipboardDirectoryArchive(
  entries: readonly ClipboardDirectoryEntry[],
): Promise<Uint8Array> {
  const contents: Record<string, Uint8Array> = Object.create(null);
  await Promise.all(entries.map(async ({ path, blob }) => {
    contents[path] = new Uint8Array(await blob.arrayBuffer());
  }));
  return new Promise((resolve, reject) => {
    zip(contents, { level: 9 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}
