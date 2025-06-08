from playwright.sync_api import sync_playwright
import hashlib
import openai
from supabase import create_client, Client
from urllib.parse import urlparse, urljoin
from datetime import datetime
import time
import json

# === CONFIGURATION ===

START_URL = "https://iimaventures.com"  # 🔁 Start crawling here
SITE_ID = "iimaventures"
MAX_PAGES = 150
CHUNK_SIZE = 1000
MAX_PAGE_TOKENS = 10000

# 🔐 API KEYS & DB CONNECTION
openai.api_key = "sk-“
SUPABASE_URL = "https://sicsxjkykcvqlesncycq.supabase.co"  # ← SUPABASE URL
SUPABASE_KEY = "key”
TABLE_NAME = "snappi_chunks"

# === UTILITIES ===

def clean_text(raw_text):
    return " ".join(raw_text.strip().split())

def chunk_text(text, chunk_size=CHUNK_SIZE):
    words = text.split()
    return [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]

def get_embedding(text, retries=3, delay=2):
    for attempt in range(retries):
        try:
            response = openai.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"[Retry {attempt+1}] OpenAI Error: {e}")
            time.sleep(delay)
    raise RuntimeError("Failed to get embedding after retries")

def get_summary_and_tags(text):
    prompt = f"""You are Snappi, a smart summarizer and tagger.

Given the content of a web page (up to {MAX_PAGE_TOKENS} tokens), generate a JSON with:
- "summary": a brief 2–3 sentence summary
- "tags": a list of 5–10 relevant topic tags

CONTENT:
\"\"\"
{text}
\"\"\"
Respond in JSON format only.
"""
    response = openai.chat.completions.create(
        model="gpt-4.1-nano-2025-04-14",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
    )
    try:
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"⚠️ Could not parse summary response: {e}")
        return {"summary": "", "tags": []}

def insert_to_supabase(client: Client, record: dict):
    return client.table(TABLE_NAME).insert(record).execute()

def is_internal_link(href, base_domain):
    if not href or href.startswith(("mailto:", "tel:", "javascript:")):
        return False
    parsed_href = urlparse(href)
    return (not parsed_href.netloc) or (base_domain in parsed_href.netloc)

# === MAIN ===

def main():
    visited = set()
    to_visit = set([START_URL])
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    base_domain = urlparse(START_URL).netloc

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        while to_visit and len(visited) < MAX_PAGES:
            url = to_visit.pop()
            if url in visited:
                continue

            try:
                print(f"\n🔗 Crawling {url}")
                page.goto(url, timeout=20000)
                visited.add(url)

                full_text = clean_text(page.inner_text("body"))
                title = page.title()

                try:
                    desc = page.locator("meta[name='description']").get_attribute("content")
                except:
                    desc = None

                if len(full_text.split()) < 50:
                    print("⚠️ Skipping low-content page.")
                    continue

                summary_info = get_summary_and_tags(full_text)
                summary = summary_info.get("summary", "")
                tags = summary_info.get("tags", [])

                chunks = chunk_text(full_text)
                for idx, chunk in enumerate(chunks):
                    if len(chunk.strip()) < 20:
                        continue

                    print(f"  → Embedding chunk {idx+1}/{len(chunks)}")
                    embedding = get_embedding(chunk)
                    chunk_id = hashlib.md5(f"{url}_{idx}".encode()).hexdigest()

                    record = {
                        "id": chunk_id,
                        "url": url,
                        "section": url.split("/")[-1] or "homepage",
                        "chunk_index": idx,
                        "text": chunk,
                        "embedding": embedding,
                        "title": title,
                        "meta_description": desc,
                        "summary": summary,
                        "tags": tags,
                        "site_id": SITE_ID,
                        "lang": "en",
                        "scraped_ok": True,
                        "page_hash": hashlib.md5(full_text.encode()).hexdigest(),
                        "created_at": datetime.utcnow().isoformat()
                    }

                    insert_to_supabase(supabase, record)

                hrefs = page.eval_on_selector_all("a", "els => els.map(el => el.href)")
                for href in hrefs:
                    if is_internal_link(href, base_domain):
                        full_url = urljoin(url, href.split("#")[0])
                        if full_url not in visited:
                            to_visit.add(full_url)

            except Exception as e:
                print(f"❌ Failed on {url}: {e}")

        browser.close()

if __name__ == "__main__":
    main()

