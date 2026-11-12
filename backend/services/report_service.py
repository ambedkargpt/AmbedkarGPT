"""
The twice-daily activity report: 6 pm and midnight, India time.

Each report covers the time since the one before (00:00-18:00, then
18:00-24:00) and also gives the whole day's totals so far:
  - sign-ups, with who they are and where they signed up from;
  - logins; guest logins (new and returning guests);
  - posts written, with who wrote them, from which story, and the text;
  - visits to the website: how many, from where (city / state, from the
    address) and from which link (Instagram, WhatsApp, ...).

Sent by email (SMTP, the same as OTP mail) to REPORT_RECIPIENTS, or to the
contact address when that is not set, with a CSV file per section.

Places come from the visitor's address through ip-api.com's batch endpoint,
cached in `ip_geo` so an address is looked up once. That free tier is for
non-commercial use; IP_GEO_URL can point at a paid service with the same
response shape.
"""
from __future__ import annotations

import csv
import io
import logging
import os
import smtplib
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html import escape
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))
REPORT_HOURS = (0, 18)                 # report boundaries, India time
IP_GEO_URL = os.getenv("IP_GEO_URL") or "http://ip-api.com/batch?fields=status,query,country,regionName,city"
MAX_LOOKUPS = 500


# ── When ─────────────────────────────────────────────────────────────────────

def report_window(now: datetime | None = None) -> dict[str, Any]:
    """
    The window of the report due at or most recently before `now`.
    A run that starts late (a scheduler can be some minutes behind) still
    reports the window that just ended.
    """
    now_ist = (now or datetime.now(timezone.utc)).astimezone(IST)
    midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    if now_ist.hour >= 18:
        end, start, day_start, slot = midnight.replace(hour=18), midnight, midnight, "evening"
    else:
        end, start, day_start, slot = midnight, midnight - timedelta(hours=6), midnight - timedelta(days=1), "midnight"
    return {"slot": slot, "start": start, "end": end, "day_start": day_start}


def ist(value) -> str:
    if not isinstance(value, datetime):
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST).strftime("%d %b %Y, %I:%M %p")


# ── Where ────────────────────────────────────────────────────────────────────

def _public(ip: str) -> bool:
    import ipaddress

    try:
        return ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


def resolve_places(ips: list[str], cache, fetch=None) -> dict[str, dict]:
    """{ip: {city, region, country}} for these addresses, looked up once each."""
    wanted = sorted({ip for ip in ips if ip and _public(ip)})[:MAX_LOOKUPS]
    found: dict[str, dict] = {}
    for doc in cache.find({"ip": {"$in": wanted}}):
        found[doc["ip"]] = {k: doc.get(k) for k in ("city", "region", "country")}
    missing = [ip for ip in wanted if ip not in found]
    fetch = fetch or _fetch_places
    for i in range(0, len(missing), 100):
        try:
            rows = fetch(missing[i:i + 100])
        except Exception as exc:  # noqa: BLE001 - places are a nicety, not the report
            logger.warning("[report] place lookup failed: %s", exc)
            break
        for row in rows or []:
            if row.get("status") != "success" or not row.get("query"):
                continue
            place = {"city": row.get("city"), "region": row.get("regionName"), "country": row.get("country")}
            found[row["query"]] = place
            cache.update_one({"ip": row["query"]}, {"$set": {**place, "ip": row["query"], "at": datetime.now(timezone.utc)}}, upsert=True)
    return found


def _fetch_places(ips: list[str]) -> list[dict]:
    import httpx

    response = httpx.post(IP_GEO_URL, json=[{"query": ip} for ip in ips], timeout=10)
    response.raise_for_status()
    return response.json()


def place_text(place: dict | None) -> str:
    if not place:
        return ""
    return ", ".join(p for p in (place.get("city"), place.get("region"), place.get("country")) if p)


# name, utm_source values, referring domains, in-app browser marks in the user agent
_SOURCES = (
    ("Instagram", ("instagram", "ig"), ("instagram.com",), ("instagram",)),
    ("Facebook", ("facebook", "fb"), ("facebook.com", "fb.com"), ("fban", "fbav")),
    ("WhatsApp", ("whatsapp", "wa"), ("whatsapp.com", "wa.me"), ("whatsapp",)),
    ("X / Twitter", ("twitter", "x"), ("t.co", "twitter.com", "x.com"), ()),
    ("YouTube", ("youtube", "yt"), ("youtube.com", "youtu.be"), ()),
    ("Google", ("google",), ("google.com", "google.co.in"), ()),
)


def source_of(doc: dict) -> str:
    """
    Where a visit came from: the link's utm_source, else the referring site,
    else the app it was opened in. Instagram usually sends no referrer, but its
    in-app browser names itself in the user agent.
    """
    utm = (doc.get("utm_source") or "").strip().lower()
    ref = (doc.get("referrer") or "").strip().lower()
    host = urlparse(ref).netloc.split(":")[0] if ref else ""
    agent = (doc.get("user_agent") or "").lower()
    for name, utms, hosts, agents in _SOURCES:
        if utm in utms or any(host == h or host.endswith("." + h) for h in hosts):
            return name
    for name, _utms, _hosts, agents in _SOURCES:
        if any(a in agent for a in agents):
            return name
    if utm:
        return utm
    if host and "ambedkargpt" not in host:
        return host
    return "Direct"


# ── What ─────────────────────────────────────────────────────────────────────

def gather(db, window: dict, fetch_places=None) -> dict[str, Any]:
    start, end, day_start = window["start"], window["end"], window["day_start"]
    span = {"$gte": start.astimezone(timezone.utc), "$lt": end.astimezone(timezone.utc)}
    day = {"$gte": day_start.astimezone(timezone.utc), "$lt": end.astimezone(timezone.utc)}

    activity = list(db["activity"].find({"created_at": span}).sort("created_at", 1))
    places = resolve_places([a.get("ip") for a in activity], db["ip_geo"], fetch_places)
    for a in activity:
        a["place"] = place_text(places.get(a.get("ip")))

    from backend.pipeline.party_roles import label_for

    users = list(db["users"].find({"created_at": span}).sort("created_at", 1))
    signup_events = {a["user_id"]: a for a in activity if a["type"] == "signup" and a.get("user_id")}
    signups = [{
        "time": ist(u.get("created_at")), "name": u.get("full_name") or "", "username": u.get("username"),
        "phone": u.get("phone") or "", "email": u.get("email") or "",
        "party": u.get("political_party") or "", "role": label_for(u.get("party_position"), u.get("political_party")),
        "state": u.get("state") or "", "city": u.get("city") or "",
        "how": ", ".join(u.get("auth_providers") or []),
        "ip": (signup_events.get(str(u["_id"])) or {}).get("ip", ""),
        "from": (signup_events.get(str(u["_id"])) or {}).get("place", ""),
    } for u in users if not u.get("is_guest")]

    logins = [{
        "time": ist(a["created_at"]), "name": a.get("full_name") or "", "username": a.get("username") or "",
        "phone": a.get("phone") or "", "email": a.get("email") or "", "party": a.get("political_party") or "",
        "ip": a.get("ip") or "", "from": a.get("place", ""),
    } for a in activity if a["type"] == "login"]

    new_guest_ids = {str(u["_id"]) for u in users if u.get("is_guest")}
    guests = [{
        "time": ist(a["created_at"]), "account": a.get("username") or "", "party": a.get("political_party") or "",
        "new": "new" if a.get("user_id") in new_guest_ids else "returning",
        "ip": a.get("ip") or "", "from": a.get("place", ""),
    } for a in activity if a["type"] == "guest_login"]

    raw_posts = list(db["posts"].find({"created_at": span}).sort("created_at", 1))
    authors = {u["_id"]: u for u in db["users"].find({"_id": {"$in": list({p.get("user_id") for p in raw_posts})}})}
    stories = {n["_id"]: n for n in db["news"].find({"_id": {"$in": list({p.get("news_id") for p in raw_posts})}}, {"headline": 1})}
    posts = []
    for p in raw_posts:
        a = authors.get(p.get("user_id")) or {}
        meta = p.get("generation_meta") or {}
        posts.append({
            "time": ist(p.get("created_at")),
            "by": a.get("full_name") or a.get("username") or "",
            "username": a.get("username") or "",
            "guest": "guest" if a.get("is_guest") else "",
            "party": a.get("political_party") or "",
            "story": (stories.get(p.get("news_id")) or {}).get("headline", ""),
            "platform": ((meta.get("profile_used") or {}).get("target_platform")) or "",
            "status": p.get("status") or "",
            "feedback": p.get("feedback") or "",
            "post": p.get("content") or "",
        })

    visits = [a for a in activity if a["type"] == "visit"]
    visit_rows = [{
        "time": ist(v["created_at"]), "ip": v.get("ip") or "", "from": v.get("place", ""),
        "source": source_of(v), "page": v.get("path") or "", "referrer": v.get("referrer") or "",
        "browser": v.get("user_agent") or "",
    } for v in visits]

    day_users = db["users"].count_documents({"created_at": day})
    day_guest_users = db["users"].count_documents({"created_at": day, "is_guest": True})
    return {
        "window": window,
        "signups": signups, "logins": logins, "guests": guests, "posts": posts, "visits": visit_rows,
        "visit_summary": {
            "total": len(visits),
            "unique": len({v.get("ip") for v in visits}),
            "sources": Counter(source_of(v) for v in visits).most_common(8),
            "places": Counter(v["place"] or "Unknown" for v in visits).most_common(10),
        },
        "day": {
            "signups": day_users - day_guest_users,
            "new_guests": day_guest_users,
            "logins": db["activity"].count_documents({"created_at": day, "type": "login"}),
            "guest_logins": db["activity"].count_documents({"created_at": day, "type": "guest_login"}),
            "posts": db["posts"].count_documents({"created_at": day}),
            "visits": db["activity"].count_documents({"created_at": day, "type": "visit"}),
        },
    }


# ── The email ────────────────────────────────────────────────────────────────

SECTIONS = (
    ("signups", "Sign-ups", ("time", "name", "username", "phone", "email", "party", "role", "state", "city", "how", "ip", "from")),
    ("logins", "Logins", ("time", "name", "username", "phone", "email", "party", "ip", "from")),
    ("guests", "Guest logins", ("time", "account", "party", "new", "ip", "from")),
    ("posts", "Posts written", ("time", "by", "username", "guest", "party", "story", "platform", "status", "feedback", "post")),
    ("visits", "Visits", ("time", "ip", "from", "source", "page", "referrer", "browser")),
)


def to_csv(rows: list[dict], columns) -> bytes:
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=list(columns), extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)
    return ("﻿" + out.getvalue()).encode("utf-8")      # the BOM lets Excel read Hindi


def subject(data: dict) -> str:
    w = data["window"]
    label = "6 PM" if w["slot"] == "evening" else "Midnight"
    return f"AmbedkarGPT {label} report · {w['end'].strftime('%d %b %Y') if w['slot'] == 'evening' else w['day_start'].strftime('%d %b %Y')}"


def to_html(data: dict) -> str:
    w, d, vs = data["window"], data["day"], data["visit_summary"]
    cell = 'style="padding:6px 10px;border-bottom:1px solid #e3e7ef;text-align:left;vertical-align:top"'
    head = 'style="padding:6px 10px;border-bottom:2px solid #c9d0de;text-align:left;font-size:12px;color:#5b6680"'

    def table(rows, columns, limit=40, clip=None):
        if not rows:
            return '<p style="color:#5b6680">None.</p>'
        body = "".join(
            "<tr>" + "".join(
                f"<td {cell}>{escape(str(r.get(c, ''))[: (clip or {}).get(c, 300)])}</td>" for c in columns
            ) + "</tr>" for r in rows[:limit]
        )
        more = f'<p style="color:#5b6680">… and {len(rows) - limit} more in the CSV.</p>' if len(rows) > limit else ""
        return (f'<table style="border-collapse:collapse;font-size:13px;width:100%"><tr>'
                + "".join(f"<th {head}>{escape(c)}</th>" for c in columns) + f"</tr>{body}</table>{more}")

    stat = lambda n, label: (f'<td style="padding:10px 14px;border:1px solid #e3e7ef;border-radius:8px">'
                             f'<div style="font-size:22px;font-weight:700">{n}</div><div style="color:#5b6680;font-size:12px">{label}</div></td>')
    window_stats = "".join([
        stat(len(data["signups"]), "sign-ups"), stat(len(data["logins"]), "logins"),
        stat(len(data["guests"]), "guest logins"), stat(len(data["posts"]), "posts"),
        stat(vs["total"], f"visits ({vs['unique']} addresses)"),
    ])
    day_stats = "".join([
        stat(d["signups"], "sign-ups"), stat(d["new_guests"], "new guests"), stat(d["logins"], "logins"),
        stat(d["posts"], "posts"), stat(d["visits"], "visits"),
    ])
    posts_short = [{**p, "post": (p["post"][:220] + "…") if len(p["post"]) > 220 else p["post"]} for p in data["posts"]]

    return f"""<div style="font-family:Segoe UI,Arial,sans-serif;color:#18213a;max-width:900px">
<h2 style="margin:0 0 4px">{escape(subject(data))}</h2>
<p style="color:#5b6680;margin:0 0 14px">{escape(ist(w['start']))} to {escape(ist(w['end']))} (India time)</p>
<table style="border-collapse:separate;border-spacing:6px"><tr>{window_stats}</tr></table>
<p style="color:#5b6680;margin:10px 0 4px">The whole day so far:</p>
<table style="border-collapse:separate;border-spacing:6px"><tr>{day_stats}</tr></table>
<h3>Where visitors came from</h3>
{table([{"source": s, "visits": n} for s, n in vs["sources"]], ("source", "visits"))}
{table([{"place": p, "visits": n} for p, n in vs["places"]], ("place", "visits"))}
<h3>Sign-ups</h3>{table(data["signups"], ("time", "name", "phone", "email", "party", "role", "state", "city", "from"))}
<h3>Logins</h3>{table(data["logins"], ("time", "name", "username", "party", "from"))}
<h3>Guest logins</h3>{table(data["guests"], ("time", "party", "new", "from"))}
<h3>Posts written</h3>{table(posts_short, ("time", "by", "guest", "party", "story", "platform", "status", "post"))}
<p style="color:#5b6680;font-size:12px;margin-top:18px">Full details, addresses and every post's text are in the attached CSV files.
Places are worked out from the address and are approximate.</p></div>"""


def recipients() -> list[str]:
    from backend.core.config import settings

    raw = os.getenv("REPORT_RECIPIENTS") or settings.contact_recipient_email or ""
    return [r.strip() for r in raw.split(",") if r.strip()]


def send(data: dict) -> list[str]:
    """Email the report. Returns who it went to; raises if it could not be sent."""
    from backend.core.config import settings

    to = recipients()
    if not to or not settings.smtp_host or not settings.smtp_user:
        raise RuntimeError("Reports need SMTP_HOST, SMTP_USER and a recipient (REPORT_RECIPIENTS).")
    msg = EmailMessage()
    msg["Subject"] = subject(data)
    msg["From"] = f"AmbedkarGPT Reports <{settings.smtp_user}>"
    msg["To"] = ", ".join(to)
    msg.set_content("This report is best read as HTML. The CSV files have every row.")
    msg.add_alternative(to_html(data), subtype="html")
    stamp = data["window"]["end"].strftime("%Y-%m-%d_%H%M")
    for key, _label, columns in SECTIONS:
        msg.add_attachment(to_csv(data[key], columns), maintype="text", subtype="csv", filename=f"{key}_{stamp}.csv")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.ehlo()
        if settings.smtp_port != 465:
            smtp.starttls()
            smtp.ehlo()
        if settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
    return to


def summary(data: dict) -> dict:
    w = data["window"]
    return {
        "slot": w["slot"], "from": w["start"].isoformat(), "to": w["end"].isoformat(),
        "signups": len(data["signups"]), "logins": len(data["logins"]), "guest_logins": len(data["guests"]),
        "posts": len(data["posts"]), "visits": data["visit_summary"]["total"],
        "unique_addresses": data["visit_summary"]["unique"], "day": data["day"],
    }
