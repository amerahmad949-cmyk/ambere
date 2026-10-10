#!/usr/bin/env python3
"""
Ambere — weekly backup.
Reads bookings + booking_requests from Supabase (secret key, from GitHub Secrets),
builds Excel-ready CSV files + a full JSON copy, zips them and sends the zip to Telegram.
Nothing is written to the repository (it is public).
"""
import csv, io, json, os, sys, urllib.request, urllib.error, uuid, zipfile
from datetime import datetime, timezone, timedelta

URL = "".join(os.environ.get("SUPABASE_URL", "").split()).rstrip("/")
KEY = "".join(os.environ.get("SUPABASE_SECRET_KEY", "").split())
TG_TOKEN = "".join(os.environ.get("TELEGRAM_BOT_TOKEN", "").split())
TG_CHATS = [c.strip() for c in os.environ.get("TELEGRAM_CHAT_ID", "").split(",") if c.strip()]

missing = [n for n, v in [("SUPABASE_URL", URL), ("SUPABASE_SECRET_KEY", KEY),
                          ("TELEGRAM_BOT_TOKEN", TG_TOKEN), ("TELEGRAM_CHAT_ID", TG_CHATS)] if not v]
if missing:
    sys.exit("Missing GitHub secrets: " + ", ".join(missing))

STATUS = {"confirmed": "مؤكد", "done": "منفّذ", "cancelled": "ملغي"}
REQ_STATUS = {"new": "جديد", "accepted": "صار حجز", "rejected": "مرفوض"}


def fetch(table, order, optional=False):
    rows, start, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{URL}/rest/v1/{table}?select=*&order={order}",
            headers={"apikey": KEY, "Range-Unit": "items", "Range": f"{start}-{start + page - 1}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                chunk = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if optional:
                return []          # table not created yet
            sys.exit(f"Supabase error on {table}: {e.code} {e.read().decode()[:300]}")
        rows += chunk
        if len(chunk) < page:
            return rows
        start += page


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def calc(b):
    items = b.get("items") or []
    off = b.get("status") == "cancelled"
    cost = sum(num(i.get("qty")) * (num(i.get("cost")) + num(i.get("card"))) for i in items)
    charged, paid = num(b.get("charged")), num(b.get("paid"))
    usher = num(b.get("usher_fee")) if b.get("usher") else 0.0
    return {
        "cost": 0 if off else cost,
        "usher": 0 if off else usher,
        "profit": 0 if off else charged - cost - usher,
        "remaining": 0 if off else max(0.0, charged - paid),
        "q": {s: sum(num(i.get("qty")) for i in items if str(i.get("size")) == s) for s in ("5", "10", "30")},
    }


def csv_bytes(header, rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return ("\ufeff" + buf.getvalue()).encode("utf-8")   # BOM so Excel shows Arabic correctly


bookings = fetch("bookings", "wedding_date.asc")
requests = fetch("booking_requests", "created_at.asc")
expenses = fetch("expenses", "id.asc", optional=True)

b_rows, total_profit, total_owed = [], 0.0, 0.0
for b in bookings:
    c = calc(b)
    total_profit += c["profit"]
    total_owed += c["remaining"]
    b_rows.append([
        b.get("id"), b.get("wedding_date"), b.get("client"), b.get("phone") or "", b.get("venue") or "",
        STATUS.get(b.get("status"), b.get("status")), "نعم" if b.get("booth") else "لا", "نعم" if b.get("usher") else "لا",
        int(c["q"]["5"]), int(c["q"]["10"]), int(c["q"]["30"]),
        f'{c["cost"]:.2f}', f'{c["usher"]:.2f}', f'{num(b.get("charged")):.2f}', f'{c["profit"]:.2f}',
        f'{num(b.get("paid")):.2f}', f'{c["remaining"]:.2f}', b.get("notes") or ""])

r_rows = []
for r in requests:
    gifts = "، ".join(f'{i.get("size")} مل × {i.get("qty")}' for i in (r.get("items") or []))
    r_rows.append([r.get("id"), (r.get("created_at") or "")[:16].replace("T", " "), r.get("name"), r.get("phone"),
                   r.get("wedding_date"), r.get("venue") or "", "نعم" if r.get("booth") else "لا", gifts,
                   REQ_STATUS.get(r.get("status"), r.get("status")), r.get("notes") or ""])

e_rows = [["تأسيسي" if e.get("kind") == "startup" else "تشغيلي", e.get("title"), e.get("category") or "",
           f'{num(e.get("amount")):.2f}', e.get("spent_on") or "", e.get("notes") or ""] for e in expenses]
startup_total = sum(num(e.get("amount")) for e in expenses if e.get("kind") == "startup")
running_total = sum(num(e.get("amount")) for e in expenses if e.get("kind") == "running")
net_profit = total_profit - running_total

jo = timezone(timedelta(hours=3))
stamp = datetime.now(jo).strftime("%Y-%m-%d")
zbuf = io.BytesIO()
with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(f"ambere-bookings-{stamp}.csv", csv_bytes(
        ["رقم", "التاريخ", "العميل", "الهاتف", "القاعة", "الحالة", "بوث", "usher", "حبات 5مل", "حبات 10مل", "حبات 30مل",
         "التكلفة", "أجرة usher", "المبلغ", "الربح", "المدفوع", "المتبقي", "ملاحظات"], b_rows))
    z.writestr(f"ambere-requests-{stamp}.csv", csv_bytes(
        ["رقم", "وصل", "الاسم", "الهاتف", "تاريخ العرس", "المكان", "بوث", "التوزيعات", "الحالة", "ملاحظات"], r_rows))
    z.writestr(f"ambere-expenses-{stamp}.csv", csv_bytes(
        ["النوع", "البند", "الفئة", "المبلغ", "التاريخ", "ملاحظات"], e_rows))
    z.writestr(f"ambere-full-{stamp}.json",
               json.dumps({"exported_at": stamp, "bookings": bookings, "booking_requests": requests, "expenses": expenses},
                          ensure_ascii=False, indent=2))
zip_bytes = zbuf.getvalue()

caption = (f"🗂 <b>نسخة احتياطية — Ambere</b>\n{stamp}\n\n"
           f"الحجوزات: {len(bookings)}\nطلبات العملاء: {len(requests)}\n"
           f"المصاريف: {len(expenses)}\n"
           f"صافي الربح (بعد المصاريف التشغيلية): {net_profit:,.2f} د.أ\n"
           f"رأس المال: {startup_total:,.2f} — رجع منه {max(0.0, min(net_profit, startup_total)):,.2f}\n"
           f"متبقي على العملاء: {total_owed:,.2f} د.أ")


def send_document(chat_id):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in (("chat_id", chat_id), ("caption", caption), ("parse_mode", "HTML")):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="document"; '
                  f'filename="ambere-backup-{stamp}.zip"\r\nContent-Type: application/zip\r\n\r\n').encode())
    parts.append(zip_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendDocument", data=b"".join(parts),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            ok = json.loads(r.read().decode()).get("ok")
    except urllib.error.HTTPError as e:
        sys.exit(f"Telegram error: {e.code} {e.read().decode()[:300]}")
    if not ok:
        sys.exit("Telegram did not accept the file")


for chat in TG_CHATS:
    send_document(chat)
print(f"Backup sent ✅  bookings={len(bookings)} requests={len(requests)} size={len(zip_bytes)} bytes")
