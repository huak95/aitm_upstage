import {
  REST,
  Routes,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const { DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_TOKEN } = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_GUILD_ID || !DISCORD_TOKEN) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const commandsPath = join(__dirname, "commands");

async function getCommands(): Promise<
  RESTPostAPIApplicationCommandsJSONBody[]
> {
  const commandFiles = (await readdir(commandsPath)).filter((file) =>
    file.endsWith(".ts")
  );
  const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const commandModule = await import(filePath);
    const command = commandModule.default;
    if (command && "data" in command && "execute" in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }

  return commands;
}

async function deployCommands() {
  try {
    console.log("Started refreshing application (/) commands.");

    const commands = await getCommands();
    const rest = new REST().setToken(DISCORD_TOKEN as string);

    const data = (await rest.put(
      Routes.applicationGuildCommands(
        DISCORD_CLIENT_ID as string,
        DISCORD_GUILD_ID as string
      ),
      { body: commands }
    )) as RESTPostAPIApplicationCommandsJSONBody[];

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`
    );
  } catch (error) {
    console.error("Error deploying commands:", error);
  }
}

deployCommands();
