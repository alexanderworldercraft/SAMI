import { scrollToPageTop } from "./scrollToPageTop";

describe("scrollToPageTop", () => {
  test("remonte en haut avec un défilement fluide", () => {
    window.scrollTo = jest.fn();

    scrollToPageTop();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});

