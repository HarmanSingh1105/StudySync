const Database = require('better-sqlite3');
const path = require('path');

// Create/connect to database
const dbPath = path.join(__dirname, '../data/reminders.db');
const db = new Database(dbPath);

// Configure for better performance and concurrency
db.pragma('journal_mode = WAL');  // Write-Ahead Logging for better concurrency
db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds for database lock
db.pragma('synchronous = NORMAL'); // Balance safety and performance

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
        
        CREATE TABLE IF NOT EXISTS task_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            task_id INTEGER NOT NULL,
            depends_on INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY(depends_on) REFERENCES tasks(id) ON DELETE CASCADE
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
    // Check ownership first
    const checkStmt = db.prepare(`
        SELECT user_id FROM deadlines WHERE id = ?
    `);
    
    const deadline = checkStmt.get(deadlineId);
    if (!deadline || deadline.user_id !== userId) {
        return false;
    }
    
    // Build update query dynamically
    const updateFields = [];
    const values = [];
    
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
        // Reset reminder flags when due_at is updated
        updateFields.push('reminder_24h_sent = 0');
        updateFields.push('reminder_1h_sent = 0');
    }
    
    if (updateFields.length === 0) {
        return true; // Nothing to update
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

// List all groups for a guild
function listGroupsByGuild(guildId) {
    const stmt = db.prepare(`
        SELECT id, guild_id, name, role_id, channel_id, owner_user_id, created_at
        FROM groups
        WHERE guild_id = ?
        ORDER BY name ASC
    `);

    return stmt.all(guildId);
}

// Get group by ID
function getGroupById(groupId) {
    const stmt = db.prepare(`
        SELECT id, guild_id, name, role_id, channel_id, owner_user_id, created_at
        FROM groups
        WHERE id = ?
    `);

    return stmt.get(groupId);
}

// Delete a group (only owner can delete)
function deleteGroup(groupId, userId) {
    // Check if user is the owner
    const stmt = db.prepare(`
        SELECT owner_user_id FROM groups WHERE id = ?
    `);

    const group = stmt.get(groupId);
    if (!group || group.owner_user_id !== userId) {
        return false; // Not owner or group doesn't exist
    }

    const deleteStmt = db.prepare(`
        DELETE FROM groups WHERE id = ?
    `);

    deleteStmt.run(groupId);
    return true;
}

// ===== TASK DEPENDENCIES =====

// Add a dependency between two tasks
function addTaskDependency(taskId, dependsOnId, userId) {
    // Verify both tasks belong to the user
    const taskStmt = db.prepare(`SELECT user_id FROM tasks WHERE id = ?`);
    const task1 = taskStmt.get(taskId);
    const task2 = taskStmt.get(dependsOnId);
    
    if (!task1 || task1.user_id !== userId || !task2 || task2.user_id !== userId) {
        throw new Error('Invalid task IDs or ownership mismatch');
    }
    
    // Check if dependency already exists
    const existsStmt = db.prepare(`
        SELECT id FROM task_dependencies 
        WHERE user_id = ? AND task_id = ? AND depends_on = ?
    `);
    
    if (existsStmt.get(userId, taskId, dependsOnId)) {
        throw new Error('Dependency already exists');
    }
    
    const stmt = db.prepare(`
        INSERT INTO task_dependencies (user_id, task_id, depends_on, created_at)
        VALUES (?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    const result = stmt.run(userId, taskId, dependsOnId, now);
    return result.lastInsertRowid;
}

// Get all dependencies for a user
function getTaskDependencies(userId) {
    const stmt = db.prepare(`
        SELECT id, task_id, depends_on, created_at
        FROM task_dependencies
        WHERE user_id = ?
        ORDER BY created_at ASC
    `);
    
    return stmt.all(userId);
}

// Clear dependencies for a specific task (when task is deleted)
function clearDependenciesForTask(taskId) {
    const stmt = db.prepare(`
        DELETE FROM task_dependencies 
        WHERE task_id = ? OR depends_on = ?
    `);
    
    stmt.run(taskId, taskId);
}

// Check if there are cyclic dependencies
function hasCyclicDependencies(userId) {
    const dependencies = getTaskDependencies(userId);
    if (dependencies.length === 0) return false;
    
    const graph = {};
    for (const dep of dependencies) {
        if (!graph[dep.task_id]) graph[dep.task_id] = [];
        graph[dep.task_id].push(dep.depends_on);
    }
    
    // DFS to detect cycle
    const visited = new Set();
    const recursionStack = new Set();
    
    function hasCycle(node) {
        visited.add(node);
        recursionStack.add(node);
        
        if (graph[node]) {
            for (const neighbor of graph[node]) {
                if (!visited.has(neighbor)) {
                    if (hasCycle(neighbor)) return true;
                } else if (recursionStack.has(neighbor)) {
                    return true;
                }
            }
        }
        
        recursionStack.delete(node);
        return false;
    }
    
    for (const node in graph) {
        if (!visited.has(node)) {
            if (hasCycle(node)) return true;
        }
    }
    
    return false;
}

// Batch update for reminders (improves performance under load)
function markRemindersDeliveredBatch(reminderIds) {
    if (!reminderIds || reminderIds.length === 0) return;
    
    try {
        const placeholders = reminderIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            UPDATE reminders SET delivered = 1 WHERE id IN (${placeholders})
        `);
        stmt.run(...reminderIds);
    } catch (error) {
        console.error('Error in batch marking reminders:', error);
    }
}

// Batch update for deadlines (improves performance under load)
function mark24hRemindersDeliveredBatch(deadlineIds) {
    if (!deadlineIds || deadlineIds.length === 0) return;
    
    try {
        const placeholders = deadlineIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            UPDATE deadlines SET reminder_24h_sent = 1 WHERE id IN (${placeholders})
        `);
        stmt.run(...deadlineIds);
    } catch (error) {
        console.error('Error in batch marking 24h reminders:', error);
    }
}

function mark1hRemindersDeliveredBatch(deadlineIds) {
    if (!deadlineIds || deadlineIds.length === 0) return;
    
    try {
        const placeholders = deadlineIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            UPDATE deadlines SET reminder_1h_sent = 1 WHERE id IN (${placeholders})
        `);
        stmt.run(...deadlineIds);
    } catch (error) {
        console.error('Error in batch marking 1h reminders:', error);
    }
}

module.exports = {
    initDatabase,
    addReminder,
    getDueReminders,
    markReminderDelivered,
    markRemindersDeliveredBatch,
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
    mark24hRemindersDeliveredBatch,
    mark1hRemindersDeliveredBatch,
    updateDeadline,
    removeDeadline,
    clearAllDeadlines,
    createGroup,
    getGroupByName,
    getGroupById,
    listGroupsByGuild,
    deleteGroup,
    addTaskDependency,
    getTaskDependencies,
    clearDependenciesForTask,
    hasCyclicDependencies,
    db,
};
