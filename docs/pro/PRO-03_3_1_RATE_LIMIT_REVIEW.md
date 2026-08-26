# PRO-03.3.1 — SQL rate-limit concurrency review

Status: **REVIEWED AND UPDATED LOCALLY — SQL NOT EXECUTED**

## Finding

The original proposal locked only the idempotency key before counting recent
attempts. Requests with different keys could run concurrently, each observe the
same count below the limit, then all insert. The hourly and per-resource ceilings
were therefore not atomic.

Example at an actor/school count of four:

```text
Tx A (key A): count = 4 ─┐
Tx B (key B): count = 4 ─┼─ both pass, count becomes 6
```

The one-open-resource index prevents duplicate open invitations for the same
resource, but does not protect the actor+school limit across different resources.

## Prepared correction

`private.issue_targeted_invitation` now acquires these transaction-level advisory
locks in a fixed order before retry locking and both `count(*)` checks:

1. idempotency key;
2. actor + exact school rate bucket;
3. exact school + resource type + resource UUID bucket;
4. existing retry row/resource locks.

Every issuer transaction uses the same order. The actor+school lock serializes
all its invitation counts; the resource lock protects the 24-hour resource
counter. After a waiter obtains the lock under READ COMMITTED, its following
statement receives a fresh snapshot and sees the committed attempt.

The function explicitly rejects transaction isolation other than READ COMMITTED.
This prevents a caller from opening a repeatable-read transaction before waiting
and retaining a stale snapshot after the lock becomes available.

## Limits retained

- Maximum five recorded attempts per actor + school during the preceding hour.
- Maximum three recorded attempts per exact school + resource during the
  preceding 24 hours.
- Failed, revoked and delivered attempts all count; changing a key does not reset
  the budget.
- Idempotent replay is checked before the rate locks and creates no attempt.
- Explicit retry uses a new key and consumes rate budget.

## Performance and availability

At the expected low invitation volume, one serialized actor/school bucket is
simpler and safer than a counter table. Locks are held only for database work;
the provider call occurs after the issue transaction commits. Existing composite
indexes align with both rate queries.

`hashtextextended` collisions can unnecessarily serialize unrelated buckets but
cannot permit a bypass. A lock timeout may fail closed and be retried with the
same idempotency key. The future runtime role should set bounded lock and
statement timeouts.

## Alternative if volume grows

A bucket table keyed by `(scope, bucket_start)` with an atomic conditional
`INSERT ... ON CONFLICT ... DO UPDATE ... WHERE count < limit RETURNING` would
reduce coarse serialization and make limits independently observable. It adds
cleanup, clock-bucket semantics and table privileges for definer functions, so it
is not justified for the current volume.

## Required staging proof

The local tests verify lock presence/order and a deterministic atomic model. They
do not execute PostgreSQL. Staging must launch barrier-synchronized independent
connections at counts 4/5 and 2/3, repeat the race, assert maximum accepted counts,
verify REPEATABLE READ rejection, and confirm zero deadlocks.

