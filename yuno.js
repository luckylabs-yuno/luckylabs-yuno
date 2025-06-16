// yuno-fixed.js
'use strict';

(() => {
  const SCRIPT_NAME = 'yuno.js';
  const allScripts = Array.from(document.getElementsByTagName('script'));
  const thisScript = allScripts.find(s => s.src && s.src.includes(SCRIPT_NAME));
  const SITE_ID = thisScript?.getAttribute('site_id') || 'default_site';
  const WIDGET_THEME = thisScript?.getAttribute('theme') || 'dark';

  // Session & user persistence
  const now = Date.now();
  let session_id = localStorage.getItem('yuno_session_id');
  let lastActive = parseInt(localStorage.getItem('yuno_last_active') || '0', 10);
  if (!session_id || now - lastActive > 30 * 60 * 1000) {
    session_id = crypto.randomUUID();
    localStorage.setItem('yuno_session_id', session_id);
  }
  localStorage.setItem('yuno_last_active', now);

  let user_id = localStorage.getItem('yuno_user_id');
  if (!user_id) {
    user_id = crypto.randomUUID();
    localStorage.setItem('yuno_user_id', user_id);
  }

  // Template: trigger pill, teaser input, and chat panel
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      /* common host styles */
      :host {
        position: fixed;
        bottom: 30px;  /* Moved up slightly */
        right: 30px;   /* Moved left slightly */
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 9999;
        --radius: 24px;
      }

      /* dark theme variables */
      :host([theme="dark"]) {
        --accent: linear-gradient(to right, #2563eb, #06b6d4);
        --accent-solid: #2563eb;  /* Solid color for borders/tails */
        --accent-hover: linear-gradient(to right, #1d4ed8, #0891b2);
        --panel-bg: rgba(15, 23, 42, 0.75);  /* Increased transparency with darker base */
        --yuno-bg: rgba(51, 65, 85, 0.9);    /* More distinct from panel background */
        --blur: blur(25px);  /* Increased blur for more translucency */
        --border-color: rgba(75, 85, 99, 0.4);
        --border-hover-color: rgba(107, 114, 128, 0.6);
        --text-color: #e5e7eb;
        --text-muted: #9ca3af;
        --header-bg: rgba(15, 23, 42, 0.85);  /* More translucent header */
        --close-bg: rgba(51, 65, 85, 0.8);
        --close-color: #9ca3af;
        --close-hover-bg: rgba(71, 85, 105, 0.9);
        --close-hover-color: #e5e7eb;
      }

      /* light theme variables */
      :host([theme="light"]) {
        --accent: linear-gradient(to right, #2563eb, #06b6d4);
        --accent-solid: #2563eb;  /* Solid color for borders/tails */
        --accent-hover: linear-gradient(to right, #1d4ed8, #0891b2);
        --panel-bg: rgba(248, 250, 252, 0.75);  /* Increased transparency */
        --yuno-bg: rgba(226, 232, 240, 0.9);     /* More distinct slate color */
        --blur: blur(20px);  /* Increased blur */
        --border-color: rgba(203, 213, 225, 0.6);
        --border-hover-color: rgba(147, 51, 234, 0.4);
        --text-color: #1e293b;
        --text-muted: #64748b;
        --header-bg: rgba(248, 250, 252, 0.8);  /* More translucent */
        --close-bg: rgba(226, 232, 240, 0.8);
        --close-color: #64748b;
        --close-hover-bg: rgba(203, 213, 225, 0.9);
        --close-hover-color: #334155;
      }

      /* Trigger pill */
      .bubble {
        display: inline-flex;
        align-items: center;
        background: var(--accent);
        color: #fff;
        padding: 0 16px;
        height: 40px;
        border-radius: var(--radius);
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        gap: 8px;
        transition: all 0.3s ease;
      }
      .bubble:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0,0,0,0.2);
      }
      .bubble .icon { font-size: 18px; }

      /* Teaser input row */
      .teaser {
        display: none;
        align-items: center;
        background: var(--panel-bg);
        backdrop-filter: var(--blur);
        border-radius: var(--radius);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 4px;
        gap: 8px;
        animation: slideIn 0.5s ease-out;
      }
      @keyframes slideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .teaser .close {
        width: 32px;
        height: 32px;
        background: var(--close-bg);
        color: var(--close-color);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        transition: background 0.2s ease, color 0.2s ease;
      }
      .teaser .close:hover {
        background: var(--close-hover-bg);
        color: var(--close-hover-color);
      }
      .teaser .input {
        flex: 1;
        background: var(--yuno-bg);
        border-radius: var(--radius);
        padding: 8px 12px;
        font-size: 14px;
        color: var(--text-color);
      }
      .teaser .ask-btn {
        background: var(--accent);
        color: #fff;
        border: none;
        border-radius: var(--radius);
        padding: 8px 14px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s ease;
      }
      .teaser .ask-btn:hover {
        background: var(--accent-hover);
      }

      /* Chat panel */
      .chatbox {
        display: none;
        flex-direction: column;
        width: 320px;
        max-height: 420px;
        background: var(--panel-bg);
        backdrop-filter: var(--blur);
        border-radius: var(--radius);
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        overflow: hidden;
        animation: slideIn 0.5s ease-out;
        border: 1px solid var(--border-color);  /* Added subtle border for definition */
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        font-size: 16px;
        font-weight: bold;
        color: var(--text-color);
        background: var(--header-bg);
        backdrop-filter: var(--blur);
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: var(--close-color);
        transition: color 0.2s ease;
      }
      .close-btn:hover {
        color: var(--close-hover-color);
      }
      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        /* Hide scrollbar */
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .messages::-webkit-scrollbar {
        display: none;
      }
      .input-row {
        display: flex;
        border-top: 1px solid var(--border-color);
        background: var(--header-bg);
        backdrop-filter: var(--blur);
      }
      .input-row input {
        flex: 1;
        border: none;
        padding: 10px;
        font-size: 14px;
        outline: none;
        background: transparent;
        color: var(--text-color);
      }
      .input-row input::placeholder {
        color: var(--text-muted);
      }
      .input-row button {
        background: var(--accent);
        color: #fff;
        border: none;
        padding: 0 16px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s ease;
      }
      .input-row button:hover {
        background: var(--accent-hover);
      }

      /* Bot & User bubbles */
      .chatbot-bubble {
        position: relative;
        padding: 10px 14px;
        border-radius: var(--radius);
        max-width: 75%;
        line-height: 1.4;
        font-size: 14px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      }
      .msg.bot .chatbot-bubble {
        background: var(--yuno-bg);
        color: var(--text-color);
        align-self: flex-start;
        border: 1px solid var(--border-color);
      }
      .msg.bot .chatbot-bubble::after {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 16px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: var(--yuno-bg) transparent transparent transparent;
      }
      .msg.user .chatbot-bubble {
        background: var(--accent-solid);  /* Using solid color instead of gradient */
        color: #fff;
        align-self: flex-end;
      }
      .msg.user .chatbot-bubble::after {
        content: '';
        position: absolute;
        bottom: -8px;
        right: 16px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: var(--accent-solid) transparent transparent transparent;  /* Fixed: using solid color */
      }

      /* User message alignment fixes */
      .messages {
        padding: 12px 0 12px 12px !important;
      }
      
      .msg.user {
        align-self: flex-end !important;
        margin-left: auto !important;
      }
      
      .msg.user .chatbot-bubble {
        display: inline-block !important;
        max-width: 75%;
        text-align: right !important;
        margin-right: 0 !important;
      }

      /* Typing indicator */
      .typing {
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .typing::before {
        content: '💭';
        font-size: 16px;
        margin-right: 6px;
        animation: pulse 1.5s infinite ease-in-out;
      }
      .typing .dot {
        width: 6px;
        height: 6px;
        background: var(--accent-solid);
        border-radius: 50%;
        animation: bounce 0.8s infinite ease-in-out;
      }
      .typing .dot:nth-child(2) { animation-delay: 0.1s; }
      .typing .dot:nth-child(3) { animation-delay: 0.2s; }
      .typing .dot:nth-child(4) { animation-delay: 0.3s; }

      @keyframes bounce {
        0%, 80%, 100% { 
          transform: scale(0.8);
          opacity: 0.5;
        }
        40% { 
          transform: scale(1.2);
          opacity: 1;
        }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 1; }
      }
    </style>

    <div class="bubble"><span class="icon">💬</span><span>Ask Yuno</span></div>
    <div class="teaser">
      <div class="close">×</div>
      <div class="input">Let me know if you need help</div>
      <button class="ask-btn">Ask Yuno</button>
    </div>
    <div class="chatbox">
      <div class="header">Chat with Yuno <button class="close-btn">×</button></div>
      <div class="messages"></div>
      <div class="input-row">
        <input type="text" placeholder="Type your message…" aria-label="Type your message" />
        <button>Send</button>
      </div>
    </div>
  `;

  class YunoChat extends HTMLElement {
    static get observedAttributes() { return ['theme']; }
    attributeChangedCallback(name, oldValue, newValue) {
      // CSS handles theme switching automatically
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.appendChild(template.content.cloneNode(true));
      this._bubble = root.querySelector('.bubble');
      this._teaser = root.querySelector('.teaser');
      this._closeTeaser = root.querySelector('.teaser .close');
      this._askTeaser = root.querySelector('.teaser .ask-btn');
      this._box = root.querySelector('.chatbox');
      this._closeBox = root.querySelector('.close-btn');
      this._msgs = root.querySelector('.messages');
      this._input = root.querySelector('input');
      this._sendBtn = root.querySelector('.input-row button');
      this._history = [{ role: 'system', content: 'You are Yuno, a friendly assistant.' }];
      this._first = true;
      this._teaserShown = false;
    }

    connectedCallback() {
      // apply initial theme
      if (!this.hasAttribute('theme')) {
        this.setAttribute('theme', WIDGET_THEME);
      }

      // Auto-show teaser after 1 second
      setTimeout(() => {
        if (!this._teaserShown) {
          this._bubble.style.display = 'none';
          this._teaser.style.display = 'inline-flex';
          this._teaserShown = true;
        }
      }, 1000);

      this._bubble.addEventListener('click', () => this._openChat());
      this._closeTeaser.addEventListener('click', () => this._hideTeaser());
      this._askTeaser.addEventListener('click', () => this._openChat());
      this._closeBox.addEventListener('click', () => this._toggleChat(false));
      this._sendBtn.addEventListener('click', () => this._send());
      this._input.addEventListener('keydown', e => e.key === 'Enter' && this._send());
    }

    _openChat() {
      this._teaser.style.display = 'none';
      this._bubble.style.display = 'none';
      this._toggleChat(true);
    }

    _hideTeaser() {
      this._teaser.style.display = 'none';
      this._bubble.style.display = 'inline-flex';
      this._teaserShown = false;
    }

    _toggleChat(open) {
      this._box.style.display = open ? 'flex' : 'none';
      if (!open) this._bubble.style.display = 'inline-flex';
      if (open && this._first) {
        this._addBotMessage("Hi! I'm Yuno—how can I help you today?");
        this._first = false;
      }
      if (open) this._input.focus();
    }

    _addBotMessage(text) {
      const msg = document.createElement('div'); msg.className = 'msg bot';
      const bubble = document.createElement('div'); bubble.className = 'chatbot-bubble';
      bubble.textContent = text;
      msg.appendChild(bubble);
      this._msgs.appendChild(msg);
      this._msgs.scrollTop = this._msgs.scrollHeight;
      this._history.push({ role: 'assistant', content: text });
    }

    _addUserMessage(text) {
      const msg = document.createElement('div'); msg.className = 'msg user';
      const bubble = document.createElement('div'); bubble.className = 'chatbot-bubble';
      bubble.textContent = text;
      msg.appendChild(bubble);
      this._msgs.appendChild(msg);
      this._msgs.scrollTop = this._msgs.scrollHeight;
      this._history.push({ role: 'user', content: text });
    }

    async _send() {
      const text = this._input.value.trim();
      if (!text) return;
      this._addUserMessage(text);
      this._input.value = '';

      const tip = document.createElement('div'); tip.className = 'msg bot';
      const typing = document.createElement('div'); typing.className = 'chatbot-bubble typing';
      for (let i = 0; i < 4; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        typing.appendChild(dot);
      }
      tip.appendChild(typing);
      this._msgs.appendChild(tip);
      this._msgs.scrollTop = this._msgs.scrollHeight;

      try {
        const res = await fetch('https://luckylabs.pythonanywhere.com/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_id: SITE_ID,
            session_id,
            user_id,
            page_url: window.location.href,
            messages: this._history
          })
        });
        const data = await res.json();
        tip.remove();
        this._addBotMessage(data.content || "Sorry, I couldn't find anything.");
      } catch (err) {
        tip.remove();
        this._addBotMessage('Oops, something went wrong.');
        console.error('Yuno Error:', err);
      }
    }
  }

  customElements.define('yuno-chat', YunoChat);

  document.addEventListener('DOMContentLoaded', () => {
    const widget = document.createElement('yuno-chat');
    widget.setAttribute('theme', WIDGET_THEME);
    document.body.appendChild(widget);
  });
})();
