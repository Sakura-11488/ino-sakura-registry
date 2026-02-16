import * as anchor from "@coral-xyz/anchor";
import { Program, Idl, AnchorProvider } from "@coral-xyz/anchor";
import * as crypto from "crypto";

// --- Manual Interface Definition (until 'anchor build' succeeds) ---
export interface Ino extends Idl {
    version: "0.1.0";
    name: "ino";
    instructions: [
        {
            name: "unlockChapter";
            accounts: [
                { name: "user"; isMut: true; isSigner: true },
                { name: "userChapter"; isMut: true; isSigner: false },
                { name: "chapterStats"; isMut: true; isSigner: false },
                { name: "systemProgram"; isMut: false; isSigner: false }
            ];
            args: [{ name: "seriesHash"; type: { array: ["u8", 32] } }, { name: "chapterHash"; type: { array: ["u8", 32] } }];
        },
        {
            name: "completeChapter";
            accounts: [
                { name: "user"; isMut: true; isSigner: true },
                { name: "userChapter"; isMut: true; isSigner: false },
                { name: "chapterStats"; isMut: true; isSigner: false }
            ];
            args: [{ name: "seriesHash"; type: { array: ["u8", 32] } }, { name: "chapterHash"; type: { array: ["u8", 32] } }];
        },
        {
            name: "createMilestoneConfig";
            accounts: [
                { name: "authority"; isMut: true; isSigner: true },
                { name: "milestoneConfig"; isMut: true; isSigner: false },
                { name: "systemProgram"; isMut: false; isSigner: false }
            ];
            args: [
                { name: "seriesHash"; type: { array: ["u8", 32] } },
                { name: "chapterHash"; type: { array: ["u8", 32] } },
                { name: "milestoneTypeHash"; type: { array: ["u8", 32] } },
                { name: "cap"; type: { option: "u64" } }
            ];
        },
        {
            name: "claimMilestone";
            accounts: [
                { name: "user"; isMut: true; isSigner: true },
                { name: "milestoneConfig"; isMut: true; isSigner: false },
                { name: "userMilestone"; isMut: true; isSigner: false },
                { name: "systemProgram"; isMut: false; isSigner: false }
            ];
            args: [
                { name: "seriesHash"; type: { array: ["u8", 32] } },
                { name: "chapterHash"; type: { array: ["u8", 32] } },
                { name: "milestoneTypeHash"; type: { array: ["u8", 32] } }
            ];
        },
        {
            name: "recordSupport";
            accounts: [
                { name: "user"; isMut: true; isSigner: true },
                { name: "userSupport"; isMut: true; isSigner: false },
                { name: "systemProgram"; isMut: false; isSigner: false }
            ];
            args: [
                { name: "creatorKey"; type: "publicKey" },
                { name: "amount"; type: "u64" }
            ];
        }
    ];
}

export class InoClient {
    program: Program<Ino>;
    provider: AnchorProvider;

    constructor(program: Program<Ino>) {
        this.program = program;
        this.provider = program.provider as AnchorProvider;
    }

    // --- Hashing Helper (Infra-Grade) ---
    static hashId(type: string, id: string): number[] {
        // Convention: "type:id"
        const input = `${type}:${id}`;
        const hash = crypto.createHash('sha256').update(input).digest();
        return Array.from(hash);
    }

    // --- PDA Helpers ---

    getUserChapterPda(user: anchor.web3.PublicKey, seriesId: string, chapterId: string): anchor.web3.PublicKey {
        const seriesHash = InoClient.hashId("series", seriesId);
        const chapterHash = InoClient.hashId("chapter", chapterId);

        return anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("user-chapter"),
                user.toBuffer(),
                Buffer.from(seriesHash),
                Buffer.from(chapterHash),
            ],
            this.program.programId
        )[0];
    }

    getChapterStatsPda(seriesId: string, chapterId: string): anchor.web3.PublicKey {
        const seriesHash = InoClient.hashId("series", seriesId);
        const chapterHash = InoClient.hashId("chapter", chapterId);

        return anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("chapter-stats"),
                Buffer.from(seriesHash),
                Buffer.from(chapterHash),
            ],
            this.program.programId
        )[0];
    }

    getMilestoneConfigPda(seriesId: string, chapterId: string, milestoneType: string): anchor.web3.PublicKey {
        const seriesHash = InoClient.hashId("series", seriesId);
        const chapterHash = InoClient.hashId("chapter", chapterId);
        const typeHash = InoClient.hashId("milestone_type", milestoneType);

        return anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("milestone-config"),
                Buffer.from(seriesHash),
                Buffer.from(chapterHash),
                Buffer.from(typeHash),
            ],
            this.program.programId
        )[0];
    }

    getUserMilestonePda(user: anchor.web3.PublicKey, seriesId: string, chapterId: string, milestoneType: string): anchor.web3.PublicKey {
        const configPda = this.getMilestoneConfigPda(seriesId, chapterId, milestoneType);

        return anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("user-milestone"),
                user.toBuffer(),
                configPda.toBuffer(),
            ],
            this.program.programId
        )[0];
    }

    getUserSupportPda(user: anchor.web3.PublicKey, creatorKey: anchor.web3.PublicKey): anchor.web3.PublicKey {
        return anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("support"),
                user.toBuffer(),
                creatorKey.toBuffer(),
            ],
            this.program.programId
        )[0];
    }

    // --- Instructions ---

    async unlockChapter(seriesId: string, chapterId: string) {
        const seriesHash = InoClient.hashId("series", seriesId);
        const chapterHash = InoClient.hashId("chapter", chapterId);

        const userChapterPda = this.getUserChapterPda(this.provider.publicKey, seriesId, chapterId);
        const chapterStatsPda = this.getChapterStatsPda(seriesId, chapterId);

        return await this.program.methods
            .unlockChapter(seriesHash, chapterHash)
            .accounts({
                user: this.provider.publicKey,
                userChapter: userChapterPda,
                chapterStats: chapterStatsPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();
    }

    async completeChapter(seriesId: string, chapterId: string) {
        const seriesHash = InoClient.hashId("series", seriesId);
        const chapterHash = InoClient.hashId("chapter", chapterId);

        const userChapterPda = this.getUserChapterPda(this.provider.publicKey, seriesId, chapterId);
        const chapterStatsPda = this.getChapterStatsPda(seriesId, chapterId);

        return await this.program.methods
            .completeChapter(seriesHash, chapterHash)
            .accounts({
                user: this.provider.publicKey,
                userChapter: userChapterPda,
                chapterStats: chapterStatsPda,
            } as any)
            .rpc();
    }

    async createMilestoneConfig(
        seriesId: string,
        chapterId: string,
        milestoneType: string,
        cap: anchor.BN | null
    ) {
        const seriesHash = InoClient.hashId("series", seriesId);
        const chapterHash = InoClient.hashId("chapter", chapterId);
        const typeHash = InoClient.hashId("milestone_type", milestoneType);

        const milestoneConfigPda = this.getMilestoneConfigPda(seriesId, chapterId, milestoneType);

        return await this.program.methods
            .createMilestoneConfig(seriesHash, chapterHash, typeHash, cap)
            .accounts({
                authority: this.provider.publicKey,
                milestoneConfig: milestoneConfigPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();
    }

    async claimMilestone(seriesId: string, chapterId: string, milestoneType: string) {
        const seriesHash = InoClient.hashId("series", seriesId);
        const chapterHash = InoClient.hashId("chapter", chapterId);
        const typeHash = InoClient.hashId("milestone_type", milestoneType);

        const milestoneConfigPda = this.getMilestoneConfigPda(seriesId, chapterId, milestoneType);
        const userMilestonePda = this.getUserMilestonePda(this.provider.publicKey, seriesId, chapterId, milestoneType);

        return await this.program.methods
            .claimMilestone(seriesHash, chapterHash, typeHash)
            .accounts({
                user: this.provider.publicKey,
                milestoneConfig: milestoneConfigPda,
                userMilestone: userMilestonePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();
    }

    async recordSupport(creatorKey: anchor.web3.PublicKey, amount: anchor.BN) {
        const userSupportPda = this.getUserSupportPda(this.provider.publicKey, creatorKey);

        return await this.program.methods
            .recordSupport(creatorKey, amount)
            .accounts({
                user: this.provider.publicKey,
                userSupport: userSupportPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();
    }
}
