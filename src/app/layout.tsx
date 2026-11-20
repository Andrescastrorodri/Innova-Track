import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import './workspace.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-jakarta',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Innova Track — Control Logístico y Facturación para Costa Rica',
  description:
    'Plataforma SaaS de ingesta inteligente de pedidos, facturación, despacho y control logístico para PyMEs y Distribuidoras en Costa Rica.',
  openGraph: {
    title: 'Innova Track',
    description:
      'Plataforma SaaS de ingesta inteligente de pedidos, facturación, despacho y control logístico para PyMEs y Distribuidoras en Costa Rica.',
    type: 'website',
  },
};

export const viewport: Viewport = { viewportFit: 'cover' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${plusJakartaSans.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh">
        <svg
          className="aura-waves"
          viewBox="0 0 1440 920"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M -190 -55 C 20 138 142 198 355 165 S 526 35 780 -75" />
          <path d="M -180 72 C 18 205 119 282 354 234 S 592 13 847 -48" />
          <path d="M 818 1033 C 998 795 1081 760 1240 790 S 1440 807 1569 631" />
        </svg>
        <a href="#contenido" className="skip-link">Saltar al contenido</a>
        {children}
      </body>
    </html>
  );
}
