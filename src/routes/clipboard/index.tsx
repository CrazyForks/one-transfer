import { ControllerError } from "@/components/controller-error";
import { useMountedController } from "@/hooks/use-mounted-controller";
import { ClipboardPage } from "./components/clipboard-page";

const loadClipboardController = () => import("../../../clipboard/main").then((module) => module.mountClipboard);

export function ClipboardRoute() {
  const error = useMountedController(loadClipboardController);
  return <><ControllerError message={error} /><ClipboardPage /></>;
}
