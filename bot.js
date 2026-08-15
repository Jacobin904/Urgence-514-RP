/**
 * ============================================================
 * URGENCE 514 RP - BOT DISCORD PROFESSIONNEL
 * ============================================================
 * Version: 7.0.0 (Emojis d'été aléatoires + Scène Numérotée)
 * Développé par: Jacobin904
 * ============================================================
 */

'use strict';

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ActivityType,
  REST,
  Routes,
  Partials,
  ChannelType
} = require('discord.js');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = Object.freeze({
  BOT_TOKEN: process.env.BOT_TOKEN,
  GUILD_ID: process.env.GUILD_ID || '1475659636819493089',
  REQUIRED_ROLE_ID: process.env.REQUIRED_ROLE_ID || '1475659637289127937',
  SUPER_ADMINS: Object.freeze(['1281784488854159421']),
  COLORS: Object.freeze({ PRIMARY: 0x0B5BD7, SUCCESS: 0x3BA55C, DANGER: 0xED4245, WARNING: 0xFAA61A }),
  LOGO: 'https://cdn.discordapp.com/icons/1475659636819493089/8a80480870b623a2afc4d2d5cc14bfbf.webp?size=1024',
  AUTO_MOD: Object.freeze({ SPAM_WINDOW_MS: 5000, SPAM_THRESHOLD: 4, TIMEOUT_DURATION_MS: 60000 })
});

// ============================================================
// CONFIGURATION JOIN-TO-CREATE (J2C)
// ============================================================
const J2C_CONFIG = Object.freeze({
  TRIGGER_CHANNEL_ID: '1536401234922315906',
  // Liste d'emojis d'été parmi lesquels le bot choisira au hasard
  SUMMER_EMOJIS: ['🏖️', '🌊', '☀️', '🌴', '🍉', '🏄', '🚤', '🍹', '🏝️', '🐚', '🌺', '🕶️', '🏐', '🌅', '🍦', '⛱️']
});

// ============================================================
// INITIALISATION
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel]
});

const state = {
  giveaways: new Map(),
  spamTracker: new Map(),
  commands: new Map(),
  tempVoiceChannels: new Set(),
  currentSceneNumber: 1 // Compteur pour les scènes (1 à 99)
};

// ============================================================
// UTILITAIRES
// ============================================================
function createEmbed(options = {}) {
  return new EmbedBuilder()
    .setColor(options.color || CONFIG.COLORS.PRIMARY)
    .setFooter({ text: 'Urgence 514 RP - Développé par Jacobin904', iconURL: CONFIG.LOGO })
    .setTimestamp();
}

function parseDuration(str) {
  if (!str) return null;
  const match = String(str).match(/^(\d+)\s*([smhd])$/i);
  if (!match) return null;
  return parseInt(match[1], 10) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
}

function formatTimestamp(date) { return `<t:${Math.floor(date.getTime() / 1000)}:R>`; }
function isSuperAdmin(userId) { return CONFIG.SUPER_ADMINS.includes(userId); }

function isStaff(interaction) {
  return isSuperAdmin(interaction.user.id) || 
         interaction.member?.permissions?.has(PermissionFlagsBits.KickMembers) || 
         interaction.member?.roles?.cache?.has(CONFIG.REQUIRED_ROLE_ID);
}

function isMemberStaff(member) {
  return isSuperAdmin(member.id) || 
         member.permissions?.has(PermissionFlagsBits.ManageMessages) || 
         member.roles?.cache?.has(CONFIG.REQUIRED_ROLE_ID);
}

async function sendError(interaction, message) {
  if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  else if (interaction.deferred && !interaction.replied) await interaction.editReply({ content: message }).catch(() => {});
}

function log(category, message, level = 'INFO') {
  console.log(`[${new Date().toISOString()}] [${level}] [${category}] ${message}`);
}

// ============================================================
// LOGS & AUTO-MODÉRATION
// ============================================================
client.on('messageDelete', async (message) => {
  if (!message.author || message.author.bot || !message.guild || message.guild.id !== CONFIG.GUILD_ID) return;
  log('MOD', `Message supprimé | ${message.author.tag} | #${message.channel?.name || '?'}`);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!oldMessage.author || oldMessage.author.bot || !oldMessage.guild || oldMessage.guild.id !== CONFIG.GUILD_ID) return;
  if (oldMessage.content === newMessage.content) return;
  log('MOD', `Message modifié | ${oldMessage.author.tag} | #${oldMessage.channel?.name || '?'}`);
});

client.on('guildMemberAdd', async (member) => {
  if (member.guild.id === CONFIG.GUILD_ID) log('MEMBRES', `Arrivée: ${member.user.tag} (Total: ${member.guild.memberCount})`);
});

client.on('guildMemberRemove', async (member) => {
  if (member.guild.id === CONFIG.GUILD_ID) log('MEMBRES', `Départ: ${member.user.tag} (Total: ${member.guild.memberCount})`);
});

client.on('guildBanAdd', async (ban) => {
  if (ban.guild.id === CONFIG.GUILD_ID) log('MOD', `Bannissement: ${ban.user.tag}`);
});

client.on('guildBanRemove', async (ban) => {
  if (ban.guild.id === CONFIG.GUILD_ID) log('MOD', `Débannissement: ${ban.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || message.guild.id !== CONFIG.GUILD_ID || isMemberStaff(message.member)) return;

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const recent = (state.spamTracker.get(key) || []).filter(t => now - t < CONFIG.AUTO_MOD.SPAM_WINDOW_MS);
  recent.push(now);
  state.spamTracker.set(key, recent);

  if (recent.length >= CONFIG.AUTO_MOD.SPAM_THRESHOLD) {
    state.spamTracker.delete(key);
    log('AUTO-MOD', `Spam détecté: ${message.author.tag}`, 'WARN');
    try {
      await message.delete().catch(() => {});
      await message.author.send({ embeds: [createEmbed({ color: CONFIG.COLORS.DANGER }).setTitle('Auto-Modération').setDescription('Spam détecté. Merci de ralentir.')] }).catch(() => {});
      if (message.member.moderatable) {
        await message.member.timeout(CONFIG.AUTO_MOD.TIMEOUT_DURATION_MS, 'Auto-Mod: Spam');
        log('AUTO-MOD', `${message.author.tag} mis en timeout (1 min)`, 'SUCCESS');
      }
    } catch (e) { log('AUTO-MOD', `Erreur sanction: ${e.message}`, 'ERROR'); }
  }
});

// ============================================================
// SYSTÈME DE SALONS VOCAUX TEMPORAIRES (JOIN TO CREATE)
// ============================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const guild = newState.guild;

  // 1. L'utilisateur REJOINT le salon déclencheur
  if (newState.channelId === J2C_CONFIG.TRIGGER_CHANNEL_ID && oldState.channelId !== newState.channelId) {
    try {
      const triggerChannel = newState.channel;
      const category = triggerChannel.parent;
      
      // Récupérer le numéro actuel
      const sceneNum = state.currentSceneNumber;
      
      // Incrémenter pour la prochaine fois
      state.currentSceneNumber++;
      
      // Boucle : si on dépasse 99, on revient à 1
      if (state.currentSceneNumber > 99) {
        state.currentSceneNumber = 1;
      }

      // Choisir un emoji d'été aléatoire à chaque création
      const randomEmoji = J2C_CONFIG.SUMMER_EMOJIS[Math.floor(Math.random() * J2C_CONFIG.SUMMER_EMOJIS.length)];

      // Nom du salon : Emoji Scène X
      const channelName = `${randomEmoji} Scène ${sceneNum}`;

      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: category,
        permissionOverwrites: triggerChannel.permissionOverwrites.cache
      });

      await member.voice.setChannel(newChannel);
      state.tempVoiceChannels.add(newChannel.id);
      log('J2C', `Salon créé : ${channelName} par ${member.user.tag} (Prochain: ${state.currentSceneNumber})`, 'SUCCESS');
    } catch (error) {
      log('J2C', `Erreur création salon pour ${member.user.tag}: ${error.message}`, 'ERROR');
    }
  }

  // 2. L'utilisateur QUITTE un salon (vérifier si c'était un salon temporaire)
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    if (state.tempVoiceChannels.has(oldState.channelId)) {
      const oldChannel = oldState.channel;
      // Si le salon existe encore et qu'il est vide
      if (oldChannel && oldChannel.members.size === 0) {
        try {
          await oldChannel.delete();
          state.tempVoiceChannels.delete(oldState.channelId);
          log('J2C', `Salon supprimé (vide) : ${oldChannel.name} (ID: ${oldState.channelId})`, 'INFO');
        } catch (error) {
          log('J2C', `Erreur suppression salon ${oldState.channelId}: ${error.message}`, 'ERROR');
        }
      }
    }
  }
});

// ============================================================
// ENREGISTREMENT DES COMMANDES
// ============================================================
function registerCommand(builder, handler) {
  state.commands.set(builder.name, { builder, handler });
}

// ============================================================
// COMMANDES PUBLIQUES
// ============================================================
registerCommand(new SlashCommandBuilder().setName('help').setDescription('Liste des commandes'), async (i) => {
  await i.reply({ embeds: [createEmbed().setTitle('Aide').addFields(
    { name: 'Info', value: '`/help` `/info` `/code` `/ping` `/serverstats`', inline: false },
    { name: 'Règles', value: '`/regles` `/langage` `/departements` `/equipe`', inline: false },
    { name: 'Utilisateur', value: '`/avatar` `/userinfo` `/serverinfo`', inline: false },
    { name: 'Recrutement', value: '`/recrutement`', inline: false },
    { name: 'Modération', value: '`/warn` `/kick` `/ban` `/unban` `/timeout` `/clear` `/lock` `/unlock` `/slowmode`', inline: false },
    { name: 'Admin', value: '`/roles` `/say` `/embed` `/annonce` `/giveaway`', inline: false }
  )] });
});

registerCommand(new SlashCommandBuilder().setName('info').setDescription('Infos du serveur'), async (i) => {
  await i.reply({ embeds: [createEmbed().setTitle('Urgence 514 RP').setDescription('Serveur roleplay Roblox immersif basé à Montréal.').setThumbnail(CONFIG.LOGO).addFields(
    { name: 'Code Roblox', value: '`urgrp`', inline: true }, { name: 'Fondation', value: '2026', inline: true },
    { name: 'Site web', value: '[jacobin904.github.io/Urgence-514-RP](https://jacobin904.github.io/Urgence-514-RP/)', inline: false },
    { name: 'Discord', value: '[discord.gg/ENgnZ629k6](https://discord.gg/ENgnZ629k6)', inline: true }
  )] });
});

registerCommand(new SlashCommandBuilder().setName('code').setDescription('Code Roblox'), async (i) => {
  await i.reply({ embeds: [createEmbed().setTitle('Code Roblox').setDescription('Entre ce code dans Roblox :\n\n# `urgrp`')] });
});

registerCommand(new SlashCommandBuilder().setName('ping').setDescription('Latence du bot'), async (i) => {
  const sent = await i.reply({ content: 'Calcul...', fetchReply: true });
  await i.editReply({ content: `Pong !\nBot: ${sent.createdTimestamp - i.createdTimestamp}ms\nAPI: ${Math.round(client.ws.ping)}ms` });
});

registerCommand(new SlashCommandBuilder().setName('serverstats').setDescription('Statistiques du serveur').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), async (i) => {
  await i.deferReply();
  const g = i.guild; await g.members.fetch().catch(() => {});
  await i.editReply({ embeds: [createEmbed().setTitle(`Analyse: ${g.name}`).setThumbnail(g.iconURL({size:512})).addFields(
    { name: 'Membres', value: `${g.memberCount}`, inline: true }, { name: 'En ligne', value: `${g.members.cache.filter(m => m.presence?.status !== 'offline').size}`, inline: true },
    { name: 'Bots', value: `${g.members.cache.filter(m => m.user.bot).size}`, inline: true }, { name: 'Humains', value: `${g.memberCount - g.members.cache.filter(m => m.user.bot).size}`, inline: true },
    { name: 'Boosts', value: `Niveau ${g.premiumTier} (${g.premiumSubscriptionCount || 0})`, inline: true }, { name: 'Salons', value: `${g.channels.cache.size}`, inline: true },
    { name: 'Rôles', value: `${g.roles.cache.size}`, inline: true }, { name: 'Création', value: formatTimestamp(g.createdAt), inline: false }
  )] });
});

registerCommand(new SlashCommandBuilder().setName('regles').setDescription('Règlements').addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'Discord',value:'discord'},{name:'Roblox',value:'roblox'})), async (i) => {
  const type = i.options.getString('type');
  const rules = type === 'discord' ? 
    [['Respect', 'Pas d\'insultes, harcèlement ou discrimination.'], ['Spam', 'Pas de spam ni messages inutiles.'], ['Contenu', 'Contenu inapproprié interdit.'], ['Publicité', 'Aucune pub. Sanction: ban.']] :
    [['RDM / Freekill', 'Pas de kill sans raison RP.'], ['VDM', 'Véhicule = pas une arme.'], ['NITRP', 'Reste dans ton personnage.'], ['Safe zones', 'Rien d\'illégal aux spawns, hôpital, postes.']];
  
  const embed = createEmbed().setTitle(`Règlement ${type === 'discord' ? 'Discord' : 'Roblox'}`);
  rules.forEach(([r, d]) => embed.addFields({ name: r, value: d, inline: false }));
  await i.reply({ embeds: [embed] });
});

registerCommand(new SlashCommandBuilder().setName('langage').setDescription('Dictionnaire RP').addStringOption(o => o.setName('terme').setDescription('Terme (optionnel)')), async (i) => {
  const terme = i.options.getString('terme');
  const lang = [['Je vais faire un dodo', 'Je me déconnecte.'], ['Mes cordes vocales', 'Mon micro.'], ['Radio', 'Le vocal. Discord = VPN.'], ['Muscle E / R', 'Appuie sur E / fais R.'], ['J\'ai un mal de tête', 'Je bug.'], ['Membre du gouvernement', 'Staff.'], ['Chinois / Hamburger riz poulet', 'Langage HRP.'], ['AIE', 'Douleur: attends 5 secondes.']];
  
  if (terme) {
    const found = lang.find(([t]) => t.toLowerCase().includes(terme.toLowerCase()));
    if (found) return i.reply({ embeds: [createEmbed().setTitle('Langage RP').addFields({ name: found[0], value: found[1] })] });
    return i.reply({ content: 'Terme introuvable.', ephemeral: true });
  }
  const embed = createEmbed().setTitle('Dictionnaire RP');
  lang.forEach(([t, d]) => embed.addFields({ name: t, value: d, inline: false }));
  await i.reply({ embeds: [embed] });
});

registerCommand(new SlashCommandBuilder().setName('departements').setDescription('Liste des départements'), async (i) => {
  const embed = createEmbed().setTitle('Départements').setDescription('Départements disponibles sur Urgence 514 RP:');
  [['SPVM', 'Service de police de Montréal'], ['Sûreté du Québec', 'Police provinciale'], ['Urgence Santé', 'Services paramédicaux'], ['SIM', 'Service d\'incendie de Montréal'], ['GRC', 'Gendarmerie royale du Canada']]
    .forEach(([n, d]) => embed.addFields({ name: n, value: d, inline: false }));
  await i.reply({ embeds: [embed] });
});

registerCommand(new SlashCommandBuilder().setName('equipe').setDescription('L\'équipe du serveur'), async (i) => {
  await i.reply({ embeds: [createEmbed().setTitle('Équipe').setDescription('Les membres qui portent la vision d\'Urgence 514 RP:').addFields(
    { name: 'Fondateur', value: '𝐌𝟒𝐗𝐋𝐄𝐂𝐇𝐎𝐂𝐎𝐋𝐀𝐓.𝐐𝐂 (@maxlechocolat.qc)', inline: false },
    { name: 'Fondateur Adjoint', value: 'L. K TV (@l.ktv)', inline: false },
    { name: 'Manager', value: '!Bibibopm (@bibibopm_84423)', inline: false },
    { name: 'Développeur Web', value: 'Jacobin Babouain (@jacobin904)', inline: false }
  )] });
});

registerCommand(new SlashCommandBuilder().setName('recrutement').setDescription('Infos recrutement'), async (i) => {
  await i.reply({ embeds: [createEmbed().setTitle('Recrutement Staff').setDescription('Conditions:\n- Être sur PC\n- 14 ans et +\n- 7 jours sur le serveur\n- Moins de 10 sanctions\n\nDemander des nouvelles = refus automatique.')], 
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Postuler').setStyle(ButtonStyle.Link).setURL('https://jacobin904.github.io/Urgence-514-RP/Recrutement/'))] });
});

registerCommand(new SlashCommandBuilder().setName('avatar').setDescription('Avatar d\'un utilisateur').addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur (optionnel)')), async (i) => {
  const u = i.options.getUser('utilisateur') || i.user;
  await i.reply({ embeds: [createEmbed().setTitle(`Avatar de ${u.username}`).setImage(u.displayAvatarURL({ size: 512 }))] });
});

registerCommand(new SlashCommandBuilder().setName('userinfo').setDescription('Infos utilisateur').addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur (optionnel)')), async (i) => {
  const u = i.options.getUser('utilisateur') || i.user;
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  await i.reply({ embeds: [createEmbed().setTitle(u.username).setThumbnail(u.displayAvatarURL({size:256})).addFields(
    { name: 'ID', value: u.id, inline: true }, { name: 'Bot', value: u.bot ? 'Oui' : 'Non', inline: true },
    { name: 'Compte créé', value: formatTimestamp(u.createdAt), inline: false },
    { name: 'A rejoint', value: m ? formatTimestamp(m.joinedAt) : 'Inconnu', inline: false },
    { name: 'Rôles', value: m && m.roles.cache.size > 1 ? m.roles.cache.filter(r => r.id !== i.guild.id).map(r => r.toString()).join(' ') : 'Aucun', inline: false }
  )] });
});

registerCommand(new SlashCommandBuilder().setName('serverinfo').setDescription('Infos du serveur'), async (i) => {
  const g = i.guild;
  await i.reply({ embeds: [createEmbed().setTitle(g.name).setThumbnail(g.iconURL({size:512})).addFields(
    { name: 'Membres', value: `${g.memberCount}`, inline: true }, { name: 'Salons', value: `${g.channels.cache.size}`, inline: true },
    { name: 'Rôles', value: `${g.roles.cache.size}`, inline: true }, { name: 'Créé', value: formatTimestamp(g.createdAt), inline: false }
  )] });
});

// ============================================================
// COMMANDES DE MODÉRATION
// ============================================================
registerCommand(new SlashCommandBuilder().setName('warn').setDescription('Avertit un utilisateur').addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Permission insuffisante.');
  const target = i.options.getUser('utilisateur'); const reason = i.options.getString('raison');
  await i.reply({ embeds: [createEmbed().setTitle('Avertissement').addFields({name:'Utilisateur',value:`<@${target.id}>`,inline:true},{name:'Raison',value:reason,inline:true},{name:'Par',value:i.user.username,inline:true})] });
  await target.send({ embeds: [createEmbed({color:CONFIG.COLORS.WARNING}).setTitle('Avertissement').setDescription(`Tu as reçu un avertissement.\n\nRaison: ${reason}\nPar: ${i.user.username}`)] }).catch(() => {});
});

registerCommand(new SlashCommandBuilder().setName('kick').setDescription('Expulse un utilisateur').addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)), async (i) => {
  if (!i.member.permissions.has(PermissionFlagsBits.KickMembers)) return sendError(i, 'Permission insuffisante.');
  const m = await i.guild.members.fetch(i.options.getUser('utilisateur').id).catch(() => null);
  if (!m) return sendError(i, 'Membre introuvable.');
  if (!m.kickable) return sendError(i, 'Impossible d\'expulser ce membre.');
  await m.kick(i.options.getString('raison'));
  await i.reply({ embeds: [createEmbed().setTitle('Expulsion').setDescription(`${m.user.username} a été expulsé.\nRaison: ${i.options.getString('raison')}`)] });
});

registerCommand(new SlashCommandBuilder().setName('ban').setDescription('Bannit un utilisateur').addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)), async (i) => {
  if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return sendError(i, 'Permission insuffisante.');
  const u = i.options.getUser('utilisateur');
  await i.guild.members.ban(u, { reason: i.options.getString('raison') });
  await i.reply({ embeds: [createEmbed().setTitle('Bannissement').setDescription(`${u.username} a été banni.\nRaison: ${i.options.getString('raison')}`)] });
});

registerCommand(new SlashCommandBuilder().setName('unban').setDescription('Débannit un utilisateur').addStringOption(o => o.setName('id').setDescription('ID de l\'utilisateur').setRequired(true)), async (i) => {
  if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return sendError(i, 'Permission insuffisante.');
  await i.guild.members.unban(i.options.getString('id'));
  await i.reply({ embeds: [createEmbed().setTitle('Débannissement').setDescription('L\'utilisateur a été débanni.')] });
});

registerCommand(new SlashCommandBuilder().setName('timeout').setDescription('Met en sourdine').addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)).addStringOption(o => o.setName('duree').setDescription('Durée (ex: 10m, 1h)').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)), async (i) => {
  if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return sendError(i, 'Permission insuffisante.');
  const ms = parseDuration(i.options.getString('duree'));
  if (!ms) return sendError(i, 'Durée invalide. Ex: 10m, 1h');
  const m = await i.guild.members.fetch(i.options.getUser('utilisateur').id).catch(() => null);
  if (!m || !m.moderatable) return sendError(i, 'Membre introuvable ou rôle trop élevé.');
  await m.timeout(ms, i.options.getString('raison'));
  await i.reply({ embeds: [createEmbed().setTitle('Timeout').setDescription(`${m.user.username} mis en sourdine.\nDurée: ${i.options.getString('duree')}\nRaison: ${i.options.getString('raison')}`)] });
});

registerCommand(new SlashCommandBuilder().setName('clear').setDescription('Supprime des messages').addIntegerOption(o => o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)), async (i) => {
  if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages)) return sendError(i, 'Permission insuffisante.');
  await i.deferReply({ ephemeral: true });
  const deleted = await i.channel.bulkDelete(i.options.getInteger('nombre'), true);
  await i.editReply({ embeds: [createEmbed().setTitle('Suppression').setDescription(`${deleted.size} message(s) supprimé(s).`)] });
  setTimeout(() => i.deleteReply().catch(() => {}), 5000);
});

registerCommand(new SlashCommandBuilder().setName('lock').setDescription('Verrouille le salon'), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Permission insuffisante.');
  await i.channel.permissionOverwrites.edit(i.guild.id, { SendMessages: false });
  await i.reply({ embeds: [createEmbed().setTitle('Salon verrouillé').setDescription('Ce salon est maintenant verrouillé.')] });
});

registerCommand(new SlashCommandBuilder().setName('unlock').setDescription('Déverrouille le salon'), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Permission insuffisante.');
  await i.channel.permissionOverwrites.edit(i.guild.id, { SendMessages: true });
  await i.reply({ embeds: [createEmbed().setTitle('Salon déverrouillé').setDescription('Ce salon est maintenant déverrouillé.')] });
});

registerCommand(new SlashCommandBuilder().setName('slowmode').setDescription('Active le mode lent').addIntegerOption(o => o.setName('secondes').setDescription('Secondes (0-21600)').setRequired(true).setMinValue(0).setMaxValue(21600)), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Permission insuffisante.');
  await i.channel.setRateLimitPerUser(i.options.getInteger('secondes'));
  await i.reply({ embeds: [createEmbed().setTitle('Slowmode').setDescription(`Mode lent activé: ${i.options.getInteger('secondes')}s.`)] });
});

// ============================================================
// COMMANDES D'ADMINISTRATION
// ============================================================
registerCommand(new SlashCommandBuilder().setName('roles').setDescription('Panel des rôles de notification'), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Staff requis.');
  const roles = [{ name: 'Spoiler' }, { name: 'Nouveautés' }, { name: 'Évènements & Giveaways' }, { name: 'Live' }];
  const buttons = [];
  for (const r of roles) {
    let role = i.guild.roles.cache.find(x => x.name === r.name);
    if (!role) role = await i.guild.roles.create({ name: r.name, color: CONFIG.COLORS.PRIMARY, reason: 'Rôle notification' });
    buttons.push(new ButtonBuilder().setCustomId(`notif:${r.name}`).setLabel(r.name).setStyle(ButtonStyle.Secondary));
  }
  await i.channel.send({ embeds: [createEmbed().setTitle('Notifications').setDescription('Clique pour activer/désactiver tes notifications.')], components: [new ActionRowBuilder().addComponents(buttons)] });
  await i.reply({ content: 'Panel envoyé.', ephemeral: true });
});

registerCommand(new SlashCommandBuilder().setName('say').setDescription('Envoie un message').addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Staff requis.');
  await i.channel.send(i.options.getString('message'));
  await i.reply({ content: 'Envoyé.', ephemeral: true });
});

registerCommand(new SlashCommandBuilder().setName('embed').setDescription('Envoie un embed').addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true)).addStringOption(o => o.setName('description').setDescription('Description').setRequired(true)).addStringOption(o => o.setName('couleur').setDescription('Hex sans # (ex: 0B5BD7)')), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Staff requis.');
  const hex = i.options.getString('couleur');
  const color = hex ? parseInt(hex, 16) || CONFIG.COLORS.PRIMARY : CONFIG.COLORS.PRIMARY;
  await i.channel.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(i.options.getString('titre')).setDescription(i.options.getString('description')).setFooter({ text: 'Urgence 514 RP - Développé par Jacobin904', iconURL: CONFIG.LOGO }).setTimestamp()] });
  await i.reply({ content: 'Embed envoyé.', ephemeral: true });
});

registerCommand(new SlashCommandBuilder().setName('annonce').setDescription('Envoie une annonce').addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Staff requis.');
  await i.channel.send({ embeds: [createEmbed().setTitle('Annonce').setDescription(i.options.getString('message'))] });
  await i.reply({ content: 'Annonce publiée.', ephemeral: true });
});

registerCommand(new SlashCommandBuilder().setName('giveaway').setDescription('Lance un giveaway').addStringOption(o => o.setName('duree').setDescription('Durée (ex: 10m, 1h)').setRequired(true)).addStringOption(o => o.setName('prix').setDescription('Prix').setRequired(true)), async (i) => {
  if (!isStaff(i)) return sendError(i, 'Staff requis.');
  const ms = parseDuration(i.options.getString('duree'));
  if (!ms) return sendError(i, 'Durée invalide. Ex: 10m, 1h');
  const prize = i.options.getString('prix');
  const id = Date.now().toString();
  const endTime = Date.now() + ms;
  const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw:${id}`).setLabel('Participer').setStyle(ButtonStyle.Primary));
  const msg = await i.channel.send({ embeds: [createEmbed({color:CONFIG.COLORS.WARNING}).setTitle('GIVEAWAY').setDescription(`Prix: ${prize}\nFin: <t:${Math.floor(endTime / 1000)}:R>\n\nClique pour participer !`)], components: [btn] });
  state.giveaways.set(id, { participants: new Set(), prize, channelId: i.channel.id, messageId: msg.id, endTime });
  setTimeout(() => endGiveaway(id), ms);
  await i.reply({ content: 'Giveaway lancé.', ephemeral: true });
});

async function endGiveaway(id) {
  const gw = state.giveaways.get(id); if (!gw) return;
  state.giveaways.delete(id);
  const ch = await client.channels.fetch(gw.channelId).catch(() => null); if (!ch) return;
  const msg = await ch.messages.fetch(gw.messageId).catch(() => null);
  const parts = [...gw.participants];
  if (parts.length === 0) {
    await ch.send({ content: `Giveaway **${gw.prize}** terminé: aucun participant.` });
    if (msg) await msg.edit({ embeds: [createEmbed().setTitle('GIVEAWAY TERMINÉ').setDescription(`Prix: ${gw.prize}\nRésultat: Aucun participant.`)], components: [] }).catch(() => {});
    return;
  }
  const winner = parts[Math.floor(Math.random() * parts.length)];
  await ch.send({ content: `Félicitations <@${winner}> qui remporte **${gw.prize}** !` });
  if (msg) await msg.edit({ embeds: [createEmbed().setTitle('GIVEAWAY TERMINÉ').setDescription(`Prix: ${gw.prize}\nGagnant: <@${winner}>`)], components: [] }).catch(() => {});
}

// ============================================================
// INTERACTIONS & DÉMARRAGE
// ============================================================
client.on('interactionCreate', async (i) => {
  if (i.isButton()) {
    try {
      if (i.customId.startsWith('notif:')) {
        const roleName = i.customId.slice(6);
        let role = i.guild.roles.cache.find(r => r.name === roleName);
        if (!role) role = await i.guild.roles.create({ name: roleName, color: CONFIG.COLORS.PRIMARY });
        if (i.member.roles.cache.has(role.id)) {
          await i.member.roles.remove(role);
          await i.reply({ content: 'Rôle retiré.', ephemeral: true });
        } else {
          await i.member.roles.add(role);
          await i.reply({ content: 'Rôle ajouté.', ephemeral: true });
        }
      } else if (i.customId.startsWith('gw:')) {
        const gw = state.giveaways.get(i.customId.slice(3));
        if (!gw) return i.reply({ content: 'Giveaway terminé.', ephemeral: true });
        if (gw.participants.has(i.user.id)) {
          gw.participants.delete(i.user.id);
          await i.reply({ content: 'Participation annulée.', ephemeral: true });
        } else {
          gw.participants.add(i.user.id);
          await i.reply({ content: 'Participation enregistrée !', ephemeral: true });
        }
      }
    } catch (error) { log('INTERACTION', `Erreur bouton: ${error.message}`, 'ERROR'); }
    return;
  }
  if (!i.isCommand()) return;
  const cmd = state.commands.get(i.commandName);
  if (!cmd) return;
  try { await cmd.handler(i); } 
  catch (e) { 
    log('COMMANDE', `Erreur /${i.commandName}: ${e.message}`, 'ERROR');
    if (!i.replied && !i.deferred) await i.reply({ content: 'Une erreur est survenue.', ephemeral: true }).catch(() => {});
  }
});

client.once('clientReady', async () => {
  log('SYSTEM', '========================================', 'INFO');
  log('SYSTEM', `Bot en ligne: ${client.user.tag}`, 'SUCCESS');
  log('SYSTEM', `Serveurs: ${client.guilds.cache.size} | Membres: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, 'INFO');
  log('SYSTEM', '========================================', 'INFO');
  
  // Mise en place du reset automatique toutes les 24 heures (86 400 000 millisecondes)
  setInterval(() => {
    state.currentSceneNumber = 1;
    log('J2C', 'Compteur de scènes réinitialisé à 1 (Reset 24h)', 'INFO');
  }, 24 * 60 * 60 * 1000);

  client.user.setPresence({ status: 'online', activities: [{ name: 'urgrp - ER:LC', type: ActivityType.Watching }] });
  try {
    const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);
    const cmds = [...state.commands.values()].map(c => c.builder.toJSON());
    log('SYSTEM', `Enregistrement de ${cmds.length} commandes...`, 'INFO');
    await rest.put(Routes.applicationGuildCommands(client.user.id, CONFIG.GUILD_ID), { body: cmds });
    log('SYSTEM', `${cmds.length} commandes enregistrées avec succès.`, 'SUCCESS');
  } catch (e) { log('SYSTEM', `Erreur commandes: ${e.message}`, 'ERROR'); }
});

if (CONFIG.BOT_TOKEN) {
  client.login(CONFIG.BOT_TOKEN).catch(e => log('SYSTEM', `Erreur connexion: ${e.message}`, 'ERROR'));
} else {
  log('SYSTEM', 'BOT_TOKEN manquant.', 'WARN');
}

module.exports = client;
