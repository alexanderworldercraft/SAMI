import React from "react";
import Navbar from "./NavBar";
import FooterPage from "./FooterPage";
import WallPaper from "./WallPaper";
import GeneralMessageBanner from "../../../components/GeneralMessageBanner";
import { useNav } from "../../../context/NavContext";

export default function ClassicShell({ children, withFooter = true, contentClassName = "" }) {
  const { navMode } = useNav();

  // applique un décalage conditionnel
  const paddingClass = navMode === 'hover' ? 'lg:pl-4' : 'lg:pl-72';

  return (
    <>
      <WallPaper />
      <Navbar />
      <div className={paddingClass}>
        <GeneralMessageBanner />
        <main className={contentClassName || "px-4 sm:px-6 lg:px-8"}>
          {children}
        </main>
        {withFooter && <FooterPage />}
      </div>
    </>
  );
}

