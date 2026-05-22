import express from 'express';
import OnboardingController from './onboarding.controller.js';

const router = express.Router();

// POST /api/onboarding/setup  → crea las 10 KBs y guarda config.json
router.post('/setup', OnboardingController.setup);

// GET  /api/onboarding/status → ¿ya se completó el onboarding?
router.get('/status', OnboardingController.status);

// GET  /api/onboarding/config → devuelve todo el config.json guardado
router.get('/config', OnboardingController.config);

export default router;
