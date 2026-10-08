import { dbConnect } from "@/lib/db";
import { ok, fail, handler } from "@/lib/api";
import { enviarPush } from "@/lib/push";
import { normalizarCelular } from "@/lib/whatsapp";

// POST /api/push/cliente/test  body: { celular }
// Envía una notificación de prueba a los dispositivos del cliente (identificado
// por celular). No exige sesión: igual que el resto del flujo del cliente, se
// identifica por su celular. Sirve para que compruebe, con la pantalla bloqueada,
// que el recordatorio del día de su cita le va a llegar.
export const POST = handler(async (req) => {
  await dbConnect();
  const { celular } = await req.json();

  const cel = normalizarCelular(celular);
  if (!cel || cel.replace(/\D/g, "").length < 10) return fail("Celular inválido", 400);

  const { enviadas, motivo } = await enviarPush(
    { ownerRole: "cliente", clienteCelular: cel },
    {
      title: "CitasBarber 💈",
      body: "¡Tus recordatorios funcionan! Así te avisaremos el día de tu cita.",
      url: "/mis-citas",
      tag: `test-${Date.now()}`,
    }
  );

  if (motivo === "sin-config")
    return fail("Notificaciones no configuradas en el servidor (faltan claves VAPID)", 500);
  if (enviadas === 0)
    return fail("No encontramos un dispositivo activo. Activá los recordatorios en Mis Citas e intentá de nuevo.", 404);

  return ok({ ok: true, enviadas, mensaje: "Notificación enviada. Debería aparecer en unos segundos." });
});
