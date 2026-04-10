import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();

// Configuración MÍNIMA de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './test-uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Endpoint ultra simple
app.post('/test', upload.single('document'), (req, res) => {
  console.log('═══════════════════════════════');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('File:', req.file);
  console.log('═══════════════════════════════');
  
  if (!req.file) {
    return res.json({ 
      received: false, 
      body: req.body 
    });
  }
  
  res.json({ 
    received: true, 
    filename: req.file.originalname,
    size: req.file.size 
  });
});

app.listen(3001, () => {
  console.log('🧪 Servidor de prueba en http://localhost:3001');
  console.log('   Endpoint: POST /test');
});