import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn("dialog-style-01", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  persistent = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { persistent?: boolean }) {
  return (
    <DialogPortal forceMount={persistent || undefined}>
      <DialogOverlay forceMount={persistent || undefined} className={persistent ? "dialog-style-02" : undefined} />
      <DialogPrimitive.Content
        forceMount={persistent || undefined}
        className={cn(
          "dialog-style-03",
          "dialog-style-04",
          persistent && "dialog-style-02",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="dialog-style-05">
          <X className="dialog-style-06" />
          <span className="dialog-style-07">关闭</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("dialog-style-08", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("dialog-style-09", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("dialog-style-10", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("dialog-style-11", className)} {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
