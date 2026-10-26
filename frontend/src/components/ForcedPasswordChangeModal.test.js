import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForcedPasswordChangeModal from "./ForcedPasswordChangeModal";
import api from "../services/api";
jest.mock("../services/api", () => ({ __esModule: true, default: { post: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
const fill = (value, confirmation = value) => {
  fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value } });
  fireEvent.change(screen.getByLabelText("Confirmer le nouveau mot de passe"), { target: { value: confirmation } });
};
it("impose la modale, les deux champs et refuse Échap", async () => {
  render(<ForcedPasswordChangeModal onCompleted={jest.fn()} />);
  const dialog=await screen.findByRole("dialog");
  fireEvent.keyDown(document,{key:"Escape",code:"Escape"});
  expect(dialog).toBeInTheDocument();
  expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAttribute("type","password");
  expect(screen.getByLabelText("Confirmer le nouveau mot de passe")).toHaveAttribute("autocomplete","new-password");
  expect(screen.queryByRole("button",{name:/fermer|annuler/i})).not.toBeInTheDocument();
});
it("n’envoie aucune demande si la confirmation diffère", async () => {
  render(<ForcedPasswordChangeModal onCompleted={jest.fn()} />);await screen.findByRole("dialog");
  fill("Personal-123!","Different-123!");fireEvent.submit(screen.getByRole("button",{name:"Enregistrer mon mot de passe"}).closest("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("ne correspondent pas");expect(api.post).not.toHaveBeenCalled();
});
it("conserve la modale après un refus du serveur", async () => {
  api.post.mockRejectedValue({response:{data:{error:"Choisis un autre mot de passe."}}});
  const completed=jest.fn();render(<ForcedPasswordChangeModal onCompleted={completed} />);await screen.findByRole("dialog");
  fill("Personal-123!");fireEvent.submit(screen.getByRole("button",{name:"Enregistrer mon mot de passe"}).closest("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choisis un autre mot de passe.");expect(screen.getByRole("dialog")).toBeInTheDocument();expect(completed).not.toHaveBeenCalled();
});
it("ne termine le parcours qu’après sauvegarde serveur et bloque les doubles envois", async () => {
  let resolve;api.post.mockReturnValue(new Promise(done=>{resolve=done;}));
  const completed=jest.fn();render(<ForcedPasswordChangeModal onCompleted={completed} />);await screen.findByRole("dialog");
  fill("Personal-123!");fireEvent.submit(screen.getByRole("button",{name:"Enregistrer mon mot de passe"}).closest("form"));
  expect(screen.getByLabelText("Nouveau mot de passe")).toBeDisabled();expect(completed).not.toHaveBeenCalled();
  resolve({data:{}});await waitFor(()=>expect(completed).toHaveBeenCalledTimes(1));
  expect(api.post).toHaveBeenCalledWith("/users/password-recovery/complete",{newPassword:"Personal-123!",confirmPassword:"Personal-123!"});
});
