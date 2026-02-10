import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { getAllowedRoles } from './database.js';
import { unlockDoor } from './controller.js';
import { logAccess } from './database.js';

let bot;

export async function initBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  
  if (!token) {
    console.warn('Discord bot token not provided, bot will not start');
    return;
  }

  bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ]
  });

  bot.on('clientReady', () => {
    console.log(`Discord bot logged in as ${bot.user.tag}`);
  });

  bot.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    }
  });

  await bot.login(token);

  // Register slash commands
  await registerCommands();
}

export function getBot() {
  return bot;
}

async function registerCommands() {
  if (!bot) return;

  const commands = [
    {
      name: 'setup-door',
      description: 'Create a door unlock button in this channel',
      default_member_permissions: PermissionFlagsBits.Administrator.toString()
    }
  ];

  for (const guild of bot.guilds.cache.values()) {
    try {
      await guild.commands.set(commands);
      console.log(`Registered commands for guild: ${guild.name}`);
    } catch (error) {
      console.error(`Failed to register commands for guild ${guild.name}:`, error);
    }
  }
}

async function handleCommand(interaction) {
  if (interaction.commandName === 'setup-door') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('unlock_door')
          .setLabel('🚪 Unlock Door')
          .setStyle(ButtonStyle.Primary)
      );

    // Delete previous messages in the channel (keep only the button)
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const botMessages = messages.filter(m => m.author.id === bot.user.id);
      await interaction.channel.bulkDelete(botMessages);
    } catch (error) {
      console.warn('Could not clean up old messages:', error);
    }

    await interaction.reply({
      content: '🔐 **EC029 Door Access**\n\nClick the button below to unlock the door. You need appropriate permissions to use this.',
      components: [row]
    });
  }
}

async function handleButton(interaction) {
  if (interaction.customId === 'unlock_door') {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Check if user has access
      const hasAccess = await checkUserAccess(interaction.user.id, interaction.guild.id);

      if (!hasAccess) {
        return await interaction.editReply({
          content: '❌ You do not have permission to unlock the door.',
        });
      }

      // Unlock the door
      const result = await unlockDoor();

      // Log the access
      logAccess(
        interaction.user.id,
        interaction.user.username,
        'discord'
      );

      await interaction.editReply({
        content: `✅ Door unlocked! It will automatically lock again in ${(result.duration || 8000) / 1000} seconds.`,
      });

    } catch (error) {
      console.error('Error handling unlock button:', error);
      await interaction.editReply({
        content: '❌ An error occurred while unlocking the door.',
      });
    }
  }
}

export async function checkUserAccess(userId, guildId = null) {
  if (!bot) return false;

  const allowedRoles = getAllowedRoles();

  if (guildId) {
    // Check specific guild
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return false;

    try {
      const member = await guild.members.fetch(userId);
      const guildAllowedRoles = allowedRoles.filter(r => r.guild_id === guildId);
      
      return guildAllowedRoles.some(allowedRole => 
        member.roles.cache.has(allowedRole.role_id)
      );
    } catch (error) {
      console.error(`Error checking user access in guild ${guildId}:`, error.message);
      return false;
    }
  } else {
    // Check all guilds
    for (const guild of bot.guilds.cache.values()) {
      try {
        const member = await guild.members.fetch(userId);
        const guildAllowedRoles = allowedRoles.filter(r => r.guild_id === guild.id);
        
        const hasRole = guildAllowedRoles.some(allowedRole => 
          member.roles.cache.has(allowedRole.role_id)
        );

        if (hasRole) return true;
      } catch (error) {
        // User not in this guild, continue
        console.log(`User ${userId} not found in guild ${guild.name} (${guild.id})`);
        continue;
      }
    }
    return false;
  }
}

export default { initBot, getBot, checkUserAccess };
