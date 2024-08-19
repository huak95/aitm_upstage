import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  GuildMember,
  CommandInteraction,
  VoiceChannel,
} from "discord.js";

import {
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";

import ffmpeg from "fluent-ffmpeg";
import { pipeline, Readable, Writable } from "node:stream";
import { createWriteStream, createReadStream } from "node:fs";
import { ulid } from "ulid";
import { unlink, rename, writeFile } from "fs/promises";
import streamToBlob from "stream-to-blob";

import prism from "prism-media";

export const recordCommand = {
  data: new SlashCommandBuilder()
    .setName("record")
    .setDescription("Record a voice channel"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const connection = await this.joinVoiceChannelAndReply(interaction);
    if (connection) {
      await interaction.followUp("Recording started.");
      await this.setupRecording(connection, interaction);
    }
  },

  async joinVoiceChannelAndReply(
    interaction: CommandInteraction
  ): Promise<VoiceConnection | null> {
    if (!(interaction.member instanceof GuildMember)) {
      await interaction.followUp("This command can only be used in a server.");
      return null;
    }

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel || !(voiceChannel instanceof VoiceChannel)) {
      await interaction.followUp(
        "You need to be in a voice channel to use this command."
      );
      return null;
    }

    if (!voiceChannel.joinable) {
      await interaction.followUp(
        "I don't have permission to join your voice channel."
      );
      return null;
    }

    try {
      let connection = getVoiceConnection(interaction.guild!.id);

      if (connection) {
        if (connection.joinConfig.channelId === voiceChannel.id) {
          await interaction.followUp("I'm already in your voice channel.");
          return connection;
        } else {
          connection.destroy();
        }
      }

      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        selfDeaf: false,
        selfMute: true,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      await interaction.followUp(
        `Joined the voice channel: ${voiceChannel.name}`
      );
      return connection;
    } catch (error) {
      console.error("Error joining voice channel:", error);
      await interaction.followUp(
        "There was an error joining the voice channel. Please try again later."
      );
      return null;
    }
  },

  async setupRecording(
    connection: VoiceConnection,
    interaction: CommandInteraction
  ): Promise<void> {
    let isRecording = false;
    let outputStream: NodeJS.WritableStream | null = null;
    let sessionId = ulid();
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      console.log("Successfully joined voice channel and is ready");
    } catch (error) {
      console.error("Failed to join voice channel:", error);
      await interaction.followUp(
        "Failed to join the voice channel. Please try again."
      );
      return;
    }
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log("The connection has been disconnected.");
      isRecording = false;
      await this.stopRecording(
        interaction,
        isRecording,
        outputStream,
        sessionId
      );
    });

    connection.on(VoiceConnectionStatus.Destroyed, async () => {
      console.log("The connection has been destroyed.");
      isRecording = false;
      await this.stopRecording(
        interaction,
        isRecording,
        outputStream,
        sessionId
      );
    });

    // Add function to start recording
    await this.startRecording(
      connection,
      interaction,
      isRecording,
      outputStream
    );
  },

  async startRecording(
    connection: VoiceConnection,
    interaction: CommandInteraction,
    isRecording: boolean,
    outputStream: NodeJS.WritableStream | null
  ): Promise<void> {
    if (isRecording) {
      await interaction.followUp("Recording is already in progress.");
      return;
    }

    isRecording = true;

    const receiver = connection.receiver;

    // Create a write stream for raw PCM data
    outputStream = createWriteStream("recording.pcm", {
      highWaterMark: 1024 * 1024,
    });

    receiver.speaking.on("start", (userId) => {
      console.log(`User ${userId} started speaking`);

      try {
        const audioStream = receiver.subscribe(userId, {
          end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 1000,
          },
        });

        const opusDecoder = new prism.opus.Decoder({
          rate: 48000,
          channels: 2,
          frameSize: 960,
        });

        audioStream.pipe(opusDecoder).pipe(outputStream!, { end: false });

        audioStream.on("error", (error) => {
          console.error(`Error in audio stream for user ${userId}:`, error);
        });

        opusDecoder.on("error", (error) => {
          console.error(`Error in Opus decoder for user ${userId}:`, error);
        });

        audioStream.on("end", () => {
          console.log(`User ${userId} stopped speaking`);
        });
      } catch (error) {
        console.error(
          `Error setting up audio stream for user ${userId}:`,
          error
        );
      }
    });

    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    await interaction.followUp(
      "Recording started. Use the stop command to end the recording."
    );
  },

  async stopRecording(
    interaction: CommandInteraction,
    isRecording: boolean,
    outputStream: NodeJS.WritableStream | null,
    sessionId: string
  ): Promise<void> {
    if (!isRecording) {
      await interaction.followUp("No recording is in progress.");
      return;
    }

    isRecording = false;

    if (outputStream) {
      outputStream.end();
      outputStream = null;
    }

    await interaction.followUp("Recording stopped. Processing audio...");

    try {
      // Convert PCM to MP3 using FFmpeg-fluent
      await new Promise<void>((resolve, reject) => {
        ffmpeg("recording.pcm")
          .inputOptions(["-f s16le", "-ar 48000", "-ac 2"])
          .audioCodec("libmp3lame")
          .toFormat("mp3")
          .on("error", (err) => {
            console.error("An error occurred: " + err.message);
            reject(err);
          })
          .on("end", () => {
            console.log("Processing finished successfully");
            resolve();
          })
          .save(`recordings/${sessionId}.mp3`);
      });

      // Remove the temporary PCM file
      await unlink("recording.pcm");

      // call our transcribe function
      const url = "http://localhost:8000/transcribe/";
      const formData = new FormData();

      const fileBlob = await streamToBlob(createReadStream(`${sessionId}.mp3`));
      formData.append("file", fileBlob, `${sessionId}.mp3`);

      const response = await fetch(`${url}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const transcriptionResult = await response.json();
      console.log("Transcription result:", transcriptionResult);

      // Call the LLM endpoint
      const llmUrl = "http://localhost:4000/llm";
      const llmResponse = await fetch(llmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: transcriptionResult.transcript }),
      });

      if (!llmResponse.ok) {
        throw new Error(`HTTP error! status: ${llmResponse.status}`);
      }

      const llmResult = await llmResponse.json();

      await writeFile(
        `sessions/${sessionId}.json`,
        JSON.stringify(llmResult, null, 2)
      );

      await interaction.followUp(
        `Audio processing complete. You session id is ${sessionId}`
      );
    } catch (error) {
      console.error("Error processing recording:", error);
      await interaction.followUp(
        "An error occurred while processing the recording. Please check the logs."
      );
    }
  },
};

export default recordCommand;
