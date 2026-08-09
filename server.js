const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// ===== CONFIG =====
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = '1475659636819493089';
const REQUIRED_ROLE_ID = '1475659637289127937';
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SECRET = process.env.SESSION_SECRET || 'dev_secret';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'jacobin904/Urgence-514-RP';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SITE = 'https://jacobin904.github.io/Urgence-514-RP';

const QUESTIONS = [
  {id:'q1', label:'1. Découverte du serveur'},
  {id:'q2', label:'2. Ancienneté et interactions'},
  {id:'q3', label:'3. Plateforme'},
  {id:'q4', label:'4. Insultes en vocale'},
  {id:'q5', label:'5. Réponse à un ticket'},
  {id:'q6', label:'6. Requests ER:LC'},
  {id:'q7', label:'7. Réunions staff'},
  {id:'q8', label:'8. 1h de modération/semaine'},
  {id:'q9', label:'9. Expérience Melonly/ER:LC'},
  {id:'q10', label:'10. RDM — procédure et sanction'},
  {id:'q11', label:'11. Manque de respect staff'},
  {id:'q12', label:'12. Cinq commandes'},
  {id:'q13', label:'13. Combat logging'}
];

// CORS (autorise seulement ton site GitHub Pages)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://jacobin904.github.io');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== STOCKAGE GITHUB (même repo, branche backend) =====
const DATA_FILE = path.join(__dirname, 'applications.json');

async function githubRead(){
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/applications.json?ref=${GITHUB_BRANCH}`, {
    headers: {Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'urgence-514-backend'}
  });
  if (r.status === 404) return {list: [], sha: null};
  const d = await r.json();
  return {
    list: JSON.parse(Buffer.from(d.content, 'base64').toString('utf8') || '[]'),
    sha: d.sha
  };
}
async function loadApplications(){
  if (GITHUB_TOKEN){ const {list} = await githubRead(); return list; }
  try{ return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); }catch{ return []; }
}
async function saveApplications(list){
  if (GITHUB_TOKEN){
    const {sha} = await githubRead();
    const body = {
      message: 'update applications',
      content: Buffer.from(JSON.stringify(list, null, 2)).toString('base64'),
      branch: GITHUB_BRANCH
    };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/applications.json`, {
      method: 'PUT',
      headers: {Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'urgence-514-backend', 'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('GitHub save failed: ' + r.status);
    return;
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

// ===== DISCORD =====
async function getMember(accessToken){
  const r = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
    headers: {Authorization: `Bearer ${accessToken}`}
  });
  if (!r.ok) return null;
  return r.json();
}

app.get('/auth/discord', (req, res) => {
  const state = req.query.redirect === 'admin' ? 'admin' : 'recrutement';
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const {code, state} = req.query;
  if (!code) return res.redirect(SITE);
  try{
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI
      })
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) return res.redirect(SITE);

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: {Authorization: `Bearer ${tok.access_token}`}
    });
    const user = await userRes.json();

    const member = await getMember(tok.access_token);
    const hasRole = !!(member && member.roles && member.roles.includes(REQUIRED_ROLE_ID));

    const token = signToken({
      id: user.id, username: user.username, avatar: user.avatar || null,
      hasRole, accessToken: tok.access_token,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    if (state === 'admin'){
      if (!hasRole){
        return res.send('<html><body style="font-family:sans-serif;background:#050D1F;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="text-align:center;background:#0A1B3D;padding:40px;border-radius:12px"><h1>Accès refusé</h1><p>Tu n\'as pas le rôle requis.</p><a style="color:#7CC0FF" href="' + SITE + '">Retour au site</a></div></body></html>');
      }
      return res.redirect(`${SITE}/Admin/?token=${token}`);
    }
    return res.redirect(`${SITE}/Recrutement/?token=${token}`);
  }catch(e){
    console.error(e);
    return res.redirect(SITE);
  }
});

// ===== API =====
app.get('/api/auth/me', async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({authorized: false});
  const member = await getMember(user.accessToken);
  const hasRole = !!(member && member.roles && member.roles.includes(REQUIRED_ROLE_ID));
  res.json({authorized: hasRole, user: {id: user.id, username: user.username, avatar: user.avatar, hasRole}});
});

app.post('/api/applications', async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({error: 'Connexion Discord requise'});
  const apps = await loadApplications();
  apps.push({
    ...req.body,
    discordId: user.id,
    discordUsername: user.username,
    avatarHash: user.avatar,
    status: 'pending',
    submittedAt: new Date().toISOString()
  });
  await saveApplications(apps);

  if (WEBHOOK_URL){
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({embeds: [{
        title: '📨 Nouvelle candidature staff',
        color: 5793266,
        description: `<@${user.id}> (${user.username}) vient de soumettre une candidature.`,
        fields: [{name: 'Plateforme', value: String(req.body.q3 || '-'), inline: true}],
        timestamp: new Date().toISOString()
      }]})
    });
  }
  res.json({success: true});
});

async function requireAdmin(req, res, next){
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({error: 'Non autorisé'});
  const member = await getMember(user.accessToken);
  if (!member || !member.roles || !member.roles.includes(REQUIRED_ROLE_ID)){
    return res.status(403).json({error: 'Rôle requis manquant'});
  }
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

  const fields = [
    {name: 'Candidat', value: `<@${app.discordId}> (${app.discordUsername})`, inline: true},
    {name: 'Plateforme', value: String(app.q3 || '-'), inline: true},
    {name: 'Décision', value: action === 'approve' ? 'Approuvée' : 'Refusée', inline: true}
  ];
  QUESTIONS.forEach(q => {
    fields.push({name: q.label, value: String(app[q.id] || '-').substring(0, 300)});
  });

  const embed = {
    title: action === 'approve' ? '✅ Candidature approuvée' : '❌ Candidature refusée',
    color: action === 'approve' ? 3066993 : 15158332,
    fields,
    footer: {text: `Traité par ${req.user.username}`},
    timestamp: new Date().toISOString()
  };

  if (WEBHOOK_URL){
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({embeds: [embed]})
    });
  }
  res.json({success: true});
});

app.get('/', (req, res) => res.send('API Urgence 514 RP active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur démarré sur le port ' + PORT));
