import React, { createContext, useContext, useState } from 'react';

const GlobalSearchContext = createContext();

export function GlobalSearchProvider({ children }) {
  const [globalSearch, setGlobalSearch] = useState('');

  return (
    <GlobalSearchContext.Provider value={{ globalSearch, setGlobalSearch }}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  return useContext(GlobalSearchContext);
}
