(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const API_URL = "https://luckylabs.pythonanywhere.com/ask";
    const scriptTag = [...document.getElementsByTagName("script")].find(s => s.src.includes("yuno.js"));
    const site_id = scriptTag?.getAttribute("site_id") || "default_site";

    const now = Date.now();
    let session_id = localStorage.getItem("yuno_session_id");
    let lastActive = parseInt(localStorage.getItem("yuno_last_active") || "0");
    if (!session_id || now - lastActive > 30 * 60 * 1000) {
      session_id = crypto.randomUUID();
      localStorage.setItem("yuno_session_id", session_id);
    }
    localStorage.setItem("yuno_last_active", now);

    let user_id = localStorage.getItem("yuno_user_id");
    if (!user_id) {
      user_id = crypto.randomUUID();
      localStorage.setItem("yuno_user_id", user_id);
    }

    // CSS
    const style = document.createElement("style");
    style.textContent = `
      #yuno-bubble {
        position: fixed; bottom: 20px; right: 20px;
        width: 60px; height: 60px; background: #4f46e5;
        border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        cursor: pointer; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 30px;
      }
      #yuno-teaser {
        position: fixed; bottom: 90px; right: 90px;
        background: white; padding: 8px 14px; border-radius: 18px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.15); font-size: 14px;
        color: #111; cursor: pointer; z-index: 9999;
      }
      #yuno-chatbox {
        position: fixed; bottom: 90px; right: 20px; width: 300px;
        max-height: 400px; background: white; border: 1px solid #ddd;
        border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        display: none; flex-direction: column; overflow: hidden;
        z-index: 9999; font-family: sans-serif;
      }
      #yuno-messages { padding: 10px; flex: 1; overflow-y: auto; font-size: 14px; }
      #yuno-input { display: flex; border-top: 1px solid #eee; }
      #yuno-input input {
        flex: 1; padding: 10px; border: none; outline: none; font-size: 14px;
      }
      #yuno-input button {
        background: #4f46e5; color: white; border: none;
        padding: 10px 15px; cursor: pointer;
      }
      .yuno-msg { margin-bottom: 10px; }
      .yuno-msg.user { text-align: right; color: #4f46e5; }
      .yuno-msg.bot { text-align: left; color: #111827; }
      .yuno-msg.typing::after {
        content: "⌛"; animation: blink 1s infinite;
      }
      @keyframes blink {
        0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);

    // DOM
    const bubble = document.createElement("div");
    bubble.id = "yuno-bubble";
    bubble.textContent = "💬";
    document.body.appendChild(bubble);

    const teaser = document.createElement("div");
    teaser.id = "yuno-teaser";
    teaser.textContent = "Hi there! 👋 What can I help you with today?";
    document.body.appendChild(teaser);

    const chatbox = document.createElement("div");
    chatbox.id = "yuno-chatbox";
    chatbox.innerHTML = `
      <div id="yuno-messages"></div>
      <div id="yuno-input">
        <input type="text" placeholder="Type your question here..." />
        <button>Send</button>
      </div>
    `;
    document.body.appendChild(chatbox);

    const input = chatbox.querySelector("input");
    const button = chatbox.querySelector("button");
    const messages = chatbox.querySelector("#yuno-messages");

    let hasOpenedChat = false;
    let chatHistory = [
      { role: "system", content: "You are Yuno, a friendly assistant helping users on this website." }
    ];

    const addMessage = (text, sender) => {
      const div = document.createElement("div");
      div.className = `yuno-msg ${sender}`;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    };

    const addTyping = () => {
      const div = document.createElement("div");
      div.className = "yuno-msg bot typing";
      div.id = "yuno-typing";
      div.textContent = "Yuno is typing...";
      messages.appendChild(div);
    };

    const removeTyping = () => {
      const typing = document.getElementById("yuno-typing");
      if (typing) typing.remove();
    };

    // ➜ NEW helper: show Yuno’s follow-up prompt
//I have commented out the below code because it is breaking the json generation    
    //const showFollowUp = (promptText) => {
      //setTimeout(() => {
        //addMessage(promptText, "yuno");                 // show in UI
        //chatHistory.push({ role: "assistant", content: promptText }); // log in history
        //messages.scrollTop = messages.scrollHeight;     // scroll to bottom
      //}, 1200); // 1.2-second delay feels natural
    //};


    const sendMessage = async () => {
      const text = input.value.trim();
      if (!text) return;
      addMessage(text, "user");
      chatHistory.push({ role: "user", content: text });
      input.value = "";

      addTyping();
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: chatHistory,
            site_id,
            session_id,
            user_id,
            page_url: window.location.href
          })
        });

        const data = await res.json();
        removeTyping();

        if (data.content) {
          addMessage(data.content, "yuno");
          chatHistory.push({ role: "assistant", content: data.content });
        
// 🔹 If backend suggests a follow-up, show it.
//I have commented out the below code because it is breaking the json generation
         // if (data.follow_up && data.follow_up_prompt) {
          //  showFollowUp(data.follow_up_prompt);
          //}
        } else {
          addMessage("Hmm, I couldn't find anything useful.", "yuno");
        }

      } catch (e) {
        removeTyping();
        addMessage("Oops! Something went wrong.", "yuno");
        console.error("Yuno error:", e);
      }
    };

    teaser.onclick = () => {
      chatbox.style.display = "flex";
      teaser.style.display = "none";
      if (!hasOpenedChat) {
        addMessage("Hi there! 👋 What can I help you with today?", "yuno");
        chatHistory.push({ role: "assistant", content: "Hi there! 👋 What can I help you with today?" });
        hasOpenedChat = true;
      }
    };

    bubble.onclick = () => {
      const isOpen = chatbox.style.display === "flex";
      chatbox.style.display = isOpen ? "none" : "flex";
      teaser.style.display = "none";
      if (!hasOpenedChat && !isOpen) {
        addMessage("Hi there! 👋 What can I help you with today?", "yuno");
        chatHistory.push({ role: "assistant", content: "Hi there! 👋 What can I help you with today?" });
        hasOpenedChat = true;
      }
    };

    button.onclick = sendMessage;
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") sendMessage();
    });

    setTimeout(() => {
      teaser.style.opacity = 0;
    }, 15000);
  });
})();
