import React from "react";
import RemoteNavigation from "./RemoteNavigation";
import WallPaper from "../../classic/layout/WallPaper";
import FooterPage from "../../classic/layout/FooterPage";
import GeneralMessageBanner from "../../../components/GeneralMessageBanner";

export default function RemoteShell({ children, withFooter = true, contentClassName = "" }) {
  return <div className="remote-shell">
    <WallPaper />
    <RemoteNavigation />
    <div className="remote-content" data-remote-content>
      <GeneralMessageBanner />
      <main className={contentClassName || "py-6"}>{children}</main>
      {withFooter && <FooterPage />}
    </div>
  </div>;
}
