const {
  Client,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

const ticketDMs = new Map();
const pendingApplications = new Map(); // channelId -> { applicantId, supporterId }

client.once("ready", () => {
  console.log(`✅ Bot ist online als ${client.user.tag}`);
});

async function ensureRole(guild, roleName, color) {
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: color,
      reason: `Rolle ${roleName} für Ticket System`,
    });
  }
  return role;
}

client.on("interactionCreate", async (interaction) => {

  // ------------------- Slash Commands -------------------
  if (interaction.isChatInputCommand()) {

    // ---- /hello ----
    if (interaction.commandName === "hello") {
      const modal = new ModalBuilder()
        .setCustomId("helloModal")
        .setTitle("Hallo Formular");

      const nameInput = new TextInputBuilder()
        .setCustomId("nameInput")
        .setLabel("Wie ist dein Name?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("Gib deinen Namen ein");

      const messageInput = new TextInputBuilder()
        .setCustomId("messageInput")
        .setLabel("Deine Nachricht")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder("Schreibe eine Nachricht...");

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(messageInput)
      );

      await interaction.showModal(modal);
    }

    // ---- /ticket setup ----
    if (interaction.commandName === "ticket" && interaction.options.getSubcommand() === "setup") {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      let ticketChannel = guild.channels.cache.find(ch => ch.name === "📜ticket-support");

      if (!ticketChannel) {
        ticketChannel = await guild.channels.create({
          name: "📜ticket-support",
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: guild.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            },
          ],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket & Bewerbungs System")
        .setDescription("Wähle eine Option:")
        .setColor(0x5865F2);

      const supportButton = new ButtonBuilder()
        .setCustomId("createTicket")
        .setLabel("Support Ticket erstellen")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎫");

      const applicationButton = new ButtonBuilder()
        .setCustomId("openApplicationModal")
        .setLabel("Bewerbe dich als Teammitglied")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📝");

      const row = new ActionRowBuilder().addComponents(supportButton, applicationButton);

      await ticketChannel.send({ embeds: [embed], components: [row] });

      await interaction.editReply({
        content: `✅ Ticket-System wurde in ${ticketChannel} eingerichtet!`,
      });
    }

    // ---- /bmessage ----
    if (interaction.commandName === "bmessage") {
      const messageText = interaction.options.getString("message");
      const channel = interaction.options.getChannel("channel");

      if (!channel) return interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true });

      await channel.send({ content: messageText });
      await interaction.reply({ content: `✅ Nachricht wurde an ${channel} gesendet.`, ephemeral: true });
    }

    // ---- /regeln ----
    if (interaction.commandName === "regeln") {
      await interaction.deferReply({ ephemeral: true });

      const rulesChannel = interaction.guild.channels.cache.find(ch => ch.name.toLowerCase().includes("regeln"));
      if (!rulesChannel) return interaction.editReply({ content: "❌ Kein #regeln Kanal gefunden." });

      const rulesMessage = `
**Allgemeine Verhaltensregeln**
🛡️ Sei höflich und respektvoll gegenüber allen Spielern.
🌍 Keine Diskriminierung, Spam oder toxisches Verhalten.
⚖️ Folge den Anweisungen des Teams.
      `;

      await rulesChannel.send(rulesMessage);
      await interaction.editReply({ content: `✅ Regeln wurden in ${rulesChannel} gepostet!` });
    }

    // ---- Bewerbungs Slash Commands (Accept / Decline in privatem Channel) ----
    if (interaction.commandName === "accept" || interaction.commandName === "decline") {
      const data = pendingApplications.get(interaction.channel.id);
      if (!data) return interaction.reply({ content: "❌ Dieser Channel ist kein Bewerbungsgespräch.", ephemeral: true });
      if (data.supporterId !== interaction.user.id) return interaction.reply({ content: "❌ Nur der Supporter kann diese Bewerbung abschließen.", ephemeral: true });

      const applicant = await interaction.guild.members.fetch(data.applicantId);
      const applicationsChannel = interaction.guild.channels.cache.find(ch => ch.name === "bewerbungen");

      if (interaction.commandName === "accept") {
        const role = interaction.guild.roles.cache.find(r => r.name === "Teammitglied");
        if (role) await applicant.roles.add(role);
        if (applicationsChannel) await applicationsChannel.send(`✅ <@${data.applicantId}> wurde erfolgreich als Teammitglied angenommen!`);
        await applicant.send("✅ Herzlichen Glückwunsch! Du wurdest als Teammitglied angenommen.");
        await interaction.reply({ content: "Bewerbung akzeptiert und Rolle vergeben!", ephemeral: true });
      } else {
        if (applicationsChannel) await applicationsChannel.send(`❌ Bewerbung von <@${data.applicantId}> wurde abgelehnt.`);
        await applicant.send("❌ Deine Bewerbung wurde leider abgelehnt.");
        await interaction.reply({ content: "Bewerbung abgelehnt!", ephemeral: true });
      }

      await interaction.channel.delete().catch(() => null);
      pendingApplications.delete(interaction.channel.id);
    }
  }

  // ------------------- Button Interaction -------------------
  if (interaction.isButton()) {
    const { customId } = interaction;

    // ---- Ticket Buttons ----
    if (customId === "createTicket") {
      const modal = new ModalBuilder()
        .setCustomId("ticketModal")
        .setTitle("Support Ticket erstellen");

      const minecraftInput = new TextInputBuilder()
        .setCustomId("minecraftUsername")
        .setLabel("Minecraft Username")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId("ticketReason")
        .setLabel("Warum willst du ein Ticket erstellen?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(minecraftInput),
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
    }

    // ---- Öffnet das Bewerbungs-Modal (vorher: openApplicationModal) ----
    if (customId === "openApplicationModal") {
      const modal = new ModalBuilder()
        .setCustomId("applicationModal")
        .setTitle("Teammitglied Bewerbung");

      const positionInput = new TextInputBuilder()
        .setCustomId("position")
        .setLabel("Als was willst du dich bewerben?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const whyInput = new TextInputBuilder()
        .setCustomId("why")
        .setLabel("Warum willst du dich bewerben?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const timeInput = new TextInputBuilder()
        .setCustomId("onlineTime")
        .setLabel("Wie lange kannst du online sein pro Tag?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(positionInput),
        new ActionRowBuilder().addComponents(whyInput),
        new ActionRowBuilder().addComponents(timeInput)
      );

      await interaction.showModal(modal);
    }

    // ---- Accept/Decline Buttons (in #bewerbungen) ----
    if (customId.startsWith("accept_") || customId.startsWith("decline_")) {
      const parts = customId.split("_");
      const action = parts[0]; // "accept" or "decline"
      const applicantId = parts[1];
      const guild = interaction.guild;

      // fetch member safely
      let applicantMember;
      try {
        applicantMember = await guild.members.fetch(applicantId);
      } catch {
        applicantMember = null;
      }

      if (action === "accept") {
        // Erstelle privaten Channel für Bewerbungsgespräch (nur Bewerber + der klickende Supporter)
        const channel = await guild.channels.create({
          name: `bewerbung-${applicantMember ? applicantMember.user.username : applicantId}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: applicantId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ],
        });

        // store pending application
        pendingApplications.set(channel.id, { applicantId, supporterId: interaction.user.id });

        // send starter message with a button to cancel/close (optional)
        const starterEmbed = new EmbedBuilder()
          .setTitle("Bewerbungsgespräch")
          .setDescription(`Dies ist ein privater Kanal zwischen <@${applicantId}> und <@${interaction.user.id}>. Nutzt /accept oder /decline um die Bewerbung abzuschließen.`)
          .setColor(0x00ff00);

        const cancelRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`cancel_bewerbung_${channel.id}`)
            .setLabel("Bewerbung zurückziehen / Channel löschen")
            .setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ content: `<@${applicantId}> <@${interaction.user.id}>`, embeds: [starterEmbed], components: [cancelRow] });

        // update original message to show accepted and disable buttons
        await interaction.update({ content: `Bewerbung von <@${applicantId}> angenommen. Channel erstellt: ${channel}`, components: [] });
      } else {
        // decline flow: post in bewerbungen channel and DM
        const applicationsChannel = guild.channels.cache.find(ch => ch.name === "bewerbungen");
        if (applicationsChannel) await applicationsChannel.send(`❌ Bewerbung von <@${applicantId}> wurde abgelehnt.`);
        if (applicantMember) {
          try { await applicantMember.send("❌ Deine Bewerbung wurde leider abgelehnt."); } catch {}
        }
        await interaction.update({ content: `Bewerbung von <@${applicantId}> abgelehnt.`, components: [] });
      }
    }

    // ---- Ticket close button ----
    if (customId.startsWith("closeTicket_")) {
      const channelId = customId.split("_")[1];
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: "❌ Ticket-Kanal nicht gefunden!", ephemeral: true });

      await channel.delete().catch(() => null);
      await interaction.reply({ content: "✅ Ticket wurde geschlossen.", ephemeral: true });
    }

    // ---- cancel Bewerbungs-Channel button (falls Bewerber zurückziehen) ----
    if (customId.startsWith("cancel_bewerbung_")) {
      const channelId = customId.split("cancel_bewerbung_")[1];
      const channel = interaction.guild.channels.cache.get(channelId);
      if (channel) await channel.delete().catch(() => null);
      await interaction.update({ content: "Bewerbungsgespräch wurde beendet und der Channel gelöscht.", components: [] });
    }
  }

  // ------------------- Modal Submit -------------------
  if (interaction.isModalSubmit()) {
    const { customId } = interaction;

    if (customId === "helloModal") {
      const name = interaction.fields.getTextInputValue("nameInput");
      const message = interaction.fields.getTextInputValue("messageInput");
      await interaction.reply({ content: `👋 Hallo **${name}**!\n📝 Deine Nachricht:\n${message}`, ephemeral: true });
    }

    if (customId === "ticketModal") {
      const minecraftUsername = interaction.fields.getTextInputValue("minecraftUsername");
      const reason = interaction.fields.getTextInputValue("ticketReason");

      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle("🎫 Neues Ticket")
        .setDescription(`**Minecraft Username:** ${minecraftUsername}\n**Grund:** ${reason}`)
        .setColor(0x00ff00);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`closeTicket_${channel.id}`)
          .setLabel("Ticket schließen")
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
      await interaction.reply({ content: `✅ Dein Ticket wurde erstellt: ${channel}`, ephemeral: true });
      ticketDMs.set(channel.id, { userId: interaction.user.id, channelId: channel.id });
    }

    // ---- application modal submit: send embed to #bewerbungen with accept/decline buttons ----
    if (customId === "applicationModal") {
      const position = interaction.fields.getTextInputValue("position");
      const why = interaction.fields.getTextInputValue("why");
      const onlineTime = interaction.fields.getTextInputValue("onlineTime");

      const guild = interaction.guild;
      let applicationChannel = guild.channels.cache.find(ch => ch.name === "bewerbungen");

      if (!applicationChannel) {
        applicationChannel = await guild.channels.create({
          name: "bewerbungen",
          type: ChannelType.GuildText,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📝 Neue Bewerbung")
        .setDescription(
          `**Von:** <@${interaction.user.id}>\n**Position:** ${position}\n**Begründung:** ${why}\n**Onlinezeit:** ${onlineTime}`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_${interaction.user.id}`)
          .setLabel("✅ Annehmen")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`decline_${interaction.user.id}`)
          .setLabel("❌ Ablehnen")
          .setStyle(ButtonStyle.Danger)
      );

      await applicationChannel.send({ embeds: [embed], components: [buttons] });
      await interaction.reply({ content: "✅ Deine Bewerbung wurde in #bewerbungen gepostet!", ephemeral: true });
    }
  }
});

// ----- Slash Commands Registrieren -----
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName("hello").setDescription("Öffnet ein Formular zum Ausfüllen"),
    new SlashCommandBuilder()
      .setName("ticket")
      .setDescription("Ticket System verwalten")
      .addSubcommand(subcommand => subcommand.setName("setup").setDescription("Richtet das Ticket-System ein")),
    new SlashCommandBuilder()
      .setName("bmessage")
      .setDescription("Lass den Bot eine Nachricht senden")
      .addChannelOption(option => option.setName("channel").setDescription("Wähle den Kanal").setRequired(true))
      .addStringOption(option => option.setName("message").setDescription("Gib die Nachricht ein").setRequired(true)),
    new SlashCommandBuilder().setName("regeln").setDescription("Postet die Regeln im Kanal #regeln"),
    new SlashCommandBuilder().setName("accept").setDescription("Bewerbung akzeptieren"),
    new SlashCommandBuilder().setName("decline").setDescription("Bewerbung ablehnen"),
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    console.log("🔄 Registriere Slash Commands...");
    await rest.put(Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID), { body: commands });
    console.log("✅ Slash Commands erfolgreich registriert!");
  } catch (error) {
    console.error("❌ Fehler beim Registrieren der Commands:", error);
  }
}

// ----- Login -----
client.login(process.env.DISCORD_BOT_TOKEN).then(registerCommands);
