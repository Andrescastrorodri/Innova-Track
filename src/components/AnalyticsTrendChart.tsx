'use client';

import { useEffect, useId, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatColones, formatInt } from '@/lib/seed-data';
import type { DailyTrendPoint } from '@/lib/analytics';

interface AnalyticsTrendChartProps {
  data: DailyTrendPoint[];
  unidadLabel: string;
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number;
  payload?: DailyTrendPoint;
}

function CustomTrendTooltip({
  active,
  payload,
  unidadLabel,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  unidadLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-surface border border-line-strong rounded-md px-3.5 py-2.5 text-xs space-y-1 shadow-sm">
      <p className="font-semibold text-ink">{point.fecha_corta}</p>
      <p className="font-mono tabular-nums text-accent-hover">
        Costo logístico: {formatColones(point.costo_colones)}
      </p>
      <p className="font-mono tabular-nums text-secondary">
        Volumen: {formatInt(point.volumen_despachado)} {unidadLabel}
      </p>
      <p className="font-mono tabular-nums text-muted">
        Operaciones: {point.pedidos_count}
      </p>
    </div>
  );
}

export function AnalyticsTrendChart({ data, unidadLabel }: AnalyticsTrendChartProps) {
  const fillId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div role="status" className="h-72 w-full bg-canvas border border-line rounded-md flex items-center justify-center px-4 text-center text-sm text-muted">
        Cargando serie histórica de costos...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-72 w-full bg-canvas border border-line rounded-md flex items-center justify-center px-4 text-center text-sm text-muted">
        Sin movimientos registrados en el período seleccionado.
      </div>
    );
  }

  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart accessibilityLayer data={data} margin={{ top: 8, right: 12, left: 6, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.18} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="fecha_corta"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-bar)' }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val: number) => `₡${Math.round(val / 1000)}k`}
            width={56}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip isAnimationActive={false} content={<CustomTrendTooltip unidadLabel={unidadLabel} />} />
          <Bar
            yAxisId="right"
            dataKey="volumen_despachado"
            isAnimationActive={false}
            name="Volumen"
            fill="var(--chart-bar)"
            radius={[3, 3, 0, 0]}
            barSize={18}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="costo_colones"
            isAnimationActive={false}
            name="Costo (₡)"
            stroke="var(--accent)"
            strokeWidth={2}
            fill={`url(#${fillId})`}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
