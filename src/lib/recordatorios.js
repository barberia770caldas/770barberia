import Cita from "@/models/Cita";
import Barbero from "@/models/Barbero";
import { enviarPush } from "@/lib/push";
import { normalizarCelular } from "@/lib/whatsapp";
import { ESTADO_CITA, ESTADO_BARBERO, ROLES } from "@/lib/constants";
import {
  fechaLocalHoy,
  hhmmAMin,
  minutosActualesColombia,
  formatearHora12,
} from "@/lib/disponibilidad";

// Minutos de antelación con que se avisa al barbero de una cita sin confirmar.
export const MIN_ANTELACION_AVISO = 15;

// Avisa al BARBERO de las citas de HOY que siguen SOLICITADA (sin confirmar) y
// cuya hora de inicio cae dentro de los próximos MIN_ANTELACION_AVISO minutos.
// Marca recordatorioEnviado SIEMPRE (aunque no haya suscripción activa) para no
// reintentar en bucle. Nunca lanza: ante cualquier error lo registra y devuelve
// un resultado vacío, para que el flujo que lo invoca no se rompa.
export async function recordarCitasSinConfirmar({ barberoId = null } = {}) {
  try {
    const hoy = fechaLocalHoy();
    const ahoraMin = minutosActualesColombia();

    const filtro = {
      estado: ESTADO_CITA.SOLICITADA,
      fecha: hoy,
      recordatorioEnviado: { $ne: true },
    };
    if (barberoId) filtro.barbero = barberoId;

    const candidatas = await Cita.find(filtro).lean();

    // Se avisa cuando faltan entre 0 y MIN_ANTELACION_AVISO minutos para la cita.
    const porAvisar = candidatas.filter((c) => {
      const faltan = hhmmAMin(c.horaInicio) - ahoraMin;
      return faltan > 0 && faltan <= MIN_ANTELACION_AVISO;
    });

    let notificadas = 0;
    for (const cita of porAvisar) {
      const plan = cita.planSnapshot?.nombre || cita.plan;
      await enviarPush(
        { ownerRole: ROLES.BARBERO, ownerId: cita.barbero },
        {
          title: "Cita sin confirmar",
          body: `${cita.clienteNombre} · ${plan} · hoy a las ${formatearHora12(cita.horaInicio)}. Empieza en unos ${MIN_ANTELACION_AVISO} min y sigue sin confirmar.`,
          url: "/barbero/panel",
          tag: `recordatorio-${cita._id}`,
        }
      );
      // Marcamos aunque no haya suscripción activa: no queremos reintentar en bucle.
      await Cita.updateOne({ _id: cita._id }, { $set: { recordatorioEnviado: true } });
      notificadas++;
    }

    return { revisadas: candidatas.length, notificadas };
  } catch (e) {
    console.error("recordarCitasSinConfirmar falló:", e.message);
    return { revisadas: 0, notificadas: 0 };
  }
}

// Avisa al CLIENTE el día de su cita confirmada, a partir de la hora en que abre
// el barbero. Se le recuerda una sola vez (flag recordatorioClienteEnviado).
// Puede filtrarse por barbero y/o por celular exacto (disparo oportuno). Nunca
// lanza: ante cualquier error lo registra y devuelve un resultado vacío.
export async function recordarClientesDelDia({ barberoId = null, celular = null } = {}) {
  try {
    const hoy = fechaLocalHoy();
    const ahoraMin = minutosActualesColombia();

    const filtro = {
      estado: ESTADO_CITA.CONFIRMADA,
      fecha: hoy,
      clienteCelular: { $nin: [null, ""] },
      recordatorioClienteEnviado: { $ne: true },
    };
    if (barberoId) filtro.barbero = barberoId;
    if (celular) filtro.clienteCelular = normalizarCelular(celular);

    const citasHoy = await Cita.find(filtro).lean();
    if (citasHoy.length === 0) return { revisadas: 0, recordadas: 0 };

    const barberoIds = [...new Set(citasHoy.map((c) => String(c.barbero)))];
    const barberos = await Barbero.find({ _id: { $in: barberoIds } })
      .select("nombre local horario")
      .lean();
    const mapaBarbero = new Map(barberos.map((b) => [String(b._id), b]));

    let recordadas = 0;
    for (const cita of citasHoy) {
      const barbero = mapaBarbero.get(String(cita.barbero));
      const apertura = barbero?.horario?.horaInicio || "00:00";
      // Aún no abre el local (hora de Colombia): esperamos a un próximo ciclo
      // SIN marcar, para que el recordatorio salga recién a la hora de apertura.
      if (ahoraMin < hhmmAMin(apertura)) continue;

      const local = barbero?.local || "la barbería";
      await enviarPush(
        { ownerRole: "cliente", clienteCelular: normalizarCelular(cita.clienteCelular) },
        {
          title: "Recordatorio de tu cita ✂️",
          body: `Hoy tenés cita a las ${formatearHora12(cita.horaInicio)} con ${barbero?.nombre || "tu barbero"} en ${local}.`,
          url: "/mis-citas",
          tag: `recordatorio-cliente-${cita._id}`,
        }
      );
      // Marcamos aunque no haya suscripción activa: evita reintentar en bucle.
      await Cita.updateOne({ _id: cita._id }, { $set: { recordatorioClienteEnviado: true } });
      recordadas++;
    }

    return { revisadas: citasHoy.length, recordadas };
  } catch (e) {
    console.error("recordarClientesDelDia falló:", e.message);
    return { revisadas: 0, recordadas: 0 };
  }
}

// Avisa a los BARBEROS activos que aún no han pagado el mes, durante los
// primeros 5 días del mes. Solo envía una vez por mes (flag avisoPagoEnviado).
export async function recordarPagoMensual() {
  try {
    const hoy = fechaLocalHoy(); // 'YYYY-MM-DD' en zona Colombia
    const dia = parseInt(hoy.split("-")[2], 10);
    if (dia > 5) return { revisados: 0, notificados: 0 };

    const mesActual = hoy.slice(0, 7); // 'YYYY-MM'

    const barberos = await Barbero.find({
      estado: ESTADO_BARBERO.ACTIVO,
      pagoMesActual: { $ne: mesActual },
      avisoPagoEnviado: { $ne: mesActual },
    }).lean();

    let notificados = 0;
    for (const b of barberos) {
      await enviarPush(
        { ownerRole: ROLES.BARBERO, ownerId: b._id },
        {
          title: "Pago mensual pendiente 💈",
          body: "Recuerda realizar el pago mensual de la plataforma para mantener tu cuenta activa.",
          url: "/barbero/panel",
          tag: `pago-mensual-${mesActual}`,
        }
      );
      await Barbero.updateOne({ _id: b._id }, { $set: { avisoPagoEnviado: mesActual } });
      notificados++;
    }

    return { revisados: barberos.length, notificados };
  } catch (e) {
    console.error("recordarPagoMensual falló:", e.message);
    return { revisados: 0, notificados: 0 };
  }
}
