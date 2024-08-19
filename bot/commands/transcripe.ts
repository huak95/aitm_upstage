import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, AttachmentBuilder } from "discord.js";
import { promises as fs } from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export const transcriptCommand = {
  data: new SlashCommandBuilder()
    .setName("transcript")
    .setDescription("Get the transcript of a session")
    .addStringOption((option) =>
      option
        .setName("session_id")
        .setDescription(
          "The session id of the session to get the transcript for"
        )
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("as_pdf")
        .setDescription("Return the transcript as a PDF file")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const sessionId = interaction.options.getString("session_id");
    const asPdf = interaction.options.getBoolean("as_pdf") || false;

    await interaction.followUp(
      `Getting transcript for session ${sessionId}${asPdf ? " as PDF" : ""}`
    );

    try {
      const sessionPath = path.join(
        __dirname,
        "..",
        "sessions",
        `${sessionId}.json`
      );
      const sessionData = await fs.readFile(sessionPath, "utf-8");
      const session = JSON.parse(sessionData);

      const transcriptText = session.output.transcript;

      if (!transcriptText) {
        await interaction.followUp("No transcript found for this session.");
        return;
      }

      if (asPdf) {
        const pdfBuffer = await this.generatePdf(transcriptText);
        const attachment = new AttachmentBuilder(pdfBuffer, {
          name: `transcript_${sessionId}.pdf`,
        });
        await interaction.followUp({ files: [attachment] });
      } else {
        const chunks = this.splitText(transcriptText, 2000);
        for (const chunk of chunks) {
          await interaction.followUp(chunk);
        }
      }
    } catch (error) {
      console.error("Error processing session:", error);
      await interaction.followUp(
        "An error occurred while processing the session. Please try again later."
      );
    }
  },

  splitText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";

    const lines = text.split("\n");

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      currentChunk += line + "\n";
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  },

  generatePdf(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: Uint8Array[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(12).text(text, 50, 50);
      doc.end();
    });
  },
};

export default transcriptCommand;
