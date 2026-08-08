import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type Lang = "ar" | "fr";

const STRINGS: Record<string, { ar: string; fr: string }> = {
  // generic
  appName: { ar: "بوست باك", fr: "BoostBac" },
  continue: { ar: "متابعة", fr: "Continuer" },
  save: { ar: "حفظ", fr: "Enregistrer" },
  cancel: { ar: "إلغاء", fr: "Annuler" },
  delete: { ar: "حذف", fr: "Supprimer" },
  retry: { ar: "إعادة المحاولة", fr: "Réessayer" },
  loading: { ar: "جارٍ التحميل…", fr: "Chargement…" },
  done: { ar: "تم", fr: "Terminé" },
  // onboarding / auth
  chooseLanguage: { ar: "اختر لغتك", fr: "Choisis ta langue" },
  tagline: { ar: "راجع بذكاء. اقترب من الباك.", fr: "Révise malin. Réussis ton Bac." },
  getStarted: { ar: "لنبدأ", fr: "Commencer" },
  login: { ar: "تسجيل الدخول", fr: "Connexion" },
  signup: { ar: "إنشاء حساب", fr: "S'inscrire" },
  name: { ar: "الاسم", fr: "Nom" },
  email: { ar: "البريد الإلكتروني", fr: "E-mail" },
  password: { ar: "كلمة المرور", fr: "Mot de passe" },
  haveAccount: { ar: "لديك حساب؟ سجّل الدخول", fr: "Déjà un compte ? Se connecter" },
  noAccount: { ar: "ليس لديك حساب؟ أنشئ واحدًا", fr: "Pas de compte ? S'inscrire" },
  continueGoogle: { ar: "المتابعة عبر جوجل", fr: "Continuer avec Google" },
  or: { ar: "أو", fr: "ou" },
  stream: { ar: "الشعبة", fr: "Filière" },
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
  exams: { ar: "اختبارات", fr: "Examens" },
  profile: { ar: "حسابي", fr: "Profil" },
  // home
  todayReview: { ar: "مراجعة اليوم", fr: "Révision du jour" },
  cardsDue: { ar: "بطاقة مستحقة", fr: "cartes dues" },
  dailyGoal: { ar: "الهدف اليومي", fr: "Objectif du jour" },
  streak: { ar: "أيام متتالية", fr: "Série" },
  startReview: { ar: "ابدأ المراجعة", fr: "Démarrer" },
  scanNotes: { ar: "امسح دروسك", fr: "Scanner mes notes" },
  scanGenerate: { ar: "امسح وأنشئ بطاقات", fr: "Scanner & Générer" },
  yourDecks: { ar: "مجموعاتك", fr: "Tes paquets" },
  queueClear: { ar: "لا مراجعات اليوم! 🎉", fr: "Rien à réviser aujourd'hui ! 🎉" },
  queueClearSub: { ar: "امسح درسًا جديدًا لإنشاء بطاقات", fr: "Scanne un cours pour créer des cartes" },
  noDecks: { ar: "لا توجد مجموعات بعد", fr: "Aucun paquet pour l'instant" },
  review: { ar: "مراجعة", fr: "Réviser" },
  mastered: { ar: "متقن", fr: "maîtrisées" },
  // review session
  tapToReveal: { ar: "اضغط لإظهار الإجابة", fr: "Touche pour révéler" },
  rateRecall: { ar: "كيف كان تذكّرك؟", fr: "Ton rappel ?" },
  again: { ar: "من جديد", fr: "À revoir" },
  hard: { ar: "صعب", fr: "Difficile" },
  good: { ar: "جيد", fr: "Bien" },
  easy: { ar: "سهل", fr: "Facile" },
  sessionComplete: { ar: "أحسنت! اكتملت الجلسة", fr: "Bravo ! Session terminée" },
  cardsReviewed: { ar: "بطاقة روجعت", fr: "cartes révisées" },
  accuracy: { ar: "الدقة", fr: "Précision" },
  xpEarned: { ar: "نقاط مكتسبة", fr: "XP gagnés" },
  backHome: { ar: "العودة للرئيسية", fr: "Retour à l'accueil" },
  // scan
  scanTitle: { ar: "امسح درسك", fr: "Scanne ton cours" },
  takePhoto: { ar: "التقط صورة", fr: "Prendre une photo" },
  fromGallery: { ar: "من المعرض", fr: "Depuis la galerie" },
  generating: { ar: "الذكاء الاصطناعي يقرأ درسك…", fr: "L'IA lit ton cours…" },
  reviewCards: { ar: "راجع البطاقات قبل الحفظ", fr: "Vérifie avant d'enregistrer" },
  saveDeck: { ar: "حفظ المجموعة", fr: "Enregistrer le paquet" },
  cameraPermission: { ar: "نحتاج إذن الكاميرا لمسح دروسك", fr: "Accès caméra requis pour scanner" },
  grantPermission: { ar: "منح الإذن", fr: "Autoriser" },
  openSettings: { ar: "فتح الإعدادات", fr: "Ouvrir les réglages" },
  question: { ar: "السؤال", fr: "Question" },
  answer: { ar: "الإجابة", fr: "Réponse" },
  // dashboard
  weaknessMap: { ar: "خريطة نقاط الضعف", fr: "Carte des faiblesses" },
  forgettingCurve: { ar: "منحنى النسيان", fr: "Courbe d'oubli" },
  focusToday: { ar: "ركّز اليوم على", fr: "À travailler aujourd'hui" },
  overallAccuracy: { ar: "الدقة الإجمالية", fr: "Précision globale" },
  totalReviews: { ar: "مراجعة", fr: "révisions" },
  noAnalytics: { ar: "لا بيانات بعد", fr: "Pas encore de données" },
  noAnalyticsSub: { ar: "أكمل جلسة مراجعة لرؤية تقدمك", fr: "Termine une session pour voir tes stats" },
  weak: { ar: "ضعيف", fr: "Faible" },
  strong: { ar: "قوي", fr: "Fort" },
  // exams
  mockExam: { ar: "اختبار تجريبي", fr: "Examen blanc" },
  mockExamSub: { ar: "أسئلة من أضعف مواضيعك", fr: "Questions ciblées sur tes faiblesses" },
  startExam: { ar: "ابدأ الاختبار", fr: "Démarrer l'examen" },
  questionsCount: { ar: "عدد الأسئلة", fr: "Nombre de questions" },
  examResults: { ar: "نتائج الاختبار", fr: "Résultats" },
  score: { ar: "النتيجة", fr: "Score" },
  breakdown: { ar: "التفصيل حسب المادة", fr: "Détail par matière" },
  showAnswer: { ar: "أظهر الإجابة", fr: "Voir la réponse" },
  gotIt: { ar: "أجبت صح", fr: "Réussi" },
  missedIt: { ar: "أخطأت", fr: "Manqué" },
  history: { ar: "السجل", fr: "Historique" },
  noExams: { ar: "لا اختبارات بعد", fr: "Aucun examen passé" },
  time: { ar: "الوقت", fr: "Temps" },
  // profile
  targetStream: { ar: "الشعبة المستهدفة", fr: "Filière visée" },
  totalXP: { ar: "مجموع النقاط", fr: "XP total" },
  cardsMastered: { ar: "بطاقات متقنة", fr: "Cartes maîtrisées" },
  longestStreak: { ar: "أطول سلسلة", fr: "Meilleure série" },
  language: { ar: "اللغة", fr: "Langue" },
  logout: { ar: "تسجيل الخروج", fr: "Déconnexion" },
  editGoal: { ar: "الهدف اليومي (بطاقات)", fr: "Objectif quotidien (cartes)" },
  member: { ar: "طالب في بوست باك", fr: "Étudiant BoostBac" },
  // badges
  badges: { ar: "الأوسمة", fr: "Badges" },
  badge_first_deck: { ar: "أول مجموعة", fr: "1er paquet" },
  badge_streak_3: { ar: "سلسلة 3 أيام", fr: "Série de 3" },
  badge_streak_7: { ar: "سلسلة 7 أيام", fr: "Série de 7" },
  badge_streak_30: { ar: "سلسلة 30 يومًا", fr: "Série de 30" },
  badge_reviews_50: { ar: "50 مراجعة", fr: "50 révisions" },
  badge_reviews_200: { ar: "200 مراجعة", fr: "200 révisions" },
  badge_mastered_10: { ar: "10 متقنة", fr: "10 maîtrisées" },
  badge_mastered_50: { ar: "50 متقنة", fr: "50 maîtrisées" },
  badge_mastered_100: { ar: "100 متقنة", fr: "100 maîtrisées" },
  badge_xp_500: { ar: "500 نقطة", fr: "500 XP" },
  // reminders
  reminders: { ar: "تذكيرات المراجعة", fr: "Rappels de révision" },
  remindersSub: { ar: "تذكير لطيف كل يوم على الساعة 6 مساءً", fr: "Un rappel doux chaque jour à 18h" },
  enable: { ar: "تفعيل", fr: "Activer" },
  enabled: { ar: "مفعّلة", fr: "Activés" },
  notifDenied: { ar: "فعّل الإشعارات من الإعدادات", fr: "Active les notifications dans les réglages" },
  // offline
  offline: { ar: "غير متصل — سنزامن لاحقًا", fr: "Hors ligne — synchro plus tard" },
  synced: { ar: "تمت مزامنة مراجعاتك", fr: "Révisions synchronisées" },
  // pdf
  pdfUpload: { ar: "رفع PDF", fr: "Importer un PDF" },
  // notification content
  notifTitle: { ar: "وقت المراجعة! 🛩️", fr: "C'est l'heure de réviser ! 🛩️" },
  notifBody: { ar: "بطاقاتك تنتظرك. حافظ على سلسلتك!", fr: "Tes cartes t'attendent. Garde ta série !" },
  reminderTime: { ar: "وقت التذكير", fr: "Heure du rappel" },
  // badge celebration
  badgeUnlocked: { ar: "وسام جديد! 🎉", fr: "Badge débloqué ! 🎉" },
  tapContinue: { ar: "اضغط للمتابعة", fr: "Touche pour continuer" },
  // share
  shareProgress: { ar: "شارك تقدّمك", fr: "Partager mes progrès" },
  shareMessage: { ar: "أراجع للباك مع بوست باك! 🛩️", fr: "Je révise mon Bac avec BoostBac ! 🛩️" },
  // leaderboard
  leaderboard: { ar: "الترتيب", fr: "Classement" },
  weeklyRanking: { ar: "ترتيب الأسبوع", fr: "Classement de la semaine" },
  weeklyXP: { ar: "نقاط الأسبوع", fr: "XP cette semaine" },
  yourRank: { ar: "ترتيبك", fr: "Ton rang" },
  players: { ar: "لاعب", fr: "joueurs" },
  noLeaderboard: { ar: "كن أول من يجمع النقاط هذا الأسبوع!", fr: "Sois le premier à marquer cette semaine !" },
  rankHint: { ar: "راجع بطاقاتك لتصعد في الترتيب", fr: "Révise pour grimper au classement" },
  // role
  role: { ar: "أنا", fr: "Je suis" },
  iAmStudent: { ar: "طالب", fr: "Élève" },
  iAmTeacher: { ar: "أستاذ", fr: "Enseignant" },
  // pending teacher
  pendingTitle: { ar: "في انتظار الموافقة", fr: "En attente de validation" },
  pendingSub: { ar: "حسابك كأستاذ قيد المراجعة من طرف الإدارة. سنعلمك فور الموافقة.", fr: "Ton compte enseignant est en cours de validation par l'administration." },
  rejectedTitle: { ar: "لم تتم الموافقة على الحساب", fr: "Compte non approuvé" },
  refreshStatus: { ar: "تحديث الحالة", fr: "Actualiser" },
  // admin
  adminPanel: { ar: "لوحة الإدارة", fr: "Administration" },
  pendingTeachers: { ar: "أساتذة في الانتظار", fr: "Enseignants en attente" },
  approve: { ar: "موافقة", fr: "Approuver" },
  reject: { ar: "رفض", fr: "Rejeter" },
  noPending: { ar: "لا طلبات في الانتظار", fr: "Aucune demande en attente" },
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
  attachImage: { ar: "إرفاق صورة", fr: "Joindre une image" },
  attachPdf: { ar: "إرفاق PDF", fr: "Joindre un PDF" },
  attached: { ar: "تم الإرفاق ✓", fr: "Joint ✓" },
  publish: { ar: "نشر", fr: "Publier" },
  openAttachment: { ar: "فتح المرفق", fr: "Ouvrir la pièce jointe" },
  message_teacher: { ar: "مراسلة الأستاذ", fr: "Contacter" },
  typeMessage: { ar: "اكتب رسالة…", fr: "Écris un message…" },
  noPosts: { ar: "لا منشورات بعد", fr: "Aucune publication" },
  noTeachers: { ar: "لا أساتذة بعد", fr: "Aucun enseignant" },
  noConversations: { ar: "لا محادثات بعد", fr: "Aucune conversation" },
  filterAll: { ar: "الكل", fr: "Tout" },
  // exam countdown
  daysToExam: { ar: "يوم حتى الباك", fr: "jours avant le Bac" },
  setExamDate: { ar: "حدّد تاريخ الباك", fr: "Définir la date du Bac" },
  examDate: { ar: "تاريخ الباك", fr: "Date du Bac" },
  pacePrefix: { ar: "راجع", fr: "Révise" },
  paceSuffix: { ar: "بطاقة/يوم للوصول جاهزًا", fr: "cartes/jour pour être prêt" },
  examToday: { ar: "اليوم هو الباك! بالتوفيق 🛩️", fr: "C'est le jour J ! Bonne chance 🛩️" },
  back: { ar: "رجوع", fr: "Retour" },
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
