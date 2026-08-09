import { QueryClient } from '@tanstack/react-query'

/** Client React Query unique de la SPA (fourni à la racine dans main.tsx). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
