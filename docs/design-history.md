# Historical Ino design proposal

> Preserved for design history. This document describes an earlier proposal and contains claims that do not match the current implementation. It is not an API reference, deployment record, security audit, or proof of payment/reading. Use the [current README](../README.md) and program source for implemented behavior. In particular, the bitmap, automatic first-1,000 badges, payment transfers, and instruction names below are historical ideas, not verified capabilities.

---

<p align="center">
  <img src="../image/ino.png" width="320" alt="Ino - On-Chain Reading Milestone Registry" />
</p>

<h1 align="center">Ino</h1>

<p align="center">
  <strong>On-Chain Reading Milestone Registry on Solana</strong>
</p>

<p align="center">
  <em>Store meaning, not activity. Milestones over logs.</em>
</p>

<p align="center">
  <a href="#architecture">Architecture</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#what-it-does">What It Does</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#pda-design">PDA Design</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#on-solscan">On Solscan</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#roadmap">Roadmap</a>
</p>

---

## What Is Ino?

**Ino** is a Solana program that records verifiable milestones of reader participation -- tied permanently to a wallet.

It is **not** a reading tracker. It does not log pages, scrolls, or session time. That belongs off-chain.

What it **does** store:

| Milestone | Description |
|-----------|-------------|
| **Chapter Unlocked** | Proof that a wallet paid to access a specific chapter |
| **Chapter Completed** | A compact bitmap confirming which chapters are finished |
| **Early Reader Badge** | Proof you were among the first 1,000 to unlock a chapter |
| **Support Tier** | On-chain reputation from tipping and supporting creators |

Every milestone is a small, deterministic, inspectable account on Solana. Nothing more. Nothing less.

---

## Why On-Chain?

Because milestones become **portable identity**.

- **Cross-app recognition** -- any front-end can read your progress
- **Early supporter proofs** -- verifiable, immutable, timestamped
- **Creator transparency** -- real engagement numbers, not inflated analytics
- **Composability** -- other programs can gate rewards, airdrops, or access based on milestones

You don't put everything on-chain. You put the things that **mean something**.

---

## What It Does

### 1. Chapter Unlock Records

When a reader pays to unlock a chapter, Ino writes a small PDA:

```
UserChapterPDA
├── user_pubkey
├── series_id
├── chapter_id
└── unlocked_at
```

**Cost:** Tiny. **Storage:** Tiny. **Impact:** Permanent proof of access.

---

### 2. Completion Milestones

No page-by-page logging. A single bitmap tracks completion across an entire series.

```
UserSeriesProgressPDA
├── user_pubkey
├── series_id
└── completed_bitmap    // e.g. 32-bit integer for 32 chapters
```

Bit 5 set = Chapter 5 completed. Cheap. Efficient. Elegant.

---

### 3. First 1,000 Reader Badges

When a chapter drops, Ino tracks a global counter:

```
SeriesChapterPDA
└── total_unlocks
```

If `total_unlocks < 1000` when you unlock, you receive:

```
UserBadgePDA
├── user_pubkey
├── series_id
├── chapter_id
├── badge_type: EarlyReader
└── awarded_at
```

**"I was here day one."** -- and you can prove it.

---

### 4. Support Tier History

When a reader tips or supports a creator:

```
UserSupportPDA
├── user_pubkey
├── creator_pubkey
├── total_supported
├── last_supported_at
└── tier_level
```

This becomes on-chain reputation. Visible participation. Portable across any app that reads the program.

---

<h2 id="pda-design">PDA Design</h2>

Everything uses **minimal, deterministic PDAs** derived from clean seed patterns:

```
Program: Sakura (Ino Core)

PDAs:
  SeriesPDA          ["series", series_id]
  ChapterPDA         ["chapter", series_id, chapter_id]
  UserSeriesPDA      ["user", user_pubkey, series_id]
  UserChapterPDA     ["user", user_pubkey, series_id, chapter_id]
  UserBadgePDA       ["badge", user_pubkey, series_id, badge_type]
  UserSupportPDA     ["support", user_pubkey, creator_pubkey]
```

**No** one-account-per-page-per-chapter-per-user sprawl.

**Yes** to clean, inspectable, predictable account addresses.

---

<h2 id="on-solscan">What It Looks Like on Solscan</h2>

### Reader unlocks a chapter:

```
Transaction signed by user
  -> Sakura Program invoked
  -> USDC/SOL transfer (if paid)
  -> UserChapterPDA created
  -> Small data struct stored
```

### Reader completes a chapter:

```
Program instruction
  -> UserSeriesProgressPDA updated
  -> Bitmap field changed
```

### Reader earns a badge:

```
SeriesChapterPDA counter incremented
  -> UserBadgePDA created
  -> Badge type + timestamp stored
```

Clean. A series of small program interactions. Not messy. Not spammy.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Client App                      │
│          (Web / Mobile / Any Front-End)           │
└──────────────────┬───────────────────────────────┘
                   │
                   │  RPC
                   v
┌──────────────────────────────────────────────────┐
│              Ino Solana Program                   │
│                                                   │
│  Instructions:                                    │
│    unlock_chapter     ->  UserChapterPDA          │
│    mark_complete      ->  UserSeriesProgressPDA   │
│    award_badge        ->  UserBadgePDA            │
│    record_support     ->  UserSupportPDA          │
│                                                   │
│  Read-only queries:                               │
│    get_progress(user, series)                     │
│    get_badges(user)                               │
│    get_support_tier(user, creator)                │
└──────────────────────────────────────────────────┘
                   │
                   v
┌──────────────────────────────────────────────────┐
│               Solana Ledger                       │
│                                                   │
│  Deterministic PDAs   |   Minimal rent cost       │
│  Verifiable on Solscan|   Portable across apps    │
└──────────────────────────────────────────────────┘
```

---

## Design Principles

| Principle | Rule |
|-----------|------|
| **Milestones, not logs** | Store the moment something meaningful happens, not every heartbeat of activity |
| **Deterministic PDAs** | Every account address is derivable from known seeds -- no hidden state |
| **Minimal storage** | Bitmaps over arrays. Counters over lists. Meaning over volume |
| **Inspect everything** | Anyone with Solscan can verify any milestone for any wallet |
| **Rent-conscious** | Small accounts, small rent. Don't burden users with unnecessary storage costs |

---

## What Ino Does NOT Do

Let's be honest about boundaries:

| Not This | Why |
|----------|-----|
| Log every page turn | Too many transactions, too expensive, bad UX |
| Log every scroll event | Spammy ledger footprint, zero signal |
| Track reading time continuously | Off-chain concern, not meaningful on-chain |
| Stream activity live on-chain | Wasteful, unnecessary, will get dunked on |

The rule is simple: **if it's not a milestone, it doesn't go on-chain.**

---

## The Bigger Picture

Ino's architecture is intentionally abstract. The same pattern works for:

| Domain | Milestones |
|--------|------------|
| **Manga / Webtoons** | Chapter unlocks, series completion, early reader badges |
| **Games** | Achievement unlocks, boss defeats, season completions |
| **Courses** | Module completion, certification, early enrollment |
| **Events** | Attendance proof, VIP access, participation badges |
| **Streaming** | Premiere attendance, watch party participation |

This isn't just a reading tracker. It's the foundation for an **On-Chain Participation Registry** -- portable, verifiable, composable identity built from meaningful moments.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Smart Contract** | Anchor (Rust) on Solana |
| **Client SDK** | TypeScript (`@solana/web3.js`) |
| **Payments** | SOL / USDC via SPL Token transfers |
| **Storage** | Solana PDAs (Program Derived Accounts) |
| **Verification** | Solscan / any Solana explorer |

---

## Roadmap

- [ ] Core program: `unlock_chapter` instruction
- [ ] Core program: `mark_complete` with bitmap tracking
- [ ] Badge system: early reader detection + PDA creation
- [ ] Support tiers: tip recording + tier calculation
- [ ] TypeScript SDK for client integration
- [ ] Devnet deployment + Solscan verification walkthrough
- [ ] Mainnet launch

---

<p align="center">
  <strong>Ino</strong> -- because your reading journey should be yours to prove.
</p>
