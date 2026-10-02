import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import pg from 'pg';

try { process.loadEnvFile(); } catch { /* .env is optional */ }

const { Pool } = pg;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.PUBLIC_APP_ORIGIN || `http://localhost:${PORT}`;
const COOKIE = 'entre_nos_session';
const SESSION_DAYS = 30;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID || undefined);
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /sslmode=require/i.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX || 8),
  idleTimeoutMillis: 30_000
}) : null;

const sha256 = value => createHash('sha256').update(value).digest('hex');
const sendJson = (res, status, value, extraHeaders = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(value));
};
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  for (const item of raw.split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = new Set([ORIGIN, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
  if (!allowed.has(origin)) throw fail(403, 'Origem não autorizada.');
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'A solicitação é muito grande.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); } catch { throw fail(400, 'Envie um JSON válido.'); }
}

async function requireSession(req) {
  if (!pool) throw fail(503, 'Banco de dados ainda não configurado.');
  const rawToken = cookieValue(req, COOKIE);
  if (!rawToken) throw fail(401, 'Entre com sua conta Google para continuar.', 'auth_required');
  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.name, u.avatar_url, u.phone_e164,
           p.relationship_type, p.main_goal, p.money_style, p.current_challenge,
           p.spending_setup, p.income_range, p.share_income, p.priorities,
           p.notification_preference, p.default_transaction_scope, p.onboarding_completed
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN profiles p ON p.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`, [sha256(rawToken)]);
  if (!rows[0]) throw fail(401, 'Sua sessão expirou. Entre novamente.', 'auth_required');
  return rows[0];
}

async function getCouple(userId) {
  const { rows } = await pool.query(`
    SELECT c.id, c.name, s.plan, s.status,
           (SELECT COUNT(*)::int FROM couple_members cm2 WHERE cm2.couple_id=c.id) AS member_count
      FROM couple_members cm
      JOIN couples c ON c.id=cm.couple_id
      JOIN subscriptions s ON s.couple_id=c.id
     WHERE cm.user_id=$1 LIMIT 1`, [userId]);
  return rows[0] || null;
}

async function ensureCouple(client, userId, firstName) {
  const { rows: existing } = await client.query('SELECT couple_id FROM couple_members WHERE user_id=$1 LIMIT 1', [userId]);
  if (existing[0]) return existing[0].couple_id;
  const { rows: coupleRows } = await client.query('INSERT INTO couples (name,created_by) VALUES ($1,$2) RETURNING id', [`Espaço de ${firstName}`, userId]);
  const coupleId = coupleRows[0].id;
  await client.query('INSERT INTO couple_members (couple_id,user_id,role) VALUES ($1,$2,\'owner\')', [coupleId, userId]);
  await client.query('INSERT INTO subscriptions (couple_id,plan) VALUES ($1,\'free\')', [coupleId]);
  return coupleId;
}

function safeText(value, max = 160) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

async function signInWithGoogle(req, res) {
  checkOrigin(req);
  if (!GOOGLE_CLIENT_ID) throw fail(503, 'O login Google ainda precisa de um OAuth Client ID.');
  if (!pool) throw fail(503, 'Configure DATABASE_URL antes de iniciar o login.');
  const { credential } = await readJson(req);
  if (typeof credential !== 'string' || credential.length > 12_000) throw fail(400, 'Credencial Google inválida.');
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) throw fail(401, 'Não foi possível validar esta conta Google.');

  const client = await pool.connect();
  const token = randomBytes(32).toString('base64url');
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO users (google_subject,email,name,avatar_url)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (google_subject) DO UPDATE
        SET email=EXCLUDED.email, name=EXCLUDED.name, avatar_url=EXCLUDED.avatar_url, updated_at=NOW()
      RETURNING id,name,email,avatar_url`, [payload.sub, payload.email.toLowerCase(), safeText(payload.name, 120) || payload.email, payload.picture || null]);
    const user = rows[0];
    await client.query('INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
    await ensureCouple(client, user.id, (user.name.split(/\s+/)[0] || 'Meu').slice(0, 45));
    await client.query('DELETE FROM sessions WHERE user_id=$1 AND expires_at<NOW()', [user.id]);
    await client.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+($3 || \' days\')::interval)', [sha256(token), user.id, String(SESSION_DAYS)]);
    await client.query('COMMIT');
    setSessionCookie(res, token);
    const couple = await getCouple(user.id);
    const { rows: profileRows } = await pool.query('SELECT * FROM profiles WHERE user_id=$1', [user.id]);
    return { user, profile: profileRows[0], couple };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') throw fail(409, 'Este e-mail já está associado a outro cadastro.');
    throw error;
  } finally { client.release(); }
}

function getRequestScope(body, profile) {
  return body.visibility === 'personal' ? 'personal'
    : body.visibility === 'shared' ? 'shared'
    : profile.default_transaction_scope || 'shared';
}

function amountFromText(text) {
  const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?![\d.,])/i);
  if (!match) return null;
  let amount = match[1];
  if (amount.includes(',')) amount = amount.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(amount)) amount = amount.replace(/\./g, '');
  const value = Number(amount);
  return Number.isFinite(value) && value > 0 && value <= 10_000_000 ? { value, text: match[0] } : null;
}

function parseExpenseMessage(text) {
  const parsed = amountFromText(text);
  if (!parsed) return null;
  let description = text.replace(parsed.text, ' ')
    .replace(/\b(gastei|paguei|comprei|despesa|gasto|foi|de|r\$|reais|no|na|nos|nas|em|com|deu|valor|custou|o|a|um|uma|do|da)\b/gi, ' ')
    .replace(/\b(casal|compartilhado|compartilhada|pessoal|individual)\b/gi, ' ')
    .replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (description.length < 2) return null;
  const lower = description.toLowerCase();
  const categories = [
    ['Alimentação', /mercado|supermercado|padaria|restaurante|lanche|delivery|ifood|comida|feira/],
    ['Transporte', /uber|99\b|taxi|táxi|gasolina|combustível|onibus|ônibus|metro|metrô|estacionamento/],
    ['Moradia', /aluguel|condominio|condomínio|energia|eletricidade|agua|água|internet|casa/],
    ['Saúde', /farmacia|farmácia|remedio|remédio|consulta|medico|médico|saude|saúde/],
    ['Lazer', /cinema|viagem|show|streaming|spotify|netflix|lazer/],
    ['Educação', /curso|escola|faculdade|livro|educacao|educação/]
  ];
  return { amount: parsed.value, description: description[0].toUpperCase() + description.slice(1), category: categories.find(([, pattern]) => pattern.test(lower))?.[0] || 'Outros' };
}

function validWhatsAppSignature(rawBody, signature) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const received = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function sendWhatsAppText(to, body) {
  const { WHATSAPP_ACCESS_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: phoneId, WHATSAPP_GRAPH_API_VERSION: version } = process.env;
  if (!token || !phoneId || !version) {
    console.warn('WhatsApp Cloud API sem credenciais de envio; evento foi salvo sem resposta.');
    return;
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } })
  });
  if (!response.ok) console.error('WhatsApp Cloud API retornou erro de envio:', response.status, (await response.text()).slice(0, 300));
}

async function handleWhatsAppText(message) {
  const phone = String(message.from || '').replace(/\D/g, '');
  const text = safeText(message.text?.body, 1000);
  if (!phone || !text || !message.id) return;
  const { rows: claimed } = await pool.query(`
    INSERT INTO whatsapp_events (message_id,sender_phone)
    VALUES ($1,$2) ON CONFLICT (message_id) DO NOTHING RETURNING message_id`, [message.id, phone]);
  if (!claimed.length) return;

  const linkMatch = text.match(/^(?:vincular|link)\s+([a-z0-9]{6,12})$/i);
  if (linkMatch) {
    const codeHash = sha256(linkMatch[1].toUpperCase());
    const { rows: codeRows } = await pool.query(`SELECT user_id FROM whatsapp_link_codes WHERE code_hash=$1 AND used_at IS NULL AND expires_at>NOW()`, [codeHash]);
    if (!codeRows[0]) return sendWhatsAppText(phone, 'Esse código não está válido. Gere outro na sua conta Entre Nós e envie VINCULAR seguido do código.');
    try {
      await pool.query('UPDATE users SET phone_e164=$1,updated_at=NOW() WHERE id=$2', [phone, codeRows[0].user_id]);
      await pool.query('UPDATE whatsapp_link_codes SET used_at=NOW() WHERE code_hash=$1', [codeHash]);
      await sendWhatsAppText(phone, 'WhatsApp conectado ao seu espaço Entre Nós 💚 Agora você pode enviar: “gastei 48,90 no mercado”.');
    } catch (error) {
      if (error.code === '23505') return sendWhatsAppText(phone, 'Este número já está associado a outra conta. Desconecte-o antes de tentar novamente.');
      throw error;
    }
    return;
  }

  const { rows: users } = await pool.query(`
    SELECT u.id,u.name,p.default_transaction_scope
      FROM users u JOIN profiles p ON p.user_id=u.id
     WHERE regexp_replace(COALESCE(u.phone_e164,''),'[^0-9]','','g')=$1 LIMIT 1`, [phone]);
  const user = users[0];
  if (!user) return sendWhatsAppText(phone, 'Para começar, abra o Entre Nós, vincule seu número na área do casal e envie o código mostrado aqui.');

  const lower = text.toLowerCase();
  if (/^(relat[oó]rio|resumo|\/relatorio|\/resumo)\b/.test(lower)) {
    const { rows: memberRows } = await pool.query('SELECT couple_id FROM couple_members WHERE user_id=$1', [user.id]);
    const coupleId = memberRows[0]?.couple_id;
    const { rows } = await pool.query(`
      SELECT category, SUM(ABS(amount)) AS total
        FROM transactions
       WHERE couple_id=$1 AND direction='expense' AND deleted_at IS NULL
         AND transaction_date >= date_trunc('month',CURRENT_DATE)::date
         AND (visibility='shared' OR created_by=$2)
       GROUP BY category ORDER BY total DESC LIMIT 4`, [coupleId, user.id]);
    if (!rows.length) return sendWhatsAppText(phone, 'Ainda não há despesas registradas neste mês. Envie algo como “gastei 48,90 no mercado” para começar.');
    const lines = rows.map(row => `• ${row.category}: R$ ${Number(row.total).toFixed(2).replace('.', ',')}`);
    return sendWhatsAppText(phone, `Resumo do mês até agora 💚\n${lines.join('\n')}\n\nPara corrigir o último lançamento, envie DESFAZER.`);
  }
  if (/^(desfazer|\/desfazer|apagar [uú]ltimo)\b/.test(lower)) {
    const { rows } = await pool.query(`UPDATE transactions SET deleted_at=NOW()
      WHERE id=(SELECT id FROM transactions WHERE created_by=$1 AND source='whatsapp' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)
      RETURNING description,amount`, [user.id]);
    if (!rows[0]) return sendWhatsAppText(phone, 'Não encontrei um lançamento recente do WhatsApp para desfazer.');
    return sendWhatsAppText(phone, `Pronto, removi “${rows[0].description}” do seu resumo. 💚`);
  }
  if (/^(meta|metas|\/metas)\b/.test(lower)) {
    const { rows: members } = await pool.query('SELECT couple_id FROM couple_members WHERE user_id=$1', [user.id]);
    const { rows } = await pool.query(`SELECT title,current_amount,target_amount FROM goals WHERE couple_id=$1 AND status='active' ORDER BY created_at LIMIT 3`, [members[0]?.couple_id]);
    if (!rows.length) return sendWhatsAppText(phone, 'Vocês ainda não criaram uma meta. Acesse o Entre Nós para escolher o primeiro plano de vocês.');
    return sendWhatsAppText(phone, rows.map(g => `${g.title}: R$ ${Number(g.current_amount).toFixed(2).replace('.', ',')} de R$ ${Number(g.target_amount).toFixed(2).replace('.', ',')}`).join('\n'));
  }

  const parsed = parseExpenseMessage(text);
  if (!parsed) return sendWhatsAppText(phone, 'Não consegui identificar valor e item. Tente: “gastei 48,90 no mercado”. Use /pessoal ou /casal para escolher onde registrar.');
  const { rows: memberships } = await pool.query('SELECT couple_id FROM couple_members WHERE user_id=$1', [user.id]);
  if (!memberships[0]) return sendWhatsAppText(phone, 'Seu espaço ainda não está pronto. Entre no Entre Nós para concluir o cadastro.');
  const direction = /\b(recebi|sal[aá]rio|entrou|renda)\b/i.test(text) ? 'income' : 'expense';
  const amount = direction === 'income' ? parsed.amount : -parsed.amount;
  const visibility = /\/pessoal|\bindividual\b|\bpessoal\b/i.test(text) ? 'personal'
    : /\/casal|\bcompartilhad[oa]\b|\bdo casal\b/i.test(text) ? 'shared'
    : user.default_transaction_scope || 'shared';
  const { rows: saved } = await pool.query(`
    INSERT INTO transactions (couple_id,created_by,paid_by,amount,direction,category,description,visibility,source,whatsapp_message_id)
    VALUES ($1,$2,$2,$3,$4,$5,$6,$7,'whatsapp',$8)
    ON CONFLICT (whatsapp_message_id) DO NOTHING
    RETURNING description,amount,category,visibility`, [memberships[0].couple_id, user.id, amount, direction, parsed.category, parsed.description, visibility, message.id]);
  if (!saved[0]) return;
  const record = saved[0];
  const noun = direction === 'income' ? 'Entrada salva' : 'Despesa salva';
  const scope = record.visibility === 'personal' ? 'pessoal' : 'compartilhada';
  return sendWhatsAppText(phone, `${noun}: R$ ${parsed.amount.toFixed(2).replace('.', ',')} em ${record.description} · ${record.category} · ${scope}.\n\nEnvie DESFAZER se precisar corrigir. Para ver o mês: RELATÓRIO.`);
}

async function handleWhatsAppWebhook(req, res) {
  if (req.method === 'GET') {
    const url = new URL(req.url, ORIGIN);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') || '';
    const expected = process.env.WHATSAPP_VERIFY_TOKEN || '';
    if (mode === 'subscribe' && expected && token === expected) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(url.searchParams.get('hub.challenge') || '');
    }
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }
  if (req.method !== 'POST') throw fail(405, 'Método não permitido.');
  if (!pool) throw fail(503, 'Banco de dados ainda não configurado.');
  const raw = await readBody(req, 2_000_000);
  if (!validWhatsAppSignature(raw, req.headers['x-hub-signature-256'])) throw fail(401, 'Assinatura Meta inválida.');
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { throw fail(400, 'Payload inválido.'); }
  const messages = [];
  for (const entry of payload.entry || []) for (const change of entry.changes || []) for (const message of change.value?.messages || []) messages.push(message);
  for (const message of messages) await handleWhatsAppText(message);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"received":true}');
}

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /api/config') return sendJson(res, 200, {
    googleClientId: GOOGLE_CLIENT_ID,
    whatsappBusinessNumber: process.env.WHATSAPP_BUSINESS_NUMBER || '',
    databaseConfigured: Boolean(pool)
  });
  if (route === 'GET /api/health') {
    if (!pool) return sendJson(res, 503, { ok: false, database: 'not_configured' });
    await pool.query('SELECT 1');
    return sendJson(res, 200, { ok: true, database: 'connected' });
  }
  if (url.pathname === '/api/webhooks/whatsapp') return handleWhatsAppWebhook(req, res);
  if (route === 'POST /api/auth/google') {
    const result = await signInWithGoogle(req, res);
    return sendJson(res, 200, { authenticated: true, ...result });
  }
  if (route === 'POST /api/auth/logout') {
    checkOrigin(req);
    const token = cookieValue(req, COOKIE);
    if (token && pool) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }
  if (!url.pathname.startsWith('/api/')) return false;
  checkOrigin(req);
  const user = await requireSession(req);
  const couple = await getCouple(user.id);
  if (!couple) throw fail(409, 'Crie ou aceite um convite para abrir seu espaço.');

  if (route === 'GET /api/session') return sendJson(res, 200, { authenticated: true, user, profile: user, couple });
  if (route === 'PUT /api/profile') {
    const body = await readJson(req);
    const allowed = new Set(['dating','living_together','married','solo','prefer_not_say']);
    const goalAllowed = new Set(['organize','build_reserve','travel','buy_home','pay_debt','other']);
    const spendingAllowed = new Set(['shared_categories','split_equally','separate','not_decided']);
    const scope = body.defaultTransactionScope === 'personal' ? 'personal' : 'shared';
    const priorities = Array.isArray(body.priorities) ? [...new Set(body.priorities.map(x=>safeText(x,36)).filter(Boolean))].slice(0,3) : [];
    const { rows } = await pool.query(`
      UPDATE profiles SET relationship_type=$2,main_goal=$3,money_style=$4,current_challenge=$5,
        spending_setup=$6,income_range=$7,share_income=$8,priorities=$9,notification_preference=$10,
        default_transaction_scope=$11,onboarding_completed=TRUE,updated_at=NOW()
      WHERE user_id=$1 RETURNING *`, [
      user.id,
      allowed.has(body.relationshipType) ? body.relationshipType : 'prefer_not_say',
      goalAllowed.has(body.mainGoal) ? body.mainGoal : 'organize',
      safeText(body.moneyStyle,80), safeText(body.currentChallenge,240),
      spendingAllowed.has(body.spendingSetup) ? body.spendingSetup : 'not_decided',
      safeText(body.incomeRange,36) || null, body.shareIncome === true, priorities,
      ['weekly','alerts_only','none'].includes(body.notificationPreference) ? body.notificationPreference : 'weekly', scope
    ]);
    if (body.name) await pool.query('UPDATE users SET name=$2,updated_at=NOW() WHERE id=$1', [user.id, safeText(body.name,120)]);
    return sendJson(res, 200, { profile: rows[0] });
  }
  if (route === 'GET /api/dashboard') {
    const requestedMonth=url.searchParams.get('month')||'';
    const monthStart=/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)?`${requestedMonth}-01`:null;
    const range=`transaction_date>=COALESCE($3::date,date_trunc('month',CURRENT_DATE)::date)
      AND transaction_date<COALESCE(($3::date+INTERVAL '1 month')::date,(date_trunc('month',CURRENT_DATE)+INTERVAL '1 month')::date)`;
    const [tx, goals, budgets, totals, daily] = await Promise.all([
      pool.query(`SELECT id,created_by,amount,direction,category,description,visibility,source,transaction_date,created_at
        FROM transactions WHERE couple_id=$1 AND deleted_at IS NULL AND ${range} AND (visibility='shared' OR created_by=$2)
        ORDER BY transaction_date DESC,created_at DESC LIMIT 80`, [couple.id,user.id,monthStart]),
      pool.query(`SELECT id,title,target_amount,current_amount,deadline_date,status
        FROM goals WHERE couple_id=$1 AND status IN ('active','completed') ORDER BY created_at DESC`, [couple.id]),
      pool.query(`SELECT id,category,monthly_limit,period_start FROM budgets WHERE couple_id=$1 AND period_start=COALESCE($2::date,date_trunc('month',CURRENT_DATE)::date) ORDER BY category`, [couple.id,monthStart]),
      pool.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE direction='income'),0) AS income,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE direction='expense' AND visibility='shared'),0) AS shared_expenses,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE direction='expense' AND visibility='personal' AND created_by=$2),0) AS personal_expenses
        FROM transactions WHERE couple_id=$1 AND deleted_at IS NULL AND ${range}
        AND (visibility='shared' OR created_by=$2)`, [couple.id,user.id,monthStart]),
      pool.query(`SELECT transaction_date,
        COALESCE(SUM(amount) FILTER (WHERE direction='income'),0) AS income,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE direction='expense'),0) AS expenses
        FROM transactions WHERE couple_id=$1 AND deleted_at IS NULL AND ${range}
        AND (visibility='shared' OR created_by=$2) GROUP BY transaction_date ORDER BY transaction_date`,[couple.id,user.id,monthStart])
    ]);
    return sendJson(res, 200, { user, profile:user, couple, month:requestedMonth||null, totals:totals.rows[0], transactions:tx.rows, goals:goals.rows, budgets:budgets.rows, daily:daily.rows });
  }
  if (route === 'POST /api/transactions') {
    const body = await readJson(req);
    const amount = Number(body.amount);
    const direction = body.direction === 'income' ? 'income' : 'expense';
    const description = safeText(body.description,120);
    const category = safeText(body.category,50) || 'Outros';
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000 || description.length < 2) throw fail(400, 'Informe descrição e valor válidos.');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0,10);
    const visibility = getRequestScope(body,user);
    const signed = direction === 'income' ? amount : -amount;
    const { rows } = await pool.query(`INSERT INTO transactions (couple_id,created_by,paid_by,amount,direction,category,description,visibility,transaction_date)
      VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8) RETURNING id,amount::float,direction,category,description,visibility,source,transaction_date,created_at`,
      [couple.id,user.id,signed,direction,category,description,visibility,date]);
    return sendJson(res, 201, { transaction:rows[0] });
  }
  const editTx = url.pathname.match(/^\/api\/transactions\/([0-9a-f-]+)$/i);
  if (req.method === 'PUT' && editTx) {
    const body = await readJson(req);
    const amount = Number(body.amount);
    const direction = body.direction === 'income' ? 'income' : body.direction === 'expense' ? 'expense' : null;
    const description = safeText(body.description,120);
    const category = safeText(body.category,50) || 'Outros';
    if (!direction || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000 || description.length < 2) throw fail(400,'Informe descrição, tipo e valor válidos.');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
    if (!date) throw fail(400,'Informe uma data válida.');
    const visibility = getRequestScope(body,user);
    const signed = direction === 'income' ? amount : -amount;
    const { rows } = await pool.query(`UPDATE transactions SET amount=$4,direction=$5,category=$6,description=$7,visibility=$8,transaction_date=$9
      WHERE id=$1 AND couple_id=$2 AND created_by=$3 AND deleted_at IS NULL
      RETURNING id,amount::float,direction,category,description,visibility,source,transaction_date,created_at`,
      [editTx[1],couple.id,user.id,signed,direction,category,description,visibility,date]);
    if (!rows[0]) throw fail(404,'Lançamento não encontrado.');
    return sendJson(res,200,{transaction:rows[0]});
  }
  const deleteTx = url.pathname.match(/^\/api\/transactions\/([0-9a-f-]+)$/i);
  if (req.method === 'DELETE' && deleteTx) {
    const { rowCount } = await pool.query(`UPDATE transactions SET deleted_at=NOW() WHERE id=$1 AND couple_id=$2 AND created_by=$3 AND deleted_at IS NULL`, [deleteTx[1],couple.id,user.id]);
    if (!rowCount) throw fail(404,'Lançamento não encontrado.');
    return sendJson(res,200,{ok:true});
  }
  if (route === 'POST /api/goals') {
    if (couple.plan !== 'premium') {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM goals WHERE couple_id=$1 AND status='active'`,[couple.id]);
      if (rows[0].count >= 1) throw fail(403,'O plano grátis permite uma meta ativa. O Premium libera metas ilimitadas.','premium_required');
    }
    const body=await readJson(req), title=safeText(body.title,100), target=Number(body.targetAmount);
    if(title.length<2||!Number.isFinite(target)||target<=0) throw fail(400,'Informe o nome da meta e um valor válido.');
    const deadline=/^\d{4}-\d{2}-\d{2}$/.test(body.deadline||'')?body.deadline:null;
    const {rows}=await pool.query(`INSERT INTO goals (couple_id,created_by,title,target_amount,deadline_date) VALUES($1,$2,$3,$4,$5)
      RETURNING id,title,target_amount::float,current_amount::float,deadline_date,status`,[couple.id,user.id,title,target,deadline]);
    return sendJson(res,201,{goal:rows[0]});
  }
  const editGoal = url.pathname.match(/^\/api\/goals\/([0-9a-f-]+)$/i);
  if (req.method === 'PUT' && editGoal) {
    const body=await readJson(req),title=safeText(body.title,100),target=Number(body.targetAmount);
    if(title.length<2||!Number.isFinite(target)||target<=0) throw fail(400,'Informe o nome da meta e um valor válido.');
    const deadline=/^\d{4}-\d{2}-\d{2}$/.test(body.deadline||'')?body.deadline:null;
    const {rows}=await pool.query(`UPDATE goals SET title=$3,target_amount=$4,deadline_date=$5,
      status=CASE WHEN current_amount >= $4 THEN 'completed' ELSE 'active' END
      WHERE id=$1 AND couple_id=$2 AND status IN ('active','completed')
      RETURNING id,title,target_amount::float,current_amount::float,deadline_date,status`,[editGoal[1],couple.id,title,target,deadline]);
    if(!rows[0]) throw fail(404,'Meta não encontrada.');
    return sendJson(res,200,{goal:rows[0]});
  }
  const archiveGoal = url.pathname.match(/^\/api\/goals\/([0-9a-f-]+)$/i);
  if(req.method==='DELETE'&&archiveGoal){
    const {rowCount}=await pool.query(`UPDATE goals SET status='archived' WHERE id=$1 AND couple_id=$2 AND status IN ('active','completed')`,[archiveGoal[1],couple.id]);
    if(!rowCount) throw fail(404,'Meta não encontrada.');
    return sendJson(res,200,{ok:true});
  }
  const contribution=url.pathname.match(/^\/api\/goals\/([0-9a-f-]+)\/contributions$/i);
  if(req.method==='POST'&&contribution){
    const body=await readJson(req),amount=Number(body.amount);
    if(!Number.isFinite(amount)||amount<=0) throw fail(400,'Informe um valor válido.');
    const {rows}=await pool.query(`UPDATE goals SET current_amount=current_amount+$3,
      status=CASE WHEN current_amount+$3>=target_amount THEN 'completed' ELSE 'active' END
      WHERE id=$1 AND couple_id=$2 RETURNING id,title,target_amount::float,current_amount::float,deadline_date,status`,[contribution[1],couple.id,amount]);
    if(!rows[0]) throw fail(404,'Meta não encontrada.');
    return sendJson(res,200,{goal:rows[0]});
  }
  if (route === 'POST /api/budgets') {
    if(couple.plan!=='premium') throw fail(403,'Orçamentos por categoria e alertas avançados fazem parte do Premium.','premium_required');
    const body=await readJson(req),category=safeText(body.category,50),limit=Number(body.monthlyLimit);
    if(!category||!Number.isFinite(limit)||limit<=0) throw fail(400,'Informe categoria e limite válidos.');
    const {rows}=await pool.query(`INSERT INTO budgets (couple_id,category,monthly_limit,period_start)
      VALUES ($1,$2,$3,date_trunc('month',CURRENT_DATE)::date)
      ON CONFLICT(couple_id,category,period_start) DO UPDATE SET monthly_limit=EXCLUDED.monthly_limit
      RETURNING category,monthly_limit::float,period_start`,[couple.id,category,limit]);
    return sendJson(res,200,{budget:rows[0]});
  }
  const budgetById=url.pathname.match(/^\/api\/budgets\/([0-9a-f-]+)$/i);
  if(req.method==='PUT'&&budgetById){
    if(couple.plan!=='premium') throw fail(403,'Orçamentos por categoria e alertas avançados fazem parte do Premium.','premium_required');
    const body=await readJson(req),category=safeText(body.category,50),limit=Number(body.monthlyLimit);
    if(!category||!Number.isFinite(limit)||limit<=0) throw fail(400,'Informe categoria e limite válidos.');
    const duplicate=await pool.query(`SELECT 1 FROM budgets b2 WHERE b2.couple_id=$1 AND b2.category=$2
      AND b2.period_start=(SELECT period_start FROM budgets WHERE id=$3 AND couple_id=$1) AND b2.id<>$3 LIMIT 1`,[couple.id,category,budgetById[1]]);
    if(duplicate.rowCount) throw fail(409,'Já existe um limite para essa categoria neste mês.');
    const {rows}=await pool.query(`UPDATE budgets SET category=$3,monthly_limit=$4 WHERE id=$1 AND couple_id=$2
      RETURNING id,category,monthly_limit::float,period_start`,[budgetById[1],couple.id,category,limit]);
    if(!rows[0]) throw fail(404,'Limite de categoria não encontrado.');
    return sendJson(res,200,{budget:rows[0]});
  }
  if(req.method==='DELETE'&&budgetById){
    if(couple.plan!=='premium') throw fail(403,'Orçamentos por categoria e alertas avançados fazem parte do Premium.','premium_required');
    const {rowCount}=await pool.query(`DELETE FROM budgets WHERE id=$1 AND couple_id=$2`,[budgetById[1],couple.id]);
    if(!rowCount) throw fail(404,'Limite de categoria não encontrado.');
    return sendJson(res,200,{ok:true});
  }
  if (route === 'POST /api/couples/invite') {
    const code=randomBytes(5).toString('hex').toUpperCase(),hash=sha256(code);
    await pool.query(`INSERT INTO couple_invitations (couple_id,invited_by,code_hash,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '7 days')`,[couple.id,user.id,hash]);
    return sendJson(res,201,{code,inviteUrl:`${ORIGIN}/?convite=${code}`,expiresInDays:7});
  }
  if (route === 'POST /api/couples/join') {
    const body=await readJson(req),code=safeText(body.code,20).toUpperCase();
    if(!code) throw fail(400,'Código do convite inválido.');
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const {rows:invites}=await client.query(`SELECT id,couple_id FROM couple_invitations WHERE code_hash=$1 AND accepted_at IS NULL AND expires_at>NOW() FOR UPDATE`,[sha256(code)]);
      if(!invites[0]) throw fail(404,'Este convite expirou ou já foi usado.');
      const target=invites[0].couple_id;
      const {rows:count}=await client.query('SELECT COUNT(*)::int AS total FROM couple_members WHERE couple_id=$1',[target]);
      if(count[0].total>=2) throw fail(409,'Este espaço já tem duas pessoas.');
      const {rows:memberships}=await client.query('SELECT couple_id FROM couple_members WHERE user_id=$1 FOR UPDATE',[user.id]);
      if(memberships[0]&&memberships[0].couple_id!==target){
        const old=memberships[0].couple_id;
        const {rows:activity}=await client.query(`SELECT
          (SELECT COUNT(*)::int FROM transactions WHERE couple_id=$1 AND deleted_at IS NULL)+
          (SELECT COUNT(*)::int FROM goals WHERE couple_id=$1) AS total`,[old]);
        if(activity[0].total>0) throw fail(409,'Este perfil já tem um espaço com dados. Entre na sua conta principal para aceitar o convite.');
        await client.query('DELETE FROM couple_members WHERE couple_id=$1 AND user_id=$2',[old,user.id]);
        await client.query('DELETE FROM couples WHERE id=$1',[old]);
      }
      await client.query(`INSERT INTO couple_members(couple_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT(user_id) DO NOTHING`,[target,user.id]);
      await client.query('UPDATE couple_invitations SET accepted_by=$2,accepted_at=NOW() WHERE id=$1',[invites[0].id,user.id]);
      await client.query('COMMIT');
      return sendJson(res,200,{ok:true,couple:await getCouple(user.id)});
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{});
      throw error;
    } finally { client.release(); }
  }
  if (route === 'POST /api/whatsapp/link') {
    const code=randomBytes(4).toString('hex').toUpperCase();
    await pool.query('INSERT INTO whatsapp_link_codes (code_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL \'10 minutes\')',[sha256(code),user.id]);
    const businessNumber=(process.env.WHATSAPP_BUSINESS_NUMBER||'').replace(/\D/g,'');
    return sendJson(res,201,{code,businessNumber,expiresInMinutes:10,whatsappUrl:businessNumber?`https://wa.me/${businessNumber}?text=${encodeURIComponent(`VINCULAR ${code}`)}`:null});
  }
  if (route === 'POST /api/assistant/query') {
    const body=await readJson(req),question=safeText(body.question,200),lower=question.toLowerCase();
    const period=/\b(este m[eê]s|do m[eê]s|m[eê]s)\b/.test(lower)?`date_trunc('month',CURRENT_DATE)::date`:`CURRENT_DATE-INTERVAL '30 days'`;
    const categoryWords=['uber','mercado','alimentação','transporte','moradia','aluguel','farmácia','lazer','restaurante'];
    const term=categoryWords.find(word=>lower.includes(word));
    const query=await pool.query(`SELECT COALESCE(SUM(ABS(amount)),0)::float AS total,COUNT(*)::int AS count
      FROM transactions WHERE couple_id=$1 AND direction='expense' AND deleted_at IS NULL
      AND transaction_date >= ${period} AND (visibility='shared' OR created_by=$2)
      AND ($3::text IS NULL OR lower(category||' '||description) LIKE '%'||$3||'%')`,[couple.id,user.id,term]);
    const result=query.rows[0];
    return sendJson(res,200,{answer:result.count?`Encontrei ${result.count} lançamento(s)${term?` relacionados a ${term}`:''}, somando R$ ${Number(result.total).toFixed(2).replace('.',',')}.`:'Ainda não encontrei lançamentos nesse período. Você pode registrar um gasto pelo WhatsApp ou no painel.',total:result.total,count:result.count});
  }
  return sendJson(res,404,{error:'Rota não encontrada.'});
}

const mimeTypes = { '.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8' };
async function serveStatic(req,res,url) {
  let pathname=decodeURIComponent(url.pathname);
  if(pathname==='/'||pathname==='/index.html') pathname='/index.html';
  const file=path.resolve(ROOT,`.${pathname}`);
  if(!file.startsWith(ROOT+path.sep)) return sendJson(res,403,{error:'Acesso negado.'});
  try {
    const stat=await fs.stat(file);
    if(!stat.isFile()) return sendJson(res,404,{error:'Arquivo não encontrado.'});
    const content=await fs.readFile(file);
    res.writeHead(200,{'content-type':mimeTypes[path.extname(file)]||'application/octet-stream','content-length':content.length,'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY','cache-control':path.extname(file)==='.html'?'no-store':'public, max-age=3600'});
    res.end(content);
  } catch { return sendJson(res,404,{error:'Arquivo não encontrado.'}); }
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',ORIGIN);
  try {
    if(url.pathname.startsWith('/api/')) {
      const handled=await api(req,res,url);
      if(handled!==false) return;
    }
    if(req.method==='GET'||req.method==='HEAD') return serveStatic(req,res,url);
    return sendJson(res,405,{error:'Método não permitido.'});
  } catch(error) {
    const status=error.status||500;
    if(status>=500) console.error('Erro da aplicação:',error);
    if(!res.headersSent) sendJson(res,status,{error:status>=500?'Ocorreu um erro. Tente novamente.':error.message,code:error.code});
    else res.end();
  }
});

if(pool) {
  try {
    await pool.query(await fs.readFile(path.join(ROOT,'schema.sql'),'utf8'));
    console.log('Banco PostgreSQL conectado e estrutura verificada.');
  } catch(error) {
    console.error('Não foi possível inicializar o PostgreSQL:',error.message);
  }
} else console.warn('DATABASE_URL não configurada; a apresentação continua disponível, mas o cadastro e as gravações ficam desativados.');

server.listen(PORT,()=>console.log(`Entre Nós disponível em ${ORIGIN}`));

for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{server.close();await pool?.end();process.exit(0);});
