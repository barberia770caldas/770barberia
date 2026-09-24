"use client";

import { useEffect, useState, useTransition } from "react";
import { formatoCOP } from "@/lib/constants";
import { fechaLocalHoy } from "@/lib/disponibilidad";
import { Silla, Tijeras } from "@/components/Icons";

function sumarDias(fechaStr, dias) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + dias);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatearFechaLegible(fechaStr) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatearMinutos(minutos = 0) {
  if (!minutos || minutos <= 0) return "0 min";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function ResumenDiario() {
  const hoy = fechaLocalHoy();
  const [fecha, setFecha] = useState(hoy);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let activo = true;
    setCargando(true);
    fetch(`/api/barbero/resumen?fecha=${fecha}`)
      .then((r) => r.json())
      .then((res) => {
        if (activo) {
          setData(res);
          setCargando(false);
        }
      })
      .catch(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [fecha]);

  const cambiarFecha = (nueva) => {
    startTransition(() => {
      setFecha(nueva);
    });
  };

  const esHoy = fecha === hoy;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Navegador ágil de fechas */}
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
          <button
            onClick={() => cambiarFecha(sumarDias(fecha, -1))}
            className="btn-outline px-3 py-1.5 text-xs sm:text-sm"
            title="Día anterior"
          >
            ← Ayer
          </button>
          <button
            onClick={() => cambiarFecha(hoy)}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg font-semibold transition ${
              esHoy
                ? "bg-barber-red text-white"
                : "border-2 border-barber-ink text-barber-ink hover:bg-barber-ink hover:text-white"
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => cambiarFecha(sumarDias(fecha, 1))}
            className="btn-outline px-3 py-1.5 text-xs sm:text-sm"
            title="Día siguiente"
          >
            Mañana →
          </button>
        </div>

        <div className="flex items-center justify-center sm:justify-start gap-2">
          <input
            type="date"
            className="input text-sm py-1.5 px-3 max-w-[170px]"
            value={fecha}
            onChange={(e) => cambiarFecha(e.target.value)}
          />
        </div>
      </div>

      {/* Título de la fecha */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-display capitalize flex items-center gap-2">
            {formatearFechaLegible(fecha)}
            {esHoy && (
              <span className="badge bg-barber-red/10 text-barber-red border border-barber-red/20 text-xs">
                Jornada de Hoy
              </span>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-barber-gray mt-0.5">
            Tu resumen de hoy: cómo va la plata y los turnos
          </p>
        </div>
      </div>

      {cargando && !data ? (
        <div className="card p-10 text-center text-barber-gray animate-pulse">
          Cargando datos del día…
        </div>
      ) : !data ? (
        <div className="card p-8 text-center text-barber-gray">
          Error al cargar el resumen. Intenta recargar la página.
        </div>
      ) : (
        <>
          {/* BARRA DE RITMO DEL DÍA */}
          <div className="card p-4 sm:p-5 bg-gradient-to-r from-white to-neutral-50 border border-black/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-bold text-barber-gray">
                  Ritmo de hoy
                </span>
                <span className="badge bg-neutral-100 text-barber-ink font-semibold">
                  Llevás {data.estados?.completadas || 0} de {data.totalCitas} turnos
                </span>
              </div>
              <span className="font-display text-lg text-barber-ink font-bold">
                {data.productividad?.porcentajeProgreso || 0}%
              </span>
            </div>

            {/* Barra visual */}
            <div className="w-full bg-neutral-200 h-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-barber-blue via-barber-red to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, data.productividad?.porcentajeProgreso || 0)}%` }}
              />
            </div>

            {/* Micro-resumen de estados */}
            <div className="flex items-center gap-3 mt-3 text-xs text-barber-gray flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <strong className="text-barber-ink">{data.estados?.completadas || 0}</strong> listos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-barber-blue" />
                <strong className="text-barber-ink">{data.estados?.confirmadas || 0}</strong> por atender
              </span>
              {data.estados?.solicitadas > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <strong className="text-barber-ink">{data.estados?.solicitadas}</strong> por confirmar
                </span>
              )}
              {data.estados?.canceladas > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <strong className="text-barber-ink">{data.estados?.canceladas}</strong> cancelados
                </span>
              )}
              {data.estados?.noAsistidas > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <strong className="text-barber-ink">{data.estados?.noAsistidas}</strong> no asistieron
                </span>
              )}
            </div>
          </div>

          {/* TARJETAS KPI PRINCIPALES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Ya en el bolsillo */}
            <div className="card p-4 border-l-4 border-l-emerald-500 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-barber-gray">
                  Ya en el bolsillo
                </p>
                <p className="text-2xl sm:text-3xl font-display text-emerald-600 font-bold mt-1">
                  {formatoCOP(data.ingresosCobrados)}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-black/5 text-[11px] text-barber-gray flex flex-col gap-0.5">
                <span>💵 Efectivo: <strong className="text-barber-ink">{formatoCOP(data.efectivo?.cobrado || 0)}</strong></span>
                <span>📱 Transferencias: <strong className="text-barber-ink">{formatoCOP(data.digital?.cobrado || 0)}</strong></span>
              </div>
            </div>

            {/* 2. Falta por entrar */}
            <div className="card p-4 border-l-4 border-l-amber-500 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-barber-gray">
                  Falta por entrar
                </p>
                <p className="text-2xl sm:text-3xl font-display text-amber-600 font-bold mt-1">
                  {formatoCOP(data.ingresosPendientes)}
                </p>
              </div>
              <p className="mt-3 pt-2 border-t border-black/5 text-[11px] text-barber-gray">
                De <strong className="text-barber-ink">{data.estados?.confirmadas || 0}</strong> cliente(s) que falta(n) hoy
              </p>
            </div>

            {/* 3. Promedio por cliente */}
            <div className="card p-4 border-l-4 border-l-barber-blue flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-barber-gray">
                  Promedio por cliente
                </p>
                <p className="text-2xl sm:text-3xl font-display text-barber-blue font-bold mt-1">
                  {formatoCOP(data.ticketPromedio)}
                </p>
              </div>
              <p className="mt-3 pt-2 border-t border-black/5 text-[11px] text-barber-gray">
                {data.estados?.completadas > 0
                  ? "Te está dejando cada cliente hoy"
                  : "Estimado para los turnos de hoy"}
              </p>
            </div>

            {/* 4. Tiempo motilando */}
            <div className="card p-4 border-l-4 border-l-barber-red flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider font-semibold text-barber-gray">
                    Tiempo motilando
                  </p>
                  <Tijeras className="w-4 h-4 text-barber-red opacity-80" />
                </div>
                <p className="text-2xl sm:text-3xl font-display text-barber-ink font-bold mt-1">
                  {formatearMinutos(data.productividad?.minutosTrabajados)}
                </p>
              </div>
              <p className="mt-3 pt-2 border-t border-black/5 text-[11px] text-barber-gray">
                De <strong className="text-barber-ink">{formatearMinutos(data.productividad?.minutosTotales)}</strong> agendados hoy
              </p>
            </div>
          </div>

          {/* ¿POR DÓNDE TE PAGARON? */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold">¿Por dónde te pagaron?</h3>
                <p className="text-xs text-barber-gray">
                  La plata en efectivo en mano vs transferencias (Nequi, Daviplata, etc.)
                </p>
              </div>
              <span className="badge bg-neutral-100 text-barber-gray text-xs">
                Total de hoy: {formatoCOP(data.ingresosTotales)}
              </span>
            </div>

            {!data.desgloseMetodos || data.desgloseMetodos.length === 0 ? (
              <p className="text-xs text-barber-gray py-4 text-center">
                No hay movimientos registrados para este día.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.desgloseMetodos.map((m) => {
                  const esEfectivo = m.key === "efectivo";
                  return (
                    <div
                      key={m.key}
                      className="p-3 rounded-xl border border-black/5 bg-neutral-50/70 flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              esEfectivo ? "bg-emerald-500" : "bg-barber-blue"
                            }`}
                          />
                          <span className="font-semibold text-sm text-barber-ink">
                            {m.label}
                          </span>
                        </div>
                        <span className="text-xs text-barber-gray">
                          {m.cantidad} turno{m.cantidad !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between pt-1 border-t border-black/5">
                        <div>
                          <p className="text-xs text-barber-gray">Ya entró</p>
                          <p className="font-display text-base font-bold text-emerald-600">
                            {formatoCOP(m.cobrado)}
                          </p>
                        </div>
                        {m.pendiente > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-barber-gray">Falta</p>
                            <p className="font-display text-sm text-amber-600">
                              {formatoCOP(m.pendiente)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumen rápido físico vs digital */}
            <div className="mt-4 p-3 rounded-xl bg-neutral-100/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <span>
                  💵 <strong>Efectivo en mano:</strong>{" "}
                  <span className="text-emerald-700 font-semibold">
                    {formatoCOP(data.efectivo?.cobrado || 0)}
                  </span>
                </span>
                <span>
                  📱 <strong>En transferencias/bancos:</strong>{" "}
                  <span className="text-barber-blue font-semibold">
                    {formatoCOP(data.digital?.cobrado || 0)}
                  </span>
                </span>
              </div>
              <span className="text-barber-gray">
                Total proyectado de hoy: <strong>{formatoCOP(data.ingresosTotales)}</strong>
              </span>
            </div>
          </div>

          {/* LO QUE MÁS SALIÓ HOY */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold">Lo que más salió hoy</h3>
                <p className="text-xs text-barber-gray">
                  Cómo se movieron los planes y cortes
                </p>
              </div>
              <Tijeras className="w-5 h-5 text-barber-gray" />
            </div>

            <div className="space-y-3">
              {[
                { key: "bronce", nombre: "Plan Bronce", color: "bg-amber-600" },
                { key: "plata", nombre: "Plan Plata", color: "bg-slate-400" },
                { key: "oro", nombre: "Plan Oro", color: "bg-yellow-500" },
              ].map((p) => {
                const item = data.desglose?.[p.key] || {
                  cantidad: 0,
                  completadas: 0,
                  pendientes: 0,
                  ingresosCobrados: 0,
                  ingresos: 0,
                };
                const pct = data.totalCitas > 0 ? Math.round((item.cantidad / data.totalCitas) * 100) : 0;

                return (
                  <div key={p.key} className="p-3 rounded-xl border border-black/5 bg-white">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${p.color}`} />
                        <span className="font-semibold text-sm text-barber-ink">
                          {p.nombre}
                        </span>
                        <span className="text-xs text-barber-gray">
                          ({item.cantidad} corte{item.cantidad !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-display text-base font-bold text-barber-ink">
                          {formatoCOP(item.ingresos)}
                        </span>
                      </div>
                    </div>

                    {/* Barra de proporción */}
                    <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full ${p.color} rounded-full transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-barber-gray mt-2">
                      <span>
                        {item.completadas} listo{item.completadas !== 1 ? "s" : ""} ·{" "}
                        {item.pendientes} por hacer
                      </span>
                      <span>
                        Ya entró: <strong className="text-emerald-600">{formatoCOP(item.ingresosCobrados)}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
