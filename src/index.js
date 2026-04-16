require('dotenv').config();
const { Client, IntentsBitField, EmbedBuilder } = require('discord.js');
const { initDatabase, addReminder, getUserReminders, deleteReminder, addTask, getUserTasks, removeTask, completeTask, clearAllTasks, addDeadline, getUserDeadlines, getUpcomingDeadlines, updateDeadline, removeDeadline, clearAllDeadlines } = require('./database');
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

client.on('messageCreate', async(message) => {
    if (message.author.bot) {
        return;
    }

    if (message.content === 'hello') {
        message.reply('Hello, how can I help you?');
    }

    if (message.content === '!create-channel') {
    try {
      const channel = await message.guild.channels.create({
        name: 'new-text-channel',
        type: ChannelType.GuildText, // Specifies a text channel
        reason: 'Bot created this channel'
      });
      message.reply(`Successfully created channel: ${channel.name}`);
    } catch (error) {
      console.error(error);
      message.reply('There was an error creating the channel.');
    }
  }
});

client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'add') {
        const num1 = interaction.options.get('first-number').value;
        const num2 = interaction.options.get('second-number').value;

        interaction.reply(`The sum of ${num1} and ${num2} is ${num1 + num2}`);
    }

    //dependency command
    const {
        addTaskDependency
    } = require('./tasks-storage');

    if (interaction.commandName === 'adddependency') {
        const taskId = interaction.options.getInteger('task_id');
        const dependsOn = interaction.options.getInteger('depends_on');

        addTaskDependency(taskId, dependsOn, interaction.user.id);

        const schedule = buildScheduleForUser(interaction.user.id);
        const result = schedule.finish();

        if (result === -1) {
            interaction.reply({
                content: '⚠️ This dependency creates a cycle!',
                ephemeral: true
            });
        } else {
            interaction.reply({
                content: '✅ Dependency added successfully.',
                ephemeral: true
            });
        }
    }

    if (interaction.commandName === 'schedule') {
        const schedule = buildScheduleForUser(interaction.user.id);
        const finishTime = schedule.finish();

        if (finishTime === -1) {
            interaction.reply({
                content: '❌ You have circular task dependencies.',
                ephemeral: true
            });
        } else {
            interaction.reply({
                content: `✅ All tasks can be completed in ${finishTime} time units.`,
                ephemeral: true
            });
        }
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
            interaction.reply({ embeds: [embed] });
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

            interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to create reminder: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed] });
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
                interaction.reply({ embeds: [embed] });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📚 Your Pending Reminders')
                .setColor(0x0099ff);

            for (const [id, title, notes, dueAt] of reminders) {
                let fieldValue = `**When:** ${dueAt}\n**ID:** \`${id}\``;
                if (notes) {
                    fieldValue += `\n**Notes:** ${notes}`;
                }
                embed.addFields({ name: title, value: fieldValue });
            }

            embed.setFooter({ text: 'Use /cancelreminder to delete one.' });

            interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to fetch reminders: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed] });
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
                interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Not Found')
                    .setDescription(`Reminder \`${reminderId}\` not found or doesn't belong to you.`)
                    .setColor(0xff0000);
                interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to cancel reminder: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed] });
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

            interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to add task: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
                interaction.reply({ embeds: [embed], ephemeral: true });
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
            interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to load tasks: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
                interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Task Not Found')
                    .setDescription(`Task \`${taskId}\` not found. Use ` / tasks` to see your task IDs.`)
                    .setColor(0xff0000);
                interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to remove task: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
                interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Task Not Found')
                    .setDescription(`Task \`${taskId}\` not found. Use ` / tasks` to see your task IDs.`)
                    .setColor(0xff0000);
                interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to complete task: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
            interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to clear tasks: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
            interaction.reply({ embeds: [embed], ephemeral: true });
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

            interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to add deadline: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
                interaction.reply({ embeds: [embed], ephemeral: true });
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
            interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to load deadlines: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
                interaction.reply({ embeds: [embed], ephemeral: true });
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
            interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to load upcoming deadlines: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
                interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Deadline Not Found')
                    .setDescription(`Deadline \`${deadlineId}\` not found. Use ` / deadlines` to see your deadline IDs.`)
                    .setColor(0xff0000);
                interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to remove deadline: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
                interaction.reply({ embeds: [embed], ephemeral: true });
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

                interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Deadline Not Found')
                    .setDescription(`Deadline \`${deadlineId}\` not found or doesn't belong to you.`)
                    .setColor(0xff0000);
                interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to update deadline: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
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
            interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`Failed to clear deadlines: ${error.message}`)
                .setColor(0xff0000);
            interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

});

client.login(process.env.TOKEN);

client.login(process.env.TOKEN);