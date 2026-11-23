'use client';

import { useEffect, useMemo, useState } from 'react';
import { TableScroll } from '@/components/TableScroll';
import {
  computeAnnualSavings,
  defaultSavingsAssumptions,
  type ImpactMetrics,
  type SavingsAssumptions,
} from '@/lib/impact';
import { formatColones, formatInt } from '@/lib/seed-data';

type AssumptionKey = keyof SavingsAssumptions;

const FIELDS: Array<{
  key: AssumptionKey;
  label: string;
  suffix: string;
  step: number;
  /** De dónde sale el valor inicial. */
  origen: 'medido' | 'supuesto';
  grupo: 'km' | 'digitacion' | 'ambos';
}> = [
  { key: 'km_por_dia', label: 'Km recorridos por día', suffix: 'km', step: 10, origen: 'medido', grupo: 'km' },
  { key: 'costo_variable_por_km', label: 'Costo por km (combustible y mantenimiento)', suffix: '₡', step: 5, origen: 'medido', grupo: 'km' },
  { key: 'reduccion_km_pct', label: 'Km que se dejan de recorrer', suffix: '%', step: 1, origen: 'supuesto', grupo: 'km' },
  { key: 'pedidos_por_dia', label: 'Pedidos por día', suffix: 'pedidos', step: 1, origen: 'medido', grupo: 'digitacion' },
  { key: 'minutos_digitacion_por_pedido', label: 'Minutos de digitación que ahorra cada pedido', suffix: 'min', step: 1, origen: 'supuesto', grupo: 'digitacion' },
  { key: 'salario_hora_colones', label: 'Costo por hora de quien digita', suffix: '₡', step: 100, origen: 'supuesto', grupo: 'digitacion' },
  { key: 'dias_operativos_anio', label: 'Días de operación al año', suffix: 'días', step: 5, origen: 'supuesto', grupo: 'ambos' },
];

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-secondary">{detail}</p>
    </div>
  );
}

export function ImpactSection({ metrics }: { metrics: ImpactMetrics }) {
  const defaults = useMemo(() => defaultSavingsAssumptions(metrics), [metrics]);
  const [assumptions, setAssumptions] = useState<SavingsAssumptions>(defaults);

  // Los supuestos vuelven a los valores medidos solo cuando esos valores cambian de verdad
  // (otra empresa o datos nuevos), no en cada actualización automática del tablero:
  // así no se pierde lo que gerencia está editando.
  const defaultsKey = JSON.stringify(defaults);
  useEffect(() => {
    setAssumptions(JSON.parse(defaultsKey) as SavingsAssumptions);
  }, [defaultsKey]);

  const savings = computeAnnualSavings(assumptions);
  const tieneFlotilla = metrics.viajes_cerrados > 0;
  const fields = FIELDS.filter((f) => tieneFlotilla || f.grupo !== 'km');
  const edited = fields.some((f) => assumptions[f.key] !== defaults[f.key]);

  return (
    <section aria-labelledby="impacto-titulo" className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="impacto-titulo" className="section-title">Impacto</h2>
          <p className="mt-0.5 text-xs text-muted">
            {tieneFlotilla
              ? `Medido en ${formatInt(metrics.viajes_cerrados)} viajes cerrados durante ${formatInt(metrics.dias_operados)} días de operación.`
              : 'Esta empresa despacha con mensajería externa: no hay rutas propias que medir.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Ahorro estimado: lo primero que se lee */}
        <div className="order-first space-y-4 xl:order-last xl:col-span-5">
          <div className="rounded-lg border border-success-line bg-success-soft p-4">
            <p className="text-xs font-semibold text-success-strong">Ahorro anual estimado</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-success-strong" aria-live="polite">
              {formatColones(savings.ahorro_total_colones)}
            </p>
            <dl className="mt-3 space-y-1 text-sm text-ink">
              {tieneFlotilla && (
                <div className="flex justify-between gap-3">
                  <dt>Menos kilómetros ({formatInt(savings.km_evitados_anio)} km)</dt>
                  <dd className="font-mono tabular-nums">{formatColones(savings.ahorro_km_colones)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt>Menos digitación ({formatInt(savings.horas_digitacion_anio)} h)</dt>
                <dd className="font-mono tabular-nums">{formatColones(savings.ahorro_digitacion_colones)}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Supuestos del cálculo</h3>
              {edited && (
                <button
                  type="button"
                  onClick={() => setAssumptions(defaults)}
                  className="min-h-11 px-2 text-sm font-semibold text-accent underline"
                >
                  Restablecer
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {fields.map((f) => (
                <li key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <label htmlFor={`sup-${f.key}`} className="text-sm text-secondary">
                    {f.label}{' '}
                    <span className="whitespace-nowrap text-xs text-muted">
                      · {f.origen === 'medido' ? 'medido' : 'supuesto'}
                    </span>
                  </label>
                  <span className="flex items-center gap-1.5">
                    <input
                      id={`sup-${f.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={f.step}
                      value={Number.isFinite(assumptions[f.key]) ? assumptions[f.key] : ''}
                      onChange={(e) =>
                        setAssumptions((prev) => ({
                          ...prev,
                          [f.key]: e.target.value === '' ? Number.NaN : Number(e.target.value),
                        }))
                      }
                      className="ui-field w-24 px-2 py-2 text-right font-mono text-sm tabular-nums"
                    />
                    <span className="w-14 text-xs text-muted">{f.suffix}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-secondary">
              {tieneFlotilla
                ? `Cómo se calcula: los kilómetros que se dejan de recorrer en un año, por lo que cuesta cada kilómetro, más las horas que ya nadie pasa digitando pedidos, por lo que cuesta esa hora. El punto de partida de ${formatInt(defaults.reduccion_km_pct)} % es lo que hoy se recorre de más sobre lo planificado.`
                : 'Cómo se calcula: las horas que ya nadie pasa digitando pedidos en un año, por lo que cuesta esa hora.'}{' '}
              Los valores marcados como supuesto son estimaciones: cámbielos por los de su empresa.
            </p>
          </div>
        </div>

        {/* Indicadores medidos */}
        <div className="space-y-4 xl:col-span-7">
          {tieneFlotilla ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Tile
                  label="Costo por km"
                  value={formatColones(metrics.costo_por_km)}
                  detail={`${formatInt(metrics.km_reales)} km recorridos`}
                />
                <Tile
                  label="Costo por entrega"
                  value={formatColones(metrics.costo_por_entrega)}
                  detail={`${formatInt(metrics.entregas_realizadas)} entregas realizadas`}
                />
                <Tile
                  label="Fuera de ventana horaria"
                  value={`${formatInt(metrics.entregas_fuera_ventana)} de ${formatInt(metrics.entregas_con_llegada)}`}
                  detail={`${metrics.fuera_ventana_pct.toLocaleString('es-CR')} % de las entregas`}
                />
                <Tile
                  label="Del pedido a la salida del camión"
                  value={
                    metrics.horas_pedido_a_despacho === null
                      ? 'Sin datos'
                      : `${metrics.horas_pedido_a_despacho.toLocaleString('es-CR', { maximumFractionDigits: 1 })} h`
                  }
                  detail={`Promedio de ${formatInt(metrics.pedidos_medidos_despacho)} pedidos`}
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Km recorridos vs. planificados</h3>
                <TableScroll label="Kilómetros recorridos y planificados por ruta">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-muted">
                        <th scope="col" className="py-2 pr-3 font-medium">Ruta</th>
                        <th scope="col" className="py-2 px-3 text-right font-medium">Plan</th>
                        <th scope="col" className="py-2 px-3 text-right font-medium">Real</th>
                        <th scope="col" className="py-2 pl-3 text-right font-medium">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.rutas.map((r) => (
                        <tr key={r.ruta_nombre} className="border-b border-line last:border-0">
                          <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                            {r.ruta_nombre.split(' — ')[0]}
                            <span className="block text-xs font-normal text-muted">{formatInt(r.viajes)} viajes</span>
                          </th>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">{formatInt(r.km_planificados)}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">{formatInt(r.km_reales)}</td>
                          <td
                            className={`py-2 pl-3 text-right font-mono tabular-nums ${
                              r.exceso_pct > 10 ? 'font-semibold text-danger' : 'text-secondary'
                            }`}
                          >
                            {r.exceso_km > 0 ? '+' : ''}
                            {formatInt(r.exceso_km)} km ({r.exceso_pct.toLocaleString('es-CR', { maximumFractionDigits: 1 })} %)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="text-ink">
                        <th scope="row" className="py-2 pr-3 text-left font-semibold">Total</th>
                        <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">{formatInt(metrics.km_planificados)}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">{formatInt(metrics.km_reales)}</td>
                        <td className="py-2 pl-3 text-right font-mono font-semibold tabular-nums">
                          {metrics.exceso_km > 0 ? '+' : ''}
                          {formatInt(metrics.exceso_km)} km ({metrics.exceso_pct.toLocaleString('es-CR', { maximumFractionDigits: 1 })} %)
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </TableScroll>
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-line p-4 text-sm text-secondary">
              Los costos por envío y el cumplimiento de cada mensajería están en los indicadores de
              arriba. Aquí se estima lo que ahorra dejar de digitar pedidos a mano.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
