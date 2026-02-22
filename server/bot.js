import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { unlockDoor } from "./controller.js";
import { getAllowedRoles, logAccess } from "./database.js";

let bot;

const userLastUnlock = new Map();
const RATE_LIMIT_MS = 10000;

const checkRateLimit = userId => {
	const lastUnlock = userLastUnlock.get(userId);
	if (!lastUnlock) return { allowed: true };

	const timeSince = Date.now() - lastUnlock;
	if (timeSince < RATE_LIMIT_MS) {
		const waitTime = Math.ceil((RATE_LIMIT_MS - timeSince) / 1000);
		return {
			allowed: false,
			waitTime,
			message: `Please wait ${waitTime} seconds before unlocking again`
		};
	}

	return { allowed: true };
};

export const initBot = async () => {
	const token = process.env.DISCORD_BOT_TOKEN;

	if (!token) {
		console.warn("Discord bot token not provided, bot will not start");
		return;
	}

	bot = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
	});

	bot.on("clientReady", async () => {
		console.log(`Discord bot logged in as ${bot.user.tag}`);

		// Update old door messages to new embed format
		await updateOldDoorMessages();
	});

	bot.on("interactionCreate", async interaction => {
		if (interaction.isCommand()) {
			await handleCommand(interaction);
		} else if (interaction.isButton()) {
			await handleButton(interaction);
		}
	});

	await bot.login(token);

	// Register slash commands
	await registerCommands();
};

const updateOldDoorMessages = async () => {
	if (!bot) return;

	console.log("Checking for old door messages to update...");

	for (const guild of bot.guilds.cache.values()) {
		try {
			const channels = guild.channels.cache.filter(ch => ch.isTextBased() && ch.permissionsFor(bot.user).has(PermissionFlagsBits.ViewChannel));

			for (const channel of channels.values()) {
				try {
					const messages = await channel.messages.fetch({ limit: 50 });
					const doorMessages = messages.filter(m => m.author.id === bot.user.id && m.components.length > 0 && m.components[0].components.some(c => c.customId === "unlock_door"));

					for (const msg of doorMessages.values()) {
						// Check if already using embed format
						if (msg.embeds.length > 0 && msg.embeds[0].title === "🔐 EC029 Door Access") {
							console.log(`Door message in ${channel.name} already updated`);
							continue;
						}

						// Update to new embed format
						const embed = new EmbedBuilder()
							.setColor("#5865F2")
							.setTitle("🔐 EC029 Door Access")
							.setDescription("Click the button below to unlock the door.")
							.addFields({ name: "⏱️ Duration", value: "8 seconds", inline: true }, { name: "🔒 Security", value: "Role-based access", inline: true })
							.setFooter({ text: "Requires appropriate permissions" })
							.setTimestamp();

						const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("unlock_door").setLabel("🚪 Unlock EC029 Door").setStyle(ButtonStyle.Primary));

						await msg.edit({
							content: null,
							embeds: [embed],
							components: [row]
						});

						console.log(`Updated door message in ${channel.name} (${guild.name})`);
					}
				} catch (error) {
					// Skip channels we can't access
					continue;
				}
			}
		} catch (error) {
			console.error(`Error updating messages in guild ${guild.name}:`, error.message);
		}
	}

	console.log("Finished updating old door messages");
};

export const getBot = () => {
	return bot;
};

const registerCommands = async () => {
	if (!bot) return;

	const commands = [
		{
			name: "setup-door",
			description: "Create a door unlock button in this channel"
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
};

const handleCommand = async interaction => {
	if (interaction.commandName === "setup-door") {
		const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("unlock_door").setLabel("🚪 Unlock Door").setStyle(ButtonStyle.Primary));

		// Delete previous messages in the channel (keep only the button)
		try {
			const messages = await interaction.channel.messages.fetch({ limit: 10 });
			const botMessages = messages.filter(m => m.author.id === bot.user.id);
			await interaction.channel.bulkDelete(botMessages);
		} catch (error) {
			console.warn("Could not clean up old messages:", error);
		}

		const embed = new EmbedBuilder()
			.setColor("#5865F2")
			.setTitle("🔐 EC029 Door Access")
			.setDescription("Click the button below to unlock the door.")
			.addFields({ name: "⏱️ Duration", value: "8 seconds", inline: true }, { name: "🔒 Security", value: "Role-based access", inline: true })
			.setFooter({ text: "Requires appropriate permissions" })
			.setTimestamp();

		await interaction.reply({
			embeds: [embed],
			components: [row]
		});
	}
};

const handleButton = async interaction => {
	if (interaction.customId === "unlock_door") {
		await interaction.deferReply({ ephemeral: true });

		try {
			// Check rate limit
			const rateLimit = checkRateLimit(interaction.user.id);
			if (!rateLimit.allowed) {
				const rateLimitEmbed = new EmbedBuilder()
					.setColor("#FEE75C")
					.setTitle("⏱️ Rate Limit")
					.setDescription("You're trying to unlock too frequently.")
					.addFields({ name: "⏳ Wait Time", value: `${rateLimit.waitTime} seconds`, inline: true })
					.setFooter({ text: "Please wait before trying again" })
					.setTimestamp();

				return await interaction.editReply({
					embeds: [rateLimitEmbed]
				});
			}

			// Check if user has access
			const hasAccess = await checkUserAccess(interaction.user.id, interaction.guild.id);

			if (!hasAccess) {
				const errorEmbed = new EmbedBuilder()
					.setColor("#ED4245")
					.setTitle("❌ Access Denied")
					.setDescription("You do not have permission to unlock the door.")
					.addFields({ name: "💡 Need Access?", value: "Contact an administrator to get the required role." })
					.setTimestamp();

				return await interaction.editReply({
					embeds: [errorEmbed]
				});
			}

			// Attempt to unlock the door
			const result = await unlockDoor({
				userId: interaction.user.id,
				source: "discord"
			});

			if (!result.success) {
				const busyEmbed = new EmbedBuilder()
					.setColor("#FEE75C")
					.setTitle("🔄 Door Busy")
					.setDescription(result.message || "The door is currently being unlocked.")
					.setTimestamp();

				return await interaction.editReply({
					embeds: [busyEmbed]
				});
			}

			// Update rate limit tracker
			userLastUnlock.set(interaction.user.id, Date.now());

			// Log the access
			logAccess(interaction.user.id, interaction.user.username, "discord");

			// 開門時立即回應
			const openedEmbed = new EmbedBuilder()
				.setColor("#57F287")
				.setTitle("🔓 門已開啟")
				.setDescription("門已成功開啟！")
				.addFields({ name: "👤 開門者", value: interaction.user.username, inline: true })
				.setTimestamp();

			await interaction.editReply({ embeds: [openedEmbed] });

			// 關門後編輯訊息
			result.whenClosed
				.then(async () => {
					const closedEmbed = new EmbedBuilder()
						.setColor("#5865F2")
						.setTitle("🔒 門已關閉")
						.setDescription("門剛才有開過，現在已關閉。")
						.addFields({ name: "👤 開門者", value: interaction.user.username, inline: true })
						.setTimestamp();

					await interaction.editReply({ embeds: [closedEmbed] });
				})
				.catch(err => {
					console.error("[Bot] Failed to edit reply after door closed:", err.message);
				});
		} catch (error) {
			console.error("Error handling unlock button:", error);

			const errorEmbed = new EmbedBuilder()
				.setColor("#ED4245")
				.setTitle("❌ Error")
				.setDescription("An error occurred while unlocking the door.")
				.addFields({ name: "🔧 Troubleshooting", value: "Please try again or contact support if the issue persists." })
				.setTimestamp();

			await interaction.editReply({
				embeds: [errorEmbed]
			});
		}
	}
};

export const checkUserAccess = async (userId, guildId = null) => {
	if (!bot) return false;

	const allowedRoles = getAllowedRoles();

	if (guildId) {
		// Check specific guild
		const guild = bot.guilds.cache.get(guildId);
		if (!guild) return false;

		try {
			const member = await guild.members.fetch(userId);
			const guildAllowedRoles = allowedRoles.filter(r => r.guild_id === guildId);

			return guildAllowedRoles.some(allowedRole => member.roles.cache.has(allowedRole.role_id));
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

				const hasRole = guildAllowedRoles.some(allowedRole => member.roles.cache.has(allowedRole.role_id));

				if (hasRole) return true;
			} catch (error) {
				// User not in this guild, continue
				console.log(`User ${userId} not found in guild ${guild.name} (${guild.id})`);
				continue;
			}
		}
		return false;
	}
};

export default { initBot, getBot, checkUserAccess };
