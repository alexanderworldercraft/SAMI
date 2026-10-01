import { render, screen } from "@testing-library/react";

import ContentUniverseSection from "./ContentUniverseSection";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  }),
  { virtual: true }
);

describe("ContentUniverseSection", () => {
  test("affiche tous les univers réels transmis", () => {
    render(
      <ContentUniverseSection
        universes={[
          { UniverseID: 12, Titre: "Star Wars", Resume: "Une galaxie lointaine." },
          { UniverseID: 18, Titre: "Univers chronologique", Resume: "Ordre complet." },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Ce contenu appartient à" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Star Wars" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Univers chronologique" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir l'univers Star Wars" })).toHaveAttribute(
      "href",
      "/sagas#universe-12"
    );
  });

  test("ne change pas la page lorsqu'aucun univers réel n'est présent", () => {
    const { container } = render(<ContentUniverseSection universes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
