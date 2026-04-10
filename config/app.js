import express from 'express';
import documentRoutes from '../src/docs/doc.routes.js';
import dotenv from 'dotenv';

dotenv.config();

const configs = (app) => {
    app.use(express.json());
    app.use(express.urlencoded({extended: true}));
}

const routes = (app) => {
   app.use('/api/documents', documentRoutes);
   // Manejo de rutas no encontradas
   app.use((req, res) => {
       res.status(404).json({ 
           success: false,
           error: 'Ruta no encontrada' 
       });
   });

   // Manejo global de errores
   app.use((err, req, res, next) => {
       console.error('Error global:', err);
       res.status(500).json({ 
           success: false,
           error: 'Error interno del servidor',
           details: err.message 
       });
   });
}

export const initServer = () => {
    const app = express();
    try {
        configs(app);
        routes(app);
        
        
        app.listen(process.env.PORT , () => {
            console.log('════════════════════════════════════════');
            console.log(`✅ Servidor corriendo en http://localhost:${process.env.PORT}`);
            console.log('════════════════════════════════════════');
            console.log('📚 Endpoints disponibles:');
            console.log(`   GET  /api/documents/health - Verificar conexión`);
            console.log(`   GET  /api/documents/knowledge-bases - Listar KBs`);
            console.log(`   POST /api/documents/knowledge-base - Crear nueva KB`);
            console.log(`   POST /api/documents/upload-multiple - Añadir contenido a KB existente`);
            console.log(`   DELETE /api/documents/knowledge-base/ - Eliminar KB`);
            console.log('════════════════════════════════════════');
        });
    } catch (error) {
        console.error('❌ Error en el Servidor:', error);
        process.exit(1);
    }
}