/**
 * ============================================================
 * URGENCE 514 RP - API BACKEND
 * ============================================================
 * Version: 4.0.0 (avec Database Module)
 * ============================================================
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const Database = require('./database.js');
const botClient = require('./bot.js');

const app = express();
app.use(express.json());

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  DISCORD: {
    CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    REDIRECT_URI: process.env.DISCORD_REDIRECT_URI
  },
  GUILD_ID: process.env.GUILD_ID || '1475659636819493089',
  REQUIRED_ROLE_ID: process.env.REQUIRED_ROLE_ID || '1475659637289127937',
  APPROVED_ROLE_ID: '1475659637255831601',
  CHANNELS: {
    NEW_APPLICATION: '1521586593943785552',
    RESULTS: '1475659638618980515'
  },
  SECRET: process.env.SESSION_SECRET || 'dev_secret_change_me',
  GITHUB: {
    TOKEN: process.env.GITHUB_TOKEN || '',
    REPO: process.env.GITHUB_REPO || 'jacobin904/Urgence-514-RP',
    BRANCH: process.env.GITHUB_BRANCH || 'main'
  },
  SITE: 'https://jacobin904.github.io/Urgence-514-RP',
  SUPER_ADMINS: ['1281784488854159421']
};

// ============================================================
// INITIALISATION DE LA BASE DE DONNÉES
// ============================================================
const db = new Database({
  githubToken: CONFIG.GITHUB.TOKEN,
  githubRepo: CONFIG.GITHUB.REPO,
  githubBranch: CONFIG.GITHUB.BRANCH
});

// ============================================================
// CORS
// ============================================================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://jacobin904.github.io');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ============================================================
// UTILITAIRES
// ============================================================
function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', CONFIG.SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  try {
    const [data, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', CONFIG.SECRET).update(data).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

function getUserFromReq(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return verifyToken(h.slice(7));
}

async function memberHasRole(userId) {
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${CONFIG.GUILD_ID}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
    });
    if (!r.ok) return false;
    const m = await r.json();
    return (m.roles || []).includes(CONFIG.REQUIRED_ROLE_ID);
  } catch { return false; }
}

function isSuperAdmin(userId) { return CONFIG.SUPER_ADMINS.includes(userId); }

async function hasAdminAccess(userId) {
  if (isSuperAdmin(userId)) return true;
  return memberHasRole(userId);
}

// ============================================================
// API : STATISTIQUES EN TEMPS RÉEL
// ============================================================
app.get('/api/stats', async (req, res) => {
  try {
    const guild = botClient.guilds.cache.get(CONFIG.GUILD_ID);
    if (!guild) return res.status(404).json({ error: 'Serveur non trouvé' });
    
    let onlineMembers = 0;
    try {
      onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
    } catch (e) { onlineMembers = guild.memberCount; }
    
    res.json({
      totalMembers: guild.memberCount,
      onlineMembers,
      channels: guild.channels.cache.size,
      roles: guild.roles.cache.size,
      botOnline: botClient.isReady(),
      database: db.getStats()
    });
  } catch (e) {
    console.error('[API] Erreur stats:', e);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ============================================================
// OAUTH2 DISCORD
// ============================================================
app.get('/auth/discord', (req, res) => {
  const state = req.query.redirect === 'admin' ? 'admin' : 'recrutement';
  const params = new URLSearchParams({
    client_id: CONFIG.DISCORD.CLIENT_ID,
    redirect_uri: CONFIG.DISCORD.REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(CONFIG.SITE);
  
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CONFIG.DISCORD.CLIENT_ID,
        client_secret: CONFIG.DISCORD.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: CONFIG.DISCORD.REDIRECT_URI
      })
    });
    
    const tok = await tokenRes.json();
    if (!tok.access_token) return res.redirect(CONFIG.SITE);
    
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    const user = await userRes.json();
    
    const hasRole = await hasAdminAccess(user.id);
    const token = signToken({
      id: user.id,
      username: user.username,
      avatar: user.avatar || null,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    
    if (state === 'admin') {
      if (!hasRole) {
        return res.send(`
          <html>
            <body style="font-family:sans-serif;background:#0A1628;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh">
              <div style="text-align:center;background:#0F1F38;padding:40px;border-radius:16px;border:1px solid rgba(255,255,255,.1)">
                <h1>Accès refusé</h1>
                <p>Tu n'as pas le rôle requis.</p>
                <a style="color:#6EA8FF" href="${CONFIG.SITE}">Retour au site</a>
              </div>
            </body>
          </html>
        `);
      }
      return res.redirect(`${CONFIG.SITE}/Admin/?token=${token}`);
    }
    
    return res.redirect(`${CONFIG.SITE}/Recrutement/?token=${token}`);
  } catch (e) {
    console.error('[AUTH] Erreur callback:', e);
    return res.redirect(CONFIG.SITE);
  }
});

// ============================================================
// API : AUTHENTIFICATION
// ============================================================
app.get('/api/auth/me', async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ authorized: false });
  
  const authorized = await hasAdminAccess(user.id);
  res.json({
    authorized,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      hasRole: authorized
    }
  });
});

// ============================================================
// API : CANDIDATURES
// ============================================================

// Soumettre une candidature
app.post('/api/applications', async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Connexion Discord requise' });
  
  try {
    const application = {
      ...req.body,
      discordId: user.id,
      discordUsername: user.username,
      avatarHash: user.avatar
    };
    
    await db.addApplication(application);
    
    // Notification Discord
    const channel = botClient.channels.cache.get(CONFIG.CHANNELS.NEW_APPLICATION);
    if (channel) {
      await channel.send({
        embeds: [{
          title: '📨 Nouvelle candidature staff',
          color: 5793266,
          description: `<@${user.id}> (${user.username}) vient de soumettre une candidature.`,
          footer: { text: 'Réponses consultables uniquement dans le panel admin' },
          timestamp: new Date().toISOString()
        }]
      }).catch(console.error);
    }
    
    res.json({ success: true, id: application.id });
  } catch (error) {
    console.error('[API] Erreur soumission:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission' });
  }
});

// Middleware admin
async function requireAdmin(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Non autorisé' });
  if (!(await hasAdminAccess(user.id))) return res.status(403).json({ error: 'Rôle requis manquant' });
  req.user = user;
  next();
}

// Lister toutes les candidatures
app.get('/api/applications', requireAdmin, async (req, res) => {
  try {
    const applications = db.getAllApplications();
    res.json(applications);
  } catch (error) {
    console.error('[API] Erreur liste:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// Traiter une candidature (approuver/refuser)
app.post('/api/applications/:discordId/:action', requireAdmin, async (req, res) => {
  const { discordId, action } = req.params;
  
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action invalide' });
  }
  
  try {
    const application = db.getApplication(discordId);
    if (!application || application.status !== 'pending') {
      return res.status(404).json({ error: 'Candidature non trouvée ou déjà traitée' });
    }
    
    const customMessage = req.body.customMessage?.trim() || null;
    const DEFAULT_APPROVE = '🎉 Félicitations ! Ta candidature au poste de membre de la modération a été **approuvée**. Bienvenue dans l\'équipe d\'Urgence 514 RP ! Nous te contacterons bientôt pour la suite de ton intégration.';
    const DEFAULT_REJECT = 'Merci pour ta candidature au poste de membre de la modération. Malheureusement, elle n\'a **pas été retenue** cette fois-ci. Nous t\'invitons à repostuler dans quelques semaines après avoir gagné en expérience sur le serveur.';
    const finalMessage = customMessage || (action === 'approve' ? DEFAULT_APPROVE : DEFAULT_REJECT);
    
    // Mettre à jour la candidature
    await db.updateApplication(discordId, {
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.user.username,
      customMessage
    });
    
    // Donner le rôle si approuvé
    if (action === 'approve') {
      try {
        const guild = botClient.guilds.cache.get(CONFIG.GUILD_ID);
        if (guild) {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (member) {
            await member.roles.add(CONFIG.APPROVED_ROLE_ID);
            console.log(`[API] ✓ Rôle ajouté à ${application.discordUsername}`);
          }
        }
      } catch (e) {
        console.error('[API] Erreur ajout rôle:', e.message);
      }
    }
    
    // Envoyer un MP au candidat
    try {
      const user = await botClient.users.fetch(discordId).catch(() => null);
      if (user) {
        const { EmbedBuilder } = require('discord.js');
        await user.send({
          embeds: [new EmbedBuilder()
            .setColor(action === 'approve' ? 0x3BA55C : 0xED4245)
            .setTitle(action === 'approve' ? '✅ Candidature approuvée' : '❌ Candidature refusée')
            .setDescription(finalMessage)
            .setFooter({ text: 'Urgence 514 RP' })
            .setTimestamp()
          ]
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[API] Erreur envoi MP:', e.message);
    }
    
    // Notification dans le salon des résultats
    const channel = botClient.channels.cache.get(CONFIG.CHANNELS.RESULTS);
    if (channel) {
      const { EmbedBuilder } = require('discord.js');
      const resultEmbed = new EmbedBuilder()
        .setColor(action === 'approve' ? 0x3BA55C : 0xED4245)
        .setTitle(action === 'approve' ? '✅ Candidature approuvée' : '❌ Candidature refusée')
        .setDescription(`**Candidat :** <@${application.discordId}> (${application.discordUsername})`)
        .addFields({ name: 'Décision', value: action === 'approve' ? 'Approuvée' : 'Refusée', inline: true });
      
      if (customMessage) {
        resultEmbed.addFields({
          name: '📝 Message envoyé au candidat',
          value: customMessage.length > 200 ? customMessage.substring(0, 200) + '...' : customMessage
        });
      }
      
      resultEmbed.setFooter({ text: 'Les réponses détaillées restent privées au panel admin' }).setTimestamp();
      
      await channel.send({
        embeds: [resultEmbed],
        allowedMentions: { users: [application.discordId] }
      }).catch(console.error);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Erreur traitement:', error);
    res.status(500).json({ error: 'Erreur lors du traitement' });
  }
});

// ============================================================
// API : WARNINGS
// ============================================================

app.get('/api/warnings/:discordId', requireAdmin, async (req, res) => {
  try {
    const warnings = db.getWarnings(req.params.discordId);
    res.json(warnings);
  } catch (error) {
    res.status(500).json({ error: 'Erreur' });
  }
});

app.post('/api/warnings', requireAdmin, async (req, res) => {
  try {
    const { discordId, reason } = req.body;
    if (!discordId || !reason) return res.status(400).json({ error: 'Paramètres manquants' });
    
    const warning = await db.addWarning(discordId, {
      reason,
      by: req.user.username
    });
    
    res.json({ success: true, warning });
  } catch (error) {
    res.status(500).json({ error: 'Erreur' });
  }
});

app.delete('/api/warnings/:discordId', requireAdmin, async (req, res) => {
  try {
    await db.clearWarnings(req.params.discordId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur' });
  }
});

// ============================================================
// DÉMARRAGE
// ============================================================
async function start() {
  // Initialiser la base de données
  await db.initialize();
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[SERVER] ✓ API démarrée sur le port ${PORT}`);
    console.log(`[SERVER] ✓ Base de données: ${db.getStats().applications.total} candidatures chargées`);
  });
}

start().catch(error => {
  console.error('[SERVER] Erreur de démarrage:', error);
  process.exit(1);
});
