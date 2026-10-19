import { fireEvent, render, screen } from "@testing-library/react";
import AlternativeTitlesInput from "./AlternativeTitlesInput";

afterEach(() => {
  delete navigator.clipboard;
  delete document.execCommand;
});
test("copie uniquement le séparateur sans modifier le champ", async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const onChange = jest.fn();
  render(<AlternativeTitlesInput value="Mégalodon" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier le séparateur |" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Séparateur | copié.");
  expect(writeText).toHaveBeenCalledWith("|");
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Titres alternatifs (facultatif)" })).toHaveValue("Mégalodon");
});
test("permet la copie sur un navigateur sans API clipboard", async () => {
  document.execCommand = jest.fn().mockReturnValue(true);
  render(<AlternativeTitlesInput value="" onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier le séparateur |" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Séparateur | copié.");
  expect(document.execCommand).toHaveBeenCalledWith("copy");
});
test("sélectionne le séparateur pour une copie manuelle si la copie est refusée", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn().mockRejectedValue(new Error("refus")) } });
  render(<AlternativeTitlesInput value="" onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Copier le séparateur |" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Copie automatique indisponible");
  const separator = screen.getByLabelText("Séparateur à copier manuellement");
  expect(separator).toHaveFocus();
  expect(separator.selectionStart).toBe(0);
  expect(separator.selectionEnd).toBe(1);
});
