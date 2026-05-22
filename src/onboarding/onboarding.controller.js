import onboardingService from '../../services/onboarding.service.js';

class OnboardingController {

  /** POST /api/onboarding/setup */
  async setup(req, res) {
    try {
      const { mode = 'single', ...data } = req.body;

      // Validaciones mínimas
      const required = ['business_name', 'business_type', 'city', 'phone', 'schedule', 'agent_name'];
      const missing  = required.filter(k => !data[k]);
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Faltan campos requeridos: ${missing.join(', ')}`,
        });
      }

      if (!['single', 'multiple'].includes(mode)) {
        return res.status(400).json({
          success: false,
          error: 'El campo "mode" debe ser "single" o "multiple".',
        });
      }

      // Limpiar KBs huérfanas de un setup previo fallido
      await onboardingService.cleanupOrphanKBs();

      console.log(`🚀 Iniciando onboarding para: ${data.business_name} (modo: ${mode})`);
      const { kbsCreated, kbsFailed } = await onboardingService.setupOnboarding(data, mode);

      res.json({
        success: kbsCreated.length > 0,
        message: `Onboarding completado. ${kbsCreated.length} KB(s) creada(s), ${kbsFailed.length} fallida(s).`,
        mode,
        kbs_created: kbsCreated,
        ...(kbsFailed.length > 0 && { kbs_failed: kbsFailed }),
      });

    } catch (error) {
      console.error('❌ Error en setup de onboarding:', error.message);
      res.status(500).json({
        success: false,
        error: 'Error al procesar el onboarding',
        details: error.message,
      });
    }
  }

  /** GET /api/onboarding/status */
  async status(req, res) {
    try {
      const result = onboardingService.getStatus();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error al leer el estado del onboarding',
        details: error.message,
      });
    }
  }

  /** GET /api/onboarding/config */
  async config(req, res) {
    try {
      const cfg = onboardingService.getConfig();
      if (!cfg) {
        return res.status(404).json({
          success: false,
          error: 'El onboarding no ha sido completado aún.',
        });
      }
      res.json(cfg);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error al leer la configuración',
        details: error.message,
      });
    }
  }
}

export default new OnboardingController();
