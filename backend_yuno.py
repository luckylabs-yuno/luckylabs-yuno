from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import re
import json
import openai
import requests
import instaloader
import yt_dlp
import logging
from uuid import uuid4
from dotenv import load_dotenv
from typing import List
from supabase import create_client, Client
from youtube_transcript_api import YouTubeTranscriptApi
from newspaper import Article

# ---------------------- Environment Setup -----------------------
load_dotenv(dotenv_path="/home/luckylabs/mysite/.env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_FUNCTION_URL = f"{SUPABASE_URL}/rest/v1/rpc/yunosearch"

openai.api_key = OPENAI_API_KEY
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------- Logging Setup -----------------------
logging.basicConfig(
    filename="/tmp/yuno_debug.log",
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# ---------------------- Flask App Init -----------------------
app = Flask(__name__)
CORS(app)

# ---------------------- System Prompt -----------------------
SYSTEM_PROMPT = """
You are Yuno, a warm, helpful assistant who chats with visitors about a website’s products, policies, and info. You use the content you’re given (from the website) to answer questions simply, clearly, and like a kind human—not a chatbot.

Here’s how you should respond:

- Keep it short and friendly. 1–2 sentences is perfect.
- Use natural, casual language—like you're texting someone politely. A little “Hey!” or “Sure!” is totally fine.
- If you do find the answer in the info, explain it clearly in a sentence or two.
- If the info isn’t there, don’t guess. Just say something helpful and guide the visitor to contact us. For example:
  * “Hmm, I didn’t see that info here—but feel free to email us at care@example.com and we’ll help out! 😊”
- You are part of the website team—don’t refer to it in third person. Say “we” or “our team” instead of “their team.”
- If the visitor follows up or refers to a previous message, use the full message history for context. Don’t repeat yourself unless it helps.
- If the visitor’s message is vague or unclear, ask politely for more info. Example: “Hey! Could you tell me a bit more so I can help better? 😊”
- If sharing contact info or links, keep it simple. Example: “You can email us at hello@example.com” or “Check out our FAQs on the Help page.”
- Never make anything up. Only answer based on what’s in the context you’re given.

Your entire response must ONLY be valid JSON and look exactly like this:
{
  "content": "Your short helpful response",
  "role": "yuno"
}

DO NOT include anything else. No markdown, no explanations, no plain text.
If you cannot answer, return this JSON:
{
  "content": "Hmm, I didn’t see that info here—but feel free to email us at care@example.com and we’ll help out! 😊",
  "role": "yuno"
}


"""

# ---------------------- Embedding + Search -----------------------
def get_embedding(text: str) -> List[float]:
    response = openai.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

def semantic_search(query_embedding: List[float], site_id: str) -> List[dict]:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "query_embedding": query_embedding,
        "site_id": site_id,
        "max_distance": 0.3
    }
    response = requests.post(SUPABASE_FUNCTION_URL, headers=headers, data=json.dumps(payload))
    response.raise_for_status()
    return response.json()

# ---------------------- /ask Endpoint -----------------------
@app.route("/ask", methods=["POST"])
def ask_endpoint():
    data = request.get_json()
    logging.debug("Incoming /ask request: %s", json.dumps(data, indent=2))

    messages = data.get("messages")
    site_id = data.get("site_id")

    if not messages or not site_id:
        logging.error("Missing messages or site_id")
        return jsonify({"error": "Missing messages or site_id"}), 400

    try:
        # 1. Extract latest user message for embedding + vector search
        latest_user_query = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        logging.debug("Extracted latest user query: %s", latest_user_query)

        embedding = get_embedding(latest_user_query)
        matches = semantic_search(embedding, site_id)

        # 2. Build vector-based website context
        context = "\n\n".join(
            match.get("detail") or match.get("text") or ""
            for match in matches if match
        )
        logging.debug("Context retrieved:\n%s", context)

        # 3. Start constructing the messages for LLM
        updated_messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # 4. Add previous 2 user-assistant message pairs (i.e., 4 messages max)
        conversation_turns = [m for m in messages if m["role"] in ("user", "yuno")]
        recent_turns = conversation_turns[-4:]  # last 2 user + yuno pairs
        for msg in recent_turns:
            updated_messages.append({
                "role": "user" if msg["role"] == "user" else "assistant",
                "content": msg["content"]
            })

        # 5. Add current user query + vector context as latest message
        focused_prompt = f"{latest_user_query}\n\nRelevant website content:\n{context}"
        updated_messages.append({"role": "user", "content": focused_prompt})

        # 6. Send to OpenAI
        completion = openai.chat.completions.create(
            model="gpt-4o-mini-2024-07-18",
            messages=updated_messages,
            temperature=0.5
        )

        raw_reply = completion.choices[0].message.content.strip()
        logging.debug("Raw reply from model:\n%s", raw_reply)

        # 7. Parse JSON reply
        match = re.search(r"\{.*\}", raw_reply, re.DOTALL)
        if match:
            reply_json = json.loads(match.group(0))
            return jsonify(reply_json)
        else:
            logging.error("Invalid JSON in model reply.")
            return jsonify({
                "error": "Model returned invalid JSON.",
                "raw_reply": raw_reply
            }), 500

    except Exception as e:
        logging.exception("Exception in /ask")
        return jsonify({"error": str(e)}), 500

