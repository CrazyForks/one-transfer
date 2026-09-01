import { ControllerError } from "@/components/controller-error";
import { useMountedController } from "@/hooks/use-mounted-controller";
import { useTransferChannel } from "@/app/components/transfer-channel-tabs";
import { ReceivePage } from "./components/receive-page";

const loadReceiveController = () => import("../../../receive/main").then((module) => module.mountReceive);
const loadClipboardReceiveController = () => import("../../../clipboard/receive").then((module) => module.mountClipboardReceive);

export function ReceiveRoute() {
  const receiveError = useMountedController(loadReceiveController);
  const clipboardError = useMountedController(loadClipboardReceiveController);
  const [channel, setChannel] = useTransferChannel();
  return <><ControllerError message={receiveError ?? clipboardError} /><ReceivePage channel={channel} onChannelChange={setChannel} /></>;
}
