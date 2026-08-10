/**
 * ============================================================
 * URGENCE 514 RP - BOT DISCORD PROFESSIONNEL
 * ============================================================
 * Développé par Jacobin904
 * Serveur roleplay Roblox basé à Montréal
 * ============================================================
 */

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
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  GUILD_ID: process.env.GUILD_ID || '1475659636819493089',
  REQUIRED_ROLE_ID: process.env.REQUIRED_ROLE_ID || '1475659637289127937',
  SUPER_ADMINS: ['1281784488854159421'],
  COLOR: 0x0B5BD7,
  COLOR_SUCCESS: 0x3BA55C,
  COLOR_DANGER: 0xED4245,
  COLOR_WARNING: 0xFAA61A,
  LOGO: 'https://cdn.discordapp.com/icons/1475659636819493089/8a80480870b623a2afc4d2d5cc14bfbf.webp?size=1024',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_REPO: process.env.GITHUB_REPO || 'jacobin904/Urgence-514-RP',
  GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main'
};

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
const giveaways = new Map();
const spamTracker = new Map();
const commands = new Map();

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

/**
 * Crée un embed de base avec le style du serveur
 */
function createEmbed() {
  return new EmbedBuilder()
    .setColor(CONFIG.COLOR)
    .setFooter({ text: 'Urgence 514 RP • Développé par Jacobin904', iconURL: CONFIG.LOGO })
    .setTimestamp();
}

/**
 * Parse une durée (ex: "10m", "1h", "2d") en millisecondes
 */
function parseDuration(str) {
  if (!str) return null;
  const match = String(str).match(/^(\d+)\s*([smhd])$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
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
 * Envoie un message d'erreur éphémère
 */
async function sendError(interaction, message) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
}

/**
 * Formate un timestamp Discord
 */
function formatTimestamp(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

// ============================================================
// SYSTÈME DE LOGS
// ============================================================

client.on('messageDelete', async (message) => {
  if (message.author?.bot || !message.guild || message.guild.id !== CONFIG.GUILD_ID) return;
  console.log(`[LOG] 🗑️ Message supprimé | Auteur: ${message.author.tag} | Canal: #${message.channel?.name || 'inconnu'} | Contenu: "${message.content?.substring(0, 50) || 'embed/média'}"`);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (oldMessage.author?.bot || !oldMessage.guild || oldMessage.guild.id !== CONFIG.GUILD_ID) return;
  if (oldMessage.content === newMessage.content) return;
  console.log(`[LOG] ✏️ Message modifié | Auteur: ${oldMessage.author.tag} | Canal: #${oldMessage.channel?.name || 'inconnu'}`);
  console.log(`[LOG]    Avant: "${oldMessage.content?.substring(0, 50) || '...'}"`);
  console.log(`[LOG]    Après: "${newMessage.content?.substring(0, 50) || '...'}"`);
});

client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== CONFIG.GUILD_ID) return;
  console.log(`[LOG] 👋 Nouveau membre | ${member.user.tag} (${member.id}) | Total: ${member.guild.memberCount}`);
});

client.on('guildMemberRemove', async (member) => {
  if (member.guild.id !== CONFIG.GUILD_ID) return;
  console.log(`[LOG]  Membre parti | ${member.user.tag} (${member.id}) | Total: ${member.guild.memberCount}`);
});

client.on('guildBanAdd', async (ban) => {
  if (ban.guild.id !== CONFIG.GUILD_ID) return;
  console.log(`[LOG] 🔨 Membre banni | ${ban.user.tag} (${ban.id})`);
});

client.on('guildBanRemove', async (ban) => {
  if (ban.guild.id !== CONFIG.GUILD_ID) return;
  console.log(`[LOG] 🔓 Membre débanni | ${ban.user.tag} (${ban.id})`);
});

// ============================================================
// AUTO-MODÉRATION
// ============================================================

client.on('messageCreate', async (message) => {
  // Ignorer les bots et les messages hors serveur
  if (message.author.bot || !message.guild || message.guild.id !== CONFIG.GUILD_ID) return;
  
  // Ignorer le staff
  if (isMemberStaff(message.member)) return;

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const userMessages = spamTracker.get(key) || [];
  
  // Garder uniquement les messages des 5 dernières secondes
  const recentMessages = userMessages.filter(timestamp => now - timestamp < 5000);
  recentMessages.push(now);
  spamTracker.set(key, recentMessages);

  // Détection de spam (4 messages en 5 secondes)
  if (recentMessages.length >= 4) {
    spamTracker.delete(key);
    console.log(`[AUTO-MOD]  Spam détecté | ${message.author.tag} (${message.author.id})`);
    
    try {
      // Supprimer le message
      await message.delete().catch(() => {
        console.log(`[AUTO-MOD] ⚠️ Impossible de supprimer le message de ${message.author.tag}`);
      });

      // Avertissement en MP
      await message.author.send({
        embeds: [new EmbedBuilder()
          .setColor(CONFIG.COLOR_DANGER)
          .setTitle('⚠️ Auto-Modération - Urgence 514 RP')
          .setDescription('Tu as envoyé trop de messages en trop peu de temps (spam).\nMerci de ralentir pour éviter des sanctions plus lourdes.')
          .setFooter({ text: 'Urgence 514 RP', iconURL: CONFIG.LOGO })
        ]
      }).catch(() => {
        console.log(`[AUTO-MOD] ⚠️ MP fermés pour ${message.author.tag}`);
      });

      // Timeout de 1 minute
      if (message.member && message.member.moderatable) {
        await message.member.timeout(60000, 'Auto-Mod: Spam de messages');
        console.log(`[AUTO-MOD] 🔇 ${message.author.tag} mis en timeout (1 minute)`);
      } else {
        console.log(`[AUTO-MOD] ️ Impossible de timeout ${message.author.tag} (rôle trop élevé)`);
      }
    } catch (error) {
      console.error(`[AUTO-MOD] ❌ Erreur lors de la sanction: ${error.message}`);
    }
  }
});

// ============================================================
// ENREGISTREMENT DES COMMANDES
// ============================================================

function registerCommand(builder, handler) {
  commands.set(builder.name, { builder, handler });
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
      .setTitle('📚 Aide - Urgence 514 RP')
      .setDescription('Voici toutes les commandes disponibles sur le serveur.')
      .addFields(
        { name: '🌐 Informations', value: '`/help` `/info` `/code` `/ping` `/serverstats`', inline: false },
        { name: '📜 Règlements & Langage', value: '`/regles` `/langage` `/departements` `/equipe`', inline: false },
        { name: '👤 Utilisateur', value: '`/avatar` `/userinfo` `/serverinfo`', inline: false },
        { name: '⭐ Recrutement', value: '`/recrutement`', inline: false },
        { name: '🛡️ Modération', value: '`/warn` `/warnings` `/clearwarns` `/kick` `/ban` `/unban` `/timeout` `/clear` `/lock` `/unlock` `/slowmode`', inline: false },
        { name: '⚙️ Administration', value: '`/roles` `/say` `/embed` `/annonce` `/giveaway`', inline: false }
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
      .setTitle('🚨 Urgence 514 RP')
      .setDescription('Serveur roleplay Roblox immersif basé sur l\'île de Montréal.')
      .setThumbnail(CONFIG.LOGO)
      .addFields(
        { name: '🎮 Code Roblox', value: '`urgrp`', inline: true },
        { name: '📅 Fondation', value: '2026', inline: true },
        { name: '🌐 Site web', value: '[jacobin904.github.io/Urgence-514-RP](https://jacobin904.github.io/Urgence-514-RP/)', inline: false },
        { name: '💬 Discord', value: '[discord.gg/ENgnZ629k6](https://discord.gg/ENgnZ629k6)', inline: true },
        { name: '🎵 TikTok', value: '[@urgence_514](https://www.tiktok.com/@urgence_514)', inline: true }
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
      .setTitle(' Code Roblox')
      .setDescription('Entre ce code dans Roblox pour rejoindre la ville :\n\n# `urgrp`');
    
    await interaction.reply({ embeds: [embed] });
  }
);

registerCommand(
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Affiche la latence du bot'),
  async (interaction) => {
    const sent = await interaction.reply({ content: '🏓 Ping...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiPing = Math.round(client.ws.ping);
    
    await interaction.editReply({
      content: `🏓 **Pong !**\n• Latence du bot: **${latency}ms**\n• API Discord: **${apiPing}ms**`
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
      .setTitle(`📊 Analyse Complète: ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: '👥 Membres Totaux', value: `${totalMembers}`, inline: true },
        { name: '🟢 En Ligne', value: `${onlineMembers}`, inline: true },
        { name: '🤖 Bots', value: `${botMembers}`, inline: true },
        { name: '👤 Humains', value: `${humanMembers}`, inline: true },
        { name: '💎 Niveau de Boost', value: `Niveau ${boostLevel} (${boosts} boosts)`, inline: true },
        { name: ' Salons', value: `${guild.channels.cache.size}`, inline: true },
        { name: ' Rôles', value: `${guild.roles.cache.size}`, inline: true },
        { name: '📅 Création', value: formatTimestamp(guild.createdAt), inline: false }
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
    const title = type === 'discord' ? '📜 Règlement Discord' : '🎮 Règlement Roblox';

    const embed = createEmbed().setTitle(title);
    rules.forEach(([rule, description]) => {
      embed.addFields({ name: rule, value: description, inline: false });
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
          .setTitle('️ Langage RP')
          .addFields({ name: found[0], value: found[1], inline: false });
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: '❌ Terme introuvable. Utilise `/langage` sans option pour voir tout le dictionnaire.', ephemeral: true });
      }
    } else {
      const embed = createEmbed().setTitle('🗣️ Dictionnaire RP');
      langage.forEach(([terme, definition]) => {
        embed.addFields({ name: terme, value: definition, inline: false });
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
      .setTitle('🚔 Départements')
      .setDescription('Voici les départements disponibles sur Urgence 514 RP:');
    
    departements.forEach(([name, description]) => {
      embed.addFields({ name: name, value: description, inline: false });
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
      .setTitle('👥 Équipe')
      .setDescription('Les membres qui portent la vision d\'Urgence 514 RP:')
      .addFields(
        { name: '👑 Fondateur', value: '𝐌𝟒𝐋𝐄𝐂𝐇𝐎𝐂𝐎𝐋𝐀𝐓.𝐂 (@maxlechocolat.qc)', inline: false },
        { name: '👑 Fondateur Adjoint', value: 'L. K TV (@l.ktv)', inline: false },
        { name: '💼 Manager', value: '!Bibibopm (@bibibopm_84423)', inline: false },
        { name: '💻 Développeur Web', value: 'Jacobin Babouain (@jacobin904)', inline: false }
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
      .setTitle('⭐ Recrutement Staff')
      .setDescription('**Conditions pour postuler:**\n• Être sur PC\n• 14 ans et +\n• 7 jours sur le serveur\n• Moins de 10 sanctions\n\n⚠️ Demander des nouvelles = refus automatique.')
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
      .setTitle(`Avatar de ${user.username}`)
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
      .setTitle(`👤 ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot ?', value: user.bot ? 'Oui' : 'Non', inline: true },
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
      .setTitle(`🏙️ ${guild.name}`)
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');

    const embed = createEmbed()
      .setTitle('⚠️ Avertissement')
      .addFields(
        { name: 'Utilisateur', value: `<@${target.id}>`, inline: true },
        { name: 'Raison', value: reason, inline: true },
        { name: 'Par', value: interaction.user.username, inline: true }
      );

    await interaction.reply({ embeds: [embed] });

    // Envoi du MP
    await target.send({
      embeds: [new EmbedBuilder()
        .setColor(CONFIG.COLOR_WARNING)
        .setTitle('⚠️ Avertissement - Urgence 514 RP')
        .setDescription(`Tu as reçu un avertissement.\n\n**Raison:** ${reason}\n**Par:** ${interaction.user.username}`)
        .setFooter({ text: 'Urgence 514 RP', iconURL: CONFIG.LOGO })
      ]
    }).catch(() => {
      console.log(`[WARN] ⚠️ MP fermés pour ${target.tag}`);
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
    
    // Ici tu pourrais intégrer le système de warnings avec GitHub
    const embed = createEmbed()
      .setTitle(`️ Avertissements de ${target.username}`)
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
      return sendError(interaction, '❌ Admin requis.');
    }

    const target = interaction.options.getUser('utilisateur');
    
    const embed = createEmbed()
      .setTitle('✅ Avertissements effacés')
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return sendError(interaction, ' Membre introuvable.');
    }

    if (!member.kickable) {
      return sendError(interaction, '❌ Impossible d\'expulser ce membre (rôle trop élevé).');
    }

    await member.kick(reason);

    const embed = createEmbed()
      .setTitle('👢 Expulsion')
      .setDescription(`${member.user.username} a été expulsé du serveur.`)
      .addFields(
        { name: 'Raison', value: reason, inline: false }
      );
    
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');

    await interaction.guild.members.ban(target, { reason });

    const embed = createEmbed()
      .setTitle('🔨 Bannissement')
      .setDescription(`${target.username} a été banni du serveur.`)
      .addFields(
        { name: 'Raison', value: reason, inline: false }
      );
    
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    const userId = interaction.options.getString('id');

    try {
      await interaction.guild.members.unban(userId);
      const embed = createEmbed()
        .setTitle(' Débannissement')
        .setDescription(`L'utilisateur avec l'ID \`${userId}\` a été débanni.`);
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await sendError(interaction, '❌ Utilisateur non banni ou ID invalide.');
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    const target = interaction.options.getUser('utilisateur');
    const duration = interaction.options.getString('duree');
    const reason = interaction.options.getString('raison');
    const ms = parseDuration(duration);

    if (!ms) {
      return sendError(interaction, '❌ Durée invalide. Exemples: `10m`, `1h`, `1d`');
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return sendError(interaction, '❌ Membre introuvable.');
    }

    if (!member.moderatable) {
      return sendError(interaction, '❌ Impossible de mettre ce membre en sourdine (rôle trop élevé).');
    }

    await member.timeout(ms, reason);

    const embed = createEmbed()
      .setTitle('️ Timeout')
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    const amount = interaction.options.getInteger('nombre');
    
    await interaction.deferReply({ ephemeral: true });
    
    const deleted = await interaction.channel.bulkDelete(amount, true);
    
    const embed = createEmbed()
      .setTitle('️ Messages supprimés')
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
      SendMessages: false
    });

    const embed = createEmbed()
      .setTitle('🔒 Salon verrouillé')
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
      SendMessages: true
    });

    const embed = createEmbed()
      .setTitle(' Salon déverrouillé')
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
      return sendError(interaction, '❌ Permission insuffisante.');
    }

    const seconds = interaction.options.getInteger('secondes');
    await interaction.channel.setRateLimitPerUser(seconds);

    const embed = createEmbed()
      .setTitle('🐢 Slowmode activé')
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
      return sendError(interaction, ' Staff requis.');
    }

    const roles = [
      { name: 'Spoiler', emoji: '👀' },
      { name: 'Nouveautés', emoji: '⭐' },
      { name: 'Évènements & Giveaways', emoji: '🎊' },
      { name: 'Live', emoji: '' }
    ];

    const buttons = [];
    for (const role of roles) {
      let guildRole = interaction.guild.roles.cache.find(r => r.name === role.name);
      if (!guildRole) {
        guildRole = await interaction.guild.roles.create({
          name: role.name,
          color: CONFIG.COLOR,
          reason: 'Rôle de notification'
        });
      }
      
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`notif:${role.name}`)
          .setLabel(`${role.emoji} ${role.name}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }

    const row = new ActionRowBuilder().addComponents(buttons);
    const embed = createEmbed()
      .setTitle('🔔 Notifications')
      .setDescription('Clique sur les boutons pour activer/désactiver tes notifications.');

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel de rôles envoyé.', ephemeral: true });
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
      return sendError(interaction, '❌ Staff requis.');
    }

    const message = interaction.options.getString('message');
    await interaction.channel.send(message);
    await interaction.reply({ content: '✅ Message envoyé.', ephemeral: true });
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
      return sendError(interaction, '❌ Staff requis.');
    }

    const title = interaction.options.getString('titre');
    const description = interaction.options.getString('description');
    const colorHex = interaction.options.getString('couleur');
    const color = colorHex ? parseInt(colorHex, 16) || CONFIG.COLOR : CONFIG.COLOR;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: 'Urgence 514 RP • Développé par Jacobin904', iconURL: CONFIG.LOGO })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ Embed envoyé.', ephemeral: true });
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
      return sendError(interaction, '❌ Staff requis.');
    }

    const message = interaction.options.getString('message');
    const embed = createEmbed()
      .setTitle('📢 Annonce')
      .setDescription(message);

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ Annonce publiée.', ephemeral: true });
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
      return sendError(interaction, '❌ Staff requis.');
    }

    const duration = interaction.options.getString('duree');
    const prize = interaction.options.getString('prix');
    const ms = parseDuration(duration);

    if (!ms) {
      return sendError(interaction, ' Durée invalide. Exemples: `10m`, `1h`, `1d`');
    }

    const giveawayId = Date.now().toString();
    const endTime = Date.now() + ms;

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`gw:${giveawayId}`)
          .setLabel('🎉 Participer')
          .setStyle(ButtonStyle.Primary)
      );

    const embed = createEmbed()
      .setTitle('🎉 GIVEAWAY')
      .setDescription(`**Prix:** ${prize}\n**Fin:** <t:${Math.floor(endTime / 1000)}:R>\n\nClique sur le bouton pour participer !`)
      .setColor(CONFIG.COLOR_WARNING);

    const message = await interaction.channel.send({ embeds: [embed], components: [button] });
    
    giveaways.set(giveawayId, {
      participants: new Set(),
      prize,
      channelId: interaction.channel.id,
      messageId: message.id,
      endTime
    });

    setTimeout(() => endGiveaway(giveawayId), ms);
    await interaction.reply({ content: '✅ Giveaway lancé.', ephemeral: true });
  }
);

// ============================================================
// FONCTION DE FIN DE GIVEAWAY
// ============================================================

async function endGiveaway(giveawayId) {
  const giveaway = giveaways.get(giveawayId);
  if (!giveaway) return;
  
  giveaways.delete(giveawayId);

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  const participants = [...giveaway.participants];

  if (participants.length === 0) {
    await channel.send({ content: `🎉 Giveaway **${giveaway.prize}** terminé: aucun participant.` });
    if (message) {
      await message.edit({
        embeds: [createEmbed().setTitle('🎉 GIVEAWAY TERMINÉ').setDescription(`**Prix:** ${giveaway.prize}\n**Résultat:** Aucun participant.`)],
        components: []
      }).catch(() => {});
    }
    return;
  }

  const winner = participants[Math.floor(Math.random() * participants.length)];
  await channel.send({ content: `🎉 **Félicitations <@${winner}>** qui remporte **${giveaway.prize}** !` });
  
  if (message) {
    await message.edit({
      embeds: [createEmbed().setTitle('🎉 GIVEAWAY TERMINÉ').setDescription(`**Prix:** ${giveaway.prize}\n**Gagnant:** <@${winner}>`)],
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
          role = await interaction.guild.roles.create({ name: roleName, color: CONFIG.COLOR });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          await interaction.member.roles.remove(role);
          await interaction.reply({ content: ` Rôle **${roleName}** retiré.`, ephemeral: true });
        } else {
          await interaction.member.roles.add(role);
          await interaction.reply({ content: `🔔 Rôle **${roleName}** ajouté.`, ephemeral: true });
        }
      } else if (interaction.customId.startsWith('gw:')) {
        const giveawayId = interaction.customId.slice(3);
        const giveaway = giveaways.get(giveawayId);
        
        if (!giveaway) {
          return interaction.reply({ content: '⏰ Giveaway terminé.', ephemeral: true });
        }

        if (giveaway.participants.has(interaction.user.id)) {
          giveaway.participants.delete(interaction.user.id);
          await interaction.reply({ content: '❌ Participation annulée.', ephemeral: true });
        } else {
          giveaway.participants.add(interaction.user.id);
          await interaction.reply({ content: '🎉 Participation enregistrée !', ephemeral: true });
        }
      }
    } catch (error) {
      console.error('[INTERACTION] Erreur bouton:', error);
    }
    return;
  }

  // Gestion des commandes slash
  if (!interaction.isCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.handler(interaction);
  } catch (error) {
    console.error(`[COMMANDE] Erreur /${interaction.commandName}:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Une erreur est survenue lors de l\'exécution de cette commande.', ephemeral: true }).catch(() => {});
    }
  }
});

// ============================================================
// DÉMARRAGE DU BOT
// ============================================================

client.once('clientReady', async () => {
  console.log('════════════════════════════════════════');
  console.log('✅ Bot en ligne: ' + client.user.tag);
  console.log('📊 Serveurs: ' + client.guilds.cache.size);
  console.log(' Membres: ' + client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0));
  console.log('════════════════════════════════════════');

  // Mise à jour du statut
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'urgrp • ER:LC', type: ActivityType.Watching }]
  });

  // Enregistrement des commandes
  try {
    const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);
    const commandsData = [...commands.values()].map(cmd => cmd.builder.toJSON());
    
    console.log(`📤 Enregistrement de ${commandsData.length} commandes...`);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, CONFIG.GUILD_ID),
      { body: commandsData }
    );
    console.log(`✅ ${commandsData.length} commandes enregistrées avec succès.`);
  } catch (error) {
    console.error(' Erreur lors de l\'enregistrement des commandes:', error.message);
  }
});

// ============================================================
// CONNEXION DU BOT
// ============================================================

if (CONFIG.BOT_TOKEN) {
  client.login(CONFIG.BOT_TOKEN).catch(error => {
    console.error('❌ Erreur de connexion du bot:', error.message);
  });
} else {
  console.warn('⚠️ BOT_TOKEN manquant dans les variables d\'environnement.');
}

// ============================================================
// EXPORT POUR SERVER.JS
// ============================================================

module.exports = client;
