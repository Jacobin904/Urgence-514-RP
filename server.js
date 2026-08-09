const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const app = express();

// ========== CONFIGURATION ==========
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GUILD_ID = '1475659636819493089';
const REQUIRED_ROLE_ID = '1475659637289127937';
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_secret_key';

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// CORS pour GitHub Pages
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://jacobin904.github.io');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const DATA_FILE = path.join(__dirname, 'applications.json');

async function loadApplications(){
  try{
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  }catch{
    return [];
  }
}

async function saveApplications(apps){
  await fs.writeFile(DATA_FILE, JSON.stringify(apps, null, 2));
}

// ========== OAUTH2 DISCORD ==========
app.get('/auth/discord', (req, res) => {
  const redirect = req.query.redirect === 'admin' ? 'admin' : 'recrutement';
  req.session.redirect = redirect;
  
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds guilds.members.read'
  });
  
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if(!code) return res.redirect('https://jacobin904.github.io/Urgence-514-RP/');

  try{
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI
      })
    });
    
    const tokenData = await tokenRes.json();
    
    if(!tokenData.access_token){
      return res.redirect('https://jacobin904.github.io/Urgence-514-RP/?error=oauth_failed');
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: {Authorization: `Bearer ${tokenData.access_token}`}
    });
    const user = await userRes.json();

    const guildRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
      headers: {Authorization: `Bearer ${tokenData.access_token}`}
    });

    let hasRole = false;
    if(guildRes.ok){
      const member = await guildRes.json();
      hasRole = member.roles && member.roles.includes(REQUIRED_ROLE_ID);
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator || '0',
      avatar: user.avatar,
      hasRole: hasRole
    };

    if(req.session.redirect === 'admin'){
      if(!hasRole){
        return res.send(`
          <html>
            <head><meta charset="UTF-8"><title>Accès refusé</title>
            <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#050D1F;color:#fff}
            .box{text-align:center;padding:40px;background:#0A1B3D;border-radius:12px;max-width:500px}
            a{color:#0B4EB0;background:#E8F2FF;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:20px}</style></head>
            <body><div class="box">
              <h1>Accès refusé</h1>
              <p>Tu n'as pas le rôle requis pour accéder au panel admin.</p>
              <a href="https://jacobin904.github.io/Urgence-514-RP/">Retour au site</a>
            </div></body>
          </html>
        `);
      }
      res.redirect('https://jacobin904.github.io/Urgence-514-RP/Admin/');
    }else{
      const redirectData = encodeURIComponent(JSON.stringify({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator || '0'
      }));
      res.redirect(`https://jacobin904.github.io/Urgence-514-RP/Recrutement/?discord=${redirectData}`);
    }
  }catch(e){
    console.error('OAuth callback error:', e);
    res.redirect('https://jacobin904.github.io/Urgence-514-RP/?error=oauth_error');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('https://jacobin904.github.io/Urgence-514-RP/');
});

// ========== API ==========
app.get('/api/auth/check', (req, res) => {
  if(req.session.user && req.session.user.hasRole){
    res.json({authorized: true, user: req.session.user});
  }else{
    res.json({authorized: false});
  }
});

app.post('/api/applications', async (req, res) => {
  try{
    const apps = await loadApplications();
    const newApp = {
      ...req.body,
      status: 'pending',
      avatarHash: req.session.user?.avatar || null,
      submittedAt: new Date().toISOString()
    };
    apps.push(newApp);
    await saveApplications(apps);
    res.json({success: true, message: 'Candidature soumise'});
  }catch(e){
    console.error('Submit error:', e);
    res.status(500).json({error: 'Erreur'});
  }
});

app.get('/api/applications', async (req, res) => {
  if(!req.session.user || !req.session.user.hasRole){
    return res.status(403).json({error: 'Non autorisé'});
  }
  const apps = await loadApplications();
  res.json(apps);
});

app.post('/api/applications/:discordId/:action', async (req, res) => {
  if(!req.session.user || !req.session.user.hasRole){
    return res.status(403).json({error: 'Non autorisé'});
  }

  const {discordId, action} = req.params;
  
  if(!['approve', 'reject'].includes(action)){
    return res.status(400).json({error: 'Action invalide'});
  }

  try{
    const apps = await loadApplications();
    const appIndex = apps.findIndex(a => a.discordId === discordId && a.status === 'pending');
    
    if(appIndex === -1){
      return res.status(404).json({error: 'Candidature non trouvée'});
    }

    apps[appIndex].status = action === 'approve' ? 'approved' : 'rejected';
    apps[appIndex].reviewedAt = new Date().toISOString();
    apps[appIndex].reviewedBy = req.session.user.username;
    await saveApplications(apps);

    const app = apps[appIndex];
    const embed = {
      title: action === 'approve' ? '✅ Candidature Approuvée' : '❌ Candidature Refusée',
      color: action === 'approve' ? 3066993 : 15158332,
      fields: [
        {name: 'Candidat', value: `<@${app.discordId}> (${app.discordUsername})`, inline: true},
        {name: 'Âge', value: app.age + ' ans', inline: true},
        {name: 'Fuseau horaire', value: app.timezone, inline: true},
        {name: 'Disponibilités', value: app.availability || 'Non spécifié'},
        {name: 'Motivations', value: (app.motivation || 'Non spécifié').substring(0, 1024)},
      ],
      footer: {text: `Traité par ${req.session.user.username}`},
      timestamp: new Date().toISOString()
    };

    if(app.experience){
      embed.fields.push({name: 'Expérience', value: app.experience.substring(0, 1024)});
    }

    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({embeds: [embed]})
    });

    res.json({success: true, message: `Candidature ${action === 'approve' ? 'approuvée' : 'refusée'}`});
  }catch(e){
    console.error('Review error:', e);
    res.status(500).json({error: 'Erreur'});
  }
});

app.get('/', (req, res) => {
  res.send('API Urgence 514 RP - Backend actif');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
});
