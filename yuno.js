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

  // Template: fixed bubble, teaser, chat panel
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --yuno-radius: 12px;
        --yuno-font: 'Segoe UI', sans-serif;
        --yuno-accent: #22d3ee;
        position: fixed;
        bottom: 0;
        right: 0;
        font-family: var(--yuno-font);
        z-index: 9999;
      }
      .bubble {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 50%, #a18cd1 75%, #fbc2eb 100%);
        backdrop-filter: blur(10px);
        border: 2px solid var(--yuno-accent);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        cursor: pointer;
        animation: pulse 2s infinite ease-in-out;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      .teaser {
        position: fixed;
        bottom: 90px;
        right: 20px;
        background: #fff;
        border: 1px solid var(--yuno-accent);
        border-radius: var(--yuno-radius);
        padding: 8px 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        color: #111;
      }
      .chatbox {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 320px;
        max-height: 420px;
        background: #fff;
        border: 1px solid var(--yuno-accent);
        border-radius: var(--yuno-radius);
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      .messages {
        padding: 12px;
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }
      .input-row {
        display: flex;
        border-top: 1px solid #eee;
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
        background: #4f46e5;
        color: #fff;
        border: none;
        padding: 0 16px;
        cursor: pointer;
      }
      .chatbot-bubble {
        position: relative;
        display: inline-block;
        background: #ffffff;
        border-radius: 24px;
        padding: 12px 18px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        max-width: 280px;
        margin: 6px 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #333;
      }
      .chatbot-bubble::after {
        content: "";
        position: absolute;
        bottom: -8px;
        left: 24px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: #ffffff transparent transparent transparent;
      }
      .chatbot-bubble.loading::before {
        content: "";
        display: block;
        width: 10px;
        height: 10px;
        background: #777;
        border-radius: 50%;
        box-shadow: 16px 0 #777, 32px 0 #777;
        margin: 0 auto;
        animation: blink 1.2s infinite ease-in-out;
      }
      @keyframes blink {
        0%, 80%, 100% { opacity: 0.3; }
        40% { opacity: 1; }
      }
      .msg.bot.chatbot-bubble::before {
        content: "Yuno";
        display: block;
        font-size: 10px;
        margin-bottom: 4px;
        color: var(--yuno-accent);
      }
      .msg.user.chatbot-bubble::before {
        content: "You";
        display: block;
        font-size: 10px;
        margin-bottom: 4px;
        text-align: right;
        color: var(--yuno-accent);
      }
      .msg.user.chatbot-bubble {
        background: #4f46e5;
        color: #fff;
      }
      .msg.user.chatbot-bubble::after {
        content: "";
        position: absolute;
        bottom: -8px;
        right: 24px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: #4f46e5 transparent transparent transparent;
      }
    </style>
    <div class="bubble">🤝</div>
    <div class="teaser">🤝 I’m Yuno—how can I help you today?</div>
    <div class="chatbox">
      <div class="messages"></div>
      <div class="input-row">
        <input type="text" placeholder="Type a message…" />
        <button>Send</button>
      </div>
    </div>
  `;

  class YunoChat extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).appendChild(template.content.cloneNode(true));
      this._bubble = this.shadowRoot.querySelector('.bubble');
      this._teaser = this.shadowRoot.querySelector('.teaser');
      this._box = this.shadowRoot.querySelector('.chatbox');
      this._msgs = this.shadowRoot.querySelector('.messages');
      this._input = this.shadowRoot.querySelector('input');
      this._button = this.shadowRoot.querySelector('button');
      this._history = [{ role: 'system', content: 'You are Yuno, a friendly assistant.' }];
      this._first = true;
    }

    connectedCallback() {
      this._bubble.addEventListener('click', () => this._toggle());
      this._button.addEventListener('click', () => this._send());
      this._input.addEventListener('keydown', e => e.key === 'Enter' && this._send());
    }

    _toggle() {
      const open = this._box.style.display === 'flex';
      if (open) {
        this._box.style.display = 'none';
      } else {
        this._box.style.display = 'flex';
        if (this._first) {
          this._addMsg('🤝 Hi! I’m Yuno—how can I help you today?', 'bot');
          this._history.push({ role: 'assistant', content: '🤝 Hi! I’m Yuno—how can I help you today?' });
          this._first = false;
        }
        this._input.focus();
      }
      this._teaser.style.display = 'none';
    }

    _addMsg(text, who) {
      const div = document.createElement('div');
      div.className = `msg ${who} chatbot-bubble`;
      div.textContent = text;
      this._msgs.appendChild(div);
      this._msgs.scrollTop = this._msgs.scrollHeight;
    }

    async _send() {
      const text = this._input.value.trim();
      if (!text) return;
      this._addMsg(text, 'user');
      this._history.push({ role: 'user', content: text });
      this._input.value = '';

      const tip = document.createElement('div');
      tip.className = 'msg bot chatbot-bubble loading';
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
        this._addMsg(data.content || 'Sorry, I couldn’t find anything.', 'bot');
        this._history.push({ role: 'assistant', content: data.content });
      } catch (err) {
        tip.remove();
        this._addMsg('Oops, something went wrong.', 'bot');
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
