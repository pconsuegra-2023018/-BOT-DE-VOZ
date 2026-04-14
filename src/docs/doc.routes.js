import express from 'express';
import DocumentController from './doc.controller.js';
import { upload } from '../../config/multer.config.js';

const router = express.Router();

// Health check
router.get('/health', DocumentController.healthCheck);

// UPDATE {añadir  urls, textos o archivos a KB existentes}
router.post('/upload-multiple', 
  upload.array('documents',10),
  DocumentController.addSourcesToKnowledgeBase
);
// Crear nueva KB
router.post('/knowledge-base', 
  upload.array('documents', 10), 
  DocumentController.createKnowledgeBase
);

// Listar KBs disponibles
router.get('/knowledge-bases', 
  DocumentController.listKnowledgeBases
);

// Obtener detalles de una KB (sources, límite de docs)
router.get('/knowledge-base/:id', 
  DocumentController.getKnowledgeBaseDetails
);

// Eliminar KB
router.delete('/knowledge-base/:id',
  DocumentController.deleteKnowledgeBase
);

// Eliminar un source específico de una KB
router.delete('/knowledge-base/:knowledgeBaseId/source/:sourceId',
  DocumentController.deleteSource
);

export default router;