The Manusmriti the posts are based on lives in this folder, and only what is here is ever used as the source of a claim.

* `manusmriti_verses.json` and `ingest_report.json` are written by
  `python3 backend/trials/manusmriti_critique/tools/ingest_book.py /path/to/Manu-Smriti.pdf`.
* `approved_context.json` (optional) is a JSON list of outside facts a post may use, one sentence each, for example the
  date Ambedkar burned the text. Without it, a post that mentions anything outside the cited verses is rejected.

Files here other than this README are not committed to git: a translation may be someone else's copyright. See `../README.md`.
