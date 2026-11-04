#!/usr/bin/env python3
"""
Generate the demo digital collection for E-Library.

Downloads public-domain texts from Project Gutenberg, then:
  * builds PDF books into uploads/pdfs/
  * writes excerpt text files into scripts/_audio_texts/ (consumed by make_audio.ps1)

Run:  python scripts/make_assets.py
"""
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PDF_DIR = os.path.join(ROOT, "uploads", "pdfs")
TXT_DIR = os.path.join(HERE, "_audio_texts")

UA = "E-Library-Demo/1.0 (college project; contact: student@jscoe.edu.in)"

# key, gutenberg id, start markers (first match wins), pdf chars, audio chars
BOOKS = [
    dict(key="alice", title="Alice's Adventures in Wonderland", author="Lewis Carroll",
         gid=11, markers=["Alice was beginning to get very tired"], pdf=8000, audio=750),
    dict(key="sherlock", title="The Adventures of Sherlock Holmes", author="Arthur Conan Doyle",
         gid=1661, markers=["To Sherlock Holmes she is always THE woman"], pdf=8000, audio=750),
    dict(key="pride", title="Pride and Prejudice", author="Jane Austen",
         gid=1342, markers=["It is a truth universally acknowledged"], pdf=8000, audio=0),
    dict(key="metamorphosis", title="The Metamorphosis", author="Franz Kafka",
         gid=5200, markers=["One morning, when Gregor Samsa", "When Gregor Samsa awoke",
                            "As Gregor Samsa"], pdf=8000, audio=0),
    dict(key="republic", title="The Republic", author="Plato",
         gid=1497, markers=["I went down yesterday to the Piraeus", "Yesterday I went down"], pdf=8000, audio=0),
    dict(key="frankenstein", title="Frankenstein; or, The Modern Prometheus", author="Mary Shelley",
         gid=84, markers=["You will rejoice to hear that no disaster"], pdf=0, audio=750),
]

# Short fallback excerpts (used only when Project Gutenberg is unreachable).
FALLBACK = {
    "alice": "Alice was beginning to get very tired of sitting by her sister on the bank, "
             "and of having nothing to do: once or twice she had peeped into the book her sister "
             "was reading, but it had no pictures or conversations in it, 'and what is the use of "
             "a book,' thought Alice 'without pictures or conversations?'",
    "sherlock": "To Sherlock Holmes she is always THE woman. I have seldom heard him mention her "
                "under any other name. In his eyes she eclipses and predominates the whole of her sex.",
    "pride": "It is a truth universally acknowledged, that a single man in possession of a good "
             "fortune, must be in want of a wife.",
    "metamorphosis": "One morning, when Gregor Samsa woke from troubled dreams, he found himself "
                     "transformed in his bed into a horrible vermin.",
    "republic": "I went down yesterday to the Piraeus with Glaucon the son of Ariston, that I might "
                "offer up my prayers to the goddess, and also because I wanted to see in what manner "
                "they would celebrate the festival, which was a new thing.",
    "frankenstein": "You will rejoice to hear that no disaster has accompanied the beginning of an "
                    "enterprise which you have regarded with such evil forebodings.",
}


def fetch(gid):
    url = "https://www.gutenberg.org/cache/epub/%d/pg%d.txt" % (gid, gid)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def body_of(text):
    m = re.search(r"\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*", text)
    if m:
        text = text[m.end():]
    m = re.search(r"\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK", text)
    if m:
        text = text[:m.start()]
    return text.strip()


def excerpt(text, markers, chars):
    if chars <= 0:
        return ""
    start = 0
    for mk in markers:
        i = text.find(mk)
        if i != -1:
            start = i
            break
    chunk = text[start:start + chars]
    # stop at the last complete paragraph for a clean ending
    if "\n\n" in chunk[200:]:
        chunk = chunk[:chunk.rfind("\n\n")]
    return chunk.strip()


def tidy(s):
    """Make Gutenberg text PDF-friendly (latin-1, clean whitespace)."""
    repl = {"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
            "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " ",
            "\u2022": "-", "\u201a": "'", "\u2032": "'"}
    for k, v in repl.items():
        s = s.replace(k, v)
    s = s.encode("latin-1", "replace").decode("latin-1")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def make_pdf(path, title, author, text):
    from fpdf import FPDF
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, margin=20)
    pdf.add_page()

    def line(h, s, font, style="", size=11, align="L"):
        pdf.set_font(font, style, size)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, h, s, align=align)

    line(9, tidy(title), "Helvetica", "B", 16, "C")
    line(8, tidy(author), "Helvetica", "I", 12, "C")
    pdf.ln(6)
    for para in [p for p in re.split(r"\n\s*\n", text) if p.strip()]:
        para = tidy(re.sub(r"\n", " ", para))
        if not para:
            continue
        line(6, para, "Helvetica", "", 11)
        pdf.ln(3)
    pdf.output(path)


def main():
    os.makedirs(PDF_DIR, exist_ok=True)
    os.makedirs(TXT_DIR, exist_ok=True)
    for b in BOOKS:
        text, src = None, "gutenberg"
        try:
            text = body_of(fetch(b["gid"]))
        except Exception as e:  # network problems -> embedded excerpts
            src = "fallback (%s)" % e
            text = FALLBACK[b["key"]]
        pdf_part = excerpt(text, b["markers"], b["pdf"])
        if b["pdf"]:
            if not pdf_part:
                pdf_part = FALLBACK[b["key"]]
            out = os.path.join(PDF_DIR, b["key"] + ".pdf")
            make_pdf(out, b["title"], b["author"], pdf_part)
            print("PDF  %-16s -> %-24s [%s]" % (b["key"], os.path.basename(out), src))
        if b["audio"]:
            audio_part = excerpt(text, b["markers"], b["audio"]) or FALLBACK[b["key"]]
            out = os.path.join(TXT_DIR, b["key"] + ".txt")
            with open(out, "w", encoding="utf-8") as f:
                f.write(b["title"] + ". " + audio_part)
            print("TXT  %-16s -> %-24s [%s]" % (b["key"], os.path.basename(out), src))
    print("done")


if __name__ == "__main__":
    sys.exit(main())
