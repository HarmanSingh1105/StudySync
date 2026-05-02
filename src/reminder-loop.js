const { EmbedBuilder } = require('discord.js');
const { getDueReminders, markRemindersDeliveredBatch } = require('./database');

// Flag to prevent overlapping executions
let isProcessingReminders = false;

/**
 * Background task that checks for due reminders every 30 seconds
 * When a reminder is due, it sends it as a DM or channel message
 */
function startReminderLoop(client) {
    console.log('✅ Reminder check loop started!');
    
    setInterval(async () => {
        // Skip if already processing to prevent overlapping
        if (isProcessingReminders) {
            console.log('⏳ Previous reminder batch still processing, skipping...');
            return;
        }
        
        isProcessingReminders = true;
        
        try {
            const dueReminders = getDueReminders();
            
            if (dueReminders.length === 0) {
                isProcessingReminders = false;
                return;
            }
            
            console.log(`📨 Processing ${dueReminders.length} reminders...`);
            
            const successfulIds = [];
            
            // Process reminders in batches of 5 concurrently to avoid overwhelming Discord API
            const batchSize = 5;
            for (let i = 0; i < dueReminders.length; i += batchSize) {
                const batch = dueReminders.slice(i, i + batchSize);
                
                const batchResults = await Promise.allSettled(
                    batch.map(reminder => sendReminder(client, reminder))
                );
                
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        successfulIds.push(batch[index].id);
                    }
                });
            }
            
            // Batch mark all successful reminders as delivered
            if (successfulIds.length > 0) {
                markRemindersDeliveredBatch(successfulIds);
                console.log(`✅ Successfully sent ${successfulIds.length}/${dueReminders.length} reminders`);
            }
        } catch (error) {
            console.log(`❌ Error in reminder loop: ${error.message}`);
        } finally {
            isProcessingReminders = false;
        }
    }, 30000); // Check every 30 seconds
}

async function sendReminder(client, reminder) {
    const { id, user_id, channel_id, title, notes, due_at } = reminder;
    
    try {
        const user = await client.users.fetch(user_id).catch(() => null);
        const embed = createReminderEmbed(title, notes, due_at);
        
        // Try to send DM first
        if (user) {
            try {
                await user.send({ embeds: [embed] });
                console.log(`✅ DM reminder sent to ${user.username}`);
                return true;
            } catch (dmError) {
                console.log(`⚠️  DM failed for ${user_id}, trying channel`);
            }
        }
        
        // Fallback: send to channel
        try {
            const channel = await client.channels.fetch(channel_id).catch(() => null);
            if (channel && channel.isTextBased()) {
                await channel.send({ content: `<@${user_id}>`, embeds: [embed] });
                console.log(`✅ Channel reminder sent`);
                return true;
            }
        } catch (channelError) {
            console.log(`❌ Failed to send reminder to channel ${channel_id}`);
        }
        
        return false;
    } catch (error) {
        console.log(`❌ Error processing reminder ${id}: ${error.message}`);
        return false;
    }
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
