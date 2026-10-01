import { dbConnect } from "@/lib/db";
import PushSubscription from "@/models/PushSubscription";
import { ok, fail, handler } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { pushHabilitado } from "@/lib/push";
import { ROLES } from "@/lib/constants";
import webpush from "web-push";

// POST /api/push/test  -> envía una notificación de prueba al dispositivo actual.
// Solo barbero/admin autenticados. Sirve para verificar que la cadena completa
// funciona: SW registrado, suscripción en BD, VAPID configurado, entrega.
export const POST = handler(async (req) => {
  await dbConnect();
  const session = getSession();
  if (!session) return fail("No autenticado", 401);
  if (![ROLES.ADMIN, ROLES.BARBERO].includes(session.role))
    return fail("No autorizado", 403);
  if (!pushHabilitado())
    return fail("Notificaciones no configuradas en el servidor (faltan claves VAPID)", 500);

  const { endpoint } = await req.json();
  if (!endpoint) return fail("Falta el endpoint de la suscripción", 400);

  const sub = await PushSubscription.findOne({ endpoint }).lean();
  if (!sub) return fail("Suscripción no encontrada en la BD. Desactivá y volvé a activar las notificaciones.", 404);

  const payload = JSON.stringify({
    title: "🔔 Notificación de prueba",
    body: "¡Las notificaciones funcionan! Este dispositivo está correctamente configurado.",
    url: session.role === ROLES.BARBERO ? "/barbero/panel" : "/admin/panel",
    tag: "push-test",
  });

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      payload
    );
    return ok({ ok: true, mensaje: "Notificación enviada. Debería aparecer en unos segundos." });
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ endpoint });
      return fail(
        `La suscripción ya no es válida (${err.statusCode}). Desactivá y volvé a activar las notificaciones.`,
        410
      );
    }
    console.error("Push test falló:", err.statusCode, err.body || err.message);
    return fail(`Error al enviar: ${err.statusCode || err.message}`, 500);
  }
});
