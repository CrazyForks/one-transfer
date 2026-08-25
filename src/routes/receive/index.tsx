import { ControllerError } from "@/components/controller-error";
import { useMountedController } from "@/hooks/use-mounted-controller";
import { ReceivePage } from "./components/receive-page";

const loadReceiveController = () => import("../../../receive/main").then((module) => module.mountReceive);

export function ReceiveRoute() {
  const error = useMountedController(loadReceiveController);
  return <><ControllerError message={error} /><ReceivePage /></>;
}
