"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const OPTIONS = [
  { value: "light", label: "Tema claro", Icon: SunIcon },
  { value: "dark", label: "Tema escuro", Icon: MoonIcon },
  { value: "system", label: "Tema do sistema", Icon: MonitorIcon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // No servidor não há como saber a escolha guardada no navegador. Só depois de
  // montado é que o estado pressionado corresponde à verdade.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ToggleGroup
      aria-label="Tema"
      variant="outline"
      spacing={0}
      value={mounted && theme ? [theme] : []}
      onValueChange={(values) => {
        // Clicar no item já pressionado devolve lista vazia. Aqui isso não é uma
        // escolha: o tema não tem estado "nenhum".
        const [next] = values;
        if (next) setTheme(next);
      }}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          title={label}
        >
          <Icon aria-hidden />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
