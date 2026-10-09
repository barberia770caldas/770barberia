"use client";

import { useState, useMemo } from "react";
import { WhatsAppIcon } from "@/components/Icons";
import { formatoCOP } from "@/lib/constants";
import { useDialog } from "@/components/DialogProvider";

function calcularEstadoSuscripcion(suscripcionVence) {
  if (!suscripcionVence) {
    return {
      clave: "sin_fecha",
      label: "Sin fecha",
      color: "bg-gray-100 text-gray-600 border-gray-200",
      dot: "bg-gray-400",
      dias: null,
    };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vence = new Date(suscripcionVence);
  vence.setHours(0, 0, 0, 0);

  const diffMs = vence.getTime() - hoy.getTime();
  const diffDias = Math.round(diffMs / 864e5);

  if (diffDias > 5) {
    return {
      clave: "al_dia",
      label: `Al día (${diffDias} días)`,
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
      dias: diffDias,
    };
  }
  if (diffDias >= 0) {
    return {
      clave: "por_vencer",
      label: diffDias === 0 ? "Vence hoy" : `Por vencer (${diffDias} día${diffDias > 1 ? "s" : ""})`,
      color: "bg-amber-50 text-amber-800 border-amber-300",
      dot: "bg-amber-500",
      dias: diffDias,
    };
  }
  return {
    clave: "vencido",
    label: `Vencido (hace ${Math.abs(diffDias)} día${Math.abs(diffDias) > 1 ? "s" : ""})`,
    color: "bg-rose-50 text-rose-700 border-rose-300",
    dot: "bg-rose-500",
    dias: diffDias,
  };
}

function mesActualStr() {
  // Mes actual en zona Colombia (UTC-5, sin DST)
  const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function ControlSuscripciones({ barberos = [], onActualizar }) {
  const { confirmar } = useDialog();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos"); // 'todos' | 'por_cobrar' | 'al_dia' | 'vencidos'
  const [procesandoId, setProcesandoId] = useState(null);
  const mesActual = mesActualStr();
  const [editandoBarbero, setEditandoBarbero] = useState(null); // { id, tarifaMensual, suscripcionVence }
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // KPIs
  const kpis = useMemo(() => {
    const activos = barberos.filter((b) => b.estado === "activo");
    let alDia = 0;
    let porVencer = 0;
    let vencidos = 0;
    let recaudoEstimado = 0;

    for (const b of activos) {
      recaudoEstimado += Number(b.tarifaMensual ?? 20000);
      const est = calcularEstadoSuscripcion(b.suscripcionVence);
      if (est.clave === "al_dia") alDia++;
      else if (est.clave === "por_vencer") porVencer++;
      else if (est.clave === "vencido") vencidos++;
    }

    return {
      totalActivos: activos.length,
      porVencer,
      vencidos,
      porCobrar: porVencer + vencidos,
      alDia,
      recaudoEstimado,
    };
  }, [barberos]);

  // Filtrado de barberos
  const barberosFiltrados = useMemo(() => {
    return barberos.filter((b) => {
      // Búsqueda por texto
      const texto = `${b.nombre} ${b.local} ${b.celular} ${b.ciudad}`.toLowerCase();
      if (busqueda && !texto.includes(busqueda.toLowerCase())) return false;

      // Filtro de semáforo
      const est = calcularEstadoSuscripcion(b.suscripcionVence);
      if (filtroEstado === "por_cobrar") return est.clave === "por_vencer" || est.clave === "vencido";
      if (filtroEstado === "al_dia") return est.clave === "al_dia";
      if (filtroEstado === "vencidos") return est.clave === "vencido";
      return true;
    });
  }, [barberos, busqueda, filtroEstado]);

  // Acción: Renovar +30 días
  async function renovar(id, nombre) {
    const ok = await confirmar({
      titulo: `Renovar suscripción`,
      mensaje: `¿Deseas extender la suscripción de ${nombre} por 30 días adicionales?`,
      confirmarLabel: "Sí, renovar +30 días",
    });
    if (!ok) return;

    setProcesandoId(id);
    try {
      const res = await fetch(`/api/admin/barberos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "renovar", dias: 30 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al renovar");
      onActualizar?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setProcesandoId(null);
    }
  }

  // Acción: Pausar/Activar
  async function toggleEstado(b) {
    const accion = b.estado === "activo" ? "desactivar" : "activar";
    const ok = await confirmar({
      titulo: `${accion === "desactivar" ? "Pausar" : "Activar"} barbero`,
      mensaje: accion === "desactivar"
        ? `¿Pausar a ${b.nombre}? No podrá recibir citas hasta que reactive su suscripción.`
        : `¿Reactivar la cuenta de ${b.nombre}?`,
      confirmarLabel: accion === "desactivar" ? "Pausar" : "Activar",
      peligro: accion === "desactivar",
    });
    if (!ok) return;

    setProcesandoId(b.id);
    try {
      const res = await fetch(`/api/admin/barberos/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al cambiar estado");
      onActualizar?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setProcesandoId(null);
    }
  }

  // Guardar edición manual de tarifa / fecha
  async function guardarEdicion(e) {
    e.preventDefault();
    if (!editandoBarbero) return;
    setGuardandoEdicion(true);
    try {
      const res = await fetch(`/api/admin/barberos/${editandoBarbero.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "ajustar-suscripcion",
          tarifaMensual: editandoBarbero.tarifaMensual,
          fechaVencimiento: editandoBarbero.suscripcionVence,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al guardar");
      setEditandoBarbero(null);
      onActualizar?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardandoEdicion(false);
    }
  }

  // Acción: Marcar pago del mes actual
  async function marcarPago(b) {
    const ok = await confirmar({
      titulo: "Confirmar pago",
      mensaje: `¿Marcar a ${b.nombre} (${b.local}) como pagado este mes?`,
      confirmarLabel: "Sí, marcar como pagado",
    });
    if (!ok) return;

    setProcesandoId(b.id);
    try {
      const res = await fetch(`/api/admin/barberos/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "marcar-pago" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al marcar pago");
      onActualizar?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setProcesandoId(null);
    }
  }

  // Generar link de WhatsApp para cobro
  function linkCobroWhatsApp(b) {
    const celLimpio = (b.celular || "").replace(/\D/g, "");
    const fechaVenceStr = b.suscripcionVence
      ? new Date(b.suscripcionVence).toLocaleDateString("es-CO", { day: "numeric", month: "long" })
      : "estos días";
    const primerNombre = (b.nombre || "").split(" ")[0];
    const tarifa = formatoCOP(b.tarifaMensual ?? 20000);

    const msg = `Hola ${primerNombre}, te saludamos de Barbería 770 Caldas. 👋\n\nTe recordamos que tu mensualidad de la plataforma (${b.local}) vence el ${fechaVenceStr}.\n\n💰 Valor a renovar: ${tarifa}.\n\nPor favor envíanos el comprobante de transferencia para renovar tu mes y mantener tu agenda activa. ¡Muchas gracias! 💈`;

    return `https://wa.me/${celLimpio}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <div className="mt-6 space-y-6">
      {/* 1. Tarjetas de Resumen Global (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 border border-stone-200 bg-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-barber-gray">Barberos Activos</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl text-barber-ink">{kpis.totalActivos}</span>
            <span className="text-xs text-emerald-600 font-medium">en plataforma</span>
          </div>
          <p className="text-xs text-barber-gray mt-1">
            {kpis.alDia} al día · {kpis.porCobrar} con cobro pendiente
          </p>
        </div>

        <div className="card p-4 border border-amber-200/80 bg-amber-50/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-900">Por Cobrar / Vencidos</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl text-amber-900">{kpis.porCobrar}</span>
            <span className="text-xs text-amber-700 font-medium">barberos</span>
          </div>
          <p className="text-xs text-amber-800/80 mt-1">
            {kpis.porVencer} por vencer en ≤5 días · {kpis.vencidos} ya vencidos
          </p>
        </div>

        <div className="card p-4 border border-emerald-200/80 bg-emerald-50/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-900">Recaudo Estimado / Mes</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl text-emerald-700">{formatoCOP(kpis.recaudoEstimado)}</span>
          </div>
          <p className="text-xs text-emerald-700/80 mt-1">
            Proyección mensual de suscripciones activas
          </p>
        </div>
      </div>

      {/* 2. Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setFiltroEstado("todos")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filtroEstado === "todos" ? "bg-barber-ink text-white" : "border hover:bg-stone-50"
            }`}
          >
            Todos ({barberos.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado("por_cobrar")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filtroEstado === "por_cobrar" ? "bg-amber-600 text-white" : "border hover:bg-amber-50 text-amber-800"
            }`}
          >
            Por cobrar ({kpis.porCobrar})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado("al_dia")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filtroEstado === "al_dia" ? "bg-emerald-700 text-white" : "border hover:bg-emerald-50 text-emerald-700"
            }`}
          >
            Al día ({kpis.alDia})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado("vencidos")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filtroEstado === "vencidos" ? "bg-rose-600 text-white" : "border hover:bg-rose-50 text-rose-700"
            }`}
          >
            Vencidos ({kpis.vencidos})
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            className="input text-xs py-1.5 pl-3 pr-8 w-full sm:w-64"
            placeholder="Buscar barbero, local o tel..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. Listado de Barberos */}
      {barberosFiltrados.length === 0 ? (
        <div className="card p-8 text-center text-barber-gray">
          No hay barberos que coincidan con los filtros actuales.
        </div>
      ) : (
        <div className="space-y-3">
          {barberosFiltrados.map((b) => {
            const estadoSusc = calcularEstadoSuscripcion(b.suscripcionVence);
            const fechaInicio = b.fechaInicioSuscripcion || b.createdAt;
            const fechaInicioStr = fechaInicio
              ? new Date(fechaInicio).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
              : "—";
            const fechaVenceStr = b.suscripcionVence
              ? new Date(b.suscripcionVence).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
              : "Sin definir";

            return (
              <div
                key={b.id}
                className={`card p-4 transition border ${
                  estadoSusc.clave === "vencido"
                    ? "border-rose-200 bg-rose-50/20"
                    : estadoSusc.clave === "por_vencer"
                    ? "border-amber-200 bg-amber-50/20"
                    : "border-stone-200"
                }`}
              >
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-lg leading-tight text-barber-ink">{b.local}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${estadoSusc.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${estadoSusc.dot}`} />
                        {estadoSusc.label}
                      </span>
                      {b.estado !== "activo" && (
                        <span className="badge bg-gray-200 text-gray-700 text-[11px]">
                          {b.estado.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-barber-gray mt-0.5">
                      {b.nombre} · {b.ciudad} · 📱 {b.celular}
                    </p>

                    {/* Metadatos de suscripción */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-barber-gray">
                      <span>
                        📅 <strong>Suscrito desde:</strong> {fechaInicioStr}
                      </span>
                      <span>
                        ⏳ <strong>Vence:</strong> {fechaVenceStr}
                      </span>
                      <span>
                        💵 <strong>Tarifa:</strong> {formatoCOP(b.tarifaMensual ?? 20000)}/mes
                      </span>
                      {b.pagoMesActual === mesActual ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          ✅ Pagado este mes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                          ⚠️ Pago pendiente
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acciones del Administrador */}
                  <div className="flex items-center gap-2 flex-wrap sm:self-start">
                    {/* Botón WhatsApp Cobro */}
                    {b.celular && (
                      <a
                        href={linkCobroWhatsApp(b)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-wa text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
                        title="Enviar recordatorio de pago por WhatsApp"
                      >
                        <WhatsAppIcon className="w-4 h-4" />
                        <span>Cobrar</span>
                      </a>
                    )}

                    {/* Botón Renovar +30 días */}
                    <button
                      type="button"
                      disabled={procesandoId === b.id}
                      onClick={() => renovar(b.id, b.nombre)}
                      className="btn-dark text-xs py-1.5 px-3 flex items-center gap-1 font-semibold"
                      title="Extender suscripción 30 días"
                    >
                      <span>🔄 Renovar +30d</span>
                    </button>

                    {/* Botón Ajustar Tarifa / Fecha */}
                    <button
                      type="button"
                      onClick={() =>
                        setEditandoBarbero({
                          id: b.id,
                          nombre: b.nombre,
                          local: b.local,
                          tarifaMensual: b.tarifaMensual ?? 20000,
                          suscripcionVence: b.suscripcionVence
                            ? new Date(b.suscripcionVence).toISOString().slice(0, 10)
                            : "",
                        })
                      }
                      className="btn-outline text-xs py-1.5 px-2.5"
                      title="Editar tarifa o fecha de vencimiento"
                    >
                      ✏️ Ajustar
                    </button>

                    {/* Botón Marcar pago */}
                    {b.pagoMesActual !== mesActual ? (
                      <button
                        type="button"
                        disabled={procesandoId === b.id}
                        onClick={() => marcarPago(b)}
                        className="text-xs py-1.5 px-2.5 rounded-lg border border-emerald-400 text-emerald-800 hover:bg-emerald-50 font-semibold"
                      >
                        ✓ Marcar pago
                      </button>
                    ) : (
                      <span className="text-xs py-1.5 px-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                        ✅ Pagado
                      </span>
                    )}

                    {/* Botón Pausar/Activar */}
                    <button
                      type="button"
                      disabled={procesandoId === b.id}
                      onClick={() => toggleEstado(b)}
                      className={`text-xs py-1.5 px-2.5 rounded-lg border font-semibold ${
                        b.estado === "activo"
                          ? "border-amber-300 text-amber-800 hover:bg-amber-50"
                          : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                      }`}
                    >
                      {b.estado === "activo" ? "Pausar" : "Activar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Ajustar Tarifa y Fecha */}
      {editandoBarbero && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center p-4 bg-black/60 backdrop-blur-[2px]"
          onClick={() => setEditandoBarbero(null)}
        >
          <div
            className="card w-full max-w-sm p-6 space-y-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg text-barber-ink">Ajustar Suscripción</h2>
            <p className="text-xs text-barber-gray">
              {editandoBarbero.local} ({editandoBarbero.nombre})
            </p>

            <form onSubmit={guardarEdicion} className="space-y-3">
              <div>
                <label className="label text-xs">Tarifa Mensual (COP)</label>
                <input
                  type="number"
                  step="1000"
                  className="input text-sm"
                  value={editandoBarbero.tarifaMensual}
                  onChange={(e) =>
                    setEditandoBarbero({ ...editandoBarbero, tarifaMensual: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="label text-xs">Fecha de Vencimiento</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={editandoBarbero.suscripcionVence}
                  onChange={(e) =>
                    setEditandoBarbero({ ...editandoBarbero, suscripcionVence: e.target.value })
                  }
                  required
                />
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  className="btn-outline text-xs py-2 px-3"
                  onClick={() => setEditandoBarbero(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="btn-primary text-xs py-2 px-4 font-semibold"
                >
                  {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
