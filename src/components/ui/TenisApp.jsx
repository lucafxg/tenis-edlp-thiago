"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  User,
  Shield,
  LogOut,
  Search,
  Wrench,
  Bell,
  CreditCard,
  BadgeCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

/**
 * DEMO / PREVIEW APP (single-file React)
 * -----------------------------------
 * Basado en el PDF "Requerimiento Técnico - Funcional" (Sistema de Reserva de Canchas de Tenis - Club Estudiantes de La Plata).
 *
 * Esta es una maqueta funcional (frontend-only) con "backend" simulado en localStorage.
 * Incluye:
 * - Registro + validación de DNI vs sistema de socios (mock endpoint)
 * - Esquemas de auth configurables: Email+Password, Email+OTP, Teléfono+OTP
 * - Validación obligatoria de cuenta (email y/o teléfono) antes de reservar/pagar
 * - 4 canchas, turnos fijos de 60 min, anticipación máx 7 días
 * - Reserva en estado Pendiente de Pago -> Confirmada
 * - Pago: Mercado Pago (simulado) o Efectivo (admin)
 * - Política no-presentación/cancelación (50% reintegro)
 * - Notificaciones (simuladas: Email/WhatsApp) por eventos
 * - Panel admin: agenda diaria/semanal, crear reservas manuales, registrar efectivo,
 *   cancelar/modificar, bloquear canchas/horarios, historial, auditoría
 *
 * Para producción:
 * - Reemplazar storage local por API real (usuarios/reservas/pagos/canchas)
 * - Integrar endpoint real de validación de socio (DNI -> flag)
 * - Integrar Mercado Pago real + Webhooks para estados
 * - Integrar WhatsApp Business (Meta) + proveedor email (SendGrid, etc.)
 */

// -----------------------------
// Utilidades
// -----------------------------

const LS_KEY = "edlp_tenis_reservas_v1";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatDateISO(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateHuman(iso) {
  // iso YYYY-MM-DD
  const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
  const x = new Date(y, m - 1, d);
  return x.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeLabel(t) {
  return t;
}

function nowISOTime() {
  return new Date().toISOString();
}

function safeParseJSON(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

// -----------------------------
// Mock: Validación DNI (Sistema de socios)
// -----------------------------

async function validateSocioByDNI(dni) {
  // Simula integración online: input DNI, output flag socio activo.
  // Regla demo: DNI termina en número par => socio activo.
  await new Promise((r) => setTimeout(r, 450));
  const last = String(dni || "").trim().slice(-1);
  const n = Number(last);
  const socioActivo = Number.isFinite(n) && n % 2 === 0;
  return { socioActivo };
}

// -----------------------------
// Dominio
// -----------------------------

const COURTS_DEFAULT = [
  { id: "c1", name: "Cancha 1", isActive: true },
  { id: "c2", name: "Cancha 2", isActive: true },
  { id: "c3", name: "Cancha 3", isActive: true },
  { id: "c4", name: "Cancha 4", isActive: true },
];

// Turnos: 60 min. Para demo: 08:00 a 22:00
const SLOT_TIMES = Array.from({ length: 14 }, (_, i) => {
  const h = 8 + i;
  return `${String(h).padStart(2, "0")}:00`;
});

const RES_STATUS = {
  PENDING_PAYMENT: "Pendiente de pago",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No presentación",
};

const PAY_STATUS = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  REFUNDED_PARTIAL: "Reembolsado (parcial)",
};

const NOTIF_CHANNELS = ["Email", "WhatsApp Business"];

// Autenticación fija: Email + Password
const AUTH_MODE = "EMAIL_PASSWORD";

const APP_CONFIG_DEFAULT = {
  authMode: AUTH_MODE,
  requireEmailValidation: true,
  requirePhoneValidation: true,
  priceSocio: 0,
  priceNoSocio: 8000,
  currency: "ARS",
};

// -----------------------------
// Storage simulado
// -----------------------------

function bootstrapState() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) return safeParseJSON(raw, null);

  // Seed demo
  const adminId = uid("usr");
  const seed = {
    config: APP_CONFIG_DEFAULT,
    courts: COURTS_DEFAULT,
    users: [
      {
        id: adminId,
        role: "admin",
        email: "admin@edlp.com",
        phone: "11-0000-0000",
        dni: "12345678",
        userType: "Socio",
        createdAt: nowISOTime(),
        passwordHash: "admin", // DEMO
        isEmailValidated: true,
        isPhoneValidated: true,
      },
    ],
    sessions: {},
    reservations: [],
    payments: [],
    blocks: [], // {id, courtId, dateISO, time, reason, createdBy, createdAt}
    audit: [
      {
        id: uid("aud"),
        at: nowISOTime(),
        by: adminId,
        action: "Seed",
        detail: "Sistema inicializado con usuario admin demo (admin@edlp.com / admin)",
      },
    ],
    notifications: [], // {id, at, channel, to, event, payload}
  };
  localStorage.setItem(LS_KEY, JSON.stringify(seed));
  return seed;
}

function persistState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

// -----------------------------
// UI helpers
// -----------------------------

function Pill({ tone = "default", children, icon: Icon }) {
  const toneCls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : tone === "danger"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : tone === "info"
            ? "bg-sky-50 text-sky-700 border-sky-200"
            : "bg-muted text-foreground border-border";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${toneCls}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span className="leading-none">{children}</span>
    </span>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-2xl border bg-card p-2 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-lg font-semibold leading-tight">{title}</div>
          {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

function EmptyState({ title, desc, action }) {
  return (
    <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
      <div className="mx-auto mb-2 h-10 w-10 rounded-2xl border bg-muted/40" />
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

function TopBar({ user, onLogout }) {
  return (
    <div className="sticky top-0 z-30 border-b bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <img src="https://upload.wikimedia.org/wikipedia/commons/6/68/Escudo_del_Club_Estudiantes_de_La_Plata.svg" alt="Escudo Estudiantes" className="h-10 w-10 object-contain" />
          <div>
            <div className="text-sm font-semibold leading-tight">Club Estudiantes de La Plata</div>
            <div className="text-xs text-muted-foreground">Reserva de canchas de tenis</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Badge variant="secondary" className="rounded-full">
                {user.role === "admin" ? "Admin" : user.userType}
              </Badge>
              <div className="hidden text-sm text-muted-foreground md:block">{user.email || user.phone}</div>
              <Button className="bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Salir
              </Button>
            </>
          ) : (
            <Badge variant="secondary" className="rounded-full">
              Demo
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function BottomNav({ active, setActive, isAdmin }) {
  const items = [
    { key: "reservar", label: "Reservar", icon: Calendar },
    { key: "mis", label: "Mis reservas", icon: Clock },
    { key: "perfil", label: "Perfil", icon: User },
    ...(isAdmin ? [{ key: "admin", label: "Admin", icon: Shield }] : []),
  ];

  const gridCols = isAdmin
    ? "grid-cols-4 md:grid-cols-4"
    : "grid-cols-3 md:grid-cols-3";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/80 backdrop-blur">
      <div className={`mx-auto grid w-full max-w-6xl ${gridCols} gap-2 px-3 py-2`}>
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => setActive(it.key)}
            className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm transition-all duration-200 ease-in-out ${
              active === it.key ? "bg-muted font-semibold" : "hover:bg-muted/60"
            }`}
          >
            <it.icon className="h-4 w-4" />
            <span className="truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// -----------------------------
// App
// -----------------------------

export default function App() {
  const [db, setDb] = useState(() => bootstrapState());
  const [sessionUserId, setSessionUserId] = useState(() => db.sessions?.currentUserId || null);
  const [activeTab, setActiveTab] = useState("reservar");
  const [authScreen, setAuthScreen] = useState(null); // null | 'login' | 'register'

  useEffect(() => {
    setDb((prev) => {
      const next = { ...prev, sessions: { ...prev.sessions, currentUserId: sessionUserId } };
      persistState(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId]);

  const user = useMemo(() => db.users.find((u) => u.id === sessionUserId) || null, [db.users, sessionUserId]);
  const api = useMemo(() => createApi(db, setDb), [db]);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!user) setActiveTab("reservar");
  }, [user]);

  // 🔁 Redirección automática a "Mis reservas" luego de pago exitoso
  useEffect(() => {
    function handler() {
      setActiveTab("mis");
    }
    document.addEventListener('go-to-mis', handler);
    return () => document.removeEventListener('go-to-mis', handler);
  }, []);

  return (
    <div className={`min-h-screen ${!user && !authScreen ? 'bg-gradient-to-br from-red-700 via-red-600 to-red-800' : 'bg-background'}`}>
      <TopBar user={user} onLogout={() => setSessionUserId(null)} />

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">
        <AnimatePresence mode="wait" initial={false}>
          {!user ? (
            authScreen ? (
              <AuthGate
                api={api}
                mode={authScreen}
                onAuthed={(uid) => {
                  setSessionUserId(uid);
                  setAuthScreen(null);
                }}
                onBack={() => setAuthScreen(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
                <div className="flex h-40 w-40 items-center justify-center rounded-3xl bg-white p-4 shadow-2xl">
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/6/68/Escudo_del_Club_Estudiantes_de_La_Plata.svg"
                    alt="Escudo Club Estudiantes de La Plata"
                    className="h-full w-full object-contain"
                  />
                </div>

                <div>
                  <div className="text-3xl font-bold tracking-tight text-white">Club Estudiantes de La Plata</div>
                  <div className="mt-2 text-base font-medium text-white">Sistema Oficial de Reserva de Tenis</div>
                </div>

                <div className="mt-6 flex w-full max-w-xs flex-col gap-4">
                  <Button
                    className="w-full rounded-2xl bg-white text-red-700 hover:bg-red-50" 
                    onClick={() => setAuthScreen('login')}
                  >
                    Ingresar
                  </Button>
                  <Button
                    className="w-full rounded-2xl bg-white text-red-700 hover:bg-red-50" 
                    onClick={() => setAuthScreen('register')}
                  >
                    Crear cuenta
                  </Button>
                </div>
              </div>
            )
          ) : (
            <>
              {activeTab === 'reservar' && (
                <motion.div
                  key="reservar"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <BookingView api={api} db={db} user={user} />
                </motion.div>
              )}
              {activeTab === 'mis' && (
                <motion.div
                  key="mis"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <MyReservations api={api} db={db} user={user} goToReservar={() => setActiveTab('reservar')} />
                </motion.div>
              )}
              {activeTab === 'perfil' && (
                <motion.div
                  key="perfil"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <ProfileView api={api} db={db} user={user} />
                </motion.div>
              )}
              {activeTab === 'admin' && isAdmin && (
                <motion.div
                  key="admin"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <AdminView api={api} db={db} user={user} />
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>

      {user && (
        <BottomNav active={activeTab} setActive={setActiveTab} isAdmin={isAdmin} />
      )}
    </div>
  );
}
// -----------------------------
// API local (mutaciones con auditoría + notificaciones)
// -----------------------------

function createApi(db, setDb) {
  function commit(mutator) {
    setDb((prev) => {
      const next = mutator(structuredClone(prev));
      persistState(next);
      return next;
    });
  }

  function audit(by, action, detail) {
    commit((st) => {
      st.audit.unshift({ id: uid("aud"), at: nowISOTime(), by, action, detail });
      return st;
    });
  }

  function notify(event, channels, to, payload) {
    commit((st) => {
      const created = channels.map((ch) => ({ id: uid("ntf"), at: nowISOTime(), channel: ch, to, event, payload }));
      st.notifications.unshift(...created);
      return st;
    });
  }

  return {
    getConfig: () => db.config,
    setConfig: (by, patch) => {
      commit((st) => {
        st.config = { ...st.config, ...patch };
        return st;
      });
      audit(by, "Config", JSON.stringify(patch));
    },

    validateSocioByDNI,

    register: async ({ email, phone, dni, password }) => {
      const dniClean = String(dni || "").trim();
      const emailClean = String(email || "").trim().toLowerCase();
      const phoneClean = String(phone || "").trim();
      const pass = String(password || "");

      if (!dniClean || dniClean.length < 6) throw new Error("DNI inválido");
      if (!emailClean.includes("@")) throw new Error("Email inválido");
      if (!phoneClean) throw new Error("Teléfono obligatorio");

      // 🔐 Política de contraseña
      const passRegex = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{6,}$/;
      if (!passRegex.test(pass)) {
        throw new Error("La contraseña debe tener mínimo 6 caracteres, 1 mayúscula y 1 símbolo (@, -, etc)");
      }

      const exists = db.users.some((u) => u.email === emailClean || u.dni === dniClean);
      if (exists) throw new Error("Ya existe un usuario con ese email o DNI");

      const { socioActivo } = await validateSocioByDNI(dniClean);
      const userType = socioActivo ? "Socio" : "No Socio";

      const id = uid("usr");
      commit((st) => {
        st.users.push({
          id,
          role: "user",
          email: emailClean,
          phone: phoneClean,
          dni: dniClean,
          userType,
          createdAt: nowISOTime(),
          passwordHash: pass,
          isEmailValidated: false,
          isPhoneValidated: false,
        });
        return st;
      });
      audit(id, "Register", `Alta usuario (${userType})`);
      notify("Validación de cuenta", NOTIF_CHANNELS, emailClean, { msg: "Tu cuenta fue creada. Validá email/WhatsApp para reservar." });
      return id;
    },

    loginEmailPassword: async ({ email, password }) => {
      const e = String(email || "").trim().toLowerCase();
      const u = db.users.find((x) => x.email === e);
      if (!u) throw new Error("Usuario no encontrado");
      if (u.passwordHash !== String(password || "")) throw new Error("Credenciales inválidas");
      audit(u.id, "Login", "Email+Password");
      return u.id;
    },

    requestOtp: async ({ channel, to }) => {
      // DEMO: siempre 123456
      await new Promise((r) => setTimeout(r, 350));
      return { ok: true, code: "123456" };
    },

    loginWithOtp: async ({ mode, email, phone, otp }) => {
      if (String(otp || "") !== "123456") throw new Error("OTP inválido (demo: 123456)");
      const u =
        mode === AUTH_MODES.PHONE_OTP
          ? db.users.find((x) => x.phone === String(phone || "").trim())
          : db.users.find((x) => x.email === String(email || "").trim().toLowerCase());
      if (!u) throw new Error("Usuario no encontrado");
      audit(u.id, "Login", mode);
      return u.id;
    },

    validateAccount: (by, { emailOk, phoneOk }) => {
      commit((st) => {
        const u = st.users.find((x) => x.id === by);
        if (!u) return st;
        if (typeof emailOk === "boolean") u.isEmailValidated = emailOk;
        if (typeof phoneOk === "boolean") u.isPhoneValidated = phoneOk;
        return st;
      });
      audit(by, "Account", `Validación: email=${emailOk ?? "-"}, phone=${phoneOk ?? "-"}`);
      const u = db.users.find((x) => x.id === by);
      if (u) notify("Validación de cuenta", NOTIF_CHANNELS, u.email, { emailOk, phoneOk });
    },

    setCourtActive: (by, courtId, isActive) => {
      commit((st) => {
        const c = st.courts.find((x) => x.id === courtId);
        if (c) c.isActive = isActive;
        return st;
      });
      audit(by, "Court", `${courtId} active=${isActive}`);
    },

    addBlock: (by, { courtId, dateISO, time, reason }) => {
      const id = uid("blk");
      commit((st) => {
        st.blocks.push({ id, courtId, dateISO, time, reason, createdBy: by, createdAt: nowISOTime() });
        return st;
      });
      audit(by, "Block", `${courtId} ${dateISO} ${time} (${reason || "s/reason"})`);
      return id;
    },

    removeBlock: (by, blockId) => {
      commit((st) => {
        st.blocks = st.blocks.filter((b) => b.id !== blockId);
        return st;
      });
      audit(by, "Unblock", blockId);
    },

    createReservation: async (by, { dateISO, time, courtId, forUserId }) => {
      const u = db.users.find((x) => x.id === (forUserId || by));
      if (!u) throw new Error("Usuario inválido");

      // Reglas: cuenta validada obligatorio
      const cfg = db.config;
      if (cfg.requireEmailValidation && !u.isEmailValidated) throw new Error("Debés validar tu email antes de reservar");
      if (cfg.requirePhoneValidation && !u.isPhoneValidated) throw new Error("Debés validar tu WhatsApp antes de reservar");

      // Anticipación máxima 7 días
      const today = startOfDay(new Date());
      const target = startOfDay(new Date(dateISO + "T00:00:00"));
      const max = startOfDay(addDays(today, 7));
      if (target < today) throw new Error("No podés reservar en fechas pasadas");
      if (target > max) throw new Error("Solo podés reservar con hasta 7 días de anticipación");

      // Cancha activa
      const c = db.courts.find((x) => x.id === courtId);
      if (!c || !c.isActive) throw new Error("Cancha no disponible");

      // Bloqueos
      const blocked = db.blocks.some((b) => b.courtId === courtId && b.dateISO === dateISO && b.time === time);
      if (blocked) throw new Error("Horario bloqueado por mantenimiento");

      // Disponibilidad: una reserva por cancha+horario
      const conflictCourt = db.reservations.some(
        (r) => r.courtId === courtId && r.dateISO === dateISO && r.time === time && r.status !== RES_STATUS.CANCELLED
      );
      if (conflictCourt) throw new Error("Ese turno ya está reservado");

      // Reglas clave: usuario no puede reservar más de una cancha en el mismo horario
      const conflictUser = db.reservations.some(
        (r) =>
          r.userId === u.id &&
          r.dateISO === dateISO &&
          r.time === time &&
          r.status !== RES_STATUS.CANCELLED
      );
      if (conflictUser) throw new Error("Ya tenés una reserva en ese mismo horario");

      const id = uid("res");
      const price = u.userType === "Socio" ? db.config.priceSocio : db.config.priceNoSocio;

      commit((st) => {
        st.reservations.push({
          id,
          userId: u.id,
          createdBy: by,
          dateISO,
          time,
          courtId,
          status: RES_STATUS.PENDING_PAYMENT,
          price,
          createdAt: nowISOTime(),
          updatedAt: nowISOTime(),
        });
        // payment record
        st.payments.push({
          id: uid("pay"),
          reservationId: id,
          method: null,
          status: PAY_STATUS.PENDING,
          amount: price,
          createdAt: nowISOTime(),
          updatedAt: nowISOTime(),
          meta: {},
        });
        return st;
      });

      audit(by, "Reserva", `Creada ${id} (${dateISO} ${time} ${courtId})`);
      notify("Reserva creada", NOTIF_CHANNELS, u.email, { reservationId: id, dateISO, time, courtId, price });
      return id;
    },

    payWithMercadoPago: async (by, reservationId) => {
      // DEMO: aprobación inmediata
      await new Promise((r) => setTimeout(r, 650));
      commit((st) => {
        const r = st.reservations.find((x) => x.id === reservationId);
        const p = st.payments.find((x) => x.reservationId === reservationId);
        if (!r || !p) return st;
        p.method = "Mercado Pago";
        p.status = PAY_STATUS.APPROVED;
        p.updatedAt = nowISOTime();
        p.meta = { mp: { status: "approved", operationId: uid("mp"), at: nowISOTime() } };
        r.status = RES_STATUS.CONFIRMED;
        r.updatedAt = nowISOTime();
        return st;
      });
      audit(by, "Pago", `MP aprobado (res=${reservationId})`);
      const r = db.reservations.find((x) => x.id === reservationId);
      const u = r ? db.users.find((x) => x.id === r.userId) : null;
      if (u) notify("Pago confirmado", NOTIF_CHANNELS, u.email, { reservationId });
      return true;
    },

    registerCashPayment: (by, reservationId) => {
      commit((st) => {
        const r = st.reservations.find((x) => x.id === reservationId);
        const p = st.payments.find((x) => x.reservationId === reservationId);
        if (!r || !p) return st;
        p.method = "Efectivo (recepción)";
        p.status = PAY_STATUS.APPROVED;
        p.updatedAt = nowISOTime();
        p.meta = { cash: { by, at: nowISOTime() } };
        r.status = RES_STATUS.CONFIRMED;
        r.updatedAt = nowISOTime();
        return st;
      });
      audit(by, "Pago", `Efectivo aprobado (res=${reservationId})`);
      const r = db.reservations.find((x) => x.id === reservationId);
      const u = r ? db.users.find((x) => x.id === r.userId) : null;
      if (u) notify("Pago confirmado", NOTIF_CHANNELS, u.email, { reservationId, method: "cash" });
    },

    cancelReservation: (by, reservationId, reason) => {
      commit((st) => {
        const r = st.reservations.find((x) => x.id === reservationId);
        if (!r) return st;
        r.status = RES_STATUS.CANCELLED;
        r.updatedAt = nowISOTime();
        r.cancelReason = reason || "";
        return st;
      });
      audit(by, "Reserva", `Cancelada ${reservationId} (${reason || "sin motivo"})`);
      const r = db.reservations.find((x) => x.id === reservationId);
      const u = r ? db.users.find((x) => x.id === r.userId) : null;
      if (u) notify("Cancelación", NOTIF_CHANNELS, u.email, { reservationId, reason });
    },

    markNoShowAndRefund50: (by, reservationId) => {
      commit((st) => {
        const r = st.reservations.find((x) => x.id === reservationId);
        const p = st.payments.find((x) => x.reservationId === reservationId);
        if (!r || !p) return st;
        r.status = RES_STATUS.NO_SHOW;
        r.updatedAt = nowISOTime();
        // 50% refund
        p.status = PAY_STATUS.REFUNDED_PARTIAL;
        p.updatedAt = nowISOTime();
        p.meta = { ...p.meta, refund: { percent: 50, amount: Math.round((p.amount || 0) * 0.5), by, at: nowISOTime() } };
        return st;
      });
      audit(by, "NoShow", `No presentación + reintegro 50% (res=${reservationId})`);
      const r = db.reservations.find((x) => x.id === reservationId);
      const u = r ? db.users.find((x) => x.id === r.userId) : null;
      if (u) notify("No presentación", NOTIF_CHANNELS, u.email, { reservationId, refundPercent: 50 });
      if (u) notify("Reintegros", NOTIF_CHANNELS, u.email, { reservationId, refundPercent: 50 });
    },

    adminCreateManualReservation: async (by, { userId, dateISO, time, courtId, markPaidCash }) => {
      const resId = await apiShim(db, setDb).createReservation(by, { dateISO, time, courtId, forUserId: userId });
      if (markPaidCash) apiShim(db, setDb).registerCashPayment(by, resId);
      audit(by, "Admin", `Reserva manual ${resId}`);
      return resId;
    },
  };

  // Nota: Para evitar cierres viejos del memo, usamos shim puntual
  function apiShim(db2, setDb2) {
    return createApi(db2, setDb2);
  }
}

// -----------------------------
// AuthGate
// -----------------------------

function AuthGate({ api, onAuthed, mode = 'login', onBack }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [showReset, setShowReset] = useState(false);

  const passwordValid = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{6,}$/.test(password);
  const emailValid = email.includes("@");
  const dniValid = dni.trim().length >= 6;
  const phoneValid = phone.trim().length > 0;
  const canRegister = passwordValid && emailValid && dniValid && phoneValid && !busy;

  async function doLogin() {
    setErr("");
    setBusy(true);
    try {
      const uid = await api.loginEmailPassword({ email, password });
      onAuthed(uid);
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function doRegister() {
    setErr("");
    setBusy(true);
    try {
      const uid = await api.register({ email, phone, dni, password });
      onAuthed(uid);
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            {mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'login' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) doLogin();
              }}
            >
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input className="rounded-2xl" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@mail.com" />
              </div>
              <div className="mt-4 grid gap-2">
                <Label>Password</Label>
                <Input className="rounded-2xl" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>

              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => setShowReset(!showReset)}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Olvidé mi contraseña
                </button>
              </div>

              {showReset && (
                <div className="mt-2 rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                  En producción: envío de email de recuperación.
                </div>
              )}

              {err && <InlineError msg={err} />}

              <Button
                type="submit"
                className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl"
                disabled={busy}
              >
                {busy ? 'Procesando…' : 'Entrar'}
              </Button>
            </form>
          ) : (
            <>
              <div className="grid gap-2">
                <Label>DNI</Label>
                <Input className="rounded-2xl" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="12345678" />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input className="rounded-2xl" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@mail.com" />
              </div>
              <div className="grid gap-2">
                <Label>Teléfono</Label>
                <Input className="rounded-2xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11-1234-5678" />
              </div>
              <div className="grid gap-2">
                <Label>Password</Label>
                <Input className="rounded-2xl" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mín 6 caracteres, 1 mayúscula y 1 símbolo" />
                <div className="text-xs text-muted-foreground">
                  Requisitos: mínimo 6 caracteres, al menos 1 mayúscula y 1 símbolo.
                </div>
              </div>

              {err && <InlineError msg={err} />}

              <Button
                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl"
                onClick={doRegister}
                disabled={!canRegister}
              >
                {busy ? 'Creando…' : 'Crear cuenta'}
              </Button>
            </>
          )}

          {onBack && (
            <Button
              variant="ghost"
              className="w-full rounded-2xl"
              onClick={onBack}
            >
              Volver
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InlineError({ msg }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      <AlertTriangle className="mt-0.5 h-4 w-4" />
      <div>{msg}</div>
    </div>
  );
}

// -----------------------------
// Booking
// -----------------------------

function BookingView({ api, db, user }) {
  const [dateISO, setDateISO] = useState(() => formatDateISO(new Date()));
  const [time, setTime] = useState(SLOT_TIMES[0]);
  const [courtId, setCourtId] = useState("c1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [createdResId, setCreatedResId] = useState(null);
  const [payOpen, setPayOpen] = useState(false);

  const cfg = db.config;

  const maxDateISO = useMemo(() => formatDateISO(addDays(startOfDay(new Date()), 7)), []);

  const courts = useMemo(() => db.courts, [db.courts]);

  const availability = useMemo(() => {
    const res = db.reservations.filter((r) => r.dateISO === dateISO && r.time === time && r.status !== RES_STATUS.CANCELLED);
    const blocks = db.blocks.filter((b) => b.dateISO === dateISO && b.time === time);
    const byCourt = new Map();
    for (const c of courts) {
      const isBlocked = blocks.some((b) => b.courtId === c.id);
      const isReserved = res.some((r) => r.courtId === c.id);
      byCourt.set(c.id, {
        isActive: c.isActive,
        status: !c.isActive ? "Inactiva" : isBlocked ? "Mantenimiento" : isReserved ? "Ocupada" : "Disponible",
      });
    }
    return byCourt;
  }, [db.blocks, db.reservations, courts, dateISO, time]);

  async function createReservation() {
    setErr("");
    setBusy(true);
    try {
      const id = await api.createReservation(user.id, { dateISO, time, courtId });
      setCreatedResId(id);
      setPayOpen(true);
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  const price = user.userType === "Socio" ? cfg.priceSocio : cfg.priceNoSocio;

  return (
    <div className="grid gap-4">
      <SectionTitle
        icon={Calendar}
        title="Reservar cancha"
        subtitle="Turnos de 60 minutos. Anticipación máxima: 7 días. Disponibilidad en tiempo real."
        right={
          <Pill tone="info" icon={Bell}>
            Notificaciones: Email + WhatsApp
          </Pill>
        }
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="grid gap-4 p-4 md:grid-cols-4">
          <div className="flex flex-col justify-between gap-2">
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input
                className="rounded-2xl"
                type="date"
                value={dateISO}
                min={formatDateISO(new Date())}
                max={maxDateISO}
                onChange={(e) => setDateISO(e.target.value)}
              />
            </div>
            <div className="h-4 text-xs text-muted-foreground">&nbsp;</div>
          </div>

          <div className="flex flex-col justify-between gap-2">
            <div className="grid gap-2">
              <Label>Horario</Label>
              <Select value={time} onValueChange={(v) => setTime(v)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_TIMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTimeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="h-4 text-xs text-muted-foreground">&nbsp;</div>
          </div>

          <div className="flex flex-col justify-between gap-2">
            <div className="grid gap-2">
              <Label>Cancha</Label>
              <Select value={courtId} onValueChange={(v) => setCourtId(v)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {courts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="h-4 text-xs text-muted-foreground">&nbsp;</div>
          </div>

          <div className="flex flex-col justify-between gap-2">
            <div className="grid gap-2">
              <Label>Precio</Label>
              <div className="flex h-10 items-center justify-between rounded-2xl border bg-muted/30 px-3 text-sm">
                <span>{user.userType}</span>
                <span className="font-semibold">{formatMoney(price, cfg.currency)}</span>
              </div>
            </div>
            <div className="h-4 text-xs text-muted-foreground">&nbsp;</div>
          </div>

          <div className="md:col-span-4">
            <Separator className="my-1" />
            <div className="grid gap-2 md:grid-cols-4">
              {courts.map((c) => {
                const a = availability.get(c.id);
                const tone =
                  !a.isActive || a.status === "Mantenimiento" ? "warning" : a.status === "Ocupada" ? "danger" : "success";
                return (
                  <div key={c.id} className="rounded-2xl border bg-card p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{c.name}</div>
                      <Pill tone={tone}>{a.status}</Pill>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{formatDateHuman(dateISO)} · {time}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {err ? (
            <div className="md:col-span-4">
              <InlineError msg={err} />
            </div>
          ) : null}

          <div className="md:col-span-4">
            <PolicyBanner />
          </div>

          <div className="md:col-span-4">
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={createReservation} disabled={busy}>
              {busy ? "Creando reserva…" : "Crear reserva"}
            </Button>
            <div className="mt-2 text-xs text-muted-foreground">
              Regla: no podés reservar más de una cancha en el mismo horario.
            </div>
          </div>
        </CardContent>
      </Card>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        api={api}
        db={db}
        user={user}
        reservationId={createdResId}
        onSuccess={() => {
          setPayOpen(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          // redirige automáticamente a Mis reservas
          document.dispatchEvent(new CustomEvent('go-to-mis'));
        }}
      />
    </div>
  );
}

function PolicyBanner() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4" />
        <div>
          <div className="font-semibold">Política de no presentación / cancelación</div>
          <div className="text-amber-900/80">
            Si no te presentás, se reintegra solo el <span className="font-semibold">50%</span> del valor. Esta política se
            muestra antes de pagar.
          </div>
        </div>
      </div>
      <Pill tone="warning">Reintegro 50%</Pill>
    </div>
  );
}

function PaymentDialog({ open, onOpenChange, api, db, user, reservationId, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  const reservation = useMemo(
    () => db.reservations.find((r) => r.id === reservationId) || null,
    [db.reservations, reservationId]
  );
  const payment = useMemo(
    () => db.payments.find((p) => p.reservationId === reservationId) || null,
    [db.payments, reservationId]
  );

  async function payMP() {
    if (!reservationId) return;
    setErr("");
    setBusy(true);
    try {
      await api.payWithMercadoPago(user.id, reservationId);
      setSuccess(true);

      setTimeout(() => {
        // animación suave de salida
        setSuccess(false);
        setTimeout(() => {
          onOpenChange(false);
          if (onSuccess) onSuccess();
        }, 300);
      }, 4000);
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Confirmar pago</DialogTitle>
          <DialogDescription>
            La reserva queda <span className="font-medium">pendiente</span> hasta que el pago esté <span className="font-medium">aprobado</span>.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800"
            >
              <CheckCircle2 className="h-8 w-8" />
              <div className="text-base font-semibold">Pago confirmado</div>
              <div className="text-sm text-emerald-900/80">Tu reserva fue confirmada correctamente.</div>
            </motion.div>
          ) : !reservation ? (
            <div className="text-sm text-muted-foreground">No hay reserva seleccionada.</div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className="rounded-2xl border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Reserva</div>
                  <Badge variant="secondary" className="rounded-full">
                    {reservation.status}
                  </Badge>
                </div>
                <div className="mt-1 text-muted-foreground">{formatDateHuman(reservation.dateISO)} · {reservation.time} · {courtName(db, reservation.courtId)}</div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-muted-foreground">Total</div>
                  <div className="font-semibold">{formatMoney(reservation.price, db.config.currency)}</div>
                </div>
              </div>

              <PolicyBanner />

              <div className="rounded-2xl border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <div className="text-sm font-semibold">Mercado Pago (online)</div>
                  </div>
                  <Pill tone="info">Demo</Pill>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  En producción: redirección a checkout + webhooks. En demo: aprobación inmediata.
                </div>
                <Button className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={payMP} disabled={busy || reservation.status !== RES_STATUS.PENDING_PAYMENT}>
                  {busy ? "Procesando…" : "Pagar con Mercado Pago"}
                </Button>
              </div>

              {payment ? (
                <div className="text-xs text-muted-foreground">
                  Estado del pago: <span className="font-medium text-foreground">{payment.status}</span>
                </div>
              ) : null}

              {err ? <InlineError msg={err} /> : null}
            </motion.div>
          )}
        </AnimatePresence>

        {!success && (
          <DialogFooter>
            <Button className="bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------
// Mis reservas
// -----------------------------

function MyReservations({ api, db, user, goToReservar }) {
  const [q, setQ] = useState("");
  const [selectedResId, setSelectedResId] = useState(null);
  const [payOpen, setPayOpen] = useState(false);

  const mine = useMemo(() => {
    return db.reservations
      .filter((r) => r.userId === user.id && r.status !== RES_STATUS.CANCELLED)
      .sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time));
  }, [db.reservations, user.id]);

  

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return mine;
    return mine.filter((r) => `${r.dateISO} ${r.time} ${courtName(db, r.courtId)} ${r.status}`.toLowerCase().includes(qq));
  }, [mine, q, db]);

  return (
    <div className="grid gap-4">
      <SectionTitle
        icon={Clock}
        title="Mis reservas"
        subtitle="Seguimiento de estados: pendiente, confirmada, cancelada, no presentación."
        right={
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input className="w-56 rounded-2xl" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/40">
            <Calendar className="h-6 w-6" />
          </div>
          <div className="text-base font-semibold">No tenés reservas</div>
          <div className="mt-1 text-sm text-muted-foreground">Creá una reserva desde la sección Reservar.</div>
          <div className="mt-4 flex justify-center">
            <Button className="bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={goToReservar}>
              Ir a reservar
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const p = db.payments.find((x) => x.reservationId === r.id);
            return (
              <Card key={r.id} className="rounded-2xl shadow-sm">
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold">{formatDateHuman(r.dateISO)} · {r.time}</div>
                      <Badge variant="secondary" className="rounded-full">
                        {courtName(db, r.courtId)}
                      </Badge>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Pago: <span className="font-medium text-foreground">{p?.status || "-"}</span> · Total: {formatMoney(r.price, db.config.currency)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status === RES_STATUS.PENDING_PAYMENT ? (
                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white rounded-2xl"
                        onClick={() => {
                          setSelectedResId(r.id);
                          setPayOpen(true);
                        }}
                      >
                        Pagar
                      </Button>
                    ) : null}
                    {r.status !== RES_STATUS.CANCELLED ? (
                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white rounded-2xl"
                        onClick={() => api.cancelReservation(user.id, r.id, "Cancelación por usuario")}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        api={api}
        db={db}
        user={user}
        reservationId={selectedResId}
        onSuccess={() => {
          setPayOpen(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          document.dispatchEvent(new CustomEvent('go-to-mis'));
        }}
      />
    </div>
  );
}

function StatusPill({ status }) {
  const tone =
    status === RES_STATUS.CONFIRMED
      ? "success"
      : status === RES_STATUS.PENDING_PAYMENT
        ? "warning"
        : status === RES_STATUS.NO_SHOW
          ? "danger"
          : "default";

  const icon =
    status === RES_STATUS.CONFIRMED
      ? CheckCircle2
      : status === RES_STATUS.PENDING_PAYMENT
        ? AlertTriangle
        : status === RES_STATUS.NO_SHOW
          ? XCircle
          : null;

  return (
    <Pill tone={tone} icon={icon}>
      {status}
    </Pill>
  );
}

// -----------------------------
// Perfil
// -----------------------------

function ProfileView({ api, db, user }) {
  const cfg = db.config;
  const needsEmail = cfg.requireEmailValidation && !user.isEmailValidated;
  const needsPhone = cfg.requirePhoneValidation && !user.isPhoneValidated;

  return (
    <div className="grid gap-4">
      <SectionTitle
        icon={User}
        title="Perfil"
        subtitle="Datos mínimos y validación obligatoria para operar."
        right={<Pill tone={user.userType === "Socio" ? "success" : "info"}>{user.userType}</Pill>}
      />

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Datos personales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="Teléfono" value={user.phone} />
          <InfoRow label="DNI" value={user.dni} />
          <InfoRow label="Tipo" value={user.userType} />
          <div className="md:col-span-2">
            <div className="rounded-2xl border bg-muted/30 p-4 text-xs text-muted-foreground">
              SI ALGUNO DE LOS DATOS PERSONALES SON INCORRECTOS, COMUNIQUESE CON EL AREA DE SOCIOS.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Validación de cuenta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={user.isEmailValidated ? "success" : "warning"} icon={user.isEmailValidated ? CheckCircle2 : AlertTriangle}>
              Email {user.isEmailValidated ? "validado" : "pendiente"}
            </Pill>
            <Pill tone={user.isPhoneValidated ? "success" : "warning"} icon={user.isPhoneValidated ? CheckCircle2 : AlertTriangle}>
              WhatsApp {user.isPhoneValidated ? "validado" : "pendiente"}
            </Pill>
          </div>

          {(needsEmail || needsPhone) ? (
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-sm font-semibold">Completar validación</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Hasta no validar, no podés reservar ni pagar.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {needsEmail ? (
                  <Button className="bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={() => api.validateAccount(user.id, { emailOk: true })}>
                    Validar email (demo)
                  </Button>
                ) : null}
                {needsPhone ? (
                  <Button className="bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={() => api.validateAccount(user.id, { phoneOk: true })}>
                    Validar WhatsApp (demo)
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
                <div>
                  <div className="font-semibold">Cuenta validada</div>
                  <div className="text-emerald-900/80">Ya podés reservar y pagar.</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Actividad y notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Stat label="Reservas" value={db.reservations.filter((r) => r.userId === user.id).length} />
            <Stat label="Notificaciones" value={db.notifications.filter((n) => n.to === user.email).length} />
          </div>
          <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
            En esta demo, las notificaciones se registran internamente. En producción se envían por Email y WhatsApp Business.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value || "-"}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

// -----------------------------
// Admin
// -----------------------------

function AdminView({ api, db, user }) {
  const [view, setView] = useState("agenda");

  return (
    <div className="grid gap-4">
      <SectionTitle
        icon={Shield}
        title="Administración"
        subtitle="Agenda, reservas manuales, pagos en efectivo, bloqueos, historial y auditoría."
        right={
          <div className="flex items-center gap-2">
            <Pill tone="info" icon={Settings}>Roles + Logs</Pill>
          </div>
        }
      />

      <Tabs value={view} onValueChange={setView}>
        <TabsList className="grid w-full grid-cols-2 rounded-2xl md:grid-cols-4">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="mt-4">
          <AdminAgenda db={db} />
        </TabsContent>

        <TabsContent value="operaciones" className="mt-4">
          <AdminOps api={api} db={db} admin={user} />
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          <AdminHistory db={db} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <AdminConfig api={api} db={db} admin={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdminAgenda({ db }) {
  const [scope, setScope] = useState("daily");
  const [dateISO, setDateISO] = useState(() => formatDateISO(new Date()));

  const days = useMemo(() => {
    if (scope === "daily") return [dateISO];
    // weekly: 7 días desde dateISO
    const base = startOfDay(new Date(dateISO + "T00:00:00"));
    return Array.from({ length: 7 }, (_, i) => formatDateISO(addDays(base, i)));
  }, [scope, dateISO]);

  const rows = useMemo(() => {
    const out = [];
    for (const d of days) {
      for (const t of SLOT_TIMES) {
        for (const c of db.courts) {
          const block = db.blocks.find((b) => b.dateISO === d && b.time === t && b.courtId === c.id);
          const res = db.reservations.find(
            (r) => r.dateISO === d && r.time === t && r.courtId === c.id && r.status !== RES_STATUS.CANCELLED
          );
          out.push({ dateISO: d, time: t, court: c, block, res });
        }
      }
    }
    return out;
  }, [db.blocks, db.courts, db.reservations, days]);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-base">Agenda {scope === "daily" ? "diaria" : "semanal"}</CardTitle>
            <div className="text-sm text-muted-foreground">Vista por cancha y horario.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-44 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diaria</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
              </SelectContent>
            </Select>
            <Input className="w-44 rounded-2xl" type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto rounded-2xl border">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-12 border-b bg-muted/30 text-xs font-semibold">
              <div className="col-span-2 p-3">Fecha</div>
              <div className="col-span-2 p-3">Horario</div>
              <div className="col-span-2 p-3">Cancha</div>
              <div className="col-span-3 p-3">Estado</div>
              <div className="col-span-3 p-3">Usuario</div>
            </div>
            {rows.map((r, idx) => {
              const state = !r.court.isActive
                ? { label: "Inactiva", tone: "warning" }
                : r.block
                  ? { label: "Bloqueada", tone: "danger" } // 🔴 rojo
                  : r.res
                    ? { label: "Reservada", tone: "warning" } // 🟡 amarillo
                    : { label: "Disponible", tone: "success" }; // 🟢 verde

              const u = r.res ? db.users.find((x) => x.id === r.res.userId) : null;

              return (
                <div key={idx} className="grid grid-cols-12 border-b text-sm">
                  <div className="col-span-2 p-3 text-xs text-muted-foreground">{formatDateHuman(r.dateISO)}</div>
                  <div className="col-span-2 p-3">{r.time}</div>
                  <div className="col-span-2 p-3">{r.court.name}</div>
                  <div className="col-span-3 p-3">
                    <Pill tone={state.tone}>{state.label}</Pill>
                  </div>
                  <div className="col-span-3 p-3 text-xs text-muted-foreground">
                    {u ? `${u.email} (${u.userType})` : "-"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminOps({ api, db, admin }) {
  const [dateISO, setDateISO] = useState(() => formatDateISO(new Date()));
  const [time, setTime] = useState(SLOT_TIMES[0]);
  const [courtId, setCourtId] = useState("c1");

  const [userId, setUserId] = useState(db.users.find((u) => u.role !== "admin")?.id || db.users[0]?.id);
  const [markPaidCash, setMarkPaidCash] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Estado correcto para selección de reserva
  const [selectedResId, setSelectedResId] = useState(null);

  const eligibleUsers = useMemo(() => db.users.filter((u) => u.role !== "admin"), [db.users]);

  const dayReservations = useMemo(() => {
    return db.reservations
      .filter((r) => r.dateISO === dateISO)
      .sort((a, b) => (a.time + a.courtId).localeCompare(b.time + b.courtId));
  }, [db.reservations, dateISO]);

  async function createManual() {
    setErr("");
    setBusy(true);
    try {
      await api.adminCreateManualReservation(admin.id, { userId, dateISO, time, courtId, markPaidCash });
      setMarkPaidCash(false);
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Crear reserva manual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Usuario</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eligibleUsers.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No hay usuarios (creá uno desde Registro)
                  </SelectItem>
                ) : (
                  eligibleUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email} ({u.userType})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input className="rounded-2xl" type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Horario</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_TIMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cancha</Label>
              <Select value={courtId} onValueChange={setCourtId}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {db.courts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border bg-card p-3">
            <div className="text-sm">
              <div className="font-semibold">Registrar pago en efectivo</div>
              <div className="text-xs text-muted-foreground">Carga manual por administrador</div>
            </div>
            <Switch className="data-[state=checked]:bg-red-600 data-[state=unchecked]:bg-red-200" checked={markPaidCash} onCheckedChange={setMarkPaidCash} />
          </div>

          {err ? <InlineError msg={err} /> : null}
          <Button className="w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={createManual} disabled={busy || eligibleUsers.length === 0}>
            {busy ? "Creando…" : "Crear"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Bloquear cancha / horario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input className="rounded-2xl" type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Horario</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_TIMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cancha</Label>
              <Select value={courtId} onValueChange={setCourtId}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {db.courts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Motivo</Label>
            <Input className="rounded-2xl" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mantenimiento" />
          </div>

          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl"
            onClick={() => {
              api.addBlock(admin.id, { courtId, dateISO, time, reason: reason || "Mantenimiento" });
              setReason("");
            }}
          >
            <Wrench className="mr-2 h-4 w-4" /> Bloquear
          </Button>

          <Separator />

          <div>
            <div className="text-sm font-semibold">Bloqueos existentes</div>
            <div className="mt-2 grid gap-2">
              {db.blocks.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sin bloqueos.</div>
              ) : (
                db.blocks
                  .slice()
                  .sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time))
                  .map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-2xl border bg-card p-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-semibold">{courtName(db, b.courtId)} · {formatDateHuman(b.dateISO)} · {b.time}</div>
                        <div className="text-xs text-muted-foreground truncate">{b.reason || "-"}</div>
                      </div>
                      <Button className="bg-red-600 hover:bg-red-700 text-white rounded-2xl" onClick={() => api.removeBlock(admin.id, b.id)}>
                        Quitar
                      </Button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Operaciones sobre reservas del día</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input className="w-52 rounded-2xl" type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Seleccionada</Label>
              <Select value={selectedResId || "none"} onValueChange={(v) => setSelectedResId(v === "none" ? null : v)}>
                <SelectTrigger className="w-80 rounded-2xl">
                  <SelectValue placeholder="Elegí una reserva" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {dayReservations.map((r) => {
                    const u = db.users.find((x) => x.id === r.userId);
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        {r.time} · {courtName(db, r.courtId)} · {u?.email || "-"} · {r.status}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedResId ? (
            <AdminReservationActions api={api} db={db} admin={admin} reservationId={selectedResId} />
          ) : (
            <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">Elegí una reserva para operar.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminReservationActions({ api, db, admin, reservationId }) {
  const reservation = db.reservations.find((r) => r.id === reservationId);
  const payment = db.payments.find((p) => p.reservationId === reservationId);
  const u = reservation ? db.users.find((x) => x.id === reservation.userId) : null;

  if (!reservation) return null;

  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{formatDateHuman(reservation.dateISO)} · {reservation.time} · {courtName(db, reservation.courtId)}</div>
          <div className="text-xs text-muted-foreground">Usuario: {u?.email || "-"} ({u?.userType || "-"})</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={reservation.status} />
          <Pill tone={payment?.status === PAY_STATUS.APPROVED ? "success" : "warning"}>
            Pago: {payment?.status || "-"}
          </Pill>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Button
          className="bg-red-600 hover:bg-red-700 text-white rounded-2xl"
          onClick={() => api.registerCashPayment(admin.id, reservationId)}
          disabled={reservation.status !== RES_STATUS.PENDING_PAYMENT}
        >
          Registrar efectivo
        </Button>
        <Button
          className="bg-red-600 hover:bg-red-700 text-white rounded-2xl"
          onClick={() => api.cancelReservation(admin.id, reservationId, "Cancelación admin")}
          disabled={reservation.status === RES_STATUS.CANCELLED}
        >
          Cancelar
        </Button>
        <Button
          className="bg-red-600 hover:bg-red-700 text-white rounded-2xl"
          onClick={() => api.markNoShowAndRefund50(admin.id, reservationId)}
          disabled={reservation.status !== RES_STATUS.CONFIRMED}
        >
          No show + reintegro 50%
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatMoney(reservation.price, db.config.currency)}</span>
        {payment?.method ? <span> · Método: <span className="font-medium text-foreground">{payment.method}</span></span> : null}
      </div>
    </div>
  );
}

function AdminHistory({ db }) {
  const [tab, setTab] = useState("audit");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="rounded-2xl shadow-sm md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 rounded-2xl md:grid-cols-4">
              <TabsTrigger value="audit">Auditoría</TabsTrigger>
              <TabsTrigger value="notifs">Notificaciones</TabsTrigger>
              <TabsTrigger value="reservas">Reservas</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
            </TabsList>

            <TabsContent value="audit" className="mt-4">
              <ListTable
                cols={["Fecha", "Usuario", "Acción", "Detalle"]}
                rows={db.audit.slice(0, 80).map((a) => [
                  new Date(a.at).toLocaleString("es-AR"),
                  (db.users.find((u) => u.id === a.by)?.email || a.by),
                  a.action,
                  a.detail,
                ])}
              />
            </TabsContent>

            <TabsContent value="notifs" className="mt-4">
              <ListTable
                cols={["Fecha", "Canal", "Destino", "Evento"]}
                rows={db.notifications.slice(0, 80).map((n) => [
                  new Date(n.at).toLocaleString("es-AR"),
                  n.channel,
                  n.to,
                  n.event,
                ])}
              />
            </TabsContent>

            <TabsContent value="reservas" className="mt-4">
              <ListTable
                cols={["Fecha", "Horario", "Cancha", "Usuario", "Estado"]}
                rows={db.reservations
                  .slice()
                  .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
                  .slice(0, 80)
                  .map((r) => [
                    formatDateHuman(r.dateISO),
                    r.time,
                    courtName(db, r.courtId),
                    db.users.find((u) => u.id === r.userId)?.email || "-",
                    r.status,
                  ])}
              />
            </TabsContent>

            <TabsContent value="pagos" className="mt-4">
              <ListTable
                cols={["Reserva", "Método", "Estado", "Monto"]}
                rows={db.payments
                  .slice()
                  .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
                  .slice(0, 80)
                  .map((p) => [
                    p.reservationId,
                    p.method || "-",
                    p.status,
                    formatMoney(p.amount, db.config.currency),
                  ])}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function ListTable({ cols, rows }) {
  return (
    <div className="overflow-auto rounded-2xl border">
      <table className="w-full min-w-[780px] text-sm">
        <thead className="bg-muted/30">
          <tr>
            {cols.map((c) => (
              <th key={c} className="p-3 text-left text-xs font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((cell, j) => (
                <td key={j} className="p-3 text-xs text-muted-foreground">
                  <span className="text-foreground">{cell}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminConfig({ api, db, admin }) {
  const cfg = db.config;
  const [authMode, setAuthMode] = useState(cfg.authMode);
  const [reqEmail, setReqEmail] = useState(cfg.requireEmailValidation);
  const [reqPhone, setReqPhone] = useState(cfg.requirePhoneValidation);
  const [priceSocio, setPriceSocio] = useState(cfg.priceSocio);
  const [priceNoSocio, setPriceNoSocio] = useState(cfg.priceNoSocio);

  useEffect(() => {
    setAuthMode(cfg.authMode);
    setReqEmail(cfg.requireEmailValidation);
    setReqPhone(cfg.requirePhoneValidation);
    setPriceSocio(cfg.priceSocio);
    setPriceNoSocio(cfg.priceNoSocio);
  }, [cfg]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Autenticación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            El sistema utiliza autenticación fija por <span className="font-semibold text-foreground">Email + Password</span>.
          </div>
          <div className="flex items-center justify-between rounded-2xl border bg-card p-3">
            <div className="text-sm">
              <div className="font-semibold">Validación de email obligatoria</div>
              <div className="text-xs text-muted-foreground">Sin validar, no reserva ni paga</div>
            </div>
            <Switch className="data-[state=checked]:bg-red-600 data-[state=unchecked]:bg-red-200" checked={reqEmail} onCheckedChange={setReqEmail} />
          </div>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl"
            onClick={() => api.setConfig(admin.id, { requireEmailValidation: reqEmail })}
          >
            Guardar
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Precios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Socio</Label>
            <Input
              className="rounded-2xl"
              type="number"
              value={priceSocio}
              onChange={(e) => setPriceSocio(clamp(parseInt(e.target.value || "0", 10) || 0, 0, 1000000))}
            />
          </div>
          <div className="grid gap-2">
            <Label>No socio</Label>
            <Input
              className="rounded-2xl"
              type="number"
              value={priceNoSocio}
              onChange={(e) => setPriceNoSocio(clamp(parseInt(e.target.value || "0", 10) || 0, 0, 1000000))}
            />
          </div>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white rounded-2xl"
            onClick={() => api.setConfig(admin.id, { priceSocio, priceNoSocio })}
          >
            Guardar
          </Button>
          <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
            Nota: El PDF no especifica valores; se dejan configurables.
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Canchas (activar/desactivar)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {db.courts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-2xl border bg-card p-3">
              <div className="text-sm">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">Una sola reserva por horario</div>
              </div>
              <Switch className="data-[state=checked]:bg-red-600 data-[state=unchecked]:bg-red-200" checked={c.isActive} onCheckedChange={(v) => api.setCourtActive(admin.id, c.id, v)} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------
// Helpers dominio
// -----------------------------

function courtName(db, courtId) {
  return db.courts.find((c) => c.id === courtId)?.name || courtId;
}

function formatMoney(amount, currency) {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toLocaleString("es-AR")}`;
  }
}
