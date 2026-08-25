import { ControllerError } from "@/components/controller-error";
import { useMountedController } from "@/hooks/use-mounted-controller";
import { SendPage } from "./components/send-page";

const loadSendController = () => import("../../../send/main").then((module) => module.mountSend);

export function SendRoute() {
  const error = useMountedController(loadSendController);
  return <><ControllerError message={error} /><SendPage /></>;
}
