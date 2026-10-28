/**
 * Registers the bot's slash commands (defined in src/commands.js).
 *
 * Set GUILD_ID in .env to register for one server (appears instantly, best for your support server).
 * Leave it blank to register globally (can take an hour to roll out).
 * This replaces the whole command list, so renamed or removed commands disappear.
 */
import { REST, Routes } from 'discord.js'
import { config } from '../src/config.js'
import { COMMANDS } from '../src/commands.js'

const { token, applicationId, guildId } = config

const route = guildId
  ? Routes.applicationGuildCommands(applicationId, guildId)
  : Routes.applicationCommands(applicationId)

await new REST({ version: '10' }).setToken(token).put(route, { body: COMMANDS })
console.log(`registered ${COMMANDS.map((c) => '/' + c.name).join(', ')} ` +
  (guildId ? `in guild ${guildId}` : 'globally'))
