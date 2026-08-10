const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// On importe le client Discord du fichier bot.js
const botClient = require('./bot.js');

const app = express();
app.use(express.json());

// ===== CONFIG =====
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = process.env.GUILD_ID || '1475659636819493089';
const REQUIRED_ROLE_ID = process.env.REQUIRED_ROLE_ID || '1475659637289127937';

// NOUVEAUX SALONS DISCORD (Plus de webhooks)
const NEW_APP_CHANNEL_ID = '1521586593943785552';
const RESULT_APP_CHANNEL_ID = '1475659638618980515';

const SECRET = process.env.SESSION_SECRET || 'dev_secret';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'jacobin904/Urgence-514-RP';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SITE = 'https://jacobin904.github.io/Urgence-514-RP';

const SUPER_ADMINS = ['1281784488854159421']; // Jacobin

const QUESTIONS = [
  {id:'q1', label:'1. Découverte du serveur'}, {id:'q2', label:'2. Ancienneté et interactions'},
  {id:'q3', label:'3. Plateforme'}, {id:'q4', label:'4. Insultes en vocale'},
  {id:'q5', label:'5. Réponse à un ticket'}, {id:'q6', label:'6. Requests ER:LC'},
  {id:'q7', label:'7. Réunions staff'}, {id:'q8', label:'8. 1h de modération/semaine'},
  {id:'q9', label:'9. Expérience Melonly/ER:LC'}, {id:'q10', label:'10. RDM — procédure et sanction'},
  {id:'q11', label:'11. Manque de respect staff'}, {id:'q12', label:'12. Cinq commandes'},
  {id:'q13', label:'13. Combat logging'}
];

// ===== CORS =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://jacobin904.github.io');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== BASE DE DONNÉES (GitHub) =====
const DATA_FILE = path.join(__dirname, 'applications.json');

async function githubRead(){
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/applications.json?ref=${GITHUB_BRANCH}`, {
    headers: {Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'urgence-514-backend'}
  });
  if (r.status === 404) return {list: [], sha: null};
  const d = await r.json();
  return { list: JSON.parse(Buffer.from(d.content, 'base64').toString('utf8') || '[]'), sha: d.sha };
}
async function loadApplications(){
  if (GITHUB_TOKEN){ const {list} = await githubRead(); return list; }
  try{ return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); }catch{ return []; }
}
async function saveApplications(list){
  if (GITHUB_TOKEN){
    for (let attempt = 0; attempt < 3; attempt++){
      const {sha} = await githubRead();
      const body = { message: 'update applications', content: Buffer.from(JSON.stringify(list, null, 2)).toString('base64'), branch: GITHUB_BRANCH };
      if (sha) body.sha = sha;
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/applications.json`, {
        method: 'PUT', headers: {Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'urgence-514-backend', 'Content-Type': 'application/json'}, body: JSON.stringify(body)
      });
      if (r.ok) return;
      if (r.status === 409 || r.status === 422) continue;
      throw new Error('GitHub save failed: ' + r.status);
    }
    throw new Error('GitHub save conflict');
  }
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2));
}

// ===== TOKENS SIGNÉS =====
function signToken(payload){
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}
function verifyToken(token){
  try{
    const [data, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  }catch(e){ return null; }
}
function getUserFromReq(req){
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return verifyToken(h.slice(7));
}

// ===== VÉRIFICATION RÔLES =====
async function memberHasRole(userId){
  try{
    const r = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
      headers: {Authorization: `Bot ${process.env.BOT_TOKEN}`}
    });
    if (!r.ok) return false;
    const m = await r.json();
    return (m.roles || []).includes(REQUIRED_ROLE_ID);
  }catch{ return false; }
}
function isSuperAdmin(userId){ return SUPER_ADMINS.includes(userId); }
async function hasAdminAccess(userId){
  if (isSuperAdmin(userId)) return true;
  return memberHasRole(userId);
}

// ===== OAUTH2 =====
app.get('/auth/discord', (req, res) => {
  const state = req.query.redirect === 'admin' ? 'admin' : 'recrutement';
  const params = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, redirect_uri: DISCORD_REDIRECT_URI, response_type: 'code', scope: 'identify', state });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const {code, state} = req.query;
  if (!code) return res.redirect(SITE);
  try{
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT_URI })
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) return res.redirect(SITE);

    const userRes = await fetch('https://discord.com/api/users/@me', { headers: {Authorization: `Bearer ${tok.access_token}`} });
    const user = await userRes.json();
    const hasRole = await hasAdminAccess(user.id);

    const token = signToken({ id: user.id, username: user.username, avatar: user.avatar || null, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    if (state === 'admin'){
      if (!hasRole) return res.send('<html><body style="font-family:sans-serif;background:#0A1628;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="text-align:center;background:#0F1F38;padding:40px;border-radius:16px;border:1px solid rgba(255,255,255,.1)"><h1>Accès refusé</h1><p>Tu n\'as pas le rôle requis.</p><a style="color:#6EA8FF" href="' + SITE + '">Retour au site</a></div></body></html>');
      return res.redirect(`${SITE}/Admin/?token=${token}`);
    }
    return res.redirect(`${SITE}/Recrutement/?token=${token}`);
  }catch(e){
    console.error(e);
    return res.redirect(SITE);
  }
});

// ===== API ROUTES =====
app.get('/api/auth/me', async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({authorized: false});
  const authorized = await hasAdminAccess(user.id);
  res.json({authorized, user: {id: user.id, username: user.username, avatar: user.avatar, hasRole: authorized}});
});

app.post('/api/applications', async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({error: 'Connexion Discord requise'});
  const apps = await loadApplications();
  apps.push({ ...req.body, discordId: user.id, discordUsername: user.username, avatarHash: user.avatar, status: 'pending', submittedAt: new Date().toISOString() });
  await saveApplications(apps);

  // ENVOI PAR LE BOT (Plus de webhook)
  const channel = botClient.channels.cache.get(NEW_APP_CHANNEL_ID);
  if (channel) {
    await channel.send({ embeds: [{
      title: '📨 Nouvelle candidature staff',
      color: 5793266,
      description: `<@${user.id}> (${user.username}) vient de soumettre une candidature.`,
      footer: { text: 'Réponses consultables uniquement dans le panel admin' },
      timestamp: new Date().toISOString()
    }] }).catch(console.error);
  }
  res.json({success: true});
});

async function requireAdmin(req, res, next){
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({error: 'Non autorisé'});
  if (!(await hasAdminAccess(user.id))) return res.status(403).json({error: 'Rôle requis manquant'});
  req.user = user;
  next();
}

app.get('/api/applications', requireAdmin, async (req, res) => {
  res.json(await loadApplications());
});

app.post('/api/applications/:discordId/:action', requireAdmin, async (req, res) => {
  const {discordId, action} = req.params;
  if (!['approve','reject'].includes(action)) return res.status(400).json({error: 'Action invalide'});
  const apps = await loadApplications();
  const app = apps.find(a => a.discordId === discordId && a.status === 'pending');
  if (!app) return res.status(404).json({error: 'Candidature non trouvée'});

  app.status = action === 'approve' ? 'approved' : 'rejected';
  app.reviewedAt = new Date().toISOString();
  app.reviewedBy = req.user.username;
  await saveApplications(apps);

  // ENVOI DU RÉSULTAT PAR LE BOT (Plus de webhook)
  const channel = botClient.channels.cache.get(RESULT_APP_CHANNEL_ID);
  if (channel) {
    await channel.send({ embeds: [{
      title: action === 'approve' ? '✅ Candidature approuvée' : '❌ Candidature refusée',
      color: action === 'approve' ? 3066993 : 15158332,
      description: `**Candidat :** <@${app.discordId}> (${app.discordUsername})`,
      fields: [
        { name: 'Décision', value: action === 'approve' ? 'Approuvée' : 'Refusée', inline: true },
        { name: 'Traité par', value: req.user.username, inline: true }
      ],
      footer: { text: 'Les réponses détaillées restent privées au panel admin' },
      timestamp: new Date().toISOString()
    }] }).catch(console.error);
  }
  res.json({success: true});
});

app.get('/', (req, res) => res.send('API Urgence 514 RP active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('✅ Serveur API démarré sur le port ' + PORT));
