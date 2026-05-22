import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const CAL_BASE    = 'https://api.cal.com/v2';
const CAL_VERSION = '2024-08-13'; // para bookings
const CAL_VERSION_SLOTS = '2024-09-04'; // para slots/availability
const CAL_VERSION_ET = '2024-06-14'; // para event-types
const TIMEOUT_MS  = 8000;

// ─── Días y meses en español ──────────────────────────────────────────────────
const DAYS_ES   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lee config.json y devuelve el objeto, o null si no existe */
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (_) {}
  return null;
}

/** Guarda cambios en config.json */
function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** Convierte "10:00" → "diez de la mañana", "15:30" → "tres y treinta de la tarde" */
function timeToSpoken(timeStr) {
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  const units = ['','una','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce'];
  const tens  = ['','','veinte','treinta','cuarenta','cincuenta'];

  const hourWord = h <= 12 ? (units[h] || `${h}`) : (units[h - 12] || `${h - 12}`);
  const minWord  = m === 0 ? '' : (m < 20 ? ` y ${units[m]}` : ` y ${tens[Math.floor(m/10)]}${m%10 ? ' y ' + units[m%10] : ''}`);
  const period   = h < 12 ? 'de la mañana' : h === 12 ? 'del mediodía' : 'de la tarde';

  return `${hourWord}${minWord} ${period}`.trim();
}

/** Convierte "2026-05-23" → "viernes 23 de mayo" */
function dateToSpoken(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt   = new Date(y, mo - 1, d);
  const day  = DAYS_ES[dt.getDay()];
  const month = MONTHS_ES[mo - 1];
  return `${day} ${d} de ${month}`;
}

/** Construye headers estándar de Cal.com */
function calHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'cal-api-version': CAL_VERSION,
    'Content-Type': 'application/json',
  };
}

/** Maneja errores de Cal.com y devuelve un formatted_message apropiado */
function calErrorMessage(err) {
  const status = err.response?.status;
  if (status === 401) return 'El sistema de citas está en mantenimiento. Por favor llama más tarde.';
  if (status === 429) return 'El sistema está recibiendo muchas solicitudes. Intenta en unos momentos.';
  if (err.code === 'ECONNABORTED') return 'El sistema de citas tardó demasiado en responder. Intenta de nuevo.';
  return 'Hubo un problema con el sistema de citas. Por favor intenta más tarde.';
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

class CalService {

  /** Obtiene los event types de la cuenta. Devuelve array o lanza error. */
  async getEventTypes(apiKey) {
    const res = await axios.get(`${CAL_BASE}/event-types`, {
      headers: { ...calHeaders(apiKey), 'cal-api-version': CAL_VERSION_ET },
      timeout: TIMEOUT_MS,
      params: { username: readConfig()?.cal_username },
    });
    // La API devuelve { status, data: { eventTypeGroups: [...] } } o { data: [...] }
    const raw = res.data?.data;
    if (Array.isArray(raw)) return raw;
    // eventTypeGroups → aplanar
    if (raw?.eventTypeGroups) {
      return raw.eventTypeGroups.flatMap(g => g.eventTypes || []);
    }
    return [];
  }

  /** Guarda el primer eventTypeId encontrado en config.json */
  async fetchAndSaveEventTypeId(apiKey) {
    try {
      const types = await this.getEventTypes(apiKey);
      if (types.length === 0) return null;
      const id = types[0].id;
      const username = types[0].users?.[0]?.username || null;
      const cfg = readConfig() || {};
      cfg.cal_event_type_id = id;
      if (username) cfg.cal_username = username;
      writeConfig(cfg);
      console.log(`📅 cal_event_type_id guardado: ${id} | username: ${username}`);
      return id;
    } catch (err) {
      console.warn('⚠️  No se pudo obtener eventTypeId de Cal.com:', err.message);
      return null;
    }
  }

  /** Endpoint 1: disponibilidad */
  async getAvailability(date) {
    const cfg = readConfig();
    const apiKey = cfg?.cal_com_api_key;

    // Sin clave → sin calendario
    if (!apiKey) {
      return {
        status: 'no_calendar',
        formatted_message: 'Por el momento no manejamos citas por teléfono. Puedes visitarnos directamente durante nuestro horario de atención.',
      };
    }

    const eventTypeId = cfg?.cal_event_type_id;
    if (!eventTypeId) {
      return {
        status: 'error',
        formatted_message: 'El sistema de citas no está configurado correctamente. Por favor llámanos directamente.',
      };
    }

    try {
      const res = await axios.get(`${CAL_BASE}/slots`, {
        headers: { ...calHeaders(apiKey), 'cal-api-version': CAL_VERSION_SLOTS },
        params: { start: date, end: date, eventTypeId, timeZone: readConfig()?.timezone || 'America/Guatemala' },
        timeout: TIMEOUT_MS,
      });

      // Cal.com responde: { status: 'success', data: { '2026-05-26': [{start:'...'}] } }
      const slotsRaw = res.data?.data || {};
      const daySlots = slotsRaw[date] || Object.values(slotsRaw)[0] || [];

      if (daySlots.length === 0) {
        return {
          status: 'no_slots',
          formatted_message: `Lo siento, para el ${dateToSpoken(date)} no tenemos disponibilidad. ¿Te funciona el día siguiente?`,
          slots: [],
        };
      }

      // Extraer hora HH:MM de cada slot (puede venir como ISO o como string "HH:MM")
      const times = daySlots.map(s => {
        const raw = s.start || s.time || s;
        if (typeof raw === 'string' && raw.includes('T')) {
          return raw.split('T')[1].substring(0, 5);
        }
        return String(raw).substring(0, 5);
      });

      // Construir frase hablada
      const spokenTimes = times.map(t => timeToSpoken(t));
      const listStr = spokenTimes.length === 1
        ? `a las ${spokenTimes[0]}`
        : spokenTimes.slice(0, -1).map(t => `a las ${t}`).join(', ') + ` y a las ${spokenTimes.at(-1)}`;

      return {
        status: 'success',
        formatted_message: `Para el ${dateToSpoken(date)} tenemos disponibilidad ${listStr}. ¿Cuál prefieres?`,
        slots: times,
      };

    } catch (err) {
      console.error('❌ Cal.com availability error:', err.message);
      return {
        status: 'error',
        formatted_message: calErrorMessage(err),
      };
    }
  }

  /** Endpoint 2: crear cita */
  async bookAppointment({ name, email, phone, date, time, service_name }) {
    const cfg     = readConfig();
    const apiKey  = cfg?.cal_com_api_key;
    const timezone = cfg?.timezone || 'America/Guatemala';
    const eventTypeId = cfg?.cal_event_type_id;

    if (!apiKey) {
      return {
        status: 'no_calendar',
        formatted_message: 'Por el momento no manejamos citas por teléfono. Puedes visitarnos directamente durante nuestro horario de atención.',
      };
    }

    if (!eventTypeId) {
      return {
        status: 'error',
        formatted_message: 'El sistema de citas no está configurado correctamente. Por favor llámanos directamente.',
      };
    }

    const effectiveEmail = email || 'cliente@voicebot.com';
    // Cal.com necesita offset de timezone en el start para disponibilidad correcta
    const tzOffsets = {
      'America/Mexico_City': '-06:00',
      'America/Guatemala':   '-06:00',
      'America/Monterrey':   '-06:00',
      'America/Bogota':      '-05:00',
      'America/Lima':        '-05:00',
      'America/Santiago':    '-04:00',
      'America/Buenos_Aires':'-03:00',
      'America/New_York':    '-05:00',
      'America/Los_Angeles': '-08:00',
    };
    const tzOffset = tzOffsets[timezone] || '-06:00';
    const startISO = `${date}T${time}:00${tzOffset}`;

    try {
      const res = await axios.post(`${CAL_BASE}/bookings`, {
        eventTypeId,
        start: startISO,
        attendee: {
          name,
          email: effectiveEmail,
          timeZone: timezone,
        },
        metadata: {
          phone:   phone || '',
          service: service_name || '',
        },
      }, {
        headers: calHeaders(apiKey),
        timeout: TIMEOUT_MS,
      });

      const bookingId = res.data?.data?.uid || res.data?.data?.id || res.data?.uid || null;

      if (bookingId) {
        return {
          status: 'success',
          formatted_message: `Perfecto, ${name}. Tu cita${service_name ? ` para ${service_name}` : ''} quedó agendada para el ${dateToSpoken(date)} a las ${timeToSpoken(time)}. ¡Te esperamos!`,
          booking_id: String(bookingId),
        };
      }

      // Respuesta inesperada sin bookingId
      return {
        status: 'error',
        formatted_message: 'Lo siento, hubo un problema al agendar tu cita. ¿Puedes intentarlo de nuevo o llamarnos directamente?',
      };

    } catch (err) {
      console.error('❌ Cal.com booking error:', err.response?.data || err.message);
      // Slot ya tomado (409) u otros errores de negocio
      if (err.response?.status === 409) {
        return {
          status: 'slot_taken',
          formatted_message: `Lo siento, ese horario ya fue reservado. ¿Te gustaría elegir otro?`,
        };
      }
      return {
        status: 'error',
        formatted_message: calErrorMessage(err),
      };
    }
  }

  /** Lista citas desde Cal.com */
  async getBookings(status = 'upcoming', nameFilter = null) {
    const cfg = readConfig();
    const apiKey = cfg?.cal_com_api_key;
    if (!apiKey) return { status: 'no_calendar', bookings: [] };

    try {
      const res = await axios.get(`${CAL_BASE}/bookings`, {
        headers: calHeaders(apiKey),
        params: { status, take: 50 },
        timeout: TIMEOUT_MS,
      });

      let raw = res.data?.data || [];
      // Filtrar por nombre del asistente si se proporcionó
      if (nameFilter) {
        const q = nameFilter.toLowerCase();
        raw = raw.filter(b =>
          b.attendees?.some(a => a.name?.toLowerCase().includes(q))
        );
      }
      const bookings = raw.map(b => ({
        id:         b.uid,
        title:      b.title,
        status:     b.status,
        start:      b.start,
        end:        b.end,
        duration:   b.duration,
        meetingUrl: b.meetingUrl || null,
        attendee: b.attendees?.[0] ? {
          name:  b.attendees[0].name,
          email: b.attendees[0].email,
        } : null,
        service:   b.metadata?.service || '',
        createdAt: b.createdAt,
      }));

      return { status: 'success', bookings };
    } catch (err) {
      console.error('❌ Cal.com getBookings error:', err.response?.data || err.message);
      return { status: 'error', bookings: [] };
    }
  }

  /** Cancelar una cita existente */
  async cancelBooking(bookingId, reason = 'Cancelado por el cliente') {
    const cfg    = readConfig();
    const apiKey = cfg?.cal_com_api_key;
    if (!apiKey) return { status: 'no_calendar', formatted_message: 'El sistema de citas no está disponible.' };

    try {
      await axios.post(`${CAL_BASE}/bookings/${bookingId}/cancel`, {
        cancellationReason: reason,
      }, {
        headers: calHeaders(apiKey),
        timeout: TIMEOUT_MS,
      });

      return {
        status: 'success',
        formatted_message: 'Tu cita ha sido cancelada correctamente. Si deseas agendar una nueva cita, con gusto te ayudo.',
        booking_id: bookingId,
      };
    } catch (err) {
      console.error('❌ Cal.com cancelBooking error:', err.response?.data || err.message);
      if (err.response?.status === 404) {
        return { status: 'error', formatted_message: 'No encontré esa cita. ¿Puedes verificar el ID?' };
      }
      return { status: 'error', formatted_message: calErrorMessage(err) };
    }
  }

  /** Reprogramar una cita existente */
  async rescheduleBooking(bookingId, newDate, newTime, reason = 'Reprogramado por el cliente') {
    const cfg      = readConfig();
    const apiKey   = cfg?.cal_com_api_key;
    const timezone = cfg?.timezone || 'America/Guatemala';
    if (!apiKey) return { status: 'no_calendar', formatted_message: 'El sistema de citas no está disponible.' };

    const tzOffsets = {
      'America/Mexico_City': '-06:00', 'America/Guatemala': '-06:00',
      'America/Monterrey':   '-06:00', 'America/Bogota':    '-05:00',
      'America/Lima':        '-05:00', 'America/Santiago':  '-04:00',
      'America/Buenos_Aires':'-03:00', 'America/New_York':  '-05:00',
      'America/Los_Angeles': '-08:00',
    };
    const tzOffset = tzOffsets[timezone] || '-06:00';
    const startISO = `${newDate}T${newTime}:00${tzOffset}`;

    try {
      const res = await axios.post(`${CAL_BASE}/bookings/${bookingId}/reschedule`, {
        start: startISO,
        reschedulingReason: reason,
      }, {
        headers: calHeaders(apiKey),
        timeout: TIMEOUT_MS,
      });

      const newId = res.data?.data?.uid || res.data?.data?.id || bookingId;

      return {
        status: 'success',
        formatted_message: `Listo, tu cita fue reprogramada para el ${dateToSpoken(newDate)} a las ${timeToSpoken(newTime)}. ¡Te esperamos!`,
        booking_id: String(newId),
      };
    } catch (err) {
      console.error('❌ Cal.com rescheduleBooking error:', err.response?.data || err.message);
      if (err.response?.status === 404) {
        return { status: 'error', formatted_message: 'No encontré esa cita para reprogramar. ¿Puedes verificar el ID?' };
      }
      if (err.response?.status === 409) {
        return { status: 'slot_taken', formatted_message: 'Ese horario ya está ocupado. ¿Te gustaría elegir otro?' };
      }
      return { status: 'error', formatted_message: calErrorMessage(err) };
    }
  }
}

export default new CalService();
