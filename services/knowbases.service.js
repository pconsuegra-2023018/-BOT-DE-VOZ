import retellClient from '../src/client/client.js';
import fs from 'fs';

const MAX_DOCS_PER_KB = 10;

class KnowledgeService {
  // Crear nueva KB
  async createKnowledgeBase(name, urls = [], texts = [], files = []) {
  try {
    // Validar límite de 10 documentos (sources) al crear
    const totalSources = (urls?.length || 0) + (texts?.length || 0) + (files?.length || 0);
    if (totalSources > MAX_DOCS_PER_KB) {
      throw new Error(`Límite excedido: máximo ${MAX_DOCS_PER_KB} documentos por colección. Intentaste agregar ${totalSources}.`);
    }

    const payload = {
      knowledge_base_name: name
    };

    // Añadir URLs si existen
    if (urls && urls.length > 0) {
      payload.knowledge_base_urls = urls;
    }

    // Añadir Textos si existen
    if (texts && texts.length > 0) {
      payload.knowledge_base_texts = texts;
    }

    // ✅ CORRECTO: Convertir archivos de Multer a ReadStream
    if (files && files.length > 0) {
      payload.knowledge_base_files = files.map(file => 
        fs.createReadStream(file.path)  // ← Crear ReadStream desde el path
      );
    }

    // Validar que haya AL MENOS UNA fuente
    if (!payload.knowledge_base_urls && 
        !payload.knowledge_base_texts && 
        !payload.knowledge_base_files) {
      throw new Error('Debe proporcionar al menos una URL, texto o archivo');
    }

    console.log('📦 Enviando a Retell:');
    console.log('  - name:', payload.knowledge_base_name);
    console.log('  - urls:', payload.knowledge_base_urls?.length || 0);
    console.log('  - texts:', payload.knowledge_base_texts?.length || 0);
    console.log('  - files:', payload.knowledge_base_files?.length || 0);

    const knowledgeBase = await retellClient.knowledgeBase.create(payload);
    
    return {
      id: knowledgeBase.knowledge_base_id,
      name: knowledgeBase.knowledge_base_name,
      created: knowledgeBase.created_at
    };
  } catch (error) {
    console.error('❌ Error creando KB:', error);
    throw error;
  }
}

  async addSourcesToKB(knowledgeBaseId, urls = [], texts = [], files = []) {
  try {
    // Validar límite de 10 documentos antes de agregar
    const currentKB = await retellClient.knowledgeBase.retrieve(knowledgeBaseId);
    const currentCount = currentKB.knowledge_base_sources?.length || 0;
    const newCount = (urls?.length || 0) + (texts?.length || 0) + (files?.length || 0);
    
    if (currentCount + newCount > MAX_DOCS_PER_KB) {
      throw new Error(
        `Límite excedido: la colección ya tiene ${currentCount} documentos. ` +
        `Intentas agregar ${newCount}, pero el máximo es ${MAX_DOCS_PER_KB}. ` +
        `Espacio disponible: ${MAX_DOCS_PER_KB - currentCount}.`
      );
    }

    const payload = {};

    if (urls.length > 0) payload.knowledge_base_urls = urls;
    if (texts.length > 0) payload.knowledge_base_texts = texts;
    if (files.length > 0) {
      payload.knowledge_base_files = files.map(f => fs.createReadStream(f.path));
    }

    const updatedKB = await retellClient.knowledgeBase.addSources(
      knowledgeBaseId,
      payload
    );

    return {
      id: updatedKB.knowledge_base_id,
      name: updatedKB.knowledge_base_name
    };
  } catch (error) {
    console.error('❌ Error añadiendo fuentes:', error);
    throw error;
  }
}
  // Listar todas las KBs
  async listKnowledgeBases() {
    try {
      const knowledgeBases = await retellClient.knowledgeBase.list();
      return knowledgeBases.map(kb => ({
        id: kb.knowledge_base_id,
        name: kb.knowledge_base_name,
        created: kb.created_at
      }));
    } catch (error) {
      console.error('❌ Error listando KBs:', error);
      throw error;
    }
  }

  // Asociar KB a un agente
  async attachKBToAgent(agentId, knowledgeBaseIds) {
    try {
      const updatedAgent = await retellClient.agent.update(agentId, {
        knowledge_base_ids: knowledgeBaseIds
      });
      
      return {
        id: updatedAgent.agent_id,
        name: updatedAgent.agent_name,
        knowledgeBases: updatedAgent.knowledge_base_ids
      };
    } catch (error) {
      console.error('❌ Error asociando KB al agente:', error);
      throw error;
    }
  }

  async deleteKnowledgeBase(knowledgeBaseId) {
  try {
    await retellClient.knowledgeBase.delete(knowledgeBaseId);
  } catch (error) {
    console.error('❌ Error eliminando KB:', error);
    throw error;
  }
  }

  // Obtener detalles de una KB (con sources)
  async getKBDetails(knowledgeBaseId) {
    try {
      const kb = await retellClient.knowledgeBase.retrieve(knowledgeBaseId);
      return {
        id: kb.knowledge_base_id,
        name: kb.knowledge_base_name,
        status: kb.status,
        sourcesCount: kb.knowledge_base_sources?.length || 0,
        maxSources: MAX_DOCS_PER_KB,
        availableSlots: MAX_DOCS_PER_KB - (kb.knowledge_base_sources?.length || 0),
        sources: kb.knowledge_base_sources?.map(source => ({
          sourceId: source.source_id,
          type: source.type,
          ...(source.type === 'document' && { filename: source.filename, fileUrl: source.file_url }),
          ...(source.type === 'text' && { title: source.title, contentUrl: source.content_url }),
          ...(source.type === 'url' && { url: source.url }),
        })) || []
      };
    } catch (error) {
      console.error('❌ Error obteniendo detalles de KB:', error);
      throw error;
    }
  }

  // Eliminar un source específico de una KB
  async deleteSourceFromKB(knowledgeBaseId, sourceId) {
    try {
      const updatedKB = await retellClient.knowledgeBase.deleteSource(
        sourceId,
        { knowledge_base_id: knowledgeBaseId }
      );
      return {
        id: updatedKB.knowledge_base_id,
        name: updatedKB.knowledge_base_name,
        remainingSources: updatedKB.knowledge_base_sources?.length || 0
      };
    } catch (error) {
      console.error('❌ Error eliminando source de KB:', error);
      throw error;
    }
  }

}


export default new KnowledgeService();