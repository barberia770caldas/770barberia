"use client";

import { useCallback, useEffect, useState } from "react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Convierte la clave pública VAPID (base64url) al Uint8Array que exige el
// navegador en pushManager.subscribe.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Opt-in del cliente para recibir el recordatorio de su cita el mismo día, a la
// hora en que abre el barbero. Requiere que el cliente ya tenga su celular
// identificado (se pasa por prop). A diferencia del barbero, no auto-activa:
// el permiso se pide solo al tocar "Activar" (más confiable y menos intrusivo).
export default function ActivarRecordatoriosCliente({ celular }) {
  const [estado, setEstado] = useState("cargando"); // cargando|no-soportado|activo|inactivo|denegado
  const [ocupado, setOcupado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensajePrueba, setMensajePrueba] = useState(null); // { ok: boolean, texto: string }

  const soportado =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC;

  // Estado inicial: ¿este dispositivo ya está suscrito?
  // Si ya hay suscripción, re-sincroniza con el servidor preventivamente
  // (cubre el caso en que el navegador renovó el endpoint silenciosamente).
  useEffect(() => {
    if (!soportado) { setEstado("no-soportado"); return; }
    if (Notification.permission === "denied") { setEstado("denegado"); return; }
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setEstado("activo");
          const cel = (celular || "").replace(/\D/g, "");
          if (cel.length >= 10) {
            fetch("/api/push/cliente/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subscription: sub.toJSON(),
                celular,
                userAgent: navigator.userAgent,
              }),
            }).catch(() => {});
          }
        } else {
          setEstado("inactivo");
        }
      })
      .catch(() => setEstado("inactivo"));
    // `soportado` se deriva de constantes/APIs del navegador (estable entre
    // renders); solo re-sincronizamos cuando cambia el celular.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celular]);

  const activar = useCallback(async () => {
    const cel = (celular || "").replace(/\D/g, "");
    if (cel.length < 10) return;
    setOcupado(true);
    try {
      let permiso = Notification.permission;
      if (permiso === "default") permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "inactivo");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }
      const res = await fetch("/api/push/cliente/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), celular, userAgent: navigator.userAgent }),
      });
      if (!res.ok) throw new Error("No se pudo registrar");
      setEstado("activo");
    } catch {
      alert("No se pudieron activar los recordatorios. Intentá de nuevo.");
      setEstado((p) => (p === "activo" ? p : "inactivo"));
    } finally {
      setOcupado(false);
    }
  }, [celular]);

  async function desactivar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/cliente/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } catch {
      // si falla, dejamos el estado como estaba
    } finally {
      setOcupado(false);
    }
  }

  // Envía una notificación de prueba a este celular para que el cliente
  // compruebe (idealmente con la pantalla bloqueada) que los recordatorios
  // le van a llegar. ok() de @/lib/api devuelve el data plano -> data.ok.
  async function enviarPrueba() {
    setProbando(true);
    setMensajePrueba(null);
    try {
      const res = await fetch("/api/push/cliente/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ celular }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMensajePrueba({ ok: true, texto: data.mensaje || "Notificación enviada." });
      } else {
        setMensajePrueba({ ok: false, texto: data.error || "No se pudo enviar la prueba." });
      }
    } catch {
      setMensajePrueba({ ok: false, texto: "No se pudo enviar la prueba. Intentá de nuevo." });
    } finally {
      setProbando(false);
    }
  }

  // No mostramos nada mientras carga, si el navegador no soporta push, o si aún
  // no hay un celular válido con el cual asociar la suscripción.
  if (estado === "cargando" || estado === "no-soportado") return null;
  if ((celular || "").replace(/\D/g, "").length < 10) return null;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>🔔</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Recordatorio de tu cita</h3>
          {estado === "denegado" && (
            <p className="text-xs text-barber-gray mt-0.5">
              Están bloqueadas. Habilitalas desde los ajustes del navegador para este sitio.
            </p>
          )}
          {estado === "inactivo" && (
            <p className="text-xs text-barber-gray mt-0.5">
              Te avisamos el día de tu cita, apenas abra la barbería. En iPhone, instalá primero
              la app y abrila desde el ícono.
            </p>
          )}
          {estado === "activo" && (
            <p className="text-xs text-green-700 mt-0.5">Activado en este dispositivo ✓</p>
          )}
          {estado === "activo" && mensajePrueba && (
            <p className={`text-xs mt-1 ${mensajePrueba.ok ? "text-green-700" : "text-red-600"}`}>
              {mensajePrueba.texto}
            </p>
          )}
        </div>
        {estado === "inactivo" && (
          <button onClick={activar} disabled={ocupado} className="btn-primary text-sm py-1.5 px-4 shrink-0">
            {ocupado ? "Activando…" : "Activar"}
          </button>
        )}
      </div>
      {/* Acciones del estado activo en su propia fila: se envuelven en pantallas
          estrechas para que nunca se salgan de la tarjeta. */}
      {estado === "activo" && (
        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          <button onClick={enviarPrueba} disabled={probando} className="btn-outline text-sm py-1.5 px-4">
            {probando ? "Enviando…" : "🔔 Probar"}
          </button>
          <button onClick={desactivar} disabled={ocupado} className="btn-outline text-sm py-1.5 px-4">
            {ocupado ? "…" : "Desactivar"}
          </button>
        </div>
      )}
    </div>
  );
}
