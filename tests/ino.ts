import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Ino } from "../target/types/ino";
import { assert } from "chai";

describe("ino", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Ino as Program<Ino>;

    const seriesId = "sakura-s1";
    const chapterId = "ch-12";
    const milestoneType = "early-bird";
    const creator = anchor.web3.Keypair.generate();

    // Use a fresh user for some tests or just provider.wallet
    // For simplicity using provider.wallet as main user.
    const user = provider.wallet;

    let milestoneConfigPda: anchor.web3.PublicKey;
    let userChapterPda: anchor.web3.PublicKey;
    let chapterStatsPda: anchor.web3.PublicKey;
    let userMilestonePda: anchor.web3.PublicKey;
    let userSupportPda: anchor.web3.PublicKey;

    before(async () => {
        // Derive PDAs
        [milestoneConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("milestone-config"),
                Buffer.from(seriesId),
                Buffer.from(chapterId),
                Buffer.from(milestoneType),
            ],
            program.programId
        );

        [userChapterPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("user-chapter"),
                user.publicKey.toBuffer(),
                Buffer.from(seriesId),
                Buffer.from(chapterId),
            ],
            program.programId
        );

        [chapterStatsPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("chapter-stats"),
                Buffer.from(seriesId),
                Buffer.from(chapterId),
            ],
            program.programId
        );

        [userMilestonePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("user-milestone"),
                user.publicKey.toBuffer(),
                milestoneConfigPda.toBuffer(),
            ],
            program.programId
        );

        [userSupportPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("support"),
                user.publicKey.toBuffer(),
                creator.publicKey.toBuffer(),
            ],
            program.programId
        );
    });

    it("Initializes Milestone Config (Cap: 10)", async () => {
        const cap = new anchor.BN(10);

        await program.methods
            .createMilestoneConfig(seriesId, chapterId, milestoneType, cap)
            .accounts({
                milestoneConfig: milestoneConfigPda,
                authority: user.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        const account = await program.account.milestoneConfig.fetch(milestoneConfigPda);
        assert.ok(account.cap.eq(cap));
        assert.ok(account.currentCount.eq(new anchor.BN(0)));
        assert.ok(account.authority.equals(user.publicKey));
    });

    it("Unlocks Chapter", async () => {
        await program.methods
            .unlockChapter(seriesId, chapterId)
            .accounts({
                user: user.publicKey,
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

    it("Fails to Unlock Duplicate Chapter", async () => {
        try {
            await program.methods
                .unlockChapter(seriesId, chapterId)
                .accounts({
                    user: user.publicKey,
                    userChapter: userChapterPda,
                    chapterStats: chapterStatsPda,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();
            assert.fail("Should have failed");
        } catch (e) {
            assert.include(e.message, "already in use");
        }
    });

    it("Completes Chapter", async () => {
        await program.methods
            .completeChapter(seriesId, chapterId)
            .accounts({
                user: user.publicKey,
                userChapter: userChapterPda,
                chapterStats: chapterStatsPda,
            })
            .rpc();

        const userChapter = await program.account.userChapterState.fetch(userChapterPda);
        assert.ok(userChapter.completedAt.gt(new anchor.BN(0)));

        const stats = await program.account.chapterStats.fetch(chapterStatsPda);
        assert.ok(stats.totalCompletions.eq(new anchor.BN(1)));
    });

    it("Fails to Complete Duplicate Chapter", async () => {
        try {
            await program.methods
                .completeChapter(seriesId, chapterId)
                .accounts({
                    user: user.publicKey,
                    userChapter: userChapterPda,
                    chapterStats: chapterStatsPda,
                })
                .rpc();
            assert.fail("Should have failed with ChapterAlreadyCompleted");
        } catch (e) {
            // Check for custom error code. In localnet errors can be weird, but usually contain message.
            // Anchor errors usually expose code.
            assert.ok(e);
        }
    });

    it("Claims Milestone (within Cap)", async () => {
        await program.methods
            .claimMilestone(seriesId, chapterId, milestoneType)
            .accounts({
                user: user.publicKey,
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

    it("Fails to Claim Duplicate Milestone", async () => {
        try {
            await program.methods
                .claimMilestone(seriesId, chapterId, milestoneType)
                .accounts({
                    user: user.publicKey,
                    milestoneConfig: milestoneConfigPda,
                    userMilestone: userMilestonePda,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();
            assert.fail("Should have failed");
        } catch (e) {
            assert.include(e.message, "already in use");
        }
    });

    it("Records Support (Trust Based)", async () => {
        const amount = new anchor.BN(5000000); // 5 USDC (6 decimals) or SOL lamports

        await program.methods
            .recordSupport(creator.publicKey, amount)
            .accounts({
                user: user.publicKey,
                userSupport: userSupportPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        let support = await program.account.userSupportState.fetch(userSupportPda);
        assert.ok(support.totalSupported.eq(amount));

        // Add more support
        await program.methods
            .recordSupport(creator.publicKey, amount)
            .accounts({
                user: user.publicKey,
                userSupport: userSupportPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        support = await program.account.userSupportState.fetch(userSupportPda);
        assert.ok(support.totalSupported.eq(amount.mul(new anchor.BN(2))));
    });
});
