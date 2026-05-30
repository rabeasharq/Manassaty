export interface LessonDetail {
  readingText: string;     // موضوع القراءة أو النص البلاغي
  grammarTopic: string;    // موضوع القواعد النحوية والصرفية
  spellingTopic: string;   // موضوع الإملاء والتطبيقات الإملائية
}

export interface WeeklyCurriculum {
  week: number;
  theme: string;           // المحور العام المشترك (الأسبوعي)
  g7: LessonDetail;        // الصف السابع
  g8: LessonDetail;        // الصف الثامن
  g9: LessonDetail;        // الصف التاسع
  alphaStrategy: string;   // استراتيجية تفاعلية مقترحة لجيل ألفا ومستويات بلوم
  tools: string[];         // الوسائط الرقمية وغير الرقمية المقترحة
  isReviewWeek: boolean;   // هل هو أسبوع مراجعة وتقويم شهري؟
}

export interface DayLessonPlan {
  id: string;
  grade: number;
  week: number;
  title: string;
  type: 'reading' | 'grammar' | 'spelling' | 'review';
  bloomObjectives: {
    rememberUnderstand: string;
    apply: string;
    analyzeCreate: string;
  };
  alphaStrategies: string[];
  multimediaTools: string[];
  steps: {
    warmup: string;       // التمهيد (5 دقائق)
    exploration: string;  // الاستكشاف والعرض (20 دقيقة)
    practice: string;     // التطبيق الموجه والتعاوني (10 دقائق)
    assessment: string;   // التقييم والتكليف الرقمي (5 دقائق)
  };
  homework: string;
  questions: string[];
}
