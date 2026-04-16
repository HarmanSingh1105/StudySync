const Database = require('better-sqlite3');
const path = require('path');

// Create/connect to database
const dbPath = path.join(__dirname, '../data/reminders.db');
const db = new Database(dbPath);

// Initialize database schema
function initDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT,
            channel_id TEXT NOT NULL,
            title TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            due_at TEXT NOT NULL,
            delivered INTEGER DEFAULT 0
        );
        
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            task TEXT NOT NULL,
            subject TEXT,
            due_date TEXT,
            completed INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS deadlines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT,
            channel_id TEXT NOT NULL,
            title TEXT NOT NULL,
            subject TEXT,
            notes TEXT,
            due_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            reminder_24h_sent INTEGER DEFAULT 0,
            reminder_1h_sent INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            role_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            owner_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(guild_id, name)
        );
    `);
}

// Add a new reminder
function addReminder(userId, guildId, channelId, title, notes, createdAt, dueAt) {
    const stmt = db.prepare(`
        INSERT INTO reminders (user_id, guild_id, channel_id, title, notes, created_at, due_at, delivered)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);
    
    const result = stmt.run(userId, guildId, channelId, title, notes, createdAt, dueAt);
    return result.lastInsertRowid;
}

// Get all due reminders (not delivered and past due time)
function getDueReminders() {
    const currentTime = new Date().toISOString();
    const stmt = db.prepare(`
        SELECT id, user_id, guild_id, channel_id, title, notes, due_at
        FROM reminders
        WHERE delivered = 0 AND due_at <= ?
        ORDER BY due_at ASC
    `);
    
    return stmt.all(currentTime);
}

// Mark reminder as delivered
function markReminderDelivered(reminderId) {
    const stmt = db.prepare(`
        UPDATE reminders
        SET delivered = 1
        WHERE id = ?
    `);
    
    stmt.run(reminderId);
}

// Get user's pending reminders
function getUserReminders(userId) {
    const stmt = db.prepare(`
        SELECT id, title, notes, due_at, created_at
        FROM reminders
        WHERE user_id = ? AND delivered = 0
        ORDER BY due_at ASC
    `);
    
    return stmt.all(userId);
}

// Delete a reminder (with user verification)
function deleteReminder(reminderId, userId) {
    const stmt = db.prepare(`
        SELECT user_id FROM reminders WHERE id = ?
    `);
    
    const reminder = stmt.get(reminderId);
    if (!reminder || reminder.user_id !== userId) {
        return false;
    }
    
    const deleteStmt = db.prepare(`
        DELETE FROM reminders WHERE id = ?
    `);
    
    deleteStmt.run(reminderId);
    return true;
}

// ===== TASK FUNCTIONS =====

// Add a new task
function addTask(userId, taskText, subject, dueDate) {
    const stmt = db.prepare(`
        INSERT INTO tasks (user_id, task, subject, due_date, completed, created_at)
        VALUES (?, ?, ?, ?, 0, ?)
    `);
    
    const now = new Date().toISOString();
    const result = stmt.run(userId, taskText, subject || null, dueDate || null, now);
    
    return {
        id: result.lastInsertRowid,
        user_id: userId,
        task: taskText,
        subject: subject || null,
        due_date: dueDate || null,
        completed: false,
        created_at: now
    };
}

// Get user's tasks
function getUserTasks(userId) {
    const stmt = db.prepare(`
        SELECT id, task, subject, due_date, completed, created_at
        FROM tasks
        WHERE user_id = ?
        ORDER BY id ASC
    `);
    
    return stmt.all(userId);
}

// Mark task as completed
function completeTask(taskId, userId) {
    const checkStmt = db.prepare(`
        SELECT user_id FROM tasks WHERE id = ?
    `);
    
    const task = checkStmt.get(taskId);
    if (!task || task.user_id !== userId) {
        return false;
    }
    
    const updateStmt = db.prepare(`
        UPDATE tasks
        SET completed = 1
        WHERE id = ?
    `);
    
    updateStmt.run(taskId);
    return true;
}

// Remove a task
function removeTask(taskId, userId) {
    const checkStmt = db.prepare(`
        SELECT user_id FROM tasks WHERE id = ?
    `);
    
    const task = checkStmt.get(taskId);
    if (!task || task.user_id !== userId) {
        return false;
    }
    
    const deleteStmt = db.prepare(`
        DELETE FROM tasks WHERE id = ?
    `);
    
    deleteStmt.run(taskId);
    return true;
}

// Clear all user's tasks
function clearAllTasks(userId) {
    const stmt = db.prepare(`
        DELETE FROM tasks WHERE user_id = ?
    `);
    
    stmt.run(userId);
}

// ===== DEADLINE FUNCTIONS =====

// Add a new deadline
function addDeadline(userId, guildId, channelId, title, subject, notes, dueAt) {
    const stmt = db.prepare(`
        INSERT INTO deadlines (user_id, guild_id, channel_id, title, subject, notes, due_at, created_at, reminder_24h_sent, reminder_1h_sent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `);
    
    const now = new Date().toISOString();
    const result = stmt.run(userId, guildId, channelId, title, subject || null, notes || null, dueAt, now);
    
    return result.lastInsertRowid;
}

// Get user's deadlines sorted by due date
function getUserDeadlines(userId) {
    const stmt = db.prepare(`
        SELECT id, title, subject, notes, due_at, created_at, reminder_24h_sent, reminder_1h_sent
        FROM deadlines
        WHERE user_id = ?
        ORDER BY due_at ASC
    `);
    
    return stmt.all(userId);
}

// Get deadlines due within next 7 days
function getUpcomingDeadlines(userId) {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const currentTime = now.toISOString();
    
    const stmt = db.prepare(`
        SELECT id, title, subject, notes, due_at, created_at, reminder_24h_sent, reminder_1h_sent
        FROM deadlines
        WHERE user_id = ? AND due_at > ? AND due_at <= ?
        ORDER BY due_at ASC
    `);
    
    return stmt.all(userId, currentTime, in7Days);
}

// Get all deadlines that need 24h reminders
function getDeadlinesNeed24hReminder() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const currentTime = now.toISOString();
    
    const stmt = db.prepare(`
        SELECT id, user_id, guild_id, channel_id, title, subject, notes, due_at
        FROM deadlines
        WHERE reminder_24h_sent = 0 AND due_at > ? AND due_at <= ?
        ORDER BY due_at ASC
    `);
    
    return stmt.all(currentTime, in24h);
}

// Get all deadlines that need 1h reminders
function getDeadlinesNeed1hReminder() {
    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const currentTime = now.toISOString();
    
    const stmt = db.prepare(`
        SELECT id, user_id, guild_id, channel_id, title, subject, notes, due_at
        FROM deadlines
        WHERE reminder_1h_sent = 0 AND due_at > ? AND due_at <= ?
        ORDER BY due_at ASC
    `);
    
    return stmt.all(currentTime, in1h);
}

// Mark 24h reminder as sent
function mark24hReminderSent(deadlineId) {
    const stmt = db.prepare(`
        UPDATE deadlines
        SET reminder_24h_sent = 1
        WHERE id = ?
    `);
    
    stmt.run(deadlineId);
}

// Mark 1h reminder as sent
function mark1hReminderSent(deadlineId) {
    const stmt = db.prepare(`
        UPDATE deadlines
        SET reminder_1h_sent = 1
        WHERE id = ?
    `);
    
    stmt.run(deadlineId);
}

// Update a deadline
function updateDeadline(deadlineId, userId, updates) {
    const checkStmt = db.prepare(`
        SELECT user_id FROM deadlines WHERE id = ?
    `);
    
    const deadline = checkStmt.get(deadlineId);
    if (!deadline || deadline.user_id !== userId) {
        return false;
    }
    
    let updateFields = [];
    let values = [];
    
    if (updates.title !== undefined) {
        updateFields.push('title = ?');
        values.push(updates.title);
    }
    if (updates.subject !== undefined) {
        updateFields.push('subject = ?');
        values.push(updates.subject);
    }
    if (updates.notes !== undefined) {
        updateFields.push('notes = ?');
        values.push(updates.notes);
    }
    if (updates.due_at !== undefined) {
        updateFields.push('due_at = ?');
        values.push(updates.due_at);
    }
    
    if (updateFields.length === 0) {
        return true;
    }
    
    values.push(deadlineId);
    const updateStmt = db.prepare(`
        UPDATE deadlines
        SET ${updateFields.join(', ')}
        WHERE id = ?
    `);
    
    updateStmt.run(...values);
    return true;
}

// Remove a deadline
function removeDeadline(deadlineId, userId) {
    const checkStmt = db.prepare(`
        SELECT user_id FROM deadlines WHERE id = ?
    `);
    
    const deadline = checkStmt.get(deadlineId);
    if (!deadline || deadline.user_id !== userId) {
        return false;
    }
    
    const deleteStmt = db.prepare(`
        DELETE FROM deadlines WHERE id = ?
    `);
    
    deleteStmt.run(deadlineId);
    return true;
}

// Clear all user's deadlines
function clearAllDeadlines(userId) {
    const stmt = db.prepare(`
        DELETE FROM deadlines WHERE user_id = ?
    `);
    
    stmt.run(userId);
}

// ===== GROUP FUNCTIONS =====

// Create a group mapping for a guild
function createGroup(guildId, name, roleId, channelId, ownerUserId) {
    const stmt = db.prepare(`
        INSERT INTO groups (guild_id, name, role_id, channel_id, owner_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const result = stmt.run(guildId, name, roleId, channelId, ownerUserId, now);

    return {
        id: result.lastInsertRowid,
        guild_id: guildId,
        name,
        role_id: roleId,
        channel_id: channelId,
        owner_user_id: ownerUserId,
        created_at: now,
    };
}

// Check if group name already exists in this guild
function getGroupByName(guildId, name) {
    const stmt = db.prepare(`
        SELECT id, guild_id, name, role_id, channel_id, owner_user_id, created_at
        FROM groups
        WHERE guild_id = ? AND LOWER(name) = LOWER(?)
    `);

    return stmt.get(guildId, name);
}

module.exports = {
    initDatabase,
    addReminder,
    getDueReminders,
    markReminderDelivered,
    getUserReminders,
    deleteReminder,
    addTask,
    getUserTasks,
    completeTask,
    removeTask,
    clearAllTasks,
    addDeadline,
    getUserDeadlines,
    getUpcomingDeadlines,
    getDeadlinesNeed24hReminder,
    getDeadlinesNeed1hReminder,
    mark24hReminderSent,
    mark1hReminderSent,
    updateDeadline,
    removeDeadline,
    clearAllDeadlines,
    createGroup,
    getGroupByName,
};
