import type { MaoMethodId, MaoMethodApplication, ResolvedMaoMethodApplication } from './types.ts'

interface MaoMethodDefinition {
  readonly sourceTitle: string
  readonly sourceUrl: string
  readonly principle: string
}

/** Host-owned attribution catalog. Principles are deliberately paraphrased. */
export const MAO_METHOD_CATALOG: Readonly<Record<MaoMethodId, MaoMethodDefinition>> = {
  investigation_before_conclusion: {
    sourceTitle: '《反对本本主义》',
    sourceUrl: 'https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193005.htm',
    principle: '结论必须以实际调查为前提；证据不足时不作行动性判断。',
  },
  seek_truth_from_facts: {
    sourceTitle: '《改造我们的学习》',
    sourceUrl: 'https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-19410519.htm',
    principle: '把客观存在的事实作为研究起点，再从事实中找出规律。',
  },
  principal_contradiction: {
    sourceTitle: '《矛盾论》',
    sourceUrl: 'https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193708.htm',
    principle: '在复杂过程中区分主要矛盾、次要矛盾及矛盾的主要方面。',
  },
  concrete_analysis: {
    sourceTitle: '《矛盾论》',
    sourceUrl: 'https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193708.htm',
    principle: '不同性质和阶段的矛盾需要结合具体条件采用不同方法。',
  },
  practice_test: {
    sourceTitle: '《实践论》',
    sourceUrl: 'https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193707.htm',
    principle: '认识需要在实践中检验，并根据结果继续修正。',
  },
  concentrate_advantage: {
    sourceTitle: '《集中优势兵力，各个歼灭敌人》',
    sourceUrl: 'https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-19460916.htm',
    principle: '避免平均用力，在条件有利的局部集中资源解决关键目标。',
  },
  initiative_flexibility_planning: {
    sourceTitle: '《中国革命战争的战略问题》',
    sourceUrl: 'https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193612.htm',
    principle: '从全局和具体条件出发，保持主动、灵活并预设变化方案。',
  },
}

/**
 * Resolve an allowlisted method ID into a source title and paraphrased principle.
 * @param application - Model-authored application that already passed evidence validation.
 * @returns Attribution enriched only from the immutable host catalog.
 */
export function resolveMaoMethodApplication(application: MaoMethodApplication): ResolvedMaoMethodApplication {
  const definition = MAO_METHOD_CATALOG[application.methodId]
  return { ...application, ...definition, attributionKind: 'paraphrase' }
}
