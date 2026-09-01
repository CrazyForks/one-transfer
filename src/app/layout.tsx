import * as React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { gsap } from "gsap";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { AppUpdateChecker } from "@/components/app-update-checker";
import { BrandMark } from "@/components/brand-mark";
import { BuildInfo } from "@/components/build-info";
import { Button } from "@/components/ui/button";
import { SweepShine } from "@/components/ui/sweep-shine";
import { cn } from "@/lib/utils";
import { ROUTE_TITLES, routeFromPath, type RouteKey } from "./constants";
import { handleRouteClick, type RouteOutletContext, type TransitionTo } from "./navigation";

function LoadingScreen({ overlayRef }: { overlayRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={overlayRef}
      className="app-style-01"
      role="status"
      aria-label="One Transfer 加载中"
    >
      <div className="app-style-02">
        <BrandMark className="brand-mark brand-mark--loading" />
        <SweepShine asChild>
          <strong className="app-style-03">One Transfer</strong>
        </SweepShine>
        <SweepShine className="app-style-04">用光传递数据</SweepShine>
      </div>
    </div>
  );
}

function Header({ route, transitionTo }: { route: RouteKey; transitionTo: TransitionTo }) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "app-style-110",
      "app-style-111",
      isActive ? "app-style-112" : "app-style-113",
    );

  return (
    <header
      hidden={route === "home"}
      className="app-style-05"
    >
      <Button asChild variant="ghost" size="icon" className="app-style-06" aria-label="返回首页">
        <Link to="/" onClick={(event) => handleRouteClick(event, "/", transitionTo)}><ArrowLeft /></Link>
      </Button>
      <nav className="app-style-07" aria-label="功能切换">
        <NavLink to="/send" className={navClass} onClick={(event) => handleRouteClick(event, "/send", transitionTo)}>发送</NavLink>
        <NavLink to="/receive" className={navClass} onClick={(event) => handleRouteClick(event, "/receive", transitionTo)}>接收</NavLink>
        <NavLink to="/clipboard" className={navClass} onClick={(event) => handleRouteClick(event, "/clipboard", transitionTo)}>剪贴板</NavLink>
      </nav>
      <BrandMark className="brand-mark brand-mark--header" />
    </header>
  );
}

function Footer() {
  return (
    <footer className="app-style-08">
      <a
        href="https://github.com/zhihui-hu/one-transfer"
        target="_blank"
        rel="noreferrer"
        className="app-style-09"
      >
        <svg viewBox="0 0 24 24" className="app-style-10" aria-hidden="true">
          <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.11c.98 0 1.95.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.25c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
        </svg>
        github.com/zhihui-hu/one-transfer
      </a>
      <span className="app-style-11">
        v{__APP_VERSION__} · {__APP_COMMIT__ === "development" ? "dev" : __APP_COMMIT__.slice(0, 7)}
      </span>
    </footer>
  );
}

export function TransferLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = routeFromPath(location.pathname);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasEnteredRouteRef = useRef(false);

  const transitionTo = useCallback(
    (to: string) => {
      if (location.pathname === to) return;
      navigate(to);
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    document.title = ROUTE_TITLES[route];
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route]);

  useLayoutEffect(() => {
    if (!overlayRef.current || !contentRef.current) return;
    const overlay = overlayRef.current;
    const fallback = window.setTimeout(() => setLoaderVisible(false), 1200);
    const timeline = gsap.timeline({
      onComplete: () => {
        window.clearTimeout(fallback);
        setLoaderVisible(false);
      },
    });
    timeline.to(overlay, {
      autoAlpha: 0,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.45,
      delay: 0.55,
      ease: "power2.inOut",
    });
    return () => {
      window.clearTimeout(fallback);
      timeline.kill();
    };
  }, []);

  useLayoutEffect(() => {
    const page = contentRef.current?.querySelector<HTMLElement>("[data-route-page]");
    if (!page) return;
    const isInitialEntry = !hasEnteredRouteRef.current;
    hasEnteredRouteRef.current = true;
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const entrance = gsap.timeline({ defaults: { ease: "power3.out" } });
        if (isInitialEntry) {
          entrance
            .fromTo(page, { autoAlpha: 0.7, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3 })
            .fromTo(
              page.querySelectorAll("[data-reveal]"),
              { autoAlpha: 0.75, y: 10 },
              { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.035 },
              "-=0.2",
            );
        } else {
          entrance
            .fromTo(page, { y: 3 }, { y: 0, duration: 0.14, clearProps: "transform" })
            .fromTo(
              page.querySelectorAll("[data-reveal]"),
              { y: 3 },
              { y: 0, duration: 0.15, stagger: 0.012, clearProps: "transform" },
              "<",
            );
        }
        const breathing = gsap.to(page.querySelectorAll("[data-breathe]"), {
          scale: 1.012,
          autoAlpha: 0.9,
          duration: 2.4,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
        return () => { entrance.kill(); breathing.kill(); };
      });
      return () => mm.revert();
    }, page);
    return () => context.revert();
  }, [location.pathname]);

  return (
    <>
      {loaderVisible ? <LoadingScreen overlayRef={overlayRef} /> : null}
      <div ref={contentRef} className="app-style-109">
        <Header route={route} transitionTo={transitionTo} />
        <Outlet context={{ transitionTo } satisfies RouteOutletContext} />
        <Footer />
      </div>
      <BuildInfo />
      <AppUpdateChecker />
    </>
  );
}
