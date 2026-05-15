// ================================================================
//  ByteStar Chat Server
//  Live at: https://imbcs.onrender.com
//  Frontend: https://imbcs.bluecomet.work
// ================================================================

require("dotenv").config();
const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");

const app  = express();
const PORT = process.env.PORT || 5000;
const PAGES_ORIGIN = process.env.PAGES_ORIGIN || "https://imbcs.bluecomet.work";

app.use(express.json());

app.get("/", (_req, res) => {
  res.send(`
    <!doctype html><html>
    <head><title>ByteStar Chat Server</title>
    <style>body{background:#05060a;color:#00d4ff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}
    h1{font-size:1.2rem;letter-spacing:3px}p{color:#4a7a90;font-size:.85rem}</style>
    </head>
    <body>
      <h1>⭐ BYTESTAR CHAT SERVER</h1>
      <p>Socket.IO live — BlueComet.Work</p>
      <p style="color:#00ff99">● Online · ${new Date().toISOString()}</p>
    </body></html>
  `);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), uptime: process.uptime() });
});

const server = http.createServer(app);

const io = new Server(server, {
  transports: ["websocket", "polling"],
  allowEIO3: true,
  cors: {
    origin: [
      PAGES_ORIGIN,
      "https://imbcs.bluecomet.work",
      "http://localhost:5000",
      "http://localhost:3000",
      /\.pages\.dev$/,
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── COMET NAMES ──
const COMET_NAMES = [
  "Halley","Hale-Bopp","Shoemaker","Swift","Encke","Tempel",
  "Churyumov","Wild","Borelly","Hartley","Ikeya","Arend",
  "Giacobini","Pons","Whipple","Faye","Wirtanen","Forbes",
  "Brooks","Machholz","Tuttle","Finlay","Wolf","Reinmuth",
  "Kopff","Schwassmann","Gehrels","Gunn","Tritton","Neujmin",
  "Crommelin","Taylor","Kearns","Seki","Perrine","Lexell"
];

const connectedUsers = new Map();
const takenNumbers   = new Set();

function assignComet(socketId, preferredName) {
  let num = null;
  for (let i = 1; i <= COMET_NAMES.length; i++) {
    if (!takenNumbers.has(i)) { num = i; break; }
  }
  if (num === null) num = Math.floor(Math.random() * 9000) + 1000;
  takenNumbers.add(num);
  const autoName = `${COMET_NAMES[(num - 1) % COMET_NAMES.length]} ${num}`;
  const name = preferredName || autoName;
  connectedUsers.set(socketId, { cometNumber: num, name });
  return { cometNumber: num, name };
}

function releaseComet(socketId) {
  const user = connectedUsers.get(socketId);
  if (user) { takenNumbers.delete(user.cometNumber); connectedUsers.delete(socketId); }
}

function getUserListPayload() {
  const obj = {};
  connectedUsers.forEach((info, id) => { obj[id] = info; });
  return obj;
}

io.on("connection", (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on("join", ({ name } = {}) => {
    const safe = name ? String(name).slice(0, 28).replace(/[<>]/g, "") : null;
    const assigned = assignComet(socket.id, safe);
    socket.emit("assigned", { ...assigned, socketId: socket.id });
    io.emit("userList", getUserListPayload());
    io.emit("systemMsg", `✦ ${assigned.name} entered the stream`);
    console.log(`[join] ${assigned.name} (${connectedUsers.size} online)`);
  });

  socket.on("setName", (newName) => {
    const user = connectedUsers.get(socket.id);
    if (user && typeof newName === "string") {
      user.name = String(newName).slice(0, 28).replace(/[<>]/g, "");
      io.emit("userList", getUserListPayload());
    }
  });

  socket.on("chatMessage", (msg) => {
    if (!msg?.text?.trim()) return;
    const safe = {
      user:     String(msg.user || "Unknown").slice(0, 32),
      text:     String(msg.text).slice(0, 4000),
      socketId: socket.id,
    };
    console.log(`[msg] ${safe.user}: ${safe.text.slice(0, 60)}`);
    socket.broadcast.emit("chatMessage", safe);
  });

  socket.on("disconnect", () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`[-] ${user.name}`);
      io.emit("systemMsg", `◌ ${user.name} left the stream`);
      releaseComet(socket.id);
      io.emit("userList", getUserListPayload());
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n⭐ ByteStar Chat Server`);
  console.log(`   Port:    ${PORT}`);
  console.log(`   Origin:  ${PAGES_ORIGIN}`);
  console.log(`   Ready.\n`);
});
