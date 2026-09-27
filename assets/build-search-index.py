#!/usr/bin/env python3
"""Generate search-index.json for The First 90 Days from the article HTML files.

Run from anywhere:  python3 assets/build-search-index.py

Output: <site-root>/search-index.json — a JSON array with one entry per article:
  { "title": ..., "url": "articles/<slug>.html", "excerpt": ..., "headings": [...] }

Validation: the script re-reads the file with json.load and asserts every URL
resolves to a real local file. Exit code is non-zero on any failure.
"""
import glob
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

SITE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES_DIR = os.path.join(SITE_DIR, "articles")
OUT_PATH = os.path.join(SITE_DIR, "search-index.json")
SKIP_P_CLASSES = {"breadcrumb", "article-meta", "affiliate-note"}

WS = re.compile(r"\s+")


def clean(text):
    return WS.sub(" ", html.unescape(text or "")).strip()


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title_tag = ""
        self.h1 = ""
        self.headings = []
        self.lede = ""
        self._in_title = False
        self._in_h1 = False
        self._in_h2 = False
        self._in_p = False
        self._in_post = False
        self._p_class = ""
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self._in_title = True
            self._buf = ""
        elif tag == "article" and "post" in attrs.get("class", "").split():
            self._in_post = True
        elif not self._in_post:
            return
        elif tag == "h1" and not self.h1:
            self._in_h1 = True
            self._buf = ""
        elif tag == "h2":
            self._in_h2 = True
            self._buf = ""
        elif tag == "p" and not self.lede:
            self._in_p = True
            self._p_class = attrs.get("class", "").split()[0] if attrs.get("class") else ""
            self._buf = ""

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self.title_tag = clean(self._buf)
            self._in_title = False
        elif tag == "article" and self._in_post:
            self._in_post = False
        elif not self._in_post:
            return
        elif tag == "h1" and self._in_h1:
            self.h1 = clean(self._buf)
            self._in_h1 = False
        elif tag == "h2" and self._in_h2:
            text = clean(self._buf)
            if text:
                self.headings.append(text)
            self._in_h2 = False
        elif tag == "p" and self._in_p:
            text = clean(self._buf)
            if text and self._p_class not in SKIP_P_CLASSES:
                self.lede = text
            self._in_p = False

    def handle_data(self, data):
        if self._in_title or self._in_h1 or self._in_h2 or self._in_p:
            self._buf += data


def excerpt(text, limit=160):
    text = clean(text)
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return (cut or text[:limit]).rstrip(" ,;:") + "…"


def build():
    files = sorted(glob.glob(os.path.join(ARTICLES_DIR, "*.html")))
    if not files:
        sys.exit("ERROR: no article HTML files found in " + ARTICLES_DIR)
    entries = []
    for path in files:
        slug = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8") as f:
            parser = ArticleParser()
            parser.feed(f.read())
        title = parser.h1 or parser.title_tag
        if not title:
            sys.exit("ERROR: no title/h1 found in " + path)
        entries.append({
            "title": title,
            "url": "articles/%s.html" % slug,
            "excerpt": excerpt(parser.lede),
            "headings": parser.headings,
        })
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return entries


def validate(entries):
    with open(OUT_PATH, encoding="utf-8") as f:
        data = json.load(f)  # proves the JSON parses
    assert data == entries, "written file does not match built entries"
    for entry in data:
        for key in ("title", "url", "excerpt", "headings"):
            assert key in entry, "entry missing key %r: %r" % (key, entry)
        local = os.path.join(SITE_DIR, entry["url"])
        assert os.path.isfile(local), "URL does not resolve to a local file: " + entry["url"]
    return data


def main():
    entries = build()
    data = validate(entries)
    print("Wrote %s with %d entries; all URLs resolve locally." % (OUT_PATH, len(data)))


if __name__ == "__main__":
    main()
