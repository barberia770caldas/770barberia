"use client";

import { useEffect, useState, useCallback } from "react";
import EstadoBadge from "@/components/EstadoBadge";
import { WhatsAppIcon, CalendarioIcon } from "@/components/Icons";
import ModalCitaConfirmada from "./ModalCitaConfirmada";
import BotonCalendarioCita from "./BotonCalendarioCita";
import { formatoCOP, METODOS_PAGO_LABEL } from "@/lib/constants";
import { fechaLocalHoy, formatearHora12, minutosActualesColombia, hhmmAMin } from "@/lib/disponibilidad";
import { esMovil } from "@/lib/dispositivo";
import { useDialog } from "@/components/DialogProvider";
import { generarIcsDia, descargarIcs } from "@/lib/calendario";

export default function CitasLista({ onCambio }) {
  const { pedirMotivo } = useDialog();
  const [fecha, setFecha] = useState(fechaLocalHoy());
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [comprobante, setComprobante] = useState(null); // {url}
  const [citaConfirmadaParaModal, setCitaConfirmadaParaModal] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    fetch(`/api/citas?fecha=${fecha}`)
      .then((r) => r.json())
      .then((d) => setCitas(d.citas || []))
      .finally(() => setCargando(false));
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

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
      const motivo = await pedirMotivo({
        titulo: "Marcar como No asistió",
        mensaje: "¿El cliente no se presentó a su cita? La cita cambiará de estado y no sumará a los cobros del resumen.",
        placeholder: "Nota interna (opcional)",
        confirmarLabel: "Sí, marcar No asistió",
        cancelarLabel: "Volver",
        peligro: true,
      });
      if (motivo === null) return;
      extra.motivo = motivo;
    }
    const res = await fetch(`/api/citas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, plano: !esMovil(), ...extra }),
    });
    const d = await res.json();
    if (!res.ok) return alert(d.error);
    if (d.linkWhatsApp) window.open(d.linkWhatsApp, "_blank");

    if (accion === "confirmar") {
      const citaAceptada = citas.find((c) => (c.id || c._id) === id);
      if (citaAceptada) {
        setCitaConfirmadaParaModal({ ...citaAceptada, estado: "confirmada" });
      }
    }

    cargar();
    onCambio?.();
  }

  async function verComprobante(id) {
    const res = await fetch(`/api/citas/${id}`);
    const d = await res.json();
    if (d.cita?.comprobante) setComprobante(d.cita.comprobante);
    else alert("Esta cita no tiene comprobante.");
  }

  const citasConfirmadas = citas.filter((c) => c.estado === "confirmada");

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <input type="date" className="input max-w-[180px]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <button className="btn-outline text-sm py-1.5" onClick={() => setFecha(fechaLocalHoy())}>Hoy</button>
        </div>

        {citasConfirmadas.length >= 2 && (
          <button
            type="button"
            className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 border-dashed border-barber-gold text-barber-gold hover:bg-barber-gold/10 font-medium transition-colors"
            onClick={() => descargarIcs(`citas_dia_${fecha}`, generarIcsDia(citasConfirmadas))}
            title="Descargar todas las citas confirmadas de este día en un solo archivo (.ics)"
          >
            <CalendarioIcon className="w-3.5 h-3.5" />
            <span>Guardar en calendario</span>
          </button>
        )}
      </div>

      {cargando ? (
        <p className="text-barber-gray">Cargando…</p>
      ) : citas.length === 0 ? (
        <div className="card p-8 text-center text-barber-gray">No hay citas para este día.</div>
      ) : (
        <div className="space-y-3">
          {citas.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-display text-lg">{formatearHora12(c.horaInicio)} - {formatearHora12(c.horaFin)} · {c.clienteNombre}</p>
                  <p className="text-sm text-barber-gray">
                    {c.planSnapshot?.nombre} · {formatoCOP(c.planSnapshot?.precio)}
                    {c.metodoPago ? ` · ${METODOS_PAGO_LABEL[c.metodoPago] || c.metodoPago}` : ""}
                    {c.esManual ? " · Manual" : ""}
                  </p>
                  {c.pagoAnticipo?.requerido && (
                    <div className="mt-1">
                      <span className="badge bg-amber-100 text-amber-900 border border-amber-300/80 text-[11px] font-semibold">
                        Anticipo: {formatoCOP(c.pagoAnticipo.monto)} · Verificar en WhatsApp
                      </span>
                    </div>
                  )}
                </div>
                <EstadoBadge estado={c.estado} />
              </div>

              {(() => {
                const ahoraMin = minutosActualesColombia();
                const esFutura = hhmmAMin(c.horaInicio) > ahoraMin;
                return (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.estado === "solicitada" && (
                      <>
                        <button className="btn-blue text-sm py-1.5" onClick={() => accion(c.id, "confirmar")}>Aceptar</button>
                        <button className="btn-outline text-sm py-1.5" onClick={() => accion(c.id, "rechazar")}>Rechazar</button>
                      </>
                    )}
                    {c.estado === "confirmada" && (
                      <>
                        {!esFutura && (
                          <button className="btn-dark text-sm py-1.5" onClick={() => accion(c.id, "completar")}>Marcar completada</button>
                        )}
                        <button className="btn-outline text-sm py-1.5" onClick={() => accion(c.id, "cancelar")}>Cancelar Cita</button>
                        <BotonCalendarioCita cita={c} />
                      </>
                    )}
                    {c.estado === "completada" && (
                      <button className="btn-outline text-rose-700 border-rose-300 hover:bg-rose-50 text-sm py-1.5" onClick={() => accion(c.id, "no-asistio")}>No asistió</button>
                    )}
                    {c.estado === "no_asistio" && (
                      <button className="btn-outline text-sm py-1.5" onClick={() => accion(c.id, "completar")}>Marcar completada</button>
                    )}
                    {c.pagoAnticipo?.requerido && c.pagoAnticipo?.comprobante && (
                      <button className="btn-outline text-sm py-1.5" onClick={() => verComprobante(c.id)}>Ver comprobante</button>
                    )}
                    {c.clienteCelular && (
                      <a className="btn-wa text-sm py-1.5" href={`https://wa.me/${c.clienteCelular.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                        <WhatsAppIcon className="w-4 h-4" /> WhatsApp
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {comprobante && (
        <div className="fixed inset-0 bg-black/70 grid place-items-center p-4 z-50" onClick={() => setComprobante(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={comprobante} alt="Comprobante" className="max-h-[85vh] rounded-lg" />
        </div>
      )}

      {citaConfirmadaParaModal && (
        <ModalCitaConfirmada
          cita={citaConfirmadaParaModal}
          citasConfirmadasDelDia={citas.filter(
            (c) => c.estado === "confirmada" || c.id === citaConfirmadaParaModal.id
          )}
          onCerrar={() => setCitaConfirmadaParaModal(null)}
        />
      )}
    </div>
  );
}
