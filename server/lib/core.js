// NEXUS AI — Núcleo: cofre criptografado, VFS (jail de arquivos) e execução com limites
// Zero dependências externas. Node 18+.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { exec } = require("child_process");

/* ============ VAULT — segredos criptografados em repouso (AES-256-GCM) ============ */
const VAULT_FILE = path.join(__dirname, "..", "data", "vault.enc.json");

function masterKey() {
  const mk = process.env.NEXUS_MASTER_KEY || "";
  if (mk) return crypto.scryptSync(mk, "nexus-salt-v1", 32);
  // Chave de desenvolvimento derivada da máquina. Em produção defina NEXUS_MASTER_KEY.
  return crypto.scryptSync("nexus-dev-" + os.hostname(), "nexus-salt-v1", 32);
}

function readVault() {
  try { return JSON.parse(fs.readFileSync(VAULT_FILE, "utf8")); }
  catch { return {}; }
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), data: enc.toString("hex") };
}

function decrypt(blob) {
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(blob.iv, "hex"));
  d.setAuthTag(Buffer.from(blob.tag, "hex")); // obrigatório em GCM: final() verifica o tag aqui
  const dec = Buffer.concat([d.update(Buffer.from(blob.data, "hex")), d.final()]);
  return dec.toString("utf8");
}

function getKey(id) {
  const v = readVault();
  return v[id] ? decrypt(v[id]) : null;
}

function setKey(id, value) {
  const v = readVault();
  v[id] = encrypt(value);
  fs.mkdirSync(path.dirname(VAULT_FILE), { recursive: true });
  fs.writeFileSync(VAULT_FILE, JSON.stringify(v, null, 2));
  return true;
}

function deleteKey(id) {
  const v = readVault();
  delete v[id];
  fs.writeFileSync(VAULT_FILE, JSON.stringify(v, null, 2));
}

function listKeys() {
  return Object.keys(readVault());
}

/* ============ VFS — sistema de arquivos com jail por workspace ============ */
function jailRoot() {
  const root = process.env.NEXUS_WORKSPACE || path.join(__dirname, "..", "data", "workspace");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function resolveSafe(rel) {
  const root = jailRoot();
  const full = path.resolve(root, rel || ".");
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("vfs: caminho fora do workspace");
  }
  return full;
}

function vfsList(dir = ".") {
  const full = resolveSafe(dir);
  const entries = fs.readdirSync(full, { withFileTypes: true });
  return entries.map(e => ({ name: e.name, type: e.isDirectory() ? "dir" : "file", size: e.isFile() ? fs.statSync(path.join(full, e.name)).size : 0 }));
}

function vfsRead(file) {
  const full = resolveSafe(file);
  const st = fs.statSync(full);
  if (st.size > 1024 * 1024) throw new Error("vfs: arquivo maior que 1MB");
  return fs.readFileSync(full, "utf8");
}

function vfsWrite(file, content) {
  const full = resolveSafe(file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (Buffer.byteLength(content) > 512 * 1024) throw new Error("vfs: conteúdo acima de 512KB");
  fs.writeFileSync(full, content);
  return { ok: true, path: file, bytes: Buffer.byteLength(content) };
}

function vfsDelete(target) {
  const full = resolveSafe(target);
  const st = fs.statSync(full);
  if (st.isDirectory()) fs.rmSync(full, { recursive: true, maxRetries: 2 });
  else fs.unlinkSync(full);
  return { ok: true };
}

/* ============ EXEC — execução real com limites (defesa em camadas) ============
   AVISO IMPORTANTE: sem Docker, este é um soft-jail (bloqueios + timeout + jail de cwd).
   Para isolamento forte use docker-compose.yml (container sem rede por padrão).
   Padrões bloqueados são defesa em profundidade, NÃO sandbox criptográfica. */
const BLOCKED = [
  /sudo\b/, /\bsu\s+-/, /\brm\s+-rf\s+\/\b/, /mkfs/, /:\(\)\{.*\};:/,
  /curl[^|]*\|\s*(ba)?sh/, /wget[^|]*\|\s*(ba)?sh/, /\bshutdown\b/, /\breboot\b/,
  /dd\s+if=.*of=\/dev/, /\bchmod\s+-R\s+777\s+\//, /\bnc\s+-l\b/
];
const ALLOWED_HINTS = /^(node|npm|npx|python3?|pip3?|git|ls|cat|echo|mkdir|touch|cp|mv|rm|pwd|grep|find|head|tail|wc|sort|uniq|sed|awk|curl|tar|unzip|which|env|date|true|false|whoami)\b/;

function execLimited(command, opts = {}) {
  return new Promise((resolve) => {
    const timeoutMs = Math.min(Math.max(opts.timeoutSec || 15, 1), 60);
    const cwd = resolveSafe(opts.cwd || ".");
    const cmd = String(command || "").trim();
    const net = opts.network !== false; // padrão: rede liberada (baixa risco, alto uso)

    const problems = [];
    if (!cmd) return resolve({ ok: false, error: "comando vazio" });
    if (cmd.length > 4000) return resolve({ ok: false, error: "comando acima de 4000 caracteres" });
    for (const rx of BLOCKED) if (rx.test(cmd)) problems.push("padrão bloqueado: " + rx.source);
    if (!ALLOWED_HINTS.test(cmd)) problems.push("comando fora da lista de permitidos");
    if (problems.length) return resolve({ ok: false, error: problems.join("; "), refused: true });

    exec(cmd, {
      cwd, timeout: timeoutMs * 1000, maxBuffer: 1024 * 1024,
      killSignal: "SIGKILL",
      env: { PATH: process.env.PATH, HOME: cwd, LANG: "C.UTF-8", NEXUS_NET: net ? "on" : "off", ...opts.env }
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? (error.code ?? 1) : 0,
        timedOut: Boolean(error && error.killed && error.signal === "SIGKILL"),
        stdout: (stdout || "").slice(0, 40000),
        stderr: (stderr || "").slice(0, 8000),
        cwd
      });
    });
  });
}

module.exports = { vault: { getKey, setKey, deleteKey, listKeys }, vfs: { list: vfsList, read: vfsRead, write: vfsWrite, remove: vfsDelete, root: jailRoot }, execLimited, resolveSafe };
