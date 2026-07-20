import type { ReactNode } from "react";

export const metadata = {
  title: "easyCV",
  description:
    "Upload your CV, resume, and LinkedIn export -- get one consolidated resume back, free to preview, pay once to download the PDF.",
};

// Deliberately unstyled: visual design/polish is explicitly out of scope for
// this task (see web-frontend-scaffold), this only wires up the page shell.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
