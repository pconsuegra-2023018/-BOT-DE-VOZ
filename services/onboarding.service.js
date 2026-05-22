import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import retellClient from '../src/client/client.js';
import calService from './cal.service.js';
import knowledgeService from './knowbases.service.js';
import { generateAllKBContents } from './kb-content.generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DELAY_MS = 2000; // 2 s entre cada KB para evitar rate limit

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (_) { /* ignore */ }
  return null;
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Convierte un string de texto en un Readable stream que el SDK de Retell
 * acepta igual que un fs.createReadStream().
 */
function textToStream(text, filename) {
  const buffer = Buffer.from(text, 'utf-8');
  const stream = Readable.from(buffer);
  // El SDK de Retell necesita estas propiedades para construir el multipart
  stream.path = filename;
  return stream;
}

/**
 * Sube un .txt en memoria a Retell AI usando el SDK oficial.
 */
async function uploadKBToRetell(kbName, textContent) {
  const stream = textToStream(textContent, `${kbName}.txt`);

  const kb = await retellClient.knowledgeBase.create({
    knowledge_base_name: kbName,
    knowledge_base_files: [stream],
  });

  return kb.knowledge_base_id;
}

// ─── main service ─────────────────────────────────────────────────────────────

class OnboardingService {

  /**
   * Elimina KBs huérfanas de un onboarding previo fallido.
   * Llama esto antes de re-ejecutar setup para evitar duplicados.
   */
  async cleanupOrphanKBs() {
    const cfg = readConfig();
    if (!cfg?.kbs?.length) return;
    console.log(`🧹 Limpiando ${cfg.kbs.length} KBs de onboarding anterior...`);
    for (const kb of cfg.kbs) {
      try {
        await retellClient.knowledgeBase.delete(kb.id);
        console.log(`   🗑️  Eliminada: ${kb.name} (${kb.id})`);
      } catch (err) {
        console.warn(`   ⚠️  No se pudo eliminar ${kb.id}: ${err.message}`);
      }
    }
  }

  /**
   * Genera el contenido en memoria y lo sube a Retell.
   *
   * mode = 'single'   → 1 KB con todo el contenido unificado   (ideal para cuentas trial)
   * mode = 'multiple' → 10 KBs separadas                       (ideal para cuentas de pago)
   */
  async setupOnboarding(data, mode = 'single') {
    const apiKey = process.env.RETELL_API_KEY;
    if (!apiKey) throw new Error('RETELL_API_KEY no está configurado en el .env');

    const kbContents = generateAllKBContents(data);
    const kbsCreated = [];
    const kbsFailed  = [];

    if (mode === 'single') {
      // ── Modo unificado: todo en 1 sola KB ────────────────────────────────
      const kbName    = `KB_${data.business_name.replace(/\s+/g, '_')}`;
      const separator = '\n\n' + '='.repeat(60) + '\n\n';
      const combined  = kbContents
        .map(kb => `### ${kb.name.toUpperCase()} ###\n\n${kb.content}`)
        .join(separator);

      try {
        console.log(`📤 Subiendo KB unificada: ${kbName}...`);
        const id = await uploadKBToRetell(kbName, combined);
        kbsCreated.push({ name: kbName, id, mode: 'single', sections: kbContents.map(k => k.name) });
        console.log(`   ✅ KB unificada → ${id}`);
      } catch (err) {
        console.error(`   ❌ KB unificada falló: ${err.message}`);
        kbsFailed.push({ name: kbName, error: err.message });
      }

    } else {
      // ── Modo separado: 10 KBs independientes ─────────────────────────────
      for (const kb of kbContents) {
        try {
          console.log(`📤 Subiendo ${kb.name}...`);
          const id = await uploadKBToRetell(kb.name, kb.content);
          kbsCreated.push({ name: kb.name, id });
          console.log(`   ✅ ${kb.name} → ${id}`);
        } catch (err) {
          console.error(`   ❌ ${kb.name} falló: ${err.message}`);
          kbsFailed.push({ name: kb.name, error: err.message });
        }
        await sleep(DELAY_MS);
      }
    }

    // Guardar en config.json
    const configData = {
      completed: kbsCreated.length > 0,
      created_at: new Date().toISOString(),
      mode,
      business_name:   data.business_name,
      business_type:   data.business_type,
      city:            data.city,
      timezone:        data.timezone,
      phone:           data.phone,
      schedule:        data.schedule,
      services:        data.services,
      has_products:    data.has_products,
      products:        data.products || [],
      uses_calendar:   data.uses_calendar,
      cal_com_api_key: data.cal_com_api_key || null,
      cal_event_type_id: null,       // se llenará abajo si hay API key
      agent_name:      data.agent_name,
      agent_tone:      data.agent_tone,
      agent_language:  data.agent_language,
      kbs:             kbsCreated,
    };

    writeConfig(configData);
    console.log(`💾 config.json guardado con ${kbsCreated.length} KBs (modo: ${mode}).`);

    // ── Asignar KBs al LLM del agente usando AGENT_ID del .env ───────────
    if (kbsCreated.length > 0) {
      const agentId = process.env.AGENT_ID;
      if (!agentId) {
        console.warn('⚠️  No hay AGENT_ID en .env — KBs creadas pero NO asignadas al agente.');
      } else {
        try {
          const agentInfo     = await knowledgeService.getLLMFromAgent(agentId);
          const existingIds   = agentInfo.knowledgeBaseIds || [];
          const newIds        = kbsCreated.map(kb => kb.id);
          const updatedIds    = [...new Set([...existingIds, ...newIds])];

          await knowledgeService.attachKBToLLM(agentInfo.llmId, updatedIds);
          console.log(`✅ KBs asignadas al LLM ${agentInfo.llmId} del agente ${agentId}`);
          console.log(`   IDs asignados: [${updatedIds.join(', ')}]`);
        } catch (err) {
          console.error('❌ Error asignando KBs al agente:', err.message);
          throw new Error(`KBs creadas pero no asignadas al agente: ${err.message}`);
        }
      }
    }

    // Si hay API key de Cal.com, obtener y guardar el primer eventTypeId
    if (data.cal_com_api_key) {
      const eventTypeId = await calService.fetchAndSaveEventTypeId(data.cal_com_api_key);
      if (eventTypeId) configData.cal_event_type_id = eventTypeId;
    }

    return { kbsCreated, kbsFailed };
  }

  /** Lee config.json y devuelve el estado del onboarding */
  getStatus() {
    const cfg = readConfig();
    if (!cfg) return { completed: false, business_name: null };
    return { completed: cfg.completed === true, business_name: cfg.business_name || null };
  }

  /** Devuelve el config.json completo */
  getConfig() {
    return readConfig();
  }
}

export default new OnboardingService();
