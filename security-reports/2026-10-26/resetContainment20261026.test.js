import { describe, it, expect, vi } from "vitest";
vi.mock("../services/db.js", () => ({ prisma: {}, default: {} }));
import { createServer } from "../server/createServer.js";
describe("password reset containment", () => {
  it("rejects recovery requests before any password or SMTP change", async () => {
    const server=createServer({publicUrl:"https://sami.test"});
    try { const res=await server.inject({method:"POST",url:"/api/users/reset-password",payload:{surnom:"synthetic-only",email:"synthetic@example.invalid"}});expect(res.statusCode).toBe(503); }
    finally { await server.close(); }
  });
});
