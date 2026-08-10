/**
 * ============================================================
 * URGENCE 514 RP - BOT DISCORD PROFESSIONNEL
 * ============================================================
 * Version: 3.0.0
 * Développé par: Jacobin904
 * Serveur: Urgence 514 RP (Roleplay Roblox - Montréal)
 * ============================================================
 */

'use strict';

// ============================================================
// IMPORTS
// ============================================================
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
  Partials
} = require('discord.js');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = Object.freeze({
  BOT_TOKEN: process.env.BOT_TOKEN,
  GUILD_ID: process.env.GUILD_ID || '1475659636819493089',
  REQUIRED_ROLE_ID: process.env.REQUIRED_ROLE_ID || '1475659637289127937',
  SUPER_ADMINS: Object.freeze(['1281784488854159421']),
  
  // Couleurs
  COLORS: Object.freeze({
    PRIMARY: 0x0B5BD7,
    SUCCESS: 0x3BA55C,
    DANGER: 0xED4245,
    WARNING: 0xFAA61A,
    NEUTRAL: 0x99AAB5
  }),
  
  // Assets
  LOGO: 'https://cdn.discordapp.com/icons/1475659636819493089/8a80480870b623a2afc4d2d5cc14bfbf.webp?size=1024',
  
  // GitHub (pour persistence)
  GITHUB: Object.freeze({
    TOKEN: process.env.GITHUB_TOKEN || '',
    REPO: process.env.GITHUB_REPO || 'jacobin904/Urgence-514-RP',
    BRANCH: process.env.GITHUB_BRANCH || 'main'
  }),
  
  // Auto-modération
  AUTO_MOD: Object.freeze({
    SPAM_WINDOW_MS: 5000,
    SPAM_THRESHOLD: 4,
    TIMEOUT_DURATION_MS: 60000
  })
});

// ============================================================
// ICÔNES UNICODE (remplacement des emojis)
// ============================================================
const ICONS = Object.freeze({
  // Navigation
  ARROW: '▸',
  CHECK: '✓',
  CROSS: '',
  WARNING: '⚠',
  INFO: 'ℹ',
  
  // Catégories
  HELP: '◈',
  INFO: '◉',
  CODE: '◆',
  PING: '◐',
  STATS: '◫',
  RULES: '◼',
  LANGUAGE: '',
  DEPARTMENTS: '◪',
  TEAM: '',
  RECRUITMENT: '◰',
  USER: '◦',
  SERVER: '◫',
  
  // Modération
  WARN: '▲',
  KICK: '◤',
  BAN: '',
  UNBAN: '◣',
  TIMEOUT: '◑',
  CLEAR: '◌',
  LOCK: '',
  UNLOCK: '◨',
  SLOWMODE: '◔',
  
  // Administration
  ROLES: '',
  SAY: '◧',
  EMBED: '◪',
  ANNOUNCE: '◫',
  GIVEAWAY: '◉',
  
  // Notifications
  BELL: '',
  GIFT: '◈',
  LIVE: '◐',
  
  // Statuts
  ONLINE: '●',
  OFFLINE: '○',
  PENDING: '◐'
});

// ============================================================
// INITIALISATION DU CLIENT
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel]
});

// ============================================================
// STOCKAGE EN MÉMOIRE
// ============================================================
const state = {
  giveaways: new Map(),
  spamTracker: new Map(),
  commands: new Map()
};

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Crée un embed standardisé avec le style du serveur
 */
function createEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color || CONFIG.COLORS.PRIMARY)
    .setFooter({ 
      text: 'Urgence 514 RP • Développé par Jacobin904', 
      iconURL: CONFIG.LOGO 
    });
  
  if (options.timestamp !== false) {
    embed.setTimestamp();
  }
  
  return embed;
}

/**
 * Parse une durée formatée (ex: "10m", "1h", "2d") en millisecondes
 */
function parseDuration(str) {
  if (!str) return null;
  const match = String(str).match(/^(\d+)\s*([smhd])$/i);
  if (!match) return null;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  
  return value * multipliers[unit];
}

/**
 * Formate une date en timestamp Discord
 */
function formatTimestamp(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

/**
 * Vérifie si un utilisateur est super admin
 */
function isSuperAdmin(userId) {
  return CONFIG.SUPER_ADMINS.includes(userId);
}

/**
 * Vérifie si une interaction provient d'un membre du staff
 */
function isStaff(interaction) {
  if (isSuperAdmin(interaction.user.id)) return true;
  if (interaction.member?.permissions?.has(PermissionFlagsBits.KickMembers)) return true;
  if (interaction.member?.roles?.cache?.has(CONFIG.REQUIRED_ROLE_ID)) return true;
  return false;
}

/**
 * Vérifie si un membre est staff (pour les messages)
 */
function isMemberStaff(member) {
  if (isSuperAdmin(member.id)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  if (member.roles?.cache?.has(CONFIG.REQUIRED_ROLE_ID)) return true;
  return false;
}

/**
 * Envoie une réponse d'erreur éphémère
 */
async function sendError(interaction, message) {
  const content = `${ICONS.CROSS} ${message}`;
  
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({ content, ephemeral: true }).catch(() => {});
  } else if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ content }).catch(() => {});
  }
}

/**
 * Logger professionnel
 */
function log(category, message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const levels = { INFO: '', WARN: '⚠', ERROR: '✕', SUCCESS: '✓' };
  console.log(`[${timestamp}] [${level}] [${category}] ${message}`);
}

// ============================================================
// SYSTÈME DE LOGS
// ============================================================

client.on('messageDelete', async (message) => {
  if (message.author?.bot || !message.guild || message.guild.id !== CONFIG.GUILD_ID) return;
  
  log('MODERATION', `Message supprimé | Auteur: ${message.author.tag} | Canal: #${message.channel?.name || 'inconnu'}`);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (oldMessage.author?.bot || !oldMessage.guild || oldMessage.guild.id !== CONFIG.GUILD_ID) return;
  if (oldMessage.content === newMessage.content) return;
  
  log('MODERATION', `Message modifié | Auteur: ${oldMessage.author.tag} | Canal: #${oldMessage.channel?.name || 'inconnu'}`);
});

client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== CONFIG.GUILD_ID) return;
  log('MEMBRES', `Nouveau membre | ${member.user.tag} (${member.id}) | Total: ${member.guild.memberCount}`);
});

client.on('guildMemberRemove', async (member) => {
  if (member.guild.id !== CONFIG.GUILD_ID) return;
  log('MEMBRES', `Membre parti | ${member.user.tag} (${member.id}) | Total: ${member.guild.memberCount}`);
});

client.on('guildBanAdd', async (ban) => {
  if (ban.guild.id !== CONFIG.GUILD_ID) return;
  log('MODERATION', `Membre banni | ${ban.user.tag} (${ban.id})`);
});

client.on('guildBanRemove', async (ban) => {
  if (ban.guild.id !== CONFIG.GUILD_ID) return;
  log('MODERATION', `Membre débanni | ${ban.user.tag} (${ban.id})`);
});

// ============================================================
// AUTO-MODÉRATION
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || message.guild.id !== CONFIG.GUILD_ID) return;
  if (isMemberStaff(message.member)) return;

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const userMessages = state.spamTracker.get(key) || [];
  
  const recentMessages = userMessages.filter(timestamp => now - timestamp < CONFIG.AUTO_MOD.SPAM_WINDOW_MS);
  recentMessages.push(now);
  state.spamTracker.set(key, recentMessages);

  if (recentMessages.length >= CONFIG.AUTO_MOD.SPAM_THRESHOLD) {
    state.spamTracker.delete(key);
    log('AUTO-MOD', `Spam détecté | ${message.author.tag} (${message.author.id})`, 'WARN');
    
    try {
      await message.delete().catch(() => {
        log('AUTO-MOD', `Impossible de supprimer le message de ${message.author.tag}`, 'WARN');
      });

      await message.author.send({
        embeds: [new EmbedBuilder()
          .setColor(CONFIG.COLORS.DANGER)
          .setTitle(`${ICONS.WARNING} Auto-Modération - Urgence 514 RP`)
          .setDescription('Tu as envoyé trop de messages en trop peu de temps (spam).\nMerci de ralentir pour éviter des sanctions plus lourdes.')
          .setFooter({ text: 'Urgence 514 RP', iconURL: CONFIG.LOGO })
        ]
      }).catch(() => {
        log('AUTO-MOD', `MP fermés pour ${message.author.tag}`, 'WARN');
      });

      if (message.member && message.member.moderatable) {
        await message.member.timeout(CONFIG.AUTO_MOD.TIMEOUT_DURATION_MS, 'Auto-Mod: Spam de messages');
        log('AUTO-MOD', `${message.author.tag} mis en timeout (1 minute)`, 'SUCCESS');
      } else {
        log('AUTO-MOD', `Impossible de timeout ${message.author.tag} (rôle trop élevé)`, 'WARN');
      }
    } catch (error) {
      log('AUTO-MOD', `Erreur lors de la sanction: ${error.message}`, 'ERROR');
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

registerCommand(
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche la liste de toutes les commandes disponibles'),
  async (interaction) => {
    const embed = createEmbed()
      .setTitle(`${ICONS.HELP} Aide - Urgence 514 RP`)
      .setDescription('Voici toutes les commandes disponibles sur le serveur.')
      .addFields(
        { name: `${ICONS.INFO} Informations`, value: '`/help` `/info` `/code` `/ping` `/serverstats`', inline: false },
        { name: `${ICONS.RULES} Règlements & Langage`, value: '`/regles` `/langage` `/departements` `/equipe`', inline: false },
        { name: `${ICONS.USER} Utilisateur`, value: '`/avatar` `/userinfo` `/serverinfo`', inline: false },
        { name: `${ICONS.RECRUITMENT} Recrutement`, value: '`/recrutement`', inline: false },
        { name: `${ICONS.WARN} Modération`, value: '`/warn` `/warnings` `/clearwarns` `/kick` `/ban` `/unban` `/timeout` `/clear` `/lock` `/unlock` `/slowmode`', inline: false },
        { name: `${ICONS.ROLES} Administration`, value: '`/roles` `/say` `/embed` `/annonce` `/giveaway`', inline: false }
      );
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Affiche les informations du serveur'),
  async (interaction) => {
    const embed = createEmbed()
      .setTitle(`${ICONS.INFO} Urgence 514 RP`)
      .setDescription('Serveur roleplay Roblox immersif basé sur l\'île de Montréal.')
      .setThumbnail(CONFIG.LOGO)
      .addFields(
        { name: 'Code Roblox', value: '`urgrp`', inline: true },
        { name: 'Fondation', value: '2026', inline: true },
        { name: 'Site web', value: '[jacobin904.github.io/Urgence-514-RP](https://jacobin904.github.io/Urgence-514-RP/)', inline: false },
        { name: 'Discord', value: '[discord.gg/ENgnZ629k6](https://discord.gg/ENgnZ629k6)', inline: true },
        { name: 'TikTok', value: '[@urgence_514](https://www.tiktok.com/@urgence_514)', inline: true }
      );
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('code')
    .setDescription('Affiche le code Roblox du serveur'),
  async (interaction) => {
    const embed = createEmbed()
      .setTitle(`${ICONS.CODE} Code Roblox`)
      .setDescription('Entre ce code dans Roblox pour rejoindre la ville :\n\n# `urgrp`');
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Affiche la latence du bot'),
  async (interaction) => {
    const sent = await interaction.reply({ content: `${ICONS.PING} Calcul...`, fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiPing = Math.round(client.ws.ping);
    
    await interaction.editReply({
      content: `${ICONS.PING} **Pong !**\n▸ Latence du bot: **${latency}ms**\n API Discord: **${apiPing}ms**`
    });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Affiche les statistiques complètes du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async (interaction) => {
    await interaction.deferReply();
    
    const guild = interaction.guild;
    await guild.members.fetch().catch(() => {});
    
    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
    const botMembers = guild.members.cache.filter(m => m.user.bot).size;
    const humanMembers = totalMembers - botMembers;
    const boostLevel = guild.premiumTier;
    const boosts = guild.premiumSubscriptionCount || 0;

    const embed = createEmbed()
      .setTitle(`${ICONS.STATS} Analyse Complète: ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: 'Membres Totaux', value: `${totalMembers}`, inline: true },
        { name: 'En Ligne', value: `${onlineMembers}`, inline: true },
        { name: 'Bots', value: `${botMembers}`, inline: true },
        { name: 'Humains', value: `${humanMembers}`, inline: true },
        { name: 'Niveau de Boost', value: `Niveau ${boostLevel} (${boosts} boosts)`, inline: true },
        { name: 'Salons', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Rôles', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Création', value: formatTimestamp(guild.createdAt), inline: false }
      );
    
    await interaction.editReply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('regles')
    .setDescription('Affiche les règlements du serveur')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Quel règlement afficher ?')
        .setRequired(true)
        .addChoices(
          { name: 'Discord', value: 'discord' },
          { name: 'Roblox', value: 'roblox' }
        )
    ),
  async (interaction) => {
    const type = interaction.options.getString('type');
    
    const rulesDiscord = [
      ['Respect', 'Pas d\'insultes, harcèlement ou discrimination.'],
      ['Spam', 'Pas de spam ni messages inutiles.'],
      ['Contenu', 'Contenu inapproprié interdit, tolérance zéro.'],
      ['Publicité', 'Aucune pub en MP ou serveur. Sanction: ban.'],
      ['Multi-comptes', 'Interdit pour giveaways/avantages.'],
      ['Raid', 'Tout comportement suspect = bannissement.'],
      ['Salons', 'Chaque salon a sa fonction, respecte-la.'],
      ['Pseudo', 'Pas de pseudo offensant ou choquant.']
    ];

    const rulesRoblox = [
      ['RDM / Freekill', 'Pas de kill sans raison RP.'],
      ['VDM', 'Véhicule = pas une arme.'],
      ['Cuff Rush', 'Pas de menottes sans vrai RP.'],
      ['NITRP', 'Reste dans ton personnage.'],
      ['Safe zones', 'Rien d\'illégal aux spawns, hôpital, postes.'],
      ['GTA Driving', 'Conduite réaliste exigée.'],
      ['Peace Timer', 'Aucune action illégale en temps de paix.'],
      ['FRP', 'Rien d\'impossible IRL.'],
      ['Pain', '« AIE » + 5 secondes avant de repartir.'],
      ['Cop Baiting', 'Pas provoquer la police sans raison.'],
      ['Réalisme', 'Police + gang = jamais ensemble.'],
      ['Sommations', 'Obligatoires: 1, 2, 3 fois.'],
      ['Fear', 'Joue la peur devant une arme.'],
      ['NLR', '15 min sans revenir sur la scène.']
    ];

    const rules = type === 'discord' ? rulesDiscord : rulesRoblox;
    const title = type === 'discord' ? `${ICONS.RULES} Règlement Discord` : `${ICONS.RULES} Règlement Roblox`;

    const embed = createEmbed().setTitle(title);
    rules.forEach(([rule, description]) => {
      embed.addFields({ name: `▸ ${rule}`, value: description, inline: false });
    });

    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('langage')
    .setDescription('Affiche le dictionnaire du langage RP')
    .addStringOption(option =>
      option.setName('terme')
        .setDescription('Terme à rechercher (optionnel)')
    ),
  async (interaction) => {
    const terme = interaction.options.getString('terme');

    const langage = [
      ['« Je vais faire un dodo »', 'Je me déconnecte / je reviens plus tard.'],
      ['« Mes cordes vocales »', 'Mon micro.'],
      ['« Radio »', 'Le vocal (police, EMS, civil). Discord = VPN.'],
      ['« Muscle E / R »', 'Appuie sur E / fais R.'],
      ['« J\'ai un mal de tête »', 'Je bug.'],
      ['« Membre du gouvernement »', 'Staff / modérateur.'],
      ['« Chinois / Hamburger riz poulet »', 'Langage HRP.'],
      ['« AIE »', 'Douleur: attends 5 secondes.']
    ];

    if (terme) {
      const found = langage.find(([t]) => t.toLowerCase().includes(terme.toLowerCase()));
      if (found) {
        const embed = createEmbed()
          .setTitle(`${ICONS.LANGUAGE} Langage RP`)
          .addFields({ name: found[0], value: found[1], inline: false });
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ 
          content: `${ICONS.CROSS} Terme introuvable. Utilise \`${interaction.commandName}\` sans option pour voir tout le dictionnaire.`, 
          ephemeral: true 
        });
      }
    } else {
      const embed = createEmbed().setTitle(`${ICONS.LANGUAGE} Dictionnaire RP`);
      langage.forEach(([terme, definition]) => {
        embed.addFields({ name: `▸ ${terme}`, value: definition, inline: false });
      });
      await interaction.reply({ embeds: [embed] });
    }
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('departements')
    .setDescription('Affiche la liste des départements'),
  async (interaction) => {
    const departements = [
      ['SPVM', 'Service de police de Montréal'],
      ['Sûreté du Québec', 'Police provinciale'],
      ['Urgence Santé', 'Services paramédicaux'],
      ['SIM', 'Service d\'incendie de Montréal'],
      ['GRC', 'Gendarmerie royale du Canada']
    ];

    const embed = createEmbed()
      .setTitle(`${ICONS.DEPARTMENTS} Départements`)
      .setDescription('Voici les départements disponibles sur Urgence 514 RP:');
    
    departements.forEach(([name, description]) => {
      embed.addFields({ name: `▸ ${name}`, value: description, inline: false });
    });

    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('equipe')
    .setDescription('Affiche l\'équipe du serveur'),
  async (interaction) => {
    const embed = createEmbed()
      .setTitle(`${ICONS.TEAM} Équipe`)
      .setDescription('Les membres qui portent la vision d\'Urgence 514 RP:')
      .addFields(
        { name: '▸ Fondateur', value: '𝐌𝟒𝐗𝐋𝐄𝐂𝐇𝐎𝐂𝐎𝐋𝐀𝐓.𝐐𝐂 (@maxlechocolat.qc)', inline: false },
        { name: '▸ Fondateur Adjoint', value: 'L. K TV (@l.ktv)', inline: false },
        { name: '▸ Manager', value: '!Bibibopm (@bibibopm_84423)', inline: false },
        { name: '▸ Développeur Web', value: 'Jacobin Babouain (@jacobin904)', inline: false }
      );
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('recrutement')
    .setDescription('Affiche les informations de recrutement staff'),
  async (interaction) => {
    const embed = createEmbed()
      .setTitle(`${ICONS.RECRUITMENT} Recrutement Staff`)
      .setDescription('**Conditions pour postuler:**\n▸ Être sur PC\n▸ 14 ans et +\n▸ 7 jours sur le serveur\n▸ Moins de 10 sanctions\n\n⚠ Demander des nouvelles = refus automatique.')
      .setURL('https://jacobin904.github.io/Urgence-514-RP/Recrutement/');

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Postuler')
          .setStyle(ButtonStyle.Link)
          .setURL('https://jacobin904.github.io/Urgence-514-RP/Recrutement/')
      );

    await interaction.reply({ embeds: [embed], components: [button] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Affiche l\'avatar d\'un utilisateur')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur (optionnel)')
    ),
  async (interaction) => {
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const embed = createEmbed()
      .setTitle(`${ICONS.USER} Avatar de ${user.username}`)
      .setImage(user.displayAvatarURL({ size: 512 }));
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Affiche les informations d\'un utilisateur')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur (optionnel)')
    ),
  async (interaction) => {
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const embed = createEmbed()
      .setTitle(`${ICONS.USER} ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'Oui' : 'Non', inline: true },
        { name: 'Compte créé', value: formatTimestamp(user.createdAt), inline: false },
        { name: 'A rejoint', value: member ? formatTimestamp(member.joinedAt) : 'Inconnu', inline: false },
        { name: 'Rôles', value: member && member.roles.cache.size > 1 
          ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).join(' ') 
          : 'Aucun', inline: false }
      );
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Affiche les informations du serveur'),
  async (interaction) => {
    const guild = interaction.guild;
    const embed = createEmbed()
      .setTitle(`${ICONS.SERVER} ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: 'Membres', value: `${guild.memberCount}`, inline: true },
        { name: 'Salons', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Rôles', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Créé', value: formatTimestamp(guild.createdAt), inline: false }
      );
    
    await interaction.reply({ embeds: [embed] });
  }
);

// ============================================================
// COMMANDES DE MODÉRATION
// ============================================================

registerCommand(
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertit un utilisateur')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur à avertir')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('raison')
        .setDescription('La raison de l\'avertissement')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');

    const embed = createEmbed()
      .setTitle(`${ICONS.WARN} Avertissement`)
      .addFields(
        { name: 'Utilisateur', value: `<@${target.id}>`, inline: true },
        { name: 'Raison', value: reason, inline: true },
        { name: 'Par', value: interaction.user.username, inline: true }
      );

    await interaction.reply({ embeds: [embed] });

    await target.send({
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.COLORS.WARNING)
        .setTitle(`${ICONS.WARN} Avertissement - Urgence 514 RP`)
        .setDescription(`Tu as reçu un avertissement.\n\n**Raison:** ${reason}\n**Par:** ${interaction.user.username}`)
        .setFooter({ text: 'Urgence 514 RP', iconURL: CONFIG.LOGO })
      ]
    }).catch(() => {
      log('MODERATION', `MP fermés pour ${target.tag}`, 'WARN');
    });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Affiche les avertissements d\'un utilisateur')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur à vérifier')
        .setRequired(true)
    ),
  async (interaction) => {
    const target = interaction.options.getUser('utilisateur');
    
    const embed = createEmbed()
      .setTitle(`${ICONS.WARN} Avertissements de ${target.username}`)
      .setDescription('Système de warnings en cours de développement.');
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Efface les avertissements d\'un utilisateur')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur dont il faut effacer les avertissements')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!isSuperAdmin(interaction.user.id) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(interaction, 'Admin requis.');
    }

    const target = interaction.options.getUser('utilisateur');
    
    const embed = createEmbed()
      .setTitle(`${ICONS.CHECK} Avertissements effacés`)
      .setDescription(`Tous les avertissements de ${target.username} ont été effacés.`);
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un utilisateur du serveur')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur à expulser')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('raison')
        .setDescription('La raison de l\'expulsion')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return sendError(interaction, 'Membre introuvable.');
    }

    if (!member.kickable) {
      return sendError(interaction, 'Impossible d\'expulser ce membre (rôle trop élevé).');
    }

    await member.kick(reason);

    const embed = createEmbed()
      .setTitle(`${ICONS.KICK} Expulsion`)
      .setDescription(`${member.user.username} a été expulsé du serveur.`)
      .addFields({ name: 'Raison', value: reason, inline: false });
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un utilisateur du serveur')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur à bannir')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('raison')
        .setDescription('La raison du bannissement')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');

    await interaction.guild.members.ban(target, { reason });

    const embed = createEmbed()
      .setTitle(`${ICONS.BAN} Bannissement`)
      .setDescription(`${target.username} a été banni du serveur.`)
      .addFields({ name: 'Raison', value: reason, inline: false });
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannit un utilisateur')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('L\'ID de l\'utilisateur à débannir')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    const userId = interaction.options.getString('id');

    try {
      await interaction.guild.members.unban(userId);
      const embed = createEmbed()
        .setTitle(`${ICONS.UNBAN} Débannissement`)
        .setDescription(`L'utilisateur avec l'ID \`${userId}\` a été débanni.`);
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await sendError(interaction, 'Utilisateur non banni ou ID invalide.');
    }
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Met un utilisateur en sourdine')
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription('L\'utilisateur à mettre en sourdine')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('duree')
        .setDescription('Durée (ex: 10m, 1h, 1d)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('raison')
        .setDescription('La raison du timeout')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const duration = interaction.options.getString('duree');
    const reason = interaction.options.getString('raison');
    const ms = parseDuration(duration);

    if (!ms) {
      return sendError(interaction, 'Durée invalide. Exemples: `10m`, `1h`, `1d`');
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return sendError(interaction, 'Membre introuvable.');
    }

    if (!member.moderatable) {
      return sendError(interaction, 'Impossible de mettre ce membre en sourdine (rôle trop élevé).');
    }

    await member.timeout(ms, reason);

    const embed = createEmbed()
      .setTitle(`${ICONS.TIMEOUT} Timeout`)
      .setDescription(`${member.user.username} a été mis en sourdine.`)
      .addFields(
        { name: 'Durée', value: duration, inline: true },
        { name: 'Raison', value: reason, inline: false }
      );
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime des messages')
    .addIntegerOption(option =>
      option.setName('nombre')
        .setDescription('Nombre de messages à supprimer (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
  async (interaction) => {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    const amount = interaction.options.getInteger('nombre');
    
    await interaction.deferReply({ ephemeral: true });
    
    const deleted = await interaction.channel.bulkDelete(amount, true);
    
    const embed = createEmbed()
      .setTitle(`${ICONS.CLEAR} Messages supprimés`)
      .setDescription(`${deleted.size} message(s) ont été supprimés.`);
    
    await interaction.editReply({ embeds: [embed] });
    
    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 5000);
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Verrouille le salon'),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
      SendMessages: false
    });

    const embed = createEmbed()
      .setTitle(`${ICONS.LOCK} Salon verrouillé`)
      .setDescription('Ce salon a été verrouillé. Seuls les membres avec les permissions appropriées peuvent envoyer des messages.');
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Déverrouille le salon'),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
      SendMessages: true
    });

    const embed = createEmbed()
      .setTitle(`${ICONS.UNLOCK} Salon déverrouillé`)
      .setDescription('Ce salon a été déverrouillé. Tous les membres peuvent à nouveau envoyer des messages.');
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Active le mode lent dans le salon')
    .addIntegerOption(option =>
      option.setName('secondes')
        .setDescription('Durée du slowmode en secondes (0-21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Permission insuffisante.');
    }

    const seconds = interaction.options.getInteger('secondes');
    await interaction.channel.setRateLimitPerUser(seconds);

    const embed = createEmbed()
      .setTitle(`${ICONS.SLOWMODE} Slowmode activé`)
      .setDescription(`Le mode lent est maintenant de **${seconds} seconde(s)**.`);
    
    await interaction.reply({ embeds: [embed] });
  }
);

// ============================================================
// COMMANDES D'ADMINISTRATION
// ============================================================

registerCommand(
  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Crée le panel des rôles de notification'),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Staff requis.');
    }

    const roles = [
      { name: 'Spoiler', icon: ICONS.INFO },
      { name: 'Nouveautés', icon: ICONS.STATS },
      { name: 'Évènements & Giveaways', icon: ICONS.GIFT },
      { name: 'Live', icon: ICONS.LIVE }
    ];

    const buttons = [];
    for (const role of roles) {
      let guildRole = interaction.guild.roles.cache.find(r => r.name === role.name);
      if (!guildRole) {
        guildRole = await interaction.guild.roles.create({
          name: role.name,
          color: CONFIG.COLORS.PRIMARY,
          reason: 'Rôle de notification'
        });
      }
      
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`notif:${role.name}`)
          .setLabel(`${role.icon} ${role.name}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }

    const row = new ActionRowBuilder().addComponents(buttons);
    const embed = createEmbed()
      .setTitle(`${ICONS.BELL} Notifications`)
      .setDescription('Clique sur les boutons pour activer/désactiver tes notifications.');

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `${ICONS.CHECK} Panel de rôles envoyé.`, ephemeral: true });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Envoie un message dans le salon')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Le message à envoyer')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Staff requis.');
    }

    const message = interaction.options.getString('message');
    await interaction.channel.send(message);
    await interaction.reply({ content: `${ICONS.CHECK} Message envoyé.`, ephemeral: true });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Envoie un message en embed')
    .addStringOption(option =>
      option.setName('titre')
        .setDescription('Le titre de l\'embed')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('La description de l\'embed')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('couleur')
        .setDescription('Couleur en hex sans # (ex: 0B5BD7)')
    ),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Staff requis.');
    }

    const title = interaction.options.getString('titre');
    const description = interaction.options.getString('description');
    const colorHex = interaction.options.getString('couleur');
    const color = colorHex ? parseInt(colorHex, 16) || CONFIG.COLORS.PRIMARY : CONFIG.COLORS.PRIMARY;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: 'Urgence 514 RP • Développé par Jacobin904', iconURL: CONFIG.LOGO })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: `${ICONS.CHECK} Embed envoyé.`, ephemeral: true });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('annonce')
    .setDescription('Envoie une annonce officielle')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Le message de l\'annonce')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Staff requis.');
    }

    const message = interaction.options.getString('message');
    const embed = createEmbed()
      .setTitle(`${ICONS.ANNOUNCE} Annonce`)
      .setDescription(message);

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: `${ICONS.CHECK} Annonce publiée.`, ephemeral: true });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Lance un giveaway')
    .addStringOption(option =>
      option.setName('duree')
        .setDescription('Durée (ex: 10m, 1h, 1d)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('prix')
        .setDescription('Le prix du giveaway')
        .setRequired(true)
    ),
  async (interaction) => {
    if (!isStaff(interaction)) {
      return sendError(interaction, 'Staff requis.');
    }

    const duration = interaction.options.getString('duree');
    const prize = interaction.options.getString('prix');
    const ms = parseDuration(duration);

    if (!ms) {
      return sendError(interaction, 'Durée invalide. Exemples: `10m`, `1h`, `1d`');
    }

    const giveawayId = Date.now().toString();
    const endTime = Date.now() + ms;

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`gw:${giveawayId}`)
          .setLabel(`${ICONS.GIFT} Participer`)
          .setStyle(ButtonStyle.Primary)
      );

    const embed = createEmbed({ color: CONFIG.COLORS.WARNING })
      .setTitle(`${ICONS.GIVEAWAY} GIVEAWAY`)
      .setDescription(`**Prix:** ${prize}\n**Fin:** <t:${Math.floor(endTime / 1000)}:R>\n\nClique sur le bouton pour participer !`);

    const message = await interaction.channel.send({ embeds: [embed], components: [button] });
    
    state.giveaways.set(giveawayId, {
      participants: new Set(),
      prize,
      channelId: interaction.channel.id,
      messageId: message.id,
      endTime
    });

    setTimeout(() => endGiveaway(giveawayId), ms);
    await interaction.reply({ content: `${ICONS.CHECK} Giveaway lancé.`, ephemeral: true });
  }
);

// ============================================================
// FONCTION DE FIN DE GIVEAWAY
// ============================================================

async function endGiveaway(giveawayId) {
  const giveaway = state.giveaways.get(giveawayId);
  if (!giveaway) return;
  
  state.giveaways.delete(giveawayId);

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  const participants = [...giveaway.participants];

  if (participants.length === 0) {
    await channel.send({ content: `${ICONS.GIVEAWAY} Giveaway **${giveaway.prize}** terminé: aucun participant.` });
    if (message) {
      await message.edit({
        embeds: [createEmbed().setTitle(`${ICONS.GIVEAWAY} GIVEAWAY TERMINÉ`).setDescription(`**Prix:** ${giveaway.prize}\n**Résultat:** Aucun participant.`)],
        components: []
      }).catch(() => {});
    }
    return;
  }

  const winner = participants[Math.floor(Math.random() * participants.length)];
  await channel.send({ content: `${ICONS.GIVEAWAY} **Félicitations <@${winner}>** qui remporte **${giveaway.prize}** !` });
  
  if (message) {
    await message.edit({
      embeds: [createEmbed().setTitle(`${ICONS.GIVEAWAY} GIVEAWAY TERMINÉ`).setDescription(`**Prix:** ${giveaway.prize}\n**Gagnant:** <@${winner}>`)],
      components: []
    }).catch(() => {});
  }
}

// ============================================================
// GESTION DES INTERACTIONS
// ============================================================

client.on('interactionCreate', async (interaction) => {
  // Gestion des boutons
  if (interaction.isButton()) {
    try {
      if (interaction.customId.startsWith('notif:')) {
        const roleName = interaction.customId.slice(6);
        let role = interaction.guild.roles.cache.find(r => r.name === roleName);
        
        if (!role) {
          role = await interaction.guild.roles.create({ name: roleName, color: CONFIG.COLORS.PRIMARY });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          await interaction.member.roles.remove(role);
          await interaction.reply({ content: `${ICONS.CROSS} Rôle **${roleName}** retiré.`, ephemeral: true });
        } else {
          await interaction.member.roles.add(role);
          await interaction.reply({ content: `${ICONS.BELL} Rôle **${roleName}** ajouté.`, ephemeral: true });
        }
      } else if (interaction.customId.startsWith('gw:')) {
        const giveawayId = interaction.customId.slice(3);
        const giveaway = state.giveaways.get(giveawayId);
        
        if (!giveaway) {
          return interaction.reply({ content: `${ICONS.CROSS} Giveaway terminé.`, ephemeral: true });
        }

        if (giveaway.participants.has(interaction.user.id)) {
          giveaway.participants.delete(interaction.user.id);
          await interaction.reply({ content: `${ICONS.CROSS} Participation annulée.`, ephemeral: true });
        } else {
          giveaway.participants.add(interaction.user.id);
          await interaction.reply({ content: `${ICONS.GIFT} Participation enregistrée !`, ephemeral: true });
        }
      }
    } catch (error) {
      log('INTERACTION', `Erreur bouton: ${error.message}`, 'ERROR');
    }
    return;
  }

  // Gestion des commandes slash
  if (!interaction.isCommand()) return;

  const command = state.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.handler(interaction);
  } catch (error) {
    log('COMMANDE', `Erreur /${interaction.commandName}: ${error.message}`, 'ERROR');
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: `${ICONS.CROSS} Une erreur est survenue lors de l'exécution de cette commande.`, 
        ephemeral: true 
      }).catch(() => {});
    }
  }
});

// ============================================================
// DÉMARRAGE DU BOT
// ============================================================

client.once('clientReady', async () => {
  log('SYSTEM', '════════════════════════════════════════', 'INFO');
  log('SYSTEM', `Bot en ligne: ${client.user.tag}`, 'SUCCESS');
  log('SYSTEM', `Serveurs: ${client.guilds.cache.size}`, 'INFO');
  log('SYSTEM', `Membres: ${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)}`, 'INFO');
  log('SYSTEM', '════════════════════════════════════════', 'INFO');

  // Mise à jour du statut
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'urgrp • ER:LC', type: ActivityType.Watching }]
  });

  // Enregistrement des commandes
  try {
    const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);
    const commandsData = [...state.commands.values()].map(cmd => cmd.builder.toJSON());
    
    log('SYSTEM', `Enregistrement de ${commandsData.length} commandes...`, 'INFO');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, CONFIG.GUILD_ID),
      { body: commandsData }
    );
    log('SYSTEM', `${commandsData.length} commandes enregistrées avec succès.`, 'SUCCESS');
  } catch (error) {
    log('SYSTEM', `Erreur lors de l'enregistrement des commandes: ${error.message}`, 'ERROR');
  }
});

// ============================================================
// CONNEXION DU BOT
// ============================================================

if (CONFIG.BOT_TOKEN) {
  client.login(CONFIG.BOT_TOKEN).catch(error => {
    log('SYSTEM', `Erreur de connexion du bot: ${error.message}`, 'ERROR');
  });
} else {
  log('SYSTEM', 'BOT_TOKEN manquant dans les variables d\'environnement.', 'WARN');
}

// ============================================================
// EXPORT POUR SERVER.JS
// ============================================================

module.exports = client;
