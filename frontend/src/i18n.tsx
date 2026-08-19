import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type Lang = "ar" | "fr";

// All "ar" values below are written in Algerian Derja (colloquial Algerian
// Arabic), NOT Modern Standard Arabic — e.g. "راك"/"راهي" continuous markers,
// "واش/كيفاش/علاش" question words, "باش/خاص/غادي" markers, "تاع" possessive,
// "بزاف/مليح/خلاص" everyday vocabulary. This matches how the DERJA_CHEERS
// below already read, and is deliberate: the target audience is Algerian
// students, not a Modern Standard Arabic readership.
const STRINGS: Record<string, { ar: string; fr: string }> = {
  // generic
  appName: { ar: "بوستباك", fr: "BoostBac" },
  continue: { ar: "كمّل", fr: "Continuer" },
  save: { ar: "خزّن", fr: "Enregistrer" },
  cancel: { ar: "تراجع", fr: "Annuler" },
  delete: { ar: "مسح", fr: "Supprimer" },
  retry: { ar: "عاود المحاولة", fr: "Réessayer" },
  loading: { ar: "راهي تحمّل…", fr: "Chargement…" },
  done: { ar: "خلاص", fr: "Terminé" },
  // onboarding / auth
  chooseLanguage: { ar: "اختار لغتك", fr: "Choisis ta langue" },
  tagline: { ar: "قرا بالفهامة، قرّب لنجاح الباك.", fr: "Révise malin. Réussis ton Bac." },
  getStarted: { ar: "يالله بينا", fr: "Commencer" },
  login: { ar: "دخول", fr: "Connexion" },
  signup: { ar: "عمل حساب", fr: "S'inscrire" },
  name: { ar: "الاسم", fr: "Nom" },
  email: { ar: "الإيميل", fr: "E-mail" },
  password: { ar: "الباسوورد", fr: "Mot de passe" },
  haveAccount: { ar: "عندك حساب؟ دخل من هنا", fr: "Déjà un compte ? Se connecter" },
  noAccount: { ar: "ماعندكش حساب؟ عمل واحد", fr: "Pas de compte ? S'inscrire" },
  continueGoogle: { ar: "كمّل بجوجل", fr: "Continuer avec Google" },
  or: { ar: "أو", fr: "ou" },
  stream: { ar: "الشعبة", fr: "Filière" },
  fillRequired: { ar: "خاصك تعمر كل الخانات", fr: "Merci de remplir tous les champs" },
  errorGeneric: { ar: "صرا خطأ، عاود حاول", fr: "Une erreur est survenue, réessaie" },
  errorInvalidCredentials: { ar: "الإيميل ولا الباسوورد غالط", fr: "E-mail ou mot de passe incorrect" },
  errorEmailTaken: { ar: "هاد الإيميل مستعمل من قبل", fr: "Cet e-mail est déjà utilisé" },
  errorTimeout: { ar: "الوقت طوّل برشا، عاود حاول", fr: "Ça prend trop de temps, réessaie" },
  errorNoExercises: { ar: "ما لقيناش تمارين فالصورة، حاول بصورة أوضح", fr: "Aucun exercice trouvé, essaie une photo plus nette" },
  // streams
  stream_math: { ar: "رياضيات", fr: "Mathématiques" },
  stream_science: { ar: "علوم تجريبية", fr: "Sciences" },
  stream_tech: { ar: "تقني رياضي", fr: "Technique" },
  stream_management: { ar: "تسيير واقتصاد", fr: "Gestion" },
  stream_letters: { ar: "آداب وفلسفة", fr: "Lettres" },
  stream_languages: { ar: "لغات أجنبية", fr: "Langues" },
  // tabs
  home: { ar: "الرئيسية", fr: "Accueil" },
  dashboard: { ar: "التحليلات", fr: "Stats" },
  exams: { ar: "الامتحانات", fr: "Examens" },
  profile: { ar: "حسابي", fr: "Profil" },
  // home
  todayReview: { ar: "مراجعة اليوم", fr: "Révision du jour" },
  cardsDue: { ar: "بطاقة للمراجعة", fr: "cartes dues" },
  dailyGoal: { ar: "الهدف اليومي", fr: "Objectif du jour" },
  streak: { ar: "أيام متتالية", fr: "Série" },
  startReview: { ar: "بدا المراجعة", fr: "Démarrer" },
  scanNotes: { ar: "صوّر دروسك", fr: "Scanner mes notes" },
  scanGenerate: { ar: "صوّر واعمل بطاقات", fr: "Scanner & Générer" },
  yourDecks: { ar: "الحزم تاعك", fr: "Tes paquets" },
  queueClear: { ar: "ماكانش مراجعة اليوم! 🎉", fr: "Rien à réviser aujourd'hui ! 🎉" },
  queueClearSub: { ar: "صوّر درس جديد باش تعمل بطاقات", fr: "Scanne un cours pour créer des cartes" },
  noDecks: { ar: "ماكاين حتى حزمة توا", fr: "Aucun paquet pour l'instant" },
  review: { ar: "مراجعة", fr: "Réviser" },
  mastered: { ar: "متقن", fr: "maîtrisées" },
  // review session
  tapToReveal: { ar: "دوس باش تشوف الجواب", fr: "Touche pour révéler" },
  rateRecall: { ar: "كيفاش تذكّرت؟", fr: "Ton rappel ?" },
  again: { ar: "نعاودها", fr: "À revoir" },
  hard: { ar: "صعيب", fr: "Difficile" },
  good: { ar: "مليح", fr: "Bien" },
  easy: { ar: "سهل", fr: "Facile" },
  sessionComplete: { ar: "برافو! خلّصت الجلسة", fr: "Bravo ! Session terminée" },
  cardsReviewed: { ar: "بطاقة تراجعت", fr: "cartes révisées" },
  accuracy: { ar: "الدقة", fr: "Précision" },
  xpEarned: { ar: "نقاط ربحتها", fr: "XP gagnés" },
  backHome: { ar: "روح للرئيسية", fr: "Retour à l'accueil" },
  // scan
  scanTitle: { ar: "صوّر درسك", fr: "Scanne ton cours" },
  takePhoto: { ar: "خذ تصويرة", fr: "Prendre une photo" },
  fromGallery: { ar: "من الصور", fr: "Depuis la galerie" },
  generating: { ar: "الذكاء الاصطناعي راهو يقرا درسك…", fr: "L'IA lit ton cours…" },
  reviewCards: { ar: "شوف البطاقات قبل ما تخزّن", fr: "Vérifie avant d'enregistrer" },
  saveDeck: { ar: "خزّن الحزمة", fr: "Enregistrer le paquet" },
  cameraPermission: { ar: "خاصنا الإذن للكاميرا باش نصوروا دروسك", fr: "Accès caméra requis pour scanner" },
  grantPermission: { ar: "عطي الإذن", fr: "Autoriser" },
  openSettings: { ar: "حل الإعدادات", fr: "Ouvrir les réglages" },
  question: { ar: "السؤال", fr: "Question" },
  answer: { ar: "الجواب", fr: "Réponse" },
  addPage: { ar: "زيد صفحة", fr: "Ajouter une page" },
  pagesReady: { ar: "صفحة زدتها", fr: "page(s) ajoutée(s)" },
  generateCards: { ar: "طلع البطاقات", fr: "Générer les cartes" },
  removePage: { ar: "احذف", fr: "Retirer" },
  scanHintPlaceholder: { ar: "قول لينا على أي مادة (اختياري)", fr: "Précise la matière (optionnel)" },
  maxPagesReached: { ar: "توصلت للحد الأقصى ديال الصفحات", fr: "Nombre maximum de pages atteint" },
  multiPageHint: { ar: "التمرين موزع على بزاف صفحات؟ صوّرهم بالتوالي ثم اضغط طلع البطاقات", fr: "Exercice sur plusieurs pages ? Prends-les dans l'ordre puis génère" },
  // dashboard
  weaknessMap: { ar: "نقاط الضعف تاعك", fr: "Carte des faiblesses" },
  forgettingCurve: { ar: "منحنى النسيان", fr: "Courbe d'oubli" },
  focusToday: { ar: "ركّز اليوم على", fr: "À travailler aujourd'hui" },
  overallAccuracy: { ar: "الدقة الإجمالية", fr: "Précision globale" },
  totalReviews: { ar: "مراجعة", fr: "révisions" },
  noAnalytics: { ar: "ماكاين حتى معلومة توا", fr: "Pas encore de données" },
  noAnalyticsSub: { ar: "خلّص جلسة مراجعة باش تشوف تقدمك", fr: "Termine une session pour voir tes stats" },
  weak: { ar: "ضعيف", fr: "Faible" },
  strong: { ar: "قوي", fr: "Fort" },
  // exams
  mockExam: { ar: "اختبار تجريبي", fr: "Examen blanc" },
  mockExamSub: { ar: "أسئلة من النقاط لي راك ضعيف فيها", fr: "Questions ciblées sur tes faiblesses" },
  startExam: { ar: "بدا الاختبار", fr: "Démarrer l'examen" },
  questionsCount: { ar: "عدد الأسئلة", fr: "Nombre de questions" },
  examResults: { ar: "نتائج الاختبار", fr: "Résultats" },
  score: { ar: "النتيجة", fr: "Score" },
  breakdown: { ar: "التفصيل حسب المادة", fr: "Détail par matière" },
  showAnswer: { ar: "وري الجواب", fr: "Voir la réponse" },
  gotIt: { ar: "جاوبت مليح", fr: "Réussi" },
  missedIt: { ar: "غلطت", fr: "Manqué" },
  history: { ar: "السجل", fr: "Historique" },
  noExams: { ar: "ماكاين حتى اختبار توا", fr: "Aucun examen passé" },
  time: { ar: "الوقت", fr: "Temps" },
  // profile
  targetStream: { ar: "الشعبة تاعك", fr: "Filière visée" },
  totalXP: { ar: "مجموع النقاط", fr: "XP total" },
  cardsMastered: { ar: "بطاقات متقنة", fr: "Cartes maîtrisées" },
  longestStreak: { ar: "أطول سلسلة", fr: "Meilleure série" },
  language: { ar: "اللغة", fr: "Langue" },
  logout: { ar: "خروج", fr: "Déconnexion" },
  editGoal: { ar: "الهدف اليومي (بطاقات)", fr: "Objectif quotidien (cartes)" },
  member: { ar: "طالب في بوستباك", fr: "Étudiant BoostBac" },
  // badges
  badges: { ar: "الميداليات", fr: "Badges" },
  badge_first_deck: { ar: "أول حزمة", fr: "1er paquet" },
  badge_streak_3: { ar: "سلسلة 3 أيام", fr: "Série de 3" },
  badge_streak_7: { ar: "سلسلة 7 أيام", fr: "Série de 7" },
  badge_streak_30: { ar: "سلسلة 30 يوم", fr: "Série de 30" },
  badge_reviews_50: { ar: "50 مراجعة", fr: "50 révisions" },
  badge_reviews_200: { ar: "200 مراجعة", fr: "200 révisions" },
  badge_mastered_10: { ar: "10 متقنة", fr: "10 maîtrisées" },
  badge_mastered_50: { ar: "50 متقنة", fr: "50 maîtrisées" },
  badge_mastered_100: { ar: "100 متقنة", fr: "100 maîtrisées" },
  badge_xp_500: { ar: "500 نقطة", fr: "500 XP" },
  // reminders
  reminders: { ar: "تذكيرات المراجعة", fr: "Rappels de révision" },
  remindersSub: { ar: "تذكير مليح كل يوم في 6 تع العشية", fr: "Un rappel doux chaque jour à 18h" },
  enable: { ar: "شغّل", fr: "Activer" },
  enabled: { ar: "شغّالة", fr: "Activés" },
  notifDenied: { ar: "شغّل الإشعارات من الإعدادات", fr: "Active les notifications dans les réglages" },
  // offline
  offline: { ar: "ماكاش نت — نزامنو من بعد", fr: "Hors ligne — synchro plus tard" },
  synced: { ar: "تزامنت المراجعات تاعك", fr: "Révisions synchronisées" },
  // pdf
  pdfUpload: { ar: "رفع PDF", fr: "Importer un PDF" },
  // notification content
  notifTitle: { ar: "وقت المراجعة وصل! 🛩️", fr: "C'est l'heure de réviser ! 🛩️" },
  notifBody: { ar: "البطاقات تاعك راهم يستناوك. حافظ على السلسلة تاعك!", fr: "Tes cartes t'attendent. Garde ta série !" },
  reminderTime: { ar: "وقت التذكير", fr: "Heure du rappel" },
  // badge celebration
  badgeUnlocked: { ar: "ميدالية جديدة! 🎉", fr: "Badge débloqué ! 🎉" },
  tapContinue: { ar: "دوس باش تكمّل", fr: "Touche pour continuer" },
  // share
  shareProgress: { ar: "شارك التقدم تاعك", fr: "Partager mes progrès" },
  shareMessage: { ar: "راني نراجع للباك مع بوستباك! 🛩️", fr: "Je révise mon Bac avec BoostBac ! 🛩️" },
  // leaderboard
  leaderboard: { ar: "الترتيب", fr: "Classement" },
  weeklyRanking: { ar: "ترتيب الأسبوع", fr: "Classement de la semaine" },
  weeklyXP: { ar: "نقاط الأسبوع", fr: "XP cette semaine" },
  yourRank: { ar: "ترتيبك", fr: "Ton rang" },
  players: { ar: "لاعب", fr: "joueurs" },
  noLeaderboard: { ar: "كون أول واحد يجمع النقاط هاد الأسبوع!", fr: "Sois le premier à marquer cette semaine !" },
  rankHint: { ar: "راجع البطاقات تاعك باش تطلع في الترتيب", fr: "Révise pour grimper au classement" },
  // role
  role: { ar: "أنا", fr: "Je suis" },
  iAmStudent: { ar: "طالب", fr: "Élève" },
  iAmTeacher: { ar: "أستاذ", fr: "Enseignant" },
  // pending teacher
  pendingTitle: { ar: "راهي تنتظر الموافقة", fr: "En attente de validation" },
  pendingSub: { ar: "الحساب تاعك كأستاذ راه تحت المراجعة من طرف الإدارة. غادي نعلموك كي توافق.", fr: "Ton compte enseignant est en cours de validation par l'administration." },
  rejectedTitle: { ar: "ماوافقوش على الحساب", fr: "Compte non approuvé" },
  refreshStatus: { ar: "حدّث الحالة", fr: "Actualiser" },
  // admin
  adminPanel: { ar: "لوحة الإدارة", fr: "Administration" },
  pendingTeachers: { ar: "أساتذة في الانتظار", fr: "Enseignants en attente" },
  approve: { ar: "وافق", fr: "Approuver" },
  reject: { ar: "رفض", fr: "Rejeter" },
  noPending: { ar: "ماكاين حتى طلب", fr: "Aucune demande en attente" },
  students: { ar: "طلاب", fr: "Élèves" },
  approvedT: { ar: "أساتذة", fr: "Enseignants" },
  posts_count: { ar: "منشورات", fr: "Publications" },
  // community
  community: { ar: "المجتمع", fr: "Communauté" },
  posts: { ar: "المنشورات", fr: "Publications" },
  teachers: { ar: "الأساتذة", fr: "Enseignants" },
  messages: { ar: "الرسائل", fr: "Messages" },
  myPosts: { ar: "منشوراتي", fr: "Mes publications" },
  createPost: { ar: "منشور جديد", fr: "Nouvelle publication" },
  postType: { ar: "النوع", fr: "Type" },
  type_exam: { ar: "امتحان", fr: "Examen" },
  type_exercise: { ar: "تمرين", fr: "Exercice" },
  type_solution: { ar: "حل", fr: "Solution" },
  subjectField: { ar: "المادة", fr: "Matière" },
  titleField: { ar: "العنوان", fr: "Titre" },
  descField: { ar: "الوصف / المحتوى", fr: "Description / Contenu" },
  attachImage: { ar: "زيد صورة", fr: "Joindre une image" },
  attachPdf: { ar: "زيد PDF", fr: "Joindre un PDF" },
  attached: { ar: "تزادت ✓", fr: "Joint ✓" },
  publish: { ar: "نشر", fr: "Publier" },
  openAttachment: { ar: "حل الملف", fr: "Ouvrir la pièce jointe" },
  message_teacher: { ar: "هدر مع الأستاذ", fr: "Contacter" },
  typeMessage: { ar: "كتب الرسالة تاعك…", fr: "Écris un message…" },
  noPosts: { ar: "ماكاين حتى منشور توا", fr: "Aucune publication" },
  noTeachers: { ar: "ماكاين حتى أستاذ توا", fr: "Aucun enseignant" },
  noConversations: { ar: "ماكاين حتى محادثة توا", fr: "Aucune conversation" },
  filterAll: { ar: "الكل", fr: "Tout" },
  // exam countdown
  daysToExam: { ar: "يوم حتى الباك", fr: "jours avant le Bac" },
  setExamDate: { ar: "حدّد تاريخ الباك", fr: "Définir la date du Bac" },
  examDate: { ar: "تاريخ الباك", fr: "Date du Bac" },
  pacePrefix: { ar: "راجع", fr: "Révise" },
  paceSuffix: { ar: "بطاقة/يوم باش تكون جاهز", fr: "cartes/jour pour être prêt" },
  examToday: { ar: "اليوم يوم الباك! ربي معاك 🛩️", fr: "C'est le jour J ! Bonne chance 🛩️" },
  back: { ar: "رجوع", fr: "Retour" },
  // learning path
  subject_mathematiques: { ar: "رياضيات", fr: "Mathématiques" },
  subject_physique: { ar: "علوم فيزيائية", fr: "Sciences Physiques" },
  subject_svt: { ar: "علوم طبيعية", fr: "SVT" },
  yourPaths: { ar: "المسار تاعك", fr: "Ton parcours" },
  chapterLocked: { ar: "صوّر درس لهاد الفصل باش تفتحه", fr: "Scanne un cours pour débloquer ce chapitre" },
  chapterReady: { ar: "جاهز للمراجعة", fr: "Prêt à réviser" },
  chapterMastered: { ar: "متقن ✓", fr: "Maîtrisé ✓" },
  startLesson: { ar: "بدا الدرس", fr: "Commencer" },
  scanForChapter: { ar: "صوّر لهاد الفصل", fr: "Scanner pour ce chapitre" },
  chapterFor: { ar: "لهاد الفصل", fr: "pour ce chapitre" },
  assignChapter: { ar: "الفصل (اختياري)", fr: "Chapitre (optionnel)" },
  noChapter: { ar: "بلا فصل محدد", fr: "Aucun chapitre" },
  // lesson / games
  quizInstruction: { ar: "اختار الجواب الصحيح", fr: "Choisis la bonne réponse" },
  matchInstruction: { ar: "وصّل كل سؤال بجوابه", fr: "Associe chaque question à sa réponse" },
  blankInstruction: { ar: "كمّل الجملة", fr: "Complète la phrase" },
  correctAnswer: { ar: "صحيح! 🎉", fr: "Correct ! 🎉" },
  wrongAnswer: { ar: "ماشي هادي، عاود حاول", fr: "Pas tout à fait, réessaie" },
  lessonComplete: { ar: "برافو! خلّصت الدرس", fr: "Bravo ! Leçon terminée" },
  continuePath: { ar: "كمّل المسار", fr: "Continuer le parcours" },
  yourTurn: { ar: "دورك", fr: "À toi de jouer" },
  resourceNotFound: { ar: "المحتوى ماكاينش", fr: "Contenu introuvable" },
};

// Casual Algerian Derja encouragement — shown during reviews regardless of UI language.
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

export const DERJA_SESSION_DONE = "مبروك! درت خدمة نظيفة اليوم 🛩️";

export function randomCheer(): string {
  return DERJA_CHEERS[Math.floor(Math.random() * DERJA_CHEERS.length)];
}

type Ctx = {
  lang: Lang;
  isRTL: boolean;
  t: (key: keyof typeof STRINGS | string) => string;
  setLang: (l: Lang) => void;
  ready: boolean;
};

const I18nContext = createContext<Ctx>({} as Ctx);
const LANG_KEY = "boostbac_lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = (await storage.getItem<string>(LANG_KEY, "ar")) as Lang;
      if (saved === "ar" || saved === "fr") setLangState(saved);
      setReady(true);
    })();
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.setItem(LANG_KEY, l);
  }, []);

  const t = useCallback(
    (key: string) => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return entry[lang] ?? entry.fr;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, isRTL: lang === "ar", t, setLang, ready }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
