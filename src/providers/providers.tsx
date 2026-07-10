// ============================================================
// providers.tsx — Client-side providers wrapper
// ============================================================
// Combina en un solo boundary client:
//   - SessionProvider (next-auth/react): sesión en cliente.
//   - ThemeProvider (next-themes): dark/light mode por clase.
//   - QueryClientProvider (@tanstack/react-query): cache de server state.

'use client'

import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function Providers({ children }: { children: React.ReactNode }) {
  // Un solo QueryClient por sesión de cliente (evita re-crear en cada render).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minuto
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
