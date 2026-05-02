const { EmbedBuilder } = require('discord.js');
const { getDeadlinesNeed24hReminder, getDeadlinesNeed1hReminder, mark24hRemindersDeliveredBatch, mark1hRemindersDeliveredBatch } = require('./database');

// Flag to prevent overlapping executions
let isProcessingDeadlines = false;

function startDeadlineReminderLoop(client) {
    console.log('✅ Deadline reminder check loop started!');
    
    // Check every 60 seconds
    setInterval(async () => {
        // Skip if already processing to prevent overlapping
        if (isProcessingDeadlines) {
            console.log('⏳ Previous deadline batch still processing, skipping...');
            return;
        }
        
        isProcessingDeadlines = true;
        
        try {
            // Check for 24h reminders
            const deadlines24h = getDeadlinesNeed24hReminder();
            if (deadlines24h.length > 0) {
                const successful24h = await processDeadlineBatch(client, deadlines24h, '24 hours');
                if (successful24h.length > 0) {
                    mark24hRemindersDeliveredBatch(successful24h);
                }
            }

            // Check for 1h reminders
            const deadlines1h = getDeadlinesNeed1hReminder();
            if (deadlines1h.length > 0) {
                const successful1h = await processDeadlineBatch(client, deadlines1h, '1 hour');
                if (successful1h.length > 0) {
                    mark1hRemindersDeliveredBatch(successful1h);
                }
            }
        } catch (error) {
            console.error('Error in deadline reminder loop:', error);
        } finally {
            isProcessingDeadlines = false;
        }
    }, 60 * 1000); // 60 seconds
}

async function processDeadlineBatch(client, deadlines, timeframe) {
    console.log(`📨 Processing ${deadlines.length} deadline reminders for "${timeframe}"...`);
    
    const successful = [];
    
    // Process deadlines in batches of 5 concurrently to avoid overwhelming Discord API
    const batchSize = 5;
    for (let i = 0; i < deadlines.length; i += batchSize) {
        const batch = deadlines.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
            batch.map(deadline => sendDeadlineReminder(client, deadline, timeframe))
        );
        
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                successful.push(batch[index].id);
            }
        });
    }
    
    return successful;
}

async function sendDeadlineReminder(client, deadline, timeframe) {
    const embed = new EmbedBuilder()
        .setTitle(`⏰ Deadline Reminder: ${timeframe}`)
        .setColor(0xff6600)
        .addFields(
            { name: '📌 Assignment', value: deadline.title || 'No title' },
            { name: '⏱️ Time', value: `${timeframe} remaining` }
        );

    if (deadline.subject) {
        embed.addFields({ name: '📚 Subject', value: deadline.subject });
    }
    if (deadline.notes) {
        embed.addFields({ name: '📝 Notes', value: deadline.notes });
    }

    const user = await client.users.fetch(deadline.user_id).catch(() => null);

    if (user) {
        // Try to send DM
        try {
            await user.send({ embeds: [embed] });
            console.log(`✅ Deadline DM sent to user ${deadline.user_id}`);
            return;
        } catch (error) {
            console.log(`⚠️  Could not DM user ${deadline.user_id}: ${error.message}`);
        }
    }

    // Fallback: send to channel
    try {
        const channel = await client.channels.fetch(deadline.channel_id).catch(() => null);
        if (channel && channel.isTextBased()) {
            const userMention = `<@${deadline.user_id}>`;
            await channel.send({ content: userMention, embeds: [embed] });
            console.log(`✅ Deadline reminder sent to channel ${deadline.channel_id}`);
        }
    } catch (error) {
        console.error(`❌ Could not send reminder to channel ${deadline.channel_id}: ${error.message}`);
    }
}

module.exports = { startDeadlineReminderLoop };
