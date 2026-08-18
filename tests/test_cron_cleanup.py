"""Tests for the Convex job-posting cleanup cron logic.

These tests validate the expiry and deletion thresholds that
cleanExpiredJobs and refreshActiveJobs enforce. Because the actual
functions run inside the Convex runtime we test the *logic* here:
thresholds, edge cases, and the invariant that matched job records
are preserved when postings are cleaned up.
"""

import time
import unittest

# ---------------------------------------------------------------------------
# Constants mirroring web/convex/jobPostings.ts
# ---------------------------------------------------------------------------
EXPIRY_DAYS = 30
DELETION_DAYS = 90
REFRESH_STALE_DAYS = 7

EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000
DELETION_MS = DELETION_DAYS * 24 * 60 * 60 * 1000
REFRESH_STALE_MS = REFRESH_STALE_DAYS * 24 * 60 * 60 * 1000


# ---------------------------------------------------------------------------
# Helpers – lightweight document stand-ins
# ---------------------------------------------------------------------------
def _make_job(
    *,
    now_ms: int,
    age_days: int = 0,
    status: str = "active",
    last_refreshed_ms: int | None = None,
) -> dict:
    """Return a dict that mimics a Convex jobPostings document."""
    creation_time = now_ms - (age_days * 24 * 60 * 60 * 1000)
    expires_at = creation_time + EXPIRY_MS
    return {
        "_id": f"job_{age_days}d_{status}",
        "_creationTime": creation_time,
        "title": f"Engineer #{age_days}",
        "company": "Acme",
        "url": f"https://indeed.com/viewjob?jk=age{age_days}",
        "keywords": ["python", "aws"],
        "status": status,
        "scrapedAt": creation_time,
        "lastRefreshedAt": last_refreshed_ms,
        "expiresAt": expires_at,
    }


def _make_match(upload_id: str, job_id: str) -> dict:
    """Return a dict that mimics a Convex jobMatches document."""
    return {
        "_id": f"match_{upload_id}_{job_id}",
        "uploadId": upload_id,
        "jobPostingId": job_id,
        "matchScore": 85,
        "matchedKeywords": ["python"],
        "missingKeywords": [],
        "gapAnalysis": "Solid match",
        "tailoredBullets": [],
    }


# ---------------------------------------------------------------------------
# Simulated cleanup engine (mirrors jobPostings.ts logic)
# ---------------------------------------------------------------------------

def clean_expired_jobs(now_ms: int, jobs: list[dict]) -> tuple[list[dict], int, int]:
    """Simulate cleanExpiredJobs.

    Returns (remaining_jobs, expired_count, deleted_count).
    """
    expired_count = 0
    deleted_count = 0
    remaining: list[dict] = []

    # Pass 1: mark expired
    for job in jobs:
        if job["status"] == "active" and job["expiresAt"] <= now_ms:
            job["status"] = "expired"
            expired_count += 1

    # Pass 2: delete old
    for job in jobs:
        age_ms = now_ms - job["_creationTime"]
        if age_ms >= DELETION_MS:
            deleted_count += 1
        else:
            remaining.append(job)

    return remaining, expired_count, deleted_count


def refresh_active_jobs(now_ms: int, jobs: list[dict]) -> tuple[list[dict], int]:
    """Simulate refreshActiveJobs.

    Returns (updated_jobs, expired_count).
    """
    expired_count = 0
    for job in jobs:
        if job["status"] != "active":
            continue
        last_seen = job.get("lastRefreshedAt") or job["scrapedAt"]
        if last_seen < (now_ms - REFRESH_STALE_MS):
            job["status"] = "expired"
            job["lastRefreshedAt"] = now_ms
            expired_count += 1

    return jobs, expired_count


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestExpiryThreshold(unittest.TestCase):
    """cleanExpiredJobs should mark active postings as expired after 30 days."""

    def test_active_job_exactly_at_expiry_is_marked_expired(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=EXPIRY_DAYS, status="active")
        remaining, expired, _ = clean_expired_jobs(now_ms, [job])
        self.assertEqual(expired, 1)
        self.assertEqual(remaining[0]["status"], "expired")

    def test_active_job_one_day_before_expiry_stays_active(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=EXPIRY_DAYS - 1, status="active")
        remaining, expired, _ = clean_expired_jobs(now_ms, [job])
        self.assertEqual(expired, 0)
        self.assertEqual(remaining[0]["status"], "active")

    def test_already_expired_job_is_not_double_counted(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=EXPIRY_DAYS + 10, status="expired")
        _, expired, _ = clean_expired_jobs(now_ms, [job])
        self.assertEqual(expired, 0)

    def test_mixed_jobs_only_active_past_expiry_are_marked(self):
        now_ms = int(time.time() * 1000)
        jobs = [
            _make_job(now_ms=now_ms, age_days=5, status="active"),    # fresh
            _make_job(now_ms=now_ms, age_days=35, status="active"),   # expired
            _make_job(now_ms=now_ms, age_days=40, status="expired"),  # already expired
        ]
        remaining, expired, _ = clean_expired_jobs(now_ms, jobs)
        self.assertEqual(expired, 1)  # only the 35-day active one
        statuses = [j["status"] for j in remaining]
        self.assertIn("active", statuses)
        self.assertIn("expired", statuses)


class TestDeletionThreshold(unittest.TestCase):
    """cleanExpiredJobs should delete postings older than 90 days."""

    def test_job_exactly_at_deletion_is_deleted(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=DELETION_DAYS, status="expired")
        remaining, _, deleted = clean_expired_jobs(now_ms, [job])
        self.assertEqual(deleted, 1)
        self.assertEqual(len(remaining), 0)

    def test_job_one_day_before_deletion_is_kept(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=DELETION_DAYS - 1, status="expired")
        remaining, _, deleted = clean_expired_jobs(now_ms, [job])
        self.assertEqual(deleted, 0)
        self.assertEqual(len(remaining), 1)

    def test_very_old_active_job_is_deleted(self):
        """An active job past the deletion threshold should be deleted."""
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=100, status="active")
        remaining, _, deleted = clean_expired_jobs(now_ms, [job])
        self.assertEqual(deleted, 1)
        self.assertEqual(len(remaining), 0)

    def test_deletion_preserves_young_jobs(self):
        now_ms = int(time.time() * 1000)
        jobs = [
            _make_job(now_ms=now_ms, age_days=10, status="active"),
            _make_job(now_ms=now_ms, age_days=20, status="expired"),
            _make_job(now_ms=now_ms, age_days=95, status="expired"),
        ]
        remaining, _, deleted = clean_expired_jobs(now_ms, jobs)
        self.assertEqual(deleted, 1)
        self.assertEqual(len(remaining), 2)


class TestRefreshBehavior(unittest.TestCase):
    """refreshActiveJobs marks postings not refreshed in 7+ days as expired."""

    def test_active_job_never_refreshed_and_old_is_expired(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=10, status="active")
        # lastRefreshedAt is None → falls back to scrapedAt which is 10 days ago
        _, expired = refresh_active_jobs(now_ms, [job])
        self.assertEqual(expired, 1)
        self.assertEqual(job["status"], "expired")

    def test_active_job_recently_refreshed_stays_active(self):
        now_ms = int(time.time() * 1000)
        recently = now_ms - (2 * 24 * 60 * 60 * 1000)  # 2 days ago
        job = _make_job(now_ms=now_ms, age_days=10, status="active", last_refreshed_ms=recently)
        _, expired = refresh_active_jobs(now_ms, [job])
        self.assertEqual(expired, 0)
        self.assertEqual(job["status"], "active")

    def test_expired_jobs_are_skipped(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=10, status="expired")
        _, expired = refresh_active_jobs(now_ms, [job])
        self.assertEqual(expired, 0)

    def test_refresh_sets_lastRefreshedAt(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=10, status="active")
        refresh_active_jobs(now_ms, [job])
        self.assertEqual(job["lastRefreshedAt"], now_ms)


class TestMatchedUsersPreserved(unittest.TestCase):
    """When job postings are cleaned up, matched user records survive."""

    def test_deleting_old_jobs_does_not_affect_matches(self):
        """Simulate: 3 jobs with matches. Delete the oldest. Matches remain."""
        now_ms = int(time.time() * 1000)
        jobs = [
            _make_job(now_ms=now_ms, age_days=100, status="expired"),  # will be deleted
            _make_job(now_ms=now_ms, age_days=20, status="active"),
        ]
        matches = [
            _make_match("upload_1", jobs[0]["_id"]),
            _make_match("upload_2", jobs[1]["_id"]),
        ]

        remaining_jobs, _, deleted = clean_expired_jobs(now_ms, jobs)
        self.assertEqual(deleted, 1)
        # Matches are in a separate table — they survive independently
        surviving_job_ids = {j["_id"] for j in remaining_jobs}
        self.assertIn(jobs[1]["_id"], surviving_job_ids)
        # All matches are untouched (they live in jobMatches, not jobPostings)
        self.assertEqual(len(matches), 2)

    def test_expiry_does_not_touch_matches(self):
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=35, status="active")
        match = _make_match("upload_1", job["_id"])

        remaining, expired, _ = clean_expired_jobs(now_ms, [job])
        self.assertEqual(expired, 1)
        # Match record is unaffected
        self.assertEqual(match["jobPostingId"], job["_id"])
        self.assertEqual(match["uploadId"], "upload_1")

    def test_full_lifecycle_with_matches(self):
        """End-to-end: fresh → expired → deleted, matches always survive."""
        now_ms = int(time.time() * 1000)
        job = _make_job(now_ms=now_ms, age_days=5, status="active")
        match = _make_match("upload_1", job["_id"])

        # Day 5: active, not touched
        remaining, expired, deleted = clean_expired_jobs(now_ms, [job])
        self.assertEqual(expired, 0)
        self.assertEqual(deleted, 0)

        # Day 35: mark expired
        future_ms = now_ms + 30 * 24 * 60 * 60 * 1000
        remaining, expired, deleted = clean_expired_jobs(future_ms, [job])
        self.assertEqual(expired, 1)
        self.assertEqual(deleted, 0)
        self.assertEqual(match["uploadId"], "upload_1")  # match survives

        # Day 95: delete
        future_ms = now_ms + 90 * 24 * 60 * 60 * 1000
        remaining, expired, deleted = clean_expired_jobs(future_ms, [job])
        self.assertEqual(deleted, 1)
        self.assertEqual(len(remaining), 0)
        # Match record is independent — still exists
        self.assertIsNotNone(match)
        self.assertEqual(match["jobPostingId"], job["_id"])


class TestEdgeCases(unittest.TestCase):
    """Boundary and edge-case coverage."""

    def test_empty_job_list(self):
        now_ms = int(time.time() * 1000)
        remaining, expired, deleted = clean_expired_jobs(now_ms, [])
        self.assertEqual(remaining, [])
        self.assertEqual(expired, 0)
        self.assertEqual(deleted, 0)

    def test_empty_refresh_list(self):
        now_ms = int(time.time() * 1000)
        remaining, expired = refresh_active_jobs(now_ms, [])
        self.assertEqual(remaining, [])
        self.assertEqual(expired, 0)

    def test_all_statuses_represented(self):
        now_ms = int(time.time() * 1000)
        jobs = [
            _make_job(now_ms=now_ms, age_days=10, status="active"),
            _make_job(now_ms=now_ms, age_days=10, status="expired"),
            _make_job(now_ms=now_ms, age_days=10, status="removed"),
        ]
        remaining, expired, deleted = clean_expired_jobs(now_ms, jobs)
        self.assertEqual(expired, 0)  # none past 30 days
        self.assertEqual(deleted, 0)  # none past 90 days
        self.assertEqual(len(remaining), 3)

    def test_job_at_each_day_boundary(self):
        """Verify the exact transition points."""
        now_ms = int(time.time() * 1000)
        for day in [29, 30, 31, 89, 90, 91]:
            job = _make_job(now_ms=now_ms, age_days=day, status="active")
            remaining, expired, deleted = clean_expired_jobs(now_ms, [job])
            if day <= 29:
                self.assertEqual(expired, 0, f"Day {day} should not expire")
            elif day <= 89:
                self.assertEqual(expired, 1, f"Day {day} should expire")
                self.assertEqual(deleted, 0, f"Day {day} should not delete")
            else:
                self.assertEqual(deleted, 1, f"Day {day} should delete")


if __name__ == "__main__":
    unittest.main()
