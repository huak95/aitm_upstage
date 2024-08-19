import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";

import { promises as fs } from "fs";
import path from "path";

import PDFDocument from "pdfkit";

export const summaryCommand = {
  data: new SlashCommandBuilder()
    .setName("summary")
    .setDescription("Get a summary of a session")
    .addStringOption((option) =>
      option
        .setName("session_id")
        .setDescription("The session id of the session to get the summary for")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("user_name")
        .setDescription("The user name to get the summary for")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("as_pdf")
        .setDescription("Return the summary as a PDF file")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const sessionId = interaction.options.getString("session_id");
    const userName = interaction.options.getString("user_name");
    const asPdf = interaction.options.getBoolean("as_pdf") || false;

    await interaction.followUp(
      `Getting summary for session ${sessionId}${
        userName ? ` and user ${userName}` : ""
      }${asPdf ? " as PDF" : ""}`
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

      let summaryText: string;

      if (userName) {
        const userSummary = session.output.users_summary[userName];
        if (!userSummary) {
          await interaction.followUp(
            `No summary found for user "${userName}".`
          );
          return;
        }
        summaryText = userSummary;
      } else {
        summaryText = session.output.summary;
      }

      if (asPdf) {
        const pdfBuffer = await this.generatePdf(summaryText);
        const attachment = new AttachmentBuilder(pdfBuffer, {
          name: `summary_${sessionId}.pdf`,
        });
        await interaction.followUp({ files: [attachment] });
      } else {
        const chunks = this.splitText(summaryText, 2000);
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

    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxLength) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      currentChunk += sentence + " ";
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

export default summaryCommand;
