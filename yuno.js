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

      /* dark theme variables - Orangewood optimized */
      :host([theme="dark"]) {
        --accent: linear-gradient(to right, #FF6B35, #FF8C42);  /* Orange gradient matching Orangewood */
        --accent-solid: #FF6B35;  /* Orangewood orange for borders/tails */
        --accent-hover: linear-gradient(to right, #E55A2B, #FF6B35);
        --panel-bg: rgba(0, 0, 0, 0.85);  /* Deep black for better Orangewood integration */
        --yuno-bg: rgba(20, 20, 20, 0.95);    /* Dark charcoal for bot messages */
        --blur: blur(30px);  /* More intense blur for premium feel */
        --border-color: rgba(255, 107, 53, 0.2);  /* Subtle orange border */
        --border-hover-color: rgba(255, 107, 53, 0.4);
        --text-color: #ffffff;  /* Pure white for high contrast */
        --text-muted: #a0a0a0;  /* Neutral gray */
        --header-bg: rgba(0, 0, 0, 0.9);  /* Deep black header */
        --close-bg: rgba(40, 40, 40, 0.8);
        --close-color: #a0a0a0;
        --close-hover-bg: rgba(60, 60, 60, 0.9);
        --close-hover-color: #ffffff;
      }

      /* light theme variables - Orangewood light mode */
      :host([theme="light"]) {
        --accent: linear-gradient(to right, #FF6B35, #FF8C42);  /* Consistent orange */
        --accent-solid: #FF6B35;  /* Orangewood orange */
        --accent-hover: linear-gradient(to right, #E55A2B, #FF6B35);
        --panel-bg: rgba(255, 255, 255, 0.85);  /* Clean white */
        --yuno-bg: rgba(248, 248, 248, 0.95);     /* Light gray for distinction */
        --blur: blur(20px);
        --border-color: rgba(255, 107, 53, 0.15);  /* Subtle orange border */
        --border-hover-color: rgba(255, 107, 53, 0.3);
        --text-color: #1a1a1a;  /* Near black for readability */
        --text-muted: #666666;
        --header-bg: rgba(255, 255, 255, 0.9);
        --close-bg: rgba(240, 240, 240, 0.8);
        --close-color: #666666;
        --close-hover-bg: rgba(220, 220, 220, 0.9);
        --close-hover-color: #1a1a1a;
      }

      /* Trigger pill - Orangewood styling */
      .bubble {
        display: inline-flex;
        align-items: center;
        background: var(--accent);
        color: #ffffff;
        padding: 0 18px;  /* Slightly more padding */
        height: 44px;  /* Taller for better presence */
        border-radius: 22px;  /* More rounded */
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(255, 107, 53, 0.3);  /* Orange glow */
        font-size: 14px;
        font-weight: 600;  /* Bolder text */
        gap: 10px;
        transition: all 0.3s ease;
        border: 2px solid rgba(255, 255, 255, 0.1);  /* Subtle highlight border */
      }
      .bubble:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 25px rgba(255, 107, 53, 0.4);
        background: var(--accent-hover);
      }
      .bubble .icon { 
        font-size: 20px; 
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));  /* Subtle icon shadow */
      }

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

      /* Chat panel - Enhanced for Orangewood */
      .chatbox {
        display: none;
        flex-direction: column;
        width: 340px;  /* Slightly wider for better readability */
        max-height: 450px;  /* Taller for more content */
        background: var(--panel-bg);
        backdrop-filter: var(--blur);
        border-radius: 16px;  /* More modern rounded corners */
        box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px var(--border-color);  /* Enhanced shadow + border */
        overflow: hidden;
        animation: slideIn 0.5s ease-out;
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

      /* Bot & User bubbles - Fixed text overflow and positioning */
      .chatbot-bubble {
        position: relative;
        padding: 12px 16px;
        border-radius: 18px;
        max-width: 80%;
        line-height: 1.5;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        font-weight: 400;
        word-wrap: break-word !important;  /* Prevent text overflow */
        overflow-wrap: break-word !important;
        hyphens: auto !important;
        white-space: pre-wrap !important;  /* Preserve line breaks and wrap text */
      }
      .msg.bot .chatbot-bubble {
        background: var(--yuno-bg);
        color: var(--text-color);
        align-self: flex-start;
        border: 1px solid var(--border-color);
        margin-right: auto;  /* Push to left */
      }
      .msg.bot .chatbot-bubble::after {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 20px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: var(--yuno-bg) transparent transparent transparent;
      }
      .msg.user .chatbot-bubble {
        background: var(--accent-solid);
        color: #ffffff !important;
        align-self: flex-end;
        font-weight: 500;
        margin-left: auto;  /* Push to right */
        margin-right: 0 !important;  /* No right margin */
      }
      .msg.user .chatbot-bubble::after {
        content: '';
        position: absolute;
        bottom: -8px;
        right: 20px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: var(--accent-solid) transparent transparent transparent;
      }

      /* User message alignment fixes */
      .messages {
        padding: 12px 12px 12px 12px !important;  /* Equal padding on both sides */
      }
      
      .msg.user {
        align-self: flex-end !important;
        margin-left: auto !important;
        margin-right: 0 !important;  /* Ensure no right margin */
        width: 100%;  /* Full width to push bubble to edge */
        display: flex !important;
        justify-content: flex-end !important;  /* Push content to right */
      }
      
      .msg.user .chatbot-bubble {
        display: inline-block !important;
        max-width: 80%;  /* Increased max-width */
        text-align: left !important;  /* Left-align text within bubble for readability */
        margin-right: 0 !important;
        margin-left: auto !important;
        word-wrap: break-word !important;  /* Prevent text overflow */
        overflow-wrap: break-word !important;
        hyphens: auto !important;
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
