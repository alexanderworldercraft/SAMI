import { buildSessionExpiredLoginUrl, getSafeReturnPath } from "./authSession";

describe("authSession", () => {
  it("conserve la page de lecture pour la reprendre après reconnexion", () => {
    const url = buildSessionExpiredLoginUrl({
      pathname: "/lecture/7",
      search: "?audio=fr",
      hash: "#lecture-top",
    });
    const query = url.slice(url.indexOf("?"));

    expect(url).toContain("reason=session-expired");
    expect(getSafeReturnPath(query)).toBe("/lecture/7?audio=fr#lecture-top");
  });

  it("refuse une redirection vers un autre domaine", () => {
    expect(getSafeReturnPath("?returnTo=https%3A%2F%2Fexample.com")).toBe("/");
    expect(getSafeReturnPath("?returnTo=%2F%2Fevil.example")).toBe("/");
  });
});
