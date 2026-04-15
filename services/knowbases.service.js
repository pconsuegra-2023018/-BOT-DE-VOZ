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
  // Listar solo las KBs asignadas al agente configurado en .env
  async listKnowledgeBases() {
    try {
      const agentId = process.env.AGENT_ID;
      if (!agentId) {
        throw new Error('No hay AGENT_ID configurado en .env');
      }

      // Obtener los IDs de KBs asignadas al LLM del agente
      const agentInfo = await this.getLLMFromAgent(agentId);
      const assignedIds = agentInfo.knowledgeBaseIds || [];

      if (assignedIds.length === 0) {
        return [];
      }

      // Obtener detalles de cada KB asignada
      const kbDetails = await Promise.all(
        assignedIds.map(id => retellClient.knowledgeBase.retrieve(id))
      );

      return kbDetails.map(kb => ({
        id: kb.knowledge_base_id,
        name: kb.knowledge_base_name,
        status: kb.status,
        sourcesCount: kb.knowledge_base_sources?.length || 0,
        created: kb.created_at
      }));
    } catch (error) {
      console.error('❌ Error listando KBs del agente:', error);
      throw error;
    }
  }

  // Obtener el LLM del agente para ver sus KBs actuales
  async getLLMFromAgent(agentId) {
    try {
      const agent = await retellClient.agent.retrieve(agentId);
      const llmId = agent.response_engine?.llm_id;
      if (!llmId) {
        throw new Error('El agente no tiene un LLM configurado');
      }
      const llm = await retellClient.llm.retrieve(llmId);
      console.log('🤖 Agente:', agent.agent_name);
      console.log('🧠 LLM:', llmId);
      console.log('📚 KBs actuales:', llm.knowledge_base_ids || []);
      return {
        agentId: agent.agent_id,
        agentName: agent.agent_name,
        llmId: llmId,
        knowledgeBaseIds: llm.knowledge_base_ids || []
      };
    } catch (error) {
      console.error('❌ Error obteniendo LLM del agente:', error);
      throw error;
    }
  }

  // Asignar KBs al LLM del agente
  async attachKBToLLM(llmId, knowledgeBaseIds) {
    try {
      const updatedLLM = await retellClient.llm.update(llmId, {
        knowledge_base_ids: knowledgeBaseIds
      });
      console.log('✅ LLM actualizado con KBs:', knowledgeBaseIds);
      return {
        llmId: updatedLLM.llm_id,
        knowledgeBases: updatedLLM.knowledge_base_ids
      };
    } catch (error) {
      console.error('❌ Error asignando KBs al LLM:', error);
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