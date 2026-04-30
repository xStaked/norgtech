import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "sans-serif",
          backgroundColor: "#f4f7fb",
          color: "#10233f",
        }}
      >
        {children}
      </body>
    </html>
  );
}
