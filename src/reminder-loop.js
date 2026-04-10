const { EmbedBuilder } = require('discord.js');
const { getDueReminders, markReminderDelivered } = require('./database');

/**
 * Background task that checks for due reminders every 30 seconds
 * When a reminder is due, it sends it as a DM or channel message
 */
function startReminderLoop(client) {
    console.log('✅ Reminder check loop started!');
    
    setInterval(async () => {
        try {
            const dueReminders = getDueReminders();
            
            for (const reminder of dueReminders) {
                const { id, user_id, channel_id, title, notes, due_at } = reminder;
                
                try {
                    // Get the user
                    const user = await client.users.fetch(user_id);
                    
                    // Create the reminder embed
                    const embed = createReminderEmbed(title, notes, due_at);
                    
                    // Try to send DM first
                    try {
                        await user.send({ embeds: [embed] });
                        console.log(`✅ DM reminder sent to ${user.username}`);
                    } catch (dmError) {
                        // DM failed, try channel
                        try {
                            const channel = await client.channels.fetch(channel_id);
                            await channel.send({ content: `<@${user_id}>`, embeds: [embed] });
                            console.log(`✅ Channel reminder sent`);
                        } catch (channelError) {
                            console.log(`❌ Failed to send reminder: ${channelError.message}`);
                        }
                    }
                    
                    // Mark as delivered
                    markReminderDelivered(id);
                } catch (error) {
                    console.log(`❌ Error processing reminder ${id}: ${error.message}`);
                }
            }
        } catch (error) {
            console.log(`❌ Error in reminder loop: ${error.message}`);
        }
    }, 30000); // Check every 30 seconds
}

function createReminderEmbed(title, notes, dueAt) {
    const embed = new EmbedBuilder()
        .setTitle('📚 Study Reminder!')
        .setColor(0x0099ff)
        .setDescription(`**${title}**`);
    
    if (notes) {
        embed.addFields({ name: '📝 Notes', value: notes });
    }
    
    embed.setFooter({ text: `Scheduled for: ${dueAt}` });
    
    return embed;
}

module.exports = { startReminderLoop };
