"use client";

import { useEffect, useRef, useState } from "react";
import { fechaLocalHoy, esFechaPasada, formatearHora12 } from "@/lib/disponibilidad";
import { esMovil } from "@/lib/dispositivo";

export default function CitaManual({ planes, onCreada, prefill }) {
  const activos = (planes || []).filter((p) => p.activo);
  const [clienteNombre, setNombre] = useState("");
  const [clienteCelular, setCelular] = useState("");
  const [planKey, setPlanKey] = useState(activos[0]?.key || "");
  const [fecha, setFecha] = useState(prefill?.fecha || fechaLocalHoy());
  const [slots, setSlots] = useState([]);
  const [hora, setHora] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [soportaContactos, setSoportaContactos] = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  const timeoutBusqueda = useRef(null);
  const contenedorRef = useRef(null);
  const btnCrearRef = useRef(null);
  // Hora que llega preseleccionada desde el Calendario. Se aplica en cuanto
  // cargan los slots del día/plan, y solo si sigue disponible para ese plan.
  const horaDeseada = useRef(prefill?.hora || "");

  // Detectar soporte para Contact Picker API nativa (Android)
  useEffect(() => {
    if (typeof window !== "undefined" && "contacts" in navigator && "ContactsManager" in window) {
      setSoportaContactos(true);
    }
  }, []);

  // Cerrar sugerencias al hacer click afuera
  useEffect(() => {
    function handleClickAfuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setSugerencias([]);
      }
    }
    document.addEventListener("mousedown", handleClickAfuera);
    return () => document.removeEventListener("mousedown", handleClickAfuera);
  }, []);

  // Abre la agenda telefónica del celular
  async function elegirDeContactos() {
    try {
      const props = ["name", "tel"];
      const opts = { multiple: false };
      const contactos = await navigator.contacts.select(props, opts);
      if (contactos && contactos.length > 0) {
        const c = contactos[0];
        if (c.name?.[0]) setNombre(c.name[0]);
        if (c.tel?.[0]) {
          const digitos = c.tel[0].replace(/\D/g, "");
          setCelular(digitos.slice(-10));
        }
        setError("");
        setSugerencias([]);
      }
    } catch (err) {
      // El usuario canceló la selección o cerró la agenda
    }
  }

  // Buscar clientes anteriores de la barbería
  function buscarSugerencias(termino) {
    if (timeoutBusqueda.current) clearTimeout(timeoutBusqueda.current);
    const q = (termino || "").trim();
    if (q.length < 2) {
      setSugerencias([]);
      return;
    }
    timeoutBusqueda.current = setTimeout(() => {
      fetch(`/api/barbero/clientes?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setSugerencias(d.clientes || []))
        .catch(() => setSugerencias([]));
    }, 200);
  }

  function seleccionarSugerencia(cliente) {
    setNombre(cliente.nombre || "");
    if (cliente.celular) setCelular(cliente.celular);
    setSugerencias([]);
  }

  // Al elegir una hora, acercar el botón "Crear cita" para evitar scroll.
  function seleccionarHora(s) {
    setHora(s);
    requestAnimationFrame(() =>
      btnCrearRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  }

  useEffect(() => {
    if (!planKey || !fecha) return;
    // Reutilizamos disponibilidad: necesitamos el id del barbero -> perfil
    fetch("/api/barbero/perfil")
      .then((r) => r.json())
      .then((d) => d.barbero?.id)
      .then((id) =>
        fetch(`/api/barberos/${id}/disponibilidad?fecha=${fecha}&plan=${planKey}`)
          .then((r) => r.json())
          .then((x) => {
            const lista = x.slots || [];
            setSlots(lista);
            // Si vino una hora deseada desde el Calendario
            const h = horaDeseada.current;
            if (h) {
              horaDeseada.current = "";
              if (lista.includes(h)) {
                seleccionarHora(h);
                setError("");
              } else {
                setError(`La hora ${formatearHora12(h)} se cruza con otra cita o no alcanza para este servicio; elegí otra hora.`);
              }
              return;
            }
            // Si el barbero ya tenía una hora elegida y cambió de plan, conservarla si cabe
            setHora((prevHora) => {
              if (prevHora && lista.includes(prevHora)) {
                setError("");
                return prevHora;
              }
              if (prevHora && !lista.includes(prevHora)) {
                setError(`La hora ${formatearHora12(prevHora)} no está disponible para la duración de este servicio.`);
              }
              return "";
            });
          })
      );
  }, [planKey, fecha]);

  async function crear(e) {
    e.preventDefault();
    setError(""); setMsg(""); setEnviando(true);
    try {
      const res = await fetch("/api/citas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteNombre, clienteCelular, plan: planKey, fecha, horaInicio: hora, plano: !esMovil() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      // Si se registró celular, abrimos WhatsApp con la confirmación para el
      // cliente (así ambos quedan con el contacto guardado).
      if (d.linkWhatsApp) window.open(d.linkWhatsApp, "_blank");
      setMsg(
        d.linkWhatsApp
          ? "Cita creada y confirmada. Abrimos WhatsApp para enviarle la confirmación al cliente."
          : "Cita manual creada y confirmada."
      );
      setNombre(""); setCelular(""); setHora("");
      onCreada?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (activos.length === 0)
    return <p className="text-barber-gray">Aún no tienes planes configurados por el administrador.</p>;

  return (
    <form onSubmit={crear} className="card p-6 max-w-lg space-y-3">
      <h2 className="font-display text-xl">Agendar cliente presencial</h2>
      <p className="text-sm text-barber-gray">Para clientes sin celular o que llegan al local. La cita queda confirmada.</p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {msg && <p className="text-green-700 text-sm">{msg}</p>}

      <div ref={contenedorRef} className="relative">
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Nombre del cliente</label>
          {soportaContactos && (
            <button
              type="button"
              onClick={elegirDeContactos}
              className="inline-flex items-center gap-1 text-xs font-semibold text-barber-red hover:underline py-0.5 px-1 rounded active:bg-red-50"
            >
              <span>📇 + Contactos del celular</span>
            </button>
          )}
        </div>
        <input
          className="input"
          value={clienteNombre}
          onChange={(e) => {
            setNombre(e.target.value);
            buscarSugerencias(e.target.value);
          }}
          onFocus={() => {
            if (clienteNombre.length >= 2) buscarSugerencias(clienteNombre);
          }}
          placeholder="Ej: Juan Pérez"
          required
        />

        {/* Menú de sugerencias de clientes anteriores */}
        {sugerencias.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden divide-y divide-gray-100 animate-fade-down">
            <div className="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-barber-gray flex justify-between items-center">
              <span>Clientes anteriores de la barbería</span>
              <button
                type="button"
                onClick={() => setSugerencias([])}
                className="text-gray-400 hover:text-gray-700 text-xs px-1"
              >
                ✕
              </button>
            </div>
            {sugerencias.map((item, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => seleccionarSugerencia(item)}
                className="w-full px-3 py-2 text-left hover:bg-red-50/70 flex items-center justify-between text-sm transition"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-barber-ink/5 text-barber-ink grid place-items-center font-bold text-xs">
                    {item.nombre?.[0]?.toUpperCase() || "C"}
                  </span>
                  <span className="font-semibold text-barber-ink">{item.nombre}</span>
                </div>
                {item.celular && (
                  <span className="text-xs text-barber-gray font-mono">{item.celular}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">Celular (opcional)</label>
        <div className="flex gap-2 items-center">
          <input
            type="tel"
            className="input flex-1"
            value={clienteCelular}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 10);
              setCelular(val);
              if (val.length >= 3) buscarSugerencias(val);
            }}
            placeholder="Ej: 3001234567"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
          />
          {soportaContactos && (
            <button
              type="button"
              onClick={elegirDeContactos}
              title="Cargar de los contactos de tu celular"
              className="btn-outline shrink-0 text-xs py-2 px-3 flex items-center gap-1 font-semibold hover:border-barber-red hover:text-barber-red"
            >
              <span>📇 + Contacto</span>
            </button>
          )}
        </div>
      </div>
      <div>
        <label className="label">Plan</label>
        <select className="input" value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
          {activos.map((p) => <option key={p.key} value={p.key}>{p.nombre} ({p.duracion} min)</option>)}
        </select>
      </div>
      <div>
        <label className="label">Fecha</label>
        <input type="date" className="input" min={fechaLocalHoy()} value={fecha} onChange={(e) => {
          const v = e.target.value;
          if (esFechaPasada(v)) { setError("No puedes agendar en una fecha que ya pasó."); return; }
          setError(""); setFecha(v);
        }} />
      </div>
      <div>
        <label className="label">Hora</label>
        {slots.length === 0 ? (
          <p className="text-sm text-barber-gray">No hay horarios libres ese día.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {slots.map((s) => (
              <button type="button" key={s} onClick={() => seleccionarHora(s)}
                className={`rounded-lg border min-h-[44px] py-2 text-sm font-semibold transition active:scale-95 ${hora === s ? "bg-barber-blue text-white border-barber-blue" : "border-gray-300 hover:border-barber-blue"}`}>
                {formatearHora12(s)}
              </button>
            ))}
          </div>
        )}
      </div>
      <button ref={btnCrearRef} className="btn-primary w-full" disabled={enviando || !hora}>{enviando ? "Creando…" : "Crear cita"}</button>
    </form>
  );
}
