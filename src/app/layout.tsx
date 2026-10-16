import type { Metadata, Viewport } from "next";
import { EdgeSwipeBack } from "@/components/EdgeSwipeBack";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day Vlog",
  description: "Every hour, two seconds of your day, shared with your friends.",
  applicationName: "Day Vlog",
  appleWebApp: { capable: true, title: "Day Vlog", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <EdgeSwipeBack />
        <ServiceWorker />
      </body>
    </html>
  );
}
