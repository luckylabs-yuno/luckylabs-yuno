'use strict';

(() => {
  const SCRIPT_NAME = 'yuno.js';
  const allScripts = Array.from(document.getElementsByTagName('script'));
  const thisScript = allScripts.find(s => s.src && s.src.includes(SCRIPT_NAME));
  const SITE_ID = thisScript?.getAttribute('site_id') || 'default_site';

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

  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --yuno-radius: 12px;
        --yuno-font: 'Segoe UI', sans-serif;
        --yuno-accent: #22d3ee;
        position: fixed; bottom: 0; right: 0;
        font-family: var(--yuno-font);
        z-index: 9999;
      }
      .bubble {
        position: fixed; bottom: 20px; right: 20px;
        width: 60px; height: 60px;
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 50%, #a18cd1 75%, #fbc2eb 100%);
        backdrop-filter: blur(10px);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 28px; cursor: pointer;
        animation: pulse 2s infinite ease-in-out;
      }
      @keyframes pulse {
        0%,100% { transform: scale(1); }
        50%     { transform: scale(1.1); }
      }
      .teaser {
        position: fixed; bottom: 90px; right: 20px;
        background: rgba(255,255,255,0.8);
        backdrop-filter: blur(8px);
        border: 1px solid var(--yuno-accent);
        border-radius: var(--yuno-radius);
        padding: 8px 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px; color: #111;
      }
      .chatbox {
        position: fixed; bottom: 90px; right: 20px;
        width: 320px; max-height: 420px;
        background: rgba(255,255,255,0.8);
        backdrop-filter: blur(12px);
        border-radius: var(--yuno-radius);
        border: 1px solid var(--yuno-accent);
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        display: none; flex-direction: column; overflow: hidden;
        animation: slide-up 0.3s ease-out;
      }
      @keyframes slide-up {
        from { transform: translateY(20px); opacity: 0; }
        to   { transform: translateY(0);      opacity: 1; }
      }
      .messages {
        padding: 12px; flex: 1; overflow-y: auto; display: flex;
        flex-direction: column;
      }
      .input-row {
        display: flex;
        border-top: 1px solid rgba(0,0,0,0.1);
      }
      .input-row input {
        flex: 1; border: none;
        padding: 10px; font-size: 14px;
        background: transparent; outline: none;
      }
      .input-row button {
        background: #4f46e5; color: #fff;
        border: none; padding: 0 16px; cursor: pointer;
      }
      .msg {
        max-width: 80%; margin: 6px 0; position: relative;
        display: inline-block;
      }
      .msg.bot {
        align-self: flex-start;
        background: #fff;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 16px 16px 16px 0;
        padding: 8px 12px;
      }
      .msg.user {
        align-self: flex-end;
        background: #4f46e5;
        color: #fff;
        border-radius: 16px 16px 0 16px;
        padding: 8px 12px;
      }
      .msg.bot::before,
      .msg.user::before {
        display: block; font-size: 10px; margin-bottom: 4px;
        color: var(--yuno-accent);
      }
      .msg.bot::before { content: 'Yuno'; }
      .msg.user::before { content: 'You'; text-align: right; }
      .msg.typing {
        align-self: flex-start;
        background: transparent; border: none; padding: 0;
        display: flex; gap: 4px;
      }
      .msg.typing .dot {
        width: 6px; height: 6px; background: #ccc;
        border-radius: 50%; opacity: 0.4;
        animation: blink 1s infinite;
      }
      .msg.typing .dot:nth-child(1) { animation-delay: 0; }
      .msg.typing .dot:nth-child(2) { animation-delay: 0.2s; }
      .msg.typing .dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes blink {
        0%,100% { opacity: 0.4; }
        50%     { opacity: 1; }
      }
    </style>

    <div class="bubble">🤝</div>
    <div class="teaser">🤝 Hi! I’m Yuno—how can I help you today?</div>
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
      this._history = [ { role: 'system', content: 'You are Yuno, a friendly assistant.' } ];
      this._first = true;
    }

    connectedCallback() {
      this._bubble.addEventListener('click', () => this._toggle());
      this._button.addEventListener('click', () => this._send());
      this._input.addEventListener('keydown', e => e.key === 'Enter' && this._send());
    }

    _toggle() {
      const open = this._box.style.display === 'flex';
      this._box.style.display = open ? 'none' : 'flex';
      this._teaser.style.display = 'none';
      if (!open && this._first) {
        this._addMsg('🤝 Hi! I’m Yuno—how can I help you today?', 'bot');
        this._history.push({ role: 'assistant', content: '🤝 Hi! I’m Yuno—how can I help you today?' });
        this._first = false;
      }
      if (!open) this._input.focus();
    }

    _addMsg(text, who) {
      const div = document.createElement('div');
      div.className = `msg ${who}`;
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

      // typing animation
      const tip = document.createElement('div');
      tip.className = 'msg typing';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        tip.appendChild(dot);
      }
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
