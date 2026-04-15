import retellClient from '../src/client/client.js';
import fs from 'fs';

class KnowledgeService {
  // Crear nueva KB
  async createKnowledgeBase(name, urls = [], texts = [], files = []) {
  try {
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

  // Obtener información de un agente
async getAgent(agentId) {
  try {
    const agent = await retellClient.agent.retrieve(agentId);
    return {
      id: agent.agent_id,
      name: agent.agent_name,
      knowledgeBaseIds: agent.knowledge_base_ids || []
    };
  } catch (error) {
    console.error('❌ Error obteniendo agente:', error);
    throw error;
  }
}

// Actualizar las KBs de un agente (reemplaza todas)
async updateAgentKnowledgeBases(agentId, knowledgeBaseIds) {
  try {
    const updatedAgent = await retellClient.agent.update(agentId, {
      knowledge_base_ids: knowledgeBaseIds
    });
    
    return {
      id: updatedAgent.agent_id,
      name: updatedAgent.agent_name,
      knowledgeBaseIds: updatedAgent.knowledge_base_ids
    };
  } catch (error) {
    console.error('❌ Error actualizando agente:', error);
    throw error;
  }
}

}


export default new KnowledgeService();