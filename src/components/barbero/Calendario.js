"use client";

import { useEffect, useMemo, useState } from "react";
import EstadoBadge from "@/components/EstadoBadge";
import { WhatsAppIcon, CalendarioIcon } from "@/components/Icons";
import { DIAS_SEMANA } from "@/lib/constants";
import { fechaLocalHoy, minAHhmm, jornadaDelDia, PASO_MIN, formatearHora12, minutosActualesColombia, hhmmAMin } from "@/lib/disponibilidad";
import { esMovil } from "@/lib/dispositivo";
import { useDialog } from "@/components/DialogProvider";
import { generarIcsDia, descargarIcs } from "@/lib/calendario";

const DOT_COLOR = {
  solicitada: "bg-amber-400",
  confirmada: "bg-green-500",
  completada: "bg-blue-500",
  rechazada:  "bg-red-400",
  cancelada:  "bg-gray-300",
  no_asistio: "bg-rose-400",
};

const CITA_ESTILO = {
  solicitada: { wrap: "border-amber-200 bg-amber-50",  barra: "bg-amber-400" },
  confirmada: { wrap: "border-green-200 bg-green-50",  barra: "bg-green-500" },
  completada: { wrap: "border-blue-200  bg-blue-50",   barra: "bg-blue-500"  },
  no_asistio: { wrap: "border-rose-200  bg-rose-50",   barra: "bg-rose-400"  },
};

// Columna de la hora con ancho fijo: en fuente monoespaciada, 23ch equivale al
// rango más largo posible ("12:30 p.m. – 12:30 p.m."), así todas las etiquetas
// que van a la derecha (Libre / nombre / ausencia) quedan alineadas en columna.
const COL_HORA = "font-mono text-xs text-barber-gray w-[23ch] shrink-0 whitespace-nowrap tabular-nums";

export default function Calendario({ perfil, diaInicial, onAgendarManual }) {
  const { pedirMotivo } = useDialog();
  const [citas, setCitas] = useState([]);
  const hoy = fechaLocalHoy();
  const [ref, setRef] = useState(new Date());
  const [diaSel, setDiaSel] = useState(hoy);
  const [vista, setVista] = useState("semana");
  const [abierta, setAbierta] = useState(null); // id de la cita expandida

  function cargar() {
    fetch("/api/citas")
      .then((r) => r.json())
      .then((d) => setCitas(d.citas || []));
  }

  useEffect(() => {
    cargar();
    const timer = setInterval(cargar, 60000);
    return () => clearInterval(timer);
  }, []);

  // Al llegar desde otra pestaña ("Ver la cita"), posicionar el calendario en
  // la fecha indicada y expandir su semana/mes.
  useEffect(() => {
    if (!diaInicial) return;
    setDiaSel(diaInicial);
    const [y, m, d] = diaInicial.split("-").map(Number);
    setRef(new Date(y, m - 1, d));
  }, [diaInicial]);

  async function accion(id, accion, extra = {}) {
    if (accion === "rechazar") {
      const motivo = await pedirMotivo({
        titulo: "Rechazar cita",
        mensaje: "Contanos por qué la rechazás. El cliente verá este mensaje.",
        placeholder: "Motivo del rechazo (opcional)",
        confirmarLabel: "Rechazar",
        peligro: true,
      });
      if (motivo === null) return;
      extra.motivo = motivo;
    }
    if (accion === "cancelar") {
      const motivo = await pedirMotivo({
        titulo: "Cancelar cita confirmada",
        mensaje: "Se le avisará al cliente por WhatsApp. Contanos el motivo si querés.",
        placeholder: "Motivo de la cancelación (opcional)",
        confirmarLabel: "Sí, cancelar",
        cancelarLabel: "No",
        peligro: true,
      });
      if (motivo === null) return;
      extra.motivo = motivo;
    }
    if (accion === "no-asistio") {
      const confirmar = await pedirMotivo({
        titulo: "Marcar como No asistió",
        mensaje: "¿El cliente no se presentó a su cita? La cita cambiará de estado y no sumará a los cobros del resumen.",
        placeholder: "Nota o motivo (opcional)",
        confirmarLabel: "Sí, marcar No asistió",
        cancelarLabel: "Volver",
        peligro: true,
      });
      if (confirmar === null) return;
      extra.motivo = confirmar;
    }
    const res = await fetch(`/api/citas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, plano: !esMovil(), ...extra }),
    });
    const d = await res.json();
    if (!res.ok) return alert(d.error);
    if (d.linkWhatsApp) window.open(d.linkWhatsApp, "_blank");
    cargar();
  }

  const porFecha = useMemo(() => {
    const m = {};
    for (const c of citas) {
      if (["cancelada", "rechazada"].includes(c.estado)) continue;
      (m[c.fecha] = m[c.fecha] || []).push(c);
    }
    return m;
  }, [citas]);

  const dias = useMemo(
    () => (vista === "mes" ? diasDelMes(ref) : diasDeLaSemana(ref)),
    [ref, vista]
  );

  const citasDia = (porFecha[diaSel] || []).sort((a, b) =>
    a.horaInicio.localeCompare(b.horaInicio)
  );

  const citasConfirmadasDia = citasDia.filter((c) => c.estado === "confirmada");

  const timeline = useMemo(
    () => (perfil?.horario ? buildTimeline(diaSel, perfil, citasDia) : null),
    [diaSel, perfil, citasDia]
  );

  const titulo = ref.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  return (
    <div>
      {/* Cabecera navegación */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <button
            className="btn-outline text-sm py-1.5 px-3 shrink-0"
            onClick={() => setRef(mover(ref, vista, -1))}
          >‹</button>
          <button
            className="btn-outline text-sm py-1.5 px-3 shrink-0"
            onClick={() => setRef(mover(ref, vista, 1))}
          >›</button>
          <span className="ml-1 font-display text-base sm:text-xl capitalize truncate">{titulo}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            className={`text-sm py-1.5 px-2.5 sm:px-3 rounded-lg min-h-[36px] font-semibold ${vista === "semana" ? "bg-barber-ink text-white" : "border"}`}
            onClick={() => setVista("semana")}
          >Sem.</button>
          <button
            className={`text-sm py-1.5 px-2.5 sm:px-3 rounded-lg min-h-[36px] font-semibold ${vista === "mes" ? "bg-barber-ink text-white" : "border"}`}
            onClick={() => setVista("mes")}
          >Mes</button>
        </div>
      </div>

      {/* Grid días */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-barber-gray mb-1">
        {DIAS_SEMANA.map((d) => <div key={d}>{d.slice(0, 3)}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((d, i) => {
          if (!d) return <div key={i} />;
          const f = iso(d);
          const items = porFecha[f] || [];
          const esHoy = f === hoy;
          const sel = f === diaSel;
          return (
            <button
              key={i}
              onClick={() => setDiaSel(f)}
              className={`min-h-[64px] rounded-lg border p-1 text-left transition ${sel ? "ring-2 ring-barber-red" : ""} ${esHoy ? "bg-barber-cream" : "bg-white"}`}
            >
              <div className="text-xs font-semibold">{d.getDate()}</div>
              <div className="flex flex-wrap gap-0.5 mt-1">
                {items.slice(0, 4).map((c) => (
                  <span key={c.id} className={`w-2 h-2 rounded-full ${DOT_COLOR[c.estado] || "bg-gray-400"}`} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Timeline del día seleccionado */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h3 className="font-display text-lg capitalize">{formatDiaDetalle(diaSel)}</h3>
          {citasConfirmadasDia.length > 0 && (
            <button
              type="button"
              className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 border-dashed border-barber-gold text-barber-gold hover:bg-barber-gold/10 font-medium transition-colors"
              onClick={() => descargarIcs(`citas_dia_${diaSel}`, generarIcsDia(citasConfirmadasDia, perfil))}
              title="Guardar citas confirmadas del día en el calendario (.ics)"
            >
              <CalendarioIcon className="w-3.5 h-3.5" />
              <span>Guardar en calendario</span>
            </button>
          )}
        </div>

        {timeline === null && (
          <p className="text-barber-gray text-sm">Cargando horario…</p>
        )}

        {timeline?.tipo === "noLaboral" && (
          <div className="card p-5 text-center text-barber-gray">
            <p className="text-2xl mb-1">😴</p>
            <p className="text-sm font-semibold">Día de descanso</p>
            <p className="text-xs mt-0.5">No configuraste trabajo este día.</p>
          </div>
        )}

        {timeline?.tipo === "bloqueado" && (
          <div className="card p-5 text-center text-barber-gray">
            <p className="text-2xl mb-1">🚫</p>
            <p className="text-sm font-semibold">Día bloqueado</p>
            <p className="text-xs mt-0.5">Marcaste este día como libre / vacaciones.</p>
          </div>
        )}

        {timeline?.tipo === "laboral" && (
          <div>
            <p className="text-xs text-barber-gray mb-2">
              Jornada{" "}
              <span className="font-semibold text-barber-ink">{hora12(timeline.inicio)}</span>
              {" "}–{" "}
              <span className="font-semibold text-barber-ink">{hora12(timeline.fin)}</span>
              {" · "}
              <span className="text-green-700 font-semibold">
                {timeline.totalLibres} libre{timeline.totalLibres !== 1 ? "s" : ""}
              </span>
              {" · "}
              <span className="font-semibold">
                {timeline.totalCitas} cita{timeline.totalCitas !== 1 ? "s" : ""}
              </span>
            </p>

            {/* Leyenda de estados */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-barber-gray mb-3">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Libre</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Solicitada</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-600 inline-block" /> Confirmada</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Completada</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> No asistió</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-400 inline-block" /> Ausencia</span>
            </div>

            {timeline.slots.length === 0 ? (
              <div className="card p-5 text-center text-barber-gray">
                <p className="text-2xl mb-1">⚠️</p>
                <p className="text-sm font-semibold">Horario sin franjas</p>
                <p className="text-xs mt-0.5">Revisá que la hora de cierre sea posterior a la de apertura.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {timeline.slots.map((slot, i) => (
                  <SlotFila
                    key={i}
                    slot={slot}
                    fecha={diaSel}
                    abierta={abierta}
                    onToggle={(id) => setAbierta((prev) => (prev === id ? null : id))}
                    onAccion={accion}
                    onAgendarManual={onAgendarManual}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotFila({ slot, fecha, abierta, onToggle, onAccion, onAgendarManual }) {
  const rangoSlot = `${hora12(slot.inicio)} – ${hora12(slot.fin)}`;

  if (slot.tipo === "libre") {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-green-200 bg-green-50">
        <div className="w-1 self-stretch rounded-full shrink-0 bg-green-400" />
        <span className={COL_HORA}>{rangoSlot}</span>
        <span className="text-sm font-semibold text-green-700 flex-1 min-w-0">Libre</span>
        {onAgendarManual && (
          <button
            type="button"
            onClick={() => onAgendarManual(fecha, slot.inicio)}
            className="btn-primary text-xs py-1.5 px-3 shrink-0 whitespace-nowrap"
          >
            + Agendar manual
          </button>
        )}
      </div>
    );
  }

  if (slot.tipo === "pasado") {
    return (
      <div className="flex items-stretch gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 opacity-60">
        <div className="w-1 rounded-full shrink-0 bg-gray-200" />
        <div className="flex items-center gap-2 flex-wrap">
          <span className={COL_HORA}>{rangoSlot}</span>
          <span className="text-sm text-barber-gray">Ya pasó</span>
        </div>
      </div>
    );
  }

  if (slot.tipo === "ausencia") {
    const f = slot.franja || {};
    const etiqueta = slot.esAlmuerzo
      ? "🍽️ Almuerzo"
      : `🚫 Ausencia${f.motivo ? ` · ${f.motivo}` : ""}`;
    if (!slot.esInicio) {
      return (
        <div className="flex items-stretch gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
          <div className="w-1 rounded-full shrink-0 bg-gray-300" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className={COL_HORA}>{rangoSlot}</span>
            <span className="text-xs text-barber-gray">⤷ sigue {slot.esAlmuerzo ? "almuerzo" : "ausencia"}</span>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-stretch gap-3 px-3 py-2 rounded-lg border border-gray-300 bg-gray-100">
        <div className="w-1 rounded-full shrink-0 bg-gray-400" />
        <div className="flex items-center gap-2 flex-wrap">
          <span className={COL_HORA}>{hora12(slot.inicioReal)} – {hora12(slot.finReal)}</span>
          <span className="text-sm font-semibold text-barber-gray">{etiqueta}</span>
        </div>
      </div>
    );
  }

  const c = slot.cita;
  const estilo = CITA_ESTILO[c.estado] || { wrap: "border-gray-200 bg-gray-50", barra: "bg-gray-400" };
  const celular = (c.clienteCelular || "").replace(/\D/g, "");
  const esSolicitada = c.estado === "solicitada";
  const hoyStr = fechaLocalHoy();
  const ahoraMin = minutosActualesColombia();
  const inicioCitaMin = hhmmAMin(c.horaInicio);
  const esFutura = fecha > hoyStr || (fecha === hoyStr && inicioCitaMin > ahoraMin);

  // Slots siguientes de una cita que abarca varias medias horas: renglón compacto.
  if (!slot.esInicio) {
    return (
      <div className={`flex items-stretch gap-3 px-3 py-2 rounded-lg border ${estilo.wrap} opacity-70`}>
        <div className={`w-1 rounded-full shrink-0 ${estilo.barra}`} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className={COL_HORA}>{rangoSlot}</span>
          <span className="text-xs text-barber-gray">⤷ sigue: {c.clienteNombre}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2 ${estilo.wrap} ${esSolicitada ? "ring-1 ring-amber-300" : ""}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Lado izquierdo: barra, hora, cliente y plan */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`w-1 self-stretch rounded-full shrink-0 ${estilo.barra}`} />
          <span className={COL_HORA}>{hora12(slot.inicioReal)} – {hora12(slot.finReal)}</span>
          <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold text-sm text-barber-ink truncate">{c.clienteNombre}</span>
            <span className="text-xs text-barber-gray whitespace-nowrap">· {c.planSnapshot?.nombre} ({formatDur(slot.duracion)})</span>
          </div>
          <div className="shrink-0 sm:hidden">
            <EstadoBadge estado={c.estado} />
          </div>
        </div>

        {/* Lado derecho: badge (desktop) y botones compactos */}
        <div className="flex items-center gap-1.5 flex-wrap shrink-0 justify-start sm:justify-end">
          <div className="hidden sm:block shrink-0 mr-1">
            <EstadoBadge estado={c.estado} />
          </div>

          {esSolicitada && (
            <>
              <button
                type="button"
                className="btn-blue text-xs py-1.5 px-2.5 sm:px-3 shrink-0 whitespace-nowrap font-medium"
                onClick={() => onAccion(c.id, "confirmar")}
              >
                Aceptar
              </button>
              <button
                type="button"
                className="btn-outline text-xs py-1.5 px-2.5 sm:px-3 shrink-0 whitespace-nowrap font-medium"
                onClick={() => onAccion(c.id, "rechazar")}
              >
                Rechazar
              </button>
            </>
          )}

          {c.estado === "confirmada" && (
            <>
              {!esFutura && (
                <button
                  type="button"
                  className="btn-dark text-xs py-1.5 px-2.5 sm:px-3 shrink-0 whitespace-nowrap font-medium"
                  onClick={() => onAccion(c.id, "completar")}
                >
                  Completar
                </button>
              )}
              <button
                type="button"
                className="btn-outline text-xs py-1.5 px-2.5 sm:px-3 shrink-0 whitespace-nowrap font-medium"
                onClick={() => onAccion(c.id, "cancelar")}
              >
                Cancelar Cita
              </button>
            </>
          )}

          {c.estado === "completada" && (
            <button
              type="button"
              className="btn-outline text-rose-700 border-rose-300 hover:bg-rose-50 text-xs py-1.5 px-2.5 sm:px-3 shrink-0 whitespace-nowrap font-medium"
              onClick={() => onAccion(c.id, "no-asistio")}
            >
              No asistió
            </button>
          )}

          {c.estado === "no_asistio" && (
            <button
              type="button"
              className="btn-outline text-xs py-1.5 px-2.5 sm:px-3 shrink-0 whitespace-nowrap font-medium"
              onClick={() => onAccion(c.id, "completar")}
            >
              Completar
            </button>
          )}

          {celular && (
            <a
              className="btn-wa text-xs py-1.5 px-2.5 sm:px-3 shrink-0 whitespace-nowrap font-medium inline-flex items-center gap-1"
              href={`https://wa.me/${celular}`}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Construye la jornada como una lista de franjas fijas de media hora, usando el
// mismo motor (`jornadaDelDia`) que el agendamiento manual y público, para que
// lo que aquí se ve como libre/ocupado coincida con lo que se puede agendar.
// Cada slot queda marcado como libre, cita, ausencia, almuerzo o pasado. Una
// cita/ausencia que abarca varios slots los ocupa todos: el primero muestra el
// detalle completo y los siguientes quedan como "continuación".
function buildTimeline(fecha, perfil, citasDia) {
  const jornada = jornadaDelDia({ barbero: perfil, fecha, citas: citasDia });
  if (jornada.tipo !== "laboral") return { tipo: jornada.tipo };

  const { inicioMin, finMin, ocupados, minPermitido } = jornada;
  const paso = perfil?.horario?.duracionTurnoMin || perfil?.planes?.[0]?.duracion || PASO_MIN;

  const slots = [];
  const vistos = new Set(); // citas/ausencias que abarcan varios slots

  for (let s = inicioMin; s < finMin; s += paso) {
    const e = Math.min(s + paso, finMin);
    const base = { inicio: minAHhmm(s), fin: minAHhmm(e) };

    // Las citas van primero en `ocupados`, así que ganan al pintar si solapan.
    const oc = ocupados.find((o) => o.ini < e && o.fin > s);
    if (oc) {
      const key = oc.tipo === "cita" ? `cita-${oc.cita.id}` : `${oc.tipo}-${oc.ini}-${oc.fin}`;
      const esInicio = !vistos.has(key);
      vistos.add(key);
      if (oc.tipo === "cita") {
        slots.push({
          ...base, tipo: "cita", cita: oc.cita, esInicio,
          duracion: oc.fin - oc.ini, inicioReal: minAHhmm(oc.ini), finReal: minAHhmm(oc.fin),
        });
      } else {
        slots.push({
          ...base, tipo: "ausencia", franja: oc.franja, esInicio, esAlmuerzo: oc.tipo === "almuerzo",
          inicioReal: minAHhmm(oc.ini), finReal: minAHhmm(oc.fin),
        });
      }
      continue;
    }

    // Hueco sin ocupar: libre solo si aún no ha pasado; si ya pasó (hoy), no
    // cuenta como disponible, se muestra atenuado igual que Manual lo omite.
    slots.push({ ...base, tipo: s < minPermitido ? "pasado" : "libre" });
  }

  return {
    tipo: "laboral",
    inicio: minAHhmm(inicioMin),
    fin: minAHhmm(finMin),
    slots,
    totalLibres: slots.filter((x) => x.tipo === "libre").length,
    totalCitas: ocupados.filter((o) => o.tipo === "cita").length,
  };
}

const hora12 = formatearHora12;

function formatDur(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDiaDetalle(fecha) {
  if (!fecha) return "";
  const [y, mo, d] = fecha.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mover(fecha, vista, dir) {
  const d = new Date(fecha);
  if (vista === "mes") d.setMonth(d.getMonth() + dir);
  else d.setDate(d.getDate() + dir * 7);
  return d;
}
function diasDelMes(ref) {
  const y = ref.getFullYear(), m = ref.getMonth();
  const primero = new Date(y, m, 1);
  const offset = primero.getDay();
  const totalDias = new Date(y, m + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= totalDias; d++) celdas.push(new Date(y, m, d));
  return celdas;
}
function diasDeLaSemana(ref) {
  const d = new Date(ref);
  d.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}
