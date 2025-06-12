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

  // Template: trigger pill, teaser input, and chat panel
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --radius: 24px;
        --accent: #ef4444; /* red accent */
        --panel-bg: rgba(255,255,255,0.85);
        --yuno-bg: rgba(248,250,252,0.95); /* off-white for Yuno messages */
        --blur: blur(12px);
        position: fixed;
        bottom: 20px;
        right: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 9999;
      }
      /* Trigger pill: Ask Yuno */
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
        background: #fff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        transition: background 0.2s ease;
      }
      .teaser .close:hover {
        background: #f3f4f6;
      }
      .teaser .input {
        flex: 1;
        background: #fff;
        border-radius: var(--radius);
        padding: 8px 12px;
        font-size: 14px;
        color: #333;
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
        background: #dc2626;
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
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        font-size: 16px;
        font-weight: bold;
        color: #333;
        background: rgba(255,255,255,0.9);
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #666;
        transition: color 0.2s ease;
      }
      .close-btn:hover {
        color: #333;
      }
      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .input-row {
        display: flex;
        border-top: 1px solid rgba(238,238,238,0.8);
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
        font-size: 14px;
        transition: background 0.2s ease;
      }
      .input-row button:hover {
        background: #dc2626;
      }

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
        color: #333;
        align-self: flex-start;
        border: 1px solid rgba(229,231,235,0.8);
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
        background: var(--accent);
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
        border-color: var(--accent) transparent transparent transparent;
      }
      
      /* Enhanced typing indicator */
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
        background: linear-gradient(45deg, #ef4444, #f97316);
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
      // Auto-show teaser after 1 second
      setTimeout(() => {
        if (!this._teaserShown) {
          this._showTeaser();
        }
      }, 1000);

      this._bubble.addEventListener('click', () => this._openChat());
      this._closeTeaser.addEventListener('click', () => this._hideTeaser());
      this._askTeaser.addEventListener('click', () => this._openChat());
      this._closeBox.addEventListener('click', () => this._toggleChat(false));
      this._sendBtn.addEventListener('click', () => this._send());
      this._input.addEventListener('keydown', e => e.key === 'Enter' && this._send());
    }

    _showTeaser() {
      if (!this._teaserShown) {
        this._bubble.style.display = 'none';
        this._teaser.style.display = 'inline-flex';
        this._teaserShown = true;
      }
    }
    
    _hideTeaser() {
      this._teaser.style.display = 'none';
      this._bubble.style.display = 'inline-flex';
      this._teaserShown = false;
    }
    
    _openChat() {
      this._teaser.style.display = 'none';
      this._bubble.style.display = 'none';
      this._toggleChat(true);
    }
    
    _toggleChat(open) {
      this._box.style.display = open ? 'flex' : 'none';
      if (!open) {
        this._bubble.style.display = 'inline-flex';
      }
      if (open && this._first) {
        this._addBotMessage('Hi! I'm Yuno—how can I help you today?');
        this._first = false;
      }
      if (open) {
        this._input.focus();
      }
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
      const text = this._input.value.trim(); if (!text) return;
      this._addUserMessage(text);
      this._input.value = '';
      
      // Enhanced typing indicator
      const tip = document.createElement('div'); tip.className = 'msg bot';
      const typing = document.createElement('div'); typing.className = 'chatbot-bubble typing';
      for (let i=0;i<4;i++){ 
        const dot=document.createElement('span'); 
        dot.className='dot'; 
        typing.appendChild(dot);
      } 
      tip.appendChild(typing); 
      this._msgs.appendChild(tip); 
      this._msgs.scrollTop=this._msgs.scrollHeight;
      
      try {
        const res = await fetch('https://luckylabs.pythonanywhere.com/ask',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ 
            site_id:SITE_ID, 
            session_id, 
            user_id, 
            page_url:window.location.href, 
            messages:this._history 
          })
        });
        const data = await res.json(); 
        tip.remove(); 
        this._addBotMessage(data.content||'Sorry, I couldn't find anything.');
      } catch(err){ 
        tip.remove(); 
        this._addBotMessage('Oops, something went wrong.'); 
        console.error('Yuno Error:',err); 
      }
    }
  }

  customElements.define('yuno-chat', YunoChat);

  document.addEventListener('DOMContentLoaded', () => {
    const widget = document.createElement('yuno-chat');
    document.body.appendChild(widget);
  });
})();
