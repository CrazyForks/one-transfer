import { ControllerError } from "@/components/controller-error";
import { useMountedController } from "@/hooks/use-mounted-controller";
import { useTransferChannel } from "@/app/components/transfer-channel-tabs";
import { ReceivePage } from "./components/receive-page";

const loadReceiveController = () => import("./controller").then((module) => module.mountReceive);
const loadClipboardReceiveController = () => import("./clipboard-controller").then((module) => module.mountClipboardReceive);

export function ReceiveRoute() {
  const [channel, setChannel] = useTransferChannel();
  const receiveError = useMountedController(loadReceiveController, channel === "qr");
  const clipboardError = useMountedController(loadClipboardReceiveController, channel === "clipboard");
  const controllerError = channel === "qr" ? receiveError : clipboardError;

  return <><ControllerError message={controllerError} /><ReceivePage channel={channel} onChannelChange={setChannel} /></>;
}
