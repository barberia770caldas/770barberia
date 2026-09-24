"use client";

import { useState } from "react";
import { DIAS_SEMANA, DURACIONES_CORTE_OPCIONES, DIAS_ANTICIPACION_OPCIONES } from "@/lib/constants";
import { fechaLocalHoy, fechaLocalMax, esFechaPasada, formatearHora12, hhmmAMin, minAHhmm } from "@/lib/disponibilidad";
import { linkWhatsApp } from "@/lib/whatsapp";

export default function ConfigHorario({ perfil, onGuardado, onIrACita }) {
  const [horaInicio, setHoraInicio] = useState(perfil.horario?.horaInicio || "10:00");
  const [horaFin, setHoraFin] = useState(perfil.horario?.horaFin || "19:00");
  const [dias, setDias] = useState(perfil.horario?.diasLaborales || [1, 2, 3, 4, 5, 6]);
  const [duracionTurnoMin, setDuracionTurnoMin] = useState(perfil.horario?.duracionTurnoMin || 30);
  const [diasAnticipacionMax, setDiasAnticipacionMax] = useState(perfil.horario?.diasAnticipacionMax || 7);
  const [almuerzoActivo, setAlmuerzoActivo] = useState(perfil.horario?.almuerzo?.activo || false);
  const [almuerzoIni, setAlmuerzoIni] = useState(perfil.horario?.almuerzo?.horaInicio || "13:00");
  const [almuerzoFin, setAlmuerzoFin] = useState(perfil.horario?.almuerzo?.horaFin || "14:00");
  const [ventana, setVentana] = useState(perfil.ventanaCancelacionHoras ?? 24);
  const [diasBloqueados, setDiasBloqueados] = useState(perfil.diasBloqueados || []);
  const [franjas, setFranjas] = useState(perfil.franjasBloqueadas || []);
  const [nuevoBloqueo, setNuevoBloqueo] = useState(fechaLocalHoy());
  const [modoBloqueo, setModoBloqueo] = useState("dia"); // "dia" | "horas"
  const [franjaIni, setFranjaIni] = useState("12:00");
  const [franjaFin, setFranjaFin] = useState("13:00");
  const [franjaMotivo, setFranjaMotivo] = useState("");
  const [datosPago, setDatosPago] = useState(perfil.datosPago || {});
  const [foto, setFoto] = useState(perfil.foto || "");
  const [redes, setRedes] = useState(perfil.redes || {});
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [conflictos, setConflictos] = useState([]);
  const [ausenciaMsg, setAusenciaMsg] = useState("");

  function toggleDia(d) {
    setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }
  function elegirFechaBloqueo(valor) {
    if (esFechaPasada(valor)) { setAusenciaMsg("No puedes bloquear una fecha que ya pasó."); return; }
    setAusenciaMsg(""); setNuevoBloqueo(valor);
  }
  // Las ausencias se guardan al instante (no dependen del botón "Guardar cambios"):
  // así un día/hora bloqueado queda aplicado de inmediato para los clientes.
  // `prev` guarda el estado anterior para poder revertir si el servidor rechaza
  // el bloqueo (p. ej. porque pisa una cita ya agendada).
  async function persistirAusencias(nextDias, nextFranjas, prev) {
    setAusenciaMsg("Guardando…");
    try {
      const res = await fetch("/api/barbero/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diasBloqueados: nextDias, franjasBloqueadas: nextFranjas }),
      });
      const data = await res.json().catch(() => ({}));
      // 409: el bloqueo choca con una o más citas agendadas. No se aplicó nada:
      // revertimos el estado local y mostramos las citas para reagendar.
      if (res.status === 409 && (data.conflictos || []).length) {
        if (prev) { setDiasBloqueados(prev.dias); setFranjas(prev.franjas); }
        setConflictos(data.conflictos);
        setAusenciaMsg("🚫 No se pudo bloquear: hay citas agendadas en ese tiempo.");
        return;
      }
      if (!res.ok) throw new Error();
      setConflictos([]);
      setAusenciaMsg("Ausencias guardadas ✔");
      onGuardado?.();
    } catch {
      if (prev) { setDiasBloqueados(prev.dias); setFranjas(prev.franjas); }
      setAusenciaMsg("⚠️ No se pudo guardar. Revisá tu conexión e intentá de nuevo.");
    }
  }
  function agregarBloqueo() {
    if (esFechaPasada(nuevoBloqueo)) { setAusenciaMsg("No puedes bloquear una fecha que ya pasó."); return; }
    if (diasBloqueados.includes(nuevoBloqueo)) return;
    const prev = { dias: diasBloqueados, franjas };
    const next = [...diasBloqueados, nuevoBloqueo].sort();
    setDiasBloqueados(next);
    persistirAusencias(next, franjas, prev);
  }
  function quitarBloqueo(f) {
    const prev = { dias: diasBloqueados, franjas };
    const next = diasBloqueados.filter((x) => x !== f);
    setDiasBloqueados(next);
    persistirAusencias(next, franjas, prev);
  }
  function agregarFranja() {
    if (!nuevoBloqueo) return;
    if (esFechaPasada(nuevoBloqueo)) { setAusenciaMsg("No puedes bloquear una fecha que ya pasó."); return; }
    if (franjaIni >= franjaFin) { setAusenciaMsg("La hora de fin debe ser mayor que la de inicio."); return; }
    const nueva = { fecha: nuevoBloqueo, horaInicio: franjaIni, horaFin: franjaFin, motivo: franjaMotivo.trim() };
    const existe = franjas.some((f) => f.fecha === nueva.fecha && f.horaInicio === nueva.horaInicio && f.horaFin === nueva.horaFin);
    if (existe) return;
    const prev = { dias: diasBloqueados, franjas };
    const next = [...franjas, nueva].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
    setFranjas(next);
    setFranjaMotivo("");
    persistirAusencias(diasBloqueados, next, prev);
  }
  function quitarFranja(idx) {
    const prev = { dias: diasBloqueados, franjas };
    const next = franjas.filter((_, i) => i !== idx);
    setFranjas(next);
    persistirAusencias(diasBloqueados, next, prev);
  }
  function onQR(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDatosPago((d) => ({ ...d, qrImagen: reader.result }));
    reader.readAsDataURL(file);
  }
  function onFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setMsg("La foto no debe pasar de 3 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result);
    reader.readAsDataURL(file);
  }

  async function guardar() {
    if (almuerzoActivo && almuerzoIni >= almuerzoFin) {
      setMsg("La hora de fin del almuerzo debe ser mayor que la de inicio.");
      return;
    }
    setGuardando(true); setMsg("");
    const res = await fetch("/api/barbero/perfil", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        horario: {
          horaInicio,
          horaFin,
          diasLaborales: dias,
          duracionTurnoMin: Number(duracionTurnoMin),
          diasAnticipacionMax: Number(diasAnticipacionMax),
          almuerzo: { activo: almuerzoActivo, horaInicio: almuerzoIni, horaFin: almuerzoFin },
        },
        ventanaCancelacionHoras: Number(ventana),
        diasBloqueados,
        franjasBloqueadas: franjas,
        datosPago,
        foto,
        redes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (res.status === 409 && (data.conflictos || []).length) {
      setConflictos(data.conflictos);
      setMsg("");
      setAusenciaMsg("🚫 No se pudo bloquear: hay citas agendadas en ese tiempo.");
      return;
    }
    if (res.ok) {
      setMsg("Cambios guardados ✔");
      setConflictos([]);
      onGuardado?.();
    } else {
      setMsg("Error al guardar");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="card p-6 space-y-4">
        <h2 className="font-display text-xl">Tu foto y redes</h2>
        <div className="flex items-center gap-4">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="Tu foto" className="w-20 h-20 rounded-full object-cover border border-black/10" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-barber-black text-white grid place-items-center font-display text-3xl">
              {perfil.nombre?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <label className="btn-outline text-sm py-1.5 cursor-pointer">
              Subir foto
              <input type="file" accept="image/*" onChange={onFoto} className="hidden" />
            </label>
            {foto && (
              <button type="button" onClick={() => setFoto("")} className="ml-2 text-sm text-red-600 font-semibold">Quitar</button>
            )}
            <p className="text-xs text-barber-gray mt-1">Esta es la foto que ven tus clientes.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="label">📸 Instagram</label>
            <input className="input" value={redes.instagram || ""} onChange={(e) => setRedes({ ...redes, instagram: e.target.value })} placeholder="@usuario o link" />
          </div>
          <div>
            <label className="label">📘 Facebook</label>
            <input className="input" value={redes.facebook || ""} onChange={(e) => setRedes({ ...redes, facebook: e.target.value })} placeholder="Link o usuario" />
          </div>
          <div>
            <label className="label">🎵 TikTok</label>
            <input className="input" value={redes.tiktok || ""} onChange={(e) => setRedes({ ...redes, tiktok: e.target.value })} placeholder="@usuario o link" />
          </div>
        </div>
      </section>

      <section className="card p-6 space-y-5">
        <h2 className="font-display text-xl">Horario laboral</h2>

        {/* Resumen visual */}
        <div className="rounded-xl bg-barber-cream border border-black/10 px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🕐</span>
          <div className="text-sm leading-snug">
            <p>
              Atendés de{" "}
              <span className="font-bold text-barber-blue">{hora12simple(horaInicio)}</span>
              {" "}a{" "}
              <span className="font-bold text-barber-blue">{hora12simple(horaFin)}</span>
              {" "}·{" "}
              <span className="font-semibold">{duracionJornada(horaInicio, horaFin)} horas al día</span>
            </p>
            <p className="text-barber-gray mt-0.5">
              {dias.length === 0
                ? "⚠️ Ningún día seleccionado"
                : `${dias.length} día${dias.length !== 1 ? "s" : ""} a la semana`}
            </p>
          </div>
        </div>

        {/* Hora apertura / cierre */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">🟢 Apertura</label>
            <input type="time" className="input" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          </div>
          <div>
            <label className="label">🔴 Cierre</label>
            <input type="time" className="input" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
          </div>
        </div>

        {/* Tiempo por corte / turno */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">⏱️ Tiempo por corte</label>
            <span className="text-xs font-bold text-barber-blue bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {duracionTurnoMin} minutos por cliente
            </span>
          </div>
          <p className="text-xs text-barber-gray mb-2">
            Elige cuánto tardas en cada corte. Tu agenda se organizará en bloques exactos de este tiempo:
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {DURACIONES_CORTE_OPCIONES.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setDuracionTurnoMin(min)}
                className={`rounded-lg py-2 text-xs font-bold border transition ${
                  duracionTurnoMin === min
                    ? "bg-barber-ink text-white border-barber-ink shadow-sm"
                    : "border-gray-200 text-barber-gray hover:border-barber-ink hover:text-barber-ink bg-white"
                }`}
              >
                {min}m
              </button>
            ))}
          </div>
          {horaInicio && (
            <p className="text-xs text-barber-gray mt-2 bg-barber-cream/70 p-2.5 rounded-lg border border-black/5">
              📌 Ejemplo: Turno 1: <b>{hora12simple(horaInicio)} – {hora12simple(minAHhmm(hhmmAMin(horaInicio) + duracionTurnoMin))}</b>
              {" · "}Turno 2: <b>{hora12simple(minAHhmm(hhmmAMin(horaInicio) + duracionTurnoMin))} – {hora12simple(minAHhmm(hhmmAMin(horaInicio) + duracionTurnoMin * 2))}</b>
            </p>
          )}
        </div>

        {/* Días — grid fijo 7 columnas para que siempre quepan en una fila */}
        <div>
          <label className="label">Días que trabajás</label>
          <div className="grid grid-cols-7 gap-1.5">
            {DIAS_SEMANA.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDia(i)}
                className={`rounded-lg py-3 text-xs font-bold text-center border transition active:scale-95 ${
                  dias.includes(i)
                    ? "bg-barber-blue text-white border-barber-blue"
                    : "border-gray-200 text-barber-gray hover:border-barber-blue hover:text-barber-blue"
                }`}
              >
                {d.slice(0, 2)}
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-xs text-barber-gray">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-barber-blue inline-block" /> Trabajás</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border border-gray-300 inline-block" /> Descanso</span>
          </div>
        </div>

        {/* Hora de almuerzo — se aplica a todos los días de trabajo */}
        <div className="rounded-xl border border-black/10 p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-barber-blue"
              checked={almuerzoActivo}
              onChange={(e) => setAlmuerzoActivo(e.target.checked)}
            />
            <span className="font-semibold text-sm">🍽️ Tengo hora de almuerzo</span>
          </label>
          {almuerzoActivo && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Desde</label>
                  <input type="time" className="input" value={almuerzoIni} onChange={(e) => setAlmuerzoIni(e.target.value)} />
                </div>
                <div>
                  <label className="label">Hasta</label>
                  <input type="time" className="input" value={almuerzoFin} onChange={(e) => setAlmuerzoFin(e.target.value)} />
                </div>
              </div>
              {almuerzoIni >= almuerzoFin ? (
                <p className="text-xs text-red-600">⚠️ La hora de fin debe ser mayor que la de inicio.</p>
              ) : (
                <p className="text-xs text-barber-gray">
                  De <b>{hora12simple(almuerzoIni)}</b> a <b>{hora12simple(almuerzoFin)}</b> no podrán agendarte citas.
                  Aplica a los {dias.length} día{dias.length !== 1 ? "s" : ""} que trabajás.
                </p>
              )}
            </>
          )}
        </div>

        {/* Ventana de reserva futura — Estilo Calendly */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">📅 ¿Con cuánta anticipación pueden agendarte?</label>
            <span className="text-xs font-bold text-barber-blue bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Máximo {diasAnticipacionMax} días a futuro
            </span>
          </div>
          <p className="text-xs text-barber-gray mb-2">
            Controla qué tan abierta está tu agenda. Los clientes solo podrán elegir fechas dentro de esta ventana:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {DIAS_ANTICIPACION_OPCIONES.map((op) => (
              <button
                key={op.valor}
                type="button"
                onClick={() => setDiasAnticipacionMax(op.valor)}
                className={`rounded-lg py-2 text-xs font-bold border transition ${
                  diasAnticipacionMax === op.valor
                    ? "bg-barber-ink text-white border-barber-ink shadow-sm"
                    : "border-gray-200 text-barber-gray hover:border-barber-ink hover:text-barber-ink bg-white"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-barber-gray mt-2 bg-barber-cream/70 p-2.5 rounded-lg border border-black/5">
            📌 Los clientes podrán agendar desde <b>hoy</b> hasta el <b>{fechaLocalMax(diasAnticipacionMax)}</b>. Las fechas posteriores estarán bloqueadas automáticamente.
          </p>
        </div>

        {/* Cancelación — explicado en lenguaje claro */}
        <div>
          <label className="label">¿Hasta cuándo pueden cancelar los clientes?</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              className="input max-w-[90px] text-center font-bold text-lg"
              value={ventana}
              onChange={(e) => setVentana(e.target.value)}
              min={0}
            />
            <span className="text-sm text-barber-gray">horas antes de la cita</span>
          </div>
          {Number(ventana) === 0 ? (
            <p className="text-xs text-amber-600 mt-1.5">⚠️ Con 0 horas, los clientes pueden cancelar en cualquier momento, incluso el mismo día.</p>
          ) : (
            <p className="text-xs text-barber-gray mt-1.5">
              Ej: si tiene cita a las 3:00 p.m., puede cancelar hasta las{" "}
              <b>{cancelacionEjemplo(ventana)}</b>.
            </p>
          )}
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <div>
          <h2 className="font-display text-xl">Ausencias</h2>
          <p className="text-sm text-barber-gray mt-0.5">Bloqueá días completos o franjas de horas en las que no vas a atender. Se guardan al instante y los clientes no podrán agendar en ese tiempo.</p>
          {ausenciaMsg && (
            <p className={`text-sm font-semibold mt-2 ${ausenciaMsg.startsWith("⚠️") || ausenciaMsg.startsWith("No ") || ausenciaMsg.startsWith("La ") ? "text-red-600" : "text-green-700"}`}>
              {ausenciaMsg}
            </p>
          )}
        </div>

        {/* Selector de modo */}
        <div className="grid grid-cols-2 gap-1.5 bg-gray-100 rounded-xl p-1">
          {[
            { key: "dia", label: "Día completo" },
            { key: "horas", label: "Solo unas horas" },
          ].map((op) => (
            <button
              key={op.key}
              type="button"
              onClick={() => setModoBloqueo(op.key)}
              className={`rounded-lg py-2 px-2 text-sm font-bold leading-tight transition ${
                modoBloqueo === op.key ? "bg-white text-barber-ink shadow-sm" : "text-barber-gray"
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>

        {/* Formulario según modo */}
        {modoBloqueo === "dia" ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="date" className="input min-w-0" min={fechaLocalHoy()} value={nuevoBloqueo} onChange={(e) => elegirFechaBloqueo(e.target.value)} />
            <button type="button" className="btn-outline text-sm whitespace-nowrap w-full sm:w-auto" onClick={agregarBloqueo}>+ Bloquear</button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Móvil: fecha a lo ancho y Desde/Hasta en dos columnas debajo */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 [&_input]:min-w-0">
              <div className="col-span-2 sm:col-span-1">
                <label className="label text-xs">Fecha</label>
                <input type="date" className="input" min={fechaLocalHoy()} value={nuevoBloqueo} onChange={(e) => elegirFechaBloqueo(e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Desde</label>
                <input type="time" className="input" value={franjaIni} onChange={(e) => setFranjaIni(e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Hasta</label>
                <input type="time" className="input" value={franjaFin} onChange={(e) => setFranjaFin(e.target.value)} />
              </div>
            </div>
            <input
              className="input"
              value={franjaMotivo}
              onChange={(e) => setFranjaMotivo(e.target.value)}
              placeholder="Motivo (opcional): cita médica, diligencia…"
              maxLength={60}
            />
            <button type="button" className="btn-outline text-sm w-full sm:w-auto" onClick={agregarFranja}>+ Bloquear horas</button>
          </div>
        )}

        {/* Lista de días completos bloqueados */}
        <div>
          <p className="label text-xs mb-1.5">Días completos bloqueados</p>
          <div className="flex flex-wrap gap-2">
            {diasBloqueados.length === 0
              ? <span className="text-sm text-barber-gray">Ninguno.</span>
              : diasBloqueados.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-full px-3 py-1 text-sm font-medium">
                    📅 {formatFechaBloq(f)}
                    <button onClick={() => quitarBloqueo(f)} className="text-red-500 hover:text-red-700 font-bold leading-none" aria-label="Quitar">×</button>
                  </span>
                ))
            }
          </div>
        </div>

        {/* Lista de franjas de horas bloqueadas */}
        <div>
          <p className="label text-xs mb-1.5">Horas bloqueadas</p>
          <div className="flex flex-wrap gap-2">
            {franjas.length === 0
              ? <span className="text-sm text-barber-gray">Ninguna.</span>
              : franjas.map((f, i) => (
                  <span key={`${f.fecha}-${f.horaInicio}-${i}`} className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-sm font-medium">
                    🕐 {formatFechaBloq(f.fecha)} · {hora12simple(f.horaInicio)}–{hora12simple(f.horaFin)}
                    {f.motivo ? <span className="text-barber-gray font-normal">({f.motivo})</span> : null}
                    <button onClick={() => quitarFranja(i)} className="text-red-500 hover:text-red-700 font-bold leading-none" aria-label="Quitar">×</button>
                  </span>
                ))
            }
          </div>
        </div>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="font-display text-xl">Datos de pago (para tus clientes)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>div]:min-w-0">
          <div><label className="label">Nequi</label><input className="input" value={datosPago.nequi || ""} onChange={(e) => setDatosPago({ ...datosPago, nequi: e.target.value })} placeholder="Número Nequi" /></div>
          <div><label className="label">Daviplata</label><input className="input" value={datosPago.daviplata || ""} onChange={(e) => setDatosPago({ ...datosPago, daviplata: e.target.value })} placeholder="Número Daviplata" /></div>
          <div className="sm:col-span-2"><label className="label">Cuenta bancaria</label><input className="input" value={datosPago.cuenta || ""} onChange={(e) => setDatosPago({ ...datosPago, cuenta: e.target.value })} placeholder="Banco y número de cuenta" /></div>
          <div className="sm:col-span-2">
            <label className="label">Código QR (imagen)</label>
            <input type="file" accept="image/*" onChange={onQR} className="block w-full max-w-full text-sm text-barber-gray file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-barber-ink hover:file:bg-gray-200" />
            {datosPago.qrImagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={datosPago.qrImagen} alt="QR" className="mt-2 w-32 h-32 object-contain border rounded" />
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
        {msg && <span className="text-sm font-semibold text-green-700">{msg}</span>}
      </div>

      {conflictos.length > 0 && (
        <section className="card p-6 space-y-3 border-2 border-red-300 bg-red-50">
          <div className="flex items-start gap-2">
            <span className="text-2xl">🚫</span>
            <div>
              <h2 className="font-display text-xl">No se pudo bloquear: tenés {conflictos.length} cita{conflictos.length !== 1 ? "s" : ""} agendada{conflictos.length !== 1 ? "s" : ""} en ese tiempo</h2>
              <p className="text-sm text-barber-gray mt-0.5">
                No se puede marcar ausencia sobre una cita ya agendada. Primero <b>comunicate con el cliente</b> para reagendar y cancelá la cita desde el calendario; luego vas a poder bloquear ese tiempo.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {conflictos.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{c.clienteNombre}</p>
                  <p className="text-xs text-barber-gray">
                    📅 {formatFechaBloq(c.fecha)} · {hora12simple(c.horaInicio)}–{hora12simple(c.horaFin)}
                    {c.planSnapshot?.nombre ? ` · ${c.planSnapshot.nombre}` : ""} · {c.estado}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    className="btn-outline text-sm py-1.5"
                    onClick={() => onIrACita?.(c.fecha)}
                  >
                    Ver la cita
                  </button>
                  {c.clienteCelular && (
                    <a
                      className="btn-wa text-sm py-1.5"
                      href={linkWhatsApp(c.clienteCelular, mensajeReagendar(c, perfil))}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-barber-gray">
            Para reagendar, escribile al cliente por WhatsApp y luego cancelá la cita en la pestaña <b>Calendario</b>.
          </p>
        </section>
      )}
    </div>
  );
}

const hora12simple = formatearHora12;

function duracionJornada(inicio, fin) {
  if (!inicio || !fin) return "?";
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fin.split(":").map(Number);
  const diff = hf * 60 + mf - (hi * 60 + mi);
  if (diff <= 0) return "?";
  const horas = Math.floor(diff / 60);
  const mins = diff % 60;
  return mins === 0 ? `${horas}` : `${horas}h ${mins}m`;
}

function cancelacionEjemplo(horas) {
  const h = Number(horas);
  if (!h) return "";
  // Usamos día 2 para que restar horas no pise el día 1 y se calcule bien
  const base = new Date(2000, 0, 2, 15, 0);
  base.setMinutes(base.getMinutes() - h * 60);
  const hh = String(base.getHours()).padStart(2, "0");
  const mm = String(base.getMinutes()).padStart(2, "0");
  const hora = formatearHora12(`${hh}:${mm}`);
  if (h >= 24) return `${hora} del día anterior`;
  if (h >= 12) return `${hora} (mismo día)`;
  return hora;
}

function formatFechaBloq(fechaISO) {
  if (!fechaISO) return fechaISO;
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

// Mensaje de WhatsApp para pedirle al cliente reagendar la cita que impide la ausencia.
function mensajeReagendar(cita, perfil) {
  const local = perfil?.local || "la barbería";
  const fecha = formatFechaBloq(cita.fecha);
  const hora = hora12simple(cita.horaInicio);
  return (
    `Hola ${cita.clienteNombre}, soy de *${local}*.\n\n` +
    `Necesito reagendar tu cita del ${fecha} a las ${hora}, ya que no voy a poder atender en ese horario.\n\n` +
    `¿Qué día y hora te quedarían bien? Disculpá las molestias.`
  );
}
