use anchor_lang::prelude::*;

declare_id!("E9ju12He2mnBRaneM4xdtUXECDPXdpQQbU6HtSKb6Hpf");

#[program]
pub mod ino {
    use super::*;

    pub fn unlock_chapter(
        ctx: Context<UnlockChapter>,
        _series_id: String,
        _chapter_id: String,
    ) -> Result<()> {
        let user_chapter = &mut ctx.accounts.user_chapter;
        let chapter_stats = &mut ctx.accounts.chapter_stats;
        let clock = Clock::get()?;

        // Init UserChapterState
        user_chapter.unlocked_at = clock.unix_timestamp;
        user_chapter.completed_at = None;
        user_chapter.bump = ctx.bumps.user_chapter;

        // Update Stats
        chapter_stats.total_unlocks = chapter_stats.total_unlocks.checked_add(1).unwrap();
        if chapter_stats.total_completions == 0 {
            // Ensure it's initialized if helpful, though default is 0.
            // Accessing it to ensure it's loaded.
        }

        Ok(())
    }

    pub fn complete_chapter(
        ctx: Context<CompleteChapter>,
        _series_id: String,
        _chapter_id: String,
    ) -> Result<()> {
        let user_chapter = &mut ctx.accounts.user_chapter;
        let chapter_stats = &mut ctx.accounts.chapter_stats;
        let clock = Clock::get()?;

        // Guard: Already completed?
        require!(
            user_chapter.completed_at.is_none(),
            InoError::ChapterAlreadyCompleted
        );

        // Update User State
        user_chapter.completed_at = Some(clock.unix_timestamp);

        // Update Stats
        chapter_stats.total_completions = chapter_stats.total_completions.checked_add(1).unwrap();

        Ok(())
    }

    pub fn create_milestone_config(
        ctx: Context<CreateMilestoneConfig>,
        _series_id: String,
        _chapter_id: String,
        _milestone_type: String,
        cap: Option<u64>,
    ) -> Result<()> {
        let milestone_config = &mut ctx.accounts.milestone_config;
        milestone_config.authority = ctx.accounts.authority.key();
        milestone_config.cap = cap;
        milestone_config.current_count = 0;
        milestone_config.bump = ctx.bumps.milestone_config;
        Ok(())
    }

    pub fn claim_milestone(
        ctx: Context<ClaimMilestone>,
        _series_id: String,
        _chapter_id: String,
        _milestone_type: String,
    ) -> Result<()> {
        let milestone_config = &mut ctx.accounts.milestone_config;

        // Guard: Check Cap
        if let Some(cap) = milestone_config.cap {
            require!(
                milestone_config.current_count < cap,
                InoError::MilestoneCapReached
            );
        }

        // Init User Milestone
        let user_milestone = &mut ctx.accounts.user_milestone;
        user_milestone.awarded_at = Clock::get()?.unix_timestamp;
        user_milestone.bump = ctx.bumps.user_milestone;

        // Increment Count
        milestone_config.current_count = milestone_config.current_count.checked_add(1).unwrap();

        Ok(())
    }

    pub fn record_support(
        ctx: Context<RecordSupport>,
        _creator_key: Pubkey, // Used in seeds
        amount: u64,
    ) -> Result<()> {
        let user_support = &mut ctx.accounts.user_support;
        let clock = Clock::get()?;

        user_support.total_supported = user_support.total_supported.checked_add(amount).unwrap();
        user_support.last_supported_at = clock.unix_timestamp;

        if user_support.bump == 0 {
            user_support.bump = ctx.bumps.user_support;
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(series_id: String, chapter_id: String)]
pub struct UnlockChapter<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + UserChapterState::INIT_SPACE,
        seeds = [b"user-chapter", user.key().as_ref(), series_id.as_bytes(), chapter_id.as_bytes()],
        bump
    )]
    pub user_chapter: Account<'info, UserChapterState>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + ChapterStats::INIT_SPACE,
        seeds = [b"chapter-stats", series_id.as_bytes(), chapter_id.as_bytes()],
        bump
    )]
    pub chapter_stats: Account<'info, ChapterStats>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(series_id: String, chapter_id: String)]
pub struct CompleteChapter<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user-chapter", user.key().as_ref(), series_id.as_bytes(), chapter_id.as_bytes()],
        bump = user_chapter.bump,
    )]
    pub user_chapter: Account<'info, UserChapterState>,

    #[account(
        mut,
        seeds = [b"chapter-stats", series_id.as_bytes(), chapter_id.as_bytes()],
        bump
    )]
    pub chapter_stats: Account<'info, ChapterStats>,
}

#[derive(Accounts)]
#[instruction(series_id: String, chapter_id: String, milestone_type: String)]
pub struct CreateMilestoneConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + MilestoneConfig::INIT_SPACE,
        seeds = [b"milestone-config", series_id.as_bytes(), chapter_id.as_bytes(), milestone_type.as_bytes()],
        bump
    )]
    pub milestone_config: Account<'info, MilestoneConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(series_id: String, chapter_id: String, milestone_type: String)]
pub struct ClaimMilestone<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"milestone-config", series_id.as_bytes(), chapter_id.as_bytes(), milestone_type.as_bytes()],
        bump = milestone_config.bump
    )]
    pub milestone_config: Account<'info, MilestoneConfig>,

    #[account(
        init,
        payer = user,
        space = 8 + UserMilestone::INIT_SPACE,
        seeds = [b"user-milestone", user.key().as_ref(), milestone_config.key().as_ref()],
        bump
    )]
    pub user_milestone: Account<'info, UserMilestone>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(creator_key: Pubkey)]
pub struct RecordSupport<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserSupportState::INIT_SPACE,
        seeds = [b"support", user.key().as_ref(), creator_key.as_ref()],
        bump
    )]
    pub user_support: Account<'info, UserSupportState>,

    pub system_program: Program<'info, System>,
}

// Data Structures

#[account]
#[derive(InitSpace)]
pub struct UserChapterState {
    pub unlocked_at: i64,
    pub completed_at: Option<i64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ChapterStats {
    pub total_unlocks: u64,
    pub total_completions: u64,
}

#[account]
#[derive(InitSpace)]
pub struct MilestoneConfig {
    pub authority: Pubkey,
    pub cap: Option<u64>,
    pub current_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserMilestone {
    pub awarded_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserSupportState {
    pub total_supported: u64,
    pub last_supported_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum InoError {
    #[msg("Chapter is already completed.")]
    ChapterAlreadyCompleted,
    #[msg("Milestone cap reached.")]
    MilestoneCapReached,
}
