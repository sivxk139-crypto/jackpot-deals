import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "requests.json");
if (!ADMIN_USER || !ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error("Set ADMIN_USER, ADMIN_PASSWORD and SESSION_SECRET in your environment.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", { mode: 0o600 });

app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  name: "jackpot_admin",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 2 * 60 * 60 * 1000 }
}));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
function readRequests() { try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return []; } }
function writeRequests(items) { fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), { mode: 0o600 }); }
function requireAdmin(req, res, next) { if (req.session?.admin === true) return next(); return res.status(401).json({ error: "Admin sign-in required." }); }

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  // Be forgiving if someone types the ID with surrounding quote marks.
  const cleanUsername = typeof username === "string" ? username.trim().replace(/^["']|["']$/g, "") : "";
  const cleanPassword = typeof password === "string" ? password.trim().replace(/^["']|["']$/g, "") : "";
  const safeEqual = (a, b) => crypto.timingSafeEqual(
    Buffer.from(String(a).padEnd(256).slice(0, 256)),
    Buffer.from(String(b).padEnd(256).slice(0, 256))
  );
  const userOk = typeof username === "string" && safeEqual(cleanUsername, ADMIN_USER);
  const passOk = typeof password === "string" && safeEqual(cleanPassword, ADMIN_PASSWORD);
  if (!userOk || !passOk) return res.status(401).json({ error: "Invalid admin ID or password." });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Could not start admin session." });
    req.session.admin = true;
    req.session.save((saveErr) => saveErr ? res.status(500).json({ error: "Could not save session." }) : res.json({ ok: true }));
  });
});
app.post("/api/admin/logout", (req, res) => req.session.destroy(() => res.clearCookie("jackpot_admin").json({ ok: true })));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "jackpot-deal-api" }));

app.post("/api/requests", (req, res) => {
  const { name, phone, email = "", reference, amount } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.length > 100 ||
      typeof phone !== "string" || !/^\d{10}$/.test(phone) ||
      typeof email !== "string" || email.length > 200 ||
      typeof reference !== "string" || !/^[A-Z0-9]{8,22}$/i.test(reference) ||
      String(amount) !== "9.00") return res.status(400).json({ error: "Invalid request details." });
  const requests = readRequests();
  if (requests.some(r => r.reference.toLowerCase() === reference.toLowerCase())) {
    return res.status(409).json({ error: "This reference has already been submitted." });
  }
  const request = { id: crypto.randomUUID(), name: name.trim(), phone, email: email.trim(), reference: reference.toUpperCase(), amount: "9.00", status: "pending", createdAt: new Date().toISOString() };
  requests.unshift(request); writeRequests(requests);
  return res.status(201).json({ ok: true, id: request.id, status: request.status });
});
app.get("/api/admin/requests", requireAdmin, (_req, res) => res.json(readRequests()));
app.patch("/api/admin/requests/:id", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected." });
  const requests = readRequests();
  const item = requests.find(r => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Request not found." });
  item.status = status; item.reviewedAt = new Date().toISOString();
  writeRequests(requests);
  res.json({ ok: true, request: item });
});
app.use(express.static(path.join(__dirname, "dist")));
app.get("/{*path}", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
app.listen(PORT, () => console.log(`Jackpot Deal server running on http://localhost:${PORT}`));
