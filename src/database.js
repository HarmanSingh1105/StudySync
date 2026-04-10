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
};
