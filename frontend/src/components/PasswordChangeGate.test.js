import { act, render, screen } from "@testing-library/react";
import PasswordChangeGate from "./PasswordChangeGate";
import api from "../services/api";
import { SESSION_CHANGED_EVENT } from "../utils/sessionEvents";
jest.mock("../services/api",()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()}}));
jest.mock("./ForcedPasswordChangeModal",()=>()=> <div role="dialog">Changement obligatoire</div>);
beforeEach(()=>jest.clearAllMocks());
it("restaure la modale après rafraîchissement sans monter le contenu",async()=>{
  api.get.mockResolvedValue({data:{passwordChangeRequired:true}});render(<PasswordChangeGate><main>Contenu protégé</main></PasswordChangeGate>);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
});
it("laisse passer une session normale",async()=>{
  api.get.mockResolvedValue({data:{passwordChangeRequired:false}});render(<PasswordChangeGate><main>Contenu protégé</main></PasswordChangeGate>);
  expect(await screen.findByText("Contenu protégé")).toBeInTheDocument();
});
it("une ancienne réponse anonyme ne ferme pas la modale d’une nouvelle connexion",async()=>{
  let reject;api.get.mockReturnValue(new Promise((_resolve,fail)=>{reject=fail;}));render(<PasswordChangeGate><main>Contenu protégé</main></PasswordChangeGate>);
  act(()=>window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT,{detail:{passwordChangeRequired:true}})));
  await act(async()=>reject({response:{status:401}}));
  expect(screen.getByRole("dialog")).toBeInTheDocument();expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
});
