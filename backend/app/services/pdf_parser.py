"""
PDF bank statement parser.

Strategy:
  1. Read all page text via pdfplumber (in-memory only, nothing written to disk).
  2. Detect the bank from page 1 text.
  3. Dispatch to a bank-specific parser (Lloyds) or the universal fallback.
  4. Return a structured dict with transactions and a summary.
"""

import io
import re
from datetime import datetime

import pdfplumber

# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

# Abbreviated month names → numbers so I can parse "1 May 25" style dates from Lloyds
_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5,  "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


# Converts whatever date string the bank uses into a consistent YYYY-MM-DD format
def _parse_date(raw: str) -> str | None:
    """
    Parse a raw date token into ISO-8601 (YYYY-MM-DD).
    Handles:
      DD/MM/YYYY  DD-MM-YYYY  DD/MM/YY
      DD Mon YY   DD Mon YYYY
      YYYY-MM-DD  (ISO, used by Monzo / Starling exports)
    Returns None on failure.
    """
    s = raw.strip()

    # ISO format — Monzo and Starling export dates like this
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return datetime(int(m[1]), int(m[2]), int(m[3])).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # Most UK banks use DD/MM/YYYY or DD-MM-YYYY; two-digit years also exist
    m = re.fullmatch(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", s)
    if m:
        d, mo, y = int(m[1]), int(m[2]), int(m[3])
        y = y + 2000 if y < 100 else y
        try:
            return datetime(y, mo, d).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # Lloyds uses "1 May 25" — handle both two- and four-digit years
    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})", s)
    if m:
        d, mo_str, y = int(m[1]), m[2].lower(), int(m[3])
        mo = _MONTH_MAP.get(mo_str)
        if mo:
            y = y + 2000 if y < 100 else y
            try:
                return datetime(y, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                return None

    # Some exports omit the year entirely, so fall back to the current year
    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3})", s)
    if m:
        d, mo_str = int(m[1]), m[2].lower()
        mo = _MONTH_MAP.get(mo_str)
        if mo:
            try:
                return datetime(datetime.now().year, mo, d).strftime("%Y-%m-%d")
            except ValueError:
                return None

    return None


# ---------------------------------------------------------------------------
# Amount helpers
# ---------------------------------------------------------------------------

_AMOUNT_RE = re.compile(r"-?\d{1,3}(?:,\d{3})*\.\d{2}")


# Strip £ signs and commas so "£1,234.56" becomes 1234.56
def _parse_amount(raw: str) -> float:
    return float(re.sub(r"[£,\s]", "", raw.strip()))


# ---------------------------------------------------------------------------
# Credit classification
# ---------------------------------------------------------------------------

# Rule-based credit classification — keyword matching on the description text
def _classify_credit(description: str) -> str:
    u = description.upper()
    if any(k in u for k in ("SALARY", "WAGES", "PAYROLL")):
        return "salary"
    if any(k in u for k in ("RETURNED", "REFUND", "REVERSAL", "CASHBACK")):
        return "refund"
    if any(k in u for k in ("FPI", "FASTER PAYMENT IN")):
        return "debt_repaid"
    # DEP = postal order / cash deposit at branch; P.O. = Post Office
    return "extra_income"


# ---------------------------------------------------------------------------
# Skip rules (whole-line checks, applied before date detection)
# ---------------------------------------------------------------------------

# Lines matching this should be skipped — they're headers, balance rows, or blank lines, not transactions
_SKIP_WHOLE_LINE_RE = re.compile(
    r"^\s*$"                           # blank
    r"|^\s*page\s+\d"                  # page numbers
    r"|sort\s*code"
    r"|account\s+number"
    r"|statement\s+(date|period)"
    r"|available\s+balance"
    r"|overdraft\s+limit"
    r"|(opening|closing)\s+balance"
    r"|brought\s+forward"
    r"|carried\s+forward"
    r"|^\s*(date|description|debit|credit|balance|details|type|amount)\s*$",
    re.IGNORECASE,
)


def _skip_line(line: str) -> bool:
    return bool(_SKIP_WHOLE_LINE_RE.search(line.strip()))


# Description-level keywords that indicate a balance summary row
_SKIP_DESC_KEYWORDS = (
    "OPENING BALANCE", "CLOSING BALANCE", "BROUGHT FORWARD",
    "CARRIED FORWARD", "BALANCE BROUGHT", "BALANCE CARRIED",
)


def _skip_desc(desc: str) -> bool:
    u = desc.upper()
    return any(k in u for k in _SKIP_DESC_KEYWORDS)


# ---------------------------------------------------------------------------
# Bank detection
# ---------------------------------------------------------------------------

_BANK_SIGNATURES: list[tuple[str, re.Pattern]] = [
    ("Lloyds",   re.compile(r"lloyds",   re.IGNORECASE)),
    ("Barclays", re.compile(r"barclays", re.IGNORECASE)),
    ("Monzo",    re.compile(r"monzo",    re.IGNORECASE)),
    ("NatWest",  re.compile(r"natwest",  re.IGNORECASE)),
    ("Halifax",  re.compile(r"halifax",  re.IGNORECASE)),
    ("Starling", re.compile(r"starling", re.IGNORECASE)),
    ("Revolut",  re.compile(r"revolut",  re.IGNORECASE)),
    ("HSBC",     re.compile(r"hsbc",     re.IGNORECASE)),
]


# Just scans the first page for the bank name — simple but works for all the banks I tested
def _detect_bank(first_page_text: str) -> str:
    for name, pat in _BANK_SIGNATURES:
        if pat.search(first_page_text):
            return name
    return "Unknown"


# ---------------------------------------------------------------------------
# Lloyds-specific parser
# ---------------------------------------------------------------------------
#
# pdfplumber extracts Lloyds PDFs in a garbled single-line format where the
# first character of each cell value is embedded in the next column's header,
# e.g.:
#   "D0ate 1 May 25 DPescription .O. 144 HIGH STRE TDype EP 411.90Money In (£)..."
#   "D0ate 6 May 25 DTescription FL TRAVEL CH TDype EB Moneyb Ilna n(k£.) 1.75Money Out (£)..."
#   "D0ate 6 May 25 DRescription ETURNED DD Tblyapnek. 28.99Money In (£)..."
#
# Extraction strategy (each regex is independent — no chain dependency):
#   1. DATE   — D\d?ate + "DD Mon YY"
#   2. AMOUNT — {digits}Money In  OR  {digits}Money Out  (determines direction)
#   3. DESC   — D(X)escription {body} ... rfind(' T') to strip type junk; prepend X
#   4. TYPE   — T(X)ype {code}; prepend X to recover full code

# Each regex is independent — this was the key insight after the single-regex approach failed
# The garbling means "D0ate 1 May 25" → date, "DPescription .O. 144" → 'P' + rest, etc.
_LLOYDS_DATE_RE       = re.compile(r"D\d?ate\s+(\d{1,2}\s+\w+\s+\d{2,4})", re.IGNORECASE)
_LLOYDS_DESC_HDR_RE   = re.compile(r"D(.)escription\s+",                     re.IGNORECASE)  # group(1) is the stolen first char
_LLOYDS_CREDIT_AMT_RE = re.compile(r"([\d,]+\.\d{2})Money\s*In",             re.IGNORECASE)  # amount is glued directly to "Money In"
_LLOYDS_DEBIT_AMT_RE  = re.compile(r"([\d,]+\.\d{2})Money\s*Out",            re.IGNORECASE)
_LLOYDS_TYPE_CODE_RE  = re.compile(r"T(.)ype\s+(\w+)",                       re.IGNORECASE)  # "TDype EP" → 'D' + 'EP' = "DEP"

_LLOYDS_CREDIT_CODES = {"DEP", "FPI", "BGC", "CDT", "CR", "EP", "PI"}
_LLOYDS_DEBIT_CODES  = {"DEB", "DD", "FPO", "ATM", "VIS", "CHQ", "SO", "EB", "PO"}


def _parse_lloyds(pages_text: list[str]) -> list[dict]:
    import datetime as _dt

    txs = []
    for text in pages_text:
        if not text:
            continue
        for line in text.split("\n"):
            # 1. Must have a date field
            date_m = _LLOYDS_DATE_RE.search(line)
            if not date_m:
                continue

            date_str = date_m.group(1).strip()
            iso_date = None
            for fmt in ("%d %b %y", "%d %b %Y"):
                try:
                    iso_date = _dt.datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    pass
            if not iso_date:
                continue

            # 2. Extract amount + direction independently
            credit_m = _LLOYDS_CREDIT_AMT_RE.search(line)
            debit_m  = _LLOYDS_DEBIT_AMT_RE.search(line)

            if credit_m and debit_m:
                # Both markers on the same line — whichever appears first is the actual transaction amount
                is_credit = credit_m.start() < debit_m.start()
                amt_str   = credit_m.group(1) if is_credit else debit_m.group(1)
                amount_pos = credit_m.start() if is_credit else debit_m.start()
            elif credit_m:
                is_credit  = True
                amt_str    = credit_m.group(1)
                amount_pos = credit_m.start()
            elif debit_m:
                is_credit  = False
                amt_str    = debit_m.group(1)
                amount_pos = debit_m.start()
            else:
                continue  # no amount found — skip

            try:
                amount = float(amt_str.replace(",", ""))
            except ValueError:
                continue
            if amount <= 0:
                continue

            # 3. Description: recover first char from header, body up to type field
            desc_hdr_m = _LLOYDS_DESC_HDR_RE.search(line)
            if desc_hdr_m:
                first_char = desc_hdr_m.group(1)  # the stolen char we need to stick back on
                desc_start = desc_hdr_m.end()
                raw_between = line[desc_start:amount_pos]
                last_t = raw_between.rfind(" T")  # " T" marks where the type-code column starts
                desc_body = raw_between[:last_t].strip() if last_t > 0 else raw_between.strip()
                desc = (first_char + desc_body).strip()  # prepend the stolen char to reconstruct the full description
            else:
                desc = ""

            if not desc:
                continue

            # 4. Type code: recover first char from header
            tc_m = _LLOYDS_TYPE_CODE_RE.search(line)
            type_code = (tc_m.group(1) + tc_m.group(2)).upper() if tc_m else ""

            # 5. Override direction from type code
            if type_code in _LLOYDS_CREDIT_CODES:
                is_credit = True
            if type_code in _LLOYDS_DEBIT_CODES:
                is_credit = False

            # RETURNED DD arrives in the "out" column in the PDF but it's money coming back in
            desc_upper = desc.upper()
            if "RETURNED" in desc_upper or "REFUND" in desc_upper:
                is_credit = True

            # 6. Credit classification
            credit_type = None
            if is_credit:
                if any(w in desc_upper for w in ("SALARY", "WAGES", "PAYROLL")):
                    credit_type = "salary"
                elif any(w in desc_upper for w in ("RETURNED", "REFUND", "REVERSAL")):
                    credit_type = "refund"
                elif type_code in ("FPI", "PI"):
                    credit_type = "debt_repaid"
                else:
                    credit_type = "extra_income"

            txs.append({
                "date":             iso_date,
                "description":      desc,
                "amount":           round(amount, 2),
                "transaction_type": "credit" if is_credit else "debit",
                "needs_tagging":    not is_credit,
                "credit_type":      credit_type,
                "type_code":        type_code,
            })

    return txs


# ---------------------------------------------------------------------------
# Barclays-specific parser
# ---------------------------------------------------------------------------
#
# Real pdfplumber output splits transactions across multiple lines with no
# consistent per-line date.  The actual pattern observed:
#
#   "21 Mar Start balance 18.54"          ← skip
#   "23 Mar Card Purchase McDonalds 4.99" ← date + description + amount
#   "22 Mar"                              ← bare date line — just updates current_date
#   "Bill Payment to Rahul Antony 13.00"  ← no date; uses current_date
#   "Ref: Friend Gift"                    ← ref line — skip
#   "Received From R Antony 13.00 23.55"  ← 2 amounts: tx=13.00, balance=23.55
#
# Strategy:
#   1. Skip legal/info pages; only process pages with transaction data.
#   2. Track current_date: updated whenever a line starts with DD Mon.
#   3. Skip skip-list lines (headers, refs, balance rows, page markers).
#   4. Lines with no amounts are skipped.
#   5. Lines with amounts: last = balance (discard), second-to-last = tx amount.
#   6. Description = line with all amounts removed, stripped.
#   7. Debit/credit from keyword matching; "from" fallback for unknowns.

def _parse_barclays(pages_text: list[str]) -> list[dict]:
    _DATE_RE   = re.compile(r"^\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\b", re.IGNORECASE)
    _AMOUNT_RE = re.compile(r"(\d{1,3}(?:,\d{3})*\.\d{2})")

    _SKIP_LINES = (
        "start balance", "end balance", "date description",
        "money out", "money in", "your transactions",
        "bank giro", "debit card", "online branch",
        "continued", "sort code", "account number", "barclays bank uk",
        "registered in england", "authorised by", "prudential",
        "anything wrong", "credit interest", "ref:",
        "page 1", "page 2", "page 3", "page 4", "page 5",
        "• sort", "• account", "• swift", "• iban",
    )

    _LEGAL_PAGES = (
        "dispute resolution", "financial ombudsman", "compensation arrangements",
        "how we pay interest", "getting information from barclays",
        "using your barclays debit card", "how it works", "call charges",
    )

    _CREDIT_KWS = ("received from", "asd deposit", "giro received", "giro")
    _DEBIT_KWS  = ("card purchase", "card payment to", "bill payment to",
                   "direct debit to", "payment to")

    transactions: list[dict] = []
    current_date: str | None = None
    current_year = datetime.now().year

    for page_text in pages_text:
        if not page_text:
            continue
        page_lower = page_text.lower()

        if any(phrase in page_lower for phrase in _LEGAL_PAGES):
            continue
        if "your transactions" not in page_lower and "money out" not in page_lower:
            continue

        for line in page_text.split("\n"):
            line = line.strip()
            if not line:
                continue

            line_lower = line.lower()

            # Skip header / reference / balance rows
            if any(skip in line_lower for skip in _SKIP_LINES):
                continue

            # Update current_date whenever the line opens with DD Mon
            date_m = _DATE_RE.match(line)
            if date_m:
                date_str = date_m.group(1).strip()
                try:
                    dt = datetime.strptime(f"{date_str} {current_year}", "%d %b %Y")
                    current_date = dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass
                # Advance past the date token; if nothing remains, move on
                rest = line[date_m.end():].strip()
                if not rest or _DATE_RE.match(rest):
                    continue
                line_to_parse = rest
            else:
                line_to_parse = line

            if not current_date:
                continue

            # Find all XX.XX amounts in this segment
            amounts = _AMOUNT_RE.findall(line_to_parse)
            if not amounts:
                continue

            # Second-to-last = tx amount when ≥2 numbers; otherwise the only number
            tx_str = amounts[-2] if len(amounts) >= 2 else amounts[-1]
            try:
                amount = float(tx_str.replace(",", ""))
            except ValueError:
                continue
            if amount <= 0:
                continue

            # Description = line with every amount token removed
            desc = line_to_parse
            for amt in amounts:
                desc = desc.replace(amt, "")
            desc = re.sub(r"\s+", " ", desc).strip(" .,:")
            if not desc:
                continue

            # Determine direction
            desc_lower = desc.lower()
            is_credit = any(kw in desc_lower for kw in _CREDIT_KWS)
            if not is_credit:
                is_debit = any(kw in desc_lower for kw in _DEBIT_KWS)
                if not is_debit:
                    is_credit = "from" in desc_lower  # fallback

            # Classify credit type
            credit_type = None
            if is_credit:
                if any(w in desc_lower for w in ("salary", "wages", "payroll")):
                    credit_type = "salary"
                elif any(w in desc_lower for w in ("refund", "returned", "reversal")):
                    credit_type = "refund"
                elif "received from" in desc_lower:
                    credit_type = "debt_repaid"
                else:
                    credit_type = "extra_income"

            transactions.append({
                "date":             current_date,
                "description":      desc,
                "amount":           round(amount, 2),
                "transaction_type": "credit" if is_credit else "debit",
                "needs_tagging":    not is_credit,
                "credit_type":      credit_type,
                "type_code":        "BARCLAYS",
            })

    return transactions


# ---------------------------------------------------------------------------
# Universal parser (Monzo, NatWest, Halifax, Starling, Revolut, …)
# ---------------------------------------------------------------------------
#
# Strategy: look for lines that start with a recognisable date, then extract
# the first/second amount found and guess direction from sign or column context.

_UNIV_DATE_PATS: list[re.Pattern] = [
    # YYYY-MM-DD  (ISO — Monzo, Starling)
    re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(.+)$"),
    # DD/MM/YYYY  DD-MM-YYYY  DD/MM/YY
    re.compile(r"^(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+(.+)$"),
    # DD Mon YYYY  DD Mon YY
    re.compile(r"^(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})\s+(.+)$"),
]


# Tries to parse a single line from any non-Lloyds bank — looks for a date at the start, then finds amounts
def _parse_universal_line(line: str) -> dict | None:
    line = line.strip()
    if not line or _skip_line(line):
        return None

    raw_date = rest = None
    for pat in _UNIV_DATE_PATS:
        m = pat.match(line)
        if m:
            raw_date, rest = m.group(1), m.group(2)
            break

    if not raw_date:
        return None

    iso_date = _parse_date(raw_date)
    if not iso_date:
        return None

    amounts = _AMOUNT_RE.findall(rest)
    if not amounts:
        return None

    # With ≥2 amounts, the last is usually the running balance — second-to-last is the actual transaction
    tx_raw = amounts[-2] if len(amounts) >= 2 else amounts[-1]
    try:
        amount = _parse_amount(tx_raw)
    except ValueError:
        return None

    is_negative = tx_raw.lstrip().startswith("-")  # some banks use a leading minus for debits
    tx_type = "debit" if (is_negative or amount < 0) else "credit"
    amount = abs(amount)
    if amount <= 0:
        return None

    # Description = text before first amount, stripped of trailing IN/OUT/DR/CR
    first_amt_m = _AMOUNT_RE.search(rest)
    desc = rest[: first_amt_m.start()].strip() if first_amt_m else rest.strip()
    desc = re.sub(r"\s+(OUT|IN|DR|CR)\s*$", "", desc, flags=re.IGNORECASE).strip()
    desc = re.sub(r"\s+", " ", desc).strip()

    if not desc or _skip_desc(desc):
        return None

    return {
        "date":             iso_date,
        "description":      desc,
        "amount":           round(amount, 2),
        "transaction_type": tx_type,
        "needs_tagging":    tx_type == "debit",
        "credit_type":      _classify_credit(desc) if tx_type == "credit" else None,
    }


def _parse_universal(pages_text: list[str]) -> list[dict]:
    txs = []
    for text in pages_text:
        for line in text.splitlines():
            tx = _parse_universal_line(line)
            if tx:
                txs.append(tx)
    return txs


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def parse_statement(file_bytes: bytes) -> dict:
    """
    Entry point — detect the bank, dispatch to the right parser, return transactions + summary.
    I keep everything in memory (BytesIO) so no uploaded file ever touches disk.
    """
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]

    first_page = pages_text[0] if pages_text else ""
    bank = _detect_bank(first_page)

    if bank == "Lloyds":
        transactions = _parse_lloyds(pages_text)
    elif bank == "Barclays":
        transactions = _parse_barclays(pages_text)
    else:
        transactions = _parse_universal(pages_text)

    # Summary
    all_dates: list[datetime] = []
    for tx in transactions:
        try:
            all_dates.append(datetime.fromisoformat(tx["date"]))
        except ValueError:
            pass

    if all_dates:
        def _fmt(d: datetime, year: bool = False) -> str:
            return f"{d.day} {d.strftime('%b')}{f' {d.year}' if year else ''}"
        date_range = f"{_fmt(min(all_dates))} – {_fmt(max(all_dates), year=True)}"
    else:
        date_range = "Unknown"

    debits  = [t for t in transactions if t["transaction_type"] == "debit"]
    credits = [t for t in transactions if t["transaction_type"] == "credit"]

    return {
        "transactions": transactions,
        "summary": {
            "bank":              bank,
            "total_debits":      round(sum(t["amount"] for t in debits),  2),
            "total_credits":     round(sum(t["amount"] for t in credits), 2),
            "transaction_count": len(transactions),
            "date_range":        date_range,
        },
    }
