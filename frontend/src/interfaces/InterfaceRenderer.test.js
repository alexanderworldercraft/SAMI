import React, { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import InterfaceRenderer from "./InterfaceRenderer";
import { useInterfacePreference } from "../context/InterfacePreferenceContext";
import { useLocation } from "react-router-dom";
const mockOnMount = jest.fn();
function MockPlayer() {
  React.useEffect(() => { mockOnMount(); }, []);
  const [playing, setPlaying] = useState(false);
  return <button onClick={() => setPlaying(true)}>{playing ? "Lecture en cours" : "Lire"}</button>;
}
jest.mock("../context/InterfacePreferenceContext", () => ({ useInterfacePreference: jest.fn() }));
jest.mock("react-router-dom", () => ({ useLocation: jest.fn() }), { virtual: true });
jest.mock("../components/MaintenanceBanner", () => () => null);
jest.mock("./shared/MetaUpdater", () => () => null);
jest.mock("./shared/AppRoutes", () => ({ interfaceDefinition }) => <span data-testid="interface-id">{interfaceDefinition.id}</span>);
jest.mock("./classic", () => ({ classicInterface: { id: "classic", renderedMode: "classic", pages: {}, PersistentMusicPlayer: (props) => <MockPlayer {...props} /> } }));

beforeEach(() => {
  jest.clearAllMocks();
  useLocation.mockReturnValue({ pathname: "/musique" });
  useInterfacePreference.mockReturnValue({ mode: "classic" });
});
test("changer un mode provisoire conserve l'état du lecteur et le choix demandé", async () => {
  const view = render(<InterfaceRenderer />);
  await act(async () => { screen.getByRole("button", { name: "Lire" }).click(); });
  for (const mode of ["tactile", "remote", "classic"]) {
    useInterfacePreference.mockReturnValue({ mode });
    view.rerender(<InterfaceRenderer />);
    expect(screen.getByTestId("interface-id")).toHaveTextContent(mode);
    expect(screen.getByRole("button", { name: "Lecture en cours" })).toBeInTheDocument();
    expect(document.documentElement.dataset.interfaceRendered).toBe("classic");
  }
  expect(mockOnMount).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(document.documentElement.dataset.interfaceRendered).toBeUndefined();
});
test("une préférence remote garde l'administration dans classic sans l'écraser", () => {
  const preference = { mode: "remote" };
  useInterfacePreference.mockReturnValue(preference);
  useLocation.mockReturnValue({ pathname: "/administration" });
  const view = render(<InterfaceRenderer />);
  expect(screen.getByTestId("interface-id")).toHaveTextContent("classic");
  expect(preference.mode).toBe("remote");
  useLocation.mockReturnValue({ pathname: "/videos" });
  view.rerender(<InterfaceRenderer />);
  expect(screen.getByTestId("interface-id")).toHaveTextContent("remote");
});
