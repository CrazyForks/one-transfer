export const SOURCE_ARCHIVE_PROGRESS_EVENT = "one-transfer:source-archive-progress";
export const SOURCE_ARCHIVE_OPTIONS_EVENT = "one-transfer:source-archive-options";
export const SOURCE_ARCHIVE_SEND_EVENT = "one-transfer:source-archive-send";
export const SOURCE_ARCHIVE_COPY_EVENT = "one-transfer:source-archive-copy";

export type SourceArchiveProgressState = "idle" | "running" | "success" | "error";

export interface SourceArchiveProgressDetail {
  readonly state: SourceArchiveProgressState;
  readonly percent: number;
  readonly message: string;
  readonly archiveName?: string;
  readonly archiveBytes?: number;
  readonly downloadUrl?: string;
}

export interface SourceArchiveOptionsDetail {
  readonly includeGit: boolean;
}
