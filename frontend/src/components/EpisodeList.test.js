import { fireEvent, render, screen } from "@testing-library/react";
import EpisodeList from "./EpisodeList";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  }),
  { virtual: true }
);

describe("EpisodeList - navigation vers la lecture", () => {
  test("ajoute l'ancre de lecture et déclenche le retour en haut", () => {
    const onEpisodeClick = jest.fn();
    const episode = {
      VideoID: 42,
      Titre: "Épisode 2",
      Premium: false,
      Watched: false,
    };

    render(
      <EpisodeList
        episodes={[episode]}
        currentEpisode={null}
        linkAnchor="#lecture-top"
        onEpisodeClick={onEpisodeClick}
      />
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/lecture/42#lecture-top");

    fireEvent.click(link);
    expect(onEpisodeClick).toHaveBeenCalledWith(episode);
  });
});
