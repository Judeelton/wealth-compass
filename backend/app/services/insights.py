"""
Rule-based insight generation service.

Analyses a user's actual spending against their intended budget split and
envelope allocations, then produces exactly 3 personalised insights that
reference their real envelope names, pound amounts, and percentages.

No external API calls — no API key required.
"""
from typing import Any


# ── Data aggregation ──────────────────────────────────────────────────────────

# Rolls up all transactions into two views: by bucket (need/want/saving) and by envelope name
def _aggregate(
    transactions: list[dict[str, Any]],
) -> tuple[dict[str, float], dict[str, float]]:
    actual_by_bucket: dict[str, float] = {"need": 0.0, "want": 0.0, "saving": 0.0}
    actual_by_envelope: dict[str, float] = {}

    for tx in transactions:
        amount = float(tx.get("amount", 0))
        bucket = tx.get("need_or_want", "want")
        actual_by_bucket[bucket] = actual_by_bucket.get(bucket, 0.0) + amount

        # Fall back to 'Other' if the transaction hasn't been tagged to an envelope yet
        envelope = tx.get("envelope") or tx.get("category") or "Other"
        actual_by_envelope[envelope] = actual_by_envelope.get(envelope, 0.0) + amount

    return actual_by_bucket, actual_by_envelope


# ── Candidate insight builders ────────────────────────────────────────────────
# Each function returns a (priority, insight_string) tuple.
# Priority drives selection when more than 3 candidates exist:
#   lower number = more important / further from target = shown first.

# Flags any envelope that's blown past its monthly allocation — most urgent thing to surface
def _envelope_overruns(
    actual_by_envelope: dict[str, float],
    envelope_allocations: dict[str, float],
) -> list[tuple[float, str]]:
    candidates: list[tuple[float, str]] = []
    for envelope, allocated in envelope_allocations.items():
        if allocated <= 0:
            continue
        actual = actual_by_envelope.get(envelope, 0.0)
        if actual > allocated:
            over = actual - allocated
            pct_over = (over / allocated) * 100
            candidates.append((
                # lower number = shown first — bigger over-runs are more important
                -pct_over,
                (
                    f"Your '{envelope}' envelope is £{over:.2f} over its £{allocated:.2f} "
                    f"allocation ({pct_over:.0f}% over budget). You've spent £{actual:.2f} "
                    f"there this month. Try reviewing the last few '{envelope}' transactions "
                    f"and moving one or two to next month to get back on track."
                ),
            ))
    return candidates


# Positive insight — shows where the user has actually been disciplined with spending
def _envelope_underruns(
    actual_by_envelope: dict[str, float],
    envelope_allocations: dict[str, float],
) -> list[tuple[float, str]]:
    candidates: list[tuple[float, str]] = []
    for envelope, allocated in envelope_allocations.items():
        if allocated <= 0:
            continue
        actual = actual_by_envelope.get(envelope, 0.0)
        saved = allocated - actual
        pct_under = (saved / allocated) * 100
        # Only worth mentioning if they're at least 20% under — tiny gaps aren't interesting
        if pct_under >= 20 and saved >= 1:
            candidates.append((
                # priority: larger absolute saving sorts first
                -saved,
                (
                    f"Great discipline on '{envelope}': you budgeted £{allocated:.2f} "
                    f"but only spent £{actual:.2f}, saving £{saved:.2f} ({pct_under:.0f}% "
                    f"under budget). Consider sweeping that £{saved:.2f} straight into your "
                    f"savings this month to make the surplus work for you."
                ),
            ))
    return candidates


# Compares actual needs/wants/savings percentages against what the user set up in BudgetSetup
def _bucket_drift(
    actual_by_bucket: dict[str, float],
    intended_split: dict[str, float],
    income: float,
) -> list[tuple[float, str]]:
    candidates: list[tuple[float, str]] = []
    total_spent = sum(actual_by_bucket.values()) or 1

    bucket_map = {
        "need":   ("needs_pct",   "Needs"),
        "want":   ("wants_pct",   "Wants"),
        "saving": ("savings_pct", "Savings"),
    }

    for bucket, (pct_key, label) in bucket_map.items():
        intended_pct = intended_split.get(pct_key, 0.0)
        actual_pct = (actual_by_bucket.get(bucket, 0.0) / total_spent) * 100
        drift = actual_pct - intended_pct

        if abs(drift) < 5:  # 5 percentage points is my threshold — anything less is close enough
            continue

        intended_amount = income * (intended_pct / 100)
        actual_amount = actual_by_bucket.get(bucket, 0.0)

        if drift > 0:
            candidates.append((
                -abs(drift),
                (
                    f"Your {label} spending is running {drift:.1f} percentage points above "
                    f"your {intended_pct:.0f}% target — you've spent £{actual_amount:.2f} "
                    f"vs your planned £{intended_amount:.2f}. Check which envelopes are "
                    f"driving this and see if any purchases can wait until next month."
                ),
            ))
        else:
            candidates.append((
                -abs(drift),
                (
                    f"Your {label} bucket is {abs(drift):.1f} pp below your "
                    f"{intended_pct:.0f}% target (£{actual_amount:.2f} spent vs "
                    f"£{intended_amount:.2f} planned). "
                    + (
                        "That headroom is a great opportunity — redirect it to savings before the month ends."
                        if bucket == "want"
                        else "You're ahead of plan, which is a positive sign for your financial health."
                    )
                ),
            ))

    return candidates


# Checks whether the user has hit their savings target — and nudges high-anxiety users a bit harder
def _savings_progress(
    actual_by_bucket: dict[str, float],
    intended_split: dict[str, float],
    income: float,
    stress_score: float,
) -> list[tuple[float, str]]:
    candidates: list[tuple[float, str]] = []
    savings_pct = intended_split.get("savings_pct", 20.0)
    savings_goal = income * (savings_pct / 100)
    actual_savings = actual_by_bucket.get("saving", 0.0)

    shortfall = savings_goal - actual_savings

    if shortfall > 0:
        # Research shows even small savings buffers meaningfully reduce financial anxiety — worth saying
        anxiety_note = (
            " Building even a small buffer is one of the most effective ways to reduce "
            "financial anxiety — every pound saved counts."
            if stress_score >= 21
            else ""
        )
        candidates.append((
            -shortfall,
            (
                f"You're £{shortfall:.2f} short of your £{savings_goal:.2f} savings goal "
                f"({savings_pct:.0f}% of income) this month. You've set aside £{actual_savings:.2f} "
                f"so far. Even automating a £{min(shortfall, 20):.0f} transfer today would make "
                f"a meaningful dent.{anxiety_note}"
            ),
        ))
    else:
        surplus = actual_savings - savings_goal
        candidates.append((
            1,  # positive news — lower priority than problems
            (
                f"You've hit your savings target for the month — £{actual_savings:.2f} saved "
                f"against a goal of £{savings_goal:.2f}, putting you £{surplus:.2f} ahead. "
                f"Consider moving that extra £{surplus:.2f} to a separate pot so it stays out "
                f"of day-to-day spending."
            ),
        ))

    return candidates


# If wants are running high, call out the single biggest envelope — gives the user one clear thing to look at
def _want_ratio_warning(
    actual_by_bucket: dict[str, float],
    actual_by_envelope: dict[str, float],
    intended_split: dict[str, float],
) -> list[tuple[float, str]]:
    candidates: list[tuple[float, str]] = []
    total_spent = sum(actual_by_bucket.values()) or 1
    actual_want_pct = (actual_by_bucket.get("want", 0.0) / total_spent) * 100
    intended_want_pct = intended_split.get("wants_pct", 30.0)

    if actual_want_pct <= intended_want_pct:
        return candidates

    # Find the biggest single want envelope to call out specifically
    # We don't tag envelopes by bucket here, so we use what's available
    biggest_envelope = max(actual_by_envelope, key=actual_by_envelope.get, default=None)
    if biggest_envelope:
        biggest_amount = actual_by_envelope[biggest_envelope]
        candidates.append((
            -( actual_want_pct - intended_want_pct),
            (
                f"Your Wants spending ({actual_want_pct:.1f}%) is above your "
                f"{intended_want_pct:.0f}% target. Your largest single envelope this "
                f"month is '{biggest_envelope}' at £{biggest_amount:.2f}. Reviewing "
                f"just that one envelope could bring your ratio back in line."
            ),
        ))

    return candidates


# ── Public interface ──────────────────────────────────────────────────────────

# Public interface — runs all the rules and returns exactly 3 insights ordered by priority
def generate_insights(
    transactions: list[dict[str, Any]],
    envelope_allocations: dict[str, float],
    intended_split: dict[str, float],
    stress_score: float,
    income: float = 0.0,
) -> list[str]:
    actual_by_bucket, actual_by_envelope = _aggregate(transactions)

    # If income wasn't passed in, infer it from total spend — not ideal but avoids dividing by zero
    if income <= 0:
        income = sum(actual_by_bucket.values()) or 1.0

    # Run every rule and pool all the candidates together
    all_candidates: list[tuple[float, str]] = []
    all_candidates.extend(_envelope_overruns(actual_by_envelope, envelope_allocations))
    all_candidates.extend(_savings_progress(actual_by_bucket, intended_split, income, stress_score))
    all_candidates.extend(_bucket_drift(actual_by_bucket, intended_split, income))
    all_candidates.extend(_want_ratio_warning(actual_by_bucket, actual_by_envelope, intended_split))
    all_candidates.extend(_envelope_underruns(actual_by_envelope, envelope_allocations))

    # Sort ascending — lowest priority number means most important, so problems surface first
    all_candidates.sort(key=lambda x: x[0])
    seen: set[str] = set()
    unique: list[str] = []
    for _, text in all_candidates:
        if text not in seen:
            seen.add(text)
            unique.append(text)

    # Pad to exactly 3 with a generic fallback if the user doesn't have enough data yet
    while len(unique) < 3:
        total_spent = sum(actual_by_bucket.values())
        unique.append(
            f"You've spent £{total_spent:.2f} across {len(actual_by_envelope)} envelope(s) "
            f"this month. Keep tagging your transactions so next month's insights can be "
            f"even more specific to your patterns."
        )

    return unique[:3]
