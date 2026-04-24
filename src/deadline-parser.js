// Parse deadline date formats
function parseDeadlineDate(dateStr) {
    if (!dateStr) {
        return { error: 'Date is required' };
    }

    // Trim whitespace
    dateStr = dateStr.trim();

    // Check format: YYYY-MM-DD or YYYY-MM-DD HH:mm
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})(?:\s(\d{2}):(\d{2}))?$/;
    const match = dateStr.match(dateRegex);

    if (!match) {
        return {
            error: 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm (e.g., 2026-04-15 or 2026-04-15 14:00)'
        };
    }

    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);
    const hour = match[4] ? parseInt(match[4]) : 23;
    const minute = match[5] ? parseInt(match[5]) : 59;

    // Validate month and day
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return { error: 'Invalid month or day' };
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return { error: 'Invalid hour or minute' };
    }

    // Create date in UTC
    const dueTime = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

    // Check if date is in the past
    const now = new Date();
    if (dueTime <= now) {
        return { error: 'Deadline cannot be in the past' };
    }

    // Create readable description
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: true
    };
    const description = dueTime.toLocaleString('en-US', options);

    return {
        dueTime: dueTime,
        description: `${description} UTC`
    };
}

module.exports = { parseDeadlineDate };
