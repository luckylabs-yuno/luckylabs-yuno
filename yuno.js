(() => {
  // ---- Load SDKs (Mixpanel + Sentry) ----
  const mixpanelScript = document.createElement("script");
  mixpanelScript.src = "https://cdn.jsdelivr.net/npm/mixpanel-browser/build/mixpanel.umd.min.js";
  document.head.appendChild(mixpanelScript);

  const sentryScript = document.createElement("script");
  sentryScript.src = "https://browser.sentry-cdn.com/7.104.0/bundle.min.js";
  sentryScript.crossOrigin = "anonymous";
  sentryScript.onload = setupWidget;  // only run after Sentry loads
  document.head.appendChild(sentryScript);

  function setupWidget() {
    // ---- Init Mixpanel and Sentry ----
    mixpanel.init("43a46d9e89649a23546220f7633fbbbe", { debug: true });
    Sentry.init({
      dsn: "https://a9ae110431460c6c132f98a1623ba661@o4509469501947904.ingest.de.sentry.io/4509469520560208",
      tracesSampleRate: 1.0
    });

    const API_URL = "https://luckylabs.pythonanywhere.com/ask";

    const currentScript = document.currentScript || [...document.getElementsByTagName('script')].pop();
    const siteId = currentScript.getAttribute("site_id") || "default_site";

    let sessionId = localStorage.getItem("yuno_session_id");
    let lastActive = parseInt(localStorage.getItem("yuno_last_active") || "0");
    const now = Date.now();
    if (!sessionId || now - lastActive > 30 * 60 * 1000) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("yuno_session_id", sessionId);
    }
    localStorage.setItem("yuno_last_active", now);

    let userId = localStorage.getItem("yuno_user_id");
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem("yuno_user_id", userId);
    }

    mixpanel.identify(userId);
    mixpanel.track("chat_widget_loaded", {
      site_id: siteId,
      session_id: sessionId,
      page_url: window.location.href
    });

    let chatHistory = [
      { role: "system", content: "You are Yuno, a friendly shopping assistant helping users on this website." }
    ];

    const style = document.createElement("style");
    style.textContent = `/* your existing CSS styles here */`;
    document.head.appendChild(style);

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
      mixpanel.track("teaser_clicked", { session_id: sessionId, site_id: siteId });
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
      mixpanel.track("chat_opened", { session_id: sessionId, site_id: siteId });
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

      mixpanel.track("message_sent", {
        text: text,
        session_id: sessionId,
        user_id: userId,
        site_id: siteId
      });

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

        mixpanel.track("message_received", {
          session_id: sessionId,
          response: data.content,
          lead: data.leadTriggered
        });

      } catch (e) {
        removeTypingIndicator();
        addMessage("Oops! Something went wrong.", "bot");
        Sentry.captureException(e);
        mixpanel.track("frontend_error", {
          error: e.message,
          site_id: siteId,
          session_id: sessionId
        });
      }
    };

    button.onclick = sendMessage;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }
})();
