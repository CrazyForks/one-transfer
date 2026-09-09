import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PAGE_HEADING, VIEW_SHELL } from "@/app/constants";
import { getReceivedText, getTextLinks } from "../received-text";

export function ReceivedTextPage() {
  const text = getReceivedText();
  const [copyStatus, setCopyStatus] = useState("");
  const links = text === null ? [] : getTextLinks(text);

  const copyText = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("已复制全文");
    } catch {
      setCopyStatus("复制失败，请长按正文选择并复制");
    }
  };

  return (
    <main data-route-page className={`${VIEW_SHELL} received-text-page`}>
      <header className="transfer-page-heading">
        <h1 className={PAGE_HEADING}>接收到的文字</h1>
        <p className="app-style-35">{text === null ? "暂无接收内容，刷新或关闭页面后需要重新接收。" : `${text.length.toLocaleString()} 字符 · 内容仅在当前页面会话中保留`}</p>
      </header>
      <div className="received-text-actions">
        <Button asChild variant="outline"><Link to="/receive"><ArrowLeft />返回接收</Link></Button>
        {text !== null && <Button onClick={copyText}><Copy />复制全文</Button>}
        <span role="status">{copyStatus}</span>
      </div>
      {text !== null && <pre className="received-text-content" tabIndex={0} aria-label="接收到的文字">{text}</pre>}
      {links.length > 0 && (
        <section className="received-text-links" aria-label="文字中的链接">
          <h2>打开链接</h2>
          {links.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /><span>{url}</span></a>)}
        </section>
      )}
    </main>
  );
}
