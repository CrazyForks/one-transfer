import { ControllerError } from "@/components/controller-error";
import { useMountedController } from "@/hooks/use-mounted-controller";
import { useTransferChannel } from "@/app/components/transfer-channel-tabs";
import { SendPage } from "./components/send-page";

const loadSendController = () => import("../../../send/main").then((module) => module.mountSend);
const loadClipboardSendController = () => import("../../../clipboard/main").then((module) => module.mountClipboardSend);

export function SendRoute() {
  const [channel, setChannel] = useTransferChannel();
  const sendError = useMountedController(loadSendController, channel === "qr");
  const clipboardError = useMountedController(loadClipboardSendController, channel === "clipboard");
  const controllerError = channel === "qr" ? sendError : clipboardError;

  return <><ControllerError message={controllerError} /><SendPage channel={channel} onChannelChange={setChannel} /></>;
}
