import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Footer from "@/components/landing/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Council",
  description:
    "Four minds. One verdict. A multi-model deliberation council that answers your hardest questions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <Footer />
        </body>
      </html>
    </ClerkProvider>
  );
}
