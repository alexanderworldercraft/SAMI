import React, { useLayoutEffect, useRef } from "react";
import TactileNavigation from "./TactileNavigation";
import WallPaper from "../../classic/layout/WallPaper";
import FooterPage from "../../classic/layout/FooterPage";
import GeneralMessageBanner from "../../../components/GeneralMessageBanner";

export default function TactileShell({ children, withFooter = true, contentClassName = "" }) {
  const shellRef = useRef(null);
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const topbar = shell.querySelector(".tactile-topbar");
    const bottomNav = shell.querySelector(".tactile-bottom-nav");
    const measure = () => {
      if (topbar) shell.style.setProperty("--tactile-topbar-height", `${topbar.getBoundingClientRect().height}px`);
      if (bottomNav) shell.style.setProperty("--tactile-bottom-height", `${bottomNav.getBoundingClientRect().height}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    if (topbar) observer.observe(topbar);
    if (bottomNav) observer.observe(bottomNav);
    return () => observer.disconnect();
  }, []);
  return <div ref={shellRef} className="tactile-shell min-h-dvh text-slate-900 dark:text-white">
    <WallPaper />
    <TactileNavigation />
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6">
      <GeneralMessageBanner />
      <main className={contentClassName || "min-w-0 py-4 sm:py-6"}>{children}</main>
      {withFooter && <FooterPage />}
    </div>
  </div>;
}
