import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's response time")
    .addBooleanOption((option) =>
      option
        .setName("include_latency")
        .setDescription("Include API latency information")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const includeLatency =
      interaction.options.getBoolean("include_latency") ?? false;

    const sent = await interaction.reply({
      content: "Pinging...",
      fetchReply: true,
    });
    const roundtripLatency =
      sent.createdTimestamp - interaction.createdTimestamp;

    let responseContent = `Pong! Roundtrip latency: ${roundtripLatency}ms.`;

    if (includeLatency && interaction.client.ws.ping !== -1) {
      responseContent += ` WebSocket heartbeat: ${Math.round(
        interaction.client.ws.ping
      )}ms.`;
    }

    await interaction.editReply(responseContent);
  },
};

export default pingCommand;
