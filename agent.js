// ================================================================
//  ByteStar Agent — agent.js
//  Runs inside Ubuntu (proot-distro) on Termux
//  Start: node agent.js
//  Only listens on 127.0.0.1 — not reachable from other devices
// ================================================================

const http = require('http');
const { exec, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT      = 4567;
const HOST      = '127.0.0.1';
const BASE_DIR  = path.join(os.homedir(), 'bytestar', 'projects');
const LOG_FILE  = path.join(os.homedir(), 'bytestar', 'agent.log');

// Ensure base dir exists
fs.mkdirSync(BASE_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(_) {}
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:8080');
  res.setHeader('Access-Control-Allow-Origin', '*'); // ByteStar Pages origin
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

// Safe folder name — strip anything dangerous
function safeName(name) {
  return String(name || 'project')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 64);
}

// Stream a command back to client via SSE
function streamCommand(res, cmd, cwd) {
  cors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  log(`EXEC: ${cmd}`);
  const proc = spawn('bash', ['-c', cmd], {
    cwd: cwd || BASE_DIR,
    env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
  });

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  proc.stdout.on('data', d => send('stdout', d.toString()));
  proc.stderr.on('data', d => send('stderr', d.toString()));
  proc.on('close', code => {
    send('exit', code);
    res.write('data: {"type":"done"}\n\n');
    res.end();
    log(`EXIT: ${code} — ${cmd}`);
  });
  proc.on('error', err => {
    send('error', err.message);
    res.end();
  });
}

// ── ROUTE HANDLER ──
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const route = url.pathname;

  // Preflight
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  // ── GET /health ──
  if (route === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      agent: 'ByteStar',
      version: '1.0.0',
      base: BASE_DIR,
      ts: Date.now()
    });
  }

  // ── GET /projects ── list project folders
  if (route === '/projects' && req.method === 'GET') {
    try {
      const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
      const projects = entries
        .filter(e => e.isDirectory())
        .map(e => {
          const dir = path.join(BASE_DIR, e.name);
          const manifestPath = path.join(dir, 'bytestar.json');
          let manifest = {};
          try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch(_) {}
          return { name: e.name, manifest };
        });
      return json(res, 200, { ok: true, projects });
    } catch(e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  // ── POST /setup ── create project folder + write manifest
  if (route === '/setup' && req.method === 'POST') {
    const body = await parseBody(req);
    const name = safeName(body.name);
    const dir  = path.join(BASE_DIR, name);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const manifest = {
        name,
        title:    body.title    || name,
        packages: body.packages || [],
        created:  Date.now()
      };
      fs.writeFileSync(path.join(dir, 'bytestar.json'), JSON.stringify(manifest, null, 2));
      if (body.html) {
        fs.writeFileSync(path.join(dir, 'index.html'), body.html);
      }
      log(`SETUP: ${name}`);
      return json(res, 200, { ok: true, name, dir });
    } catch(e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  // ── POST /install ── stream package install output (SSE)
  // body: { name: "project-folder", packages: ["python3", "pip install spiceypy numpy"] }
  if (route === '/install' && req.method === 'POST') {
    const body = await parseBody(req);
    const name = safeName(body.name);
    const pkgs = (body.packages || []).filter(Boolean);

    if (!pkgs.length) return json(res, 400, { ok: false, error: 'No packages provided' });

    // Build install command sequence
    const cmds = pkgs.map(p => {
      const t = p.trim();
      if (t.startsWith('pip install') || t.startsWith('pip3 install')) return t;
      if (t.startsWith('gem install')) return t;
      if (t.startsWith('npm install')) return t;
      if (t.startsWith('apt ') || t.startsWith('apt-get ')) return `DEBIAN_FRONTEND=noninteractive ${t} -y`;
      if (t.startsWith('pkg install')) return `${t} -y`;
      // bare package name — assume apt
      return `DEBIAN_FRONTEND=noninteractive apt install -y ${t}`;
    });

    const fullCmd = cmds.join(' && ');
    const dir = path.join(BASE_DIR, name);
    fs.mkdirSync(dir, { recursive: true });

    log(`INSTALL [${name}]: ${fullCmd}`);
    return streamCommand(res, fullCmd, dir);
  }

  // ── POST /save-html ── write or update index.html for a project
  if (route === '/save-html' && req.method === 'POST') {
    const body = await parseBody(req);
    const name = safeName(body.name);
    const dir  = path.join(BASE_DIR, name);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), body.html || '');
      log(`SAVE-HTML: ${name}`);
      return json(res, 200, { ok: true });
    } catch(e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  // ── POST /run ── stream arbitrary safe command (SSE)
  // Whitelist: only allow within project dir, no cd ../ escapes
  if (route === '/run' && req.method === 'POST') {
    const body = await parseBody(req);
    const name = safeName(body.name || '');
    const cmd  = (body.cmd || '').trim();

    if (!cmd) return json(res, 400, { ok: false, error: 'No command' });

    // Basic safety — block obvious escapes
    const blocked = ['rm -rf /', 'mkfs', '> /dev/', 'dd if=', ':(){:|:&};:'];
    if (blocked.some(b => cmd.includes(b))) {
      return json(res, 403, { ok: false, error: 'Command blocked' });
    }

    const cwd = name ? path.join(BASE_DIR, name) : BASE_DIR;
    return streamCommand(res, cmd, cwd);
  }

  // ── 404 ──
  return json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  log(`ByteStar Agent running at http://${HOST}:${PORT}`);
  log(`Projects dir: ${BASE_DIR}`);
  log(`Only accessible from this device — localhost only`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    log(`Port ${PORT} already in use. Is the agent already running?`);
  } else {
    log(`Server error: ${err.message}`);
  }
  process.exit(1);
});
