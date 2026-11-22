import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './workspace.css';

// Fuentes variables incluidas en el repo (ver src/app/fonts/LICENSE.md):
// el build no descarga nada de Google Fonts.
const plusJakartaSans = localFont({
  src: [
    { path: './fonts/plus-jakarta-sans-latin-wght-normal.woff2', weight: '200 800', style: 'normal' },
    { path: './fonts/plus-jakarta-sans-latin-wght-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-jakarta',
  display: 'swap',
});

const dmSans = localFont({
  src: [{ path: './fonts/dm-sans-latin-wght-normal.woff2', weight: '100 1000', style: 'normal' }],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: [{ path: './fonts/jetbrains-mono-latin-wght-normal.woff2', weight: '100 800', style: 'normal' }],
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
