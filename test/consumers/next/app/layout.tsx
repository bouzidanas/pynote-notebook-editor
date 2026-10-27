import type { ReactNode } from "react";
import "./site.css";

export const metadata = { title: "pynote in Next.js" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
