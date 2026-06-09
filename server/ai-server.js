/*
 * cre8 AI proxy + static server (zero dependencies, Node 18+).
 *
 * Why a server at all? Generative image models need a secret API key. If the
 * browser called the model directly, that key would be exposed to anyone using
 * the page. So this tiny server:
 *   1. serves the static app (so one command runs everything), and
 *   2. proxies image-generation requests to OpenAI's `gpt-image-1`, keeping the
 *      key in an environment variable, server-side only.
 *
 * Run:  OPENAI_API_KEY=sk-... node server/ai-server.js
 * Then open http://localhost:8000
 *
 * The app works fine WITHOUT this server (open index.html directly) — you just
 * lose the AI panel. Everything else (drawing, image import, animation, export)
 * is fully offline.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.CRE8_IMAGE_MODEL || 'gpt-image-1';
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 12 * 1024 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Strip a data URL prefix and return a PNG Buffer.
function dataUrlToBuffer(dataUrl) {
  const m = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  return Buffer.from(m[1], 'base64');
}

async function callOpenAI(prompt, size, n, imageBuffer) {
  const headers = { Authorization: `Bearer ${KEY}` };
  let url;
  let body;

  if (imageBuffer) {
    // Image-guided generation (edit): steer the model with the current sprite.
    url = 'https://api.openai.com/v1/images/edits';
    const form = new FormData();
    form.append('model', MODEL);
    form.append('prompt', prompt);
    form.append('n', String(n));
    form.append('size', size);
    form.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'sprite.png');
    body = form; // fetch sets the multipart boundary itself
  } else {
    url = 'https://api.openai.com/v1/images/generations';
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ model: MODEL, prompt, n, size });
  }

  const r = await fetch(url, { method: 'POST', headers, body });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).error.message;
    } catch (e) {
      /* keep raw text */
    }
    throw new Error(`OpenAI ${r.status}: ${msg}`);
  }
  const json = JSON.parse(text);
  // gpt-image-1 returns base64 PNGs in data[].b64_json
  return json.data.map((d) => 'data:image/png;base64,' + d.b64_json);
}

async function handleGenerate(req, res) {
  if (!KEY) {
    return sendJson(res, 503, {
      error: 'No OPENAI_API_KEY set. Start the server with your key to enable AI.',
    });
  }
  let payload;
  try {
    payload = JSON.parse((await readBody(req)).toString('utf8'));
  } catch (e) {
    return sendJson(res, 400, { error: 'Invalid JSON body.' });
  }
  const prompt = (payload.prompt || '').toString().trim();
  if (!prompt) return sendJson(res, 400, { error: 'Prompt is required.' });

  const size = ['1024x1024', '1024x1536', '1536x1024', 'auto'].includes(payload.size)
    ? payload.size
    : '1024x1024';
  const n = Math.max(1, Math.min(4, parseInt(payload.n, 10) || 1));
  const imageBuffer = payload.image ? dataUrlToBuffer(payload.image) : null;

  try {
    const images = await callOpenAI(prompt, size, n, imageBuffer);
    sendJson(res, 200, { images });
  } catch (e) {
    sendJson(res, 502, { error: String(e.message || e) });
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  // Block path traversal outside the project root.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/ai-status')) {
    return sendJson(res, 200, { enabled: !!KEY, model: MODEL });
  }
  if (req.url.startsWith('/api/generate') && req.method === 'POST') {
    return handleGenerate(req, res);
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`cre8 running at http://localhost:${PORT}`);
  console.log(KEY ? `AI enabled (model: ${MODEL})` : 'AI disabled (set OPENAI_API_KEY to enable)');
  if (typeof FormData === 'undefined') {
    console.warn('Warning: Node 18+ is required for AI (global fetch/FormData).');
  }
});
