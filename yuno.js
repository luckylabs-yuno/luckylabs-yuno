'use strict';

(() => {
  const SCRIPT_NAME = 'yuno.js';
  const allScripts = Array.from(document.getElementsByTagName('script'));
  const thisScript = allScripts.find(s => s.src && s.src.includes(SCRIPT_NAME));
  const SITE_ID = thisScript?.getAttribute('site_id') || 'default_site';

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

  // Template: fixed bubble + glassmorphic chat panel
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --radius: 12px;
        --accent: #4F46E5;
        --gradient: linear-gradient(
          135deg,
          #A0D8F1 0%,
          #D3A8F9 40%,
          #FAC8D8 70%,
          #73E5B7 100%
        );
        position: fixed;
        bottom: 0;
        right: 0;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .bubble {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: var(--gradient);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        animation: pulse 2s infinite ease-in-out;
      }
      .bubble .icon {
        font-size: 24px;
        color: #fff;
      }
      @keyframes pulse {
        0%,100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      .teaser {
        position: fixed;
        bottom: 90px;
        right: 20px;
        background: rgba(255,255,255,0.9);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.4);
        border-radius: var(--radius);
        padding: 10px 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        color: #111;
        display: none;
      }
      .chatbox {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 320px;
        max-height: 420px;
        background: rgba(255,255,255,0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.4);
        border-radius: var(--radius);
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      .header {
        height: 40px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        font-size: 16px;
        font-weight: bold;
        color: #333;
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
      }
      .messages {
        padding: 12px;
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .input-row {
        display: flex;
        border-top: 1px solid #eee;
        background: rgba(255,255,255,0.9);
      }
      .input-row input {
        flex: 1;
        border: none;
        padding: 10px;
        font-size: 14px;
        outline: none;
        background: transparent;
      }
      .input-row button {
        background: var(--accent);
        color: #fff;
        border: none;
        padding: 0 16px;
        cursor: pointer;
      }
      .chatbot-bubble {
        position: relative;
        max-width: 80%;
        padding: 10px 14px;
        border-radius: var(--radius);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        font-size: 14px;
        line-height: 1.4;
      }
      .msg.bot .chatbot-bubble {
        align-self: flex-start;
        background: #fff;
        color: #333;
      }
      .msg.bot .chatbot-bubble::after {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 16px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: #fff transparent transparent transparent;
      }
      .msg.user .chatbot-bubble {
        align-self: flex-end;
        background: var(--accent);
        color: #fff;
      }
      .typing {
        display: inline-flex;
        gap: 4px;
      }
      .typing .dot {
        width: 8px;
        height: 8px;
        background: #777;
        border-radius: 50%;
        animation: blink 1.4s infinite ease-in-out;
      }
      .typing .dot:nth-child(1) { animation-delay: 0; }
      .typing .dot:nth-child(2) { animation-delay: 0.2s; }
      .typing .dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes blink { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }
    </style>

    <div class="bubble"><span class="icon">💬</span></div>
    <div class="teaser">💬 Hi! I’m Yuno—how can I help you today?</div>
    <div class="chatbox">
      <div class="header">
        Chat with Yuno
        <button class="close-btn">×</button>
      </div>
      <div class="messages"></div>
      <div class="input-row">
        <input type="text" placeholder="Type your message…" aria-label="Type your message" />
        <button aria-label="Send message">Send</button>
      </div>
    </div>
  `;

  class YunoChat extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).appendChild(template.content.cloneNode(true));
      this._bubble    = this.shadowRoot.querySelector('.bubble');
      this._teaser    = this.shadowRoot.querySelector('.teaser');
      this._box       = this.shadowRoot.querySelector('.chatbox');
      this._msgs      = this.shadowRoot.querySelector('.messages');
      this._input     = this.shadowRoot.querySelector('input');
      this._button    = this.shadowRoot.querySelector('button[aria-label="Send message"]');
      this._closeBtn  = this.shadowRoot.querySelector('.close-btn');
      this._history   = [{ role: 'system', content: 'You are Yuno, a friendly assistant.' }];
      this._first     = true;
    }

    connectedCallback() {
      this._bubble.addEventListener('click', () => this._toggle());
      this._closeBtn.addEventListener('click', () => this._toggle());
      this._button.addEventListener('click', () => this._send());
      this._input.addEventListener('keydown', e => e.key === 'Enter' && this._send());
    }

    _toggle() {
      const open = this._box.style.display === 'flex';
      if (open) {
        this._box.style.display = 'none';
        this._bubble.style.display = 'flex';
      } else {
        this._bubble.style.display = 'none';
        this._teaser.style.display = 'none';
        this._box.style.display = 'flex';
        if (this._first) {
          this._addBotMessage('Hi! I’m Yuno—how can I help you today?');
          this._first = false;
        }
        this._input.focus();
      }
    }

    _addBotMessage(text) {
      const wrapper = document.createElement('div');
      wrapper.className = 'msg bot';
      const bubble = document.createElement('div');
      bubble.className = 'chatbot-bubble';
      bubble.textContent = text;
      wrapper.appendChild(bubble);
      this._msgs.appendChild(wrapper);
      this._msgs.scrollTop = this._msgs.scrollHeight;
      this._history.push({ role: 'assistant', content: text });
    }

    _addUserMessage(text) {
      const wrapper = document.createElement('div');
      wrapper.className = 'msg user';
      const bubble = document.createElement('div');
      bubble.className = 'chatbot-bubble';
      bubble.textContent = text;
      wrapper.appendChild(bubble);
      this._msgs.appendChild(wrapper);
      this._msgs.scrollTop = this._msgs.scrollHeight;
      this._history.push({ role: 'user', content: text });
    }

    async _send() {
      const text = this._input.value.trim();
      if (!text) return;
      this._addUserMessage(text);
      this._input.value = '';

      // typing indicator
      const tip = document.createElement('div');
      tip.className = 'msg bot';
      const typingBubble = document.createElement('div');
      typingBubble.className = 'chatbot-bubble typing';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span'); dot.className = 'dot';
        typingBubble.appendChild(dot);
      }
      tip.appendChild(typingBubble);
      this._msgs.appendChild(tip);
      this._msgs.scrollTop = this._msgs.scrollHeight;

      try {
        const res = await fetch('https://luckylabs.pythonanywhere.com/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ site_id: SITE_ID, session_id, user_id, page_url: window.location.href, messages: this._history })
        });
        const data = await res.json();
        tip.remove();
        this._addBotMessage(data.content || 'Sorry, I couldn’t find anything.');
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
    document.body.appendChild(widget);
  });
})();
