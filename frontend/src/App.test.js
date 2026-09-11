jest.mock("react-router-dom", () => ({
  BrowserRouter: ({ children }) => children,
  Route: () => null,
  Routes: ({ children }) => children,
  Navigate: () => null,
  Link: ({ children }) => children,
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => jest.fn(),
  useParams: () => ({}),
}), { virtual: true });

jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }),
}));

import App from "./App";

test("expose la racine de l'application SAMI", () => {
  expect(typeof App).toBe("function");
});
