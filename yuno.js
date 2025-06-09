(() => {
  
  const API_URL = "https://luckylabs.pythonanywhere.com/ask";

  // --- Site ID from script tag ---
  const currentScript = document.currentScript || [...document.getElementsByTagName('script')].pop();
  const siteId = currentScript.getAttribute("site_id") || "default_site";

  // --- Session ID (30 min inactivity rule) ---
  let sessionId = localStorage.getItem("yuno_session_id");
  let lastActive = parseInt(localStorage.getItem("yuno_last_active") || "0");
  const now = Date.now();
  if (!sessionId || now - lastActive > 30 * 60 * 1000) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("yuno_session_id", sessionId);
  }
  localStorage.setItem("yuno_last_active", now);

  // --- Persistent User ID (no permissions needed) ---
  let userId = localStorage.getItem("yuno_user_id");
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("yuno_user_id", userId);
  }

  let chatHistory = [
    { role: "system", content: "You are Yuno, a friendly shopping assistant helping users on this website." }
  ];

  // --- Styles ---
  const style = document.createElement("style");
  style.textContent = `
    #yuno-bubble {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background: #4f46e5;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 30px;
    }
    #yuno-teaser {
      position: fixed;
      bottom: 90px;
      right: 90px;
      background: white;
      padding: 8px 14px;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
      font-size: 14px;
      color: #111;
      cursor: pointer;
      z-index: 9999;
      transition: opacity 0.5s;
    }
    #yuno-chatbox {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 300px;
      max-height: 400px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 9999;
      font-family: sans-serif;
    }
    #yuno-messages {
      padding: 10px;
      flex: 1;
      overflow-y: auto;
      font-size: 14px;
    }
    #yuno-input {
      display: flex;
      border-top: 1px solid #eee;
    }
    #yuno-input input {
      flex: 1;
      padding: 10px;
      border: none;
      outline: none;
      font-size: 14px;
    }
    #yuno-input button {
      background: #4f46e5;
      color: white;
      border: none;
      padding: 10px 15px;
      cursor: pointer;
    }
    .yuno-msg {
      margin-bottom: 10px;
    }
    .yuno-msg.user {
      text-align: right;
      color: #4f46e5;
    }
    .yuno-msg.bot {
      text-align: left;
      color: #111827;
    }
    .yuno-msg.typing::after {
      content: "⌛";
      animation: blink 1s infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);

  // --- UI Elements ---
  const bubble = document.createElement("div");
  bubble.id = "yuno-bubble";
  bubble.textContent = "💬";
  document.body.appendChild(bubble);

  const teaser = document.createElement("div");
  teaser.id = "yuno-teaser";
  teaser.textContent = "👋 Need help with shipping or anything?";
  document.body.appendChild(teaser);

  const chatbox = document.createElement("div");
  chatbox.id = "yuno-chatbox";
  chatbox.innerHTML = `
    <div id="yuno-messages"></div>
    <div id="yuno-input">
      <input type="text" placeholder="Ask me anything..." />
      <button>Send</button>
    </div>
  `;
  document.body.appendChild(chatbox);

  let hasOpenedChat = false;

  teaser.onclick = () => {
    teaser.style.display = "none";
    chatbox.style.display = "flex";
    if (!hasOpenedChat) {
      addMessage("Hey! Need help with shipping or anything?", "bot");
      chatHistory.push({ role: "assistant", content: "Hey! Need help with shipping or anything?" });
      hasOpenedChat = true;
    }
  };

  bubble.onclick = () => {
    const isOpen = chatbox.style.display === "flex";
    chatbox.style.display = isOpen ? "none" : "flex";
    teaser.style.display = "none";
    if (!hasOpenedChat && !isOpen) {
      addMessage("Hey! Need help with shipping or anything?", "bot");
      chatHistory.push({ role: "assistant", content: "Hey! Need help with shipping or anything?" });
      hasOpenedChat = true;
    }
  };

  setTimeout(() => {
    teaser.style.opacity = 0;
  }, 15000);

  const input = chatbox.querySelector("input");
  const button = chatbox.querySelector("button");
  const messages = chatbox.querySelector("#yuno-messages");

  const addMessage = (text, sender) => {
    const div = document.createElement("div");
    div.className = `yuno-msg ${sender}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  };

  const addTypingIndicator = () => {
    const div = document.createElement("div");
    div.className = "yuno-msg bot typing";
    div.id = "yuno-typing";
    div.textContent = "Yuno is typing...";
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  };

  const removeTypingIndicator = () => {
    const typing = document.getElementById("yuno-typing");
    if (typing) typing.remove();
  };

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, "user");
    chatHistory.push({ role: "user", content: text });
    input.value = "";

    addTypingIndicator();

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          site_id: siteId,
          session_id: sessionId,
          user_id: userId,
          page_url: window.location.href
        })
      });

      const data = await res.json();
      removeTypingIndicator();
      if (data.content) {
        addMessage(data.content, "bot");
        chatHistory.push({ role: "assistant", content: data.content });
      } else {
        addMessage("Hmm, I couldn't find anything useful.", "bot");
      }
    } catch (e) {
      removeTypingIndicator();
      addMessage("Oops! Something went wrong.", "bot");
    }
  };

  button.onclick = sendMessage;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
})();
