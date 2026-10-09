import { dbConnect } from "@/lib/db";
import Barbero from "@/models/Barbero";
import Usuario from "@/models/Usuario";
import Cita from "@/models/Cita";
import { ok, fail, handler } from "@/lib/api";
import { getSession, hashPassword } from "@/lib/auth";
import { ROLES, ESTADO_BARBERO, PLANES_DEFAULT, BARBERIA_SEDE_DEFAULT } from "@/lib/constants";

// GET /api/admin/barberos?estado=pendiente|activo|...  -> lista para el admin
export const GET = handler(async (req) => {
  await dbConnect();
  const session = getSession();
  if (!session || session.role !== ROLES.ADMIN) return fail("No autorizado", 403);

  const { searchParams } = new URL(req.url);
  const estado = searchParams.get("estado");
  const query = estado ? { estado } : {};

  const barberos = await Barbero.find(query).sort({ createdAt: -1 }).lean();

  // Conteo de citas por barbero (para avisar en la eliminación en cascada)
  const conteos = await Cita.aggregate([
    { $match: { barbero: { $in: barberos.map((b) => b._id) } } },
    { $group: { _id: "$barbero", total: { $sum: 1 } } },
  ]);
  const citasPorBarbero = Object.fromEntries(
    conteos.map((c) => [c._id.toString(), c.total])
  );

  return ok({
    barberos: barberos.map((b) => ({
      id: b._id.toString(),
      nombre: b.nombre,
      local: b.local,
      celular: b.celular,
      ciudad: b.ciudad,
      email: b.email,
      estado: b.estado,
      horario: b.horario || {},
      planes: b.planes || [],
      datosPago: b.datosPago || {},
      suscripcionActiva: b.suscripcionActiva,
      suscripcionVence: b.suscripcionVence,
      fechaInicioSuscripcion: b.fechaInicioSuscripcion || b.createdAt,
      tarifaMensual: b.tarifaMensual ?? 20000,
      pagoMesActual: b.pagoMesActual || "",
      numCitas: citasPorBarbero[b._id.toString()] || 0,
      createdAt: b.createdAt,
    })),
  });
});

// POST /api/admin/barberos  -> creación manual por parte del admin
export const POST = handler(async (req) => {
  await dbConnect();
  const session = getSession();
  if (!session || session.role !== ROLES.ADMIN) return fail("No autorizado", 403);

  const body = await req.json();
  const { nombre, local, celular, ciudad, direccion, email, password } = body;

  const localFinal = local?.trim() || BARBERIA_SEDE_DEFAULT.local;
  const ciudadFinal = ciudad?.trim() || BARBERIA_SEDE_DEFAULT.ciudad;
  const direccionFinal = (typeof direccion === "string" && direccion.trim()) ? direccion.trim() : BARBERIA_SEDE_DEFAULT.direccion;

  if (!nombre?.trim() || !celular?.trim() || !email?.trim()) {
    return fail("Nombre, celular y correo son obligatorios", 400);
  }

  // Normalizar email: si el admin ingresó solo el alias, concatenar @citasbarber.com
  let emailNormalizado = email.trim().toLowerCase();
  if (!emailNormalizado.includes("@")) {
    emailNormalizado = `${emailNormalizado}@citasbarber.com`;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailNormalizado)) {
    return fail("El formato del correo electrónico no es válido", 400);
  }

  const existe = await Usuario.findOne({ email: emailNormalizado });
  if (existe) {
    return fail("Ya existe un usuario registrado con ese correo electrónico", 409);
  }

  const pass = password?.trim() || "Barbero123*";
  if (pass.length < 6) {
    return fail("La contraseña debe tener al menos 6 caracteres", 400);
  }

  const duracionTurno = Number(body.duracionTurnoMin) || HORARIO_DEFAULT.duracionTurnoMin || 30;

  const barbero = await Barbero.create({
    nombre: nombre.trim(),
    local: localFinal,
    celular: celular.trim(),
    ciudad: ciudadFinal,
    direccion: direccionFinal,
    email: emailNormalizado,
    estado: ESTADO_BARBERO.ACTIVO,
    suscripcionActiva: true,
    suscripcionVence: new Date(Date.now() + 30 * 864e5),
    horario: {
      ...HORARIO_DEFAULT,
      duracionTurnoMin: duracionTurno,
    },
    planes: PLANES_DEFAULT,
  });

  const passwordHash = await hashPassword(pass);
  await Usuario.create({
    role: ROLES.BARBERO,
    nombre: nombre.trim(),
    email: emailNormalizado,
    passwordHash,
    passwordTemporal: true,
    barbero: barbero._id,
  });

  return ok(
    {
      ok: true,
      barbero: {
        id: barbero._id.toString(),
        nombre: barbero.nombre,
        local: barbero.local,
        celular: barbero.celular,
        ciudad: barbero.ciudad,
        email: barbero.email,
        estado: barbero.estado,
        planes: barbero.planes,
        datosPago: barbero.datosPago || {},
        suscripcionActiva: barbero.suscripcionActiva,
        suscripcionVence: barbero.suscripcionVence,
        numCitas: 0,
        createdAt: barbero.createdAt,
      },
      credenciales: {
        email: emailNormalizado,
        password: pass,
      },
    },
    201
  );
});
