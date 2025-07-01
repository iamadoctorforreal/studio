import type {Metadata} from 'next';
import {Inter, Roboto_Mono} from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import Header from '@/components/layout/Header';
import { VideoWorkflowProvider } from '@/contexts/VideoWorkflowContext';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const robotoMono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'News Automator',
  description: 'AI-Powered News Generation',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${robotoMono.variable} antialiased flex flex-col min-h-screen`}
        suppressHydrationWarning // Added to potentially fix hydration issues from extensions
        >
        <VideoWorkflowProvider>
          <Header />
          <main className="flex-grow container mx-auto px-4 py-8">
              {children}
          </main>
          <Toaster />
        </VideoWorkflowProvider>
      </body>
    </html>
  );
}