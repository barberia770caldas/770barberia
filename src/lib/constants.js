// Constantes de negocio de CitasBarber

import { EMOJI } from "./emojis";

export const ROLES = {
  ADMIN: "admin",
  BARBERO: "barbero",
};

export const ESTADO_BARBERO = {
  PENDIENTE: "pendiente",
  ACTIVO: "activo",
  RECHAZADO: "rechazado",
  INACTIVO: "inactivo", // suscripción vencida
};

export const ESTADO_CITA = {
  SOLICITADA: "solicitada",
  CONFIRMADA: "confirmada",
  RECHAZADA: "rechazada",
  COMPLETADA: "completada",
  CANCELADA: "cancelada",
  NO_ASISTIO: "no_asistio",
};

export const METODOS_PAGO = {
  NEQUI: "nequi",
  DAVIPLATA: "daviplata",
  QR: "qr",
  CUENTA: "cuenta",
  EFECTIVO: "efectivo",
};

export const METODOS_PAGO_LABEL = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  qr: "Código QR",
  cuenta: "Cuenta bancaria",
  efectivo: "Efectivo",
};

// Duración de cada plan en minutos (incluye 5 min de buffer entre citas)
// Bronce: 30 - 5 = 25 ; Plata/Oro: 60 - 5 = 55
export const PLANES_KEYS = ["bronce", "plata", "oro"];

// Plantilla por defecto de planes cuando el admin configura a un barbero.
// Los precios son ejemplos editables por el admin.
// Los emojis vienen del módulo centralizado y seguro (ver ./emojis).
export const PLANES_DEFAULT = [
  {
    key: "bronce",
    nombre: "Bronce",
    servicios: [`${EMOJI.TIJERAS} Corte básico`],
    precio: 20000,
    duracion: 25,
    anticipo: 0,
    metodosPago: ["nequi", "daviplata", "qr", "cuenta", "efectivo"],
    activo: true,
  },
  {
    key: "plata",
    nombre: "Plata",
    servicios: [
      `${EMOJI.TIJERAS} Corte`,
      `${EMOJI.MASAJE} Mascarilla puntos negros`,
      `${EMOJI.BRILLO} Depilación de oídos y nariz`,
    ],
    precio: 45000,
    duracion: 55,
    anticipo: 50,
    metodosPago: ["nequi", "daviplata", "qr", "cuenta"],
    activo: true,
  },
  {
    key: "oro",
    nombre: "Oro",
    servicios: [
      `${EMOJI.TIJERAS} Corte`,
      `${EMOJI.MASAJE} Mascarilla puntos negros`,
      `${EMOJI.BRILLO} Depilación de oídos y nariz`,
      `${EMOJI.CERVEZA} Bebida a gusto`,
      `${EMOJI.CHOCOLATE} Snack`,
    ],
    precio: 70000,
    duracion: 55,
    anticipo: 50,
    metodosPago: ["nequi", "daviplata", "qr", "cuenta"],
    activo: true,
  },
];

export const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

// Horario laboral por defecto de un barbero nuevo
export const HORARIO_DEFAULT = {
  horaInicio: "10:00",
  horaFin: "19:00",
  // 1=lunes ... 6=sábado (0=domingo). Por defecto lunes a sábado.
  diasLaborales: [1, 2, 3, 4, 5, 6],
  // Duración estándar por corte / turno en minutos
  duracionTurnoMin: 30,
  // Ventana de días futuros en que un cliente puede agendar (estilo Calendly)
  diasAnticipacionMax: 7,
  // Hora de almuerzo (se aplica a los días laborales). Desactivada por defecto.
  almuerzo: {
    activo: false,
    horaInicio: "13:00",
    horaFin: "14:00",
  },
};

export const DURACIONES_CORTE_OPCIONES = [20, 25, 30, 35, 40, 45, 50, 60];

// Opciones de días máximos de anticipación para agendar
export const DIAS_ANTICIPACION_MAX_DEFAULT = 7;
export const DIAS_ANTICIPACION_OPCIONES = [
  { valor: 3, label: "3 días" },
  { valor: 7, label: "7 días (1 semana)" },
  { valor: 14, label: "14 días (2 semanas)" },
  { valor: 30, label: "30 días (1 mes)" },
];

// Datos por defecto de la sede/barbería principal
export const BARBERIA_SEDE_DEFAULT = {
  local: "770 Barbería",
  ciudad: "Caldas, Antioquia",
  direccion: "Carrera 48 # 133 sur 50",
};

export const VENTANA_CANCELACION_HORAS_DEFAULT = 24;

export function formatoCOP(valor) {
  if (valor == null || isNaN(valor)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}
