import { ControllerError } from "@/components/controller-error";
import { useMountedController } from "@/hooks/use-mounted-controller";
import { useTransferChannel } from "@/app/components/transfer-channel-tabs";
import { SendPage } from "./components/send-page";

const loadSendController = () => import("../../../send/main").then((module) => module.mountSend);
const loadClipboardSendController = () => import("../../../clipboard/main").then((module) => module.mountClipboardSend);

export function SendRoute() {
  const sendError = useMountedController(loadSendController);
  const clipboardError = useMountedController(loadClipboardSendController);
  const [channel, setChannel] = useTransferChannel();
  return <><ControllerError message={sendError ?? clipboardError} /><SendPage channel={channel} onChannelChange={setChannel} /></>;
}
