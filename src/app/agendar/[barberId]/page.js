"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Avatar from "@/components/Avatar";
import SocialLinks from "@/components/SocialLinks";
import { WhatsAppIcon } from "@/components/Icons";
import ActivarRecordatoriosCliente from "@/components/ActivarRecordatoriosCliente";
import { formatoCOP, METODOS_PAGO_LABEL } from "@/lib/constants";
import { fechaLocalHoy, fechaLocalMax, esFechaPasada, formatearHora12 } from "@/lib/disponibilidad";
import { esMovil } from "@/lib/dispositivo";
import { linkWhatsApp } from "@/lib/whatsapp";

export default function AgendarPage() {
  const { barberId } = useParams();
  const [barbero, setBarbero] = useState(null);
  const [paso, setPaso] = useState(1);

  // datos cliente
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");

  // selección
  const [plan, setPlan] = useState(null);
  const [fecha, setFecha] = useState(fechaLocalHoy());
  const [fechaManual, setFechaManual] = useState(false);
  const [slots, setSlots] = useState([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [hora, setHora] = useState(null);
  const [metodoPago, setMetodoPago] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // {cita, linkWhatsappBarbero}

  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/barberos/${barberId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setBarbero(d.barbero);
      });
  }, [barberId]);

  // Cargar slots cuando hay plan y fecha
  useEffect(() => {
    if (!plan || !fecha) return;
    setCargandoSlots(true);
    setHora(null);
    fetch(`/api/barberos/${barberId}/disponibilidad?fecha=${fecha}&plan=${plan.key}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots || []))
      .finally(() => setCargandoSlots(false));
  }, [plan, fecha, barberId]);

  // Busca automáticamente el primer día con disponibilidad (evita aterrizar en un día vacío)
  async function buscarPrimeraFecha(planObj) {
    setBuscando(true);
    const d = new Date();
    const limiteDias = barbero?.horario?.diasAnticipacionMax || 7;
    for (let i = 0; i <= limiteDias; i++) {
      const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      try {
        const res = await fetch(`/api/barberos/${barberId}/disponibilidad?fecha=${f}&plan=${planObj.key}`);
        const data = await res.json();
        if ((data.slots || []).length > 0) {
          setFecha(f);
          setBuscando(false);
          return;
        }
      } catch {}
      d.setDate(d.getDate() + 1);
    }
    setBuscando(false); // no encontró en el rango de días; se queda en la fecha actual
  }

  // Auto-avance: al elegir plan pasa a horario (y busca el primer día con cupos)
  function seleccionarPlan(p) {
    setPlan(p);
    setMetodoPago(null);
    setError("");
    setPaso(3);
    if (!fechaManual) buscarPrimeraFecha(p);
  }

  // Auto-avance: al elegir hora pasa a pago
  function seleccionarHora(s) {
    setHora(s);
    setPaso(4);
  }

  // Cambia la fecha rechazando cualquier día ya pasado o posterior al límite del barbero
  function elegirFecha(valor) {
    setFechaManual(true);
    if (esFechaPasada(valor)) {
      setError("No podés agendar en una fecha que ya pasó. Elegí de hoy en adelante.");
      return; // no actualiza: el input controlado revierte a la fecha válida
    }
    const maxDias = barbero?.horario?.diasAnticipacionMax || 7;
    const maxFecha = fechaLocalMax(maxDias);
    if (valor > maxFecha) {
      setError(`Este barbero solo recibe reservas con hasta ${maxDias} días de anticipación (hasta el ${maxFecha}).`);
      return;
    }
    setError("");
    setFecha(valor);
  }

  // Retrocede un paso, sin perder los datos ya ingresados
  function volver() {
    setError("");
    setPaso((p) => Math.max(1, p - 1));
  }

  async function crearCita() {
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberoId: barberId,
          plan: plan.key,
          fecha,
          horaInicio: hora,
          metodoPago,
          clienteNombre: nombre,
          clienteCelular: celular,
          plano: !esMovil(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al crear la cita");
      setResultado(d);
      setPaso(5);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  const requiereAnticipo = plan && (plan.anticipo || 0) > 0;
  const montoAnticipo = requiereAnticipo
    ? Math.round((plan.precio * plan.anticipo) / 100)
    : 0;

  if (error && !barbero) {
    return (
      <Wrap>
        <div className="card p-8 text-center">
          <p className="text-red-600">{error}</p>
          <Link href="/" className="btn-outline mt-4">Volver</Link>
        </div>
      </Wrap>
    );
  }

  if (!barbero) return <Wrap><p className="text-barber-gray">Cargando…</p></Wrap>;

  return (
    <Wrap>
      <div className="mb-5 flex flex-col items-center text-center">
        <Avatar
          foto={barbero.foto}
          nombre={barbero.nombre}
          className="w-28 h-28 sm:w-48 sm:h-48 shadow-card"
          text="text-4xl sm:text-6xl"
        />
        <h1 className="font-display text-2xl sm:text-3xl mt-3">{barbero.nombre}</h1>
        <p className="text-barber-gray text-sm sm:text-base">{barbero.local} · {barbero.ciudad}</p>
        {barbero.direccion && (
          <p className="text-xs sm:text-sm text-barber-gray">📍 {barbero.direccion}</p>
        )}
        <SocialLinks redes={barbero.redes} className="mt-2 justify-center" />
      </div>

      <Pasos paso={paso} />

      {/* Botón Atrás siempre visible en pasos intermedios */}
      {paso >= 2 && paso <= 4 && (
        <button
          type="button"
          onClick={volver}
          className="group mt-4 inline-flex items-center gap-2 text-sm font-semibold text-barber-ink hover:text-barber-red transition"
        >
          <span className="grid place-items-center w-9 h-9 rounded-full border border-gray-300 bg-white shadow-sm group-hover:border-barber-red group-hover:-translate-x-0.5 transition">
            ←
          </span>
          Atrás
        </button>
      )}

      {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}

      {/* PASO 1: datos del cliente */}
      {paso === 1 && (
        <form
          className="card p-6 mt-4 space-y-4"
          onSubmit={(e) => { e.preventDefault(); setError(""); setPaso(2); }}
        >
          <h2 className="font-display text-xl">¿Quién agenda?</h2>
          <div>
            <label className="label">Nombre completo</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Juan Pérez" />
          </div>
          <div>
            <label className="label">Celular</label>
            <input
              type="tel"
              className="input"
              value={celular}
              onChange={(e) => setCelular(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Ej: 3001234567"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
            />
            <p className="text-xs text-barber-gray mt-1">Con tu celu después consultás cómo va tu cita.</p>
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={!nombre.trim() || celular.replace(/\D/g, "").length < 10}
          >
            Continuar
          </button>

          {/* Opción secundaria: si el cliente va manejando o prefiere no llenar el
              formulario, puede escribirle directamente al barbero por WhatsApp. */}
          {barbero.celular && (
            <div className="pt-2">
              <div className="flex items-center gap-3 text-xs text-barber-gray">
                <span className="h-px flex-1 bg-black/10" />
                ¿Vas manejando o prefieres escribir?
                <span className="h-px flex-1 bg-black/10" />
              </div>
              <a
                href={linkWhatsApp(
                  barbero.celular,
                  `Hola ${barbero.nombre?.split(" ")[0] || ""}, quiero agendar una cita contigo.`
                )}
                target="_blank"
                rel="noreferrer"
                className="btn-wa w-full mt-3"
              >
                <WhatsAppIcon className="w-5 h-5" /> Agendar por WhatsApp
              </a>
            </div>
          )}
        </form>
      )}

      {/* PASO 2: elegir plan */}
      {paso === 2 && (
        <div className="mt-4 space-y-4">
          <h2 className="font-display text-xl">Escogé tu plan</h2>
          <div className="grid sm:grid-cols-3 gap-4 items-stretch">
            {barbero.planes.map((p) => (
              <button
                key={p.key}
                onClick={() => seleccionarPlan(p)}
                className={`card p-5 text-left transition flex flex-col h-full ${plan?.key === p.key ? "ring-2 ring-barber-red" : "hover:-translate-y-1"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-2xl leading-none">{p.nombre}</h3>
                  <span className="text-barber-red font-bold whitespace-nowrap">{formatoCOP(p.precio)}</span>
                </div>
                <ul className="mt-3 text-sm text-barber-gray space-y-1 flex-1">
                  {p.servicios.map((s, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-barber-red">✓</span>{s}</li>
                  ))}
                </ul>
                <p className="mt-4 pt-3 border-t border-black/5 text-xs font-semibold text-barber-gray">
                  ⏱️ {p.duracion} min {p.anticipo > 0 ? `· Anticipo ${p.anticipo}%` : "· Sin anticipo"}
                </p>
              </button>
            ))}
          </div>
          <p className="text-sm text-barber-gray text-center">Toca un plan para continuar.</p>
        </div>
      )}

      {/* PASO 3: fecha y hora */}
      {paso === 3 && (
        <div className="card p-6 mt-4 space-y-4">
          <h2 className="font-display text-xl">¿Qué día y a qué hora?</h2>

          {/* Accesos rápidos de fecha */}
          <div className="flex flex-wrap gap-2">
            {chipsFecha(barbero.horario?.diasLaborales, barbero.horario?.diasAnticipacionMax || 7).map((c) => (
              <button
                key={c.valor}
                onClick={() => elegirFecha(c.valor)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${fecha === c.valor ? "bg-barber-ink text-white border-barber-ink" : "border-gray-300 hover:border-barber-ink"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div>
            <label className="label">O elige otra fecha</label>
            <input
              type="date"
              className="input"
              min={fechaLocalHoy()}
              max={fechaLocalMax(barbero.horario?.diasAnticipacionMax || 7)}
              value={fecha}
              onChange={(e) => elegirFecha(e.target.value)}
            />
            <p className="text-xs text-barber-gray mt-1">
              Agenda abierta hasta el {etiquetaFecha(fechaLocalMax(barbero.horario?.diasAnticipacionMax || 7), false)} (máx. {barbero.horario?.diasAnticipacionMax || 7} días).
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="label">{etiquetaFecha(fecha, false)}</label>
              {!cargandoSlots && !buscando && slots.length > 0 && (
                <span className="text-xs text-barber-gray">{slots.length} cupos · {plan?.duracion} min c/u</span>
              )}
            </div>

            {buscando ? (
              <p className="text-barber-gray text-sm py-3">Buscando el próximo día con cupos…</p>
            ) : cargandoSlots ? (
              <p className="text-barber-gray text-sm py-3">Cargando horarios…</p>
            ) : slots.length === 0 ? (
              <div className="rounded-lg bg-barber-cream border border-black/10 p-4 text-sm text-barber-gray">
                No hay cupos ese día. Prueba con otra fecha o usa los accesos rápidos de arriba.
              </div>
            ) : (
              <div className="space-y-4">
                <GrupoSlots titulo="🌅 Mañana" lista={slots.filter((s) => s < "12:00")} hora={hora} setHora={seleccionarHora} />
                <GrupoSlots titulo="🌇 Tarde" lista={slots.filter((s) => s >= "12:00")} hora={hora} setHora={seleccionarHora} />
              </div>
            )}
          </div>

          {!cargandoSlots && !buscando && slots.length > 0 && (
            <p className="text-sm text-barber-gray text-center">Toca una hora para continuar.</p>
          )}
        </div>
      )}

      {/* PASO 4: pago */}
      {paso === 4 && (
        <form className="card p-6 mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); crearCita(); }}>
          <h2 className="font-display text-xl">Pago</h2>
          <Resumen barbero={barbero} plan={plan} fecha={fecha} hora={hora} />

          <div>
            <label className="label">Método de pago</label>
            <div className="flex flex-wrap gap-2">
              {plan.metodosPago.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetodoPago(m)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${metodoPago === m ? "bg-barber-red text-white border-barber-red" : "border-gray-300 hover:border-barber-red"}`}
                >
                  {METODOS_PAGO_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Datos para pagarle al barbero: se muestran apenas el cliente elige un
              método digital, tenga o no anticipo el plan. */}
          {metodoPago && metodoPago !== "efectivo" && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-barber-gray uppercase tracking-wide mb-2">
                Datos para pagarle a {barbero.nombre?.split(" ")[0] || "tu barbero"}
              </p>
              <DatosPago datosPago={barbero.datosPago} metodo={metodoPago} />
            </div>
          )}

          {requiereAnticipo && (
            <div className="rounded-xl bg-amber-50/80 p-4 border border-amber-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="font-bold text-amber-900 text-sm sm:text-base">
                  Anticipo requerido: {formatoCOP(montoAnticipo)} ({plan.anticipo}%)
                </p>
                <span className="badge bg-amber-200/80 text-amber-900 text-xs font-semibold">
                  Seña de cupo
                </span>
              </div>
              <div className="p-3 bg-white/80 rounded-lg border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <span className="text-base leading-none">📲</span>
                <p>
                  <strong>Envío por WhatsApp:</strong> Haz la transferencia del anticipo. Al darle clic a <em>«¡Enviar solicitud!»</em>, se abrirá WhatsApp con los datos de tu reserva para que le compartas la foto del comprobante directamente a tu barbero.
                </p>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={enviando || !metodoPago}
          >
            {enviando ? "Enviando…" : "¡Enviar solicitud!"}
          </button>
        </form>
      )}

      {/* PASO 5: resultado */}
      {paso === 5 && resultado && (
        <div className="card p-6 mt-4 space-y-4 text-center">
          <div className="text-5xl">📲</div>
          <h2 className="font-display text-2xl text-barber-ink">¡Falta un último paso!</h2>
          <p className="text-sm text-barber-gray max-w-md mx-auto leading-relaxed">
            Para apartar tu cupo, <strong>envíale el mensaje a tu barbero por WhatsApp</strong>. Así él sabrá de tu solicitud y te confirmará de inmediato.
          </p>
          <Resumen barbero={barbero} plan={plan} fecha={fecha} hora={hora} />

          {/* Datos para pagar: se repiten aquí para que el cliente pueda copiar el
              Nequi/cuenta o escanear el QR justo antes de mandar el comprobante,
              sin tener que devolverse al paso de pago. */}
          {metodoPago && metodoPago !== "efectivo" && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
              <p className="text-xs font-semibold text-barber-gray uppercase tracking-wide mb-2">
                {requiereAnticipo
                  ? `1. Paga el anticipo de ${formatoCOP(montoAnticipo)} a ${barbero.nombre?.split(" ")[0] || "tu barbero"}`
                  : `Datos para pagarle a ${barbero.nombre?.split(" ")[0] || "tu barbero"}`}
              </p>
              <DatosPago datosPago={barbero.datosPago} metodo={metodoPago} />
            </div>
          )}

          {resultado.linkWhatsappBarbero && (
            <div className="space-y-2">
              {metodoPago && metodoPago !== "efectivo" && (
                <p className="text-sm font-semibold text-barber-ink text-left">
                  {requiereAnticipo ? "2. Envía el comprobante:" : "Luego avísale al barbero:"}
                </p>
              )}
              <a
                href={resultado.linkWhatsappBarbero}
                target="_blank"
                rel="noreferrer"
                className="btn-wa w-full py-3.5 text-base font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <WhatsAppIcon className="w-5 h-5 shrink-0" />
                <span>
                  👉 {requiereAnticipo
                    ? `Toca aquí para enviar comprobante a ${barbero.nombre?.split(" ")[0] || "tu barbero"}`
                    : `Toca aquí para avisarle a ${barbero.nombre?.split(" ")[0] || "tu barbero"}`} por WhatsApp
                </span>
              </a>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg p-2.5 text-center font-medium">
                ⚠️ <strong>Importante:</strong> Tu cita no quedará confirmada hasta que el barbero reciba tu mensaje.
              </p>
            </div>
          )}

          {/* Recordatorio push del día de la cita (opt-in, gratis). */}
          <div className="text-left">
            <ActivarRecordatoriosCliente celular={celular} />
          </div>

          <div className="flex gap-3">
            <Link href="/mis-citas" className="btn-outline flex-1">Ver mis citas</Link>
            <Link href="/" className="btn-dark flex-1">Inicio</Link>
          </div>
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <div className="min-h-screen">
      <Header>
        <Link href="/" className="hover:text-barber-red">Inicio</Link>
        <Link href="/mis-citas" className="hover:text-barber-red">Mis citas</Link>
      </Header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}

function Pasos({ paso }) {
  const items = ["Datos", "Plan", "Horario", "Pago", "Listo"];
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {items.map((it, i) => (
        <div key={it} className="flex-1">
          <div className={`h-2 rounded-full transition-colors ${i + 1 <= paso ? "bg-barber-red" : "bg-gray-200"}`} />
          <span className={`hidden sm:block text-xs mt-0.5 ${i + 1 <= paso ? "text-barber-ink font-semibold" : "text-barber-gray"}`}>{it}</span>
        </div>
      ))}
    </div>
  );
}

function Resumen({ barbero, plan, fecha, hora }) {
  const duracionReal = Number(plan.duracion) || barbero.horario?.duracionTurnoMin || 30;
  return (
    <div className="rounded-lg border border-black/10 p-4 text-left text-sm space-y-1">
      <p><b>Barbero:</b> {barbero.nombre} — {barbero.local}</p>
      <p><b>Plan:</b> {plan.nombre} ({plan.servicios.join(", ")})</p>
      <p className="capitalize"><b>Fecha:</b> {etiquetaFecha(fecha)}</p>
      <p><b>Hora:</b> {hora12(hora)} ({duracionReal} min)</p>
      <p><b>Valor:</b> {formatoCOP(plan.precio)}</p>
    </div>
  );
}

// Botones de horario agrupados por jornada
function GrupoSlots({ titulo, lista, hora, setHora }) {
  if (lista.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-barber-ink mb-2">{titulo}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {lista.map((s) => (
          <button
            key={s}
            onClick={() => setHora(s)}
            className={`rounded-lg border min-h-[48px] py-2.5 text-sm font-semibold transition active:scale-95 ${
              hora === s
                ? "bg-barber-blue text-white border-barber-blue"
                : "border-gray-300 hover:border-barber-blue active:bg-gray-50"
            }`}
          >
            {hora12(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

// 'HH:mm' (24h) -> '2:00 p.m.'
const hora12 = formatearHora12;

// Fecha 'YYYY-MM-DD' -> 'Lunes, 1 de septiembre'. Con relativo=true antepone Hoy/Mañana.
function etiquetaFecha(fechaStr, relativo = true) {
  if (!fechaStr) return "";
  const [y, mo, d] = fechaStr.split("-").map(Number);
  const fecha = new Date(y, mo - 1, d);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
  const legible = fecha.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const cap = legible.charAt(0).toUpperCase() + legible.slice(1);
  if (relativo && fecha.getTime() === hoy.getTime()) return `Hoy · ${cap}`;
  if (relativo && fecha.getTime() === manana.getTime()) return `Mañana · ${cap}`;
  return cap;
}

// Accesos rápidos: días laborales del barbero dentro de su ventana de reserva
// (hasta diasAnticipacionMax días desde hoy). No incluye días pasados ni no laborales.
function chipsFecha(diasLaborales = [1, 2, 3, 4, 5, 6], diasAnticipacionMax = 7) {
  const out = [];
  const base = new Date();
  // Mostrar días disponibles dentro de la ventana (máximo 14 chips para no saturar)
  const limite = Math.min(Number(diasAnticipacionMax) || 7, 14);
  for (let i = 0; i <= limite; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (!diasLaborales.includes(d.getDay())) continue; // solo días habilitados
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dia = d.toLocaleDateString("es-CO", { weekday: "long" });
    out.push({ valor, label: dia.charAt(0).toUpperCase() + dia.slice(1) });
  }
  return out;
}

function DatosPago({ datosPago = {}, metodo }) {
  // Pago por QR: mostramos la imagen que cargó el barbero.
  if (metodo === "qr") {
    if (!datosPago.qrImagen) {
      return <p className="text-sm text-barber-gray">El barbero aún no cargó un código QR. Escribile por WhatsApp para pedirle los datos de pago.</p>;
    }
    return (
      <div className="text-sm">
        <p className="font-medium mb-2">Escaneá este código QR para pagar:</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={datosPago.qrImagen} alt="Código QR de pago" className="w-48 h-48 object-contain border rounded-lg bg-white p-2" />
      </div>
    );
  }

  // Pago por número/cuenta: mostramos el dato con botón para copiar.
  const cuentas = {
    nequi: { label: "Nequi", valor: datosPago.nequi },
    daviplata: { label: "Daviplata", valor: datosPago.daviplata },
    cuenta: { label: "Cuenta bancaria", valor: datosPago.cuenta },
  };
  const item = cuentas[metodo];
  if (!item) return null;
  if (!item.valor) {
    return <p className="text-sm text-barber-gray">El barbero aún no cargó su {item.label}. Escribile por WhatsApp para pedirle los datos de pago.</p>;
  }
  return (
    <div className="text-sm">
      <p className="text-barber-gray mb-1">{item.label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-base sm:text-lg tracking-wide select-all break-all">{item.valor}</span>
        <CopiarBtn texto={item.valor} />
      </div>
    </div>
  );
}

function CopiarBtn({ texto }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Fallback para navegadores sin permiso de portapapeles.
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }
  return (
    <button
      type="button"
      onClick={copiar}
      className={`text-xs font-semibold py-1 px-2.5 rounded-lg border shrink-0 transition ${copiado ? "bg-green-600 text-white border-green-600" : "border-gray-300 hover:border-barber-red"}`}
    >
      {copiado ? "¡Copiado!" : "Copiar"}
    </button>
  );
}
