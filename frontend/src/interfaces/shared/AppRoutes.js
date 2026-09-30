import React from "react";
import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "../../components/ProtectedRoute";
import ProtectedAdminRoute from "../../components/ProtectedAdminRoute";
import NotProtectedRoute from "../../components/NotProtectedRoute";
import Administration from "../../components/AdministrationPage";
import FormNewVideoPage from "../../components/FormNewVideoPage";
import FormNewMusicPage from "../../components/FormNewMusicPage";
import { classicInterface } from "../classic";
import { APP_ROUTES } from "./routeDefinitions";

const guards = {
  public: NotProtectedRoute,
  user: ProtectedRoute,
  admin: ProtectedAdminRoute,
};
const adminPages = {
  administration: Administration,
  newVideo: FormNewVideoPage,
  newMusic: FormNewMusicPage,
};

export default function AppRoutes({ interfaceDefinition }) {
  return (
    <Routes>
      {APP_ROUTES.map((route) => {
        const definition = route.admin ? classicInterface : interfaceDefinition;
        const Page = route.admin ? adminPages[route.page] : definition.pages[route.page];
        const Shell = definition.Shell;
        const Guard = guards[route.access];
        const page = route.withoutShell ? <Page /> : (
          <Shell withFooter={route.withFooter} contentClassName={route.contentClassName}>
            <Page />
          </Shell>
        );
        return <Route key={route.path} path={route.path} element={<Guard>{page}</Guard>} />;
      })}
    </Routes>
  );
}
