import { describe, expect, it, vi } from "vitest";
const events=vi.hoisted(()=>[]);
const db=vi.hoisted(()=>({utilisateur:{findFirst:vi.fn(async()=>({UtilisateurID:7,Surnom:"synthetic",Email:"synthetic@example.invalid",Salt:null})),update:vi.fn(async()=>{events.push("password-write");return {};})},action:{findUnique:vi.fn(async()=>null)}}));
vi.mock("../services/db.js",()=>({prisma:db,default:db}));
vi.mock("../services/mailService.js",()=>({sendPasswordResetEmail:vi.fn(async()=>events.push("email-dispatch"))}));
import { userController } from "../controllers/userController.js";
describe("baseline recovery flow evidence",()=>{it("changes the password without verifying ownership of the email address",async()=>{
const reply={status:vi.fn(function(){return this;}),send:vi.fn()};await userController.resetPassword({body:{surnom:"synthetic",email:"synthetic@example.invalid"}},reply);
expect(events).toEqual(["password-write","email-dispatch"]);expect(db.utilisateur.update).toHaveBeenCalledTimes(1);
});});
