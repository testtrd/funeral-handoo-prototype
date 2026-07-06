import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "業務引継書",
  description: "葬儀搬送時の業務引継書入力"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
