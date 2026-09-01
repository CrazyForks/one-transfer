import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PAGE_HEADING, VIEW_SHELL } from "@/app/constants";
import { ClipboardReceivePanel } from "@/app/components/clipboard-panels";
import {
  TransferChannelTabs,
  type TransferChannel,
} from "@/app/components/transfer-channel-tabs";
import {
  RECEIVE_CAPTURE_CLOSE_EVENT,
  RECEIVE_CAPTURE_START_EVENT,
  type ReceiveCaptureSource,
} from "../../../../shared/receive-events";

function QrReceivePanel() {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSettingsOpen, setCaptureSettingsOpen] = useState(false);

  useEffect(() => {
    if (!captureOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [captureOpen]);

  const startCapture = (source: ReceiveCaptureSource) => {
    setCaptureOpen(true);
    window.dispatchEvent(new CustomEvent<ReceiveCaptureSource>(RECEIVE_CAPTURE_START_EVENT, { detail: source }));
  };

  const changeCaptureOpen = (next: boolean) => {
    setCaptureOpen(next);
    if (!next) {
      setCaptureSettingsOpen(false);
      window.dispatchEvent(new Event(RECEIVE_CAPTURE_CLOSE_EVENT));
    }
  };

  return (
    <section className="receiver-primary transfer-channel-panel transfer-tool-surface">
        <header data-reveal className="transfer-tool-header">
          <h2 className="dialog-style-07">二维码接收</h2>
          <span className="transfer-tool-copy">
            <strong>二维码接收</strong>
            <span>选择扫描来源，在全屏窗口查看接收进度</span>
          </span>
        </header>
        <div data-reveal className="app-style-74" id="capture-actions">
          <Button id="start" type="button" className="app-style-75" onClick={() => startCapture("screen")}>扫描电脑屏幕</Button>
          <Button id="start-camera" type="button" variant="outline" onClick={() => startCapture("camera")}>使用相机</Button>
        </div>
        {createPortal(<div
          hidden={!captureOpen}
          className="receive-capture-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="实时扫描"
        >
            <header className="receive-dialog-toolbar">
              <button
                type="button"
                className="receive-toolbar-button"
                aria-label="解码设置"
                aria-expanded={captureSettingsOpen}
                onClick={() => setCaptureSettingsOpen((current) => !current)}
              >
                <Settings2 />
              </button>
              <div className="receive-live-status" id="stats">正在启动扫描…</div>
              <button
                type="button"
                className="receive-toolbar-button"
                aria-label="停止扫描并关闭"
                onClick={() => changeCaptureOpen(false)}
              >
                <X />
              </button>
            </header>
            <section className="receive-settings-panel" hidden={!captureSettingsOpen} aria-label="解码设置">
              <strong>解码设置</strong>
              <div className="receive-settings-fields">
                <label>解码宽度<select id="cfg-width" defaultValue="1280"><option>960</option><option>1280</option><option>1920</option></select></label>
                <label>捕获 FPS<select id="cfg-capfps" defaultValue="60"><option>30</option><option>45</option><option>60</option></select></label>
                <label>Worker数<select id="cfg-workers" defaultValue="2"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
              </div>
              <div className="receive-secondary-metrics">
                <span>新帧/重复 <strong id="m-frames">—</strong></span><span>数据块 K <strong id="m-k">—</strong></span><span>块大小 <strong id="m-block">—</strong></span><span>负载 <strong id="m-payload">—</strong></span>
              </div>
              <span id="capture-actual" className="receive-capture-actual" />
              <div className="receive-log-panel">
                <div className="receive-log-toolbar">
                  <strong>定位日志</strong>
                  <span>
                    <button id="copy-receive-log" type="button">复制</button>
                    <button id="clear-receive-log" type="button">清空</button>
                  </span>
                </div>
                <pre id="receive-log">等待扫描…</pre>
              </div>
            </section>
            <section id="link-calibration" className="receive-link-calibration" hidden aria-live="polite">
              <div className="receive-link-calibration-header">
                <strong>设备动态匹配</strong>
                <span id="link-calibration-status">等待发送端能力信息</span>
              </div>
              <div className="receive-link-calibration-grid">
                <span>发送端 <strong id="link-sender-info">—</strong></span>
                <span>接收端 <strong id="link-receiver-info">—</strong></span>
              </div>
              <div id="link-sender-recommendation" className="receive-link-recommendation">
                收到能力信息后给出发送端数字建议
              </div>
            </section>
            <div className="app-style-81">
              <div className="app-style-82" id="preview" style={{ display: "none" }}>
                <video id="video" muted playsInline className="app-style-83" />
              </div>
            </div>
            <div className="app-style-84 receive-controls-panel">
              <div className="transfer-hud">
                <div className="progress" id="progress" style={{ display: "none" }} role="progressbar" aria-label="接收进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><div id="bar" /></div>
                <div className="progress-status" id="progress-status" style={{ display: "none" }} aria-live="polite">
                  <strong id="progress-label" className="app-style-85">0% · 0帧</strong>
                  <span id="eta-label" className="app-style-86">正在估算时间</span>
                </div>
              </div>
              <div id="metrics" className="receive-primary-metrics" style={{ display: "none" }}>
                <span>捕获 FPS <strong id="m-cap">—</strong></span><span>有效码 FPS <strong id="m-dec">—</strong></span><span>净带宽 <strong id="m-rate">—</strong></span><span>耗时 <strong id="m-time">—</strong></span>
              </div>
              <div id="result" />
            </div>
        </div>, document.body)}
    </section>
  );
}

export function ReceivePage({
  channel,
  onChannelChange,
}: {
  channel: TransferChannel;
  onChannelChange: (channel: TransferChannel) => void;
}) {
  return (
    <main data-route-page data-view="receive" className={VIEW_SHELL}>
      <section data-reveal className="transfer-page-heading">
        <h1 className={PAGE_HEADING}>接收</h1>
        <p className="app-style-35">选择二维码或剪贴板通道接收文件和文字。</p>
      </section>
      <TransferChannelTabs
        channel={channel}
        onChannelChange={onChannelChange}
        qr={<QrReceivePanel />}
        clipboard={<ClipboardReceivePanel />}
      />
    </main>
  );
}
