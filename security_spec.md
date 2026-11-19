# Security Specification — Smart Integrity City Firestore Rules

## 1. Data Invariants
1. **Verified Identity**: All authenticated writes require `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation**: User emails live exclusively in `/users/{uid}/private/info`, readable/writable only by `isOwner(uid)` or `isAdmin()`.
3. **No Self-Assigned Privileges**: Users creating `/users/{uid}` MUST set `role == 'player'` (unless they are already `isAdmin()`), and cannot escalate `role` to `'teacher'` on update. Only `isAdmin()` can write `/admins/{uid}` or change a user's role.
4. **Master Gate & Parent Existence**: All subcollections (`/rooms/{roomCode}/players/{playerId}` and `/rooms/{roomCode}/evidence/{evidenceId}`) require `exists(/databases/$(database)/documents/rooms/$(roomCode))` on write, matching `roomCode` and `ownerUid` to the parent room.
5. **Immortal & Temporal Integrity**: `uid`, `ownerUid`, `authorUid`, `roomCode`, and `createdAt` are immutable after creation; `createdAt == request.time` on create and `updatedAt == request.time` on create/update.
6. **Terminal State Locking**: Once a room reaches `status == 'ended'`, non-admin host writes cannot revert `status` back to `'lobby'` or `'playing'`, and students can only update `memberUids` (join post-game), claim an unclaimed player, submit `post` when null, or submit `evidence` with `status == 'pending'`.
7. **Query Enforcement without `get()`**: All `allow list` rules check `resource.data` directly against `request.auth.uid` with zero `get()` or `exists()` lookups.
8. **Strict Key & Size Bounds**: Every document enforces `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on action-based updates, `isValidId()` regex checks on path IDs, and explicit `.size()` limits on all strings and bounded lists.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Privilege Escalation on User Create**: Creating `/users/attackerUid` with `{ role: 'teacher', ... }`.
2. **Role Tampering on User Update**: Updating `/users/attackerUid` changing `role` from `'player'` to `'teacher'`.
3. **Ghost Field / Shadow Write**: Creating `/rooms/AB12` with an extra undocumented key `{ isVerified: true }`.
4. **PII Cross-User Read**: Signed-in user B attempting `get` on `/users/userA/private/info`.
5. **Unverified / Spoofed Email Admin Bypass**: Auth token with `email: 'Teeranop.ch@gmail.com'` and `email_verified: false` reading `/admins/uid` or updating `/lessons/demo`.
6. **Blanket Room Listing Scrape**: Calling `getDocs(collection(db, 'rooms'))` without `where('ownerUid', '==', auth.uid)` or `where('memberUids', 'array-contains', auth.uid)`.
7. **Orphaned Player Write**: Creating `/rooms/NOPE/players/p1` when parent `/rooms/NOPE` does not exist.
8. **ID Poisoning**: Creating `/rooms/INVALID_1500_CHAR_ID...` or path variable with `$`/spaces.
9. **Client Timestamp Forgery**: Creating `/rooms/AB12` with `createdAt: new Date(0)` instead of `serverTimestamp()`.
10. **Owner Hijack on Room Update**: Host or member updating `ownerUid` or `createdAt` on `/rooms/AB12`.
11. **Student Approving Own Evidence**: Student updating `/rooms/AB12/evidence/p1_honesty` with `status: 'approved'` (students may only submit `status: 'pending'`).
12. **Terminal State Reversion**: Non-admin user attempting to update `/rooms/AB12` from `status: 'ended'` back to `status: 'playing'`.
