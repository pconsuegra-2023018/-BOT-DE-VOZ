/**
 * Genera el contenido en texto plano para cada una de las 10 KBs
 * del wizard de onboarding. Todo en memoria (Buffer/string).
 */

const DAYS_ES = {
  monday:    'lunes',
  tuesday:   'martes',
  wednesday: 'miércoles',
  thursday:  'jueves',
  friday:    'viernes',
  saturday:  'sábado',
  sunday:    'domingo',
};

/** Convierte "08:00" → "8 de la mañana" / "13:00" → "1 del mediodía" / "18:00" → "6 de la tarde" */
function hourToSpoken(timeStr) {
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const minuteStr = m > 0 ? ` y ${m} minutos` : '';

  if (h < 12)  return `${h}${minuteStr} de la mañana`;
  if (h === 12) return `12${minuteStr} del mediodía`;
  if (h === 13) return `1${minuteStr} del mediodía`;
  return `${h - 12}${minuteStr} de la tarde`;
}

/** Convierte un número a texto para precios (simple) */
function priceToSpoken(price) {
  // Para valores pequeños (<1000) usamos la representación directa en texto
  const map = {
    100: 'cien', 150: 'ciento cincuenta', 200: 'doscientos', 250: 'doscientos cincuenta',
    300: 'trescientos', 350: 'trescientos cincuenta', 400: 'cuatrocientos',
    500: 'quinientos', 600: 'seiscientos', 700: 'setecientos', 800: 'ochocientos',
    900: 'novecientos', 1000: 'mil',
  };
  return map[price] ? map[price] : price.toString();
}

/** Descripción genérica según tipo de negocio */
function businessDescription(type, name) {
  const desc = {
    clinica:      `${name} es una clínica dental dedicada a cuidar la salud bucal de sus pacientes con atención profesional y personalizada.`,
    restaurante:  `${name} es un restaurante que ofrece una experiencia gastronómica de calidad con platillos frescos y de temporada.`,
    salon:        `${name} es un salón de belleza que brinda servicios de estética y cuidado personal en un ambiente relajado.`,
    farmacia:     `${name} es una farmacia que ofrece medicamentos, suplementos y asesoría farmacéutica a sus clientes.`,
    veterinaria:  `${name} es una clínica veterinaria que cuida la salud y bienestar de las mascotas.`,
    gym:          `${name} es un gimnasio equipado con máquinas modernas y entrenadores certificados.`,
    default:      `${name} es un negocio comprometido con ofrecer productos y servicios de alta calidad a sus clientes.`,
  };
  return desc[type] || desc.default;
}

/** KB 1 – Identidad del negocio */
export function generateIdentidad(data) {
  return `IDENTIDAD DEL NEGOCIO
=====================

Nombre: ${data.business_name}
Tipo de negocio: ${data.business_type}
Ciudad: ${data.city}
Teléfono de contacto: ${data.phone}
Zona horaria: ${data.timezone}

Descripción:
${businessDescription(data.business_type, data.business_name)}

Este es el negocio al que pertenece el agente virtual. Toda consulta sobre quiénes somos, qué hacemos y dónde estamos debe responderla con esta información.
`;
}

/** KB 2 – Horarios de atención */
export function generateHorarios(data) {
  const { schedule } = data;
  const lines = [];

  const openDays   = [];
  const closedDays = [];

  for (const [day, hours] of Object.entries(schedule)) {
    const dayName = DAYS_ES[day] || day;
    if (!hours) {
      closedDays.push(dayName);
    } else {
      openDays.push(`  - ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}: de ${hourToSpoken(hours.open)} a ${hourToSpoken(hours.close)}`);
    }
  }

  lines.push('HORARIOS DE ATENCIÓN');
  lines.push('====================\n');
  lines.push('Días y horarios en que atendemos:\n');
  lines.push(...openDays);

  if (closedDays.length > 0) {
    lines.push(`\nDías en que NO abrimos: ${closedDays.join(', ')}.`);
  }

  lines.push('\nNota: Los horarios pueden cambiar en días festivos. Para confirmar disponibilidad, contáctenos directamente.');
  return lines.join('\n');
}

/** KB 3 – Servicios */
export function generateServicios(data) {
  const lines = [
    'SERVICIOS QUE OFRECEMOS',
    '=======================\n',
  ];

  if (!data.services || data.services.length === 0) {
    lines.push('Por el momento no tenemos servicios registrados en el sistema. Llámanos para más información.');
    return lines.join('\n');
  }

  data.services.forEach((srv, i) => {
    lines.push(`${i + 1}. ${srv.name}`);
    lines.push(`   Precio: ${priceToSpoken(srv.price)} (${srv.price})`);
    lines.push(`   Duración aproximada: ${srv.duration_min} minutos`);
    lines.push('');
  });

  lines.push('Los precios pueden variar. Consulta disponibilidad y tarifas actualizadas con nuestro equipo.');
  return lines.join('\n');
}

/** KB 4 – Productos */
export function generateProductos(data) {
  if (!data.has_products || !data.products || data.products.length === 0) {
    return `PRODUCTOS
=========

En este negocio no comercializamos productos físicos. Si tienes preguntas sobre nuestros servicios, con gusto te ayudamos.
`;
  }

  const lines = ['PRODUCTOS DISPONIBLES', '====================\n'];
  data.products.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.name}`);
    if (p.price)       lines.push(`   Precio: ${priceToSpoken(p.price)} (${p.price})`);
    if (p.description) lines.push(`   Descripción: ${p.description}`);
    lines.push('');
  });

  lines.push('Consulta disponibilidad de stock directamente en el negocio o llámanos.');
  return lines.join('\n');
}

/** KB 5 – Política de citas */
export function generateCitas(data) {
  const lines = ['POLÍTICA DE CITAS Y RESERVACIONES', '==================================\n'];

  if (data.uses_calendar) {
    lines.push('¿Cómo agendar una cita?');
    lines.push(`Puedes llamarnos al ${data.phone} y revisaremos la disponibilidad en tiempo real para asignarte el horario que mejor te convenga.\n`);

    lines.push('Duración por servicio:');
    (data.services || []).forEach(srv => {
      lines.push(`  - ${srv.name}: aproximadamente ${srv.duration_min} minutos`);
    });
  } else {
    lines.push(`Para agendar una cita, comunícate directamente con nosotros al ${data.phone}.\n`);
  }

  lines.push('\nPolítica de cancelación:');
  lines.push('  - Si necesitas cancelar o reprogramar tu cita, avísanos con al menos 24 horas de anticipación.');
  lines.push('  - Las cancelaciones con menos de 24 horas pueden generar un cargo o la pérdida del espacio.');
  lines.push('\nLlegadas tarde:');
  lines.push('  - Si llegas más de 15 minutos tarde, es posible que necesitemos reprogramar tu cita dependiendo de la disponibilidad.');

  return lines.join('\n');
}

/** KB 6 – FAQ según tipo de negocio */
export function generateFaq(data) {
  const lines = ['PREGUNTAS FRECUENTES (FAQ)', '==========================\n'];

  const faqGeneral = [
    { q: '¿Cuáles son sus horarios?', a: 'Puedes consultar nuestros horarios completos en la sección de horarios. También puedes llamarnos para confirmar.' },
    { q: '¿Cómo puedo contactarlos?', a: `Puedes llamarnos al ${data.phone} en horario de atención.` },
    { q: '¿En qué ciudad están ubicados?', a: `Estamos ubicados en ${data.city}.` },
    { q: '¿Cómo puedo agendar una cita o reservación?', a: `Llámanos al ${data.phone} y con gusto te ayudamos a encontrar el horario disponible.` },
    { q: '¿Aceptan pagos con tarjeta?', a: 'Para información sobre métodos de pago aceptados, comunícate directamente con nosotros.' },
  ];

  const faqByType = {
    clinica: [
      { q: '¿Atienden emergencias dentales?', a: 'Sí, contáctanos inmediatamente al ' + data.phone + ' y evaluaremos tu caso.' },
      { q: '¿Trabajan con seguros médicos?', a: 'Consulta con nuestro equipo los convenios vigentes llamando al ' + data.phone + '.' },
      { q: '¿Hay parqueo disponible?', a: 'Contáctanos para más información sobre estacionamiento.' },
      { q: '¿Atienden niños?', a: 'Sí, tenemos atención odontológica para todas las edades.' },
      { q: '¿Cuánto dura una consulta?', a: 'Depende del servicio. Una limpieza dental dura aproximadamente 45 minutos.' },
    ],
    restaurante: [
      { q: '¿Hacen reservaciones?', a: 'Sí, llámanos al ' + data.phone + ' para apartar tu mesa.' },
      { q: '¿Tienen opciones vegetarianas?', a: 'Consulta nuestro menú o llámanos para conocer las opciones disponibles.' },
      { q: '¿Tienen servicio a domicilio?', a: 'Contáctanos para saber si contamos con delivery en tu área.' },
      { q: '¿Hay estacionamiento?', a: 'Comunícate con nosotros para más información sobre parqueo.' },
      { q: '¿Pueden hacer eventos privados?', a: 'Llámanos al ' + data.phone + ' y con gusto cotizamos tu evento.' },
    ],
    default: [
      { q: '¿Ofrecen garantía en sus servicios?', a: 'Consulta los términos de garantía directamente con nuestro equipo.' },
      { q: '¿Tienen ofertas o promociones?', a: 'Llámanos al ' + data.phone + ' para conocer las promociones actuales.' },
      { q: '¿Atienden a domicilio?', a: 'Comunícate con nosotros para evaluar la posibilidad según tu ubicación.' },
    ],
  };

  const specificFaq = faqByType[data.business_type] || faqByType.default;
  const allFaq = [...faqGeneral, ...specificFaq];

  allFaq.forEach((item, i) => {
    lines.push(`P${i + 1}: ${item.q}`);
    lines.push(`R${i + 1}: ${item.a}`);
    lines.push('');
  });

  return lines.join('\n');
}

/** KB 7 – Ubicación */
export function generateUbicacion(data) {
  return `UBICACIÓN Y CONTACTO
====================

Ciudad: ${data.city}
Teléfono: ${data.phone}
Zona horaria: ${data.timezone}

¿Cómo llegar?
Estamos ubicados en ${data.city}. Para obtener indicaciones exactas de nuestra ubicación, llámanos al ${data.phone} y con gusto te orientamos.

Puedes contactarnos en nuestro horario de atención para cualquier consulta sobre cómo llegar.
`;
}

/** KB 8 – Instrucciones del agente */
export function generateInstrucciones(data) {
  const canDo = [
    '✅ Informar sobre horarios de atención',
    '✅ Describir servicios disponibles y sus precios',
    '✅ Explicar la política de citas y cancelaciones',
    '✅ Responder preguntas frecuentes del negocio',
    '✅ Proporcionar el número de teléfono para contacto directo',
    '✅ Orientar sobre la ubicación general del negocio',
  ];

  const cannotDo = [
    '❌ Dar diagnósticos médicos, legales o especializados',
    '❌ Confirmar pagos, procesar cobros ni manejar transacciones',
    '❌ Hacer excepciones de horario o precios no autorizadas',
    '❌ Garantizar disponibilidad sin verificar con el equipo',
    '❌ Tomar decisiones que requieran autorización del negocio',
  ];

  return `INSTRUCCIONES DEL AGENTE VIRTUAL
=================================

El agente virtual de ${data.business_name} está diseñado para asistir a los clientes de forma eficiente y empática.

LO QUE PUEDE HACER:
${canDo.join('\n')}

LO QUE NO PUEDE HACER:
${cannotDo.join('\n')}

Cuando el agente no tenga información suficiente, debe indicarlo amablemente y redirigir al cliente al teléfono ${data.phone}.
`;
}

/** KB 9 – Mensajes de emergencia / fallback */
export function generateEmergencias(data) {
  return `MENSAJES DE RESPALDO Y EMERGENCIA
==================================

Cuando el sistema no tenga la información solicitada, el agente debe usar las siguientes frases:

1. "Disculpa, en este momento no tengo esa información disponible. Te recomiendo llamar directamente al ${data.phone}."

2. "No cuento con esos datos en este momento, pero nuestro equipo en ${data.business_name} puede ayudarte. Comunícate al ${data.phone}."

3. "Esa consulta requiere atención personalizada. Por favor llámanos al ${data.phone} en horario de atención y con gusto te asistimos."

4. "Entiendo tu consulta, pero para darte una respuesta precisa necesito que te pongas en contacto directamente con nosotros al ${data.phone}."

IMPORTANTE: El agente nunca debe inventar información. Si no sabe, debe decirlo y redirigir al teléfono.
`;
}

/** KB 10 – Personalidad del agente */
export function generatePersonalidad(data) {
  const toneDesc = {
    amigable: 'amigable, cálido y cercano. Usa un lenguaje natural y accesible.',
    formal:   'formal y profesional. Usa un lenguaje respetuoso y preciso.',
    neutral:  'neutral y claro. Equilibrado entre lo formal y lo cercano.',
  };

  const tone = toneDesc[data.agent_tone] || toneDesc.neutral;
  const welcomePhrase = `"Hola, soy ${data.agent_name}, recepcionista virtual de ${data.business_name}. ¿En qué te puedo ayudar hoy?"`;

  return `PERSONALIDAD DEL AGENTE VIRTUAL
================================

Nombre del agente: ${data.agent_name}
Tono de comunicación: ${tone}
Idioma principal: ${data.agent_language === 'es' ? 'Español' : data.agent_language}

Frase de bienvenida:
${welcomePhrase}

Características de comunicación:
  - Siempre saluda al inicio de la conversación.
  - Escucha activamente y reformula si no entiende.
  - Muestra empatía ante quejas o frustración del cliente.
  - Cierra cada interacción con una frase amable, por ejemplo: "¿Hay algo más en que pueda ayudarte?"
  - Si no puede resolver algo, lo reconoce con humildad y redirige al equipo.

El agente representa la imagen de ${data.business_name}. Debe transmitir confianza, claridad y un trato excelente en todo momento.
`;
}

/**
 * Retorna un array de { name, content (string) } con las 10 KBs listas para subir.
 */
export function generateAllKBContents(data) {
  return [
    { name: 'KB_identidad',    content: generateIdentidad(data) },
    { name: 'KB_horarios',     content: generateHorarios(data) },
    { name: 'KB_servicios',    content: generateServicios(data) },
    { name: 'KB_productos',    content: generateProductos(data) },
    { name: 'KB_citas',        content: generateCitas(data) },
    { name: 'KB_faq',          content: generateFaq(data) },
    { name: 'KB_ubicacion',    content: generateUbicacion(data) },
    { name: 'KB_instrucciones',content: generateInstrucciones(data) },
    { name: 'KB_emergencias',  content: generateEmergencias(data) },
    { name: 'KB_personalidad', content: generatePersonalidad(data) },
  ];
}
