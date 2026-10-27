import React from "react";
import Navbar from "./NavBar";
import FooterPage from "./FooterPage";
import WallPaper from "./WallPaper";
import GeneralMessageBanner from "../../../components/GeneralMessageBanner";
import { useNav } from "../../../context/NavContext";
import { useLocation } from "react-router-dom";

export default function ClassicShell({ children, withFooter = true, contentClassName = "" }) {
  const { cinemaMode } = useNav();
  const { pathname } = useLocation();
  const cinemaActive = cinemaMode && /^\/lecture\/[^/]+\/?$/.test(pathname);
  const paddingClass = cinemaActive ? '' : 'lg:pl-72';

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

