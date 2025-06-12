// yuno.js
(() => {
  // ──────────────── read site_id from our script tag ────────────────
  const SCRIPT_NAME = 'yuno.js';
  const allScripts = Array.from(document.getElementsByTagName('script'));
  const thisScript = allScripts.find(s => s.src && s.src.includes(SCRIPT_NAME));
  const SITE_ID = thisScript?.getAttribute('site_id') || 'default_site';

  // ───────── session & user persistence ─────────
  const NOW = Date.now();
  let session_id = localStorage.getItem('yuno_session_id');
  let lastActive = parseInt(localStorage.getItem('yuno_last_active') || '0', 10);
  if (!session_id || NOW - lastActive > 30 * 60 * 1000) {
    session_id = crypto.randomUUID();
    localStorage.setItem('yuno_session_id', session_id);
  }
  localStorage.setItem('yuno_last_active', NOW);

  let user_id = localStorage.getItem('yuno_user_id');
  if (!user_id) {
    user_id = crypto.randomUUID();
    localStorage.setItem('yuno_user_id', user_id);
  }

  // ───────── define our Web Component ─────────
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --yuno-primary: #4f46e5;
        --yuno-accent:  #22d3ee;
        --yuno-bg:      rgba(255,255,255,0.7);
        --yuno-radius:  12px;
        --yuno-font:    'Segoe UI', sans-serif;
        position: fixed; bottom: 0; right: 0;
        font-family: var(--yuno-font);
        z-index: 9999;
      }
      .bubble {
        position: fixed; bottom: 20px; right: 20px;
        width: 60px; height: 60px;
        background: var(--yuno-bg);
        backdrop-filter: blur(10px);
        border: 2px solid var(--yuno-accent);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: var(--yuno-primary);
        font-size: 28px; cursor: pointer;
        animation: pulse 2s infinite ease-in-out;
      }
      @keyframes pulse {
        0%,100% { transform: scale(1); }
        50%     { transform: scale(1.1); }
      }
      .chatbox {
        position: fixed; bottom: 90px; right: 20px;
        width: 320px; max-height: 420px;
        background: var(--yuno-bg);
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
        padding: 12px; flex: 1; overflow-y: auto;
        font-size: 14px; color: #111;
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
        background: var(--yuno-primary);
        color: #fff; border: none;
        padding: 0 16px; cursor: pointer;
      }
      .msg { margin: 8px 0; line-height: 1.4; word-wrap: break-word; }
      .msg.user { text-align: right; color: var(--yuno-primary); }
      .msg.bot  { text-align: left;  color: #333; }
      .msg.typing::after {
        content: '';
        display: inline-block;
        width: 16px; height: 4px;
        background: #ccc;
        border-radius: 2px;
        margin-left: 6px;
        animation: typing 1s infinite steps(3, end);
      }
      @keyframes typing {
        0%   { background-position: 0   0; }
        100% { background-position: -48px 0; }
      }
    </style>

    <div class="bubble">💬</div>
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
      this.attachShadow({ mode: 'open' })
          .appendChild(template.content.cloneNode(true));

      this._bubble  = this.shadowRoot.querySelector('.bubble');
      this._box     = this.shadowRoot.querySelector('.chatbox');
      this._msgs    = this.shadowRoot.querySelector('.messages');
      this._input   = this.shadowRoot.querySelector('input');
      this._button  = this.shadowRoot.querySelector('button');
      this._history = [
        { role: 'system', content: 'You are Yuno, a friendly assistant.' }
      ];
    }

    connectedCallback() {
      this._bubble.addEventListener('click', () => this._toggle());
      this._button.addEventListener('click', () => this._send());
      this._input.addEventListener('keydown', e => {
        if (e.key === 'Enter') this._send();
      });
    }

    _toggle() {
      const open = this._box.style.display === 'flex';
      this._box.style.display = open ? 'none' : 'flex';
      if (!open) this._input.focus();
    }

    _addMsg(txt, who) {
      const d = document.createElement('div');
      d.className = `msg ${who}`;
      d.textContent = txt;
      this._msgs.appendChild(d);
      this._msgs.scrollTop = this._msgs.scrollHeight;
    }

    async _send() {
      const text = this._input.value.trim();
      if (!text) return;
      this._addMsg(text, 'user');
      this._history.push({ role: 'user', content: text });
      this._input.value = '';

      // show typing indicator
      const tip = document.createElement('div');
      tip.className = 'msg bot typing';
      this._msgs.appendChild(tip);
      this._msgs.scrollTop = this._msgs.scrollHeight;

      try {
        const res = await fetch('https://luckylabs.pythonanywhere.com/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_id:    SITE_ID,
            session_id: session_id,
            user_id:    user_id,
            page_url:   window.location.href,
            messages:   this._history
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

  // ───────── on DOM ready, inject the component ─────────
  document.addEventListener('DOMContentLoaded', () => {
    const widget = document.createElement('yuno-chat');
    document.body.appendChild(widget);
  });
})();
