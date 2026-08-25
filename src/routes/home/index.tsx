import { ChevronRight, ClipboardPaste, ScanLine, Upload } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { handleRouteClick, type RouteOutletContext } from "@/app/navigation";

const transferCards = [
  { to: "/send", title: "发送", description: "播放文件或文字二维码", icon: Upload },
  { to: "/receive", title: "接收", description: "扫描屏幕或使用相机", icon: ScanLine },
  { to: "/clipboard", title: "剪贴板", description: "用文本剪贴板传递文件数据", icon: ClipboardPaste },
] as const;

function HomeView({ transitionTo }: { transitionTo: (to: string) => void }) {
  return (
    <main
      data-route-page
      data-view="home"
      className="app-style-12"
    >
      <section data-reveal className="app-style-13">
        <h1 className="app-style-14">One Transfer</h1>
        <p data-breathe className="app-style-15">用光传递数据</p>
      </section>
      <section className="app-style-16" aria-label="选择功能">
        {transferCards.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} onClick={(event) => handleRouteClick(event, to, transitionTo)} data-reveal className="app-style-17">
            <Card className="app-style-18">
              <CardContent className="app-style-19">
                <span className="app-style-20">
                  <Icon className="app-style-21" strokeWidth={1.8} />
                </span>
                <span className="app-style-22">
                  <strong className="app-style-23">{title}</strong>
                  <span className="dialog-style-11">{description}</span>
                </span>
                <ChevronRight className="app-style-24" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}

export function HomeRoute() {
  const { transitionTo } = useOutletContext<RouteOutletContext>();
  return <HomeView transitionTo={transitionTo} />;
}
