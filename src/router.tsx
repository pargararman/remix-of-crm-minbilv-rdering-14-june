import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteError, RoutePending } from "@/components/route-boundaries";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Visa spinner direkt vid långsam navigering så användaren ser att något händer.
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
    // Fångar fel från loaders / komponenter så en trasig query inte fryser hela appen.
    defaultErrorComponent: RouteError,
  });

  return router;
};
