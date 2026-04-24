const { EmbedBuilder } = require('discord.js');
const { getDeadlinesNeed24hReminder, getDeadlinesNeed1hReminder, mark24hReminderSent, mark1hReminderSent } = require('./database');

function startDeadlineReminderLoop(client) {
    console.log('✅ Deadline reminder check loop started!');
    
    // Check every 60 seconds
    setInterval(async () => {
        try {
            // Check for 24h reminders
            const deadlines24h = getDeadlinesNeed24hReminder();
            for (const deadline of deadlines24h) {
                await sendDeadlineReminder(client, deadline, '24 hours');
                mark24hReminderSent(deadline.id);
            }

            // Check for 1h reminders
            const deadlines1h = getDeadlinesNeed1hReminder();
            for (const deadline of deadlines1h) {
                await sendDeadlineReminder(client, deadline, '1 hour');
                mark1hReminderSent(deadline.id);
            }
        } catch (error) {
            console.error('Error in deadline reminder loop:', error);
        }
    }, 60 * 1000); // 60 seconds
}

async function sendDeadlineReminder(client, deadline, timeframe) {
    const embed = new EmbedBuilder()
        .setTitle(`⏰ Deadline Reminder: ${timeframe}`)
        .setColor(0xff6600)
        .addFields(
            { name: '📌 Assignment', value: deadline.title },
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
            return;
        } catch (error) {
            console.error(`Could not DM user ${deadline.user_id}, trying channel:`, error.message);
        }
    }

    // Fallback: send to channel
    try {
        const channel = await client.channels.fetch(deadline.channel_id).catch(() => null);
        if (channel && channel.isTextBased()) {
            const userMention = `<@${deadline.user_id}>`;
            await channel.send({ content: userMention, embeds: [embed] });
        }
    } catch (error) {
        console.error(`Could not send reminder to channel ${deadline.channel_id}:`, error.message);
    }
}

module.exports = { startDeadlineReminderLoop };
