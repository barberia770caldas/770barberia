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
  }, [soportado, celular]);

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

  // No mostramos nada mientras carga, si el navegador no soporta push, o si aún
  // no hay un celular válido con el cual asociar la suscripción.
  if (estado === "cargando" || estado === "no-soportado") return null;
  if ((celular || "").replace(/\D/g, "").length < 10) return null;

  return (
    <div className="card p-4 flex items-start gap-3">
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
      </div>
      {estado === "inactivo" && (
        <button onClick={activar} disabled={ocupado} className="btn-primary text-sm py-1.5 px-4 shrink-0">
          {ocupado ? "Activando…" : "Activar"}
        </button>
      )}
      {estado === "activo" && (
        <button onClick={desactivar} disabled={ocupado} className="btn-outline text-sm py-1.5 px-4 shrink-0">
          {ocupado ? "…" : "Desactivar"}
        </button>
      )}
    </div>
  );
}
