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
        font-size: 28px; cursor: move; z-index: 10000;
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
        z-index: 10000;
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
        z-index: 10000;
     }
     .messages {
        padding: 12px; flex: 1; overflow-y: auto; display: flex;
        flex-direction: column;
        padding: 12px; flex: 1; overflow-y: auto;
        display: flex; flex-direction: column;
     }
     .input-row {
        display: flex;
        border-top: 1px solid rgba(0,0,0,0.1);
        display: flex; border-top: 1px solid rgba(0,0,0,0.1);
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

      /* Chat bubbles */
      .chatbot-bubble {
        position: relative;
       display: inline-block;
        background: #ffffff;
        border-radius: 24px;
        padding: 12px 18px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        max-width: 280px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #333;
        margin: 6px 0;
     }
      .msg.bot {
        align-self: flex-start;
        background: #fff;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 16px 16px 16px 0;
        padding: 8px 12px;
      .chatbot-bubble::after {
        content: "";
        position: absolute;
        bottom: -8px;
        left: 24px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: #ffffff transparent transparent transparent;
     }
      .msg.user {
        align-self: flex-end;
        background: #4f46e5;
        color: #fff;
        border-radius: 16px 16px 0 16px;
        padding: 8px 12px;
      .chatbot-bubble.loading::before {
        content: "";
        display: block;
        width: 10px; height: 10px;
        background: #777; border-radius: 50%;
        box-shadow: 16px 0 #777, 32px 0 #777;
        margin: 0 auto;
        animation: blink 1.2s infinite ease-in-out;
      }
      @keyframes blink {
        0%, 80%, 100% { opacity: 0.3; }
        40% { opacity: 1; }
      }
      /* Sender label */
      .msg.bot.chatbot-bubble::before {
        content: "Yuno";
        display: block; font-size: 10px;
        margin-bottom: 4px; color: var(--yuno-accent);
     }
      .msg.bot::before,
      .msg.user::before {
        display: block; font-size: 10px; margin-bottom: 4px;
      .msg.user.chatbot-bubble::before {
        content: "You";
        display: block; font-size: 10px;
        margin-bottom: 4px; text-align: right;
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
      /* User styling */
      .msg.user.chatbot-bubble {
        background: #4f46e5; color: #fff;
      }
      .msg.user.chatbot-bubble::after {
        content: ""; position: absolute;
        bottom: -8px; right: 24px;
        border-width: 8px 8px 0 8px;
        border-style: solid;
        border-color: #4f46e5 transparent transparent transparent;
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
      this._history = [{ role: 'system', content: 'You are Yuno, a friendly assistant.' }];
this._first = true;
      this._dragging = false;
      this._offsetX = 0;
      this._offsetY = 0;
}

connectedCallback() {
this._bubble.addEventListener('click', () => this._toggle());
this._button.addEventListener('click', () => this._send());
this._input.addEventListener('keydown', e => e.key === 'Enter' && this._send());
      // dragging
      this._bubble.addEventListener('mousedown', this._onDragStart.bind(this));
      document.addEventListener('mousemove', this._onDrag.bind(this));
      document.addEventListener('mouseup', this._onDragEnd.bind(this));
}

_toggle() {
const open = this._box.style.display === 'flex';
      this._box.style.display = open ? 'none' : 'flex';
      this._teaser.style.display = 'none';
      if (!open && this._first) {
        this._addMsg('🤝 Hi! I’m Yuno—how can I help you today?', 'bot');
        this._history.push({ role: 'assistant', content: '🤝 Hi! I’m Yuno—how can I help you today?' });
        this._first = false;
      if (open) {
        this._box.style.display = 'none';
      } else {
        this._box.style.display = 'flex';
        this._positionBox();
        if (this._first) {
          this._addMsg('🤝 Hi! I’m Yuno—how can I help you today?', 'bot');
          this._history.push({ role: 'assistant', content: '🤝 Hi! I’m Yuno—how can I help you today?' });
          this._first = false;
        }
        this._input.focus();
}
      if (!open) this._input.focus();
      this._teaser.style.display = 'none';
    }

    _positionBox() {
      const bR = this._bubble.getBoundingClientRect();
      const cR = this._box.getBoundingClientRect();
      this._box.style.bottom = 'auto';
      this._box.style.right = 'auto';
      let top = bR.top - cR.height - 8;
      if (top < 0) top = bR.bottom + 8;
      let left = bR.left;
      if (left + cR.width > window.innerWidth) left = window.innerWidth - cR.width - 8;
      this._box.style.top = top + 'px';
      this._box.style.left = left + 'px';
    }

    _positionTeaser() {
      const bR = this._bubble.getBoundingClientRect();
      const tR = this._teaser.getBoundingClientRect();
      this._teaser.style.bottom = 'auto';
      this._teaser.style.right = 'auto';
      let top = bR.top - tR.height - 8;
      if (top < 0) top = bR.bottom + 8;
      let left = bR.left;
      if (left + tR.width > window.innerWidth) left = window.innerWidth - tR.width - 8;
      this._teaser.style.top = top + 'px';
      this._teaser.style.left = left + 'px';
    }

    _onDragStart(e) {
      e.preventDefault();
      this._dragging = true;
      const rect = this._bubble.getBoundingClientRect();
      this._offsetX = e.clientX - rect.left;
      this._offsetY = e.clientY - rect.top;
      this._bubble.style.bottom = 'auto';
      this._bubble.style.right = 'auto';
    }

    _onDrag(e) {
      if (!this._dragging) return;
      let x = e.clientX - this._offsetX;
      let y = e.clientY - this._offsetY;
      const maxX = window.innerWidth - this._bubble.offsetWidth;
      const maxY = window.innerHeight - this._bubble.offsetHeight;
      x = Math.min(Math.max(0, x), maxX);
      y = Math.min(Math.max(0, y), maxY);
      this._bubble.style.left = x + 'px';
      this._bubble.style.top = y + 'px';
      this._positionTeaser();
      if (this._box.style.display === 'flex') this._positionBox();
    }

    _onDragEnd() {
      this._dragging = false;
}

_addMsg(text, who) {
const div = document.createElement('div');
      div.className = `msg ${who}`;
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

      // typing animation
const tip = document.createElement('div');
      tip.className = 'msg typing';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        tip.appendChild(dot);
      }
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
