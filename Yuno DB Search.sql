create or replace function yunosearch(
  query_embedding vector,
  site_id text,
  max_distance float default 0.3
)
returns table (
  id text,
  url text,
  section text,
  title text,
  meta_description text,
  text text,
  chunk_index integer,
  embedding vector,
  summary text,
  tags text[],
  lang text,
  has_form boolean,
  scraped_ok boolean,
  page_hash text,
  created_at timestamptz
)
language sql
as $$
  select
    id,
    url,
    section,
    title,
    meta_description,
    text,
    chunk_index,
    embedding,
    summary,
    tags,
    lang,
    has_form,
    scraped_ok,
    page_hash,
    created_at
  from snappi_chunks
  where embedding is not null
    and site_id = yunosearch.site_id
    and embedding <#> query_embedding <= max_distance
  order by embedding <#> query_embedding
  limit 5;
$$;
