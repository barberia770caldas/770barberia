import { dbConnect } from "@/lib/db";
import Cita from "@/models/Cita";
import Barbero from "@/models/Barbero";
import { ok, fail, handler } from "@/lib/api";
import { normalizarCelular } from "@/lib/whatsapp";
import { serializarCita } from "@/lib/serializers";
import { ESTADO_CITA } from "@/lib/constants";
import { fechaLocalHoy } from "@/lib/disponibilidad";
import { recordarClientesDelDia } from "@/lib/recordatorios";

// GET /api/citas/consulta?celular=...  -> el cliente consulta sus citas por celular
export const GET = handler(async (req) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const celularRaw = searchParams.get("celular");
  if (!celularRaw) return fail("El celular es obligatorio");

  const celular = normalizarCelular(celularRaw);

  // Disparo oportuno: al consultar sus citas se procesa el recordatorio del día
  // de este cliente (si ya abrió la barbería). El flag en BD evita repetirlo.
  await recordarClientesDelDia({ celular });

  // Excluimos pagoAnticipo.comprobante para ahorrar consumo de RAM y ancho de banda
  const citas = await Cita.find({ clienteCelular: celular })
    .select("-pagoAnticipo.comprobante")
    .sort({ fecha: -1, horaInicio: -1 })
    .lean();

  // Adjuntar datos del barbero
  const barberoIds = [...new Set(citas.map((c) => c.barbero.toString()))];
  const barberos = await Barbero.find({ _id: { $in: barberoIds } })
    .select("nombre local celular")
    .lean();
  const mapaBarbero = {};
  for (const b of barberos) mapaBarbero[b._id.toString()] = b;

  const data = citas.map((c) => {
    const b = mapaBarbero[c.barbero.toString()];
    return {
      ...serializarCita(c),
      barberoNombre: b?.nombre,
      barberoLocal: b?.local,
      barberoCelular: b?.celular,
    };
  });

  const hoy = fechaLocalHoy();
  const proximas = [];
  const historial = [];

  for (const c of data) {
    const esActiva =
      c.estado === ESTADO_CITA.SOLICITADA || c.estado === ESTADO_CITA.CONFIRMADA;
    const esFuturaOHoy = c.fecha >= hoy;

    if (esActiva && esFuturaOHoy) {
      proximas.push(c);
    } else {
      historial.push(c);
    }
  }

  // Próximas en orden cronológico (lo más cercano primero)
  proximas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return a.horaInicio.localeCompare(b.horaInicio);
  });

  // Historial en orden inverso (lo más reciente arriba)
  historial.sort((a, b) => {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
    return b.horaInicio.localeCompare(a.horaInicio);
  });

  return ok({
    proximas,
    historial,
    citas: data,
    totalProximas: proximas.length,
    totalHistorial: historial.length,
  });
});
