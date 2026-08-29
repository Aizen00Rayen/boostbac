import React, { createContext, useContext } from "react";

// BoostBac is Algerian-Darja-only by product decision — no English/French UI toggle.
// Every string below is written in Algerian Derja (colloquial Algerian Arabic), NOT
// Modern Standard Arabic — e.g. "راك"/"راهي" continuous markers, "واش/كيفاش/علاش"
// question words, "باش/خاص/غادي" markers, "تاع" possessive, "بزاف/مليح/خلاص"
// everyday vocabulary. The target audience is Algerian Bac students, not a Modern
// Standard Arabic readership. Question/answer CONTENT captured from a student's own
// exercise sheet keeps whatever language that sheet was written in (often French for
// math/physics) — this file only covers the app's own interface chrome.
const STRINGS: Record<string, string> = {
  // generic
  appName: "بوستباك",
  continue: "كمّل",
  save: "خزّن",
  cancel: "تراجع",
  delete: "مسح",
  retry: "عاود المحاولة",
  loading: "راهي تحمّل…",
  done: "خلاص",
  next: "التالي",
  back: "رجوع",

  // onboarding / auth
  tagline: "قرا بالفهامة، قرّب لنجاح الباك.",
  getStarted: "يالله بينا",
  login: "دخول",
  signup: "عمل حساب",
  name: "الاسم",
  email: "الإيميل",
  password: "الباسوورد",
  haveAccount: "عندك حساب؟ دخل من هنا",
  noAccount: "ماعندكش حساب؟ عمل واحد",
  fillRequired: "خاصك تعمر كل الخانات",
  errorGeneric: "صرا خطأ، عاود حاول",
  errorInvalidCredentials: "الإيميل ولا الباسوورد غالط",
  errorEmailTaken: "هاد الإيميل مستعمل من قبل",
  errorTimeout: "الوقت طوّل برشا، عاود حاول",
  errorNoQuestions: "ما لقيناش أسئلة فالصورة، حاول بصورة أوضح",
  offline: "ماكاش نت — عاود حاول",

  // streams
  stream: "الشعبة",
  stream_math: "بك رياضيات",
  stream_science: "بك علوم تجريبية",
  stream_tech: "بك تقني رياضي",
  stream_management: "بك تسيير واقتصاد",
  stream_letters: "بك آداب وفلسفة",
  stream_languages: "بك لغات أجنبية",

  // onboarding wizard
  onboardHeyTitle: "أهلا! أنا بو 👋",
  onboardHeySubtitle: "رفيقك فالقراية. يالله نشوفو كيفاش تقرا مليح باش نوصلو للباك زوج.",
  onboardStart: "يالله بينا",
  onboardNameTitle: "شنو نسميك؟",
  onboardNamePlaceholder: "اسمك الحقيقي",
  onboardNicknamePlaceholder: "شنو يسميوك صحابك؟ (اختياري)",
  onboardStreamTitle: "على شنو راك تقرا؟",
  onboardTimeTitle: "وقتاش يخدم مخك بصح؟",
  timePref_morning: "صباحي",
  timePref_night: "ليلي",
  timePref_flexible: "يفرق من نهار لنهار",
  onboardPainTitle: "واش يوقفك عادة؟",
  onboardPainSubtitle: "تقدر تختار بزاف",
  pain_forget: "ننسى اللي قريت",
  pain_start: "ما نعرفش نبدا منين",
  pain_avoid: "نتجنب المواد الصعيبة",
  pain_repeat: "نعاود نفس الغلطة",
  pain_consistency: "ما عنديش انتظام فالقراية",
  onboardGoalTitle: "حاجة اخيرة. واش تحب تحسن فيه؟",
  goal_remembering: "التذكر",
  goal_understanding: "الفهم",
  goal_consistency: "الانتظام",
  goal_confidence: "الثقة فروحي",
  onboardFinish: "يالله نبدأو",

  // tabs
  tab_home: "الرئيسية",
  tab_study: "قراية",
  tab_you: "أنت",

  // home
  homeZeroTitle: "خريطة القرايتك تبدا هنا",
  homeZeroBody: "خريطة القرايتك راهي فارغة درك. كي تبدا تصور التمارين وتحل الكويزات، الخريطة راح تكبر باش توجهك للنجاح.",
  homeZeroCta: "صوّر أوّل تمرين",
  homeGreeting: "أهلا بيك!",
  homeDueSubtitle: "عندك {n} تمارين للمراجعة",
  homeDueSubtitleZero: "ماكاش تمارين للمراجعة درك",
  homeStatusCardTitle: "كيفاش راك تمشي؟",
  homeStartReview: "ابدأ المراجعة",
  homeCaptureNew: "صور تمرين جديد",
  homePoints: "نقاط",

  // study — capture
  studyCaptureHint: "صوّر التمرين كامل، خلي الإضاءة مليحة",
  studyCaptureGallery: "من الصور",
  studyCaptureShoot: "طلع صورة",
  studyCaptureHintField: "قول لينا على أي مادة (اختياري)",
  studyCaptureAddPage: "زيد صفحة",
  studyCaptureMaxPages: "توصلت للحد الأقصى ديال الصفحات",
  studyCaptureMultiPage: "التمرين موزع على بزاف صفحات؟ صوّرهم بالتوالي",
  studyCameraPermission: "خاصنا الإذن للكاميرا باش نصوروا التمرين",
  studyGrantPermission: "عطي الإذن",
  studyOpenSettings: "حل الإعدادات",
  studyGenerateCta: "طلع الأسئلة",

  // study — processing
  studyProcessingTitle: "رانا نقسموا الصفحة لأسئلة…",
  studyProcessingBody: "اصبر شوية، رانا نحضرو ليك كل سؤال وحدو باش تقدر تحاول فيه بروحك.",
  studyProcessingLoader: "استخراج المفاهيم…",

  // study — question only
  studyQuestionProgress: "السؤال {i} من {n}",
  studyContextLink: "السياق: صفحة التمرين الأصلية",
  studySolvedIt: "حليتها",
  studyTakeYourTime: "خد وقتك، ماكاش حاجة تستعجل فيها",

  // study — reveal & report
  solutionTitle: "الحل",
  howWasIt: "كيفاش كانت النتيجة؟",
  gotItRight: "جبتها صحيحة",
  gotItWrong: "غلطت فيها",
  needsReviewNote: "هاذي أحسن إجابة عندنا — راجعها مع الدرس تاعك إذا مامتأكدش",

  // study — mistake reason
  mistakeTitle: "واش صرا؟",
  mistakeSubtitle: "كون صريح — هذا يعاون بو باش يلقالك أحسن طريقة للمراجعة",
  mistake_concept: "ما فهمتش المفهوم",
  mistake_formula: "نسيت القاعدة",
  mistake_procedure: "استعملت طريقة غالطة",
  mistake_calculation: "غلطت فالحساب",
  mistake_calculator: "غلطت فاستعمال الآلة الحاسبة",
  mistake_rushed: "زربت",

  // review
  reviewBadgeOriginal: "مراجعة: تمرين أصلي",
  reviewBadgeConceptProbe: "مراجعة: مفهوم",
  reviewBadgeFormulaProbe: "مراجعة: قاعدة",
  reviewBadgeProcedureProbe: "مراجعة: طريقة",
  reviewBadgeCalculationProbe: "مراجعة: حساب",
  reviewBadgeCalculatorProbe: "مراجعة: آلة حاسبة",
  reviewQuestionProgress: "سؤال {i} من {n}",
  reviewDone: "برافو! كملت المراجعة",
  reviewDoneSummary: "{correct} صحاح، {redo} لازم تعاودهم",
  reviewCorrectStat: "صحاح",
  reviewRedoStat: "للإعادة",
  reviewBackHome: "رجوع للرئيسية",
  reviewEmptyTitle: "ماكاش تمارين للمراجعة",
  reviewEmptySubtitle: "صوّر تمرين جديد باش تبدا تجمع مواد للمراجعة",

  // test
  testTitle: "امتحانات مخصصة",
  testQuickTitle: "اختبار سريع",
  testQuickBadge: "{n} سؤال",
  testSubjectTitle: "اختبار المادة",
  testSubjectSub: "ركز على وحدة، مثلا رياضيات ولا فلسفة",
  testWeakTitle: "نقاط الضعف",
  testWeakLocked: "مازال ما كملشيش بيانات كافية لهاد النوع درك. اختبارات نقاط الضعف يقدرو يعاونوك تكتشف واش لازم تركز أكثر.",
  testMixedTitle: "اختبار مخلط",
  testMixedSub: "محاكاة للباك. أسئلة من كل المقررات باش تشوف وين راك كامل وصح",
  testChooseSubject: "اختار المادة",
  testStart: "بدا الاختبار",
  testQuestionProgress: "سؤال {i} من {n}",
  testChooseAnswer: "اختار الإجابة الصحيحة من الخيارات التالية:",
  testResultsTitle: "النتيجة تاعك",
  testResultsSubtitle: "كملت التست، هاذي نتيجتك",
  testOnTrack: "راك في الطريق الصحيح! 💪",
  testImprovedIn: "تحسنت في:",
  testStillWeakIn: "مازال عندك نقص في:",
  testFinish: "تم",

  // you / progress
  youZeroGreeting: "أهلا بيك",
  youZeroSubtitle: "الملف تاعك راهو جديد، ابدأ تقرا باش نبدأو نجمعو الإحصائيات",
  youZeroCardTitle: "خريطة الدراسة راهي فارغة حاليا",
  youZeroCardBody: "مازال ما بديتش بأي تمارين. ابدا بتصوير أول تمرين ولا اختبار قصير كي تجمع بيانات.",
  youStartNow: "ابدا الآن",
  youStudyTimeTitle: "وقت الدراسة",
  youStudyTimeEmpty: "مازال ما عندناش وقت مسجل باش نوريوه هنا",
  youStrengthsTitle: "نقاط القوة والضعف",
  youStrengthsEmpty: "أكمل شوية تمارين حتى نكتشفو نقاط القوة والضعف تاعك",
  youMistakePatternsTitle: "أنماط الأخطاء",
  youMistakePatternsEmpty: "راح نوريولك هنا وين راك دايما تغلط باش تحسن فيها",
  youWeeklyTitle: "أدائك هذا الأسبوع",
  youStreakDays: "{n} أيام متتالية",
  youProgressCardTitle: "تطور ملحوظ!",
  youProgressCardBody: "عمل ممتاز! لقد حصلت {correct} من {total} نقطة تحسن في {subject} هذا الشهر. استمر بهاذ الرِّتم للامتحان النهائي.",
  youPulseTitle: "نبض المواد (آخر 5 اختبارات)",
  youRecurringTitle: "أخطاء متكررة تحتاج مراجعة",

  // library
  libraryTitle: "تمارين صورتهم",
  librarySubtitle: "أرشيف التمارين اللي صورتهم باش تحلهم",
  libraryFilterAll: "الكل",
  libraryQuestionsDone: "{done}/{total} أسئلة كاملة",
  libraryEmpty: "ماكاين حتى تمرين متصور توا",

  // admin
  adminPanel: "لوحة الإدارة",
  adminStudents: "طلاب",
  adminExercises: "تمارين متصورة",
  adminQuestionsAnswered: "أسئلة تجاوبت",
  adminTestsTaken: "اختبارات صارت",
  logout: "خروج",
};

type Ctx = {
  isRTL: boolean;
  t: (key: keyof typeof STRINGS | string, vars?: Record<string, string | number>) => string;
  ready: boolean;
};

const I18nContext = createContext<Ctx>({} as Ctx);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const t = (key: string, vars?: Record<string, string | number>) => {
    const entry = STRINGS[key];
    if (!entry) return key;
    return interpolate(entry, vars);
  };

  return <I18nContext.Provider value={{ isRTL: true, t, ready: true }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

// Casual Algerian Derja encouragement shown during review sessions.
export const DERJA_CHEERS = [
  "صح راك تقدّم! 💪",
  "برافو عليك، واصل!",
  "هكذا خويا، مليح بزاف!",
  "راك تكسّر، كمّل!",
  "يا الوحش! 🔥",
  "شطارة! باقي شويّة",
  "نعم! راك في السكّة",
  "واو، حافظ على الرِّيتم!",
];

export function randomCheer(): string {
  return DERJA_CHEERS[Math.floor(Math.random() * DERJA_CHEERS.length)];
}

export const MISTAKE_REASONS = ["concept", "formula", "procedure", "calculation", "calculator", "rushed"] as const;
export type MistakeReason = (typeof MISTAKE_REASONS)[number];

export const PAIN_POINTS = ["forget", "start", "avoid", "repeat", "consistency"] as const;
export const PAIN_POINT_KEY: Record<string, string> = {
  forget: "forget_what_i_study",
  start: "dont_know_where_to_start",
  avoid: "avoid_hard_subjects",
  repeat: "repeat_mistakes",
  consistency: "no_consistency",
};

export const GOALS = ["remembering", "understanding", "consistency", "confidence"] as const;
export const TIME_PREFS = ["morning", "night", "flexible"] as const;
