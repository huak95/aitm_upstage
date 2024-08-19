import { SlashCommandBuilder } from "@discordjs/builders";
import { getVoiceConnection } from "@discordjs/voice";
import type { ChatInputCommandInteraction } from "discord.js";

export const leaveAndStopRecordCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Leave the voice channel and stop recording"),
  async execute(interaction: ChatInputCommandInteraction) {
    const connection = getVoiceConnection(interaction.guild!.id);
    if (connection) {
      connection.destroy();
      await interaction.reply("Recording stopped.");
    } else {
      await interaction.reply("Not currently recording.");
    }
  },
};

export default leaveAndStopRecordCommand;
