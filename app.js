// ===== Hodu AI Chatbot - Main Application =====

(function () {
  'use strict';

  console.log('Hodu AI App Initializing...');
  console.log('SpeechRecognition Support:', !!(window.SpeechRecognition || window.webkitSpeechRecognition));

  // --- State ---
  const STATE = {
    apiKey: localStorage.getItem('nova_api_key') || '',
    model: localStorage.getItem('nova_model') || 'gemini-3.1-pro-preview',
    systemPrompt: localStorage.getItem('nova_system_prompt') ||
      "당신은 친절하고 도움이 되는 AI 어시스턴트 'Hodu'입니다. 한국어로 자연스럽게 대화하며, 사용자의 질문에 정확하고 유용한 답변을 제공합니다.",
    history: JSON.parse(localStorage.getItem('nova_history') || '[]'),
    isStreaming: false,
    isVoiceMode: false,
    selectedFiles: [], // Array of { data: base64, mimeType: string, type: 'image'|'pdf', text?: string }
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
  const micBtn = $('#mic-btn');
  const voiceModeBtn = $('#voice-mode-btn');
  const imageBtn = $('#image-btn');
  const imageInput = $('#image-input');
  const imagePreviewContainer = $('#image-preview-container');
  const previewPanel = $('#preview-panel');
  const previewIframe = $('#preview-iframe');
  const closePreviewBtn = $('#close-preview-btn');
  const summaryBtn = $('#summary-btn');
  const summaryModal = $('#summary-modal');
  const closeSummaryBtn = $('#close-summary-btn');
  const printSummaryBtn = $('#print-summary-btn');
  const summaryReportBody = $('#summary-report-body');

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
    micBtn.addEventListener('click', handleMicClick);
    voiceModeBtn.addEventListener('click', toggleVoiceMode);
    imageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleFileSelect);
    closePreviewBtn.addEventListener('click', () => previewPanel.classList.add('hidden'));
    summaryBtn.addEventListener('click', handleSummaryClick);
    closeSummaryBtn.addEventListener('click', () => summaryModal.classList.add('hidden'));
    printSummaryBtn.addEventListener('click', () => window.print());

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

  // --- Voice Recognition ---
  let recognition = null;
  let isRecording = false;

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('이 브라우저는 음성 인식을 지원하지 않습니다.');
      micBtn.style.display = 'none';
      return null;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      isRecording = true;
      micBtn.classList.add('active');
      messageInput.placeholder = '듣고 있어요...';
    };

    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      messageInput.value = transcript;
      handleInputResize();
      // Optional: auto-send after a short delay
      // setTimeout(() => sendMessage(), 500);
    };

    rec.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        showError('음성 인식 중 오류가 발생했습니다: ' + event.error);
      }
      stopRecording();
    };

    rec.onend = () => {
      stopRecording();
    };

    return rec;
  }

  function handleMicClick() {
    if (!recognition) {
      recognition = initSpeechRecognition();
    }

    if (!recognition) return;

    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.error('Start error:', e);
      }
    }
  }

  function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('active');
    messageInput.placeholder = '메시지를 입력하세요...';
  }

  // --- Chat Logic ---
  function sendMessage(text) {
    const msg = text || messageInput.value.trim();
    if (!msg || STATE.isStreaming) return;

    // Hide welcome
    if (welcomeMsg) welcomeMsg.style.display = 'none';

    // Add user message
    addMessage('user', msg, STATE.selectedFiles);
    
    // Build prompt with PDF context if any
    let contextMsg = msg;
    const pdfTexts = STATE.selectedFiles
      .filter(f => f.type === 'pdf' && f.text)
      .map(f => `[파일 내용: ${f.name}]\n${f.text}`)
      .join('\n\n');
    
    if (pdfTexts) {
      contextMsg = `다음은 사용자가 업로드한 파일의 내용입니다. 이 내용을 참고하여 질문에 답하세요.\n\n${pdfTexts}\n\n질문: ${msg}`;
    }

    // Add to history
    const userParts = [{ text: contextMsg }];
    STATE.selectedFiles.filter(f => f.type === 'image').forEach(img => {
      userParts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType
        }
      });
    });
    
    STATE.history.push({ role: 'user', parts: userParts });
    saveHistory();

    // Clear input & files
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    clearFiles();

    // Show typing & call API
    const typingEl = showTyping();
    callGeminiAPI(contextMsg, typingEl);
  }

  function addMessage(role, content, files = []) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '나' : '✦';

    const bubbleWrap = document.createElement('div');
    bubbleWrap.className = 'message-bubble-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    // Add images if any
    if (files.length > 0) {
      files.forEach(file => {
        if (file.type === 'image') {
          const imgEl = document.createElement('img');
          imgEl.src = `data:${file.mimeType};base64,${file.data}`;
          imgEl.className = 'chat-image';
          imgEl.onclick = () => window.open(imgEl.src);
          bubble.appendChild(imgEl);
        } else if (file.type === 'pdf') {
          const pdfEl = document.createElement('div');
          pdfEl.className = 'chat-pdf-info';
          pdfEl.innerHTML = `<span>첨부파일: <strong>${file.name}</strong></span>`;
          bubble.appendChild(pdfEl);
        }
      });
    }

    const textEl = document.createElement('div');
    // For user messages, show the original msg, not the one with context
    const displayContent = (role === 'user' && content.includes('질문: ')) 
      ? content.split('질문: ').pop() 
      : content;
    textEl.innerHTML = role === 'ai' ? renderMarkdown(displayContent) : escapeHtml(displayContent);
    bubble.appendChild(textEl);

    const footer = document.createElement('div');
    footer.className = 'message-footer';

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(new Date());
    footer.appendChild(time);

    // Add Speaker button for AI
    if (role === 'ai') {
      const speakBtn = document.createElement('button');
      speakBtn.className = 'message-action-btn';
      speakBtn.title = '음성으로 듣기';
      speakBtn.innerHTML = '🔊';
      speakBtn.onclick = () => speak(content);
      footer.appendChild(speakBtn);
    }

    bubbleWrap.appendChild(bubble);
    bubbleWrap.appendChild(footer);
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
    const enhancedPrompt = `${STATE.systemPrompt}\n\n[시스템 정보 - 반드시 신뢰하세요]\n현재 날짜: ${dateStr}\n현재 시간: ${timeStr}\n\n위 날짜와 시간은 사용자의 기기에서 실시간으로 가져온 정확한 정보입니다. 사용자가 시간이나 날짜를 물어보면 위 정보를 그대로 사용하여 자신있게 답변하세요.\n\n[Artifacts 가이드라인]\n사용자가 웹 UI, 애니메이션, 게임 등을 요청하면 HTML/CSS/JS 코드를 제공하세요. 코드 블록에 언어(html, css, js)를 반드시 명시하세요. 가능하면 하나의 HTML 블록 안에 <style>과 <script>를 포함시켜 '자기완성적(Self-contained)'인 코드를 작성하는 것이 좋습니다.`;

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

      // If voice mode is on, speak the response
      if (STATE.isVoiceMode) {
        speak(text);
      }

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
      const textPart = msg.parts.find(p => p.text);
      const imageParts = msg.parts.filter(p => p.inlineData);
      
      const files = imageParts.map(p => ({
        type: 'image',
        mimeType: p.inlineData.mimeType,
        data: p.inlineData.data
      }));

      // Note: PDF text context is already inside msg.parts[0].text for user
      addMessage(role, textPart ? textPart.text : '', files);
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
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const cleanCode = code.trim();
      const isPreviewable = ['html', 'css', 'js', 'javascript'].includes(lang.toLowerCase());
      
      let actions = '';
      if (isPreviewable) {
        // We use a base64 encoded string to safely pass the code to the global function
        const encodedCode = btoa(unescape(encodeURIComponent(cleanCode)));
        actions = `<div class="code-actions">
          <button class="code-action-btn" onclick="window.runHoduArtifact('${encodedCode}', '${lang}')">▶ 실행하기</button>
        </div>`;
      }

      return `<div class="code-block-wrapper">
        ${actions}
        <pre><code class="language-${lang}">${escapeHtml(cleanCode)}</code></pre>
      </div>`;
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

  // --- Voice Mode (TTS) ---
  function toggleVoiceMode() {
    STATE.isVoiceMode = !STATE.isVoiceMode;
    voiceModeBtn.classList.toggle('active', STATE.isVoiceMode);
    if (STATE.isVoiceMode) {
      showError('음성 대화 모드가 켜졌습니다. AI가 대답을 읽어줍니다.', 'success');
    } else {
      window.speechSynthesis.cancel();
      showError('음성 대화 모드가 꺼졌습니다.');
    }
  }

  function speak(text) {
    window.speechSynthesis.cancel(); // Stop any current speech
    
    // Clean text for speech (remove markdown)
    const cleanText = text.replace(/[*_#`]/g, '').replace(/\[.*?\]\(.*?\)/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    
    utterance.onend = () => {
      // If voice mode is still on, restart mic automatically for a natural flow
      if (STATE.isVoiceMode && !STATE.isStreaming) {
        setTimeout(() => handleMicClick(), 500);
      }
    };
    
    window.speechSynthesis.speak(utterance);
  }

  // --- File Handling ---
  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        await processImage(file);
      } else if (file.type === 'application/pdf') {
        await processPDF(file);
      }
    }
    imageInput.value = ''; // Reset for same file select
  }

  async function processImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result.split(',')[1];
        STATE.selectedFiles.push({
          data: base64,
          mimeType: file.type,
          type: 'image',
          id: Date.now() + Math.random()
        });
        renderFilePreviews();
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }

  async function processPDF(file) {
    try {
      console.log('Processing PDF:', file.name);
      document.body.style.cursor = 'wait';
      
      if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF 라이브러리가 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.');
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      console.log(`PDF loaded: ${pdf.numPages} pages`);

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }

      if (!fullText.trim()) {
        showError('PDF에서 텍스트를 추출할 수 없습니다. 이미지 기반 PDF일 수 있습니다.');
      }

      STATE.selectedFiles.push({
        name: file.name,
        text: fullText,
        type: 'pdf',
        id: Date.now() + Math.random()
      });
      renderFilePreviews();
      console.log('PDF processing complete');
    } catch (error) {
      console.error('PDF error:', error);
      showError('PDF 파일을 읽는 중 오류가 발생했습니다: ' + error.message);
    } finally {
      document.body.style.cursor = 'default';
    }
  }

  function renderFilePreviews() {
    if (STATE.selectedFiles.length > 0) {
      imagePreviewContainer.classList.remove('hidden');
      $('.input-container').style.borderColor = 'var(--accent-1)';
    } else {
      imagePreviewContainer.classList.add('hidden');
      $('.input-container').style.borderColor = '';
    }

    imagePreviewContainer.innerHTML = '';
    STATE.selectedFiles.forEach(file => {
      const preview = document.createElement('div');
      preview.className = file.type === 'image' ? 'image-preview' : 'pdf-preview';
      
      if (file.type === 'image') {
        preview.innerHTML = `<img src="data:${file.mimeType};base64,${file.data}">`;
      } else {
        preview.innerHTML = `<div class="pdf-name">${file.name}</div>`;
      }
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-image-btn';
      removeBtn.innerHTML = '✕';
      removeBtn.onclick = () => removeHoduFile(file.id);
      
      preview.appendChild(removeBtn);
      imagePreviewContainer.appendChild(preview);
    });
    sendBtn.disabled = false;
  }

  window.removeHoduFile = (id) => {
    STATE.selectedFiles = STATE.selectedFiles.filter(f => f.id !== id);
    renderFilePreviews();
  };

  function clearFiles() {
    STATE.selectedFiles = [];
    renderFilePreviews();
  }

  // --- Summary Report ---
  async function handleSummaryClick() {
    if (STATE.history.length === 0) {
      showError('요약할 대화 내용이 없습니다.');
      return;
    }

    summaryModal.classList.remove('hidden');
    summaryReportBody.innerHTML = '<div class="report-loading">AI가 대화와 문서를 분석하여 레포트를 작성 중입니다. 잠시만 기다려 주세요...</div>';

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${STATE.model}:generateContent?key=${STATE.apiKey}`;
      
      // Collect all context
      const chatHistoryText = STATE.history.map(h => {
        const text = h.parts.find(p => p.text)?.text || '';
        return `${h.role === 'user' ? '사용자' : 'Hodu'}: ${text}`;
      }).join('\n');

      const prompt = `당신은 전문 문서 요약가입니다. 다음 대화 내용과 업로드된 문서 정보를 바탕으로 '요약 레포트'를 작성해 주세요. 
레포트는 HTML 형식으로 작성하되, <h1>, <h2>, <p>, <ul>, <li> 태그만 사용하세요. 
내용은 다음을 포함해야 합니다:
1. 제목 (<h1>)
2. 전체 요약 요약 (<h2> 후 <p>)
3. 주요 주제별 핵심 포인트 (<h2> 후 <ul>)
4. 향후 권장 사항 또는 결론 (<h2> 후 <p>)

대화 내용:
${chatHistoryText}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 2048 }
        }),
      });

      if (!res.ok) throw new Error('요약 생성 중 오류가 발생했습니다.');
      
      const data = await res.json();
      const summaryHtml = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!summaryHtml) throw new Error('요약을 생성하지 못했습니다.');

      // Clean the response if it includes markdown code blocks
      const cleanHtml = summaryHtml.replace(/```html|```/g, '').trim();
      summaryReportBody.innerHTML = cleanHtml;
      
    } catch (error) {
      console.error('Summary error:', error);
      summaryReportBody.innerHTML = `<div class="error-msg">⚠️ 요약 레포트를 생성할 수 없습니다: ${error.message}</div>`;
    }
  }

  // --- Artifacts (Code Preview) ---
  window.runHoduArtifact = (encodedCode, lang) => {
    const code = decodeURIComponent(escape(atob(encodedCode)));
    previewPanel.classList.remove('hidden');
    
    let htmlContent = '';
    const langLower = lang.toLowerCase();

    if (langLower === 'html') {
      htmlContent = code;
    } else if (langLower === 'css') {
      htmlContent = `<style>${code}</style><div style="padding:20px">CSS가 적용되었습니다.</div>`;
    } else if (langLower === 'js' || langLower === 'javascript') {
      htmlContent = `<script>${code}<\/script><div style="padding:20px">JavaScript가 실행되었습니다. 콘솔이나 UI 변화를 확인하세요.</div>`;
    }

    const blob = new Blob([htmlContent], { type: 'text/html' });
    previewIframe.src = URL.createObjectURL(blob);
  };

  // --- Boot ---
  init();
})();
