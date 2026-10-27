import { createContext, useContext, useState } from "react";

const NavContext = createContext();

export function NavProvider({ children }) {
  // État de la page de lecture ; la préférence durable appartient au compte.
  const [cinemaMode, setCinemaMode] = useState(false);

  return (
    <NavContext.Provider value={{ cinemaMode, setCinemaMode }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  return useContext(NavContext);
}
