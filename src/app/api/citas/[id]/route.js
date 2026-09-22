import { dbConnect } from "@/lib/db";
import Cita from "@/models/Cita";
import Barbero from "@/models/Barbero";
import { ok, fail, handler } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { ESTADO_CITA, ROLES } from "@/lib/constants";
import { fechaLocalHoy, minutosActualesColombia, hhmmAMin } from "@/lib/disponibilidad";
import {
  linkWhatsApp,
  mensajeConfirmacion,
  mensajeRechazo,
  mensajeCancelacion,
  normalizarCelular,
} from "@/lib/whatsapp";
import { serializarCita } from "@/lib/serializers";

// PATCH /api/citas/:id  body: { accion, motivo?, celular? }
// acciones: confirmar | rechazar | completar (barbero) ; cancelar (barbero o cliente)
export const PATCH = handler(async (req, { params }) => {
  await dbConnect();
  const { accion, motivo, celular, plano } = await req.json();
  const cita = await Cita.findById(params.id);
  if (!cita) return fail("Cita no encontrada", 404);

  const barbero = await Barbero.findById(cita.barbero);
  const session = getSession();
  const esBarberoDueno =
    session?.role === ROLES.BARBERO && session.barberoId === cita.barbero.toString();

  switch (accion) {
    case "confirmar": {
      if (!esBarberoDueno) return fail("No autorizado", 403);
      if (cita.estado !== ESTADO_CITA.SOLICITADA)
        return fail("Solo se pueden confirmar citas solicitadas", 400);
      cita.estado = ESTADO_CITA.CONFIRMADA;
      await cita.save();
      const link = linkWhatsApp(cita.clienteCelular, mensajeConfirmacion(cita, barbero, { plano: !!plano }));
      return ok({ cita: serializarCita(cita.toObject()), linkWhatsApp: link });
    }

    case "rechazar": {
      if (!esBarberoDueno) return fail("No autorizado", 403);
      if (cita.estado !== ESTADO_CITA.SOLICITADA)
        return fail("Solo se pueden rechazar citas solicitadas", 400);
      cita.estado = ESTADO_CITA.RECHAZADA;
      cita.motivoRechazo = motivo || "";
      await cita.save();
      const link = linkWhatsApp(cita.clienteCelular, mensajeRechazo(cita, barbero));
      return ok({ cita: serializarCita(cita.toObject()), linkWhatsApp: link });
    }

    case "completar": {
      if (!esBarberoDueno) return fail("No autorizado", 403);
      if (![ESTADO_CITA.CONFIRMADA, ESTADO_CITA.NO_ASISTIO].includes(cita.estado))
        return fail("Solo se pueden completar citas confirmadas o no asistidas", 400);

      const hoy = fechaLocalHoy();
      const ahoraMin = minutosActualesColombia();
      const inicioMin = hhmmAMin(cita.horaInicio);
      if (cita.fecha > hoy || (cita.fecha === hoy && inicioMin > ahoraMin)) {
        return fail("No puedes completar una cita antes de su hora programada; el cliente aún no ha llegado.", 400);
      }

      cita.estado = ESTADO_CITA.COMPLETADA;
      await cita.save();
      return ok({ cita: serializarCita(cita.toObject()) });
    }

    case "no-asistio":
    case "no_asistio": {
      if (!esBarberoDueno) return fail("No autorizado", 403);
      if (![ESTADO_CITA.CONFIRMADA, ESTADO_CITA.COMPLETADA].includes(cita.estado))
        return fail("Solo se pueden marcar como no asistidas citas confirmadas o completadas", 400);
      cita.estado = ESTADO_CITA.NO_ASISTIO;
      await cita.save();
      return ok({ cita: serializarCita(cita.toObject()) });
    }

    case "confirmar-pago": {
      if (!esBarberoDueno) return fail("No autorizado", 403);
      cita.pagoAnticipo.estado = "recibido";
      await cita.save();
      return ok({ cita: serializarCita(cita.toObject()) });
    }

    case "cancelar": {
      // Puede cancelar el barbero dueño o el cliente (validando su celular)
      const esCliente =
        celular && normalizarCelular(celular) === cita.clienteCelular;
      if (!esBarberoDueno && !esCliente)
        return fail("No autorizado para cancelar esta cita", 403);
      if (![ESTADO_CITA.SOLICITADA, ESTADO_CITA.CONFIRMADA].includes(cita.estado))
        return fail("Esta cita no se puede cancelar", 400);

      // Validar ventana de cancelación (solo para el cliente)
      if (esCliente && !esBarberoDueno) {
        const ventana = barbero?.ventanaCancelacionHoras ?? 24;
        const inicio = new Date(`${cita.fecha}T${cita.horaInicio}:00`);
        const horasRestantes = (inicio.getTime() - Date.now()) / 36e5;
        if (horasRestantes < ventana)
          return fail(
            `Solo puedes cancelar con al menos ${ventana} horas de anticipación.`,
            400
          );
      }
      const eraConfirmada = cita.estado === ESTADO_CITA.CONFIRMADA;
      cita.estado = ESTADO_CITA.CANCELADA;
      await cita.save();

      // Si el barbero cancela una cita ya confirmada, avisar al cliente por WhatsApp.
      let link;
      if (esBarberoDueno && eraConfirmada && cita.clienteCelular) {
        link = linkWhatsApp(
          cita.clienteCelular,
          mensajeCancelacion(cita, barbero, { motivo })
        );
      }
      return ok({ cita: serializarCita(cita.toObject()), linkWhatsApp: link });
    }

    default:
      return fail("Acción no válida", 400);
  }
});

// GET /api/citas/:id  -> detalle (con comprobante si es el barbero dueño)
export const GET = handler(async (req, { params }) => {
  await dbConnect();
  const session = getSession();
  if (!session) return fail("No autenticado", 401);

  const cita = await Cita.findById(params.id).lean();
  if (!cita) return fail("Cita no encontrada", 404);

  const esBarberoDueno =
    session.role === ROLES.BARBERO && session.barberoId === cita.barbero.toString();
  const esAdmin = session.role === ROLES.ADMIN;

  if (!esBarberoDueno && !esAdmin) {
    return fail("No autorizado para consultar esta cita", 403);
  }

  const data = serializarCita(cita);
  if (esBarberoDueno && cita.pagoAnticipo?.comprobante) {
    data.comprobante = cita.pagoAnticipo.comprobante; // base64 completo solo para el barbero
  }
  return ok({ cita: data });
});
