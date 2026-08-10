const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ActivityType, REST, Routes } = require('discord.js');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID || '1475659636819493089';
const REQUIRED_ROLE_ID = process.env.REQUIRED_ROLE_ID || '1475659637289127937';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'jacobin904/Urgence-514-RP';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SUPER_ADMINS = ['1281784488854159421'];
const COLOR = 0x0B5BD7;
const LOGO = 'https://cdn.discordapp.com/icons/1475659636819493089/8a80480870b623a2afc4d2d5cc14bfbf.webp?size=1024';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const giveaways = new Map();

// ===== ANTI-CRASH & KEEP ALIVE =====
process.on('unhandledRejection', error => console.error('Promesse rejetée:', error));
process.on('uncaughtException', error => console.error('Erreur non capturée:', error));

if (process.env.RENDER_EXTERNAL_URL) {
  console.log('🔄 Keep-Alive activé pour maintenir le bot en ligne sur Render.');
  setInterval(() => { fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {}); }, 10 * 60 * 1000);
}

const isSuperAdmin = id => SUPER_ADMINS.includes(id);
const isStaff = i => isSuperAdmin(i.user.id) || i.member?.permissions?.has(PermissionFlagsBits.KickMembers) || i.member?.roles?.cache?.has(REQUIRED_ROLE_ID);

function baseEmbed() { return new EmbedBuilder().setColor(COLOR).setFooter({ text: 'Urgence 514 RP • Développé par Jacobin904', iconURL: LOGO }).setTimestamp(); }
function parseDuration(str) {
  const m = String(str).match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;
  return parseInt(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
}

async function ghRead() {
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/botdata.json?ref=${GITHUB_BRANCH}`, { headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'urgence-514-bot' } });
    if (r.status === 404) return { list: { warnings: {} }, sha: null };
    const d = await r.json();
    return { list: JSON.parse(Buffer.from(d.content, 'base64').toString('utf8')), sha: d.sha };
  } catch { return { list: { warnings: {} }, sha: null }; }
}
async function ghWrite(data) {
  if (!GITHUB_TOKEN) return;
  const { sha } = await ghRead();
  const body = { message: 'bot data update', content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/botdata.json`, { method: 'PUT', headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'urgence-514-bot', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const RULES_DISCORD = [['Respect', "Pas d'insultes, harcèlement ou discrimination."], ['Spam', 'Pas de spam ni messages inutiles.'], ['Contenu', 'Contenu inapproprié interdit, tolérance zéro.'], ['Publicité', 'Aucune pub en MP ou serveur. Sanction : ban.'], ['Multi-comptes', 'Interdit pour giveaways/avantages.'], ['Raid', 'Tout comportement suspect = bannissement.'], ['Salons', "Chaque salon a sa fonction, respecte-la."], ['Pseudo', 'Pas de pseudo offensant ou choquant.']];
const RULES_ROBLOX = [['RDM / Freekill', 'Pas de kill sans raison RP.'], ['VDM', 'Véhicule = pas une arme.'], ['Cuff Rush', 'Pas de menottes sans vrai RP.'], ['NITRP', 'Reste dans ton personnage.'], ['Safe zones', "Rien d'illégal aux spawns, hôpital, postes."], ['GTA Driving', 'Conduite réaliste exigée.'], ['Peace Timer', "Aucune action illégale en temps de paix."], ['FRP', "Rien d'impossible IRL."], ['Pain', '« AIE » + 5 secondes avant de repartir.'], ['Cop Baiting', 'Pas provoquer la police sans raison.'], ['Réalisme', 'Police + gang = jamais ensemble.'], ['Sommations', 'Obligatoires : 1, 2, 3 fois.'], ['Fear', 'Joue la peur devant une arme.'], ['NLR', '15 min sans revenir sur la scène.']];
const LANGAGE = [['« Je vais faire un dodo »', 'Je me déconnecte / je reviens plus tard.'], ['« Mes cordes vocales »', 'Mon micro.'], ['« Radio »', 'Le vocal (police, EMS, civil). Discord = VPN.'], ['« Muscle E / R »', 'Appuie sur E / fais R.'], ['« J\'ai un mal de tête »', 'Je bug.'], ['« Membre du gouvernement »', 'Staff / modérateur.'], ['« Chinois / Hamburger riz poulet »', 'Langage HRP.'], ['« AIE »', 'Douleur : attends 5 secondes.']];
const DEPARTEMENTS = [['SPVM', 'Service de police de Montréal'], ['Sûreté du Québec', 'Police provinciale'], ['Urgence Santé', 'Services paramédicaux'], ['SIM', "Service d'incendie de Montréal"], ['GRC', 'Gendarmerie royale du Canada']];

const commands = new Map();
function addCmd(builder, run) { commands.set(builder.name, { builder, run }); }

// --- COMMANDES PUBLIQUES ---
addCmd(new SlashCommandBuilder().setName('help').setDescription('Liste de toutes les commandes'), async i => {
  i.reply({ embeds: [baseEmbed().setTitle('📚 Aide — Urgence 514 RP').addFields({name:'🌐 Public',value:'`/help` `/info` `/code` `/ping` `/regles` `/langage` `/departements` `/equipe` `/recrutement` `/avatar` `/userinfo` `/serverinfo`',inline:false},{name:'🛡️ Modération',value:'`/warn` `/warnings` `/clearwarns` `/kick` `/ban` `/unban` `/timeout` `/clear` `/lock` `/unlock` `/slowmode`',inline:false},{name:'⚙️ Administration',value:'`/roles` `/say` `/embed` `/annonce` `/giveaway`',inline:false})] });
});
addCmd(new SlashCommandBuilder().setName('info').setDescription('Informations sur le serveur'), async i => {
  i.reply({ embeds: [baseEmbed().setTitle('🚨 Urgence 514 RP').setDescription('Serveur roleplay Roblox immersif basé sur l\'île de Montréal.').addFields({name:'Code Roblox',value:'`urgrp`',inline:true},{name:'Fondation',value:'2026',inline:true},{name:'Site web',value:'[jacobin904.github.io/Urgence-514-RP](https://jacobin904.github.io/Urgence-514-RP/)',inline:false},{name:'Discord',value:'[discord.gg/ENgnZ629k6](https://discord.gg/ENgnZ629k6)',inline:true}).setThumbnail(LOGO)] });
});
addCmd(new SlashCommandBuilder().setName('code').setDescription('Affiche le code Roblox'), async i => { i.reply({ embeds: [baseEmbed().setTitle('🎮 Code Roblox').setDescription('Entre ce code dans Roblox :\n# `urgrp`')] }); });
addCmd(new SlashCommandBuilder().setName('ping').setDescription('Latence du bot'), async i => { const t = Date.now(); await i.reply('🏓 Ping...'); i.editReply(`🏓 Pong ! Latence : **${Date.now() - t}ms** • API : **${Math.round(client.ws.ping)}ms**`); });

// ✅ CORRECTION : addChoices avec un tableau d'objets pour éviter tout bug de sérialisation
addCmd(new SlashCommandBuilder().setName('regles').addStringOption(option => 
  option.setName('type').setDescription('Quel règlement ?').setRequired(true).addChoices(
    { name: 'Discord', value: 'discord' },
    { name: 'Roblox', value: 'roblox' }
  )
), async i => {
  const data = i.options.getString('type') === 'discord' ? RULES_DISCORD : RULES_ROBLOX;
  const e = baseEmbed().setTitle(i.options.getString('type') === 'discord' ? '📜 Règlement Discord' : '🎮 Règlement Roblox');
  data.forEach(([t, d]) => e.addFields({ name: t, value: d, inline: false }));
  i.reply({ embeds: [e] });
});

addCmd(new SlashCommandBuilder().setName('langage').addStringOption(option => 
  option.setName('terme').setDescription('Terme à chercher (optionnel)')
), async i => {
  const terme = i.options.getString('terme');
  if (terme) { const found = LANGAGE.find(([t]) => t.toLowerCase().includes(terme.toLowerCase())); if (found) return i.reply({ embeds: [baseEmbed().setTitle('🗣️ Langage RP').addFields({ name: found[0], value: found[1], inline: false })] }); return i.reply({ content: 'Terme introuvable.', ephemeral: true }); }
  const e = baseEmbed().setTitle('🗣️ Dictionnaire RP'); LANGAGE.forEach(([t, d]) => e.addFields({ name: t, value: d, inline: false })); i.reply({ embeds: [e] });
});

addCmd(new SlashCommandBuilder().setName('departements').setDescription('Liste des départements'), async i => { const e = baseEmbed().setTitle('🚔 Départements'); DEPARTEMENTS.forEach(([n, d]) => e.addFields({ name: n, value: d, inline: false })); i.reply({ embeds: [e] }); });
addCmd(new SlashCommandBuilder().setName('equipe').setDescription("L'équipe du serveur"), async i => { i.reply({ embeds: [baseEmbed().setTitle('👥 Équipe').addFields({name:'👑 Fondateur',value:'𝐌𝟒𝐗𝐋𝐄𝐂𝐇𝐎𝐂𝐎𝐋𝐀𝐓.𝐐𝐂 (@maxlechocolat.qc)',inline:false},{name:'👑 Fondateur Adjoint',value:'L. K TV (@l.ktv)',inline:false},{name:'💼 Manager',value:'!Bibibopm (@bibibopm_84423)',inline:false},{name:'💻 Développeur Web',value:'Jacobin Babouain (@jacobin904)',inline:false})] }); });
addCmd(new SlashCommandBuilder().setName('recrutement').setDescription('Infos recrutement staff'), async i => { i.reply({ embeds: [baseEmbed().setTitle('⭐ Recrutement Staff').setDescription('**Conditions :**\n• Être sur PC\n• 14 ans et +\n• 7 jours sur le serveur\n• Moins de 10 sanctions\n\n⚠️ Demander des nouvelles = refus automatique.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Postuler').setStyle(ButtonStyle.Link).setURL('https://jacobin904.github.io/Urgence-514-RP/Recrutement/'))] }); });
addCmd(new SlashCommandBuilder().setName('avatar').addUserOption(option => option.setName('utilisateur').setDescription('Utilisateur (optionnel)')), async i => { const u = i.options.getUser('utilisateur') || i.user; i.reply({ embeds: [baseEmbed().setTitle(`Avatar de ${u.username}`).setImage(u.displayAvatarURL({ size: 512 }))] }); });
addCmd(new SlashCommandBuilder().setName('userinfo').addUserOption(option => option.setName('utilisateur').setDescription('Utilisateur (optionnel)')), async i => { const u = i.options.getUser('utilisateur') || i.user; const m = await i.guild.members.fetch(u.id).catch(() => null); i.reply({ embeds: [baseEmbed().setTitle(`👤 ${u.username}`).addFields({name:'ID',value:u.id,inline:true},{name:'Bot ?',value:u.bot?'Oui':'Non',inline:true},{name:'Compte créé',value:`<t:${Math.floor(u.createdTimestamp/1000)}:R>`,inline:false},{name:'A rejoint',value:m?`<t:${Math.floor(m.joinedTimestamp/1000)}:R>`:'?',inline:false},{name:'Rôles',value:m&&m.roles.cache.size>1?m.roles.cache.filter(r=>r.id!==i.guild.id).map(r=>r.toString()).join(' '):'Aucun',inline:false}).setThumbnail(u.displayAvatarURL({ size: 256 }))] }); });
addCmd(new SlashCommandBuilder().setName('serverinfo').setDescription('Infos du serveur'), async i => { const g = i.guild; i.reply({ embeds: [baseEmbed().setTitle(`🏙️ ${g.name}`).addFields({name:'Membres',value:`${g.memberCount}`,inline:true},{name:'Salons',value:`${g.channels.cache.size}`,inline:true},{name:'Rôles',value:`${g.roles.cache.size}`,inline:true},{name:'Créé',value:`<t:${Math.floor(g.createdTimestamp/1000)}:R>`,inline:false}).setThumbnail(g.iconURL({ size: 512 }))] }); });

// --- MODÉRATION ---
addCmd(new SlashCommandBuilder().setName('warn').addUserOption(option => option.setName('utilisateur').setRequired(true)).addStringOption(option => option.setName('raison').setRequired(true)), async i => {
  if (!isStaff(i)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true });
  const target = i.options.getUser('utilisateur'); const reason = i.options.getString('raison');
  const { list } = await ghRead(); list.warnings[target.id] = list.warnings[target.id] || [];
  list.warnings[target.id].push({ by: i.user.username, reason, date: new Date().toISOString() });
  await ghWrite(list);
  i.reply({ embeds: [baseEmbed().setTitle('⚠️ Avertissement').addFields({name:'Utilisateur',value:`<@${target.id}>`,inline:true},{name:'Raison',value:reason,inline:true},{name:'Total',value:`${list.warnings[target.id].length}`,inline:true})] });
  target.send(`⚠️ Tu as reçu un avertissement sur Urgence 514 RP :\n**Raison :** ${reason}\n**Par :** ${i.user.username}`).catch(() => {});
});
addCmd(new SlashCommandBuilder().setName('warnings').addUserOption(option => option.setName('utilisateur').setRequired(true)), async i => {
  const target = i.options.getUser('utilisateur'); const { list } = await ghRead(); const w = list.warnings[target.id] || [];
  if (!w.length) return i.reply({ content: `✅ ${target.username} n'a aucun avertissement.`, ephemeral: true });
  const e = baseEmbed().setTitle(`⚠️ Avertissements de ${target.username}`); w.slice(-10).forEach((x, idx) => e.addFields({ name: `#${idx + 1} — ${x.reason}`, value: `Par ${x.by}`, inline: false }));
  i.reply({ embeds: [e] });
});
addCmd(new SlashCommandBuilder().setName('clearwarns').addUserOption(option => option.setName('utilisateur').setRequired(true)), async i => {
  if (!isSuperAdmin(i.user.id) && !i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.reply({ content: '❌ Admin requis.', ephemeral: true });
  const target = i.options.getUser('utilisateur'); const { list } = await ghRead(); delete list.warnings[target.id]; await ghWrite(list);
  i.reply({ content: `✅ Avertissements de ${target.username} effacés.` });
});
addCmd(new SlashCommandBuilder().setName('kick').addUserOption(option => option.setName('utilisateur').setRequired(true)).addStringOption(option => option.setName('raison').setRequired(true)), async i => {
  if (!i.member.permissions.has(PermissionFlagsBits.KickMembers)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true });
  const m = await i.guild.members.fetch(i.options.getUser('utilisateur').id).catch(() => null);
  if (!m) return i.reply({ content: 'Membre introuvable.', ephemeral: true });
  await m.kick(i.options.getString('raison')); i.reply({ embeds: [baseEmbed().setTitle('👢 Kick').setDescription(`${m.user.username} a été kick. Raison : ${i.options.getString('raison')}`)] });
});
addCmd(new SlashCommandBuilder().setName('ban').addUserOption(option => option.setName('utilisateur').setRequired(true)).addStringOption(option => option.setName('raison').setRequired(true)), async i => {
  if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true });
  const u = i.options.getUser('utilisateur'); await i.guild.members.ban(u, { reason: i.options.getString('raison') });
  i.reply({ embeds: [baseEmbed().setTitle('🔨 Ban').setDescription(`${u.username} a été banni. Raison : ${i.options.getString('raison')}`)] });
});
addCmd(new SlashCommandBuilder().setName('unban').addStringOption(option => option.setName('id').setRequired(true)), async i => {
  if (!i.member.permissions.has(PermissionFlagsBits.BanMembers)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true });
  await i.guild.members.unban(i.options.getString('id')); i.reply({ content: '✅ Utilisateur débanni.' });
});
addCmd(new SlashCommandBuilder().setName('timeout').addUserOption(option => option.setName('utilisateur').setRequired(true)).addStringOption(option => option.setName('duree').setRequired(true).setDescription('Ex: 10m, 1h, 1d')).addStringOption(option => option.setName('raison').setRequired(true)), async i => {
  if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true });
  const ms = parseDuration(i.options.getString('duree')); if (!ms) return i.reply({ content: 'Durée invalide.', ephemeral: true });
  const m = await i.guild.members.fetch(i.options.getUser('utilisateur').id).catch(() => null); if (!m) return i.reply({ content: 'Membre introuvable.', ephemeral: true });
  await m.timeout(ms, i.options.getString('raison')); i.reply({ embeds: [baseEmbed().setTitle('⏱️ Timeout').setDescription(`${m.user.username} mis en sourdine pendant ${i.options.getString('duree')}.`)] });
});
addCmd(new SlashCommandBuilder().setName('clear').addIntegerOption(option => option.setName('nombre').setRequired(true).setMinValue(1).setMaxValue(100)), async i => {
  if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true });
  const n = i.options.getInteger('nombre'); await i.channel.bulkDelete(n, true);
  i.reply({ content: `🗑️ ${n} message(s) supprimés.` }).then(r => setTimeout(() => r.delete().catch(() => {}), 3000));
});
addCmd(new SlashCommandBuilder().setName('lock').setDescription('Verrouille le salon'), async i => { if (!isStaff(i)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true }); await i.channel.permissionOverwrites.edit(i.guild.id, { SendMessages: false }); i.reply({ content: '🔒 Salon verrouillé.' }); });
addCmd(new SlashCommandBuilder().setName('unlock').setDescription('Déverrouille le salon'), async i => { if (!isStaff(i)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true }); await i.channel.permissionOverwrites.edit(i.guild.id, { SendMessages: true }); i.reply({ content: '🔓 Salon déverrouillé.' }); });
addCmd(new SlashCommandBuilder().setName('slowmode').addIntegerOption(option => option.setName('secondes').setRequired(true).setMinValue(0).setMaxValue(21600)), async i => { if (!isStaff(i)) return i.reply({ content: '❌ Permission insuffisante.', ephemeral: true }); await i.channel.setRateLimitPerUser(i.options.getInteger('secondes')); i.reply({ content: `🐢 Slowmode : ${i.options.getInteger('secondes')}s.` }); });

// --- ADMIN ---
addCmd(new SlashCommandBuilder().setName('roles').setDescription('Crée le panel des rôles de notification'), async i => {
  if (!isStaff(i)) return i.reply({ content: '❌ Staff requis.', ephemeral: true });
  const names = ['Spoiler', 'Nouveautés', 'Évènements & Giveaways', 'Live']; const emojis = ['👀', '⭐', '🎊', '🔴']; const buttons = [];
  for (let x = 0; x < names.length; x++) {
    let role = i.guild.roles.cache.find(r => r.name === names[x]); if (!role) role = await i.guild.roles.create({ name: names[x], color: COLOR, reason: 'Rôle notification' });
    buttons.push(new ButtonBuilder().setCustomId('notif:' + names[x]).setLabel(emojis[x] + ' ' + names[x]).setStyle(ButtonStyle.Secondary));
  }
  await i.channel.send({ embeds: [baseEmbed().setTitle('🔔 Notifications').setDescription('Clique sur les boutons pour activer/désactiver tes notifications.')], components: [new ActionRowBuilder().addComponents(buttons)] });
  i.reply({ content: '✅ Panel envoyé.', ephemeral: true });
});
addCmd(new SlashCommandBuilder().setName('say').addStringOption(option => option.setName('message').setRequired(true)), async i => { if (!isStaff(i)) return i.reply({ content: '❌ Staff requis.', ephemeral: true }); await i.channel.send(i.options.getString('message')); i.reply({ content: '✅ Envoyé.', ephemeral: true }); });
addCmd(new SlashCommandBuilder().setName('embed').addStringOption(option => option.setName('titre').setRequired(true)).addStringOption(option => option.setName('description').setRequired(true)).addStringOption(option => option.setName('couleur').setDescription('Hex sans # (ex: 0B5BD7)')), async i => {
  if (!isStaff(i)) return i.reply({ content: '❌ Staff requis.', ephemeral: true });
  let color = COLOR; const hex = i.options.getString('couleur'); if (hex) color = parseInt(hex, 16) || COLOR;
  await i.channel.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(i.options.getString('titre')).setDescription(i.options.getString('description')).setFooter({ text: 'Urgence 514 RP • Développé par Jacobin904', iconURL: LOGO }).setTimestamp()] });
  i.reply({ content: '✅ Embed envoyé.', ephemeral: true });
});
addCmd(new SlashCommandBuilder().setName('annonce').addStringOption(option => option.setName('message').setRequired(true)), async i => { if (!isStaff(i)) return i.reply({ content: '❌ Staff requis.', ephemeral: true }); await i.channel.send({ embeds: [baseEmbed().setTitle('📢 Annonce').setDescription(i.options.getString('message'))] }); i.reply({ content: '✅ Annonce publiée.', ephemeral: true }); });
addCmd(new SlashCommandBuilder().setName('giveaway').addStringOption(option => option.setName('duree').setRequired(true).setDescription('Ex: 10m, 1h, 1d')).addStringOption(option => option.setName('prix').setRequired(true)), async i => {
  if (!isStaff(i)) return i.reply({ content: '❌ Staff requis.', ephemeral: true });
  const ms = parseDuration(i.options.getString('duree')); if (!ms) return i.reply({ content: 'Durée invalide.', ephemeral: true });
  const prize = i.options.getString('prix'); const id = Date.now().toString();
  const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gw:' + id).setLabel('🎉 Participer').setStyle(ButtonStyle.Primary));
  const msg = await i.channel.send({ embeds: [baseEmbed().setTitle('🎉 GIVEAWAY').setDescription(`**Prix :** ${prize}\n**Fin :** <t:${Math.floor((Date.now() + ms) / 1000)}:R>\nClique sur le bouton pour participer !`)], components: [btn] });
  giveaways.set(id, { participants: new Set(), prize, channelId: i.channel.id, messageId: msg.id });
  setTimeout(() => endGiveaway(id), ms); i.reply({ content: '✅ Giveaway lancé.', ephemeral: true });
});
async function endGiveaway(id) {
  const gw = giveaways.get(id); if (!gw) return; giveaways.delete(id);
  const ch = await client.channels.fetch(gw.channelId).catch(() => null); if (!ch) return;
  const msg = await ch.messages.fetch(gw.messageId).catch(() => null); const parts = [...gw.participants];
  if (!parts.length) return ch.send({ content: `🎉 Giveaway **${gw.prize}** terminé : aucun participant.` });
  const winner = parts[Math.floor(Math.random() * parts.length)];
  await ch.send({ content: `🎉 **Félicitations <@${winner}>** qui remporte **${gw.prize}** !` });
  if (msg) await msg.edit({ embeds: [baseEmbed().setTitle('🎉 GIVEAWAY TERMINÉ').setDescription(`**Prix :** ${gw.prize}\n**Gagnant :** <@${winner}>`)], components: [] }).catch(() => {});
}

// ===== INTERACTIONS =====
client.on('interactionCreate', async i => {
  if (i.isButton()) {
    try {
      if (i.customId.startsWith('notif:')) {
        const name = i.customId.slice(6); let role = i.guild.roles.cache.find(r => r.name === name);
        if (!role) role = await i.guild.roles.create({ name, color: COLOR });
        if (i.member.roles.cache.has(role.id)) { await i.member.roles.remove(role); await i.reply({ content: `🔕 Rôle **${name}** retiré.`, ephemeral: true }); }
        else { await i.member.roles.add(role); await i.reply({ content: `🔔 Rôle **${name}** ajouté.`, ephemeral: true }); }
      } else if (i.customId.startsWith('gw:')) {
        const gw = giveaways.get(i.customId.slice(3)); if (!gw) return i.reply({ content: '⏰ Giveaway terminé.', ephemeral: true });
        if (gw.participants.has(i.user.id)) { gw.participants.delete(i.user.id); await i.reply({ content: 'Participation annulée.', ephemeral: true }); }
        else { gw.participants.add(i.user.id); await i.reply({ content: '🎉 Participation enregistrée !', ephemeral: true }); }
      }
    } catch (e) { console.error(e); } return;
  }
  if (!i.isCommand()) return; const cmd = commands.get(i.commandName); if (!cmd) return;
  try { await cmd.run(i); } catch (e) { console.error(e); if (!i.replied && !i.deferred) await i.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {}); }
});

// ===== START & ENREGISTREMENT DES COMMANDES =====
client.once('clientReady', async () => {
  console.log('✅ Bot en ligne : ' + client.user.tag);
  client.user.setPresence({ status: 'online', activities: [{ name: 'urgrp • ER:LC', type: ActivityType.Watching }] });
  
  try {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    // On s'assure que tout est bien une string et sérialisable
    const cmdsJSON = [...commands.values()].map(c => c.builder.toJSON());
    
    console.log('📤 Enregistrement des commandes sur Discord...');
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: cmdsJSON });
    console.log(`✅ ${commands.size} commandes enregistrées avec succès sur Discord.`);
  } catch (e) { 
    console.error('❌ Erreur critique lors de l\'enregistrement des commandes:', e.message);
    console.error('Détails:', e);
  }
});

if (BOT_TOKEN) {
  client.login(BOT_TOKEN).catch(e => console.error('❌ Erreur de connexion du bot:', e.message));
} else {
  console.warn('⚠️ BOT_TOKEN manquant dans les variables d\'environnement.');
}

module.exports = client;
