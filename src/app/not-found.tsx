import Link from 'next/link';

export const metadata = { title: 'Página no encontrada | Innova Track' };

export default function NotFound() {
  return (
    <main id="contenido" tabIndex={-1} className="grid min-h-dvh place-items-center p-4">
      <section className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8">
        <h1 className="page-title">Página no encontrada</h1>
        <p className="text-sm text-secondary">Regresa al inicio para acceder a los módulos de Innova Track.</p>
        <Link href="/" className="ui-button ui-button-primary">
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
