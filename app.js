// ===== Hodu AI Chatbot - Main Application =====

(function () {
  'use strict';

  // --- State ---
  const STATE = {
    apiKey: localStorage.getItem('nova_api_key') || '',
    model: localStorage.getItem('nova_model') || 'gemini-3.1-pro-preview',
    systemPrompt: localStorage.getItem('nova_system_prompt') ||
      "당신은 친절하고 도움이 되는 AI 어시스턴트 'Hodu'입니다. 한국어로 자연스럽게 대화하며, 사용자의 질문에 정확하고 유용한 답변을 제공합니다.",
    history: JSON.parse(localStorage.getItem('nova_history') || '[]'),
    isStreaming: false,
  };

  // --- DOM Elements ---
  const $ = (sel) => document.querySelector(sel);
  const landingScreen = $('#landing-screen');
  const chatScreen = $('#chat-screen');
  const apiKeyInput = $('#api-key-input');
  const startBtn = $('#start-chat-btn');
  const toggleKeyBtn = $('#toggle-key-visibility');
  const chatMessages = $('#chat-messages');
  const welcomeMsg = $('#welcome-message');
  const messageInput = $('#message-input');
  const sendBtn = $('#send-btn');
  const newChatBtn = $('#new-chat-btn');
  const settingsBtn = $('#settings-btn');
  const settingsModal = $('#settings-modal');
  const closeSettingsBtn = $('#close-settings-btn');
  const settingsApiKey = $('#settings-api-key');
  const toggleSettingsKey = $('#toggle-settings-key');
  const modelSelect = $('#model-select');
  const systemPromptInput = $('#system-prompt');
  const saveSettingsBtn = $('#save-settings-btn');
  const clearHistoryBtn = $('#clear-history-btn');
  const headerStatus = $('#header-status');

  // --- Initialize ---
  function init() {
    // If API key exists, go directly to chat
    if (STATE.apiKey) {
      showChatScreen();
    }
    // Pre-fill API key input
    apiKeyInput.value = STATE.apiKey;
    // Settings defaults
    modelSelect.value = STATE.model;
    systemPromptInput.value = STATE.systemPrompt;
    // Restore chat history
    if (STATE.history.length > 0) {
      renderHistory();
    }
    bindEvents();
  }

  // --- Event Bindings ---
  function bindEvents() {
    // Landing
    apiKeyInput.addEventListener('input', () => {
      startBtn.disabled = !apiKeyInput.value.trim();
    });
    toggleKeyBtn.addEventListener('click', () => toggleVisibility(apiKeyInput));
    startBtn.addEventListener('click', handleStart);
    apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleStart(); }
    });

    // Chat input
    messageInput.addEventListener('input', handleInputResize);
    messageInput.addEventListener('keydown', handleInputKeydown);
    sendBtn.addEventListener('click', () => sendMessage());

    // Header buttons
    newChatBtn.addEventListener('click', handleNewChat);
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });
    toggleSettingsKey.addEventListener('click', () => toggleVisibility(settingsApiKey));
    saveSettingsBtn.addEventListener('click', handleSaveSettings);
    clearHistoryBtn.addEventListener('click', handleClearHistory);

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        messageInput.value = prompt;
        sendMessage();
      });
    });
  }

  // --- Screens ---
  function showChatScreen() {
    landingScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    messageInput.focus();
  }

  function handleStart() {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    STATE.apiKey = key;
    localStorage.setItem('nova_api_key', key);
    showChatScreen();
  }

  // --- Chat Logic ---
  function sendMessage(text) {
    const msg = text || messageInput.value.trim();
    if (!msg || STATE.isStreaming) return;

    // Hide welcome
    if (welcomeMsg) welcomeMsg.style.display = 'none';

    // Add user message
    addMessage('user', msg);
    STATE.history.push({ role: 'user', parts: [{ text: msg }] });
    saveHistory();

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Show typing & call API
    const typingEl = showTyping();
    callGeminiAPI(msg, typingEl);
  }

  function addMessage(role, content) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '나' : '✦';

    const bubbleWrap = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = role === 'ai' ? renderMarkdown(content) : escapeHtml(content);

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(new Date());

    bubbleWrap.appendChild(bubble);
    bubbleWrap.appendChild(time);
    row.appendChild(avatar);
    row.appendChild(bubbleWrap);
    chatMessages.appendChild(row);
    scrollToBottom();
    return bubble;
  }

  function showTyping() {
    const row = document.createElement('div');
    row.className = 'message-row ai';
    row.id = 'typing-row';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '✦';

    const bubbleWrap = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    bubbleWrap.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(bubbleWrap);
    chatMessages.appendChild(row);
    scrollToBottom();
    return row;
  }

  function removeTyping() {
    const el = document.getElementById('typing-row');
    if (el) el.remove();
  }

  // --- Gemini API ---
  async function callGeminiAPI(userMsg, typingEl) {
    STATE.isStreaming = true;
    setStatus('응답 중...');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${STATE.model}:generateContent?key=${STATE.apiKey}`;

    // Build contents with history (last 20 messages max)
    const historySlice = STATE.history.slice(-20);
    const contents = historySlice.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: h.parts,
    }));

    // Inject current date/time into system prompt
    const now = new Date();
    const dateStr = now.toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });
    const timeStr = now.toLocaleTimeString('ko-KR', {
      hour: '2-digit', minute: '2-digit'
    });
    const enhancedPrompt = `${STATE.systemPrompt}\n\n[시스템 정보 - 반드시 신뢰하세요]\n현재 날짜: ${dateStr}\n현재 시간: ${timeStr}\n\n위 날짜와 시간은 사용자의 기기에서 실시간으로 가져온 정확한 정보입니다. 사용자가 시간이나 날짜를 물어보면 위 정보를 그대로 사용하여 자신있게 답변하세요. "시간을 알 수 없다"거나 "시계에 접근할 수 없다"고 절대 말하지 마세요.`;

    const body = {
      contents,
      systemInstruction: {
        parts: [{ text: enhancedPrompt }]
      },
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 8192,
      },
      tools: [{
        google_search: {}
      }]
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err?.error?.message || `API 오류 (${res.status})`;
        throw new Error(errMsg);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) throw new Error('AI로부터 응답을 받지 못했습니다.');

      removeTyping();
      addMessage('ai', text);
      STATE.history.push({ role: 'model', parts: [{ text }] });
      saveHistory();

    } catch (error) {
      removeTyping();
      showError(error.message);
      // Add error message in chat
      addMessage('ai', `⚠️ 오류가 발생했습니다: ${error.message}`);
    } finally {
      STATE.isStreaming = false;
      setStatus('온라인');
    }
  }

  // --- Settings ---
  function openSettings() {
    settingsApiKey.value = STATE.apiKey;
    modelSelect.value = STATE.model;
    systemPromptInput.value = STATE.systemPrompt;
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  function handleSaveSettings() {
    const key = settingsApiKey.value.trim();
    if (key) {
      STATE.apiKey = key;
      localStorage.setItem('nova_api_key', key);
    }
    STATE.model = modelSelect.value;
    localStorage.setItem('nova_model', STATE.model);
    STATE.systemPrompt = systemPromptInput.value;
    localStorage.setItem('nova_system_prompt', STATE.systemPrompt);
    closeSettings();
    showError('설정이 저장되었습니다 ✓', 'success');
  }

  function handleNewChat() {
    STATE.history = [];
    saveHistory();
    chatMessages.innerHTML = '';
    // Re-add welcome
    chatMessages.innerHTML = `
      <div class="welcome-message" id="welcome-message">
        <h2>무엇이든 물어보세요! ✨</h2>
        <p>코딩, 글쓰기, 번역, 분석 등 다양한 주제로 대화할 수 있어요.</p>
        <div class="suggestion-chips">
          <button class="suggestion-chip" data-prompt="오늘 하루 생산성을 높이는 팁 알려줘">🚀 생산성 팁</button>
          <button class="suggestion-chip" data-prompt="재미있는 이야기 하나 해줘">📖 재미있는 이야기</button>
          <button class="suggestion-chip" data-prompt="Python으로 간단한 게임 만드는 법 알려줘">🐍 Python 게임</button>
          <button class="suggestion-chip" data-prompt="맛있는 파스타 레시피 추천해줘">🍝 파스타 레시피</button>
        </div>
      </div>
    `;
    // Re-bind chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        messageInput.value = prompt;
        sendMessage();
      });
    });
  }

  function handleClearHistory() {
    if (confirm('모든 대화 기록을 삭제하시겠습니까?')) {
      handleNewChat();
      closeSettings();
    }
  }

  // --- Helpers ---
  function toggleVisibility(input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  function handleInputResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    sendBtn.disabled = !messageInput.value.trim();
  }

  function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  function setStatus(text) {
    headerStatus.innerHTML = `<span class="status-dot"></span>${text}`;
  }

  function saveHistory() {
    localStorage.setItem('nova_history', JSON.stringify(STATE.history));
  }

  function renderHistory() {
    if (welcomeMsg) welcomeMsg.style.display = 'none';
    STATE.history.forEach(msg => {
      const role = msg.role === 'user' ? 'user' : 'ai';
      addMessage(role, msg.parts[0].text);
    });
  }

  function formatTime(date) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  // Simple markdown renderer
  function renderMarkdown(text) {
    let html = escapeHtml(text);

    // Code blocks (```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Unordered lists
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    // Fix nested ul
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Paragraphs - wrap remaining text blocks
    html = html.replace(/\n\n/g, '</p><p>');
    if (!html.startsWith('<')) html = '<p>' + html;
    if (!html.endsWith('>')) html = html + '</p>';

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');

    return html;
  }

  function showError(msg, type = 'error') {
    const existing = document.querySelector('.error-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'error-toast';
    if (type === 'success') toast.style.background = '#059669';
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // --- Boot ---
  init();
})();
