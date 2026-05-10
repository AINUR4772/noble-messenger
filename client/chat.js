// chat.js — стабильная версия Noble V 1.0.5 (без PSS, восстановление интерфейса)

// ---------- Глобальные переменные ----------
let profile = JSON.parse(localStorage.getItem('noble_profile')) || { name: 'User', username: '@user', avatar: 'https://via.placeholder.com/50', bio: '' };
let settings = JSON.parse(localStorage.getItem('noble_settings')) || { soundEnabled: true, previewEnabled: true, language: 'ru' };
const userEmail = localStorage.getItem('noble_email');
let activeChatId = null;
let chats = [];
let messages = [];
let onlineUsers = new Map();

const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatsListEl = document.getElementById('chatsList');
const currentChatNameEl = document.getElementById('currentChatName');
const chatStatusEl = document.getElementById('chatStatus');
const myNameEl = document.getElementById('myName');
const myUsernameEl = document.getElementById('myUsername');
const myAvatarEl = document.getElementById('myAvatar');
const addChatBtn = document.getElementById('addChatBtn');
const searchInput = document.getElementById('searchInput');
const modeBtns = document.querySelectorAll('.mode-btn');
const fileUpload = document.getElementById('fileUpload');

// Панель профиля
const profileToggle = document.getElementById('profileToggle');
const profilePanel = document.getElementById('profilePanel');
const closePanelBtn = document.getElementById('closePanelBtn');
const panelAvatar = document.getElementById('panelAvatar');
const panelName = document.getElementById('panelName');
const panelUsername = document.getElementById('panelUsername');
const panelBio = document.getElementById('panelBio');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const avatarUpload = document.getElementById('avatarUpload');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const notificationSettingsBtn = document.getElementById('notificationSettingsBtn');
const notificationsModal = document.getElementById('notificationsModal');
const soundEnabledCheck = document.getElementById('soundEnabledCheck');
const previewEnabledCheck = document.getElementById('previewEnabledCheck');
const saveNotificationsBtn = document.getElementById('saveNotificationsBtn');
const closeModalBtns = document.querySelectorAll('.close-modal');

// Профиль собеседника
const userProfileModal = document.getElementById('userProfileModal');
const userProfileAvatar = document.getElementById('userProfileAvatar');
const userProfileName = document.getElementById('userProfileName');
const userProfileUsername = document.getElementById('userProfileUsername');
const userProfileBio = document.getElementById('userProfileBio');
const sendMessageFromProfileBtn = document.getElementById('sendMessageFromProfileBtn');

// Контекстное меню
const messageContextMenu = document.getElementById('messageContextMenu');
const reactionMenu = document.getElementById('reactionMenu');
let currentMessageId = null;
let currentMessageText = '';
let currentMessageType = '';

let ws, wsReconnectTimer;
let currentMode = 'chats';
let currentTargetUserId = null;

// ---------- Инициализация ----------
function updateProfileUI() {
  myNameEl.textContent = profile.name;
  myUsernameEl.textContent = profile.username;
  myAvatarEl.src = profile.avatar;
  panelAvatar.src = profile.avatar;
  panelName.value = profile.name;
  panelUsername.value = profile.username.replace('@', '');
  panelBio.value = profile.bio || '';
}
updateProfileUI();

async function loadChats() {
  try {
    const res = await fetch('http://localhost:3000/get-chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    const data = await res.json();
    chats = data.map(c => ({
      id: c.id,
      name: c.name,
      isGroup: c.is_group,
      avatarLetter: c.name ? c.name[0].toUpperCase() : 'P',
      lastMessage: c.last_message || 'Нет сообщений',
      isNoble: c.isNoble,
      avatar: c.avatar,
      otherUserId: c.otherUserId
    }));
    if (chats.length > 0 && !activeChatId) {
      activeChatId = chats[0].id;
      updateChatHeader();
      await loadMessages(activeChatId);
    }
    renderChats();
  } catch (err) {
    console.error('Ошибка загрузки чатов', err);
  }
}

async function loadMessages(chatId) {
  try {
    const res = await fetch('http://localhost:3000/get-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, chatId })
    });
    const data = await res.json();
    messages = data;
    renderMessages();
  } catch (err) {
    console.error('Ошибка загрузки сообщений', err);
  }
}

function renderChats() {
  if (currentMode !== 'chats') return;
  const filter = searchInput.value.trim().toLowerCase();
  const filtered = chats.filter(c => c.name.toLowerCase().includes(filter));
  chatsListEl.innerHTML = '';
  filtered.forEach(chat => {
    const div = document.createElement('div');
    div.className = `chat-item ${chat.id === activeChatId ? 'active' : ''} ${chat.isNoble ? 'noble' : ''}`;
    div.dataset.id = chat.id;
    
    const avatarHtml = chat.avatar 
      ? `<img class="chat-avatar-img" src="${chat.avatar}" data-userid="${chat.otherUserId || ''}">`
      : `<div class="chat-avatar">${chat.avatarLetter}</div>`;
    
    div.innerHTML = `
      ${avatarHtml}
      <div class="chat-info">
        <div class="chat-name">
          ${chat.name}
          ${chat.isNoble ? '<i class="fas fa-check-circle"></i>' : ''}
        </div>
        <div class="chat-last">${chat.lastMessage}</div>
      </div>
      ${!chat.isNoble ? `<div class="delete-chat" data-id="${chat.id}">✕</div>` : ''}
    `;
    
    const avatarImg = div.querySelector('.chat-avatar-img');
    if (avatarImg) {
      avatarImg.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = avatarImg.dataset.userid;
        if (userId) showUserProfile(userId);
      });
    }
    
    div.addEventListener('click', (e) => {
      if (e.target.closest('.delete-chat')) return;
      activeChatId = chat.id;
      updateChatHeader();
      loadMessages(chat.id);
      renderChats();
    });
    chatsListEl.appendChild(div);
  });

  document.querySelectorAll('.delete-chat').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm('Удалить чат?')) return;
      try {
        await fetch('http://localhost:3000/delete-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, chatId: id })
        });
        await loadChats();
        if (activeChatId === id) {
          activeChatId = chats[0]?.id;
          updateChatHeader();
          if (activeChatId) loadMessages(activeChatId);
        }
      } catch (err) {
        alert('Ошибка удаления чата');
      }
    });
  });
}

function renderMessages() {
  messagesContainer.innerHTML = '';
  messages.forEach(msg => {
    const div = document.createElement('div');
    div.classList.add('msg', msg.type);
    div.dataset.messageId = msg.id;
    div.dataset.messageText = msg.text;
    div.dataset.messageType = msg.type;
    
    if (msg.file) {
      div.classList.add('file');
      const isImage = msg.file.startsWith('data:image/');
      if (isImage) {
        div.innerHTML = `<img src="${msg.file}" alt="image" loading="lazy" style="max-width:250px;max-height:250px;border-radius:12px;margin-top:5px;cursor:pointer;">`;
      } else {
        const fileName = msg.text || 'Файл';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let icon = 'fa-file';
        if (['pdf'].includes(ext)) icon = 'fa-file-pdf';
        else if (['doc','docx'].includes(ext)) icon = 'fa-file-word';
        else if (['xls','xlsx'].includes(ext)) icon = 'fa-file-excel';
        else if (['zip','rar','7z','tar','gz'].includes(ext)) icon = 'fa-file-archive';
        else if (['apk'].includes(ext)) icon = 'fa-android';
        else if (['png','jpg','jpeg','gif','webp'].includes(ext)) icon = 'fa-file-image';
        else icon = 'fa-file';
        
        div.innerHTML = `
          <div class="file-info">
            <i class="fas ${icon}"></i>
            <span>${fileName}</span>
          </div>
        `;
      }
    } else {
      div.textContent = msg.text;
    }
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'reactions';
    if (msg.reactions) {
      Object.entries(msg.reactions).forEach(([emoji, count]) => {
        const span = document.createElement('span');
        span.className = 'reaction';
        span.textContent = `${emoji} ${count}`;
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          addReaction(msg.id, emoji);
        });
        reactionsDiv.appendChild(span);
      });
    }
    div.appendChild(reactionsDiv);
    
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      currentMessageId = msg.id;
      currentMessageText = msg.text;
      currentMessageType = msg.type;
      
      const editItem = messageContextMenu.querySelector('[data-action="edit"]');
      const deleteItem = messageContextMenu.querySelector('[data-action="delete"]');
      if (msg.type === 'me') {
        editItem.style.display = 'flex';
        deleteItem.style.display = 'flex';
      } else {
        editItem.style.display = 'none';
        deleteItem.style.display = 'none';
      }
      
      messageContextMenu.style.left = e.clientX + 'px';
      messageContextMenu.style.top = e.clientY + 'px';
      messageContextMenu.classList.add('show');
    });
    
    messagesContainer.appendChild(div);
  });
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function addReaction(messageId, emoji) {
  try {
    await fetch('http://localhost:3000/add-reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, messageId, emoji })
    });
    loadMessages(activeChatId);
  } catch (e) {
    console.error('Ошибка реакции');
  }
}

function updateChatHeader() {
  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;
  currentChatNameEl.innerHTML = chat.name + (chat.isNoble ? ' <i class="fas fa-check-circle"></i>' : '');
  chatStatusEl.textContent = '';
}

async function sendMessage(text = null, file = null, fileName = null) {
  if (!text && !file) return;
  const body = { email: userEmail, chatId: activeChatId };
  if (file) {
    body.type = 'file';
    body.file = file;
    body.text = fileName || 'Файл';
  } else {
    body.text = text;
  }
  
  try {
    const res = await fetch('http://localhost:3000/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error();
    messageInput.value = '';
    await loadMessages(activeChatId);
  } catch (err) {
    alert('Не удалось отправить');
  }
}

function connectWebSocket() {
  ws = new WebSocket('ws://localhost:3001');
  ws.onopen = () => {
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    ws.send(JSON.stringify({ type: 'auth', email: userEmail }));
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message') {
        if (data.chatId === activeChatId) {
          if (data.message.sender !== profile.username) {
            loadMessages(activeChatId);
          }
        } else {
          loadChats();
        }
      } else if (data.type === 'status') {
        onlineUsers.set(data.userId, data.online);
        updateChatHeader();
      } else if (data.type === 'typing' && data.chatId === activeChatId) {
        chatStatusEl.textContent = data.isTyping ? 'печатает...' : '';
      } else if (data.type === 'message_deleted' || data.type === 'message_updated') {
        if (data.chatId === activeChatId) loadMessages(activeChatId);
        loadChats();
      }
    } catch (e) {}
  };
  ws.onclose = () => { wsReconnectTimer = setTimeout(connectWebSocket, 3000); };
}

async function searchUsers(query) {
  if (!query.startsWith('@')) query = '@' + query;
  try {
    const res = await fetch('http://localhost:3000/find-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, search: query })
    });
    const data = await res.json();
    if (data.found) {
      chatsListEl.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'user-search-item';
      div.innerHTML = `
        <img class="user-avatar" src="${data.user.avatar}">
        <div class="user-info">
          <div class="user-name">${data.user.name}</div>
          <div class="user-username">${data.user.username}</div>
        </div>
      `;
      div.addEventListener('click', () => showUserProfile(data.user.id));
      chatsListEl.appendChild(div);
    } else {
      chatsListEl.innerHTML = '<div style="padding:20px;color:gray;text-align:center;">Пользователь не найден</div>';
    }
  } catch (err) {
    console.error(err);
  }
}

async function showUserProfile(userId) {
  try {
    const res = await fetch('http://localhost:3000/get-user-by-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (data.user) {
      currentTargetUserId = userId;
      userProfileAvatar.src = data.user.avatar;
      userProfileName.textContent = data.user.name;
      userProfileUsername.textContent = data.user.username;
      userProfileBio.textContent = data.user.bio || 'Информация отсутствует';
      userProfileModal.classList.add('active');
    }
  } catch (err) {
    console.error('Ошибка загрузки профиля', err);
  }
}

// Контекстное меню
messageContextMenu.addEventListener('click', async (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  messageContextMenu.classList.remove('show');
  
  if (action === 'copy') {
    navigator.clipboard?.writeText(currentMessageText);
  } else if (action === 'delete') {
    if (!confirm('Удалить сообщение?')) return;
    await fetch('http://localhost:3000/delete-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, messageId: currentMessageId })
    });
    loadMessages(activeChatId);
  } else if (action === 'edit') {
    const newText = prompt('Редактировать сообщение:', currentMessageText);
    if (newText && newText !== currentMessageText) {
      await fetch('http://localhost:3000/edit-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, messageId: currentMessageId, text: newText })
      });
      loadMessages(activeChatId);
    }
  } else if (action === 'reactions') {
    const rect = e.target.getBoundingClientRect();
    reactionMenu.style.left = rect.left + 'px';
    reactionMenu.style.top = (rect.top - 50) + 'px';
    reactionMenu.classList.add('show');
    return;
  }
});

document.addEventListener('click', (e) => {
  if (!messageContextMenu.contains(e.target)) messageContextMenu.classList.remove('show');
  if (!reactionMenu.contains(e.target)) reactionMenu.classList.remove('show');
});

reactionMenu.querySelectorAll('.reaction-menu-item').forEach(item => {
  item.addEventListener('click', async (e) => {
    const emoji = item.dataset.emoji;
    if (currentMessageId) await addReaction(currentMessageId, emoji);
    reactionMenu.classList.remove('show');
  });
});

sendMessageFromProfileBtn.addEventListener('click', async () => {
  if (!currentTargetUserId) return;
  const res = await fetch('http://localhost:3000/create-private-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, targetUserId: currentTargetUserId })
  });
  const data = await res.json();
  if (data.success) {
    await loadChats();
    activeChatId = data.chatId;
    updateChatHeader();
    loadMessages(data.chatId);
    userProfileModal.classList.remove('active');
    currentMode = 'chats';
    modeBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-mode="chats"]').classList.add('active');
  }
});

sendBtn.addEventListener('click', () => sendMessage(messageInput.value.trim()));
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(messageInput.value.trim()); });
addChatBtn.addEventListener('click', async () => {
  const name = prompt('Название чата:');
  if (!name) return;
  try {
    await fetch('http://localhost:3000/create-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, name })
    });
    await loadChats();
  } catch (err) { alert('Ошибка создания чата'); }
});

modeBtns.forEach(btn => btn.addEventListener('click', () => {
  modeBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentMode = btn.dataset.mode;
  searchInput.value = '';
  searchInput.placeholder = currentMode === 'chats' ? 'Поиск чатов...' : 'Поиск по @username...';
  if (currentMode === 'chats') renderChats();
  else chatsListEl.innerHTML = '<div style="padding:20px;color:gray;text-align:center;">Введите @username</div>';
}));

searchInput.addEventListener('input', (e) => {
  const val = e.target.value.trim();
  if (currentMode === 'chats') renderChats();
  else if (val.length > 0) searchUsers(val);
  else chatsListEl.innerHTML = '<div style="padding:20px;color:gray;text-align:center;">Введите @username</div>';
});

fileUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => sendMessage(null, ev.target.result, file.name);
  reader.readAsDataURL(file);
  fileUpload.value = '';
});

profileToggle.addEventListener('click', () => profilePanel.classList.add('open'));
closePanelBtn.addEventListener('click', () => profilePanel.classList.remove('open'));
changeAvatarBtn.addEventListener('click', () => avatarUpload.click());
avatarUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => panelAvatar.src = ev.target.result;
    reader.readAsDataURL(file);
  }
});
saveProfileBtn.addEventListener('click', async () => {
  const newName = panelName.value.trim();
  const newUsername = panelUsername.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
  const newBio = panelBio.value.trim();
  if (!newName || !newUsername) return alert('Заполните обязательные поля');
  profile.name = newName;
  profile.username = '@' + newUsername;
  profile.avatar = panelAvatar.src;
  profile.bio = newBio;
  updateProfileUI();
  localStorage.setItem('noble_profile', JSON.stringify(profile));
  await fetch('http://localhost:3000/save-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, profile, settings })
  });
  profilePanel.classList.remove('open');
});

notificationSettingsBtn.addEventListener('click', () => {
  soundEnabledCheck.checked = settings.soundEnabled;
  previewEnabledCheck.checked = settings.previewEnabled;
  notificationsModal.classList.add('active');
});
saveNotificationsBtn.addEventListener('click', async () => {
  settings.soundEnabled = soundEnabledCheck.checked;
  settings.previewEnabled = previewEnabledCheck.checked;
  localStorage.setItem('noble_settings', JSON.stringify(settings));
  await fetch('http://localhost:3000/save-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, profile, settings })
  });
  notificationsModal.classList.remove('active');
});

closeModalBtns.forEach(btn => btn.addEventListener('click', () => {
  notificationsModal.classList.remove('active');
  userProfileModal.classList.remove('active');
}));

let typingTimer;
messageInput.addEventListener('input', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'typing', chatId: activeChatId, isTyping: true }));
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    ws.send(JSON.stringify({ type: 'typing', chatId: activeChatId, isTyping: false }));
  }, 1000);
});

// Запуск
loadChats();
connectWebSocket();