import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EduManage", template: "%s · EduManage" },
  description: "Student management system for schools: students, attendance, examinations and fees.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
