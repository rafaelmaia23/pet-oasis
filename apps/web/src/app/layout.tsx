import type { Metadata } from "next";
import { Instrument_Sans, Outfit } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Auto-hospedadas em build: os arquivos entram nos estáticos do próprio deploy e
// nenhuma requisição sai para o Google em tempo de execução.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pet Oasis",
  description: "Loja de pet shop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: a classe do tema é escrita no <html> antes da
    // hidratação, para que a página não pisque no tema errado.
    <html
      lang="pt-BR"
      className={`${instrumentSans.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
