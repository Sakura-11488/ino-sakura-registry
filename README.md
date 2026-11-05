# Ino — experimental milestone registry

An Anchor/Rust prototype for recording wallet-associated chapter and milestone state on Solana. It is part of [Sakura](https://github.com/Sakura-11488/Sakura)'s wider application research.

**Current scope: localnet development.** The repository contains program source, a TypeScript client draft, and integration-test source. This README does not claim a verified deployment, completed audit, or production-ready integration.

## Implemented instruction surface

The source of truth is [programs/ino/src/lib.rs](programs/ino/src/lib.rs).

| Instruction | State it records |
| --- | --- |
| `unlock_chapter` | A user's chapter timestamp and the chapter's unlock count |
| `complete_chapter` | A completion timestamp for an unlocked chapter and the chapter's completion count |
| `create_milestone_config` | A milestone configuration with authority, optional cap, and claim count |
| `claim_milestone` | A user's milestone timestamp and an incremented claim count, subject to the configured cap |
| `record_support` | A cumulative support amount and timestamp for a user/creator pair |

These are program records. **A record alone does not prove payment, actual reading, a unique human identity, or independently verified achievement.** The program does not perform the SOL/SPL payment transfers described in the earlier design proposal. Applications must define and verify the meaning of records before using them for access, reputation, or rewards.

The implementation stores per-chapter timestamps rather than a series completion bitmap. It does not implement an automatic first-1,000-reader badge or calculated support tiers.

## Repository map

| Path | Purpose |
| --- | --- |
| `programs/ino/` | Anchor program and account definitions |
| `app/client.ts` | Draft TypeScript wrapper and address helpers |
| `tests/ino.ts` | Integration-test source |
| `Anchor.toml` | Localnet configuration and intended test command |
| [Historical design](docs/design-history.md) | Earlier proposal, preserved with its limitations identified |
| [Historical walkthrough](WALKTHROUGH.md) | Earlier implementation notes, not current verification evidence |

## Development and remaining work

`Anchor.toml` selects localnet and the program depends on Anchor `0.32.1`. Its configured test command references Yarn, `ts-mocha`, and `tsconfig.json`, but this checkout does not include the JavaScript package manifest or TypeScript configuration needed to run that harness. The client also uses a manually maintained interface rather than a verified generated interface.

Before calling the prototype ready for integration:

1. Restore a pinned, reproducible local test toolchain and JavaScript test setup.
2. Generate and verify the program interface against the client and tests.
3. Specify what each recorded fact means and which component is responsible for verifying it.
4. Test authorization, state transitions, and failure behavior on a local validator, then obtain independent review before any broader deployment.

Use disposable local test identities. An address in source is not a deployment record. Do not fund or advertise a production integration on the basis of this repository.

## Contributions and licensing

Keep changes focused and include reproducible local evidence. Report potentially exploitable findings privately through a verified maintainer channel; do not publish sensitive details or test shared infrastructure without authorization.

No project license is included in this checkout. This documentation change does not supply a license or grant additional rights. Dependency licenses remain their own.

For the current application, see [Sakura](https://github.com/Sakura-11488/Sakura). For the separate paper-trading work, see [sakura-perps](https://github.com/Sakura-11488/sakura-perps).
