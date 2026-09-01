import type * as React from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardPaste, QrCode } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { TabsContent } from "@/components/ui/tabs";

export type TransferChannel = "qr" | "clipboard";

export function transferChannelFromSearch(searchParams: URLSearchParams): TransferChannel {
  return searchParams.get("channel") === "clipboard" ? "clipboard" : "qr";
}

export function useTransferChannel(): [TransferChannel, (channel: TransferChannel) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const channel = transferChannelFromSearch(searchParams);

  const setChannel = (nextChannel: TransferChannel) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextChannel === "qr") nextSearchParams.delete("channel");
    else nextSearchParams.set("channel", nextChannel);
    setSearchParams(nextSearchParams, { replace: true });
  };

  return [channel, setChannel];
}

export function TransferChannelTabs({
  channel,
  onChannelChange,
  qr,
  clipboard,
}: {
  channel: TransferChannel;
  onChannelChange: (channel: TransferChannel) => void;
  qr: React.ReactNode;
  clipboard: React.ReactNode;
}) {
  return (
    <SegmentedTabs
      value={channel}
      onValueChange={(value) => onChannelChange(value as TransferChannel)}
      items={[
        { value: "qr", label: <><QrCode />二维码</> },
        { value: "clipboard", label: <><ClipboardPaste />剪贴板</> },
      ]}
      ariaLabel="传输通道"
      className="transfer-channel-tabs"
      listClassName="transfer-channel-tabs-list"
    >
      <TabsContent value="qr" className="transfer-channel-content">
        {channel === "qr" ? qr : null}
      </TabsContent>
      <TabsContent value="clipboard" className="transfer-channel-content">
        {channel === "clipboard" ? clipboard : null}
      </TabsContent>
    </SegmentedTabs>
  );
}
