import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Face Remove AI Agent',
  description: 'Automatically remove/blur faces in images locally in your browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
