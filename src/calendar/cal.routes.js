import express from 'express';
import CalController from './cal.controller.js';

const router = express.Router();

// POST /api/v1/calendar/availability  → consultar slots disponibles (llamado por Retell)
router.post('/availability', CalController.availability);

// POST /api/v1/calendar/book          → crear una cita (llamado por Retell)
router.post('/book', CalController.book);

// GET  /api/v1/calendar/event-types   → listar event types (uso interno/debug)
router.get('/event-types', CalController.eventTypes);

// GET  /api/v1/calendar/bookings     → listar citas (dashboard)
router.get('/bookings',  CalController.bookings);
router.post('/bookings', CalController.bookings); // para Retell (manda params en body)

// GET  /api/v1/calendar/datetime    → fecha y hora actual (función Retell)
router.get('/datetime',  CalController.datetime);
router.post('/datetime', CalController.datetime);

// GET  /api/v1/calendar/context     → identidad del negocio (multi-tenant)
router.get('/context',  CalController.context);
router.post('/context', CalController.context);

// POST /api/v1/calendar/cancel       → cancelar una cita (llamado por Retell)
router.post('/cancel', CalController.cancel);

// POST /api/v1/calendar/reschedule   → reprogramar una cita (llamado por Retell)
router.post('/reschedule', CalController.reschedule);

export default router;
