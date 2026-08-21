import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NavBar from "./NavBar";
import { scrollToPageTop } from "../utils/scrollToPageTop";
import api from "../services/api";

const mockNavigate = jest.fn();

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, onClick, ...props }) => (
      <a
        href={to}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </a>
    ),
    useLocation: () => ({ pathname: "/videos" }),
    useNavigate: () => mockNavigate,
  }),
  { virtual: true }
);
jest.mock("@headlessui/react", () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogBackdrop: () => <div />,
  DialogPanel: ({ children }) => <div>{children}</div>,
  Menu: ({ children }) => <div>{children}</div>,
  MenuButton: ({ children, ...props }) => <button {...props}>{children}</button>,
  MenuItem: ({ children }) => <div>{children}</div>,
  MenuItems: ({ children }) => <div>{children}</div>,
  TransitionChild: ({ children }) => <div>{children}</div>,
}));
jest.mock("@heroicons/react/24/outline", () => ({
  Bars3Icon: () => <span />,
  XMarkIcon: () => <span />,
  HomeIcon: () => <span />,
  UserIcon: () => <span />,
  FilmIcon: () => <span />,
  MusicalNoteIcon: () => <span />,
  RectangleStackIcon: () => <span />,
  PlusCircleIcon: () => <span />,
  Cog6ToothIcon: () => <span />,
}));
jest.mock("@heroicons/react/20/solid", () => ({ ChevronDownIcon: () => <span /> }));
jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(() => new Promise(() => {})) },
}));
jest.mock("./SearchBar", () => () => <div>Recherche</div>);
jest.mock("./ThemeToggle", () => () => <div>Thème</div>);
jest.mock("./NavVisibilityToggle", () => () => <div>Visibilité</div>);
jest.mock("./UserAvatar", () => () => <div>Avatar</div>);
jest.mock("../context/NavContext", () => ({
  useNav: () => ({ navMode: "fixed", setNavMode: jest.fn() }),
}));
jest.mock("../utils/scrollToPageTop", () => ({ scrollToPageTop: jest.fn() }));

describe("NavBar - retour en haut", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("relie les cinq destinations principales sur mobile et ordinateur", () => {
    render(<NavBar />);

    ["Accueil", "Vidéos", "Musique", "Sagas", "Acteur/réalisateur"].forEach((name) => {
      const links = screen.getAllByRole("link", { name });
      expect(links).toHaveLength(2);
      links.forEach((link) => fireEvent.click(link));
    });

    expect(scrollToPageTop).toHaveBeenCalledTimes(10);
  });

  test("affiche la version de l'application sur les sidebars mobile et bureau", () => {
    render(<NavBar />);

    expect(screen.getAllByText(`v${process.env.REACT_APP_VER}`)).toHaveLength(2);
  });

  test("remonte en haut après chaque navigation aléatoire réussie", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ VideoID: 42 }),
    });
    render(<NavBar />);

    for (const name of ["Aléatoire", "Film aléatoire", "Série aléatoire"]) {
      fireEvent.click(screen.getAllByRole("button", { name })[0]);
    }

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(3));
    expect(mockNavigate).toHaveBeenNthCalledWith(1, "/lecture/42");
    expect(scrollToPageTop).toHaveBeenCalledTimes(3);
  });
});
