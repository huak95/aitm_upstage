import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { Database } from "bun:sqlite";

declare module "discord.js" {
  export interface Client {
    commands: Collection<any, any>;
  }
}

const commandDir = join(__dirname, "commands");

const commandFiles = (await readdir(commandDir)).filter((file) =>
  file.endsWith(".ts")
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

for (const file of commandFiles) {
  const filePath = join(commandDir, file);
  const commandModule = await import(filePath);
  const command = commandModule.default; // Use .default to get the default export

  if (command && "data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(
      `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
    );
  }
}

console.log(`
  _   _       _____ _                   
 | | | |_ __ / ____| |                  
 | | | | '_ \\\\\\\___ \\\\| |_ __ _  __ _  ___ 
 | |_| | |_) |___) | __/ _\` |/ _\` |/ _ \\\\
  \\___/| .__/|____/ \\\\__\\\\__,_|\\\\__,_|\\\\___/
       | |                               
       |_|       

 🤖 Bot Startup Sequence Initiated 🚀
`);

// Initialize the database
console.log("Initializing database...");
const db = new Database("mydb.sqlite", { create: true });
console.log("Database initialized.");

// Listen for the 'ready' event, which fires when the bot is ready
client.once(Events.ClientReady, (readyClient) => {
  // ASCII art frame
  console.log(`
 ┌───────────────────────────────────────┐
               🎉 BOT READY 🎉            
 ├───────────────────────────────────────┤
  Logged in as: ${readyClient.user?.tag} 
  ID: ${readyClient.user?.id}           
 └───────────────────────────────────────┘
 `);
});

// Handle any errors that might occur during the process
client.on("error", (error) => {
  console.error("An error occurred:", error);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.client.commands.get(interaction.commandName);

  console.log(`Received command: ${interaction.commandName}`);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
});

// Start the bot
client.login(process.env.DISCORD_TOKEN);
