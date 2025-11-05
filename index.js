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

  // ----- Slash Commands -----
  if (interaction.isChatInputCommand()) {

    // /hello
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

    // /ticket setup
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
        .setCustomId("createApplication")
        .setLabel("Bewerbe dich als Teammitglied")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📝");

      const row = new ActionRowBuilder().addComponents(supportButton, applicationButton);

      await ticketChannel.send({ embeds: [embed], components: [row] });

      await interaction.editReply({
        content: `✅ Ticket-System wurde in ${ticketChannel} eingerichtet!`,
      });
    }

    // /bmessage
    if (interaction.commandName === "bmessage") {
      const messageText = interaction.options.getString("message");
      const channel = interaction.options.getChannel("channel");

      if (!channel) return interaction.reply({ content: "❌ Kanal nicht gefunden.", ephemeral: true });

      await channel.send({ content: messageText });
      await interaction.reply({ content: `✅ Nachricht wurde an ${channel} gesendet.`, ephemeral: true });
    }

    // /regeln
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
  }

  // ----- Button Interaction -----
  if (interaction.isButton()) {
    const id = interaction.customId;

    // Ticket erstellen
    if (id === "createTicket") {
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

    // Bewerbung erstellen
    if (id === "createApplication") {
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

    // Ticket schließen
    if (id.startsWith("closeTicket_")) {
      const channelId = id.split("_")[1];
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: "❌ Ticket-Kanal nicht gefunden!", ephemeral: true });

      await channel.delete().catch(() => null);
      await interaction.reply({ content: "✅ Ticket wurde geschlossen.", ephemeral: true });
    }
  }

  // ----- Modal Submit -----
  if (interaction.isModalSubmit()) {
    const id = interaction.customId;

    if (id === "helloModal") {
      const name = interaction.fields.getTextInputValue("nameInput");
      const message = interaction.fields.getTextInputValue("messageInput");
      await interaction.reply({ content: `👋 Hallo **${name}**!\n📝 Deine Nachricht:\n${message}`, ephemeral: true });
    }

    if (id === "ticketModal") {
      const minecraftUsername = interaction.fields.getTextInputValue("minecraftUsername");
      const reason = interaction.fields.getTextInputValue("ticketReason");

      const guild = interaction.guild;
      const channel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
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

    // --- Bewerbungsmodal mit Buttons ---
    if (id === "applicationModal") {
      const position = interaction.fields.getTextInputValue("position");
      const why = interaction.fields.getTextInputValue("why");
      const onlineTime = interaction.fields.getTextInputValue("onlineTime");

      const guild = interaction.guild;
      let applicationChannel = guild.channels.cache.find(ch => ch.name === "📋bewerbungen");

      if (!applicationChannel) {
        applicationChannel = await guild.channels.create({
          name: "📋bewerbungen",
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

      // Buttons hinzufügen
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("accept_application")
          .setLabel("✅ Annehmen")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("reject_application")
          .setLabel("❌ Ablehnen")
          .setStyle(ButtonStyle.Danger)
      );

      const message = await applicationChannel.send({ embeds: [embed], components: [buttons] });
      await interaction.reply({ content: "✅ Deine Bewerbung wurde erfolgreich abgeschickt!", ephemeral: true });

      const collector = message.createMessageComponentCollector({ time: 0 });
      collector.on("collect", async (buttonInteraction) => {
        if (buttonInteraction.user.bot) return;
        const applicant = interaction.user;

        if (buttonInteraction.customId === "accept_application") {
          await applicant.send(`✅ Deine Bewerbung für **${position}** wurde akzeptiert!`);
          await buttonInteraction.update({ content: "Bewerbung akzeptiert ✅", components: [] });
        }

        if (buttonInteraction.customId === "reject_application") {
          await applicant.send(`❌ Deine Bewerbung für **${position}** wurde leider abgelehnt.`);
          await buttonInteraction.update({ content: "Bewerbung abgelehnt ❌", components: [] });
        }
      });
    }
  }
});

// ----- Register Commands -----
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
      .addChannelOption(option =>
        option.setName("channel").setDescription("Wähle den Kanal").setRequired(true)
      )
      .addStringOption(option =>
        option.setName("message").setDescription("Gib die Nachricht ein").setRequired(true)
      ),
    new SlashCommandBuilder().setName("regeln").setDescription("Postet die Regeln im Kanal #regeln"),
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
client.login(process.env.DISCORD_BOT_TOKEN)
  .then(() => registerCommands())
  .catch(error => {
    console.error("❌ Login fehlgeschlagen:", error);
    process.exit(1);
  });

