import knowledgeService from '../../services/knowbases.service.js';
import path from 'path';
import fs from 'fs';

class DocumentController {
  //Actualizar para agregar docs, texts, o urls a KB 
  async addSourcesToKnowledgeBase(req, res) {
  try {
    const { knowledgeBaseId } = req.body;
    const rawUrls = req.body?.urls;
    const rawTexts = req.body?.texts;
    const files = req.files || [];

    // Validación
    if (!knowledgeBaseId) {
      return res.status(400).json({ 
        success: false,
        error: 'Se requiere knowledgeBaseId' 
      });
    }

    // Procesar URLs
    let urls = [];
    if (rawUrls) {
      urls = rawUrls
        .split(',')
        .map(u => u.trim())
        .filter(u => u.length > 0);
    }

    // Procesar Textos
    let texts = [];
    if (rawTexts) {
      try {
        texts = typeof rawTexts === 'string' ? JSON.parse(rawTexts) : rawTexts;
        if (!Array.isArray(texts)) texts = [texts];
      } catch (e) {
        texts = [{ title: 'Texto', text: rawTexts }];
      }
    }

    // Validar que haya ALGO que añadir
    if (urls.length === 0 && texts.length === 0 && files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar al menos una URL, texto o archivo para añadir'
      });
    }

    /* console.log(`📦 Añadiendo fuentes a KB ${knowledgeBaseId}:`);
    console.log(`  - URLs: ${urls.length}`);
    console.log(`  - Textos: ${texts.length}`);
    console.log(`  - Archivos: ${files.length}`); */

    // ✅ UNA SOLA LLAMADA al servicio
    const result = await knowledgeService.addSourcesToKB(
      knowledgeBaseId,
      urls,
      texts,
      files
    );

    // Limpiar archivos temporales
    files.forEach(f => {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    });

    res.json({
      success: true,
      message: 'Fuentes añadidas correctamente',
      added: {
        urls: urls.length,
        texts: texts.length,
        files: files.length
      },
      knowledgeBase: result
    });

  } catch (error) {
    // Limpiar archivos en caso de error
    if (req.files) {
      req.files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    
    console.error('Error en addSourcesToKnowledgeBase:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al añadir fuentes',
      details: error.message 
    });
  }
}

  // Crear nueva KB
  async createKnowledgeBase(req, res) {
  try {
    // 1. Extraer datos del form-data
    const { name } = req.body;
    const rawUrls = req.body?.urls;
    const rawTexts = req.body?.texts;
    const files = req.files || [];

    // 2. Validación
    if (!name) {
      return res.status(400).json({ 
        success: false,
        error: 'El nombre de la KB es requerido' 
      });
    }

    // 3. PROCESAR URLs: Convertir string a array
    let urls = [];
    if (rawUrls) {
      urls = rawUrls
        .split(',')
        .map(u => u.trim())
        .filter(u => u.length > 0);
    }

    // 4. PROCESAR Textos: Parsear JSON si viene como string
    let texts = [];
    if (rawTexts) {
      try {
        texts = typeof rawTexts === 'string' ? JSON.parse(rawTexts) : rawTexts;
        // Asegurar que sea un array
        if (!Array.isArray(texts)) texts = [texts];
      } catch (e) {
        // Si no es JSON válido, lo tratamos como un texto simple
        texts = [{ title: 'Texto', text: rawTexts }];
      }
    }

    // 5. Validar que haya AL MENOS una fuente (URL, texto o archivo)
    if (urls.length === 0 && texts.length === 0 && files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar al menos una URL, texto o archivo'
      });
    }

    console.log('📦 Datos procesados:');
    console.log('  - name:', name);
    console.log('  - urls:', urls);
    console.log('  - texts:', texts.length, 'textos');
    console.log('  - files:', files.length, 'archivos');

    // 6. Crear KB
    const kb = await knowledgeService.createKnowledgeBase(
      name,
      urls,
      texts,
      files
    );

    // 7. Asociar KB al LLM del agente (sumando a las KBs existentes)
    const agentId = process.env.AGENT_ID;
    console.log(`🔑 AGENT_ID desde .env: "${agentId}"`);
    if (agentId) {
      try {
        const agentInfo = await knowledgeService.getLLMFromAgent(agentId);
        const existingKBIds = agentInfo.knowledgeBaseIds || [];
        const updatedKBIds = [...existingKBIds, kb.id];
        
        console.log(`🔗 Asignando KB ${kb.id} al LLM ${agentInfo.llmId}`);
        console.log(`   KBs anteriores: [${existingKBIds.join(', ')}]`);
        console.log(`   KBs actualizadas: [${updatedKBIds.join(', ')}]`);
        
        await knowledgeService.attachKBToLLM(agentInfo.llmId, updatedKBIds);
        kb.attachedToAgent = agentId;
        console.log(`✅ KB asignada correctamente al LLM`);
      } catch (assignError) {
        console.error('⚠️ Error asignando KB al agente (la KB se creó igual):', assignError.message);
      }
    } else {
      console.log('⚠️ No hay AGENT_ID configurado, KB creada sin asignar a agente');
    }

    // 8. Limpiar archivos temporales
    files.forEach(f => {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    });

    // 9. Respuesta exitosa
    res.json({
      success: true,
      message: 'Base de conocimiento creada exitosamente',
      knowledgeBase: {
        id: kb.id,
        name: kb.name,
        status: 'processing'
      },
      hint: 'Usa GET /api/documents/knowledge-base/:id/status para verificar el progreso'
    });

  } catch (error) {
    console.error('❌ Error en createKnowledgeBase:', error);
    
    // Limpiar archivos en caso de error
    if (req.files) {
      req.files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Error al crear la base de conocimiento',
      details: error.message 
    });
  }
}

  // Listar KBs asignadas al agente
  async listKnowledgeBases(req, res) {
    try {
      const kbs = await knowledgeService.listKnowledgeBases();
      res.json({
        success: true,
        agentId: process.env.AGENT_ID,
        count: kbs.length,
        knowledgeBases: kbs
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: 'Error al listar bases de conocimiento del agente',
        details: error.message 
      });
    }
  }

  async deleteKnowledgeBase(req, res) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).send({ 
                success: false,
                error: 'knowledgeBase es requerido' 
            });
        }
        const result = await knowledgeService.deleteKnowledgeBase(id);
        res.status(200).send({
            success: true,
            message: 'Base de conocimiento eliminada exitosamente',
            knowledgeBase: result
        });
    }catch (error) {
        res.status(500).send({
            success: false,
            error: 'Error al eliminar la base de conocimiento',
            details: error.message
        });
    }}

  // Health check
  async healthCheck(req, res) {
    try {
      const kbs = await knowledgeService.listKnowledgeBases();
      res.json({
        success: true,
        status: 'healthy',
        retell: 'connected',
        knowledgeBasesCount: kbs.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        retell: 'disconnected',
        error: error.message
      });
    }
  }

  // Obtener detalles de una KB (sources, límite, etc.)
  async getKnowledgeBaseDetails(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'El id de la Knowledge Base es requerido'
        });
      }
      const details = await knowledgeService.getKBDetails(id);
      res.json({
        success: true,
        knowledgeBase: details
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error al obtener detalles de la Knowledge Base',
        details: error.message
      });
    }
  }

  // Eliminar un source específico de una KB
  async deleteSource(req, res) {
    try {
      const { knowledgeBaseId, sourceId } = req.params;
      if (!knowledgeBaseId || !sourceId) {
        return res.status(400).json({
          success: false,
          error: 'Se requieren knowledgeBaseId y sourceId'
        });
      }
      const result = await knowledgeService.deleteSourceFromKB(knowledgeBaseId, sourceId);
      res.json({
        success: true,
        message: 'Documento eliminado exitosamente de la colección',
        knowledgeBase: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error al eliminar el documento de la colección',
        details: error.message
      });
    }
  }

}

export default new DocumentController();