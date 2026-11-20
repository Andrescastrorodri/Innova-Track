'use client';

import { useEffect, useState } from 'react';
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
    <div className="bg-white border border-slate-300 rounded-md px-3.5 py-2.5 text-xs space-y-1 shadow-sm">
      <p className="font-semibold text-slate-900">{point.fecha_corta}</p>
      <p className="font-mono tabular-nums text-blue-800">
        Costo logístico: {formatColones(point.costo_colones)}
      </p>
      <p className="font-mono tabular-nums text-slate-700">
        Volumen: {formatInt(point.volumen_despachado)} {unidadLabel}
      </p>
      <p className="font-mono tabular-nums text-slate-500">
        Operaciones: {point.pedidos_count}
      </p>
    </div>
  );
}

export function AnalyticsTrendChart({ data, unidadLabel }: AnalyticsTrendChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-72 w-full bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center text-xs text-slate-500">
        Cargando serie histórica de costos...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-72 w-full bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center text-sm text-slate-500">
        Sin movimientos registrados en el período seleccionado.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 6, bottom: 0 }}>
          <defs>
            <linearGradient id="costoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="fecha_corta"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val: number) => `₡${Math.round(val / 1000)}k`}
            width={56}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<CustomTrendTooltip unidadLabel={unidadLabel} />} />
          <Bar
            yAxisId="right"
            dataKey="volumen_despachado"
            name="Volumen"
            fill="#cbd5e1"
            radius={[3, 3, 0, 0]}
            barSize={18}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="costo_colones"
            name="Costo (₡)"
            stroke="#1d4ed8"
            strokeWidth={2}
            fill="url(#costoFill)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
