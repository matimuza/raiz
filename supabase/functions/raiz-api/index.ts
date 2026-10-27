// raiz-api — intermediario único entre el frontend y las tablas de Supabase.
// El navegador nunca toca las tablas directamente (RLS les niega todo acceso
// con la anon key); esta función usa la service_role key, que ignora RLS.
//
// Reconstruida desde cero en 2026-10 a partir del contrato que ya consumía
// app.js (la función original se perdió cuando el proyecto free de Supabase
// se pausó por inactividad). Replica el contrato observado; algunas reglas
// de autorización finas (quién puede aprobar/devolver una OCC en qué estado)
// no estaban documentadas en ningún lado y se implementaron con un criterio
// razonable basado en los roles — revisar si no coincide con el negocio real.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RAIZ_SECRET = Deno.env.get('RAIZ_SECRET')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-raiz-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function err(code: string, message: string, status = 400) {
  return json({ error: code, message }, status);
}

// ── Password hashing (PBKDF2-HMAC-SHA256, salteado) ─────────────────────
const PBKDF2_ITERATIONS = 100_000;

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivePbkdf2Bits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  const actual = await derivePbkdf2Bits(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

async function derivePbkdf2Bits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── Tokens propios (no es Supabase auth) — HMAC-SHA256 firmado con RAIZ_SECRET ──
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

async function signToken(payload: Record<string, unknown>): Promise<string> {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

async function verifyToken(token: string): Promise<{ uid: string } | null> {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return null;
  const expected = await hmac(body);
  if (!constantTimeEqual(new TextEncoder().encode(sig), new TextEncoder().encode(expected))) return null;
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.uid || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(RAIZ_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toHex(new Uint8Array(sig));
}

function publicUser(u: Record<string, unknown>) {
  // Nunca mandar pass_hash al frontend.
  const { pass_hash: _pass_hash, ...rest } = u;
  return rest;
}

// ── Auth: resuelve el usuario a partir del header x-raiz-token ──────────
async function authenticate(req: Request) {
  const token = req.headers.get('x-raiz-token') || '';
  const payload = await verifyToken(token);
  if (!payload) return null;
  const { data: user } = await db.from('users').select('*').eq('id', payload.uid).maybeSingle();
  if (!user) return null;
  return user;
}

// ── Handlers ──────────────────────────────────────────────────────────
async function handleLogin(payload: any) {
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  if (!email || !password) return err('bad_request', 'Faltan credenciales', 400);

  const { data: user } = await db.from('users').select('*').eq('email', email).maybeSingle();
  if (!user || !(await verifyPassword(password, user.pass_hash))) {
    return err('invalid_credentials', 'Correo o contraseña incorrectos', 401);
  }
  if (user.role === 'pendiente') {
    return err('pending', 'Tu cuenta todavía no fue aprobada por un administrador', 403);
  }
  const { data: tenant } = await db.from('tenants').select('*').eq('id', user.tenant_id).maybeSingle();
  const token = await signToken({ uid: user.id, exp: Date.now() + TOKEN_TTL_MS });
  return json({ token, user: publicUser(user), tenant });
}

async function handleRegister(payload: any) {
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const area = String(payload.area || '').trim();
  const company = String(payload.company || '').trim();
  if (!name || !email || !password) return err('bad_request', 'Faltan datos obligatorios', 400);

  const { data: existing } = await db.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return err('email_taken', 'El correo ya está registrado', 409);

  const domain = email.split('@')[1] || '';
  let { data: tenant } = await db.from('tenants').select('*').eq('domain', domain).maybeSingle();
  let isFirstInTenant = false;
  if (!tenant) {
    isFirstInTenant = true;
    const { data: newTenant, error: tErr } = await db
      .from('tenants')
      .insert({ domain, name: company || domain, plan: 'free' })
      .select()
      .single();
    if (tErr) return err('server_error', 'No se pudo crear la empresa', 500);
    tenant = newTenant;
  }

  const pass_hash = await hashPassword(password);
  const colors = ['#f0a500', '#3b82f6', '#a78bfa', '#00c48c', '#e03e3e', '#06b6d4'];
  const { data: user, error: uErr } = await db
    .from('users')
    .insert({
      id: `u_${Date.now()}${Math.floor(Math.random() * 1000)}`,
      name, email, pass_hash, area, company,
      role: isFirstInTenant ? 'admin' : 'pendiente',
      tenant_id: tenant.id,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
    .select()
    .single();
  if (uErr) return err('server_error', 'No se pudo crear el usuario', 500);

  if (!isFirstInTenant) {
    return json({ pending: true, message: 'Tu cuenta quedó pendiente de aprobación por un administrador de tu empresa.' });
  }
  const token = await signToken({ uid: user.id, exp: Date.now() + TOKEN_TTL_MS });
  return json({ token, user: publicUser(user), tenant });
}

async function handleBoot(user: any) {
  const { data: tenant } = await db.from('tenants').select('*').eq('id', user.tenant_id).maybeSingle();
  const { data: users } = await db.from('users').select('*').eq('tenant_id', user.tenant_id);
  const { data: occs } = await db.from('occs').select('*').eq('tenant_id', user.tenant_id);
  return json({
    user: publicUser(user),
    tenant,
    users: (users || []).map(publicUser),
    occs: occs || [],
    notifs: [],
  });
}

async function handleOccInsert(user: any, payload: any) {
  const occ = payload.occ || {};
  const { data: maxRow } = await db
    .from('occs').select('num').eq('tenant_id', user.tenant_id)
    .order('num', { ascending: false }).limit(1).maybeSingle();
  const num = (maxRow?.num || 0) + 1;

  const row = {
    num,
    date: occ.date, problem: occ.problem, responsable: occ.responsable, area: occ.area,
    integrantes: occ.integrantes || '', status: occ.status || 'open',
    causes: occ.causes, whys: occ.whys || [], actions: occ.actions || [],
    photos: occ.photos || [], context: occ.context || {},
    impact: null, evidencia: '', learning: '',
    created_by: user.id, tenant_id: user.tenant_id,
  };
  const { data: inserted, error } = await db.from('occs').insert(row).select().single();
  if (error) return err('server_error', 'No se pudo guardar la OCC', 500);
  return json({ occ: inserted });
}

async function handleOccUpdate(user: any, payload: any) {
  const id = payload.id;
  const fields = payload.fields || {};
  if (!id) return err('bad_request', 'Falta el id', 400);

  const { data: existing } = await db.from('occs').select('*').eq('id', id).eq('tenant_id', user.tenant_id).maybeSingle();
  if (!existing) return err('not_found', 'OCC no encontrada', 404);

  // Aprobar/devolver/cerrar una OCC requiere rol de revisor; el resto
  // (corregir, agregar mediciones, marcar acciones hechas) lo puede hacer
  // cualquiera del tenant — el frontend ya gatea estos botones por rol,
  // esto es una segunda capa, no necesariamente idéntica a cada regla
  // original (que no estaba documentada en ningún lado).
  const estadoNuevo = fields.context?.raiz?.review?.estado;
  const esRevision = estadoNuevo === 'aprobada' || estadoNuevo === 'devuelta';
  if (esRevision && user.role !== 'admin' && user.role !== 'supervisor') {
    return err('forbidden', 'No tenés permiso para revisar OCCs', 403);
  }

  const { error } = await db.from('occs').update(fields).eq('id', id).eq('tenant_id', user.tenant_id);
  if (error) return err('server_error', 'No se pudo actualizar la OCC', 500);
  return json({ ok: true });
}

async function handleOccDelete(user: any, payload: any) {
  if (user.role !== 'admin') return err('forbidden', 'Solo un administrador puede eliminar OCCs', 403);
  const { error } = await db.from('occs').delete().eq('id', payload.id).eq('tenant_id', user.tenant_id);
  if (error) return err('server_error', 'No se pudo eliminar la OCC', 500);
  return json({ ok: true });
}

async function handleUserSetRole(user: any, payload: any) {
  if (user.role !== 'admin') return err('forbidden', 'Solo un administrador puede cambiar roles', 403);
  const allowed = ['pendiente', 'operario', 'supervisor', 'admin'];
  if (!allowed.includes(payload.role)) return err('bad_request', 'Rol inválido', 400);

  const { data: target } = await db.from('users').select('id').eq('id', payload.id).eq('tenant_id', user.tenant_id).maybeSingle();
  if (!target) return err('not_found', 'Usuario no encontrado', 404);

  const { data: updated, error } = await db.from('users').update({ role: payload.role }).eq('id', payload.id).select().single();
  if (error) return err('server_error', 'No se pudo actualizar el usuario', 500);
  return json({ user: publicUser(updated) });
}

async function handleAi(payload: any) {
  if (!ANTHROPIC_API_KEY) return err('unavailable', 'IA no configurada', 503);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: payload.max_tokens || 1000,
        messages: [{ role: 'user', content: String(payload.prompt || '') }],
      }),
    });
    if (!r.ok) return err('ai_error', 'Error del proveedor de IA', 502);
    const data = await r.json();
    const text = data?.content?.[0]?.text || '';
    return json({ text });
  } catch {
    return err('ai_error', 'Error llamando a la IA', 502);
  }
}

// ── Router ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return err('method_not_allowed', 'Método no permitido', 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'JSON inválido', 400);
  }
  const { action } = body || {};
  if (!action) return err('bad_request', 'Falta action', 400);

  if (action === 'login') return handleLogin(body);
  if (action === 'register') return handleRegister(body);

  // Todo lo demás requiere token válido.
  const user = await authenticate(req);
  if (!user) return err('unauthorized', 'Sesión inválida o vencida', 401);

  switch (action) {
    case 'boot': return handleBoot(user);
    case 'occ.insert': return handleOccInsert(user, body);
    case 'occ.update': return handleOccUpdate(user, body);
    case 'occ.delete': return handleOccDelete(user, body);
    case 'user.setRole': return handleUserSetRole(user, body);
    case 'ai': return handleAi(body);
    default: return err('unknown_action', `Acción desconocida: ${action}`, 400);
  }
});
