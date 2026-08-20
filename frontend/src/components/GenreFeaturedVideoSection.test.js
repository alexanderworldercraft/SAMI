import React from "react";
import { render, screen } from "@testing-library/react";
import GenreFeaturedVideoSection from "./GenreFeaturedVideoSection";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
    useNavigate: () => jest.fn(),
  }),
  { virtual: true }
);

jest.mock("./ContentPreviewTooltip", () => ({ title, className = "", children }) => (
  <div data-testid={`preview-${title}`} className={className}>
    {children}
  </div>
));

const makeVideo = (id, title) => ({
  id,
  VideoID: id,
  Titre: title,
  CheminImage: `uploads/${id}.jpg`,
  type: "video",
});

test("place la vedette en premier sur mobile et conserve la grille desktop", () => {
  const featured = makeVideo(99, "Vedette");
  const videos = [
    makeVideo(1, "Standard 1"),
    makeVideo(2, "Standard 2"),
    makeVideo(3, "Standard 3"),
    makeVideo(4, "Standard 4"),
    makeVideo(5, "Standard 5"),
  ];

  render(
    <GenreFeaturedVideoSection
      title="Animation"
      genreId={7}
      videos={videos}
      featured={featured}
    />
  );

  const cardLinks = screen.getAllByRole("link");
  expect(cardLinks).toHaveLength(6);
  expect(cardLinks[0]).toHaveAttribute("href", "/lecture/99");

  expect(screen.getByTestId("preview-Vedette")).toHaveClass(
    "col-span-2",
    "h-full",
    "xl:col-span-1",
    "xl:col-start-2",
    "xl:row-span-2"
  );

  ["Standard 1", "Standard 2", "Standard 3", "Standard 4"].forEach((title) => {
    const wrapper = screen.getByTestId(`preview-${title}`);
    expect(wrapper).toHaveClass("h-full");
    expect(wrapper.querySelector("a")).toHaveClass("h-full");
  });

  expect(screen.getByTestId("preview-Standard 5")).not.toHaveClass("col-span-2");
  expect(screen.getByTestId("preview-Standard 5")).toHaveClass(
    "xl:col-start-4",
    "xl:row-span-2"
  );
});
