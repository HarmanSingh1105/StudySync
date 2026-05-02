require('dotenv').config();
const { Client, IntentsBitField, EmbedBuilder, PermissionsBitField, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { initDatabase, addReminder, getUserReminders, deleteReminder, addTask, getUserTasks, removeTask, completeTask, clearAllTasks, addDeadline, getUserDeadlines, getUpcomingDeadlines, updateDeadline, removeDeadline, clearAllDeadlines, createGroup, getGroupByName, getGroupById, listGroupsByGuild, deleteGroup, addTaskDependency, getTaskDependencies, hasCyclicDependencies } = require('./database');
const { parseReminderTime } = require('./reminder-parser');
const { startReminderLoop } = require('./reminder-loop');
const { parseDeadlineDate } = require('./deadline-parser');
const { startDeadlineReminderLoop } = require('./deadline-reminders');

// Initialize database
initDatabase();

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ],

});

client.on('clientReady', (c) => {
    console.log(`${c.user.tag} is online!`);
    // Start the reminder check loop
    startReminderLoop(c);
    // Start the deadline reminder check loop
    startDeadlineReminderLoop(c);
});

// Error handler for Discord.js client
client.on('error', error => {
    console.error('❌ Discord Client Error:', error);
});

client.on('messageCreate', async(message) => {
    if (message.author.bot) {
        return;
    }

    try {
        if (message.content === 'hello') {
            message.reply('Hello, how can I help you?');
        }

        if (message.content === '!create-channel') {
            try {
                const channel = await message.guild.channels.create({
                    name: 'new-text-channel',
                    type: ChannelType.GuildText,
                    reason: 'Bot created this channel'
                });
                message.reply(`Successfully created channel: ${channel.name}`);
            } catch (error) {
                console.error('Error creating channel:', error);
                message.reply('There was an error creating the channel.');
            }
        }
    } catch (error) {
        console.error('Error in message handler:', error);
    }
});

    // Builder function — returns embed and rows without sending anything
async function buildGroupPage(interaction, groupsWithRoles, page) {
    const pageSize = 4;
    const totalPages = Math.ceil(groupsWithRoles.length / pageSize);
    const pageGroups = groupsWithRoles.slice(page * pageSize, (page + 1) * pageSize);

    const joinedCount = groupsWithRoles.filter(g => g.hasJoined).length;
    const notJoinedCount = groupsWithRoles.filter(g => !g.hasJoined).length;

    const rows = pageGroups.map(group => {
        const nameLabel = new ButtonBuilder()
            .setCustomId(`group_label_${group.id}`)
            .setLabel(group.name)
            .setStyle(group.hasJoined ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(group.hasJoined ? '✅' : '📖')
            .setDisabled(true);

        const row = new ActionRowBuilder().addComponents(nameLabel);

        if (!group.hasJoined) {
            const joinButton = new ButtonBuilder()
                .setCustomId(`listall_join_${group.id}_page_${page}`)
                .setLabel('Join')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Primary);
            row.addComponents(joinButton);
        }

        return row;
    });

    // Navigation row
    const prevButton = new ButtonBuilder()
        .setCustomId(`listall_page_${page - 1}`)
        .setLabel('Previous')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

    const pageCounter = new ButtonBuilder()
        .setCustomId('page_counter')
        .setLabel(`Page ${page + 1} of ${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    const nextButton = new ButtonBuilder()
        .setCustomId(`listall_page_${page + 1}`)
        .setLabel('Next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1);

    rows.push(new ActionRowBuilder().addComponents(prevButton, pageCounter, nextButton));

    const embed = new EmbedBuilder()
        .setTitle('📚 Study Groups')
        .setColor(0x5865F2)
        .setDescription(
            `Welcome to the study groups directory for **${interaction.guild.name}**!\n` +
            `Browse and join groups below.\n\u200B`
        )
        .addFields(
            { name: '📊 Total Groups', value: `\`\`\`${groupsWithRoles.length}\`\`\``, inline: true },
            { name: '✅ Joined', value: `\`\`\`${joinedCount}\`\`\``, inline: true },
            { name: '📖 Not Joined', value: `\`\`\`${notJoinedCount}\`\`\``, inline: true },
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({
            text: `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, groupsWithRoles.length)} of ${groupsWithRoles.length} groups · Use /creategroup to create a new group`,
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

    return { embeds: [embed], components: rows };
}

// Helper to fetch groupsWithRoles from SQLite
async function fetchGroupsWithRoles(interaction) {
    const groups = listGroupsByGuild(interaction.guild.id);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return await Promise.all(
        groups.map(async group => {
            const role = await interaction.guild.roles.fetch(group.role_id).catch(() => null);
            const hasJoined = role ? member.roles.cache.has(role.id) : false;
            return { ...group, role, hasJoined };
        })
    );
}

// Helper function to safely reply to interactions
async function safeReply(interaction, content) {
    try {
        // Check if we can use editReply (after defer)
        if (interaction.deferred) {
            await interaction.editReply(content);
        } else if (!interaction.replied) {
            await interaction.reply(content);
        } else {
            // Already replied, use followUp
            await interaction.followUp(content);
        }
    } catch (error) {
        console.error('Error sending reply:', error.message);
        // Fallback: try followUp if editReply/reply failed
        try {
            await interaction.followUp(content);
        } catch (e) {
            console.error('Fallback followUp also failed:', e.message);
        }
    }
}

client.on('interactionCreate', async (interaction) => {
    // Only attempt to defer for actual slash commands
    if (interaction.isChatInputCommand()) {
        try {
            // Silent attempt - if it fails, safeReply will handle it
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply();
            }
        } catch (error) {
            // Silently fail - the interaction is in an unexpected state
            // safeReply will handle sending the response
        }
    }

    try {
        if (interaction.commandName === 'add') {
            const num1 = interaction.options.get('first-number').value;
            const num2 = interaction.options.get('second-number').value;

            await safeReply(interaction, `The sum of ${num1} and ${num2} is ${num1 + num2}`);
        }
        
        // Study remind command
        if (interaction.commandName === 'studyremind') {
        const title = interaction.options.getString('title');
        const reminderTime = interaction.options.getString('reminder_time');
        const notes = interaction.options.getString('notes');

        // Parse the time
        const result = parseReminderTime(reminderTime);

        if (result.error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Time Format')
                .setDescription(result.error)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed] });
            return;
        }

        try {
            const now = new Date().toISOString();
            const reminderId = addReminder(
                interaction.user.id,
                interaction.guildId,
                interaction.channelId,
                title,
                notes,
                now,
                result.dueTime.toISOString()
            );

            const embed = new EmbedBuilder()
                .setTitle('✅ Reminder Set!')
                .setColor(0x00ff00)
                .addFields(
                    { name: '📚 Study Topic', value: title },
                    { name: '🕐 When', value: result.description }
                );

            if (notes) {
                embed.addFields({ name: '📝 Notes', value: notes });
            }

            embed.addFields({ name: 'Reminder ID', value: `\`${reminderId}\`` });
            embed.setFooter({ text: "You'll receive a DM when it's time! (or a channel message if DMs are disabled)" });

            await safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to create reminder: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed] });
        }
    }


    // My reminders command
    if (interaction.commandName === 'myreminders') {
        try {
            const reminders = getUserReminders(interaction.user.id);

            if (reminders.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📚 Your Reminders')
                    .setDescription('You have no pending reminders!')
                    .setColor(0x0099ff);
                await safeReply(interaction, { embeds: [embed] });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📚 Your Pending Reminders')
                .setColor(0x0099ff);

            for (const { id, title, notes, due_at: dueAt } of reminders) {
                const date = new Date(dueAt);
                const formattedTime = date.toLocaleString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit',
                    meridiem: 'short'
                });
                let fieldValue = `**When:** ${formattedTime}\n**ID:** \`${id}\``;
                if (notes) {
                    fieldValue += `\n**Notes:** ${notes}`;
                }
                embed.addFields({ name: title, value: fieldValue });
            }

            embed.setFooter({ text: 'Use /cancelreminder to delete one.' });

            await safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to fetch reminders: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed] });
        }
    }

    // Cancel reminder command
    if (interaction.commandName === 'cancelreminder') {
        try {
            const reminderId = interaction.options.getInteger('reminder_id');
            const success = deleteReminder(reminderId, interaction.user.id);

            if (success) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Reminder Cancelled')
                    .setDescription(`Reminder \`${reminderId}\` has been deleted.`)
                    .setColor(0x00ff00);
                await safeReply(interaction, { embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Not Found')
                    .setDescription(`Reminder \`${reminderId}\` not found or doesn't belong to you.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed] });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to cancel reminder: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed] });
        }
    }

    // Create group command
    if (interaction.commandName === 'creategroup') {
        if (!interaction.inGuild() || !interaction.guild) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Server Only Command')
                .setDescription('`/creategroup` can only be used inside a server.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const groupName = interaction.options.getString('name')?.trim();
        if (!groupName) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Group Name')
                .setDescription('Please provide a non-empty group name.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Bot State Error')
                .setDescription('Could not verify bot permissions in this server.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const hasManageRoles = botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);
        const hasManageChannels = botMember.permissions.has(PermissionsBitField.Flags.ManageChannels);
        if (!hasManageRoles || !hasManageChannels) {
            const missing = [];
            if (!hasManageRoles) missing.push('Manage Roles');
            if (!hasManageChannels) missing.push('Manage Channels');

            const embed = new EmbedBuilder()
                .setTitle('❌ Missing Bot Permissions')
                .setDescription(`I need these permissions to create a group: **${missing.join(', ')}**.`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        try {
            const existingGroup = getGroupByName(interaction.guild.id, groupName);
            if (existingGroup) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Group Already Exists')
                    .setDescription(`A group named **${groupName}** already exists in this server.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            const safeChannelSuffix = groupName
                .toLowerCase()
                .replace(/[^a-z0-9 -]/g, '')
                .replace(/\s+/g, '-')
                .slice(0, 80);
            const channelName = `group-${safeChannelSuffix || 'study-group'}`;

            let createdRole = null;
            let createdChannel = null;

            try {
                createdRole = await interaction.guild.roles.create({
                    name: groupName,
                    reason: `Study group created by ${interaction.user.tag}`,
                });

                createdChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    reason: `Private study group channel for ${groupName}`,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone.id,
                            deny: [PermissionsBitField.Flags.ViewChannel],
                        },
                        {
                            id: createdRole.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                        },
                    ],
                });

                createGroup(
                    interaction.guild.id,
                    groupName,
                    createdRole.id,
                    createdChannel.id,
                    interaction.user.id
                );
            } catch (error) {
                if (createdChannel) {
                    try {
                        await createdChannel.delete('Rolling back failed group creation');
                    } catch (_) {}
                }
                if (createdRole) {
                    try {
                        await createdRole.delete('Rolling back failed group creation');
                    } catch (_) {}
                }
                throw error;
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Group Created')
                .setColor(0x00ff00)
                .setDescription(`Created **${groupName}** successfully.`)
                .addFields(
                    { name: 'Role', value: `<@&${createdRole.id}>`, inline: true },
                    { name: 'Channel', value: `<#${createdChannel.id}>`, inline: true }
                );

            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to create group: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    // Join group command
    if (interaction.commandName === 'joingroup') {
        if (!interaction.inGuild() || !interaction.guild) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Server Only Command')
                .setDescription('`/joingroup` can only be used inside a server.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const groupName = interaction.options.getString('name')?.trim();
        if (!groupName) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Group Name')
                .setDescription('Please provide a non-empty group name.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Missing Bot Permissions')
                .setDescription('I need **Manage Roles** permission to add you to a group.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        try {
            const groups = listGroupsByGuild(interaction.guild.id);
            if (groups.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Group Does Not Exist')
                    .setDescription('No groups exist in this server yet. Create one with `/creategroup` first.')
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            const targetGroup = getGroupByName(interaction.guild.id, groupName);
            if (!targetGroup) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Group Does Not Exist')
                    .setDescription(`Group **${groupName}** does not exist.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            const role = await interaction.guild.roles.fetch(targetGroup.role_id);
            if (!role) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Group Configuration Error')
                    .setDescription('This group is missing its role. Ask an admin to recreate the group.')
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (member.roles.cache.has(role.id)) {
                const embed = new EmbedBuilder()
                    .setTitle('ℹ️ Already In Group')
                    .setDescription(`You are already a member of **${targetGroup.name}**.`)
                    .setColor(0x0099ff);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            await member.roles.add(role, `Joined group ${targetGroup.name}`);

            const embed = new EmbedBuilder()
                .setTitle('✅ Joined Group')
                .setDescription(`You joined **${targetGroup.name}** successfully.`)
                .addFields({ name: 'Group Role', value: `<@&${role.id}>` })
                .setColor(0x00ff00);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to join group: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    // Delete group command
    if (interaction.commandName === 'deletegroup') {
        if (!interaction.inGuild() || !interaction.guild) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Server Only Command')
                .setDescription('`/deletegroup` can only be used inside a server.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const groupName = interaction.options.getString('name')?.trim();
        if (!groupName) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Group Name')
                .setDescription('Please provide a non-empty group name.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) || !botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Missing Bot Permissions')
                .setDescription('I need **Manage Roles** and **Manage Channels** permissions to delete a group.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        try {
            const targetGroup = getGroupByName(interaction.guild.id, groupName);
            if (!targetGroup) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Group Does Not Exist')
                    .setDescription(`Group **${groupName}** does not exist.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            // Check if user is the owner
            if (targetGroup.owner_user_id !== interaction.user.id) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Permission Denied')
                    .setDescription('Only the group owner can delete this group.')
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            // Delete the role
            const role = await interaction.guild.roles.fetch(targetGroup.role_id).catch(() => null);
            if (role) {
                await role.delete('Group deleted');
            }

            // Delete the channel
            const channel = await interaction.guild.channels.fetch(targetGroup.channel_id).catch(() => null);
            if (channel) {
                await channel.delete('Group deleted');
            }

            // Delete from database
            deleteGroup(targetGroup.id, interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('✅ Group Deleted')
                .setDescription(`Group **${targetGroup.name}** has been deleted along with its role and channel.`)
                .setColor(0x00ff00);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to delete group: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    // Leave group command
    if (interaction.commandName === 'leavegroup') {
        if (!interaction.inGuild() || !interaction.guild) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Server Only Command')
                .setDescription('`/leavegroup` can only be used inside a server.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const groupName = interaction.options.getString('name')?.trim();
        if (!groupName) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Group Name')
                .setDescription('Please provide a non-empty group name.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Missing Bot Permissions')
                .setDescription('I need **Manage Roles** permission to remove you from a group.')
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }

        try {
            const targetGroup = getGroupByName(interaction.guild.id, groupName);
            if (!targetGroup) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Group Does Not Exist')
                    .setDescription(`Group **${groupName}** does not exist.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            const role = await interaction.guild.roles.fetch(targetGroup.role_id).catch(() => null);
            if (!role) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Group Configuration Error')
                    .setDescription('This group is missing its role. Ask an admin to recreate the group.')
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(role.id)) {
                const embed = new EmbedBuilder()
                    .setTitle('ℹ️ Not In Group')
                    .setDescription(`You are not a member of **${targetGroup.name}**.`)
                    .setColor(0x0099ff);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            await member.roles.remove(role, `Left group ${targetGroup.name}`);

            const embed = new EmbedBuilder()
                .setTitle('✅ Left Group')
                .setDescription(`You have left **${targetGroup.name}**.`)
                .setColor(0x00ff00);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to leave group: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    // ===== STUDY TO-DO LIST COMMANDS =====

    // Add task command
    if (interaction.commandName === 'addtask') {
        const taskText = interaction.options.getString('task');
        const subject = interaction.options.getString('subject');
        const dueDate = interaction.options.getString('due_date');

        try {
            const newTask = addTask(interaction.user.id, taskText, subject, dueDate);

            const embed = new EmbedBuilder()
                .setTitle('✅ Task Added!')
                .setColor(0x00ff00)
                .addFields(
                    { name: '📝 Task', value: taskText },
                    { name: 'Task ID', value: `\`${newTask.id}\`` }
                );

            if (subject) {
                embed.addFields({ name: '📚 Subject', value: subject });
            }
            if (dueDate) {
                embed.addFields({ name: '📅 Due Date', value: dueDate });
            }

            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to add task: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    // View tasks command
    if (interaction.commandName === 'tasks') {
        try {
            const userTasks = getUserTasks(interaction.user.id);

            if (userTasks.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📝 Your Tasks')
                    .setDescription('You have no tasks yet! Use `/addtask` to add one.')
                    .setColor(0x0099ff);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📝 Your Study Tasks')
                .setColor(0x0099ff);

            let taskList = '';
            for (const task of userTasks) {
                const checkbox = task.completed ? '✅' : '⬜';
                const taskDisplay = task.completed ? `~~${task.task}~~` : task.task;

                let taskInfo = `${checkbox} **${taskDisplay}** (ID: \`${task.id}\`)`;
                if (task.subject) taskInfo += ` - ${task.subject}`;
                if (task.due_date) taskInfo += ` - Due: ${task.due_date}`;

                taskList += taskInfo + '\n';
            }

            embed.setDescription(taskList);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to load tasks: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    // Remove task command
    if (interaction.commandName === 'removetask') {
        const taskId = interaction.options.getInteger('task_id');

        try {
            const success = removeTask(taskId, interaction.user.id);

            if (success) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Task Removed')
                    .setDescription(`Task \`${taskId}\` has been deleted.`)
                    .setColor(0x00ff00);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Task Not Found')
                    .setDescription(`Task \`${taskId}\` not found. Use \`/tasks\` to see your task IDs.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to remove task: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    // Complete task command
    if (interaction.commandName === 'completetask') {
        const taskId = interaction.options.getInteger('task_id');

        try {
            const success = completeTask(taskId, interaction.user.id);

            if (success) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Task Completed!')
                    .setDescription(`Task \`${taskId}\` marked as complete. Great work!`)
                    .setColor(0x00ff00);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Task Not Found')
                    .setDescription(`Task \`${taskId}\` not found. Use \`/tasks\` to see your task IDs.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to complete task: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    // Clear all tasks command
    if (interaction.commandName === 'cleartasks') {
        try {
            clearAllTasks(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('🗑️ All Tasks Cleared')
                .setDescription('All your tasks have been deleted.')
                .setColor(0xff9900);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to clear tasks: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // ===== TASK DEPENDENCY COMMANDS =====
    
    // Add task dependency command
    if (interaction.commandName === 'adddependency') {
        const taskId = interaction.options.getInteger('task_id');
        const dependsOn = interaction.options.getInteger('depends_on');
        
        try {
            addTaskDependency(taskId, dependsOn, interaction.user.id);
            
            // Check for cycles after adding
            if (hasCyclicDependencies(interaction.user.id)) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Circular Dependency Detected!')
                    .setDescription(`Task \`${taskId}\` → Task \`${dependsOn}\` creates a cycle.`)
                    .setColor(0xff9900);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Dependency Added')
                    .setDescription(`Task \`${taskId}\` now depends on Task \`${dependsOn}\`.`)
                    .setColor(0x00ff00);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to add dependency: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // Schedule/validate command
    if (interaction.commandName === 'schedule') {
        try {
            if (hasCyclicDependencies(interaction.user.id)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Circular Dependencies Found')
                    .setDescription('You have circular task dependencies. Resolve them first!')
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            } else {
                const dependencies = getTaskDependencies(interaction.user.id);
                const embed = new EmbedBuilder()
                    .setTitle('✅ Schedule Valid')
                    .setColor(0x00ff00);
                
                if (dependencies.length === 0) {
                    embed.setDescription('No dependencies found. All tasks can be done independently!');
                } else {
                    let depList = '';
                    for (const dep of dependencies) {
                        depList += `Task \`${dep.task_id}\` depends on Task \`${dep.depends_on}\`\n`;
                    }
                    embed.setDescription(`Your task dependencies are valid:\n\n${depList}`);
                }
                
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to validate schedule: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // ===== ASSIGNMENT DEADLINE COMMANDS =====
    
    // Add deadline command
    if (interaction.commandName === 'adddeadline') {
        const title = interaction.options.getString('title');
        const dueDate = interaction.options.getString('due_date');
        const subject = interaction.options.getString('subject');
        const notes = interaction.options.getString('notes');
        
        const result = parseDeadlineDate(dueDate);
        
        if (result.error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Date Format')
                .setDescription(result.error)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
            return;
        }
        
        try {
            const deadlineId = addDeadline(
                interaction.user.id,
                interaction.guildId,
                interaction.channelId,
                title,
                subject,
                notes,
                result.dueTime.toISOString()
            );
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Deadline Added!')
                .setColor(0x00ff00)
                .addFields(
                    { name: '📌 Assignment', value: title },
                    { name: '📅 Due', value: result.description }
                );
            
            if (subject) {
                embed.addFields({ name: '📚 Subject', value: subject });
            }
            if (notes) {
                embed.addFields({ name: '📝 Notes', value: notes });
            }
            
            embed.addFields({ name: 'Deadline ID', value: `\`${deadlineId}\`` });
            embed.setFooter({ text: 'You\'ll get reminders 24h and 1h before the deadline!' });
            
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to add deadline: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // View deadlines command
    if (interaction.commandName === 'deadlines') {
        try {
            const deadlines = getUserDeadlines(interaction.user.id);
            
            if (deadlines.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📌 Your Deadlines')
                    .setDescription('You have no deadlines yet! Use `/adddeadline` to add one.')
                    .setColor(0x0099ff);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📌 Your Assignment Deadlines')
                .setColor(0x0099ff);
            
            let deadlineList = '';
            for (const deadline of deadlines) {
                const dueDate = new Date(deadline.due_at);
                const now = new Date();
                const hoursLeft = (dueDate - now) / (1000 * 60 * 60);
                
                let statusEmoji = '⏳';
                if (hoursLeft < 0) statusEmoji = '❌';
                else if (hoursLeft < 24) statusEmoji = '🔴';
                else if (hoursLeft < 72) statusEmoji = '🟠';
                
                let deadlineInfo = `${statusEmoji} **${deadline.title}** (ID: \`${deadline.id}\`)`;
                deadlineInfo += ` - Due: ${deadline.due_at}`;
                if (deadline.subject) deadlineInfo += ` - ${deadline.subject}`;
                
                deadlineList += deadlineInfo + '\n';
            }
            
            embed.setDescription(deadlineList);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to load deadlines: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // View upcoming deadlines command
    if (interaction.commandName === 'upcoming') {
        try {
            const deadlines = getUpcomingDeadlines(interaction.user.id);
            
            if (deadlines.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📭 Upcoming Deadlines')
                    .setDescription('No deadlines due within the next 7 days!')
                    .setColor(0x00ff00);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('⏰ Deadlines Due Within 7 Days')
                .setColor(0xff9900);
            
            let deadlineList = '';
            for (const deadline of deadlines) {
                const dueDate = new Date(deadline.due_at);
                const now = new Date();
                const hoursLeft = (dueDate - now) / (1000 * 60 * 60);
                const daysLeft = Math.floor(hoursLeft / 24);
                
                let timeStr = daysLeft > 0 ? `${daysLeft}d left` : `${Math.floor(hoursLeft)}h left`;
                
                let deadlineInfo = `📍 **${deadline.title}** - ${timeStr}`;
                deadlineInfo += ` (ID: \`${deadline.id}\`)`;
                if (deadline.subject) deadlineInfo += ` - ${deadline.subject}`;
                
                deadlineList += deadlineInfo + '\n';
            }
            
            embed.setDescription(deadlineList);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to load upcoming deadlines: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // Remove deadline command
    if (interaction.commandName === 'removedeadline') {
        const deadlineId = interaction.options.getInteger('deadline_id');
        
        try {
            const success = removeDeadline(deadlineId, interaction.user.id);
            
            if (success) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Deadline Removed')
                    .setDescription(`Deadline \`${deadlineId}\` has been deleted.`)
                    .setColor(0x00ff00);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Deadline Not Found')
                    .setDescription(`Deadline \`${deadlineId}\` not found. Use `/deadlines` to see your deadline IDs.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to remove deadline: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // Update deadline command
    if (interaction.commandName === 'updatedeadline') {
        const deadlineId = interaction.options.getInteger('deadline_id');
        const newTitle = interaction.options.getString('title');
        const newDueDate = interaction.options.getString('due_date');
        const newSubject = interaction.options.getString('subject');
        const newNotes = interaction.options.getString('notes');
        
        // Build update object with only provided values
        const updates = {};
        if (newTitle !== null) updates.title = newTitle;
        if (newSubject !== null) updates.subject = newSubject;
        if (newNotes !== null) updates.notes = newNotes;
        
        if (newDueDate !== null) {
            const result = parseDeadlineDate(newDueDate);
            if (result.error) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invalid Date Format')
                    .setDescription(result.error)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
                return;
            }
            updates.due_at = result.dueTime.toISOString();
        }
        
        try {
            const success = updateDeadline(deadlineId, interaction.user.id, updates);
            
            if (success) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ Deadline Updated')
                    .setColor(0x00ff00)
                    .setDescription(`Deadline \`${deadlineId}\` has been updated.`);
                
                if (newTitle) embed.addFields({ name: '📌 New Assignment', value: newTitle });
                if (newDueDate) embed.addFields({ name: '📅 New Due Date', value: newDueDate });
                if (newSubject) embed.addFields({ name: '📚 New Subject', value: newSubject });
                if (newNotes) embed.addFields({ name: '📝 New Notes', value: newNotes });
                
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Deadline Not Found')
                    .setDescription(`Deadline \`${deadlineId}\` not found or doesn't belong to you.`)
                    .setColor(0xff0000);
                await safeReply(interaction, { embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to update deadline: ${error.message}`)
                .setColor(0xff0000);
            await safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }
    
    // Clear deadlines command
    if (interaction.commandName === 'cleardeadlines') {
        try {
            clearAllDeadlines(interaction.user.id);
            
            const embed = new EmbedBuilder()
                .setTitle('🗑️ All Deadlines Cleared')
                .setDescription('All your deadlines have been deleted.')
                .setColor(0xff9900);
            await await safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to clear deadlines: ${error.message}`)
                .setColor(0xff0000);
            await await safeReply(interaction, { embeds: [embed] });
        }
    }

// listallgroups command
if (interaction.commandName === 'listallgroups') {

    if (!interaction.inGuild() || !interaction.guild) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Server Only Command')
            .setDescription('`/listallgroups` can only be used inside a server.')
            .setColor(0xff0000);
        return await await safeReply(interaction, { embeds: [embed] });
    }

    try {
        const groupsWithRoles = await fetchGroupsWithRoles(interaction);

        if (groupsWithRoles.length === 0) {
            const emptyEmbed = new EmbedBuilder()
                .setTitle('📚 Study Groups')
                .setColor(0xff0000)
                .setDescription('There are no study groups in this server yet!\nUse `/creategroup` to create one.')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({
                    text: 'Use /creategroup to create a new group',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();
            return await safeReply(interaction, { embeds: [emptyEmbed] });
        }

        await safeReply(interaction, await buildGroupPage(interaction, groupsWithRoles, 0));

    } catch (error) {
        await safeReply(interaction, {
            embeds: [new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to list groups: ${error.message}`)
                .setColor(0xff0000)]
        });
    }

} 
 if (interaction.isButton() && interaction.customId.startsWith('listall_page_')) {
    await interaction.deferUpdate();

    try {
        const page = parseInt(interaction.customId.replace('listall_page_', ''));
        const groupsWithRoles = await fetchGroupsWithRoles(interaction);
        await safeReply(interaction, await buildGroupPage(interaction, groupsWithRoles, page));

    } catch (error) {
        await interaction.followUp({
            embeds: [new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to load page: ${error.message}`)
                .setColor(0xff0000)],
            ephemeral: true
        });
    }

} else if (interaction.isButton() && interaction.customId.startsWith('listall_join_')) {
    try {
        const parts = interaction.customId.split('_page_');
        const groupId = parts[0].replace('listall_join_', '');
        const page = parts[1] ? parseInt(parts[1]) : 0;

        const groups = listGroupsByGuild(interaction.guild.id);
        const targetGroup = groups.find(g => String(g.id) === String(groupId));

        if (!targetGroup) {
            return await safeReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Group Not Found')
                    .setDescription('This group no longer exists.')
                    .setColor(0xff0000)]
            });
        }

        const role = await interaction.guild.roles.fetch(targetGroup.role_id).catch(() => null);
        if (!role) {
            return await safeReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Group Configuration Error')
                    .setDescription('This group is missing its role. Ask an admin to recreate the group.')
                    .setColor(0xff0000)]
            });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (member.roles.cache.has(role.id)) {
            return await safeReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setTitle('ℹ️ Already In Group')
                    .setDescription(`You are already a member of **${targetGroup.name}**.`)
                    .setColor(0x0099ff)]
            });
        }

        await member.roles.add(role, `Joined group ${targetGroup.name} via listallgroups`);

        // Reply to confirm join
        await safeReply(interaction, {
            embeds: [new EmbedBuilder()
                .setTitle('✅ Joined Group')
                .setDescription(`You joined **${targetGroup.name}** successfully.`)
                .addFields({ name: 'Group Role', value: `<@&${role.id}>` })
                .setColor(0x00ff00)]
        });

        // Try to update the original embed to reflect the join (non-critical)
        try {
            const groupsWithRoles = await fetchGroupsWithRoles(interaction);
            await interaction.message.edit(await buildGroupPage(interaction, groupsWithRoles, page));
        } catch (updateError) {
            // Silently fail if we can't update the original message
            // User already got confirmation they joined
        }

    } catch (error) {
        await safeReply(interaction, {
            embeds: [new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to join group: ${error.message}`)
                .setColor(0xff0000)]
        });
    }
}
    } catch (error) {
        // Catch-all error handler for any uncaught errors in the interaction handler
        console.error('❌ Unhandled error in interaction:', error);
        try {
            await safeReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Unexpected Error')
                    .setDescription('The bot encountered an error processing your command. Please try again.')
                    .setColor(0xff0000)
                ]
            });
        } catch (e) {
            console.error('Error sending error message:', e);
        }
    }

});

// Global error handlers to prevent crashes
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught Exception:', error);
    console.error('Bot may need to restart to recover fully');
});

client.login(process.env.TOKEN);