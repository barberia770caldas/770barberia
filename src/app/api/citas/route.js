import { dbConnect } from "@/lib/db";
import Barbero from "@/models/Barbero";
import Cita from "@/models/Cita";
import Cliente from "@/models/Cliente";
import { ok, fail, handler } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { calcularSlots, minAHhmm, hhmmAMin, fechaLocalHoy, fechaLocalMax, formatearHora12, minutosActualesColombia } from "@/lib/disponibilidad";
import { normalizarCelular, linkWhatsApp, mensajeNuevaCita } from "@/lib/whatsapp";
import { ESTADO_CITA, ROLES } from "@/lib/constants";
import { serializarCita } from "@/lib/serializers";
import { validarComprobante } from "@/lib/validaciones";
import { enviarPush } from "@/lib/push";

// GET /api/citas  -> lista de citas del barbero autenticado (opcional ?fecha=)
export const GET = handler(async (req) => {
  await dbConnect();
  const session = getSession();
  if (!session || session.role !== ROLES.BARBERO)
    return fail("No autorizado", 403);

  const hoy = fechaLocalHoy();
  const ahoraHhmm = minAHhmm(minutosActualesColombia());

  // Auto-completar citas confirmadas cuya hora de inicio ya pasó
  await Cita.updateMany(
    {
      barbero: session.barberoId,
      estado: ESTADO_CITA.CONFIRMADA,
      $or: [
        { fecha: { $lt: hoy } },
        { fecha: hoy, horaInicio: { $lte: ahoraHhmm } },
      ],
    },
    { $set: { estado: ESTADO_CITA.COMPLETADA } }
  );

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get("fecha");
  const query = { barbero: session.barberoId };
  if (fecha) query.fecha = fecha;

  const citas = await Cita.find(query).sort({ fecha: 1, horaInicio: 1 }).lean();
  return ok({ citas: citas.map(serializarCita) });
});

// POST /api/citas  -> el cliente crea una solicitud de cita
export const POST = handler(async (req) => {
  await dbConnect();
  const body = await req.json();
  const { barberoId, plan: planKey, fecha, horaInicio, metodoPago, comprobante } = body;
  let { clienteNombre, clienteCelular } = body;

  if (!barberoId || !planKey || !fecha || !horaInicio)
    return fail("Faltan datos de la cita");
  if (!clienteNombre || !clienteCelular)
    return fail("Nombre y celular del cliente son obligatorios");

  clienteNombre = String(clienteNombre).trim().slice(0, 80);
  if (!clienteNombre) return fail("El nombre del cliente no puede estar vacío");

  if (fecha < fechaLocalHoy())
    return fail("No puedes agendar en una fecha que ya pasó.", 400);

  clienteCelular = normalizarCelular(clienteCelular);

  const barbero = await Barbero.findById(barberoId);
  if (!barbero) return fail("Barbero no encontrado", 404);

  const diasMax = barbero.horario?.diasAnticipacionMax || 7;
  const fechaMax = fechaLocalMax(diasMax);
  if (fecha > fechaMax)
    return fail(`Este barbero solo recibe reservas con hasta ${diasMax} días de anticipación (hasta el ${fechaMax}).`, 400);

  const plan = (barbero.planes || []).find((p) => p.key === planKey && p.activo);
  if (!plan) return fail("Plan no disponible", 400);

  if (metodoPago && !plan.metodosPago.includes(metodoPago))
    return fail("Método de pago no permitido para este plan", 400);

  // Validar el comprobante en el servidor (tipo y tamaño real), no confiar en el cliente.
  const comp = validarComprobante(comprobante);
  if (!comp.ok) return fail(comp.error, 400);

  // Recalcular disponibilidad para evitar doble reserva
  const citasDia = await Cita.find({
    barbero: barbero._id,
    fecha,
    estado: { $in: [ESTADO_CITA.SOLICITADA, ESTADO_CITA.CONFIRMADA] },
  })
    .select("horaInicio horaFin")
    .lean();

  const duracionCita = Number(plan.duracion) || barbero.horario?.duracionTurnoMin || 30;

  const slots = calcularSlots({ barbero, fecha, duracion: duracionCita, citas: citasDia });
  if (!slots.includes(horaInicio))
    return fail("Ese horario ya no está disponible. Elige otro.", 409);

  const horaFin = minAHhmm(hhmmAMin(horaInicio) + duracionCita);

  // Registrar/actualizar cliente
  let cliente = await Cliente.findOne({ celular: clienteCelular });
  if (!cliente) {
    cliente = await Cliente.create({ nombre: clienteNombre.trim(), celular: clienteCelular });
  }

  const requiereAnticipo = (plan.anticipo || 0) > 0;
  const cita = await Cita.create({
    barbero: barbero._id,
    cliente: cliente._id,
    clienteNombre: clienteNombre.trim(),
    clienteCelular,
    plan: plan.key,
    planSnapshot: {
      key: plan.key,
      nombre: plan.nombre,
      servicios: plan.servicios,
      precio: plan.precio,
      duracion: duracionCita,
      anticipo: plan.anticipo,
    },
    fecha,
    horaInicio,
    horaFin,
    metodoPago: metodoPago || null,
    pagoAnticipo: {
      requerido: requiereAnticipo,
      monto: requiereAnticipo ? Math.round((plan.precio * plan.anticipo) / 100) : 0,
      comprobante: "", // El cliente lo comparte directamente al WhatsApp del barbero (0 bytes en BD)
      estado: "pendiente",
    },
    estado: ESTADO_CITA.SOLICITADA,
  });

  const linkWhatsappBarbero = linkWhatsApp(
    barbero.celular,
    mensajeNuevaCita(cita, barbero, { plano: !!body.plano })
  );

  // Notificación push al barbero (no bloquea ni rompe la respuesta si falla).
  await enviarPush(
    { ownerRole: ROLES.BARBERO, ownerId: barbero._id },
    {
      title: "Nueva cita solicitada",
      body: `${cita.clienteNombre} · ${plan.nombre} · ${cita.fecha} a las ${formatearHora12(cita.horaInicio)}`,
      url: "/barbero/panel",
      tag: `cita-${cita._id}`,
    }
  );

  return ok(
    {
      cita: serializarCita(cita.toObject()),
      linkWhatsappBarbero,
    },
    201
  );
});
