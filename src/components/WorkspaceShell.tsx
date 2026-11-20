'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BarChart3, FileText, Home, Menu, Route, Settings, Truck, X } from 'lucide-react';

const destinations = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/pedidos/nuevo', label: 'Copiloto de pedidos', icon: FileText },
  { href: '/chofer', label: 'App chofer', icon: Truck },
  { href: '/gerente', label: 'Tablero gerencial', icon: BarChart3 },
  { href: '/tracking/IT-8901', label: 'Seguimiento público', icon: Route },
  { href: '/configuracion', label: 'Configuración de APIs', icon: Settings },
] as const;

interface WorkspaceShellProps {
  current: (typeof destinations)[number]['href'];
  toolbar?: ReactNode;
  sidebarNote?: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({ current, toolbar, sidebarNote, children }: WorkspaceShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navId = useId();
  const title = destinations.find(({ href }) => href === current)?.label;

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      <aside
        className="bg-surface border-b border-line lg:sticky lg:top-0 lg:h-dvh lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r lg:flex lg:flex-col"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen && menuButton.current?.getClientRects().length) {
            event.preventDefault();
            setMenuOpen(false);
            menuButton.current.focus();
          }
        }}
      >
        <div className="flex min-h-16 items-center justify-between gap-3 px-(--gutter) lg:px-5 lg:border-b lg:border-line">
          <Link href="/" className="font-display text-lg font-bold tracking-tight text-ink-strong">
            Innova Track
          </Link>
          <button
            ref={menuButton}
            type="button"
            className="ui-button ui-button-secondary lg:hidden"
            aria-expanded={menuOpen}
            aria-controls={navId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
            Menú
          </button>
        </div>

        <nav
          id={navId}
          aria-label="Navegación principal"
          className={`${menuOpen ? 'grid' : 'hidden'} gap-1 px-(--gutter) pb-3 sm:grid-cols-2 lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:p-3`}
        >
          {destinations.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={href === current ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-secondary hover:bg-subtle aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-hover"
            >
              <Icon size={17} className="shrink-0" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        {sidebarNote && (
          <div className="hidden lg:block mt-auto border-t border-line p-4 text-sm text-muted">
            {sidebarNote}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-surface">
          <div className="workspace-content flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 sm:py-3">
            <span className="text-sm font-semibold text-secondary">{title}</span>
            {toolbar}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
