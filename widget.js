(() => {
  const API_URL = "https://luckylabs.pythonanywhere.com/ask"; // 🔁 Replace with your actual endpoint

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
  `;
  document.head.appendChild(style);

  // --- Bubble ---
  const bubble = document.createElement("div");
  bubble.id = "yuno-bubble";
  bubble.textContent = "💬";
  document.body.appendChild(bubble);

  // --- Chatbox ---
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

  // --- Toggle Chat ---
  bubble.onclick = () => {
    chatbox.style.display = chatbox.style.display === "none" ? "flex" : "none";
  };

  // --- Chat Logic ---
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

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, "user");
    input.value = "";

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, site_id: "bombayshaving" }) // 🔁 Set site_id appropriately
      });

      const data = await res.json();
      addMessage(data.content || "No response.", "bot");
    } catch (e) {
      addMessage("Oops! Something went wrong.", "bot");
    }
  };

  button.onclick = sendMessage;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
})();
