import calService from '../../services/cal.service.js';

/** Convierte cualquier texto de fecha (incluyendo números escritos en español) a YYYY-MM-DD */
function parseDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const MESES = {
    enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
    julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12,
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
  };

  // Números ordinales en español (sin acentos para facilitar comparación)
  const UNIDADES = {
    cero:0,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,
    siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,
    catorce:14,quince:15,dieciseis:16,diecisiete:17,
    dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,
    veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,
    veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29,
    treinta:30,
  };
  // Años escritos en palabras (más comunes)
  const MILES_MAP = [
    ['dos mil treinta',2030],['dos mil veintinueve',2029],['dos mil veintiocho',2028],
    ['dos mil veintisiete',2027],['dos mil veintiseis',2026],
    ['dos mil veinticinco',2025],['dos mil veinticuatro',2024],
    ['dos mil veintitres',2023],['dos mil veintidos',2022],
    ['dos mil veintiuno',2021],['dos mil veinte',2020],['dos mil',2000],
  ];

  // Quitar acentos para comparación uniforme
  function noAcc(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }

  function spToNum(s) {
    s = s.trim();
    if (/^\d+$/.test(s)) return parseInt(s);
    const n = noAcc(s);
    if (UNIDADES[n] !== undefined) return UNIDADES[n];
    const ty = n.match(/^(veinte|treinta)\s+y\s+(\w+)$/);
    if (ty) {
      const base = ty[1]==='treinta' ? 30 : 20;
      const unit = UNIDADES[ty[2]];
      if (unit !== undefined) return base + unit;
    }
    return null;
  }

  function spToYear(s) {
    s = s.trim();
    if (/^\d{4}$/.test(s)) return parseInt(s);
    const n = noAcc(s);
    for (const [k,v] of MILES_MAP) {
      if (noAcc(k) === n) return v;
    }
    return null;
  }

  // Normalizar entrada: quitar acentos, minúsculas
  let str = noAcc(raw);

  // Quitar día de semana al inicio
  str = str.replace(/^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+/, '');

  const MESES_PAT = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
  const currentYear = new Date().getFullYear();

  // Patrones CON año: "[día] de [mes] de [año]"  /  "[día] [mes] de [año]"  /  "[día] [mes] [año]"
  const mpYear =
    str.match(new RegExp(`^([\\w]+)\\s+de\\s+(${MESES_PAT})\\s+de\\s+(.+)$`)) ||
    str.match(new RegExp(`^([\\w]+)\\s+(${MESES_PAT})\\s+de\\s+(.+)$`)) ||
    str.match(new RegExp(`^([\\w]+)\\s+(${MESES_PAT})[,\\s]+(\\d[\\w\\s]*)$`));

  if (mpYear) {
    const day   = spToNum(mpYear[1]);
    const month = MESES[mpYear[2]];
    const year  = spToYear(mpYear[3]);
    if (day && month && year)
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // Patrones SIN año: "[día] de [mes]"  /  "[día] [mes]"  — usa año actual
  const mpNoYear =
    str.match(new RegExp(`^([\\w]+)\\s+de\\s+(${MESES_PAT})$`)) ||
    str.match(new RegExp(`^([\\w]+)\\s+(${MESES_PAT})$`));

  if (mpNoYear) {
    const day   = spToNum(mpNoYear[1]);
    const month = MESES[mpNoYear[2]];
    if (day && month)
      return `${currentYear}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return null;
}

class CalController {

  /** POST /api/v1/calendar/availability */
  async availability(req, res) {
    try {
      // Retell puede enviar los args directamente o dentro de req.body.args
      const body = req.body?.args || req.body;
      const { date, service_name } = body;
      console.log('📅 availability recibido - date:', JSON.stringify(date), '| body:', JSON.stringify(body));

      const parsed = parseDate(date);
      console.log('📅 availability parseDate ->', parsed);

      if (!parsed) {
        console.warn('⚠️  No se pudo parsear fecha:', date);
        return res.json({
          status: 'error',
          formatted_message: 'No recibí una fecha válida. ¿Puedes decirme qué día te gustaría?',
        });
      }

      const result = await calService.getAvailability(parsed, service_name);
      res.json(result);

    } catch (err) {
      console.error('❌ availability controller:', err.message, err.stack);
      res.json({ status: 'error', formatted_message: 'Tuve un problema consultando la disponibilidad. Por favor intenta de nuevo.' });
    }
  }

  /** POST /api/v1/calendar/book */
  async book(req, res) {
    try {
      const body = req.body?.args || req.body;
      console.log('📋 book recibido - body:', JSON.stringify(body));
      const { name, email, phone, date, time, service_name } = body;
      const parsedDate = parseDate(date);
      const parsedTime = time ? time.replace(/[^0-9:]/g, '').slice(0,5) : null;

      if (!name || !parsedDate || !parsedTime) {
        return res.json({
          status: 'error',
          formatted_message: 'Necesito tu nombre, la fecha y la hora para agendar la cita. ¿Puedes proporcionarlos?',
        });
      }

      const result = await calService.bookAppointment({ name, email, phone, date: parsedDate, time: parsedTime, service_name });
      res.json(result);

    } catch (err) {
      console.error('❌ book controller:', err.message);
      res.json({ status: 'error', formatted_message: 'Lo siento, hubo un problema al agendar tu cita. ¿Puedes intentarlo de nuevo o llamarnos directamente?' });
    }
  }

  /** GET/POST /api/v1/calendar/bookings */
  async bookings(req, res) {
    try {
      const body = req.body?.args || req.body;
      console.log('📋 bookings recibido - body:', JSON.stringify(body), '| query:', JSON.stringify(req.query));
      const status = req.query.status || body?.status || 'upcoming';
      const name   = req.query.name   || body?.name   || null;
      const result = await calService.getBookings(status, name);
      res.json(result);
    } catch (err) {
      console.error('❌ bookings controller:', err.message);
      res.json({ status: 'error', bookings: [] });
    }
  }

  /** GET /api/v1/calendar/event-types */
  async eventTypes(req, res) {
    try {
      const fs   = (await import('fs')).default;
      const path = (await import('path')).default;
      const { fileURLToPath } = await import('url');
      const __dirname  = path.dirname(fileURLToPath(import.meta.url));
      const configPath = path.join(__dirname, '..', '..', 'config.json');

      if (!fs.existsSync(configPath)) {
        return res.json({ status: 'error', message: 'config.json no encontrado.' });
      }

      const cfg    = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const apiKey = cfg?.cal_com_api_key;
      if (!apiKey) return res.json({ status: 'no_calendar', message: 'No hay cal_com_api_key.' });

      const types = await calService.getEventTypes(apiKey);
      res.json({ status: 'success', count: types.length, event_types: types.map(t => ({ id: t.id, title: t.title, slug: t.slug, length: t.length })) });
    } catch (err) {
      console.error('❌ event-types controller:', err.message);
      res.json({ status: 'error', message: err.message });
    }
  }

  /** GET /api/v1/calendar/datetime — devuelve fecha y hora actual en el timezone del negocio */
  async datetime(req, res) {
    try {
      const fs   = (await import('fs')).default;
      const path = (await import('path')).default;
      const { fileURLToPath } = await import('url');
      const __dirname  = path.dirname(fileURLToPath(import.meta.url));
      const configPath = path.join(__dirname, '..', '..', 'config.json');

      let timezone = 'America/Guatemala';
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        timezone = cfg?.timezone || timezone;
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString('es-MX', {
        timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const timeStr = now.toLocaleTimeString('es-MX', {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: true
      });

      res.json({
        status: 'success',
        date: now.toLocaleDateString('en-CA', { timeZone: timezone }), // YYYY-MM-DD
        time: now.toLocaleTimeString('es-MX', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }),
        timezone,
        formatted_message: `Hoy es ${dateStr} y son las ${timeStr}.`,
      });
    } catch (err) {
      console.error('❌ datetime controller:', err.message);
      res.json({ status: 'error', formatted_message: 'No pude obtener la fecha actual.' });
    }
  }

  /** GET /api/v1/calendar/context — identidad del negocio para el agente (multi-tenant) */
  async context(req, res) {
    try {
      const fs   = (await import('fs')).default;
      const path = (await import('path')).default;
      const { fileURLToPath } = await import('url');
      const __dirname  = path.dirname(fileURLToPath(import.meta.url));
      const configPath = path.join(__dirname, '..', '..', 'config.json');

      if (!fs.existsSync(configPath)) {
        return res.json({ status: 'error', formatted_message: 'Configuración no encontrada.' });
      }

      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      const DAYS_ES = { monday:'Lunes', tuesday:'Martes', wednesday:'Miércoles',
        thursday:'Jueves', friday:'Viernes', saturday:'Sábado', sunday:'Domingo' };

      // Construir resumen de horarios
      const scheduleLines = Object.entries(cfg.schedule || {})
        .filter(([, v]) => v)
        .map(([day, v]) => `${DAYS_ES[day]}: ${v.open} – ${v.close}`)
        .join(', ');

      // Construir resumen de servicios
      const servicesLines = (cfg.services || [])
        .map(s => `${s.name} (Q${s.price}, ${s.duration_min} min)`)
        .join(', ');

      const now = new Date();
      const dateStr = now.toLocaleDateString('es-MX', {
        timeZone: cfg.timezone || 'America/Guatemala',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      res.json({
        status: 'success',
        agent_name:    cfg.agent_name    || 'Asistente',
        business_name: cfg.business_name || 'el negocio',
        business_type: cfg.business_type || '',
        city:          cfg.city          || '',
        phone:         cfg.phone         || '',
        timezone:      cfg.timezone      || 'America/Guatemala',
        schedule:      scheduleLines,
        services:      servicesLines,
        today:         dateStr,
        formatted_message: `Soy ${cfg.agent_name || 'Asistente'}, recepcionista virtual de ${cfg.business_name || 'el negocio'}, un ${cfg.business_type || 'negocio'} en ${cfg.city || ''}. Teléfono: ${cfg.phone || ''}. Hoy es ${dateStr}. Horarios: ${scheduleLines}. Servicios: ${servicesLines}.`,
      });
    } catch (err) {
      console.error('❌ context controller:', err.message);
      res.json({ status: 'error', formatted_message: 'No pude cargar la configuración del negocio.' });
    }
  }

  /** POST /api/v1/calendar/cancel */
  async cancel(req, res) {
    try {
      const body      = req.body?.args || req.body;
      const booking_id = body.booking_id || body.bookingUid || body.uid;
      const { reason } = body;
      console.log('🗑️  cancel recibido - body:', JSON.stringify(body));

      if (!booking_id) {
        return res.json({
          status: 'error',
          formatted_message: 'Necesito el ID de la cita para cancelarla. ¿Puedes proporcionarlo?',
        });
      }

      const result = await calService.cancelBooking(booking_id, reason);
      res.json(result);
    } catch (err) {
      console.error('❌ cancel controller:', err.message);
      res.json({ status: 'error', formatted_message: 'Hubo un problema al cancelar la cita. Inténtalo de nuevo.' });
    }
  }

  /** POST /api/v1/calendar/reschedule */
  async reschedule(req, res) {
    try {
      const body = req.body?.args || req.body;
      const booking_id = body.booking_id || body.bookingUid || body.uid;
      const date = body.date || body.newDate;
      const time = body.time || body.newTime;
      const { reason } = body;
      console.log('🔄 reschedule recibido - body:', JSON.stringify(body));

      const parsedDate = parseDate(date);
      const parsedTime = time ? time.replace(/[^0-9:]/g, '').slice(0, 5) : null;

      if (!booking_id || !parsedDate || !parsedTime) {
        return res.json({
          status: 'error',
          formatted_message: 'Necesito el ID de la cita, la nueva fecha y la nueva hora para reprogramarla.',
        });
      }

      const result = await calService.rescheduleBooking(booking_id, parsedDate, parsedTime, reason);
      res.json(result);
    } catch (err) {
      console.error('❌ reschedule controller:', err.message);
      res.json({ status: 'error', formatted_message: 'Hubo un problema al reprogramar la cita. Inténtalo de nuevo.' });
    }
  }
}

export default new CalController();
