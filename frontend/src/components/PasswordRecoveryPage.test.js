import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PasswordRecoveryPage from "./PasswordRecoveryPage";
import api from "../services/api";
jest.mock("react-router-dom",()=>({Link:({children,to})=><a href={to}>{children}</a>}),{virtual:true});
jest.mock("../services/api",()=>({__esModule:true,default:{post:jest.fn()}}));
beforeEach(()=>{jest.clearAllMocks();window.history.replaceState(null,"","/recuperation-mot-de-passe#token=synthetic");});
it("retire le jeton de l’URL et attend une confirmation explicite",async()=>{
  api.post.mockResolvedValue({data:{temporaryPassword:"Synthetic-123!",surnom:"Test"}});render(<PasswordRecoveryPage />);
  await waitFor(()=>expect(window.location.hash).toBe(""));expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Confirmer la récupération"}));
  expect(await screen.findByLabelText("Mot de passe temporaire")).toHaveValue("Synthetic-123!");
  expect(api.post).toHaveBeenCalledWith("/users/password-recovery/confirm",{token:"synthetic"});
  expect(localStorage.getItem("temporaryPassword")).toBeNull();
});
it("n’affiche aucun mot de passe après un lien expiré",async()=>{
  api.post.mockRejectedValue({response:{data:{error:"Lien invalide ou expiré."}}});render(<PasswordRecoveryPage />);
  fireEvent.click(screen.getByRole("button",{name:"Confirmer la récupération"}));expect(await screen.findByRole("alert")).toHaveTextContent("Lien invalide ou expiré.");expect(screen.queryByLabelText("Mot de passe temporaire")).not.toBeInTheDocument();
});
