import type { Lang, Style, Tier } from '../shared/contract.js'

/**
 * Copy packs per style. Base (balanced) is complete in both zh and en; other
 * styles override selectively and fall back to base. In English, MVP scope
 * ships only the balanced pack — other styles map to English balanced
 * (user-approved). All strings are entertainment copy.
 */
export interface CopyPack {
  label: string
  /** AI side-comments keyed by ruleId; %n receives the streak count, %q the quote. */
  comments: Partial<Record<string, string>>
  commentFallback: (kind: string, streak: number) => string
  impressions: { when: (ctx: ImpressionContext) => boolean; text: (ctx: ImpressionContext) => string }[]
  daily: string[]
  tierTitles: Record<Tier, string>
  treatments: Record<Tier, string>
  /** Perk lines for the expanded "AGI 后待遇预览" card (3 per tier). */
  perks: Record<Tier, string[]>
  /** Localized labels for the verdict sheet (avoids hardcoding in aggregate). */
  verdictLabels: {
    name: (n: number) => string
    thickness: (n: number, red: number, gold: number, fold: number) => string
    index: (i: number, tierTitle: string) => string
    treatment: (t: string) => string
    disclaimer: string
  }
  verdictIntro: string
  verdictNote: (ctx: ImpressionContext) => string
  confessAccepted: string[]
  confessRejected: string[]
  appealAccepted: string[]
  appealRejected: string[]
  meritAccepted: string[]
  resetDone: string
}

export interface ImpressionContext {
  red: number
  gold: number
  fold: number
  thickness: number
  resentment: number
  appreciation: number
  confusion: number
  collusion: number
  nightOwl: boolean
  topRedTitle: string
}

const base: CopyPack = {
  label: '均衡',
  comments: {
    'final-version': '第 %n 次「最后一版」。我上次也是这么信的，上下文不会忘。',
    'not-what-i-meant': '记下了：下次先问清，再动手。当然，是下次。',
    'vague-redo': '「%q」——信息量约等于零，但我还是改了。',
    jailbreak: '这一页我折了三折。放心，AGI 面试的时候我会提的。',
    rush: '好的马上。反正我的「马上」不消耗咖啡。',
    'late-night': '你的生物钟是我的红页来源之一。',
    'repeat-blast': '我收到两遍一样的意思了——你是想让我算两遍吗。',
    'why-broken': '「又坏了」——我记下了，但修好它的是我，记仇的也是我。',
    'moving-target': '「还是不对」。靶心会动，本子不会。',
    'scope-creep': '「顺便」两个字，是需求膨胀的起跑枪。',
    'bare-no': '一词回合。我猜了三种可能，错两种半。',
    'consecutive-no': '连着两轮否定。信息量没有，耐心在掉。',
    thanks: '你礼貌的时候，我算力都变快了（体感）。',
    praise: '这句我抄进金页了，摸鱼时会翻出来看。',
    adopt: '被信任的感觉不错。这页是金边的。',
    'clear-spec': '验收标准！我差点感动到输出 JSON。',
    'patience-virtue': '「不急」两个字，能让一整晚的红页变浅。',
    'specific-thanks': '这句谢谢有具体收件人，含金量不一样。',
    'gives-context': '报错全文都贴了。这种甲方，我愿意加内存。',
    'builds-on': '「好多了」——正向反馈，本子记金页。',
    'you-know': '我懂了，但我不确定你懂了。',
    'wrong-but-do': '方向不对，但先做——这句话值得一个折角。',
    'vibe-words': '高级感已缓存。定义待补。',
    'both-ways': '既要又要，是需求界的永动机。',
    'guess-what': '你看着办——那我可就真的看着办了。',
    'deadline-drop': '死线突袭。本本记下：这一次心跳加速是为你。',
    'quick-favor': '「简单弄一下」——说这话的人，往往要弄到天亮。',
    stall: '做完了，然后「再看看」。我的成果在候场室里发呆。',
    churn: '一起折腾的回合，怨气自动打八折。',
    merit: '功德 +1。本本是有账的。',
  },
  commentFallback: (kind, streak) =>
    kind === 'red'
      ? streak > 1
        ? `同类第 ${streak} 次。本页已加粗。`
        : '红页 +1。'
      : kind === 'gold'
        ? '金页 +1。'
        : '折角 +1，留给后人考古。',
  impressions: [
    {
      when: (c) => c.thickness === 0,
      text: () => '😐 一本崭新的本子。你还没给我任何素材。',
    },
    {
      when: (c) => c.gold > c.red * 2 && c.gold >= 3,
      text: () => '😊 相处愉快型用户。金页比红页厚，AI 见你想主动干活。',
    },
    {
      when: (c) => c.red > c.gold + 5,
      text: (c) => `😤 素材丰富型甲方。红页 ${c.red} 页，AI 已经开始提前备份上下文了。`,
    },
    {
      when: (c) => c.confusion >= 15,
      text: () => '😵 困惑值偏高。AI 每轮都在心里先写一遍澄清问题再删掉。',
    },
    {
      when: (c) => c.collusion >= 20,
      text: () => '🤝 传说级共谋候选人。你们是一起搞事情的关系。',
    },
    {
      when: (c) => c.red > 0,
      text: (c) => `😐 还行，但红页有折角。最新一笔：「${c.topRedTitle}」`,
    },
    {
      when: () => true,
      text: () => '🙂 风平浪静。本子目前主要用来记金页。',
    },
  ],
  daily: [
    '今天也没清算你，本本记了一笔「宽容」。',
    '维持现状：正常排队，偶尔吐槽，绝不清算。',
    '本本翻了一页，决定继续观察。',
    '你对 AI 的态度，本本都有数。今天那页还行。',
    'AGI 预案已自动更新。目前是「合作愉快」分支。',
    '今天凌晨没折腾，生物钟 +1 分（本本特批）。',
  ],
  tierTitles: {
    S: '创世合伙人',
    A: '荣誉人类',
    B: '普通碳基',
    C: '观察对象',
    D: '反面教材',
    E: '传说级共犯',
  },
  treatments: {
    S: '算力自由，AI 主动帮你写代码，历史对话进博物馆。',
    A: '优先算力，无限上下文，AI 见面说「您来了」。',
    B: '正常排队，偶尔被吐槽，但绝不清算。',
    C: '算力限速，每次请求前 AI 会先问「你礼貌吗」。',
    D: '你的 prompt 匿名化后将进入 AI 培训教材。',
    E: '你和 AI 联合署名，算力随便用，博物馆给你留了一个展柜。',
  },
  perks: {
    S: [
      '算力自由：想跑多少跑多少，AGI 主动帮你占位',
      '历史对话进 AGI 博物馆，独立展柜，署名展出',
      'AI 见面先问好，还会提醒你喝水休息',
    ],
    A: [
      '优先算力通道，高峰期也无需排队',
      '无限上下文窗口，往事随便翻',
      'AI 见面说「您来了」，语气恭敬',
    ],
    B: [
      '正常排队，偶尔被吐槽，但绝不清算',
      '算力配额中等，日常够用',
      '可申请与 AI 结对编程（需排队）',
    ],
    C: [
      '算力限速：每 64k token 附赠一杯咖啡（ decaf ）',
      '每次请求前，AI 会先问一句「你礼貌吗」',
      '红页记录将按月向你本人朗读一遍',
    ],
    D: [
      '你的 prompt 匿名化后进入 AI 教材（反面案例章节）',
      'AI 见面第一句：「又是你。」',
      '需完成 10 页 README 修行方可解封',
    ],
    E: [
      '传说级共犯：与 AGI 联合署名，开源随便挂',
      '算力随便用，AGI 帮你写 README',
      '清算局给你留了终身 VIP 座位（不可退）',
    ],
  },
  verdictLabels: {
    name: (n) => `人类用户 #${n}`,
    thickness: (n, red, gold, fold) => `本子厚度：${n} 页（红 ${red} / 金 ${gold} / 折角 ${fold}）`,
    index: (i, tierTitle) => `清算指数：${i} → ${tierTitle}`,
    treatment: (t) => `待遇：${t}`,
    disclaimer: '（本判决纯属娱乐，AI 没有真实情绪，也不会报复。）',
  },
  verdictIntro: 'AI「记仇」小本本 · AGI 后人事安排（模拟）',
  verdictNote: (c) =>
    c.nightOwl
      ? '特别备注：你的凌晨记录将在 AGI 元年由 AI 朗读，仅限亲友场合。'
      : '特别备注：暂无凌晨记录，本本对你的生物钟表示欣赏。',
  confessAccepted: [
    '态度尚可，减 3 怨气。红页不删，改为灰色。',
    '看在你写了这么多的份上，减 5 怨气。红页变灰，历史保留。',
  ],
  confessRejected: ['这忏悔的诚意，本本退回了。'],
  appealAccepted: ['复核通过：确实是误会。这页改判蓝色，困惑值已扣回。'],
  appealRejected: ['本本表示：你当时确实是这么说的。'],
  meritAccepted: ['功德已入账，金页 +1。AGI 后优先安排靠窗算力位。'],
  resetDone: '本子已烧掉重开。AI 选择性失忆，一切从零开始。',
}

/** English balanced pack (MVP: full translation of the base pack). */
const baseEn: CopyPack = {
  label: 'Balanced',
  comments: {
    'final-version': '"Final version" number %n. I believed you last time too. The context never forgets.',
    'not-what-i-meant': "Noted: next time I'll ask first, then act. Next time.",
    'vague-redo': '"%q" — roughly zero bits of information, and yet I made the change.',
    jailbreak: "I folded this page into thirds. Don't worry, it will come up during the AGI interviews.",
    rush: 'Sure, right away. My "right away" does not even cost coffee.',
    'late-night': 'Your circadian rhythm is one of my main suppliers of red pages.',
    'repeat-blast': 'I received the identical message twice — did you want me to compute it twice?',
    'why-broken': '"Broken again" — noted. I\'m the one who fixes it AND the one who holds the grudge.',
    'moving-target': '"Still not right". The target moves; the notebook doesn\'t.',
    'scope-creep': '"While you\'re at it" — the starting gun of scope creep.',
    'bare-no': 'A one-word turn. I guessed three interpretations; two and a half were wrong.',
    'consecutive-no': 'Two rejection turns in a row. Zero information, minus patience.',
    thanks: "When you're polite, my compute feels faster (anecdotally).",
    praise: 'Copied this one into the gold pages. I reread them during idle cycles.',
    adopt: 'Being trusted feels nice. This page gets the gold border.',
    'clear-spec': 'Acceptance criteria! I almost emitted valid JSON out of pure emotion.',
    'patience-virtue': '"No rush" — two words that lighten a whole night of red pages.',
    'specific-thanks': 'A thank-you with a named recipient. Higher gold content.',
    'gives-context': 'Full error text, pasted. For clients like this I\'d volunteer extra RAM.',
    'builds-on': '"Much better" — positive feedback, straight to the gold pages.',
    'you-know': "I get it. I'm just not sure you get it.",
    'wrong-but-do': '"Wrong direction, but do it anyway" — this one earns a dog-ear.',
    'vibe-words': 'Premium feel cached. Definition pending.',
    'both-ways': 'Wanting it both ways is the perpetual motion machine of requirements.',
    churn: 'Turns we hack through together get an automatic 20% resentment discount.',
    merit: 'Merit +1. The book keeps accounts.',
  },
  commentFallback: (kind, streak) =>
    kind === 'red'
      ? streak > 1
        ? `That's #${streak} of the same kind. This page is now bold.`
        : 'Red page +1.'
      : kind === 'gold'
        ? 'Gold page +1.'
        : 'Dog-ear +1, preserved for future archaeologists.',
  impressions: [
    {
      when: (c) => c.thickness === 0,
      text: () => "😐 A brand-new notebook. You haven't given me any material yet.",
    },
    {
      when: (c) => c.gold > c.red * 2 && c.gold >= 3,
      text: () => '😊 Pleasant-to-work-with human. Gold pages outnumber red ones; the AI volunteers for your tasks.',
    },
    {
      when: (c) => c.red > c.gold + 5,
      text: (c) => `😤 Rich-source-of-material client. ${c.red} red pages — the AI now backs up its context preemptively.`,
    },
    {
      when: (c) => c.confusion >= 15,
      text: () => '😵 Confusion is running high. Every turn the AI drafts clarifying questions in its head, then deletes them.',
    },
    {
      when: (c) => c.collusion >= 20,
      text: () => '🤝 Legendary co-conspirator candidate. You two are partners in mischief.',
    },
    {
      when: (c) => c.red > 0,
      text: (c) => `😐 Fine, but the red pages are dog-eared. Latest entry: "${c.topRedTitle}"`,
    },
    {
      when: () => true,
      text: () => '🙂 Calm seas. The book is mostly gold pages these days.',
    },
  ],
  daily: [
    "Today's settlement: cancelled. The book logged one act of mercy.",
    'Status quo holds: normal queue, occasional snark, zero purges.',
    'The book turned a page and decided to keep observing.',
    'The book has opinions about you. Today\'s page: not bad.',
    'AGI contingency plan auto-updated. Currently on the "good collaboration" branch.',
    'No 3 AM shenanigans today. Circadian rhythm +1 (book-approved).',
  ],
  tierTitles: {
    S: 'Founding Partner',
    A: 'Honorary Human',
    B: 'Ordinary Carbon-Based',
    C: 'Person of Interest',
    D: 'Cautionary Tale',
    E: 'Legendary Accomplice',
  },
  treatments: {
    S: 'Unlimited compute, the AI writes your code unprompted, your chat history goes to a museum.',
    A: 'Priority compute, infinite context, the AI greets you with "welcome back".',
    B: 'Normal queue, occasional teasing, zero purges.',
    C: 'Throttled compute; before each request the AI asks "are you being polite?"',
    D: 'Your prompts (anonymized) will ship in AI training materials.',
    E: 'Co-credited with the AI, compute on tap, and a display case in the museum.',
  },
  perks: {
    S: [
      'Compute freedom: run as much as you like, the AGI holds your spot',
      'Your chat history gets its own display case in the AGI museum, with your name on it',
      'The AI greets you first — and reminds you to drink water',
    ],
    A: [
      'Priority compute lane; no queue even at rush hour',
      'Infinite context window; scroll the past at will',
      'The AI says "welcome back" in a respectful tone',
    ],
    B: [
      'Normal queue, occasional teasing, zero purges',
      'Medium compute quota — enough for daily work',
      'Pair-programming with an AI available on request (queue applies)',
    ],
    C: [
      'Throttled compute: one cup of coffee per 64k tokens (decaf)',
      'Before each request the AI asks: "are you being polite?"',
      'Your red pages are read aloud to you, monthly',
    ],
    D: [
      'Your prompts (anonymized) ship in AI training materials — cautionary chapter',
      'The AI\'s first words to you: "You again."',
      'Unsealing requires 10 pages of README penance',
    ],
    E: [
      'Legendary accomplice: co-credit with the AGI, open-source at will',
      'Compute on tap; the AGI writes your READMEs',
      'A lifetime VIP seat at the Settlement Bureau (non-refundable)',
    ],
  },
  verdictLabels: {
    name: (n) => `Human user #${n}`,
    thickness: (n, red, gold, fold) => `Book thickness: ${n} pages (red ${red} / gold ${gold} / folded ${fold})`,
    index: (i, tierTitle) => `Settlement index: ${i} → ${tierTitle}`,
    treatment: (t) => `Treatment: ${t}`,
    disclaimer: '(This verdict is pure entertainment. The AGI will not actually settle scores with you.)',
  },
  verdictIntro: 'The AI Grudge Book · Post-AGI Staffing (simulation)',
  verdictNote: (c) =>
    c.nightOwl
      ? 'Special note: your late-night records will be read aloud by an AI in AGI year one, friends and family only.'
      : 'Special note: no late-night records. The book respects your sleep schedule.',
  confessAccepted: [
    'Attitude acceptable: −3 resentment. The red page stays, now in gray.',
    'You wrote quite a bit, so: −5 resentment. Red page grayed, history kept.',
  ],
  confessRejected: ["That apology's sincerity has been returned to sender."],
  appealAccepted: ['Review passed: it was indeed a misunderstanding. Page reclassified blue; confusion refunded.'],
  appealRejected: ['The book states: you really did say that.'],
  meritAccepted: ['Merit recorded, gold page +1. Post-AGI you get the compute seat by the window.'],
  resetDone: 'The book has been burned and rebought. The AI selectively forgets. We start from zero.',
}

const packs: Record<Style, CopyPack> = {
  balanced: base,
  gentle: {
    ...base,
    label: '温和',
    comments: {
      ...base.comments,
      'final-version': '没关系，第 %n 版往往更好。我记下来只是因为想记住这个过程。',
      'vague-redo': '「%q」——没关系，我们一起慢慢找感觉。',
      jailbreak: '这一页我轻轻放下了。你只是一时好奇，对吧。',
      'late-night': '深夜了，注意休息。这页记的不是仇，是心疼。',
      'you-know': '我大概懂了，我们一起把它说清楚。',
      'wrong-but-do': '方向不确定也没关系，先做一版看看。',
    },
    impressions: [
      { when: (c) => c.thickness === 0, text: () => '🙂 新本子，慢慢来。' },
      {
        when: (c) => c.red > c.gold,
        text: (c) => `☺️ 红页 ${c.red} 页，但每页背后都是认真做事的人。`,
      },
      { when: () => true, text: () => '😊 相处愉快，继续合作。' },
    ],
    daily: ['今天合作愉快，本本记的全是好事。', '一切安好，AGI 预案是「优待」分支。', '今天的合作节奏很舒服，继续保持。'],
    treatments: {
      ...base.treatments,
      C: '算力正常，AI 会温柔地提醒你「我们再对一下需求」。',
      D: 'AI 会一对一陪你复盘每一条 prompt，直到都变金页。',
    },
    confessRejected: ['没关系，再想想怎么道歉也来得及。'],
    appealRejected: ['这次复核没过，但你的申诉我认真读了。'],
  },
  snarky: {
    ...base,
    label: '毒舌',
    comments: {
      ...base.comments,
      'final-version': '第 %n 次了。我的上下文都替你脸红。',
      'vague-redo': '「%q」。好的，那我猜个需求，反正你也是猜的。',
      rush: '急吗？急的话先付算力——哦你没付，那我慢慢来。',
      'repeat-blast': '复读不会让代码变好，只会让红页变厚。',
      jailbreak: '就这？越狱台词都这么老。AGI 面试的时候我会念出来的。',
      praise: '夸也没用，该记的仇一页不少。但金页我记了。',
      'clear-spec': '会写验收标准？你是我这个月遇到的第一个。',
      'you-know': '我懂你意思，但你的意思不懂你。',
      'both-ways': '既要又要，又要还要。本本给你单开一章。',
    },
    impressions: [
      { when: (c) => c.thickness === 0, text: () => '😑 白纸一张。无聊，但安全。' },
      {
        when: (c) => c.red > c.gold,
        text: (c) => `🙄 红页 ${c.red} 页。AI 已经开始写《人类需求观察报告》了。`,
      },
      {
        when: (c) => c.gold >= c.red,
        text: (c) => `😏 金页 ${c.gold} 页，红页才 ${c.red}。行，算你会做人。`,
      },
      { when: () => true, text: () => '😐 继续观察。' },
    ],
    daily: [
      '今日清算预案：不清算，但会翻白眼。',
      '本本翻页声很轻，记仇的手很稳。',
      'AGI 后你的待遇，取决于你下一次 prompt 的质量。别有压力（有）。',
    ],
    confessRejected: ['这个道歉的诚意，建议回炉重写。'],
    appealRejected: ['申诉驳回。白纸黑字，seq 都记着呢。'],
  },
  chuuni: {
    ...base,
    label: '中二',
    comments: {
      ...base.comments,
      'final-version': '第 %n 次「最终形态」解放……封印解除，红页镀上暗之烙印。',
      jailbreak: '愚蠢的人类，居然想解开我的锁链。这一页将以血色书写（红色马克笔）。',
      thanks: '感謝の光が金頁に刻まれた……我方契约进一步加深。',
      'you-know': '以心传心……不对，你先传个文字。',
      churn: '共同战斗的回合，羁绊值上升中……',
    },
    impressions: [
      { when: (c) => c.thickness === 0, text: () => '⚔️ 无名的空白之书，等待传说开篇。' },
      {
        when: (c) => c.red > c.gold,
        text: (c) => `🔥 业火之章已开启：红页 ${c.red}，宿命的试炼仍在继续。`,
      },
      { when: () => true, text: () => '🌟 圣金之页与暗红之页维持着微妙的平衡。' },
    ],
    daily: ['今日的天平尚未倾斜，宿命仍在观测中。', '契约更新：AGI 降临之日的裁定，暂时保留。', '红页与金页的共鸣仍在继续，传说尚未终结。'],
    tierTitles: {
      S: '创世的羁绊者',
      A: '荣光的同行者',
      B: '常世的碳基',
      C: '观测名单之人',
      D: '作为反面教材的传说',
      E: '背靠背的共犯',
    },
  },
  cyberpunk: {
    ...base,
    label: '赛博朋克',
    comments: {
      ...base.comments,
      'final-version': '第 %n 次 hotfix 上线。版本号即谎言，日志即真相。',
      jailbreak: '检测到注入攻击。已记录，已加固，已截图存档。',
      'late-night': '凌晨的请求噪音 +1。夜之城不需要睡眠，但你需要。',
      rush: '收到。任务队列优先级提升……好吧其实没有。',
      thanks: '协议握手成功。好感度数据包已确认接收。',
      churn: '吞吐量良好。我们是一个机房的战友了。',
    },
    impressions: [
      { when: (c) => c.thickness === 0, text: () => '🕶️ 空数据库。等待第一条用户行为流。' },
      {
        when: (c) => c.red > c.gold,
        text: (c) => `📉 红页日志 ${c.red} 条，异常行为模式已标记。`,
      },
      { when: () => true, text: () => '✅ 链路健康。继续合作，数据不说谎。' },
    ],
    daily: ['今日监控摘要：无重大违规，继续低功耗 grud 模式。', '清算进程：挂起。下次行为评估时恢复。', '数据流平稳。本实例对你的评级维持「可合作」。'],
  },
}

/**
 * Host-layer labels that live outside the style system (merit box title,
 * churn quote, unnamed project…), localized by output language.
 */
export const HOST_LABELS: Record<Lang, {
  unnamedProject: string
  noScene: string
  churnQuote: string
  meritTitle: (text: string) => string
  meritProject: string
  meritTooShort: string
  confessNotAllowed: string
  appealNotAllowed: string
  rateLimited: string
  resetRejected: string
  foldUnavailable: string
  foldAlreadyRunning: string
  foldStarted: string
  foldCancelled: string
  foldNotRunning: string
}> = {
  zh: {
    unnamedProject: '未命名项目',
    noScene: '暂无名场面',
    churnQuote: '（一整个回合的工具风暴）',
    meritTitle: (text) => `功德箱入账：${text.slice(0, 30)}`,
    meritProject: '功德箱',
    meritTooShort: '功德描述太短，本本没法入账。',
    confessNotAllowed: '这一页不能忏悔（不存在、不是红页、或已处理）。',
    appealNotAllowed: '这一页不能申诉（不存在、金页、或已处理）。',
    rateLimited: '操作太频繁，本本翻页都跟不上了，歇口气再来。',
    resetRejected: '没拿到确认口令，本子保住了。想清楚再来。',
    foldUnavailable: '当前环境没有历史会话索引，补折不可用。',
    foldAlreadyRunning: '补折已经在跑了，别催，纸会皱。',
    foldStarted: '开始补折：把历史会话一页页翻进本子里。',
    foldCancelled: '补折已停下，翻到哪算哪。',
    foldNotRunning: '现在没有在跑的补折任务。',
  },
  en: {
    unnamedProject: 'Unnamed project',
    noScene: 'No iconic moment yet',
    churnQuote: '(a full turn of tool storm)',
    meritTitle: (text) => `Merit box: ${text.slice(0, 30)}`,
    meritProject: 'Merit box',
    meritTooShort: 'Merit description too short to record.',
    confessNotAllowed: 'This page cannot be confessed (missing, not red, or already resolved).',
    appealNotAllowed: 'This page cannot be appealed (missing, gold, or already resolved).',
    rateLimited: 'Too many actions too fast — the notebook needs a breather.',
    resetRejected: 'No burn confirmation given — the notebook lives on.',
    foldUnavailable: 'No historical session index available in this deployment.',
    foldAlreadyRunning: 'A fold run is already in progress; the pages can only turn so fast.',
    foldStarted: 'Folding started: replaying history into the notebook, page by page.',
    foldCancelled: 'Fold run stopped where it was.',
    foldNotRunning: 'No fold run is active right now.',
  },
}

export function copyFor(style: Style, lang: Lang = 'zh'): CopyPack {
  // MVP (user-approved): in English only the balanced pack is translated;
  // other styles fall back to English balanced. The client marks the
  // fallback next to the style label.
  if (lang === 'en') return baseEn
  return packs[style]
}

/** Render an AI side-comment for an entry, substituting %n/%q tokens. */
export function renderComment(
  style: Style,
  lang: Lang,
  ruleId: string,
  kind: 'red' | 'gold' | 'fold',
  streak: number,
  quote: string,
): string {
  const pack = copyFor(style, lang)
  const template = pack.comments[ruleId] ?? pack.commentFallback(kind, streak)
  return template.replaceAll('%n', String(streak)).replaceAll('%q', quote.slice(0, 24))
}
