import { dbConnect } from "@/lib/db";
import PushSubscription from "@/models/PushSubscription";
import { ok, fail, handler } from "@/lib/api";

// POST /api/push/resubscribe
// Llamado por el service worker cuando el navegador renueva la suscripción push
// internamente (evento pushsubscriptionchange). Actualiza el endpoint en BD
// para que las notificaciones sigan llegando al dispositivo. Si no se encuentra
// la suscripción vieja, crea una nueva (caso de primer ciclo sin oldEndpoint).
export const POST = handler(async (req) => {
  await dbConnect();

  const { oldEndpoint, newSubscription } = await req.json();

  if (
    !newSubscription?.endpoint ||
    !newSubscription?.keys?.p256dh ||
    !newSubscription?.keys?.auth
  ) {
    return fail("Suscripción inválida", 400);
  }

  if (oldEndpoint) {
    // Actualizar la suscripción existente con el nuevo endpoint y claves.
    const existente = await PushSubscription.findOneAndUpdate(
      { endpoint: oldEndpoint },
      {
        $set: {
          endpoint: newSubscription.endpoint,
          keys: {
            p256dh: newSubscription.keys.p256dh,
            auth: newSubscription.keys.auth,
          },
        },
      },
      { new: true }
    );

    if (existente) {
      return ok({ ok: true, actualizada: true });
    }
  }

  // No encontramos la vieja (ya la borró el limpiador de 404/410, o es nueva).
  // Creamos una nueva con los datos que tenemos. El ownerRole quedará vacío y
  // se asociará cuando el usuario vuelva a abrir la app y se re-suscriba desde
  // el componente ActivarNotificaciones (que sí tiene la sesión).
  // Para no crear huérfanas, solo actualizamos si ya existía por endpoint nuevo.
  const yaExiste = await PushSubscription.findOne({
    endpoint: newSubscription.endpoint,
  });
  if (yaExiste) {
    // Ya está registrada con el nuevo endpoint, todo bien.
    return ok({ ok: true, yaExistia: true });
  }

  // Si no hay oldEndpoint ni match, no podemos saber a quién pertenece.
  // El componente del frontend la re-creará con los datos del dueño.
  return ok({ ok: true, pendiente: true });
});
