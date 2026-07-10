// ============================================================
// theme-toggle.tsx — Light/Dark toggle button
// ============================================================
// Usa CSS (dark: variant) para mostrar Sun/Moon sin estado mounted,
// evitando hydration mismatch y renders en cascada.

'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar tema"
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {/* Moon en modo claro, Sun en modo oscuro (CSS-only, sin hydration mismatch) */}
      <Moon className="size-4 block dark:hidden" />
      <Sun className="size-4 hidden dark:block" />
    </Button>
  )
}
