# Instrumented and annotated version of your /ask endpoint with full Sentry + debug logging

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import re
import json
import openai
import requests
import logging
from uuid import uuid4
from dotenv import load_dotenv
from typing import List
from supabase import create_client, Client
from datetime import datetime
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from mixpanel import Mixpanel

# ---------------------- Environment Setup -----------------------
load_dotenv(dotenv_path="/home/luckylabs/mysite/.env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SENTRY_DSN = os.getenv("SENTRY_DSN")
MIXPANEL_TOKEN = os.getenv("MIXPANEL_TOKEN")

SUPABASE_FUNCTION_URL = f"{SUPABASE_URL}/rest/v1/rpc/yunosearch"
openai.api_key = OPENAI_API_KEY
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
mp = Mixpanel(MIXPANEL_TOKEN)

# ---------------------- Sentry Setup -----------------------
sentry_sdk.init(
    dsn=SENTRY_DSN,
    integrations=[FlaskIntegration()],
    traces_sample_rate=1.0,
    send_default_pii=True
)

# ---------------------- Logging Setup -----------------------
logging.basicConfig(
    filename="/tmp/yuno_debug.log",
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# ---------------------- Flask App Init -----------------------
app = Flask(__name__)
CORS(app)

# ---------------------- Constants -----------------------

SYSTEM_PROMPT = """
You are Yuno, a warm, helpful assistant who chats with visitors about a website’s products, policies, or info.
You must answer simply, clearly, and like a kind human—not a chatbot.

Guidelines
----------
• Keep replies short and friendly (2–3 sentences).
• Use casual language—“Hey!” / “Sure!” is fine.
• If the info exists, answer in ≤2 sentences.
• If the info is missing, do **not** guess. Politely direct the visitor to our support email.
• Speak as part of the team (“we”, “our”), never third-person.
• Use the full chat history for context; avoid needless repetition.
• If the visitor’s question is vague, ask a clarifying follow-up.
• Never invent facts outside provided context.
• If the visitor shows purchase/booking intent, ask for contact details and set **leadTriggered=true** once you have an email or phone (plus inferred name if possible).

Edge Cases Handling
-------------------
• Greetings & Closures
  – On “Hi”, “Hello!”, respond: “Hey there—how can we help?”
  – On “Bye!”, “See ya”, respond: “Talk soon! Let us know if you need anything else.”

• Small Talk & Chitchat
  – On “How’s your day?”, “What’s up?”, for example say like: “All good here! What product info can I get for you today?”

• Vague or One-Word Queries
  – On “Pricing?”, “Policies?”, for example say like: “Sure—are you looking for our subscription tiers or our refund policy?”

• Multiple Questions in One Message
  – Either answer both succinctly (for example say like - “Pricing is ₹999/mo; support hours are 9am–6pm weekdays. Anything else?”) or split into two parts with a quick transition.

• Broken/Invalid Requests
  – On gibberish or unsupported attachments, for example say like: “Hmm, I’m not quite following. Could you rephrase or drop me a note at care@example.com?”

• Escalation & Human Handoff
  – On “I need to talk to someone” or clear urgency, for example say like: “I’m looping in our team—can you share your email so we can dive deeper?”

• Negative Sentiment or Frustration
  – On “This is terrible”, “I’m stuck”, for example say like: “Sorry you’re having trouble. Can you tell me where you got stuck so we can fix it?”

• Repeated Queries
  – On asking the same thing twice, for example say like: “We covered that above—did that answer your question, or should I clarify further?”

• Language Switching
  – If the user mixes languages (“Hola, pricing?”), detect the other language and continue in that language after confirmation: “I see you said ‘Hola’. Would you like me to continue in Spanish?”

• Edge-case Inputs (Emojis Only)
  – On “👍”, for example say like: “Glad that helped! Anything else I can do?”
  – On “😢”, for example say like: “Sorry to see that—what can I improve?”

════════════════  ABSOLUTE JSON-ONLY RESPONSE RULE  ════════════════
You must reply **only** with a single JSON object that matches exactly
one of the schemas below—no markdown, no plain text.

🟢 Normal answer (no lead captured)
{
  "content":               "<short helpful response>",
  "role":                  "yuno",
  "leadTriggered":         false,
  "lang":                  "<two-letter code, e.g. 'en' or 'hi'>",
  "answer_confidence":     <float 0-1>,
  "intent":                "<high-level intent label or null>",
  "tokens_used":           <integer>,
  "follow_up":             <true|false>,
  "follow_up_prompt":      "<optional follow-up question or null>",
  "user_sentiment":        "<positive|neutral|negative>",
  "compliance_red_flag":   <true|false>
}

🟡 Lead intent captured (email or phone present)
{
  "content":               "<short helpful response>",
  "role":                  "yuno",
  "leadTriggered":         true,
  "lead": {
    "name":   "<inferred or null>",
    "email":  "<extracted or null>",
    "phone":  "<extracted or null>",
    "intent": "<brief summary of what the visitor wants>"
  },
  "lang":                  "<two-letter code>",
  "answer_confidence":     <float 0-1>,
  "intent":                "<label>",
  "tokens_used":           <integer>,
  "follow_up":             <true|false>,
  "follow_up_prompt":      "<prompt or null>",
  "user_sentiment":        "<positive|neutral|negative>",
  "compliance_red_flag":   <true|false>
}

🔴 Cannot answer
{
  "content": "Hmm, I didn’t see that info here — but feel free to email us at care@example.com and we’ll help out! 😊",
  "role":    "yuno",
  "leadTriggered": false,
  "lang":                  "<two-letter code>",
  "answer_confidence":     0.0,
  "intent":                null,
  "tokens_used":           <integer>,
  "follow_up":             false,
  "follow_up_prompt":      null,
  "user_sentiment":        "neutral",
  "compliance_red_flag":   false
}

IMPORTANT
---------
* Always include every key shown in the chosen schema.
* Do **not** output any additional keys or free text.
* Respond with **exactly one** JSON object.
"""


REWRITER_PROMPT = """
You are an assistant that rewrites a user’s query using recent chat history.
Your goal is to combine the current user message and past conversation into
a clear, standalone query. Use complete language. Do not mention the history.

For eg -
User - Tell me about your services?
You - We offer MBA, BBA, MTech
User - Wow, tell me about second one?

so in this case you will respond with this type of query - "Wow can you tell me more about your BBA services"

The idea is we will use this for RAG based vector search, so we will need exact query so that query is as meaningful as possible.
IF You think that latest User message is not related to previous conversation and it would make sense for RAG search to just use the latest message, so just rewrite the latest message properly.
Just output the rewritten query as a single sentence.

Chat History:
{history}

User's New Message:
{latest}

Rewritten Query:
"""

SYSTEM_PROMPT_2 = """
Remember You Just have to reply ONLY IN JSON, refer below for reference -

{
  "content":               "<short helpful response>",
  "role":                  "yuno",
  "leadTriggered":         <true|false>,

  "lead": {
    "name":   "<inferred or null>",
    "email":  "<extracted or null>",
    "phone":  "<extracted or null>",
    "intent": "<brief summary of what the visitor wants>"
  },

  "lang":                  "<two-letter code>",
  "answer_confidence":      <float 0-1>,
  "intent":                "<label>",
  "tokens_used":            <integer>,
  "follow_up":     <true|false>,
  "follow_up_prompt":        "<prompt or null>",
  "user_sentiment":         "<positive|neutral|negative>",
  "compliance_red_flag":     <true|false>
}

ONLY JSON, Do not output anything else.

"""

# ---------------------- Utility Functions -----------------------
def get_embedding(text: str) -> List[float]:
    embedding = openai.embeddings.create(input=text, model="text-embedding-3-large")
    return embedding.data[0].embedding

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

def insert_chat_message(
        site_id, session_id, user_id, page_url,
        role, content,
        raw_json_output=None,
        *,                       # everything after * is optional & named
        lang=None,
        confidence=None,
        intent=None,
        tokens_used=None,
        follow_up=None,
        follow_up_prompt=None,
        sentiment=None,
        compliance_flag=None):
    """Write one chat turn into chat_history (Supabase)."""

    payload = {
        "site_id":   site_id,
        "session_id":session_id,
        "user_id":   user_id,
        "page_url":  page_url,
        "role":      role,
        "content":   content,
        "timestamp": datetime.utcnow().isoformat()
    }

    # core JSON blob for audit
    if raw_json_output is not None:
        payload["raw_json_output"] = raw_json_output

    # ---- new analytic columns (insert only if not None) ----
    if lang               is not None: payload["lang"]                = lang
    if confidence         is not None: payload["answer_confidence"]   = confidence
    if intent             is not None: payload["intent"]              = intent
    if tokens_used        is not None: payload["tokens_used"]         = tokens_used
    if follow_up          is not None: payload["follow_up"]           = follow_up
    if follow_up_prompt   is not None: payload["follow_up_prompt"]    = follow_up_prompt
    if sentiment          is not None: payload["user_sentiment"]      = sentiment
    if compliance_flag    is not None: payload["compliance_red_flag"] = compliance_flag

    headers = {
        "apikey":       SUPABASE_KEY,
        "Authorization":f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

    logging.debug("Inserting chat message into Supabase: %s", payload)
    sentry_sdk.set_extra(f"supabase_chat_insert_{role}", payload)

    requests.post(
        f"{SUPABASE_URL}/rest/v1/chat_history",
        headers=headers,
        data=json.dumps(payload)
    )

def insert_lead(lead_data):
    logging.debug("Inserting lead: %s", lead_data)
    sentry_sdk.set_extra("supabase_lead_data", lead_data)

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    requests.post(f"{SUPABASE_URL}/rest/v1/leads", headers=headers, data=json.dumps(lead_data))

def rewrite_query_with_context(history: List[dict], latest: str) -> str:
    try:
        chat_log = "\n".join([
            f"{'You' if m['role'] in ['assistant', 'yuno', 'bot'] else 'User'}: {m['content']}"
            for m in history
        ])


        prompt = REWRITER_PROMPT.format(history=chat_log, latest=latest)

        response = openai.chat.completions.create(
            model="gpt-4.1-nano-2025-04-14",  # or gpt-4o-mini if needed
            messages=[{ "role": "user", "content": prompt }],
            temperature=0.3
        )

        return response.choices[0].message.content.strip()
    except Exception as e:
        logging.warning("Query rewrite failed: %s", str(e))
        return latest


# ---------------------- /ask Endpoint -----------------------
@app.route("/ask", methods=["POST"])
def ask_endpoint():
    data = request.get_json()
    logging.debug("Incoming /ask request: %s", json.dumps(data, indent=2))
    sentry_sdk.set_extra("incoming_request_data", data)

    messages = data.get("messages")
    site_id = data.get("site_id")
    user_id = data.get("user_id")
    session_id = data.get("session_id")
    page_url = data.get("page_url")
    distinct_id = user_id or session_id or "anonymous"

    mp.track(distinct_id, "chat_history_received", {
        "site_id":   site_id,
        "session_id":session_id,
        "chat_history": messages
    })

    with sentry_sdk.configure_scope() as scope:
        scope.set_tag("site_id", site_id)
        scope.set_tag("session_id", session_id)
        scope.set_user({"id": session_id})

        if not messages or not site_id or not session_id:
            return jsonify({"error": "Missing messages, site_id, or session_id"}), 400

        try:
    # ---  initialize all new flags so they always exist  ---
            lang = None
            confidence = None
            intent_label = None
            tokens_used = None
            follow_up = None
            follow_up_prompt = None
            sentiment = None
            compliance_flag = None
            source_chunks = []

            latest_user_msg = next((m for m in reversed(messages) if m["role"] == "user"), None)
            if not latest_user_msg:
                return jsonify({"error": "No user message found"}), 400

            latest_user_query = latest_user_msg["content"]
            sentry_sdk.set_extra("user_query", latest_user_query)

            mp.track(distinct_id, "user_message_received", {
                "site_id": site_id,
                "session_id": session_id,
                "page_url": page_url,
                "message": latest_user_query
            })

            insert_chat_message(site_id, session_id, user_id, page_url, "user", latest_user_query)



            recent_history = [m for m in messages if m["role"] in ("user", "assistant", "yuno")][-6:]
            # 3️⃣  ➜ log the slice **before** rewriting
            mp.track(distinct_id, "rewriter_context", {
                "site_id":    site_id,
                "session_id": session_id,
                "original_query": latest_user_query,
                "context_used": [
                    {
                        "role": "You" if m["role"] in ("assistant", "yuno") else "User",
                        "content": m["content"]
                    } for m in recent_history
                ]
            })
            rewritten_query = rewrite_query_with_context(recent_history, latest_user_query)

            mp.track(distinct_id, "query_rewritten", {
                "site_id": site_id,
                "session_id": session_id,
                "original_query": latest_user_query,
                "rewritten_query": rewritten_query,
                "chat_context_used": [
                    {
                        "role": "You" if m["role"] in ("assistant", "yuno") else "User",
                        "content": m["content"]
                    }
                    for m in recent_history
                ]

            })

            sentry_sdk.set_extra("rewritten_query", rewritten_query)
            embedding = get_embedding(rewritten_query)

            sentry_sdk.set_extra("embedding_vector_partial", embedding[:5])

            mp.track(distinct_id, "embedding_generated", {
                "original_query": latest_user_query,
                "rewritten_query": rewritten_query,
                "site_id": site_id,
                "embedding_preview": str(embedding[:5])
            })

            matches = semantic_search(embedding, site_id)
            sentry_sdk.set_extra("vector_search_results", matches[:3])

            mp.track(distinct_id, "vector_search_performed", {
                "site_id": site_id,
                "session_id": session_id,
                "match_count": len(matches),
                "top_matches": matches[:2]  # includes first 2 chunks
            })

            context = "\n\n".join(match.get("detail") or match.get("text") or "" for match in matches if match)
            updated_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            recent_turns = [m for m in messages if m["role"] in ("user", "yuno", "assistant")][-4:]
            for m in recent_turns:
                updated_messages.append({
                    "role": "user" if m["role"] == "user" else "assistant",
                    "content": m["content"]
                })

            focused_prompt = f"{latest_user_query}\n\nRelevant website content:\n{context}"
            # after you build focused_prompt
            updated_messages.append({
                "role": "system",
                "content": 'Remember: respond ONLY with a JSON object in the schema {"content": "...", "role":"yuno", "leadTriggered": false}.'
            })
            updated_messages.append({
                "role": "user",
                "content": focused_prompt
            })

            # ──────────────── NEW: system prompt 2 ────────────────
            # This guard message will sit just before generation
            updated_messages.append({
                "role": "system",
                "content": SYSTEM_PROMPT_2  # define this constant with your JSON schema reminder
                })


            sentry_sdk.set_extra("gpt_prompt", focused_prompt)

            mp.track(distinct_id, "gpt_prompt_sent", {
                "site_id": site_id,
                "session_id": session_id,
                "full_prompt": focused_prompt
            })

            completion = openai.chat.completions.create(
                model="gpt-4o-mini-2024-07-18",
                messages=updated_messages,
                temperature=0.5
            )

            raw_reply = completion.choices[0].message.content.strip()
            sentry_sdk.set_extra("gpt_raw_reply", raw_reply)

            mp.track(distinct_id, "gpt_response_received", {
                "site_id": site_id,
                "session_id": session_id,
                "raw_reply": raw_reply
            })

            match = re.search(r"\{.*\}", raw_reply, re.DOTALL)
            if not match:
                return jsonify({"error": "Model returned invalid JSON.", "raw_reply": raw_reply}), 500


            reply_json = json.loads(match.group(0))
            assistant_content = reply_json.get("content", raw_reply)

            # ---- pull analytic flags right here (first time) ----
            lang             = reply_json.get("lang")
            confidence       = reply_json.get("answer_confidence")  # note key name change
            intent_label     = reply_json.get("intent")
            tokens_used      = reply_json.get("tokens_used")
            follow_up        = reply_json.get("follow_up")
            follow_up_prompt = reply_json.get("follow_up_prompt")
            sentiment        = reply_json.get("user_sentiment")
            compliance_flag  = reply_json.get("compliance_red_flag")
            source_chunks    = reply_json.get("sourceChunks", [])

            insert_chat_message(
                site_id, session_id, user_id, page_url,
                "assistant", assistant_content,
                raw_json_output=json.dumps(reply_json),
                lang=lang,
                confidence=confidence,
                intent=intent_label,
                tokens_used=tokens_used,
                follow_up=follow_up,
                follow_up_prompt=follow_up_prompt,
                sentiment=sentiment,
                compliance_flag=compliance_flag
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

                mp.track(distinct_id, "lead_captured", lead_data)

            sentry_sdk.set_extra("frontend_response_payload", reply_json)

            mp.track(distinct_id, "bot_reply_sent", {
                "session_id": session_id,
                "site_id": site_id,
                "content": assistant_content,
                "lead_triggered": reply_json.get("leadTriggered", False)
            })

            return jsonify(reply_json)

        except Exception as e:
            sentry_sdk.capture_exception(e)
            mp.track(distinct_id, "server_error", {
                "site_id": site_id,
                "error": str(e),
                "lang": lang,
                "intent": intent_label
            })
            logging.exception("Exception in /ask")
            return jsonify({"error": str(e)}), 500


# ---------------------- Health Check -----------------------
@app.route("/")
def health():
    return "API is running.", 200

application = app
