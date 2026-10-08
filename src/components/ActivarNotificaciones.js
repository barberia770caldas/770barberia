"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
// Marca para no volver a lanzar la solicitud automática de permiso en cada
// apertura si el usuario la cerró sin decidir (evita ser insistentes).
const AUTO_KEY = "push-auto-intentado";

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

// ¿La web está abierta como app instalada (PWA en pantalla completa)?
function esAppInstalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

// Botón para activar/desactivar las notificaciones push en este dispositivo.
// Cuando la web se abre como app instalada, intenta activarlas por defecto:
// si ya había permiso, se suscribe solo; si no, pide el permiso al abrir.
// `descripcion` personaliza el texto según quién lo use (barbero/admin).
export default function ActivarNotificaciones({ descripcion, permitirProbar = false }) {
  const [estado, setEstado] = useState("cargando"); // cargando | no-soportado | activo | inactivo | denegado
  const [ocupado, setOcupado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensajePrueba, setMensajePrueba] = useState(null); // { ok: boolean, texto: string }
  const autoHecho = useRef(false);

  const soportado =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC;

  // Registra la suscripción en el servidor. `pedirPermiso` decide si se muestra
  // el diálogo del navegador (activación manual o auto en modo app).
  const suscribir = useCallback(
    async ({ pedirPermiso, silencioso = false } = {}) => {
      setOcupado(true);
      try {
        let permiso = Notification.permission;
        if (permiso === "default" && pedirPermiso) {
          permiso = await Notification.requestPermission();
        }
        if (permiso !== "granted") {
          setEstado(permiso === "denied" ? "denegado" : "inactivo");
          return false;
        }
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          });
        }
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
        });
        if (!res.ok) throw new Error("No se pudo registrar");
        setEstado("activo");
        return true;
      } catch (e) {
        if (!silencioso) alert("No se pudieron activar las notificaciones. Intentá de nuevo.");
        setEstado((prev) => (prev === "activo" ? prev : "inactivo"));
        return false;
      } finally {
        setOcupado(false);
      }
    },
    []
  );

  // Estado inicial: ¿ya está suscrito este dispositivo?
  // Si ya hay una suscripción activa, la re-sincroniza con el servidor para
  // cubrir el caso en que iOS/Android renovó el endpoint silenciosamente.
  useEffect(() => {
    if (!soportado) {
      setEstado("no-soportado");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("denegado");
      return;
    }
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setEstado("activo");
          // Re-sync preventivo: asegurar que el servidor tiene este endpoint.
          fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              userAgent: navigator.userAgent,
            }),
          }).catch(() => {});
        } else {
          setEstado("inactivo");
        }
      })
      .catch(() => setEstado("inactivo"));
  }, [soportado]);

  // Auto-activación al abrir como app instalada.
  useEffect(() => {
    if (estado !== "inactivo" || autoHecho.current) return;
    if (!esAppInstalada()) return;
    autoHecho.current = true;

    // Si el permiso ya estaba concedido, nos suscribimos en silencio.
    if (Notification.permission === "granted") {
      suscribir({ pedirPermiso: false, silencioso: true });
      return;
    }
    // Si aún no lo decidió, pedimos el permiso automáticamente una sola vez.
    if (Notification.permission === "default") {
      let intentado = false;
      try {
        intentado = localStorage.getItem(AUTO_KEY) === "1";
      } catch {}
      if (intentado) return;
      try {
        localStorage.setItem(AUTO_KEY, "1");
      } catch {}
      suscribir({ pedirPermiso: true, silencioso: true });
    }
  }, [estado, suscribir]);

  async function desactivar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
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

  // Envía una notificación de prueba a este mismo dispositivo para verificar
  // que la cadena completa funciona. ok() de @/lib/api devuelve el data plano.
  async function enviarPrueba() {
    setProbando(true);
    setMensajePrueba(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setMensajePrueba({ ok: false, texto: "No hay una suscripción activa en este dispositivo." });
        return;
      }
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
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

  if (estado === "cargando") return null;

  const texto =
    descripcion ||
    "Recibí un aviso en este dispositivo cuando llegue algo nuevo, aunque tengas la app cerrada.";


  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>🔔</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Notificaciones</h3>
          {estado === "no-soportado" && (
            <p className="text-xs text-barber-gray mt-0.5">
              Este navegador no admite notificaciones. En iPhone, instalá primero la app
              (Compartir → “Agregar a inicio”) y abrila desde el ícono.
            </p>
          )}
          {estado === "denegado" && (
            <p className="text-xs text-barber-gray mt-0.5">
              Están bloqueadas. Habilitalas desde los ajustes del navegador para este sitio.
            </p>
          )}
          {estado === "inactivo" && (
            <p className="text-xs text-barber-gray mt-0.5">{texto}</p>
          )}
          {estado === "activo" && (
            <p className="text-xs text-green-700 mt-0.5">Activadas en este dispositivo ✓</p>
          )}
          {estado === "activo" && mensajePrueba && (
            <p className={`text-xs mt-1 ${mensajePrueba.ok ? "text-green-700" : "text-red-600"}`}>
              {mensajePrueba.texto}
            </p>
          )}
        </div>
        {estado === "inactivo" && (
          <button
            onClick={() => suscribir({ pedirPermiso: true })}
            disabled={ocupado}
            className="btn-primary text-sm py-1.5 px-4 shrink-0"
          >
            {ocupado ? "Activando…" : "Activar"}
          </button>
        )}
        {estado === "activo" && !permitirProbar && (
          <button onClick={desactivar} disabled={ocupado} className="btn-outline text-sm py-1.5 px-4 shrink-0">
            {ocupado ? "…" : "Desactivar"}
          </button>
        )}
      </div>
      {/* Con botón de prueba (barbero): acciones en fila propia que se envuelve
          en pantallas estrechas para que no se salgan de la tarjeta. */}
      {estado === "activo" && permitirProbar && (
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
