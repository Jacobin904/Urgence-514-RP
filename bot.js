const { 
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, 
  SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, 
  ActivityType, REST, Routes 
} = require('discord.js');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID || '1475659636819493089';
const REQUIRED_ROLE_ID = process.env.REQUIRED_ROLE_ID || '1475659637289127937';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'jacobin904/Urgence-514-RP';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SUPER_ADMINS = ['1281784488854159421'];
const COLOR = 0x0B5BD7;
const LOGO = 'https://cdn.discordapp.com/icons/1475659636819493089/8a80480870b623a2afc4d2d5cc14bfbf.webp?size=1024';

// Intents complets pour tout analyser et modérer
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences
  ] 
});

const giveaways = new Map();
const spamMap = new Map(); // Pour l'auto-modération

// ===== ANTI-CRASH & KEEP ALIVE =====
process.on('unhandledRejection', error => console.error('Promesse rejetée:', error));
process.on('uncaughtException', error => console.error('Erreur non capturée:', error));

if (process.env.RENDER_EXTERNAL_URL) {
  console.log('🔄 Keep-Alive activé pour maintenir le bot en ligne sur Render.');
  setInterval(() => { fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {}); }, 10 * 60 * 1000);
}

const isSuperAdmin = id => SUPER_ADMINS.includes(id);
const isStaff = i => isSuperAdmin(i.user.id) || i.member?.permissions?.has(PermissionFlagsBits.KickMembers) || i.member?.roles?.cache?.has(REQUIRED_ROLE_ID);

function baseEmbed() { 
  return new EmbedBuilder().setColor(COLOR).setFooter({ text: 'Urgence 514 RP • Développé par Jacobin904', iconURL: LOGO }).setTimestamp(); 
}

function parseDuration(str) {
  const m = String(str).match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;
  return parseInt(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
}

// ===== SYSTÈME DE LOGS AUTOMATIQUE =====
client.on('messageDelete', async (message) => {
  if (message.author?.bot || !message.guild || message.guild.id !== GUILD_ID) return;
  // Tu peux configurer un salon de logs spécifique ici, ex: 'ID_DU_SALON_LOGS'
  // Pour l'instant, on loggue en console ou on pourrait l'envoyer dans un salon dédié
  console.log(`[LOG] Message supprimé de ${message.author.tag} dans #${message.channel.name}: ${message.content.substring(0, 50)}...`);
});

client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== GUILD_ID) return;
  console.log(`[LOG] Nouveau membre : ${member.user.tag} (${member.id})`);
  // Optionnel : envoyer un message de bienvenue dans un salon spécifique
});

client.on('guildMemberRemove', async (member) => {
  if (member.guild.id !== GUILD_ID) return;
  console.log(`[LOG] Membre parti : ${member.user.tag} (${member.id})`);
});

// ===== AUTO-MODÉRATION (Anti-Spam basique) =====
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || message.guild.id !== GUILD_ID) return;
  if (isStaff(message)) return; // Le staff est immunisé

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const userSpam = spamMap.get(key) || [];
  
  // Garder seulement les messages des 5 dernières secondes
  const recentMessages = userSpam.filter(timestamp => now - timestamp < 5000);
  recentMessages.push(now);
  spamMap.set(key, recentMessages);

  if (recentMessages.length >= 4) { // 4 messages en 5 secondes
    spamMap.delete(key); // Reset pour éviter les boucles
    try {
      await message.delete().catch(() => {});
      await message.author.send('⚠️ Tu as été limité pour spam. Ralentis un peu !').catch(() => {});
      console.log(`[AUTO-MOD] Spam détecté de la part de ${message.author.tag}`);
    } catch (e) {}
  }
});

// ===== COMMANDES AVANCÉES =====
const commands = new Map();
function addCmd(builder, run) { commands.set(builder.name, { builder, run }); }

// ... (Garde toutes les commandes publiques et modération du précédent bot.js ici) ...
// Pour ne pas dépasser la limite de caractères, je résume l'ajout de la commande clé :

addCmd(
  new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Analyse complète et en temps réel du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async (i) => {
    await i.deferReply();
    const guild = i.guild;
    await guild.members.fetch(); // Force le cache des membres pour des stats précises
    
    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
    const botMembers = guild.members.cache.filter(m => m.user.bot).size;
    const humanMembers = totalMembers - botMembers;
    const boostLevel = guild.premiumTier;
    const boosts = guild.premiumSubscriptionCount || 0;

    const embed = baseEmbed()
      .setTitle(`📊 Analyse Complète : ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: '👥 Membres Totaux', value: `${totalMembers}`, inline: true },
        { name: '🟢 En Ligne', value: `${onlineMembers}`, inline: true },
        { name: '🤖 Bots', value: `${botMembers}`, inline: true },
        { name: '👤 Humains', value: `${humanMembers}`, inline: true },
        { name: '💎 Niveau de Boost', value: `Niveau ${boostLevel} (${boosts} boosts)`, inline: true },
        { name: '📁 Salons', value: `${guild.channels.cache.size}`, inline: true },
        { name: '🎭 Rôles', value: `${guild.roles.cache.size}`, inline: true },
        { name: '📅 Création', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
      );
      
    i.editReply({ embeds: [embed] });
  }
);

// ... (Ajoute ici le reste de tes commandes : help, info, warn, ban, etc. comme dans la version précédente) ...

// ===== INTERACTIONS & DÉMARRAGE =====
client.on('interactionCreate', async i => {
  if (i.isButton()) {
    // ... (gestion des boutons giveaway et roles comme avant) ...
    return;
  }
  if (!i.isCommand()) return; 
  const cmd = commands.get(i.commandName); 
  if (!cmd) return;
  try { await cmd.run(i); } 
  catch (e) { 
    console.error(e); 
    if (!i.replied && !i.deferred) await i.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {}); 
  }
});

client.once('clientReady', async () => {
  console.log('✅ Bot en ligne : ' + client.user.tag);
  client.user.setPresence({ status: 'online', activities: [{ name: 'urgrp • ER:LC', type: ActivityType.Watching }] });
  
  try {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    const cmdsJSON = [...commands.values()].map(c => c.builder.toJSON());
    console.log('📤 Enregistrement des commandes sur Discord...');
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: cmdsJSON });
    console.log(`✅ ${commands.size} commandes enregistrées avec succès.`);
  } catch (e) { 
    console.error('❌ Erreur commandes:', e.message);
  }
});

if (BOT_TOKEN) {
  client.login(BOT_TOKEN).catch(e => console.error('❌ Erreur de connexion du bot:', e.message));
}

module.exports = client;
