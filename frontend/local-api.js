import express from 'express';
import presignHandler from './api/presign.js';
import presignDownloadHandler from './api/presign-download.js';
import multipartHandler from './api/multipart.js';
import presignAdminHandler from './api/presign-admin.js';

const app = express();
app.use(express.json());

// Express adapter for Vercel functions
const createAdapter = (handler) => async (req, res) => {
  // Vercel functions expect req.query and req.body to work like Express
  try {
    await handler(req, res);
  } catch (err) {
    console.error('API Handler Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

app.post('/api/presign', createAdapter(presignHandler));
app.get('/api/presign-download', createAdapter(presignDownloadHandler));
app.post('/api/multipart', createAdapter(multipartHandler));
app.post('/api/presign-admin', createAdapter(presignAdminHandler));

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`⚡ Local Vercel Serverless API simulator listening on port ${PORT}`);
});
