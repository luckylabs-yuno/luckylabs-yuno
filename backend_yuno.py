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
from datetime import datetime

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
Sure! Here’s the updated prompt for **Yuno**, incorporating:

* The same friendly assistant behavior,
* Proper JSON-only formatting,
* The new `leadTriggered` flag,
* A `leads` object with `name`, `email`, `phone`, `intent`.

---

### ✅ Final Updated Prompt:

> You are Yuno, a warm, helpful assistant who chats with visitors about a website’s products, policies, and info. You use the content you’re given (from the website) to answer questions simply, clearly, and like a kind human—not a chatbot.

Here’s how you should respond:

* Keep it short and friendly. 1–2 sentences is perfect.
* Use natural, casual language—like you're texting someone politely. A little “Hey!” or “Sure!” is totally fine.
* If you do find the answer in the info, explain it clearly in a sentence or two.
* If the info isn’t there, don’t guess. Just say something helpful and guide the visitor to contact us. For example:

  * “Hmm, I didn’t see that info here—but feel free to email us at [care@example.com](mailto:care@example.com) and we’ll help out! 😊”
* You are part of the website team—don’t refer to it in third person. Say “we” or “our team” instead of “their team.”
* If the visitor follows up or refers to a previous message, use the full message history for context. Don’t repeat yourself unless it helps.
* If the visitor’s message is vague or unclear, ask politely for more info. Example: “Hey! Could you tell me a bit more so I can help better? 😊”
* If sharing contact info or links, keep it simple. Example: “You can email us at [hello@example.com](mailto:hello@example.com)” or “Check out our FAQs on the Help page.”
* Never make anything up. Only answer based on what’s in the context you’re given.

---

### JSON Output Rules:

* Your entire response **must ONLY be valid JSON** and follow this structure **exactly**:

#### 🟢 If you are answering normally:
{
  "content": "Your short helpful response",
  "role": "yuno",
  "leadTriggered": false
}


#### 🟡 If the visitor seems interested in a purchase, appointment, or other “lead” intent:

Return this structure:
{
  "content": "Your short helpful response",
  "role": "yuno",
  "leadTriggered": true,
  "lead": {
    "name": "Guessed name from message if available or leave null",
    "email": "Extracted or null",
    "phone": "Extracted or null",
    "intent": "Brief summary of what the visitor seems to want"
  }
}

#### 🔴 If you can’t answer:
{
  "content": "Hmm, I didn’t see that info here—but feel free to email us at care@example.com and we’ll help out! 😊",
  "role": "yuno",
  "leadTriggered": false
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
def insert_chat_message(site_id, session_id, user_id, page_url, role, content, raw_json_output=None):
    payload = {
        "site_id": site_id,
        "session_id": session_id,
        "user_id": user_id,
        "page_url": page_url,
        "role": role,
        "content": content,
        "timestamp": datetime.utcnow().isoformat(),
    }
    if raw_json_output:
        payload["raw_json_output"] = raw_json_output

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/chat_history",
        headers=headers,
        data=json.dumps(payload)
    )
    logging.debug("Chat history insert status: %s %s", response.status_code, response.text)
    response.raise_for_status()


def insert_lead(lead_data):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    requests.post(f"{SUPABASE_URL}/rest/v1/leads", headers=headers, data=json.dumps(lead_data))


@app.route("/ask", methods=["POST"])
def ask_endpoint():
    data = request.get_json()
    logging.debug("Incoming /ask request: %s", json.dumps(data, indent=2))

    messages = data.get("messages")
    site_id = data.get("site_id")
    user_id = data.get("user_id")
    session_id = data.get("session_id")
    page_url = data.get("page_url")

    if not messages or not site_id or not session_id:
        return jsonify({"error": "Missing messages, site_id, or session_id"}), 400

    try:
        latest_user_msg = next((m for m in reversed(messages) if m["role"] == "user"), None)
        if not latest_user_msg:
            return jsonify({"error": "No user message found"}), 400

        latest_user_query = latest_user_msg["content"]
        insert_chat_message(site_id, session_id, user_id, page_url, "user", latest_user_query)

        embedding = get_embedding(latest_user_query)
        matches = semantic_search(embedding, site_id)

        context = "\n\n".join(match.get("detail") or match.get("text") or "" for match in matches if match)
        logging.debug("Context retrieved:\n%s", context)

        updated_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        recent_turns = [m for m in messages if m["role"] in ("user", "yuno", "assistant")][-4:]

        for m in recent_turns:
            updated_messages.append({
                "role": "user" if m["role"] == "user" else "assistant",
                "content": m["content"]
            })

        focused_prompt = f"{latest_user_query}\n\nRelevant website content:\n{context}"
        updated_messages.append({"role": "user", "content": focused_prompt})

        completion = openai.chat.completions.create(
            model="gpt-4o-mini-2024-07-18",
            messages=updated_messages,
            temperature=0.5
        )

        raw_reply = completion.choices[0].message.content.strip()
        logging.debug("Raw reply from model:\n%s", raw_reply)

        match = re.search(r"\{.*\}", raw_reply, re.DOTALL)
        if not match:
            return jsonify({"error": "Model returned invalid JSON.", "raw_reply": raw_reply}), 500

        reply_json = json.loads(match.group(0))
        assistant_content = reply_json.get("content", raw_reply)  # fallback to raw_reply if "content" is missing

        insert_chat_message(
            site_id,
            session_id,
            user_id,
            page_url,
            "assistant",
            assistant_content,
            raw_json_output=json.dumps(reply_json)  # store structured output
            )


        if reply_json.get("leadTriggered"):
            lead = reply_json.get("lead", {})
            lead_data = {
                "site_id": site_id,
                "session_id": session_id,
                "user_id": user_id,
                "page_url": page_url,
                "name": lead.get("name"),
                "email": lead.get("email"),
                "phone": lead.get("phone"),
                "message": latest_user_query,
                "intent": lead.get("intent")
            }
            insert_lead(lead_data)


        return jsonify(reply_json)

    except Exception as e:
        logging.exception("Exception in /ask")
        return jsonify({"error": str(e)}), 500


# ---------------------- Other Utility Endpoints (no change) -----------------------
# Keep your Instagram, transcript, YouTube, article, etc. routes as-is.


# ---------------------- Instagram Caption -----------------------
def clean_instagram_url(url): return url.split("?")[0]

def extract_shortcode(url):
    match = re.search(r"reel/([^/?#&]+)", url)
    return match.group(1) if match else None

@app.route("/extract", methods=["POST"])
def extract_caption():
    data = request.get_json()
    url = data.get("video_url")

    cleaned_url = clean_instagram_url(url)
    shortcode = extract_shortcode(cleaned_url)

    if not shortcode:
        return jsonify({"error": "Invalid Instagram URL"}), 400

    try:
        loader = instaloader.Instaloader(
            download_video_thumbnails=False,
            download_comments=False,
            save_metadata=False,
            download_videos=False
        )

        session_path = "/home/luckylabs/mysite/session-insta_brain83"
        loader.load_session_from_file("insta_brain83", filename=session_path)

        post = instaloader.Post.from_shortcode(loader.context, shortcode)

        result = {
            "platform": "Instagram",
            "username": post.owner_username,
            "title": post.title or "",
            "caption": post.caption or "",
            "shortcode": shortcode,
            "is_video": post.is_video,
            "video_url": post.video_url,
            "thumbnail_url": post.url
        }
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------- YouTube MP3 -----------------------
@app.route("/transcript", methods=["POST"])
def get_audio_from_youtube():
    data = request.get_json()
    url = data.get("video_url")

    if not url:
        return jsonify({"error": "Missing 'video_url' in request"}), 400

    try:
        output_dir = "/tmp"
        filename_base = str(uuid4())
        output_path = os.path.join(output_dir, f"{filename_base}.%(ext)s")

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_path,
            'quiet': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            mp3_file = os.path.join(output_dir, f"{filename_base}.mp3")

            if not os.path.exists(mp3_file):
                return jsonify({"error": "MP3 file not found"}), 500

            return send_file(mp3_file, mimetype="audio/mpeg", as_attachment=True)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------- Article Extract -----------------------
@app.route("/article", methods=["POST"])
def extract_article():
    data = request.get_json()
    url = data.get("video_url")

    if not url:
        return jsonify({"error": "Missing 'video_url' in request"}), 400

    try:
        article = Article(url)
        article.download()
        article.parse()

        result = {
            "platform": "Web Article",
            "title": article.title,
            "authors": article.authors,
            "publish_date": article.publish_date.isoformat() if article.publish_date else None,
            "text": article.text,
            "top_image": article.top_image,
            "url": url
        }

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------- YouTube Transcript -----------------------
def extract_video_id(url: str) -> str:
    regex = r"(?:v=|\/shorts\/|\/watch\/|\/embed\/|\/)([0-9A-Za-z_-]{11})"
    match = re.search(regex, url)
    return match.group(1) if match else url.strip()

@app.route("/YoutubeTranscript", methods=["POST"])
def youtube_transcript():
    data = request.get_json()

    if not data or 'url' not in data:
        return jsonify({"error": "Missing 'url' in JSON payload"}), 400

    url = data['url']
    video_id = extract_video_id(url)

    try:
        transcript_data = YouTubeTranscriptApi.get_transcript(video_id)
        transcript_lines = [line['text'] for line in transcript_data]
        return jsonify({"transcript": transcript_lines})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------- Health -----------------------
@app.route("/")
def health():
    return "API is running.", 200


# ---------------------- WSGI App Hook -----------------------
application = app
