const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- НАСТРОЙКИ ПОЧТЫ ---
const EMAIL_USER = 'noble.messenger.dev@gmail.com';
const EMAIL_PASS = 'vbeb zxbl dqce dkld';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

// ---------- БАЗА ДАННЫХ SQLITE ----------
let db;
(async () => {
    db = await open({
        filename: path.join(__dirname, 'noble.db'),
        driver: sqlite3.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          username TEXT UNIQUE,
          avatar TEXT,
          bio TEXT,
          public_key TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          sound_enabled BOOLEAN DEFAULT 1,
          preview_enabled BOOLEAN DEFAULT 1,
          language TEXT DEFAULT 'ru'
        );
        CREATE TABLE IF NOT EXISTS chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          is_group BOOLEAN DEFAULT 1,
          encrypted_key TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS chat_members (
          chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (chat_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          iv TEXT,
          salt TEXT,
          ephemeralPublicKey TEXT,
          type TEXT DEFAULT 'text',
          file TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS reactions (
          message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          emoji TEXT NOT NULL,
          PRIMARY KEY (message_id, user_id, emoji)
        );
    `);
    console.log('📁 SQLite база данных готова (PSS)');
})();

// ---------- ВРЕМЕННЫЕ КОДЫ ----------
const codes = {};

app.post('/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    codes[email] = code;

    const mailOptions = {
        from: `"Noble Messenger" <${EMAIL_USER}>`,
        to: email,
        subject: 'Ваш код подтверждения',
        text: `Ваш код для входа в Noble Messenger: ${code}`,
        html: `<h1>Добро пожаловать!</h1><p>Ваш код для входа: <strong>${code}</strong></p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Код отправлен на ${email}: ${code}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отправки письма:', error);
        res.status(500).json({ success: false, devCode: code, error: error.message });
    }
});

app.post('/verify-code', (req, res) => {
    const { email, code } = req.body;
    if (codes[email] === code) {
        delete codes[email];
        return res.json({ success: true });
    }
    res.status(400).json({ success: false });
});

// ---------- ПРОФИЛЬ И НАСТРОЙКИ ----------
app.post('/save-profile', async (req, res) => {
    const { email, name, username, avatar, bio } = req.body;
    try {
        let user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) {
            const result = await db.run(
                'INSERT INTO users (email, name, username, avatar, bio) VALUES (?, ?, ?, ?, ?)',
                [email, name, username, avatar, bio || '']
            );
            const userId = result.lastID;
            await db.run('INSERT INTO user_settings (user_id) VALUES (?)', userId);
            if (username === '@username') {
                let noble = await db.get("SELECT id FROM chats WHERE name = 'Noble' AND is_group = 1");
                if (!noble) {
                    const chat = await db.run("INSERT INTO chats (name, is_group) VALUES ('Noble', 1)");
                    noble = { id: chat.lastID };
                }
                await db.run('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)', [noble.id, userId]);
            }
        } else {
            await db.run(
                'UPDATE users SET name = ?, username = ?, avatar = ?, bio = ? WHERE id = ?',
                [name, username, avatar, bio || '', user.id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сохранения профиля' });
    }
});

app.post('/get-user-full', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await db.get(`
          SELECT u.id, u.email, u.name, u.username, u.avatar, u.bio,
                 s.sound_enabled, s.preview_enabled, s.language
          FROM users u LEFT JOIN user_settings s ON u.id = s.user_id
          WHERE u.email = ?
        `, email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            profile: { name: user.name, username: user.username, avatar: user.avatar, bio: user.bio },
            settings: { soundEnabled: !!user.sound_enabled, previewEnabled: !!user.preview_enabled, language: user.language }
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/save-settings', async (req, res) => {
    const { email, profile, settings } = req.body;
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await db.run('UPDATE users SET name = ?, username = ?, avatar = ?, bio = ? WHERE id = ?',
            [profile.name, profile.username, profile.avatar, profile.bio || '', user.id]);
        await db.run(
            'UPDATE user_settings SET sound_enabled = ?, preview_enabled = ?, language = ? WHERE user_id = ?',
            [settings.soundEnabled ? 1 : 0, settings.previewEnabled ? 1 : 0, settings.language, user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сохранения настроек' });
    }
});

// ---------- PSS: СОХРАНЕНИЕ ПУБЛИЧНОГО КЛЮЧА ----------
app.post('/save-public-key', async (req, res) => {
    const { email, publicKey } = req.body;
    try {
        await db.run('UPDATE users SET public_key = ? WHERE email = ?', [publicKey, email]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сохранения ключа' });
    }
});

app.post('/get-public-key', async (req, res) => {
    const { userId } = req.body;
    try {
        const user = await db.get('SELECT public_key FROM users WHERE id = ?', userId);
        if (!user || !user.public_key) return res.status(404).json({ error: 'Key not found' });
        res.json({ publicKey: user.public_key });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения ключа' });
    }
});

// ---------- ПОИСК ПОЛЬЗОВАТЕЛЕЙ ----------
app.post('/find-user', async (req, res) => {
    const { email, search } = req.body;
    if (!search) return res.json({ found: false });
    try {
        const user = await db.get(
            `SELECT id, name, username, avatar, bio FROM users WHERE username = ?`,
            [search.startsWith('@') ? search : '@' + search]
        );
        if (!user) return res.json({ found: false });
        const current = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (current && user.id === current.id) return res.json({ found: false });
        res.json({ found: true, user });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка поиска' });
    }
});

app.post('/get-user-by-id', async (req, res) => {
    const { userId } = req.body;
    try {
        const user = await db.get('SELECT id, name, username, avatar, bio FROM users WHERE id = ?', userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// ---------- ЧАТЫ ----------
app.post('/get-chats', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await db.get('SELECT id, username FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const chats = await db.all(`
          SELECT c.id, c.name, c.is_group,
            (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
          FROM chats c
          JOIN chat_members cm ON c.id = cm.chat_id
          WHERE cm.user_id = ?
        `, user.id);
        
        const formattedChats = [];
        for (const chat of chats) {
            let displayName = chat.name;
            let avatar = null;
            let otherUserId = null;
            if (!chat.is_group) {
                const other = await db.get(`
                  SELECT u.id, u.name, u.avatar FROM chat_members cm
                  JOIN users u ON cm.user_id = u.id
                  WHERE cm.chat_id = ? AND cm.user_id != ?
                `, [chat.id, user.id]);
                displayName = other ? other.name : 'Приватный чат';
                avatar = other ? other.avatar : null;
                otherUserId = other ? other.id : null;
            }
            formattedChats.push({
                id: chat.id,
                name: displayName,
                is_group: chat.is_group,
                last_message: chat.last_message,
                isNoble: chat.name === 'Noble',
                avatar: avatar,
                otherUserId: otherUserId
            });
        }
        
        formattedChats.sort((a, b) => {
            if (a.isNoble) return -1;
            if (b.isNoble) return 1;
            return a.id - b.id;
        });
        
        res.json(formattedChats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения чатов' });
    }
});

app.post('/create-chat', async (req, res) => {
    const { email, name } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const result = await db.run('INSERT INTO chats (name, is_group) VALUES (?, 1)', name);
        const chatId = result.lastID;
        await db.run('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)', [chatId, user.id]);
        res.json({ success: true, chatId, name });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка создания чата' });
    }
});

app.post('/create-private-chat', async (req, res) => {
    const { email, targetUserId } = req.body;
    try {
        const current = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!current) return res.status(404).json({ error: 'User not found' });
        const userId = current.id;

        const existing = await db.get(`
          SELECT c.id FROM chats c
          JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = ?
          JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = ?
          WHERE c.is_group = 0
        `, [userId, targetUserId]);

        let chatId;
        if (existing) {
            chatId = existing.id;
        } else {
            const result = await db.run(`INSERT INTO chats (name, is_group) VALUES (NULL, 0)`);
            chatId = result.lastID;
            await db.run(`INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)`, [chatId, userId]);
            await db.run(`INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)`, [chatId, targetUserId]);
        }
        res.json({ success: true, chatId });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка создания приватного чата' });
    }
});

app.post('/delete-chat', async (req, res) => {
    const { email, chatId } = req.body;
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const chat = await db.get('SELECT name FROM chats WHERE id = ?', chatId);
        if (chat?.name === 'Noble') return res.status(403).json({ error: 'Cannot delete Noble' });
        const member = await db.get('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', [chatId, user.id]);
        if (!member) return res.status(403).json({ error: 'Access denied' });
        await db.run('DELETE FROM chats WHERE id = ?', chatId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления чата' });
    }
});

// ---------- СООБЩЕНИЯ (с поддержкой PSS) ----------
app.post('/get-messages', async (req, res) => {
    const { email, chatId } = req.body;
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const member = await db.get('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', [chatId, user.id]);
        if (!member) return res.status(403).json({ error: 'Access denied' });
        const messages = await db.all(`
          SELECT m.id, m.text, m.iv, m.salt, m.ephemeralPublicKey, m.type, m.file, m.created_at, u.username, u.avatar,
                 (u.id = ?) as is_me
          FROM messages m
          JOIN users u ON m.user_id = u.id
          WHERE m.chat_id = ?
          ORDER BY m.created_at ASC
        `, [user.id, chatId]);

        const formatted = [];
        for (const m of messages) {
            const reactions = await db.all(
                'SELECT emoji, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY emoji',
                m.id
            );
            const reactionObj = {};
            reactions.forEach(r => { reactionObj[r.emoji] = r.count; });
            formatted.push({
                id: m.id,
                text: m.text,
                iv: m.iv,
                salt: m.salt,
                ephemeralPublicKey: m.ephemeralPublicKey,
                type: m.is_me ? 'me' : 'other',
                sender: m.username,
                avatar: m.avatar,
                time: m.created_at,
                file: m.file,
                reactions: reactionObj
            });
        }
        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения сообщений' });
    }
});

app.post('/send-message', async (req, res) => {
    const { email, chatId, text, iv, salt, ephemeralPublicKey, type = 'text', file } = req.body;
    if (!text && !file) return res.status(400).json({ error: 'Пустое сообщение' });
    try {
        const user = await db.get('SELECT id, username FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const member = await db.get('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', [chatId, user.id]);
        if (!member) return res.status(403).json({ error: 'Access denied' });

        const messageText = file ? (text || 'Файл') : text;
        const result = await db.run(
            `INSERT INTO messages (chat_id, user_id, text, iv, salt, ephemeralPublicKey, type, file)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [chatId, user.id, messageText, iv || null, salt || null, ephemeralPublicKey || null, type, file || null]
        );
        const msgId = result.lastID;
        
        const members = await db.all('SELECT user_id FROM chat_members WHERE chat_id = ?', chatId);
        const outMsg = JSON.stringify({
            type: 'new_message',
            chatId,
            message: {
                id: msgId,
                text: messageText,
                iv, salt, ephemeralPublicKey,
                type: 'other',
                sender: user.username,
                file: file || null
            }
        });
        members.forEach(m => {
            const client = clients.get(m.user_id);
            if (client && client.readyState === WebSocket.OPEN) client.send(outMsg);
        });
        
        res.json({ success: true, messageId: msgId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка отправки сообщения' });
    }
});

app.post('/delete-message', async (req, res) => {
    const { email, messageId } = req.body;
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const msg = await db.get('SELECT chat_id, user_id FROM messages WHERE id = ?', messageId);
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        if (msg.user_id !== user.id) return res.status(403).json({ error: 'Access denied' });
        await db.run('DELETE FROM messages WHERE id = ?', messageId);
        const members = await db.all('SELECT user_id FROM chat_members WHERE chat_id = ?', msg.chat_id);
        const outMsg = JSON.stringify({ type: 'message_deleted', chatId: msg.chat_id, messageId });
        members.forEach(m => {
            const client = clients.get(m.user_id);
            if (client && client.readyState === WebSocket.OPEN) client.send(outMsg);
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

app.post('/edit-message', async (req, res) => {
    const { email, messageId, text, iv, salt, ephemeralPublicKey } = req.body;
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const msg = await db.get('SELECT chat_id, user_id FROM messages WHERE id = ?', messageId);
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        if (msg.user_id !== user.id) return res.status(403).json({ error: 'Access denied' });
        await db.run(
            `UPDATE messages SET text = ?, iv = ?, salt = ?, ephemeralPublicKey = ? WHERE id = ?`,
            [text, iv || null, salt || null, ephemeralPublicKey || null, messageId]
        );
        const members = await db.all('SELECT user_id FROM chat_members WHERE chat_id = ?', msg.chat_id);
        const outMsg = JSON.stringify({
            type: 'message_updated',
            chatId: msg.chat_id,
            messageId,
            text, iv, salt, ephemeralPublicKey
        });
        members.forEach(m => {
            const client = clients.get(m.user_id);
            if (client && client.readyState === WebSocket.OPEN) client.send(outMsg);
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка редактирования' });
    }
});

// ---------- РЕАКЦИИ ----------
app.post('/add-reaction', async (req, res) => {
    const { email, messageId, emoji } = req.body;
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const existing = await db.get(
            'SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
            [messageId, user.id, emoji]
        );
        if (existing) {
            await db.run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, user.id, emoji]);
        } else {
            await db.run('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [messageId, user.id, emoji]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка реакции' });
    }
});

// ---------- WEBSOCKET ----------
const wss = new WebSocket.Server({ port: 3001 });
const clients = new Map();

function broadcastStatus(userId, online) {
    const msg = JSON.stringify({ type: 'status', userId, online });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

wss.on('connection', (ws) => {
    console.log('WebSocket подключен');
    ws.on('message', async (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'auth') {
                const user = await db.get('SELECT id FROM users WHERE email = ?', data.email);
                if (user) {
                    ws.userId = user.id;
                    ws.email = data.email;
                    clients.set(user.id, ws);
                    ws.send(JSON.stringify({ type: 'auth_success' }));
                    broadcastStatus(user.id, true);
                }
            } else if (data.type === 'typing' && ws.userId) {
                const { chatId, isTyping } = data;
                const members = await db.all(`SELECT user_id FROM chat_members WHERE chat_id = ?`, chatId);
                members.forEach(m => {
                    const client = clients.get(m.user_id);
                    if (client && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'typing', chatId, userId: ws.userId, isTyping }));
                    }
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        if (ws.userId) {
            clients.delete(ws.userId);
            broadcastStatus(ws.userId, false);
        }
    });
});

app.listen(3000, () => {
    console.log('🚀 Сервер запущен на http://localhost:3000');
    console.log('📡 WebSocket на ws://localhost:3001');
});