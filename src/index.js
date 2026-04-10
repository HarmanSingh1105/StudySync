require('dotenv').config();
const { Client, IntentsBitField, EmbedBuilder } = require('discord.js');
const { initDatabase, addReminder, getUserReminders, deleteReminder, addTask, getUserTasks, removeTask, completeTask, clearAllTasks } = require('./database');
const { parseReminderTime } = require('./reminder-parser');
const { startReminderLoop } = require('./reminder-loop');

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
});

client.on('messageCreate', (message) => {
    if (message.author.bot) {
        return;
    }

    if(message.content === 'hello') {
        message.reply('Hello, how can I help you?');
    }
});

client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'add') {
        const num1 = interaction.options.get('first-number').value;
        const num2 = interaction.options.get('second-number').value;

        interaction.reply(`The sum of ${num1} and ${num2} is ${num1 + num2}`);
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
                    .setDescription(`Task \`${taskId}\` not found. Use `/tasks` to see your task IDs.`)
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
                    .setDescription(`Task \`${taskId}\` not found. Use `/tasks` to see your task IDs.`)
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
    
});

client.login(process.env.TOKEN);