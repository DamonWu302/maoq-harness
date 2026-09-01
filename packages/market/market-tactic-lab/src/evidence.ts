import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import type { ResearchTacticId } from './signals.ts'

/** Strength of one public result; neither tier is MAOQ promotion evidence. */
export type PublicTacticEvidenceTier = 'peer-reviewed' | 'public-code-replication'

/** How one public result may influence a fixed MAOQ research trial. */
export type PublicTacticEvidenceUse = 'hypothesis' | 'architecture-benchmark' | 'negative-control' | 'rejected'

/** Audited public benchmark retained with its non-comparability limits. */
export interface PublicTacticEvidence {
  readonly evidenceId: string
  readonly tacticId: ResearchTacticId
  readonly tier: PublicTacticEvidenceTier
  readonly decisionUse: PublicTacticEvidenceUse
  readonly title: string
  readonly sourceUrl: string
  readonly sample: string
  readonly portfolioAndFrequency: string
  readonly reportedAnnualizedSharpe: number | null
  readonly reportedMaximumDrawdown: number | null
  readonly relevance: string
  readonly limitations: readonly string[]
}

/**
 * Public results that motivate or challenge the first P3 trials.
 * Reported metrics retain their original portfolio and execution context and are never promotion inputs.
 */
export const PUBLIC_TACTIC_EVIDENCE: readonly PublicTacticEvidence[] = deepFreeze([
  {
    evidenceId: 'china-factor-momentum-jef-2024',
    tacticId: 'regime_signed_breakout_pullback',
    tier: 'peer-reviewed',
    decisionUse: 'architecture-benchmark',
    title: 'Factor momentum in the Chinese stock market',
    sourceUrl: 'https://doi.org/10.1016/j.jempfin.2023.101458',
    sample: 'All Shanghai and Shenzhen A-shares, January 2001 through December 2019; ten factor portfolios',
    portfolioAndFrequency: 'monthly factor timing; long-short factor portfolios',
    reportedAnnualizedSharpe: 1.15,
    reportedMaximumDrawdown: null,
    relevance: 'Supports stateful momentum allocation rather than an all-weather raw stock breakout.',
    limitations: [
      'Uses ten factors and monthly long-short factor portfolios rather than MAOQ daily long-only stocks.',
      'The reported Sharpe is a comparison benchmark, not a parameter target.',
    ],
  },
  {
    evidenceId: 'bigquant-industry-state-rotation-2026',
    tacticId: 'regime_signed_breakout_pullback',
    tier: 'public-code-replication',
    decisionUse: 'hypothesis',
    title: 'Industry rotation strategy (optimized)',
    sourceUrl: 'https://mf.bigquant.com/wiki/doc/oGZs02a2Lf',
    sample: 'A-shares, 2015-01-06 through 2026-08-12',
    portfolioAndFrequency: 'weekly long-only; three industries and six stocks',
    reportedAnnualizedSharpe: 1.04,
    reportedMaximumDrawdown: 0.2387,
    relevance: 'Supports switching between industry momentum and reversal when industry rankings stabilize or disperse.',
    limitations: [
      'Public platform result is not an independently sealed holdout.',
      'The published backtest includes fees but no slippage and stays in cash for 380 of 595 weeks.',
    ],
  },
  {
    evidenceId: 'cufe-price-limit-daily-momentum-2025',
    tacticId: 'openable_emotion_leader',
    tier: 'peer-reviewed',
    decisionUse: 'hypothesis',
    title: 'Price Limit Dominates Daily Momentum Effect in the Chinese Stock Market',
    sourceUrl: 'https://xbbjb.cufe.edu.cn/EN/Y2025/V0/I1/59',
    sample: 'A-shares, 2011 through 2020',
    portfolioAndFrequency: 'daily winner-minus-loser research portfolios',
    reportedAnnualizedSharpe: null,
    reportedMaximumDrawdown: null,
    relevance: 'Supports testing next-session continuation after a price-limit hit.',
    limitations: [
      'The study does not prove an executable purchase of a sealed limit-up.',
      'No directly comparable long-only net Sharpe is reported.',
    ],
  },
  {
    evidenceId: 'easyquant-highest-board-negative-control-2026',
    tacticId: 'openable_emotion_leader',
    tier: 'public-code-replication',
    decisionUse: 'negative-control',
    title: 'Highest consecutive-board leader replication',
    sourceUrl: 'https://github.com/HiRenyi/EasyQuant/blob/main/%E5%9B%9E%E6%B5%8B%E7%BB%93%E6%9E%9C.md',
    sample: 'A-shares, 2023-01-01 through 2025-12-31',
    portfolioAndFrequency: 'daily long-only; up to ten highest-board stocks; three-session holding rule',
    reportedAnnualizedSharpe: -1.243,
    reportedMaximumDrawdown: 0.9224,
    relevance: 'Rejects board height alone as a sufficient leader signal.',
    limitations: [
      'One public platform replication is not independent market-wide proof.',
      'Its attempted opening limit orders do not establish queue-realistic fills.',
    ],
  },
  {
    evidenceId: 'easyquant-first-board-low-open-2026',
    tacticId: 'openable_emotion_leader',
    tier: 'public-code-replication',
    decisionUse: 'rejected',
    title: 'First-board low-open intraday replication',
    sourceUrl: 'https://github.com/HiRenyi/EasyQuant/blob/main/%E5%9B%9E%E6%B5%8B%E7%BB%93%E6%9E%9C.md',
    sample: 'A-shares, 2023-01-01 through 2025-12-31',
    portfolioAndFrequency: 'intraday long-only; buy 09:30 and exit at 11:28 or 14:50',
    reportedAnnualizedSharpe: 1.187,
    reportedMaximumDrawdown: 0.2728,
    relevance: 'Suggests first-board state and opening gap may matter more than absolute board height.',
    limitations: [
      'The current MAOQ daily-only contract cannot reproduce intraday exits.',
      'The three-year public backtest is not a sealed out-of-sample validation.',
    ],
  },
  {
    evidenceId: 'industry-adjusted-reversal-global-2026',
    tacticId: 'industry_relative_exhaustion_repair',
    tier: 'peer-reviewed',
    decisionUse: 'hypothesis',
    title: 'Short-term reversal persists globally—If properly measured',
    sourceUrl: 'https://doi.org/10.1016/j.econlet.2026.113113',
    sample: '64 countries, January 1990 through December 2023; China country result included',
    portfolioAndFrequency: 'monthly long-short industry-adjusted reversal',
    reportedAnnualizedSharpe: 0.76,
    reportedMaximumDrawdown: null,
    relevance: 'Supports removing the industry move before identifying an idiosyncratic selloff.',
    limitations: [
      'The China result is a monthly long-short portfolio, not a daily long-only repair entry.',
      'A 0.76 public Sharpe does not meet the MAOQ promotion threshold.',
    ],
  },
])
