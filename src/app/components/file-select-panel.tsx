import type * as React from "react";
import { FolderArchive, Upload } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FileSelectPanel({
  panelId,
  inputId,
  directoryInputId,
  projectDirectoryInputId,
  descriptionId,
  description,
  className,
  directoryControl,
  directoryLabel = "选择文件夹",
  fileNameId,
}: {
  panelId?: string;
  inputId: string;
  directoryInputId?: string;
  projectDirectoryInputId?: string;
  descriptionId?: string;
  description: string;
  className?: string;
  directoryControl?: React.ReactNode;
  directoryLabel?: string;
  fileNameId: string;
}) {
  return (
    <div
      data-reveal
      id={panelId}
      className={cn("app-style-27", className)}
    >
      <strong id={descriptionId} className="app-style-28">{description}</strong>
      <div className="app-style-29">
        <label htmlFor={inputId} className={cn(buttonVariants({ variant: "outline" }), "app-style-31")}>
          <Upload />选择文件
        </label>
        {directoryControl ?? (directoryInputId ? (
          <label htmlFor={directoryInputId} className={cn(buttonVariants({ variant: "outline" }), "app-style-31")}>
            <FolderArchive />{directoryLabel}
          </label>
        ) : null)}
      </div>
      <input id={inputId} className="dialog-style-07" type="file" />
      {directoryInputId ? (
        <input
          id={directoryInputId}
          className="dialog-style-07"
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
        />
      ) : null}
      {projectDirectoryInputId ? (
        <input
          id={projectDirectoryInputId}
          className="dialog-style-07"
          type="file"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
        />
      ) : null}
      <span id={fileNameId} className="app-style-32">未选择文件或文件夹</span>
    </div>
  );
}
