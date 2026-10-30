// Setup wizard after signup (Section 8.1). The shop's onboarding_step is the screen to
// resume on; FINISHED means done or skipped.
export const SETUP_STEPS = ['welcome', 'look', 'products', 'team', 'security', 'done'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const SETUP_FINISHED = SETUP_STEPS.length;
