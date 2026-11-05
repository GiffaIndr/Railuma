import { createContext, useContext } from "react";

export const A11yContext = createContext(null);

export const useA11y = () => useContext(A11yContext);
