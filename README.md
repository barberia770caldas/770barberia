# 💈 770 Barbería — Plataforma de Gestión y Agendamiento de Citas

Plataforma web **serverless y SaaS** orientada a la gestión integral de citas para **770 Barbería** (Caldas, Antioquia — Colombia) y barberos independientes. Permite a los clientes reservar en tiempo real sin formularios extensos ni contraseñas, automatiza las confirmaciones y cobros por **WhatsApp**, envía **notificaciones Web Push**, sincroniza citas con **Google Calendar y calendarios nativos (`.ics`)**, y ofrece un módulo administrativo de **Control de Suscripciones** mensual para el administrador.

El stack es **100 % gratuito y eficiente**: Next.js 14 (App Router) + MongoDB Atlas + Web Push (VAPID) + WhatsApp (`wa.me`) + Vercel.

---

## 🚀 Características Principales

### 👤 Para el Cliente
- **Identificación sin contraseña**: Registro únicamente con **Nombre completo y Celular**; el sistema recuerda el número en visitas posteriores (`localStorage`).
- **Asistente de reserva con auto-avance**: Búsqueda automática del primer día con cupos disponibles (próximos 30 días), avance inteligente entre pasos y bloqueo estricto de fechas y horas pasadas.
- **Anticipos por transferencia colombiana**: Datos de pago integrados (Nequi, Daviplata, QR, cuenta bancaria); subida del comprobante y apertura directa de WhatsApp (`wa.me`) para enviarlo al barbero.
- **Portal "Mis Citas"**: Pestañas separadas para **Próximas citas** (con tarjeta destacada para la cita de hoy) e **Historial**. Permite cancelar dentro de la ventana configurada por el barbero.
- **Recordatorios Web Push**: Botón en "Mis Citas" para recibir una notificación push en el celular o navegador en la mañana del día de la cita.
- **Sincronización con calendario**: Botón para agregar la cita directamente a Google Calendar o descargar el archivo `.ics`.

### ✂️ Para el Barbero
- **Panel con vistas duales**: Pestaña **Hoy (Lista cronológica)** y **Calendario interactivo** (semana, mes y día) con tarjetas compactas y visualización de franjas libres cada 30 minutos.
- **Ciclo completo de citas**: Botones para Aceptar, Rechazar (con motivo por WhatsApp), Completar, Cancelar y marcar como **"No asistió"** (sin sumar a ingresos pero manteniendo el registro).
- **Cita Manual optimizada**:
  - Autocompletado rápido de clientes recurrentes al escribir nombre o celular.
  - Integración nativa con **Contact Picker API** (`navigator.contacts.select` en Android/Chrome) para seleccionar clientes directamente desde la libreta telefónica del celular.
- **Sincronización inmediata con Calendarios**:
  - Modal automático tras confirmar una cita con opciones para **Google Calendar** y descarga de **`.ics`**.
  - Opción de descargar un archivo `.ics` con **todas las citas confirmadas del día** en un solo archivo.
- **Gestión de Horarios y Ausencias**: Configuración de hora de inicio/fin, días laborales, duración de turno, franja fija de **almuerzo** y bloqueo instantáneo de días completos o franjas de horas (ausencias).
- **Resumen Diario e Ingresos**: Balance del día con métricas operativas y desglose financiero de **Efectivo** vs. **Transferencias / Anticipos**.

### 🛠️ Para el Administrador (SaaS)
- **Control de Suscripciones**: Tablero de seguimiento de mensualidades con semáforo (*Al día*, *Por vencer en ≤ 5 días*, *Vencido*), KPIs de recaudo proyectado en COP, registro de pagos (+30 días o fecha libre) y recordatorios directos por WhatsApp.
- **Creación directa de barberos**: Modal administrativo para dar de alta nuevos barberos con credenciales, horario, almuerzo, tarifa mensual y planes en un solo paso.
- **Aprobación de barberos**: Gestión de solicitudes de registro público (aprobar, rechazar, activar o desactivar).
- **Gestión de solicitudes de prospectos ("¿Tienes barbería?")**: Recepción de consultas de contacto desde la landing page, con contador de no leídos y respuesta rápida por WhatsApp.
- **Configuración de planes por barbero**: Personalización independiente de servicios, precios, duración y métodos de pago (Bronce, Plata, Oro).

### 📲 Instalación y Experiencia PWA
- **Instalación como App**: Botón "Descargar app" en el pie de página con instalación directa en Android/escritorio (`beforeinstallprompt`) y guía paso a paso para iPhone/iOS.
- **Notificaciones Web Push en segundo plano**: Avisos instantáneos al barbero cuando recibe una solicitud y al administrador cuando entra un nuevo contacto. Auto-suscripción silenciosa en la PWA instalada.
- **Zona Horaria de Colombia**: Cálculos centralizados en `America/Bogota` (UTC-5) para eliminar desfases producidos por servidores serverless en UTC.

---

## ⏱️ Duración y Estructura de Planes

| Plan | Duración slot | Anticipo | Métodos de pago permitidos |
|---|---|---|---|
| **Bronce** | 25 min | No | Nequi, Daviplata, QR, cuenta bancaria, **efectivo** |
| **Plata** | 55 min | 50 % | Solo transferencias (Nequi, Daviplata, QR, cuenta) |
| **Oro** | 55 min | 50 % | Solo transferencias (Nequi, Daviplata, QR, cuenta) |

*(Los turnos incluyen 5 minutos de buffer entre citas. Los precios y servicios son editables por barbero).*

---

## 📦 Stack Tecnológico

- **Frontend**: Next.js 14 (App Router) + React 18 + Tailwind CSS + `@phosphor-icons/react` + `date-fns`.
- **Backend**: API Routes serverless en Node.js con middlewares de rate limiting por IP y validación de sesiones JWT en cookies `httpOnly`.
- **Base de Datos**: MongoDB Atlas + Mongoose 8 (soporta `mongodb-memory-server` para desarrollo sin instalar base de datos).
- **Notificaciones Push**: `web-push` bajo estándar VAPID (RFC 8292).
- **Integraciones**: WhatsApp (`wa.me`), Contact Picker API del navegador, formato iCalendar RFC 5545 (`.ics`) y Google Calendar URL generator.

---

## 💻 Requisitos y Puesta en Marcha

### Requisitos
- Node.js 20+ (probado con Node 20 y Node 24).
- Gestor de paquetes `npm`.

### Ejecución en Desarrollo

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor de desarrollo
npm run dev
```

Abre <http://localhost:3000> en tu navegador.

> **Sin configuración previa de base de datos**: Si `MONGODB_URI` no está definido en las variables de entorno, la aplicación inicia automáticamente un **MongoDB en memoria** y ejecuta el seed con barberos y un administrador de demostración.

---

## ⚙️ Variables de Entorno

Copia el archivo `.env.example` a `.env.local` y ajusta las variables según el entorno:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | URL base de la aplicación (ej. `http://localhost:3000` o `https://tudominio.com`). |
| `MONGODB_URI` | Cadena de conexión de MongoDB Atlas (vacía en desarrollo local para usar Mongo en memoria). |
| `JWT_SECRET` | Secreto criptográfico para firmar los tokens JWT (obligatorio en producción). |
| `JWT_EXPIRES_IN` | Tiempo de vida de la cookie de sesión en segundos (por defecto `172800` = 2 días). |
| `ADMIN_EMAIL` | Email del administrador inicial para el seed de desarrollo. |
| `ADMIN_PASSWORD` | Contraseña del administrador para el seed de desarrollo. |
| `VAPID_PUBLIC_KEY` | Clave pública VAPID para el envío de notificaciones Web Push. |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID para el servidor Web Push. |
| `VAPID_SUBJECT` | Correo de contacto VAPID (`mailto:admin@tudominio.com`). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clave pública VAPID accesible en el cliente (idéntica a `VAPID_PUBLIC_KEY`). |
| `CRON_SECRET` | Token secreto de autorización (`Bearer`) para el endpoint `/api/cron/recordatorios`. |

---

## 🗂️ Estructura del Proyecto

```
citasbarber/
├── public/                     # Service worker (sw.js), iconos PWA e imágenes
├── src/
│   ├── app/
│   │   ├── layout.js           # Layout global, tipografía y DialogProvider
│   │   ├── page.js             # Landing page y modal de contacto
│   │   ├── manifest.js         # Manifiesto de la PWA
│   │   ├── agendar/[barberId]/ # Flujo de agendamiento del cliente
│   │   ├── mis-citas/          # Portal de consulta y recordatorios del cliente
│   │   ├── barbero/            # Login, registro, cambio de clave y panel
│   │   ├── admin/              # Login y panel administrativo (Barberos, Solicitudes, Control)
│   │   └── api/                # API Routes (auth, citas, barberos, admin, push, cron)
│   ├── components/             # Componentes UI, diálogos, instalación PWA y vistas de paneles
│   ├── lib/                    # Disponibilidad (America/Bogota), push, calendario, auth, db, whatsapp
│   └── models/                 # Modelos Mongoose (Barbero, Cita, Cliente, PushSubscription, Solicitud, Usuario)
├── scripts/                    # Scripts de administración (crear-admin.mjs)
└── middleware.js               # Rate limiting en memoria por IP
```

---

## 🔒 Despliegue en Producción

1. Configura tu proyecto en **Vercel** conectado al repositorio de GitHub.
2. Crea un clúster gratuito en **MongoDB Atlas** y define el usuario con permisos de lectura/escritura.
3. En Vercel (*Project Settings → Environment Variables*), define todas las variables de producción requeridas.
4. Crea el usuario administrador ejecutando:
   ```bash
   node scripts/crear-admin.mjs
   ```
5. **Recordatorios automáticos.** Se disparan por **tres vías complementarias**, de modo que funcionan aunque no configures ningún cron externo:
   - **(a) Oportuna (día a día):** al abrir el panel del barbero (`GET /api/citas`) y al consultar "Mis Citas" (`GET /api/citas/consulta`) se procesan los recordatorios pendientes en el momento. Unos *flags* en la BD (`recordatorioEnviado`, `recordatorioClienteEnviado`) garantizan que cada aviso se envíe una sola vez.
   - **(b) Vercel Cron (respaldo diario):** el archivo `vercel.json` programa una llamada diaria a las **10:00 AM hora de Colombia** (`0 15 * * *` en UTC). Vercel envía automáticamente el header `Authorization: Bearer <CRON_SECRET>`. En el plan **Hobby** los cron solo pueden correr **1 vez al día**, por eso no se usan expresiones cada pocos minutos.
   - **(c) Cron externo (opcional, granularidad fina):** si necesitás disparos más frecuentes, configurá un servicio como [cron-job.org](https://cron-job.org) llamando cada 5-10 minutos al mismo endpoint con el mismo header:
     ```http
     GET https://tudominio.com/api/cron/recordatorios
     Authorization: Bearer <CRON_SECRET>
     ```
