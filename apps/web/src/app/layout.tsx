import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pet Oasis",
  description: "Loja de pet shop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
