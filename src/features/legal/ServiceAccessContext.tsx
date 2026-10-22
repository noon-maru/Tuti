"use client";

import { createContext, useContext } from "react";

export const ServiceRightsOnlyContext = createContext(false);
export const useServiceRightsOnly = () => useContext(ServiceRightsOnlyContext);
