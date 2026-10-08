import crypto from "crypto";
import { dbConnect } from "@/lib/db";
import { ok, fail, handler } from "@/lib/api";
import { recordarCitasSinConfirmar, recordarClientesDelDia } from "@/lib/recordatorios";

// No cachear: cada llamada debe consultar la BD en el momento.
export const dynamic = "force-dynamic";

// GET /api/cron/recordatorios
// Respaldo diario (Vercel Cron, ver vercel.json) o cron externo cada pocos
// minutos. Delega en la lib de recordatorios: avisa al barbero de las citas por
// confirmar inminentes y al cliente del día de su cita. El día a día lo cubren
// además los disparos oportunos al abrir el panel del barbero / Mis Citas.
//
// Se protege con el header  Authorization: Bearer <CRON_SECRET>  (mismo formato
// que envía Vercel Cron), para que nadie más pueda dispararlo.
export const GET = handler(async (req) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return fail("CRON_SECRET no configurado", 500);

  const auth = req.headers.get("authorization") || "";
  const esperado = `Bearer ${secreto}`;
  const hashAuth = crypto.createHash("sha256").update(auth).digest();
  const hashEsperado = crypto.createHash("sha256").update(esperado).digest();
  if (!crypto.timingSafeEqual(hashAuth, hashEsperado)) {
    return fail("No autorizado", 401);
  }

  await dbConnect();

  const avisoBarbero = await recordarCitasSinConfirmar();
  const avisoCliente = await recordarClientesDelDia();

  return ok({
    revisadas: avisoBarbero.revisadas,
    notificadas: avisoBarbero.notificadas,
    recordadasCliente: avisoCliente.recordadas,
  });
});
