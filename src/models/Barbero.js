import mongoose from "mongoose";
import {
  ESTADO_BARBERO,
  HORARIO_DEFAULT,
  VENTANA_CANCELACION_HORAS_DEFAULT,
} from "@/lib/constants";

const PlanSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // bronce | plata | oro
    nombre: String,
    servicios: [String],
    precio: Number,
    duracion: Number, // minutos
    anticipo: Number, // % (0 = sin anticipo)
    metodosPago: [String],
    activo: { type: Boolean, default: true },
  },
  { _id: false }
);

const FranjaBloqueadaSchema = new mongoose.Schema(
  {
    fecha: String, // 'YYYY-MM-DD'
    horaInicio: String, // 'HH:mm'
    horaFin: String, // 'HH:mm'
    motivo: String,
  },
  { _id: true }
);

const BarberoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    local: { type: String, required: true },
    celular: { type: String, required: true },
    ciudad: { type: String, required: true },
    direccion: { type: String, default: "" },
    foto: { type: String, default: "" }, // URL pública o base64
    redes: {
      instagram: { type: String, default: "" },
      facebook: { type: String, default: "" },
      tiktok: { type: String, default: "" },
    },
    email: { type: String, required: true, lowercase: true },
    estado: {
      type: String,
      enum: Object.values(ESTADO_BARBERO),
      default: ESTADO_BARBERO.PENDIENTE,
    },
    // Datos de pago que se muestran al cliente (número Nequi/Daviplata, cuenta, QR)
    datosPago: {
      nequi: String,
      daviplata: String,
      cuenta: String,
      qrImagen: String, // base64 opcional
    },
    horario: {
      horaInicio: { type: String, default: HORARIO_DEFAULT.horaInicio },
      horaFin: { type: String, default: HORARIO_DEFAULT.horaFin },
      diasLaborales: { type: [Number], default: HORARIO_DEFAULT.diasLaborales },
      duracionTurnoMin: {
        type: Number,
        default: HORARIO_DEFAULT.duracionTurnoMin || 30,
        min: 15,
        max: 120,
      },
      diasAnticipacionMax: {
        type: Number,
        default: HORARIO_DEFAULT.diasAnticipacionMax || 7,
        min: 1,
        max: 90,
      },
      // Hora de almuerzo: se aplica a todos los días laborales y no queda
      // disponible para agendar citas.
      almuerzo: {
        activo: { type: Boolean, default: HORARIO_DEFAULT.almuerzo.activo },
        horaInicio: { type: String, default: HORARIO_DEFAULT.almuerzo.horaInicio },
        horaFin: { type: String, default: HORARIO_DEFAULT.almuerzo.horaFin },
      },
    },
    diasBloqueados: { type: [String], default: [] }, // ['YYYY-MM-DD']
    franjasBloqueadas: { type: [FranjaBloqueadaSchema], default: [] },
    ventanaCancelacionHoras: {
      type: Number,
      default: VENTANA_CANCELACION_HORAS_DEFAULT,
    },
    planes: { type: [PlanSchema], default: [] },
    // Suscripción SaaS
    suscripcionActiva: { type: Boolean, default: false },
    suscripcionVence: Date,
    fechaInicioSuscripcion: Date,
    tarifaMensual: { type: Number, default: 20000 }, // COP
  },
  { timestamps: true }
);

export default mongoose.models.Barbero || mongoose.model("Barbero", BarberoSchema);
