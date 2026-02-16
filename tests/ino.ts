import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Ino } from "../target/types/ino";
import { assert } from "chai";
import * as crypto from "crypto";

describe("ino", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.Ino as Program<Ino>;
    const provider = anchor.getProvider();

    // Test Data
    const seriesId = "series-s1";
    const chapterId = "chapter-c1";
    const milestoneType = "badge_early_bird";

    // Hashing Helper with Namespacing (Infra-Grade)
    function hashId(type: string, id: string): number[] {
        // Convention: "type:id" to prevent cross-domain collisions
        const input = `${type}:${id}`;
        const hash = crypto.createHash('sha256').update(input).digest();
        return Array.from(hash);
    }

    const seriesHash = hashId("series", seriesId);
    const chapterHash = hashId("chapter", chapterId);
    const milestoneTypeHash = hashId("milestone_type", milestoneType);

    // PDAs
    let userChapterPda: anchor.web3.PublicKey;
    let chapterStatsPda: anchor.web3.PublicKey;
    let milestoneConfigPda: anchor.web3.PublicKey;
    let userMilestonePda: anchor.web3.PublicKey;
    let userSupportPda: anchor.web3.PublicKey;

    before(async () => {
        // Derive PDAs using HASHED seeds
        [userChapterPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("user-chapter"),
                provider.publicKey.toBuffer(),
                Buffer.from(seriesHash),
                Buffer.from(chapterHash),
            ],
            program.programId
        );

        [chapterStatsPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("chapter-stats"),
                Buffer.from(seriesHash),
                Buffer.from(chapterHash),
            ],
            program.programId
        );

        [milestoneConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("milestone-config"),
                Buffer.from(seriesHash),
                Buffer.from(chapterHash),
                Buffer.from(milestoneTypeHash),
            ],
            program.programId
        );

        // Note: UserMilestone seeds depend on milestoneConfig KEY, not the raw strings/hashes directly
        [userMilestonePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("user-milestone"),
                provider.publicKey.toBuffer(),
                milestoneConfigPda.toBuffer(),
            ],
            program.programId
        );

        // Support PDA uses creator key (random for test)
        // We'll derive it inside the test
    });

    it("Configures Milestone Checkpoints", async () => {
        const cap = new anchor.BN(100);
        await program.methods
            .createMilestoneConfig(seriesHash, chapterHash, milestoneTypeHash, cap)
            .accounts({
                authority: provider.publicKey,
                milestoneConfig: milestoneConfigPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        const config = await program.account.milestoneConfig.fetch(milestoneConfigPda);
        assert.ok(config.authority.equals(provider.publicKey));
        assert.ok(config.cap.eq(cap));
        assert.ok(config.currentCount.eq(new anchor.BN(0)));
    });

    it("Unlocks a Chapter", async () => {
        await program.methods
            .unlockChapter(seriesHash, chapterHash)
            .accounts({
                user: provider.publicKey,
                userChapter: userChapterPda,
                chapterStats: chapterStatsPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        const userChapter = await program.account.userChapterState.fetch(userChapterPda);
        assert.ok(userChapter.unlockedAt.gt(new anchor.BN(0)));
        assert.isNull(userChapter.completedAt);

        const stats = await program.account.chapterStats.fetch(chapterStatsPda);
        assert.ok(stats.totalUnlocks.eq(new anchor.BN(1)));
    });

    it("Prevents Double Unlock", async () => {
        try {
            await program.methods
                .unlockChapter(seriesHash, chapterHash)
                .accounts({
                    user: provider.publicKey,
                    userChapter: userChapterPda,
                    chapterStats: chapterStatsPda,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();
            assert.fail("Should have failed");
        } catch (e) {
            // Anchor error for account already exists
            assert.ok(e.toString().includes("already in use") || e.toString().includes("0x0"));
        }
    });

    it("Completes a Chapter", async () => {
        await program.methods
            .completeChapter(seriesHash, chapterHash)
            .accounts({
                user: provider.publicKey,
                userChapter: userChapterPda,
                chapterStats: chapterStatsPda,
            })
            .rpc();

        const userChapter = await program.account.userChapterState.fetch(userChapterPda);
        assert.ok(userChapter.completedAt !== null);

        const stats = await program.account.chapterStats.fetch(chapterStatsPda);
        assert.ok(stats.totalCompletions.eq(new anchor.BN(1)));
    });

    it("Prevents Double Completion", async () => {
        try {
            await program.methods
                .completeChapter(seriesHash, chapterHash)
                .accounts({
                    user: provider.publicKey,
                    userChapter: userChapterPda,
                    chapterStats: chapterStatsPda,
                })
                .rpc();
            assert.fail("Should have failed");
        } catch (e) {
            assert.ok(e.error.errorCode.code === "ChapterAlreadyCompleted");
        }
    });

    it("Claims Milestone (within Cap)", async () => {
        await program.methods
            .claimMilestone(seriesHash, chapterHash, milestoneTypeHash)
            .accounts({
                user: provider.publicKey,
                milestoneConfig: milestoneConfigPda,
                userMilestone: userMilestonePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        const milestone = await program.account.userMilestone.fetch(userMilestonePda);
        assert.ok(milestone.awardedAt.gt(new anchor.BN(0)));

        // Check count increment
        const config = await program.account.milestoneConfig.fetch(milestoneConfigPda);
        assert.ok(config.currentCount.eq(new anchor.BN(1)));
    });

    it("Prevents Double Milestone Claim", async () => {
        try {
            await program.methods
                .claimMilestone(seriesHash, chapterHash, milestoneTypeHash)
                .accounts({
                    user: provider.publicKey,
                    milestoneConfig: milestoneConfigPda,
                    userMilestone: userMilestonePda,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();
            assert.fail("Should have failed");
        } catch (e) {
            assert.ok(e.toString().includes("already in use"));
        }
    });

    it("Records Support (Trust Based)", async () => {
        const creatorKey = anchor.web3.Keypair.generate().publicKey;
        const amount = new anchor.BN(5000000); // 0.005 SOL

        const [userSupportPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("support"),
                provider.publicKey.toBuffer(),
                creatorKey.toBuffer(),
            ],
            program.programId
        );

        await program.methods
            .recordSupport(creatorKey, amount)
            .accounts({
                user: provider.publicKey,
                userSupport: userSupportPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        const support = await program.account.userSupportState.fetch(userSupportPda);
        assert.ok(support.totalSupported.eq(amount));
        assert.ok(support.lastSupportedAt.gt(new anchor.BN(0)));

        // Record again to check cumulative
        await program.methods
            .recordSupport(creatorKey, amount)
            .accounts({
                user: provider.publicKey,
                userSupport: userSupportPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        const support2 = await program.account.userSupportState.fetch(userSupportPda);
        assert.ok(support2.totalSupported.eq(amount.add(amount)));
    });
});
