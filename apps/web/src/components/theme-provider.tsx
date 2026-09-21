"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Os três estados do tema — claro, escuro e o do sistema — e a persistência da
 * escolha explícita. A configuração vive num lugar só de propósito: o resto da
 * aplicação fala com o tema por `useTheme()`, nunca por estas opções.
 *
 * `attribute="class"` porque a variante `dark` do Tailwind 4 deste projeto é
 * `&:is(.dark *)` — ver `globals.css`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
