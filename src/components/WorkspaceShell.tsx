'use client';

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BarChart3, ChevronDown, Home, Menu, Route, Search, Settings, Sparkles, Truck, UserRound, X } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';

const destinations = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/pedidos/nuevo', label: 'Copiloto de pedidos', icon: Sparkles },
  { href: '/chofer', label: 'App chofer', icon: Truck },
  { href: '/gerente', label: 'Tablero gerencial', icon: BarChart3 },
  { href: '/tracking/IT-8901', label: 'Seguimiento público', icon: Route },
  { href: '/configuracion', label: 'Configuración de APIs', icon: Settings },
] as const;

interface WorkspaceShellProps {
  current: (typeof destinations)[number]['href'];
  context?: ReactNode;
  companyName?: string;
  toolbar?: ReactNode;
  workspaceNote?: string;
  children: ReactNode;
}

export function WorkspaceShell({
  current, context, companyName, toolbar, workspaceNote, children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<'navigation' | 'workspace' | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const workspaceButton = useRef<HTMLButtonElement>(null);
  const navId = useId();
  const workspaceId = useId();
  const title = destinations.find(({ href }) => href === current)?.label;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('tracking');
    const code = String(value ?? '').trim().toUpperCase() || 'IT-8901';
    router.push(`/tracking/${encodeURIComponent(code)}`);
  }

  return (
    <div className="workspace-shell">
      <header
        className="workspace-navbar glass-surface"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPanel(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && panel) {
            event.preventDefault();
            (panel === 'navigation' ? menuButton : workspaceButton).current?.focus();
            setPanel(null);
          }
        }}
      >
        <BrandWordmark />

        <form className="nav-search glass-inset" role="search" aria-label="Seguimiento de pedidos" onSubmit={handleSearch}>
          <Search size={17} strokeWidth={1.6} aria-hidden="true" />
          <input
            name="tracking"
            type="text"
            placeholder="Buscar guía"
            aria-label="Código de seguimiento"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" aria-label="Consultar seguimiento">
            <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </form>

        {context}

        <div className="nav-actions">
          <button
            ref={menuButton}
            type="button"
            className="nav-icon-button glass-inset lg:hidden"
            aria-label="Menú"
            aria-expanded={panel === 'navigation'}
            aria-controls={navId}
            onClick={() => setPanel((open) => open === 'navigation' ? null : 'navigation')}
          >
            {panel === 'navigation' ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
          <button
            ref={workspaceButton}
            type="button"
            className="nav-profile-button glass-inset"
            aria-label="Espacio operativo"
            aria-expanded={panel === 'workspace'}
            aria-controls={workspaceId}
            onClick={() => setPanel((open) => open === 'workspace' ? null : 'workspace')}
          >
            <span className="nav-avatar"><UserRound size={17} strokeWidth={1.65} aria-hidden="true" /></span>
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <nav
          id={navId}
          aria-label="Navegación principal"
          className={`workspace-dock glass-surface ${panel === 'navigation' ? 'workspace-dock-open' : ''}`}
        >
          {destinations.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={href === current ? 'page' : undefined}
              className="workspace-dock-link"
              onClick={() => {
                if (href === current && panel === 'navigation') menuButton.current?.focus();
                setPanel(null);
              }}
            >
              <Icon size={19} strokeWidth={1.5} aria-hidden="true" />
              <span aria-hidden="true">{label}</span>
            </Link>
          ))}
        </nav>

        <section
          id={workspaceId}
          hidden={panel !== 'workspace'}
          aria-label="Opciones del espacio operativo"
          className="workspace-profile glass-surface"
        >
          <p className="text-sm font-bold text-ink">Espacio operativo</p>
          {companyName && <p className="mt-1 text-sm text-secondary break-words">{companyName}</p>}
          {workspaceNote && <p className="mt-1 text-xs text-muted">{workspaceNote}</p>}
          <Link href="/configuracion" className="workspace-profile-link" onClick={() => setPanel(null)}>
            <Settings size={16} strokeWidth={1.6} aria-hidden="true" />
            Configuración de APIs
          </Link>
        </section>
      </header>

      <div className="workspace-body">
        {toolbar && (
          <div className="workspace-toolbar">
            <span className="text-sm font-semibold text-secondary">{title}</span>
            {toolbar}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
