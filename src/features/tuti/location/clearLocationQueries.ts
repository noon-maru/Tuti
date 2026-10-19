import type { QueryClient } from "@tanstack/react-query";

export function clearLocationQueryCache(client: QueryClient) {
  for (const key of ["departure-plan", "departure-route", "travel-time", "recommendations"]) {
    void client.cancelQueries({ queryKey: [key] });
    client.removeQueries({ queryKey: [key] });
  }
}
