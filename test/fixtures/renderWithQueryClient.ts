import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export function renderWithQueryClient(element: ReactElement) {
  const client = new QueryClient();
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client }, element));
  } finally {
    client.clear();
  }
}
