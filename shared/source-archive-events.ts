export const SOURCE_ARCHIVE_PROGRESS_EVENT = "one-transfer:source-archive-progress";

export type SourceArchiveProgressState = "idle" | "running" | "success" | "error";

export interface SourceArchiveProgressDetail {
  readonly state: SourceArchiveProgressState;
  readonly percent: number;
  readonly message: string;
  readonly archiveName?: string;
  readonly archiveBytes?: number;
}
