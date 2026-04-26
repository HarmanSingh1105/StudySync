# StudySync Bot - Complete Documentation

A comprehensive Discord bot for students to manage study reminders, to-do lists, assignment deadlines, task dependencies, and study groups all in one place.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Installation & Setup](#installation--setup)
4. [Running the Bot](#running-the-bot)
5. [Features & Commands](#features--commands)
   - [Study Reminders](#study-reminders)
   - [Study To-Do List](#study-to-do-list)
   - [Assignment Deadlines](#assignment-deadlines)
   - [Task Dependencies](#task-dependencies)
   - [Study Groups](#study-groups)
6. [Supported Time Formats](#supported-time-formats)
7. [File Structure](#file-structure)
8. [How It Works](#how-it-works)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create .env file with your Discord bot token
echo "DISCORD_TOKEN=your_bot_token_here" > .env
echo "CLIENT_ID=your_client_id_here" >> .env
echo "GUILD_ID=your_server_id_here" >> .env

# 3. Start the bot
nodemon
```

---

## Prerequisites

### What You Need

1. **Node.js** (v16 or later)
   - Download from [nodejs.org](https://nodejs.org)
   - Verify installation: `node --version`

2. **A Discord Server**
   - Any server you can test in (create a private one or use existing)

3. **A Discord Bot Application**
   - Created via [Discord Developer Portal](https://discord.com/developers/applications)

### Creating a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it (e.g., "StudySync")
3. Go to "Bot" tab → Click "Add Bot"
4. Under TOKEN, click "Copy" and save it securely
5. Enable these **Privileged Gateway Intents:**
   - Message Content Intent
6. Go to OAuth2 → URL Generator
7. Select scopes: `bot`
8. Select permissions:
   - Manage Roles
   - Manage Channels
   - Send Messages
   - Embed Links
9. Copy the generated URL and open it in your browser to invite the bot to your server

---

## Installation & Setup

### Step 1: Clone or Download the Project

```bash
cd /path/to/StudySync
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- `discord.js` - Discord bot framework
- `better-sqlite3` - Local SQLite database
- `dotenv` - Environment variables

### Step 3: Create Environment File

Create a `.env` file in the project root:

```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_server_id_here
```

Get these values from:
- **DISCORD_TOKEN**: Discord Developer Portal → Bot → TOKEN
- **CLIENT_ID**: Discord Developer Portal → General Information → APPLICATION ID
- **GUILD_ID**: Your Discord server ID (Enable Developer Mode in Discord settings, right-click server, "Copy Server ID")

### Step 4: Verify Installation

```bash
npm install
```

You should see no errors during installation.

---

## Running the Bot

```bash
nodemon
```

You should see:
```
YourBotName is online!
✅ Reminder check loop started!
✅ Deadline reminder loop started!
```

The database file (`data/reminders.db`) is created automatically on first run.

The bot will automatically restart when you make code changes (thanks to nodemon).

---

## Features & Commands

### Study Reminders

Schedule one-time study reminders and get notified at the right time.

#### `/studyremind`
Schedule a study reminder.

**Parameters:**
- `title` (required): What to study
- `reminder_time` (required): When to remind
- `notes` (optional): Additional details

**Examples:**
```
/studyremind title: "Calculus Chapter 5" reminder_time: "10m"
/studyremind title: "Physics review" reminder_time: "7:00pm" notes: "Focus on kinematics"
/studyremind title: "Essay outline" reminder_time: "2026-04-15 19:00"
```

#### `/myreminders`
View all your pending reminders with IDs and times.

**Example:**
```
/myreminders
```
Shows: All your scheduled reminders with their IDs and exact delivery times.

#### `/cancelreminder`
Delete a specific reminder by its ID.

**Parameters:**
- `reminder_id` (required): The ID from `/myreminders`

**Example:**
```
/cancelreminder reminder_id: 5
```

---

### Study To-Do List

Manage your study tasks and track completion.

#### `/addtask`
Add a new task to your to-do list.

**Parameters:**
- `task` (required): The task description
- `subject` (optional): Course or subject name
- `due_date` (optional): When it's due (YYYY-MM-DD format)

**Examples:**
```
/addtask task: "Read Chapter 5"
/addtask task: "Study for midterm" subject: "Calculus" due_date: "2026-04-20"
/addtask task: "Complete essay" subject: "English" due_date: "2026-04-12"
```

#### `/tasks`
View all your pending and completed tasks.

**Status indicators:**
- ⬜ = Pending task
- ✅ = Completed task

**Example:**
```
/tasks
```
Shows: All tasks with ID, status, subject, and due date.

#### `/completetask`
Mark a task as completed.

**Parameters:**
- `task_id` (required): The ID from `/tasks`

**Example:**
```
/completetask task_id: 1
```

#### `/removetask`
Delete a task from your list.

**Parameters:**
- `task_id` (required): The ID from `/tasks`

**Example:**
```
/removetask task_id: 3
```

#### `/cleartasks`
Delete all your tasks at once.

**Warning:** Cannot be undone!

**Example:**
```
/cleartasks
```

---

### Assignment Deadlines

Comprehensive deadline management with automatic reminders 24 hours and 1 hour before due date.

#### `/adddeadline`
Add a new assignment deadline.

**Parameters:**
- `title` (required): Assignment name
- `due_date` (required): When it's due (YYYY-MM-DD or YYYY-MM-DD HH:mm in UTC)
- `subject` (optional): Course name
- `notes` (optional): Additional details

**Examples:**
```
/adddeadline title: "Math Midterm" due_date: "2026-04-20"
/adddeadline title: "Physics Project" due_date: "2026-04-20 23:59" subject: "Physics 201" notes: "Group project"
/adddeadline title: "Essay due" due_date: "2026-04-15 14:00" subject: "English"
```

#### `/deadlines`
View all your saved deadlines sorted by due date.

**Status indicators:**
- ⏳ Normal deadline
- 🟠 Due within 72 hours
- 🔴 Due within 24 hours
- ❌ Past due

**Example:**
```
/deadlines
```

#### `/upcoming`
View only deadlines due within the next 7 days.

Shows time remaining in days or hours, sorted by nearest due date first.

**Example:**
```
/upcoming
```

#### `/updatedeadline`
Update an existing deadline.

**Parameters:**
- `deadline_id` (required): ID from `/deadlines`
- `title` (optional): New title
- `due_date` (optional): New due date
- `subject` (optional): New subject
- `notes` (optional): New notes

**Example:**
```
/updatedeadline deadline_id: 5 due_date: "2026-04-25 14:00" notes: "Extended deadline"
```

#### `/removedeadline`
Delete a specific deadline by ID.

**Parameters:**
- `deadline_id` (required): ID from `/deadlines`

**Example:**
```
/removedeadline deadline_id: 3
```

#### `/cleardeadlines`
Delete all your deadlines at once.

**Warning:** Cannot be undone!

**Example:**
```
/cleardeadlines
```

#### Automatic Reminders

The bot automatically sends deadline reminders:

- **24 hours before:** Friendly reminder with assignment name and due date
- **1 hour before:** Last chance reminder

Reminders are sent via DM (falls back to channel if DM unavailable). Each reminder is only sent once per deadline.

---

### Task Dependencies

Create dependencies between tasks to enforce completion order (prevents circular dependencies).

#### `/adddependency`
Make one task depend on another.

**Parameters:**
- `task_id` (required): The task that will depend on another
- `depends_on_task_id` (required): The task that must be completed first

**Example:**
```
/adddependency task_id: 2 depends_on_task_id: 1
```
Task 2 now depends on Task 1 being completed first.

#### `/schedule`
View all your tasks in dependency order.

Shows tasks organized by their dependencies, helping you see what to work on first.

**Example:**
```
/schedule
```

---

### Study Groups

Create and manage study groups for collaborative learning.

#### `/creategroup`
Create a new study group.

**Parameters:**
- `name` (required): Group name

**Example:**
```
/creategroup name: "Calculus Study Group"
```

The bot automatically creates:
- A Discord role for the group
- A Discord channel for group discussions

#### `/joingroup`
Join an existing study group.

**Parameters:**
- `name` (required): Exact group name

**Example:**
```
/joingroup name: "Calculus Study Group"
```

You'll be added to the group role and channel.

#### `/leavegroup`
Leave a study group.

**Parameters:**
- `name` (required): Exact group name

**Example:**
```
/leavegroup name: "Calculus Study Group"
```

Your role access will be removed.

#### `/deletegroup`
Delete a study group (group owner only).

**Parameters:**
- `name` (required): Exact group name

**Example:**
```
/deletegroup name: "Calculus Study Group"
```

Deletes the group, its role, and its channel.

#### `/listallgroups`
View all study groups in your server with pagination.

Shows all available groups that you can join, with details about each group. Navigate through multiple groups if there are many.

**Example:**
```
/listallgroups
```

Shows all study groups in the server with group owner information.

---

## Supported Time Formats

### For Reminders (`/studyremind`)

| Format | Example | Means |
|--------|---------|-------|
| Relative | `10m` | 10 minutes from now |
| Relative | `1h` | 1 hour from now |
| Relative | `2h30m` | 2 hours 30 minutes from now |
| 12-hour | `7:00pm` | 7:00 PM today (or tomorrow if past) |
| 12-hour | `2:30am` | 2:30 AM (next occurrence) |
| 24-hour | `19:00` | 7:00 PM today (or tomorrow if past) |
| 24-hour | `14:30` | 2:30 PM today |
| ISO | `2026-04-10 19:00` | April 10, 2026 at 7:00 PM UTC |

### For Deadlines (`/adddeadline`)

| Format | Example | Means |
|--------|---------|-------|
| Date only | `2026-04-15` | April 15, 2026 at 11:59 PM UTC |
| Date + time | `2026-04-15 14:00` | April 15, 2026 at 2:00 PM UTC |
| Date + time | `2026-04-15 23:59` | April 15, 2026 at 11:59 PM UTC |

**Note:** All times are in UTC. Verify your timezone!

---

## File Structure

```
StudySync/
├── src/
│   ├── index.js                    # Main bot file with all command handlers
│   ├── register-commands.js        # Slash command registration
│   ├── database.js                 # SQLite database operations
│   ├── reminder-parser.js          # Time format parsing for reminders
│   ├── deadline-parser.js          # Date format parsing for deadlines
│   ├── reminder-loop.js            # Background task for study reminders (30s check)
│   └── deadline-reminders.js       # Background task for deadline reminders (60s check)
├── data/
│   └── reminders.db                # SQLite database (created automatically)
├── package.json                    # Node.js dependencies
├── .env                            # Environment variables (bot token, IDs)
├── .gitignore                      # Excludes sensitive files from git
├── README.md                       # This file
├── SETUP.md                        # Legacy setup file
├── TODO_LIST_GUIDE.md              # Legacy task documentation
└── DEADLINE_GUIDE.md               # Legacy deadline documentation
```

---

## How It Works

### Database

- Uses **SQLite** via `better-sqlite3` for local, persistent storage
- Single database file: `data/reminders.db`
- Created automatically on first bot startup
- No external database server required
- All data persists across bot restarts

### Tables

1. **reminders** - Study reminder scheduling
2. **tasks** - To-do list items
3. **deadlines** - Assignment deadlines
4. **task_dependencies** - Task completion order
5. **groups** - Study groups and members

### Background Tasks

**Study Reminder Loop** (checks every 30 seconds)
1. Queries all due reminders for current time
2. Sends DM notification to user
3. Falls back to channel message if DM fails
4. Marks reminder as delivered

**Deadline Reminder Loop** (checks every 60 seconds)
1. Checks for deadlines 24 hours away → sends reminder (once)
2. Checks for deadlines 1 hour away → sends reminder (once)
3. Sends via DM or falls back to channel
4. Tracks sent reminders to prevent duplicates

### Workflow Examples

**Study Reminder:**
1. User: `/studyremind title: "Study math" reminder_time: "10m"`
2. Bot: Parses time, stores in database
3. Bot: Checks every 30 seconds for due reminders
4. When due: Bot sends DM with reminder
5. Reminder persists across restarts

**Deadline with Auto-Reminder:**
1. User: `/adddeadline title: "Essay" due_date: "2026-04-15 23:59"`
2. Bot: Stores deadline in database
3. At 23:59 - 24h: Bot sends 24-hour reminder
4. At 23:59 - 1h: Bot sends 1-hour reminder
5. Both reminders sent automatically, once each
6. Deadline persists across restarts

**Task with Dependencies:**
1. User: `/addtask task: "Read chapter"`
2. User: `/addtask task: "Answer questions"`
3. User: `/adddependency task_id: 2 depends_on_task_id: 1`
4. User: `/schedule` - Shows Task 1 must be done first

**Study Group:**
1. User A: `/creategroup name: "Calculus Group"`
2. Bot: Creates role and channel
3. User B: `/joingroup name: "Calculus Group"`
4. Both can now access the group channel
5. User A: `/deletegroup name: "Calculus Group"` - Deletes everything

---

## Troubleshooting

### Bot Won't Start

**Error: "Cannot find module"**
- Solution: Run `npm install` to install dependencies

**Error: "DISCORD_TOKEN is not defined"**
- Solution: Create `.env` file with your bot token
- Check that `.env` file is in the project root directory

**Error: "Client is not defined"**
- Solution: Make sure you're running from the project directory
- Try: `nodemon` instead of `node src/index.js`

### Bot Goes Online But No Commands Appear

**Commands not showing in Discord**
- Solution: Restart Discord client (Ctrl+R or Cmd+R)
- Wait a few seconds for commands to sync
- Make sure bot has permissions in your server

**"Application did not respond"**
- Solution: Bot might have crashed
- Check console for error messages
- Restart the bot: `nodemon`

### Reminders Not Sending

**Not receiving reminder notifications**
- Make sure bot is running
- Check if DMs are enabled (bot needs permission)
- Verify reminder time hasn't passed
- Bot must be running when reminder time occurs

**"Cannot send DM to user"**
- Bot will automatically send to channel instead
- User may have DMs disabled from bots

### Deadlines Not Reminding

**Not getting 24h or 1h reminders**
- Make sure bot has "Send Messages" permission
- Check console for error messages
- Verify deadline is in the future
- Times are in UTC - verify your timezone
- Bot must be running at reminder time

**Reminders sent multiple times**
- Try `/cleardeadlines` and re-add them
- Restart the bot

### Database Issues

**"Database is locked"**
- Multiple bots trying to access same database
- Solution: Use different database files or one bot instance

**"Cannot read property of undefined"**
- Database might be corrupted
- Solution: Delete `data/reminders.db` and restart bot
- This will create a fresh database (all data will be lost)

### Permission Errors

**"Missing Bot Permissions"**
- Bot needs certain Discord permissions to work
- Required: Manage Roles, Manage Channels, Send Messages, Embed Links
- Go to Discord Developer Portal → OAuth2 → URL Generator → Update permissions

**"You don't have permission to use this command"**
- Only group owner can delete groups
- Verify you're the group creator

### Time/Timezone Issues

**Reminders firing at wrong time**
- All times are in UTC
- Make sure you're accounting for your timezone
- Relative times (10m, 1h) are always accurate regardless of timezone

**"Deadline cannot be in the past"**
- Your due date is before current time
- Verify the date and check your timezone

---

## Additional Notes

### Data Privacy

- All data is stored locally in `data/reminders.db`
- No external services or cloud storage
- Each user's data is private (user_id based separation)
- Database file should be added to `.gitignore` (already done)

### Performance

- Reminder checks: Every 30 seconds
- Deadline checks: Every 60 seconds
- Lightweight database queries
- Suitable for 100+ concurrent users

### Security

- Keep your `.env` file private
- Don't commit `.env` to version control
- Bot token is sensitive - regenerate if exposed
- `.gitignore` already excludes `.env` and `data/`

---

## Getting Help

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Review console output for error messages
3. Verify all prerequisites are installed
4. Make sure `.env` file is configured correctly
5. Try restarting the bot: `nodemon`

---

## Project Structure Summary

| File | Purpose |
|------|---------|
| `index.js` | Main bot logic and command handlers (~550 lines) |
| `database.js` | All database operations (~500 lines) |
| `register-commands.js` | Slash command registration (~200 lines) |
| `reminder-parser.js` | Parse time formats (10m, 7:00pm, etc.) |
| `deadline-parser.js` | Parse deadline formats (YYYY-MM-DD, etc.) |
| `reminder-loop.js` | Background task checking reminders |
| `deadline-reminders.js` | Background task checking deadlines |

All source code is ~2000 lines total, well-organized and documented.

---

**Last Updated:** April 25, 2026
**Version:** 1.0 (Complete with listallgroups feature)
