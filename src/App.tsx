import React, { useState, useEffect } from "react";
import { 
  BookOpen, 
  Calendar, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  FileText, 
  GraduationCap, 
  LayoutDashboard, 
  Printer, 
  RefreshCw, 
  Settings, 
  Sparkles, 
  TrendingUp, 
  HelpCircle, 
  AlertCircle, 
  User, 
  Award,
  Layers,
  ArrowRight,
  Bookmark,
  CheckCircle
} from "lucide-react";
import { WEEKLY_CURRICULUM_DATA, getDailyLessonPlan, getUnitNameForWeek } from "./data";
import { WeeklyCurriculum, DayLessonPlan } from "./types";

// Open DB and save/retrieve values for permanent storage (IndexedDB)
const DB_NAME = "menhaj_durable_db";
const DB_VERSION = 1;
const STORE_NAME = "app_state";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function saveToIndexedDB(key: string, value: any): Promise<void> {
  return openDatabase().then(db => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }).catch(err => {
    console.warn("IndexedDB Save Error:", err);
  });
}

function getFromIndexedDB(key: string): Promise<any> {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }).catch(err => {
    console.warn("IndexedDB Read Error:", err);
    return null;
  });
}

function getGregorianDateString(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("ar-YE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch (e) {
    return dateStr;
  }
}

export default function App() {
  // Navigation & Grade States
  const [activeTab, setActiveTab] = useState<"master-plan" | "daily-planner" | "analytics">("master-plan");
  const [selectedGrade, setSelectedGrade] = useState<7 | 8 | 9>(8);
  const [currWeekIndex, setCurrWeekIndex] = useState<number>(0);

  // Durable Storage & Soft-Lock state
  const [isStoragePersisted, setIsStoragePersisted] = useState<boolean>(false);
  const [backupMessage, setBackupMessage] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);

  // Lesson Generation State
  const [plannerGrade, setPlannerGrade] = useState<7 | 8 | 9>(8);
  const [plannerWeek, setPlannerWeek] = useState<number>(1);
  const [plannerType, setPlannerType] = useState<"reading" | "grammar" | "spelling" | "review">("reading");
  const [plannerTitle, setPlannerTitle] = useState<string>("");
  const [customInstruction, setCustomInstruction] = useState<string>("");
  const [generatedPlan, setGeneratedPlan] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [apiError, setApiError] = useState<{ code: string; message: string } | null>(null);

  // Date selection & format modes (Table columns vs raw text)
  const [plannerDate, setPlannerDate] = useState<string>(() => {
    const saved = localStorage.getItem("menhaj_planner_date");
    if (saved) return saved;
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [previewFormatMode, setPreviewFormatMode] = useState<"table" | "text">("table");
  const [currentPlanObject, setCurrentPlanObject] = useState<DayLessonPlan | null>(null);

  // Offline/Online Readiness & Environment Variables (Alpha Customizer)
  const [generationMode, setGenerationMode] = useState<"offline" | "online">("offline");
  const [studentReadiness, setStudentReadiness] = useState<"ضعيف" | "متوسط" | "ممتاز">("متوسط");
  const [classroomEnvironment, setClassroomEnvironment] = useState<string>("حضرية نموذجية");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");

  // Persistence for lesson completion & custom added notes (with memory fallbacks)
  const [completedLessons, setCompletedLessons] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("menhaj_completed_lessons");
    return saved ? JSON.parse(saved) : {};
  });

  const [teacherNotes, setTeacherNotes] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("menhaj_teacher_notes");
    return saved ? JSON.parse(saved) : {};
  });

  const [currentEditNote, setCurrentEditNote] = useState<string>("");
  const [activeNoteKey, setActiveNoteKey] = useState<string | null>(null);

  // Auto-dismissible toast utility
  const showBackupToast = (text: string, type: "success" | "info" | "error" = "success") => {
    setBackupMessage({ text, type });
    setTimeout(() => {
      setBackupMessage(null);
    }, 4500);
  };

  // On-mount: synchronize and rescue state from IndexedDB if localStorage has been wiped
  useEffect(() => {
    async function initDurablePersistence() {
      try {
        // 1. Check/request persistent storage perm (marks IndexedDB as critical so browser won't delete it)
        if (navigator.storage && navigator.storage.persist) {
          const isPersisted = await navigator.storage.persisted();
          if (!isPersisted) {
            const granted = await navigator.storage.persist();
            setIsStoragePersisted(granted);
          } else {
            setIsStoragePersisted(true);
          }
        }

        // 2. Fetch completed lessons from IndexedDB
        const dbCompleted = await getFromIndexedDB("completed_lessons");
        if (dbCompleted && Object.keys(dbCompleted).length > 0) {
          setCompletedLessons(dbCompleted);
          localStorage.setItem("menhaj_completed_lessons", JSON.stringify(dbCompleted));
        }

        // 3. Fetch teacher notes from IndexedDB
        const dbNotes = await getFromIndexedDB("teacher_notes");
        if (dbNotes && Object.keys(dbNotes).length > 0) {
          setTeacherNotes(dbNotes);
          localStorage.setItem("menhaj_teacher_notes", JSON.stringify(dbNotes));
        }

        // 4. Fetch planner date from IndexedDB
        const dbDate = await getFromIndexedDB("planner_date");
        if (dbDate) {
          setPlannerDate(dbDate);
          localStorage.setItem("menhaj_planner_date", dbDate);
        }
      } catch (err) {
        console.warn("Failed to initiate permanent database backup:", err);
      }
    }
    initDurablePersistence();
  }, []);

  // Save updates to both localStorage AND IndexedDB on every change
  useEffect(() => {
    localStorage.setItem("menhaj_completed_lessons", JSON.stringify(completedLessons));
    saveToIndexedDB("completed_lessons", completedLessons);
  }, [completedLessons]);

  useEffect(() => {
    localStorage.setItem("menhaj_teacher_notes", JSON.stringify(teacherNotes));
    saveToIndexedDB("teacher_notes", teacherNotes);
  }, [teacherNotes]);

  useEffect(() => {
    localStorage.setItem("menhaj_planner_date", plannerDate);
    saveToIndexedDB("planner_date", plannerDate);
  }, [plannerDate]);

  // Background synchronize structured lesson plan object in the background whenever options change
  useEffect(() => {
    const updatedPlan = getDailyLessonPlan(
      plannerGrade,
      plannerWeek,
      plannerTitle || "موضوع الدرس اليومي المعتمد",
      plannerType,
      studentReadiness,
      classroomEnvironment,
      selectedStrategy
    );
    setCurrentPlanObject(updatedPlan);
  }, [plannerGrade, plannerWeek, plannerTitle, plannerType, studentReadiness, classroomEnvironment, selectedStrategy]);

  // Request storage persistence from the browser
  const handleEnableDurableStorage = async () => {
    if (navigator.storage && navigator.storage.persist) {
      try {
        const granted = await navigator.storage.persist();
        setIsStoragePersisted(granted);
        if (granted) {
          showBackupToast("تم تفعيل وتثبيت الحفظ الدائم بنجاح! بياناتك محمية تماماً ضد الحذف التلقائي بالمتصفح.", "success");
        } else {
          showBackupToast("طلب التثبيت غير مدعوم بالكامل في إعدادات متصفحك اليوم، ولكن الحفظ في IndexedDB نشط وآمن.", "info");
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      showBackupToast("صلاحية الحفظ الصلب التلقائي غير مدعومة بمتصفحك، لكن قاعدة البيانات (IndexedDB) نشطة وتعمل.", "info");
    }
  };

  // Export data as an offline JSON backup file (survives absolute browser resets / cache clearing)
  const handleExportBackup = () => {
    try {
      const backupData = {
        app: "menhaj_yemen_curriculum",
        timestamp: new Date().toISOString(),
        completedLessons,
        teacherNotes
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `نسخة_احتياطية_منهجي_صنعاء_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      showBackupToast("تم تصدير وحفظ ملف النسخة الاحتياطية (.json) بنجاح!", "success");
    } catch (err) {
      showBackupToast("تعذر تصدير النسخة الاحتياطية حالياً.", "error");
    }
  };

  // Import notes and progress from an offline JSON backup file
  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = event.target.files;
    if (files && files.length > 0) {
      fileReader.readAsText(files[0], "UTF-8");
      fileReader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          if (parsed.app === "menhaj_yemen_curriculum") {
            if (parsed.completedLessons) {
              setCompletedLessons(parsed.completedLessons);
            }
            if (parsed.teacherNotes) {
              setTeacherNotes(parsed.teacherNotes);
            }
            showBackupToast("تهانينا! تم استيراد ومعايرة النسخة الاحتياطية وتحديث المزامنة الصلبة بنجاح.", "success");
          } else {
            showBackupToast("الملف المختار غير صالح أو لا يتوافق مع منصة منهجي.", "error");
          }
        } catch (err) {
          showBackupToast("فشل في قراءة محتوى الملف الاحتياطي.", "error");
        }
      };
    }
  };

  // Sync daily planner selection when teacher clicks a lesson from the semester plan
  const handleSelectLessonForPlanner = (grade: 7 | 8 | 9, weekNum: number, title: string, type: "reading" | "grammar" | "spelling" | "review") => {
    setPlannerGrade(grade);
    setPlannerWeek(weekNum);
    setPlannerType(type);
    setPlannerTitle(title);
    setGeneratedPlan("");
    setApiError(null);
    setActiveTab("daily-planner");
  };

  // Toggle completion of a specific curriculum element
  const toggleLessonCompletion = (key: string) => {
    setCompletedLessons(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Setup default planner title when week or grade changes
  useEffect(() => {
    const weekData = WEEKLY_CURRICULUM_DATA.find(w => w.week === plannerWeek);
    if (weekData) {
      const gradeDetails = plannerGrade === 7 ? weekData.g7 : plannerGrade === 8 ? weekData.g8 : weekData.g9;
      if (plannerType === "reading") {
        setPlannerTitle(gradeDetails.readingText);
      } else if (plannerType === "grammar") {
        setPlannerTitle(gradeDetails.grammarTopic);
      } else if (plannerType === "spelling") {
        setPlannerTitle(gradeDetails.spellingTopic);
      } else {
        setPlannerTitle(`مراجعة وتغذية راجعة: ${weekData.theme}`);
      }
    }
  }, [plannerGrade, plannerWeek, plannerType]);

  // Request Daily Plan generation
  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    setApiError(null);
    setGeneratedPlan("");

    // Identify standard Yemeni textbook data for context grounding
    const weekData = WEEKLY_CURRICULUM_DATA.find(w => w.week === plannerWeek);
    const contextData = weekData ? {
      theme: weekData.theme,
      details: plannerGrade === 7 ? weekData.g7 : plannerGrade === 8 ? weekData.g8 : weekData.g9,
      alphaStrategy: weekData.alphaStrategy,
      recommendedTools: weekData.tools
    } : {};

    if (generationMode === "offline") {
      // Offline Local Prep Mode - instantaneous, zero latency, customizable
      setTimeout(() => {
        try {
          const offlinePlan = getDailyLessonPlan(
            plannerGrade,
            plannerWeek,
            plannerTitle,
            plannerType,
            studentReadiness,
            classroomEnvironment,
            selectedStrategy
          );
          setCurrentPlanObject(offlinePlan);
          generateFallbackMarkdown(offlinePlan);
        } catch (err: any) {
          setApiError({
            code: "OFFLINE_ERR",
            message: "فشلت صياغة الخطة محلياً: " + err.message
          });
        } finally {
          setIsGenerating(false);
        }
      }, 500);
      return;
    }

    // Online AI Generation Mode via Gemini API Proxy
    try {
      const response = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grade: plannerGrade,
          week: plannerWeek,
          lessonName: plannerTitle,
          type: plannerType,
          customInstruction,
          contextData,
          studentReadiness,
          classroomEnvironment,
          selectedStrategy
        }),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.message || "فشلت عملية توليد الخطة بالذكاء الاصطناعي");
      }

      if (resData.success) {
        setGeneratedPlan(resData.text);
        const standardPlan = getDailyLessonPlan(
          plannerGrade,
          plannerWeek,
          plannerTitle,
          plannerType,
          studentReadiness,
          classroomEnvironment,
          selectedStrategy
        );
        setCurrentPlanObject(standardPlan);
      } else {
        throw new Error("استجابة غير صالحة من معالج الذكاء الاصطناعي.");
      }
    } catch (error: any) {
      console.error("Plan Generation Error:", error);
      setApiError({
        code: "GEN_FAIL",
        message: error?.message || "تعذر الاتصال بالخادم الذكي. تم تفعيل التحضير السريع (أوفلاين) تلقائياً كبديل ذكي."
      });
      
      // Automatic Offline Fallback: Create custom localized plan offline
      const staticPlan = getDailyLessonPlan(
        plannerGrade,
        plannerWeek,
        plannerTitle,
        plannerType,
        studentReadiness,
        classroomEnvironment,
        selectedStrategy
      );
      setCurrentPlanObject(staticPlan);
      generateFallbackMarkdown(staticPlan);
    } finally {
      setIsGenerating(false);
    }
  };

  // Local beautiful fallback generator when Gemini API is unconfigured/offline
  const generateFallbackMarkdown = (plan: DayLessonPlan) => {
    const md = `
# 📝 خطة التحضير اليومية النموذجية (تحضير محلي سريع مميز)
**المبحث:** لغتي العربية | **الصف:** ${plan.grade === 7 ? 'السابع' : plan.grade === 8 ? 'الثامن' : 'التاسع'} الأساسي
**الوحدة الدراسية:** ${getUnitNameForWeek(plan.week)} (الأسبوع ${plan.week}) | **عنوان الدرس:** ${plan.title}

---

## 🎯 أولاً: أهداف التعلم السلوكية (وفق تصنيف بلوم مكيفة لمستوى: ${studentReadiness})
* **المستوى المعرفي (التذكر والفهم):** ${plan.bloomObjectives.rememberUnderstand}
* **المستوى التطبيقي:** ${plan.bloomObjectives.apply}
* **مستويات التفكير العليا (التحليل والابتكار البناء):** ${plan.bloomObjectives.analyzeCreate}

---

## 🚀 ثانياً: استراتيجيات جيل ألفا المعتمدة (مخصصة بيداغوجياً)
${plan.alphaStrategies.map(s => `* **${s}**`).join("\n")}

### 🛠️ الوسائط والوسائل التعليمية المقترحة (المكيفة لبيئة: ${classroomEnvironment}):
${plan.multimediaTools.map(t => `* ${t}`).join("\n")}

---

## 📅 ثالثاً: سير الحصة الدراسية والأنشطة التبادلية
| الخطوة الزمنية | المكون التعليمي النشط | دليلك لتفعيل مهارات جيل ألفا |
| :--- | :--- | :--- |
| **التمهيد وإيقاظ الشغف (5 د)** | ${plan.steps.warmup} | استخدام عصف ذهني سريع ذكي يشد انتباه التلاميذ. |
| **الاستكشاف وتقديم المحتوى (20 د)** | ${plan.steps.exploration} | توضيح مهارات وقواعد كتاب لغتي العربية بالتدرج الصفي الشامل واستهداف الأهداف. |
| **التطبيق الموجه وحل الأنشطة (10 د)** | ${plan.steps.practice} | تدريب المجموعات أو الأقران بشكل يعزز فاعلية الصف. |
| **التقييم الخارجي والذاتي (5 د)** | ${plan.steps.assessment} | سؤال التقويم لضمان الإنجاز التحصيلي التراكمي. |

---

## 📝 رابعاً: التقويم والتكليف المنزلي الذكي (العلاجي والابتكاري)
* **التكليف المنزلي:** ${plan.homework}
* **أسئلة التقويم المقترحة للتغذية الراجعة:**
${plan.questions.map(q => `  1. ${q}`).join("\n")}

---
*ملاحظة: تم تخطيط هذه الحصة بنظام أوفلاين معايير "منصة منهجي" المتكاملة الملتزمة بالمنهج الدراسي والتقويم المعتمد للفصل الأول في صنعاء وبسعة مدروسة لكل المستويات.*
    `;
    setGeneratedPlan(md.trim());
  };

  // Calculate statistics for Grade 7, 8, 9
  const getProgressStats = (grade: 7 | 8 | 9) => {
    const totalLessonsCount = WEEKLY_CURRICULUM_DATA.length * 3; // reading, grammar, spelling per week
    let completedCount = 0;
    
    WEEKLY_CURRICULUM_DATA.forEach(w => {
      const rKey = `g${grade}-w${w.week}-reading`;
      const gKey = `g${grade}-w${w.week}-grammar`;
      const sKey = `g${grade}-w${w.week}-spelling`;
      if (completedLessons[rKey]) completedCount++;
      if (completedLessons[gKey]) completedCount++;
      if (completedLessons[sKey]) completedCount++;
    });

    const percent = totalLessonsCount > 0 ? Math.round((completedCount / totalLessonsCount) * 100) : 0;
    return { total: totalLessonsCount, completed: completedCount, percent };
  };

  const statsG7 = getProgressStats(7);
  const statsG8 = getProgressStats(8);
  const statsG9 = getProgressStats(9);

  // Download lesson plan as MS Word file
  const handleDownloadWord = () => {
    const filename = `تحضير_درس_لغتي_العربية_الأسبوع_${plannerWeek}_الصف_${plannerGrade}.doc`;
    const dateFormatted = getGregorianDateString(plannerDate);
    
    let contentHtml = "";
    if (currentPlanObject) {
      const plan = currentPlanObject;
      contentHtml = `
        <div style="direction: rtl; text-align: right; font-family: 'Cairo', 'Arial', sans-serif;">
          <table style="width:100%; border:none; margin-bottom: 20px;">
            <tr>
              <td style="text-align:right; font-size:11px; width:33%; border:none;">
                <b>الجمهورية اليمنية</b><br>
                وزارة التربية والتعليم<br>
                مكتب التربية والتعليم بمحافظة صنعاء<br>
                مدرسة: .......................................
              </td>
              <td style="text-align:center; font-size:14px; width:34%; font-weight:bold; border:none;">
                سجل التحضير والتخطيط التربوي المعتمد<br>
                <span style="font-size:10px; color:#115e59;">وثيقة تحصيل للمرحلة الأساسية - محافظة صنعاء</span>
              </td>
              <td style="text-align:left; font-size:11px; width:33%; border:none;">
                <b>المادة: لغتي العربية</b><br>
                الصف الدراسي: ${plannerGrade === 7 ? "السابع" : plannerGrade === 8 ? "الثامن" : "التاسع"} الأساسي<br>
                الخطة الموزعة: ${getUnitNameForWeek(plannerWeek)} (الأسبوع ${plannerWeek})<br>
                التاريخ المعين: ${dateFormatted}
              </td>
            </tr>
          </table>

          <div style="border: 2px solid #065f46; padding: 15px; margin-bottom: 15px;">
            <p style="font-size:14px; font-weight:bold; color:#065f46; margin:0 0 10px 0; border-bottom:1px solid #ccc; padding-bottom:5px;">📋 المعطيات والبيانات العامة للفصل الدراسي الأول في صنعاء</p>
            <table style="width:100%; border-collapse:collapse; margin-bottom:15px; font-size:11px;">
              <tr style="background-color:#f3f4f6; font-weight:bold;">
                <th style="border:1px solid #000; padding:8px; text-align:center;">المرحلة والصف</th>
                <th style="border:1px solid #000; padding:8px; text-align:center;">الجدولة الزمنية</th>
                <th style="border:1px solid #000; padding:8px; text-align:center;">الفرع اللغوي</th>
                <th style="border:1px solid #000; padding:8px; text-align:center;">موضوع المحاضرة الحصيلي</th>
                <th style="border:1px solid #000; padding:8px; text-align:center;">مستوى المدرسة والطلاب</th>
              </tr>
              <tr>
                <td style="border:1px solid #000; padding:8px; text-align:center;">الصف ${plannerGrade} الأساسي</td>
                <td style="border:1px solid #000; padding:8px; text-align:center;">${getUnitNameForWeek(plannerWeek)} (الأسبوع ${plannerWeek})</td>
                <td style="border:1px solid #000; padding:8px; text-align:center;">
                  ${plannerType === 'reading' ? 'النصوص والقراءة' : plannerType === 'grammar' ? 'النحو والقواعد' : plannerType === 'spelling' ? 'الإملاء والتطبيق صفي' : 'مراجعة وتقويم'}
                </td>
                <td style="border:1px solid #000; padding:8px; text-align:center; font-weight:bold; color:#065f46;">${plannerTitle}</td>
                <td style="border:1px solid #000; padding:8px; text-align:center;">${classroomEnvironment} (الاستعداد: ${studentReadiness})</td>
              </tr>
            </table>

            <p style="font-size:14px; font-weight:bold; color:#065f46; margin:15px 0 10px 0; border-bottom:1px solid #ccc; padding-bottom:5px;">🎯 أولاً: الأهداف السلوكية الرشيدة (مستويات تصنيف بلوم)</p>
            <ul>
              <li style="margin-bottom:6px; font-size:11px;"><b>التذكر والفهم واستيعاب الحواصل المعرفية:</b> ${plan.bloomObjectives.rememberUnderstand}</li>
              <li style="margin-bottom:6px; font-size:11px;"><b>التطبيق العملي والتمكين الصفي اللغوي:</b> ${plan.bloomObjectives.apply}</li>
              <li style="margin-bottom:6px; font-size:11px;"><b>مهارات الفكر العليا والاستقصاء البناء:</b> ${plan.bloomObjectives.analyzeCreate}</li>
            </ul>

            <p style="font-size:14px; font-weight:bold; color:#065f46; margin:15px 0 10px 0; border-bottom:1px solid #ccc; padding-bottom:5px;">🚀 ثانياً: بيداغوجيا التدريس واستراتيجيات جيل الفا ومصادره الفعالة</p>
            <ul>
              <li style="margin-bottom:5px; font-size:11px;"><b>الاستراتيجيات النشطة المتبعة:</b> ${plan.alphaStrategies.join(" - ")}</li>
              <li style="margin-bottom:5px; font-size:11px;"><b>الصناعات والوسائط المتعددة والموارد:</b> ${plan.multimediaTools.join(" - ")}</li>
            </ul>

            <p style="font-size:14px; font-weight:bold; color:#065f46; margin:15px 0 10px 0; border-bottom:1px solid #ccc; padding-bottom:5px;">📅 ثالثاً: خطة سير الحصة التعليمية والأنشطة المتدرجة بالتفصيل</p>
            <table style="width:100%; border-collapse:collapse; margin-bottom:15px; font-size:11px;">
              <tr style="background-color:#f3f4f6; font-weight:bold;">
                <th style="border:1px solid #000; padding:8px; width:15%; text-align:center;">الزمن والخطوة</th>
                <th style="border:1px solid #000; padding:8px; width:20%; text-align:right;">المكون البيداغوجي الأساسي</th>
                <th style="border:1px solid #000; padding:8px; text-align:right;">إجراءات سير المعلم والأنشطة التبادلية</th>
              </tr>
              <tr>
                <td style="border:1px solid #000; padding:8px; text-align:center; font-weight:bold;">5 دقائق</td>
                <td style="border:1px solid #000; padding:8px; font-weight:bold;">التمهيد وإيقاظ الشغف صفيّاً</td>
                <td style="border:1px solid #000; padding:8px;">${plan.steps.warmup}</td>
              </tr>
              <tr>
                <td style="border:1px solid #000; padding:8px; text-align:center; font-weight:bold;">20 دقيقة</td>
                <td style="border:1px solid #000; padding:8px; font-weight:bold;">الاستكشاف وتقديم المهارة</td>
                <td style="border:1px solid #000; padding:8px;">${plan.steps.exploration}</td>
              </tr>
              <tr>
                <td style="border:1px solid #000; padding:8px; text-align:center; font-weight:bold;">10 دقائق</td>
                <td style="border:1px solid #000; padding:8px; font-weight:bold;">التدريب الصفي والتمكين الموجه</td>
                <td style="border:1px solid #000; padding:8px;">${plan.steps.practice}</td>
              </tr>
              <tr>
                <td style="border:1px solid #000; padding:8px; text-align:center; font-weight:bold;">5 دقائق</td>
                <td style="border:1px solid #000; padding:8px; font-weight:bold;">التقويم التكويني وصنع الأثر</td>
                <td style="border:1px solid #000; padding:8px;">${plan.steps.assessment}</td>
              </tr>
            </table>

            <p style="font-size:14px; font-weight:bold; color:#065f46; margin:15px 0 10px 0; border-bottom:1px solid #ccc; padding-bottom:5px;">💬 رابعاً: أسئلة التقويم الختامي المبرمجة صفيّاً والتكاليف المنزلية</p>
            <p style="font-size:11px; margin:0 0 5px 0;"><b>التكليف والواجب المدرسي المطلوب كتابياً:</b></p>
            <div style="background-color:#fffbeb; border:1px solid #fcf7e1; padding:8px; font-size:11px; font-weight:bold; margin-bottom:10px;">${plan.homework}</div>
            
            <p style="font-size:11px; margin:10px 0 5px 0;"><b>العصف والتقويم الفردي والختامي:</b></p>
            <ol>
              ${plan.questions.map(q => `              <li style="margin-bottom:4px; font-size:11px;">${q}</li>`).join("\n")}
            </ol>
          </div>

          <table style="width:100%; border:none; margin-top:30px; font-size:11px; text-align:center;">
            <tr>
              <td style="width:33%; border:none;">
                <b>توقيع وملاحظات المعلم:</b><br><br>......................................
              </td>
              <td style="width:33%; border:none;">
                <b>توقيع الموجه الفني الزائر:</b><br><br>......................................
              </td>
              <td style="width:33%; border:none;">
                <b>مدير ومصادقة المدرسة:</b><br><br>ختم وإمضاء المدرسة رسميّاً
              </td>
            </tr>
          </table>
        </div>
      `;
    } else {
      contentHtml = `
        <div style="direction: rtl; text-align: right; font-family: 'Cairo', 'Arial', sans-serif;">
          ${generatedPlan
            .replace(/\n/g, "<br>")
            .replace(/# (.*)/g, "<h1>$1</h1>")
            .replace(/## (.*)/g, "<h2>$1</h2>")
            .replace(/\*\* (.*)\*\*/g, "<strong>$1</strong>")
            .replace(/\* (.*)/g, "<li>$1</li>")}
        </div>
      `;
    }

    const formatHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>خطة درس لغتي العربية المعتمدة</title>
        <style>
          body { font-family: 'Cairo', 'Arial', sans-serif; direction: rtl; text-align: right; }
          h1 { color: #047857; text-align: center; font-size: 16px; margin: 10px 0; }
          h2 { color: #065f46; border-bottom: 2px solid #047857; padding-bottom: 5px; font-size: 14px; margin-top: 15px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #777; padding: 8px; text-align: right; }
          th { background-color: #f3f4f6; }
        </style>
      </head>
      <body>
        ${contentHtml}
      </body>
      </html>
    `;
    const blob = new Blob([formatHtml], { type: "application/msword;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showBackupToast("تم البدء في تحميل مستند التحضير المنقح للتوجيه (DOC) بنجاح!", "success");
  };

  // Open Notes Editor
  const handleOpenNote = (key: string) => {
    setActiveNoteKey(key);
    setCurrentEditNote(teacherNotes[key] || "");
  };

  const handleSaveNote = () => {
    if (activeNoteKey) {
      setTeacherNotes(prev => ({
        ...prev,
        [activeNoteKey]: currentEditNote
      }));
      setActiveNoteKey(null);
      setCurrentEditNote("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col antialiased">
      {/* Educational Header - Yemeni Theme */}
      <header className="bg-emerald-950 text-white shadow-md border-b-4 border-amber-500 no-print">
        <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 p-2.5 rounded-lg text-emerald-950 shadow-md">
              <GraduationCap className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                منهجي <span className="text-amber-400 text-sm font-normal px-2 py-0.5 rounded-full bg-emerald-900 border border-emerald-700/50">بوابة التوجيه والتحضير لمحافظة صنعاء</span>
              </h1>
              <p className="text-emerald-200 text-xs mt-0.5">
                المنصة الذكية لتطوير خطط لغتي العربية للصفوف (7، 8، 9) بمقاييس جيل ألفا وتصنيف بلوم
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-emerald-200 bg-emerald-900/60 px-3 py-1.5 rounded-md border border-emerald-800">
              📅 العام الدراسي المعتمد: 1447 هـ / 2026 م
            </span>
            <div className="text-left text-xs text-amber-300">
              <span className="block font-medium">الجمهورية اليمنية</span>
              <span className="block text-[10px] opacity-80">وزارة التربية والتعليم - قطاع المناهج</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main navigation tab bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <nav className="flex space-x-8 space-x-reverse py-3">
            <button
              onClick={() => setActiveTab("master-plan")}
              className={`flex items-center gap-2 pb-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "master-plan"
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Calendar className="h-4 w-4" />
              توزيع خطة الفصل الدراسي
            </button>
            <button
              onClick={() => setActiveTab("daily-planner")}
              className={`flex items-center gap-2 pb-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "daily-planner"
                  ? "border-emerald-700 text-emerald-800 relative"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
              التحضير اليومي الذكي (AI)
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 pb-2 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "analytics"
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              إحصاءات التقدم والتوجيه المدرسي
            </button>
          </nav>

          {/* Quick Stats Summary */}
          <div className="hidden lg:flex items-center gap-6 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 block"></span>
              <span>الصف السابع: <strong>{statsG7.percent}%</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 block"></span>
              <span>الصف الثامن: <strong>{statsG8.percent}%</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block"></span>
              <span>الصف التاسع: <strong>{statsG9.percent}%</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Dynamic Premium Feedback Toast */}
        {backupMessage && (
          <div className="fixed bottom-6 left-6 z-50 max-w-md bg-emerald-950 text-white rounded-xl shadow-xl p-4 border border-amber-500 animate-fade-in flex items-center gap-3 rtl text-right">
            <div className="bg-amber-500 text-emerald-950 p-1.5 rounded-lg shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold">{backupMessage.text}</p>
            </div>
          </div>
        )}

        {/* Durable Storage Alert & Backup Control Panel */}
        <div className="bg-white border-2 border-emerald-800/20 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 no-print shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-200 shrink-0">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">نظام الحفظ الصلب والنسخ الاحتياطي الدائم</h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-all ${
                  isStoragePersisted ? "bg-emerald-800 text-white" : "bg-amber-100 text-amber-800 text-[10px]"
                }`}>
                  {isStoragePersisted ? "🔐 محمي ضد الحذف والاستبعاد التلقائي" : "⚠️ يحتاج إذن التثبيت من المتصفح"}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-1">
                منصة منهجي نشطة الآن بنسختين متزامنتين (قاعدة بيانات IndexedDB + الذاكرة المحلية) لحفظ خطط التحضير وملاحظات الموجهين بالكامل وبشكل صلب.
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            {!isStoragePersisted && (
              <button
                type="button"
                onClick={handleEnableDurableStorage}
                className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition duration-200 cursor-pointer shadow-xs whitespace-nowrap"
              >
                تحديث أمان الحفظ
              </button>
            )}
            <button
              type="button"
              onClick={handleExportBackup}
              className="bg-emerald-800 hover:bg-emerald-950 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
              title="تصدير وتحميل النسخة احتياطياً للكمبيوتر أو فلاشة أوفلاين"
            >
              <Download className="h-4 w-4" />
              تصدير نسخة صلبة (.json)
            </button>
            
            <label className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl transition duration-200 flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap">
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              استيراد ملف احتياطي
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* TAB 1: MASTER SEMESTER PLAN */}
        {activeTab === "master-plan" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-xs border border-slate-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">الخطة الفصلية الموحدة وتوزيع الأسابيع الدراسية</h2>
                  <p className="text-slate-500 text-xs mt-1">
                    موزعة ومنسقة حسب التقويم المدرسي المعتمد في مكتب التربية بأمانة العاصمة صنعاء لمادة لغتي العربية.
                  </p>
                </div>
                
                {/* Print Master Plan trigger */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    <Printer className="h-4 w-4" />
                    تحضير نسخة الطباعة للتوجيه والإدارة
                  </button>
                </div>
              </div>

              {/* Sana'a Monthly Exam Alerts */}
              <div className="mt-4 p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>💡 تنبيه للتقويم المدرسي:</strong> يتضمن الفصل المنهجي 16 أسبوعاً. قمنا بإدراج <strong>أسبوع مراجعة وتقويم شامل كل 4 أسابيع</strong> (الأسبوع 4، 8، 12، 14، 15، 16) ليتزامن تماماً مع الاختبارات الشهرية الموحدة في صنعاء والتغذية الراجعة لطلاب جيل ألفا.
                </div>
              </div>
            </div>

            {/* Quick Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-slate-600 text-sm font-semibold">تصفية العرض بحسب الصف:</span>
                <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200">
                  <button
                    onClick={() => setSelectedGrade(7)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      selectedGrade === 7 ? "bg-emerald-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    الصف السابع
                  </button>
                  <button
                    onClick={() => setSelectedGrade(8)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      selectedGrade === 8 ? "bg-emerald-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    الصف الثامن
                  </button>
                  <button
                    onClick={() => setSelectedGrade(9)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      selectedGrade === 9 ? "bg-emerald-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    الصف التاسع
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-1">
                <span>إجمالي الدروس المقررة للفصل: <strong>48 درساً</strong></span>
                <span className="text-slate-300">|</span>
                <span>المنفذ منها: <strong>{getProgressStats(selectedGrade).completed} درساً</strong></span>
              </div>
            </div>

            {/* Weekly Grid */}
            <div className="grid grid-cols-1 gap-6 print-container">
              {WEEKLY_CURRICULUM_DATA.map((weekItem, idx) => {
                const gradeDetails = selectedGrade === 7 ? weekItem.g7 : selectedGrade === 8 ? weekItem.g8 : weekItem.g9;
                
                // Keys for checking completion
                const readingKey = `g${selectedGrade}-w${weekItem.week}-reading`;
                const grammarKey = `g${selectedGrade}-w${weekItem.week}-grammar`;
                const spellingKey = `g${selectedGrade}-w${weekItem.week}-spelling`;

                return (
                  <div 
                    key={weekItem.week} 
                    className={`bg-white rounded-xl shadow-xs border transition-all ${
                      weekItem.isReviewWeek 
                        ? "border-amber-400 bg-amber-50/20" 
                        : "border-slate-200 hover:border-emerald-600/50"
                    }`}
                  >
                    {/* Week Header */}
                    <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/60 rounded-t-xl">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          weekItem.isReviewWeek ? "bg-amber-500 text-white" : "bg-emerald-950 text-white"
                        }`}>
                          {getUnitNameForWeek(weekItem.week)} (الأسبوع {weekItem.week})
                        </span>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            {weekItem.theme}
                            {weekItem.isReviewWeek && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded font-normal">أسبوع مراجعة وتقييم شهري</span>}
                          </h3>
                        </div>
                      </div>
                      
                      {/* Generation & Completion Info */}
                      <span className="text-xs text-slate-500">
                        {weekItem.isReviewWeek ? "دورة المراجعة الشهرية الرسمية" : "3 فروع معرفية متكاملة"}
                      </span>
                    </div>

                    {/* Lesson elements in Yemeni books */}
                    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* 1. Reading & Text */}
                      <div className={`p-4 rounded-lg border transition ${
                        completedLessons[readingKey] ? "bg-emerald-50/60 border-emerald-300" : "bg-slate-50 border-slate-200"
                      }`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            📖 النصوص والقراءة والتعبير
                          </span>
                          <button 
                            onClick={() => toggleLessonCompletion(readingKey)}
                            title="تحديد كمنفَّذ"
                            className="text-slate-400 hover:text-emerald-700 transition"
                          >
                            <CheckCircle2 className={`h-5 w-5 ${completedLessons[readingKey] ? "text-emerald-600 fill-emerald-100" : ""}`} />
                          </button>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mb-3">{gradeDetails.readingText}</h4>
                        
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] text-slate-500">الهدف: الإلقاء والتذوق</span>
                          <button
                            onClick={() => handleSelectLessonForPlanner(selectedGrade, weekItem.week, gradeDetails.readingText, 'reading')}
                            className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1"
                          >
                            إنشاء خِطّة تحضير رقمية <ChevronLeft className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* 2. Grammar */}
                      <div className={`p-4 rounded-lg border transition ${
                        completedLessons[grammarKey] ? "bg-emerald-50/60 border-emerald-300" : "bg-slate-50 border-slate-200"
                      }`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                            ⚖️ القواعد النحوية والصرفية
                          </span>
                          <button 
                            onClick={() => toggleLessonCompletion(grammarKey)}
                            title="تحديد كمنفَّذ"
                            className="text-slate-400 hover:text-emerald-700 transition"
                          >
                            <CheckCircle2 className={`h-5 w-5 ${completedLessons[grammarKey] ? "text-emerald-600 fill-emerald-100" : ""}`} />
                          </button>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mb-3">{gradeDetails.grammarTopic}</h4>
                        
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] text-slate-500">الهدف: الضبط والتحليل والنحو</span>
                          <button
                            onClick={() => handleSelectLessonForPlanner(selectedGrade, weekItem.week, gradeDetails.grammarTopic, 'grammar')}
                            className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1"
                          >
                            إنشاء خِطّة تحضير رقمية <ChevronLeft className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* 3. Spelling */}
                      <div className={`p-4 rounded-lg border transition ${
                        completedLessons[spellingKey] ? "bg-emerald-50/60 border-emerald-300" : "bg-slate-50 border-slate-200"
                      }`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[11px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                            ✍️ الإملاء والتطبيقات الإملائية
                          </span>
                          <button 
                            onClick={() => toggleLessonCompletion(spellingKey)}
                            title="تحديد كمنفَّذ"
                            className="text-slate-400 hover:text-emerald-700 transition"
                          >
                            <CheckCircle2 className={`h-5 w-5 ${completedLessons[spellingKey] ? "text-emerald-600 fill-emerald-100" : ""}`} />
                          </button>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mb-3">{gradeDetails.spellingTopic}</h4>
                        
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] text-slate-500">الهدف: الكتابة الإملائية السليمة</span>
                          <button
                            onClick={() => handleSelectLessonForPlanner(selectedGrade, weekItem.week, gradeDetails.spellingTopic, 'spelling')}
                            className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1"
                          >
                            إنشاء خِطّة تحضير رقمية <ChevronLeft className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Footer - Gen Alpha strategies & Tools suggested */}
                    <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-b-xl no-print">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700">الاستراتيجية الرديفة لجيل ألفا:</span>
                        <span className="text-slate-600">{weekItem.alphaStrategy}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="font-semibold text-slate-700">الوسائل المقترحة:</span>
                        {weekItem.tools.map((t, idx) => (
                          <span key={idx} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: DYNAMIC AI DAILY PLANNER */}
        {activeTab === "daily-planner" && (
          <div className="space-y-6">
            {/* Navigation back bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-205 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print shadow-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("master-plan")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 rounded-lg text-xs font-bold transition-all border border-emerald-200 cursor-pointer shadow-xs"
                >
                  <ChevronRight className="h-4 w-4" />
                  رجوع لخطّة توزيع المنهج الفصلية
                </button>
                <div className="h-4 w-px bg-slate-250 bg-slate-300"></div>
                <span className="text-xs text-slate-500 font-bold">النافذة الحالية: صياغة المخطط والتحضير اليومي</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">تم تحديد الدرس: {plannerTitle} | أسبوع {plannerWeek}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Planner Left Form Config */}
            <div className="lg:col-span-4 space-y-6 ready-form no-print">
              <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  مدخلات وإعدادات الحصة اليومية
                </h3>

                <div className="space-y-4">
                  {/* Generation Mode Toggle (Critical User Intent element) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">طريقة التحضير وصياغة الدرس:</label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-150 rounded-lg bg-slate-100">
                      <button
                        type="button"
                        onClick={() => setGenerationMode("offline")}
                        className={`py-1.5 px-2 text-xs font-bold rounded-md transition duration-200 ${
                          generationMode === "offline"
                            ? "bg-emerald-800 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        ⚡ مَحلي (أوفلاين فوري)
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenerationMode("online")}
                        className={`py-1.5 px-2 text-xs font-bold rounded-md transition duration-200 ${
                          generationMode === "online"
                            ? "bg-emerald-800 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        🤖 ذكي (أونلاين AI)
                      </button>
                    </div>
                  </div>

                  {/* Student Readiness / درجة استعداد الطلاب */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">درجة استعداد واستيعاب طلاب الصف:</label>
                    <select
                      value={studentReadiness}
                      onChange={(e) => setStudentReadiness(e.target.value as "ضعيف" | "متوسط" | "ممتاز")}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-medium"
                    >
                      <option value="متوسط">متوسط (مستوى تنموي متدرج ومناسب للأغالبة)</option>
                      <option value="ضعيف">ضعيف (يركز على المهارات العلاجية والتمكين السهل)</option>
                      <option value="ممتاز">ممتاز (مستوى متقدم يركز على التفكير الناقد والابتكار)</option>
                    </select>
                  </div>

                  {/* Classroom Resources Environment */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">بيئة المدرسة ومستوى الإمكانيات:</label>
                    <select
                      value={classroomEnvironment}
                      onChange={(e) => setClassroomEnvironment(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-medium"
                    >
                      <option value="حضرية نموذجية">حضرية نموذجية (أقلام ولوحات وأوراق عمل وبروجيكتور)</option>
                      <option value="ريفية محدودة الإمكانيات">ريفية محدودة (سبورة طباشير، كروت محسوسة، وبدائل يدوية)</option>
                      <option value="مجهزة إلكترونياً تامة">مجهزة إلكترونياً (شاشات عرض ذكية، أجهزة للطلاب، وتطبيقات تفاعلية)</option>
                    </select>
                  </div>

                  {/* Choose custom Alpha/Bloom strategy */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الاستراتيجية البيداغوجية المستهدفة:</label>
                    <select
                      value={selectedStrategy}
                      onChange={(e) => setSelectedStrategy(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-medium"
                    >
                      <option value="">القيمة الافتراضية المقترحة بالأسبوع الدراسي</option>
                      <option value="التلعيب والبطاقات التنافسية">التلعيب والبطاقات التنافسية (تفعيل اللعب المنظم)</option>
                      <option value="الفصول المقلوبة والتعلم الذاتي">الفصول المقلوبة والتعلم الذاتي (مسؤولية التلميذ المعرفية)</option>
                      <option value="لعب الأدوار والمسرح اللغوي">لعب الأدوار والمسرح اللغوي (تقمص الشخصيات الأدبي)</option>
                      <option value="التعلم القائم على الفريق التعاوني والمقابلة">التعلم القائم على الفريق التعاوني والمقابلة (مهارات تواصلية)</option>
                      <option value="العصف الذهني وحل المشكلات الاستقرائي">العصف الذهني وحل المشكلات الاستقرائي (تحفيز الفكر)</option>
                    </select>
                  </div>

                  <hr className="border-slate-200" />

                  {/* Grade */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الصف الدراسي المعتمد:</label>
                    <select 
                      value={plannerGrade} 
                      onChange={(e) => setPlannerGrade(Number(e.target.value) as 7 | 8 | 9)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-bold"
                    >
                      <option value={7}>الصف السابع الأساسي</option>
                      <option value={8}>الصف الثامن الأساسي</option>
                      <option value={9}>الصف التاسع الأساسي</option>
                    </select>
                  </div>

                  {/* Targeted Lesson Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-500" />
                      تاريخ إلقاء الحصة (للطباعة والمستند):
                    </label>
                    <input 
                      type="date"
                      value={plannerDate}
                      onChange={(e) => setPlannerDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-bold text-slate-850 bg-slate-55"
                    />
                  </div>

                  {/* Week */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الأسبوع بالخطة الفصلية الموزعة:</label>
                    <select 
                      value={plannerWeek} 
                      onChange={(e) => setPlannerWeek(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-semibold text-slate-800"
                    >
                      {WEEKLY_CURRICULUM_DATA.map(w => (
                        <option key={w.week} value={w.week}>{getUnitNameForWeek(w.week)} (الأسبوع {w.week}) - {w.theme.substring(0, 30)}...</option>
                      ))}
                    </select>
                  </div>

                  {/* Lesson Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">فرع المادة الأساسي:</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { type: 'reading', label: '📖 نصوص وقراءة' },
                        { type: 'grammar', label: '⚖️ قواعد ونحو' },
                        { type: 'spelling', label: '✍️ إملاء وخط' },
                        { type: 'review', label: '⏳ مراجعة وتقويم' }
                      ].map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setPlannerType(item.type as any)}
                          className={`p-1.5 text-xs font-bold rounded-lg border transition text-center ${
                            plannerType === item.type 
                              ? "bg-emerald-50 border-emerald-700 text-emerald-950 shadow-xs" 
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lesson Title */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">عنوان موضوع الحصة (مستخرج من الكتاب):</label>
                    <input 
                      type="text" 
                      value={plannerTitle}
                      onChange={(e) => setPlannerTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-medium"
                      placeholder="أدخل اسم الدرس كما هو في الكتاب..."
                    />
                  </div>

                  {/* Custom instruction / Alpha options */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">تخصيص الخطة (توجيهات لجيل ألفا):</label>
                    <textarea
                      value={customInstruction}
                      onChange={(e) => setCustomInstruction(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none font-medium h-20 resize-none"
                      placeholder="أضف استراتيجية معينة، مثل: تفعيل برنامج كاهوت، أو تخصيص تطبيقات للأقران، أو تكييف التدريس إلخ..."
                    />
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={handleGeneratePlan}
                    disabled={isGenerating}
                    className="w-full bg-emerald-800 hover:bg-emerald-900 disabled:bg-emerald-400 text-white font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        جاري تهيئة وتحضير الدرس للطباعة...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-amber-350" />
                        {generationMode === "offline" ? "صياغة الخطة محلياً (ثانية واحدة)" : "صياغة الخطة بالذكاء الاصطناعي (أونلاين)"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Informative Yemen curriculum handbook note */}
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 shadow-xs">
                <h4 className="font-bold text-slate-900 mb-1">📝 معايير منصة منهجي للتحضير الصفّي:</h4>
                <ul className="list-disc list-inside space-y-1.5 text-slate-600">
                  <li><strong>تصنيف بلوم:</strong> مواءمة الأهداف السلوكية بالتكامل التنازلي من الفهم البسيط حتى قياس المهارات العليا والابتكار.</li>
                  <li><strong>وسائل لجيل ألفا:</strong> تبرز الخطط على تفعيل الأساليب البعدية والتقنية لتلاميذ العصر وتأهبهم.</li>
                  <li><strong>الخلفية التحصيلية:</strong> مخرجات متسقة مع وثيقة المنهج اليمني المعتمد لعام 1447 هـ / 2026 م.</li>
                </ul>
              </div>
            </div>

            {/* Planner Right Output Renderer */}
            <div className="lg:col-span-8 flex flex-col h-full min-h-[600px]">
              {generatedPlan ? (
                <div className="bg-white rounded-xl shadow-md border border-slate-200 flex-grow flex flex-col print-container">
                  {/* Output Header toolbar */}
                  <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 rounded-t-xl no-print">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 block animate-ping"></span>
                      <span className="text-xs font-bold text-slate-700">جاهز للتصدير والتوجيه الرسمي</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.print()}
                        className="flex items-center gap-1 bg-white hover:bg-slate-300 border border-slate-300 text-slate-700 px-3/5 py-1.5 rounded-lg text-xs font-bold transition shadow-xs"
                      >
                        <Printer className="h-3.5 w-3.5 text-slate-500" />
                        طباعة كخطة رسمية
                      </button>
                      <button
                        onClick={handleDownloadWord}
                        className="flex items-center gap-1 bg-emerald-800 hover:bg-emerald-950 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                      >
                        <Download className="h-3.5 w-3.5 text-emerald-200" />
                        تصدير كملف Word (DOC)
                      </button>
                    </div>
                  </div>

                  {/* Actual Lesson Plan Document view */}
                  <div className="p-6 md:p-8 flex-grow overflow-y-auto leading-relaxed rtl text-right prose prose-emerald prose-sm max-w-none">
                    <div className="border-4 border-double border-emerald-800 p-6 rounded-lg bg-amber-50/5 relative mb-4">
                      {/* Logo and official branding at the top inside document (WITHOUT LOGOS) */}
                      <div className="flex flex-col sm:flex-row items-start justify-between border-b pb-4 mb-6 border-slate-300 gap-4">
                        <div className="text-right text-[11px] space-y-0.5 text-slate-800">
                          <p className="font-bold">الجمهورية اليمنية</p>
                          <p>وزارة التربية والتعليم</p>
                          <p>مكتب التربية والتعليم بمحافظة صنعاء</p>
                          <p>مدرسة: .......................................</p>
                        </div>
                        <div className="text-center font-extrabold text-slate-900 flex-grow px-2 py-1 max-w-md">
                          <h2 className="text-sm sm:text-base tracking-wide font-extrabold text-emerald-900 m-0 border-b border-emerald-800 pb-1">سجل التحضير والتخطيط التربوي المعتمد</h2>
                          <p className="text-[10px] text-teal-800 font-extrabold m-0 mt-1">وثيقة تحصيل للمرحلة الأساسية - محافظة صنعاء</p>
                        </div>
                        <div className="text-left text-[11px] space-y-0.5 text-slate-800 font-sans">
                          <p className="font-semibold text-slate-900">المادة: لغتي العربية</p>
                          <p>الصف الدراسي: {plannerGrade === 7 ? 'السابع' : plannerGrade === 8 ? 'الثامن' : 'التاسع'} الأساسي</p>
                          <p>الخطة الموزعة: {getUnitNameForWeek(plannerWeek)} (الأسبوع {plannerWeek})</p>
                          <p className="font-bold text-emerald-950">التاريخ: {getGregorianDateString(plannerDate)}م</p>
                        </div>
                      </div>

                      {/* Alternate Render based on selected Toggle */}
                      {previewFormatMode === "table" ? (
                        <div className="space-y-4">
                          {/* Table Panel 1: General lesson settings */}
                          <div className="overflow-x-auto">
                            <table className="w-full border-2 border-slate-900 text-xs border-collapse">
                              <tbody>
                                <tr className="bg-slate-100 font-extrabold border-b-2 border-slate-900 text-slate-900 font-sans">
                                  <td className="p-2 border-l border-slate-900 text-center w-[15%]">الصف الحاصل</td>
                                  <td className="p-2 border-l border-slate-900 text-center w-[15%]">الخطة الدراسية</td>
                                  <td className="p-2 border-l border-slate-900 text-center w-[20%]">فرع المادة</td>
                                  <td className="p-2 border-l border-slate-900 text-center w-[30%] font-bold text-slate-900">موضوع الدرس المستهدف</td>
                                  <td className="p-2 text-center w-[20%]">البيئة ومستوى التلاميذ</td>
                                </tr>
                                <tr className="text-slate-800 align-middle">
                                  <td className="p-2 border-l border-slate-900 text-center font-bold">الصف {plannerGrade === 7 ? 'السابع' : plannerGrade === 8 ? 'الثامن' : 'التاسع'} الأساسي</td>
                                  <td className="p-2 border-l border-slate-900 text-center font-semibold text-slate-700">{getUnitNameForWeek(plannerWeek)} (الأسبوع {plannerWeek})</td>
                                  <td className="p-2 border-l border-slate-900 text-center font-bold text-emerald-950">
                                    {plannerType === 'reading' ? '📖 درس النصوص والقراءة' : plannerType === 'grammar' ? '⚖️ النحو والقواعد اللغوية' : plannerType === 'spelling' ? '✍️ الإملاء والتطبيق الصفي' : '⏳ مراجعة وتقويم الحصيلة'}
                                  </td>
                                  <td className="p-2 border-l border-slate-900 text-center font-extrabold text-xs text-emerald-900 bg-emerald-50/10">{plannerTitle || "لا يوجد" }</td>
                                  <td className="p-2 text-center text-[10px] leading-relaxed">
                                    <span className="block font-bold">{classroomEnvironment}</span>
                                    <span className="block text-slate-500 font-semibold mt-0.5">درجة مواءمة التلاميذ: {studentReadiness}</span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Table Panel 2: Educational Blueprint */}
                          <div className="overflow-x-auto">
                            <table className="w-full border-2 border-slate-900 text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-100 font-extrabold border-b-2 border-slate-900 text-right text-slate-900">
                                  <th className="p-2 border-l border-slate-900 w-[35%] text-emerald-950 font-extrabold text-xs">🎯 الأهداف السلوكية الإجرائية (بلوم المعرفي)</th>
                                  <th className="p-2 border-l border-slate-900 w-[35%] text-emerald-950 font-extrabold text-xs">🚀 استراتيجيات جيل ألفا ومصادر تدريس المعلم</th>
                                  <th className="p-2 w-[30%] text-emerald-950 font-extrabold text-xs">📝 قياس التعلم والتكليف والواجب المنزلي</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="align-top text-slate-800 leading-relaxed font-sans">
                                  {/* Objectives */}
                                  <td className="p-2.5 border-l border-slate-900 space-y-2 text-right">
                                    <div>
                                      <span className="font-extrabold text-emerald-900 block border-b border-slate-200 pb-0.5 mb-1 text-[10px]">• التذكر والفهم:</span>
                                      <p className="text-slate-705 font-medium text-xs font-sans leading-relaxed">{currentPlanObject?.bloomObjectives.rememberUnderstand}</p>
                                    </div>
                                    <div className="pt-1.5">
                                      <span className="font-extrabold text-emerald-900 block border-b border-slate-200 pb-0.5 mb-1 text-[10px]">• التطبيق والضبط:</span>
                                      <p className="text-slate-705 font-medium text-xs font-sans leading-relaxed">{currentPlanObject?.bloomObjectives.apply}</p>
                                    </div>
                                    <div className="pt-1.5">
                                      <span className="font-extrabold text-emerald-900 block border-b border-slate-200 pb-0.5 mb-1 text-[10px]">• مهارات التفكير العليا والتحليل:</span>
                                      <p className="text-slate-705 font-medium text-xs font-sans leading-relaxed">{currentPlanObject?.bloomObjectives.analyzeCreate}</p>
                                    </div>
                                  </td>
                                  
                                  {/* Strategies and Tools */}
                                  <td className="p-2.5 border-l border-slate-900 space-y-2.5">
                                    <div>
                                      <span className="font-extrabold text-emerald-900 block border-b border-slate-200 pb-0.5 mb-1.5 text-[10px]">• الأساليب المفعلة والخطط البيداغوجية:</span>
                                      <ul className="list-disc pr-4 space-y-1 block text-slate-700 leading-relaxed font-semibold text-emerald-950 text-xs">
                                        {currentPlanObject?.alphaStrategies.map((s, idx) => (
                                          <li key={idx}>{s}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="pt-1.5 border-t border-slate-100">
                                      <span className="font-extrabold text-emerald-900 block border-b border-slate-200 pb-0.5 mb-1.5 text-[10px]">• الوسائل والمعينات ونماذج المحاضرة:</span>
                                      <ul className="list-disc pr-4 space-y-1 block text-slate-705 leading-relaxed text-[11px]">
                                        {currentPlanObject?.multimediaTools.map((t, idx) => (
                                          <li key={idx} className="font-medium">{t}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </td>
                                  
                                  {/* Homework & validation metrics */}
                                  <td className="p-2.5 space-y-2.5">
                                    <div>
                                      <span className="font-extrabold text-emerald-900 block border-b border-slate-200 pb-0.5 mb-1.5 text-[10px]">• التكليف والواجب المنزلي المطلوب كتابياً:</span>
                                      <p className="text-slate-750 font-bold bg-amber-50/50 p-2 rounded border border-amber-200 text-xs leading-relaxed">{currentPlanObject?.homework}</p>
                                    </div>
                                    <div className="pt-1 border-t border-slate-100">
                                      <span className="font-extrabold text-emerald-900 block border-b border-slate-200 pb-0.5 mb-1 text-[10px]">• التثبت والأثر التعليمي:</span>
                                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mt-1">
                                        يتابع الموجه الفني حلول التلاميذ وتصويباتهم لضمان الأمانة التحصيلية وسير التوزيع المعتمد لمدارس محافظة صنعاء لعام 1447 هـ.
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Table Panel 3: Execution steps in classroom (Timeline) */}
                          <div className="overflow-x-auto">
                            <table className="w-full border-2 border-slate-900 text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-100 font-extrabold border-b-2 border-slate-900 text-right text-slate-900">
                                  <th className="p-2 border-l border-slate-900 w-[15%] text-emerald-950 font-extrabold text-xs text-center">⏲️ خط سير الحصة</th>
                                  <th className="p-2 border-l border-slate-900 w-[25%] text-emerald-950 font-extrabold text-xs">مكوّن الدرس والتحضير</th>
                                  <th className="p-2 text-emerald-950 font-extrabold text-xs">إجراءات سير الحصة وسلوك تدريس معلم المادة للتنفيذ</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-slate-900 align-top text-slate-800 font-sans">
                                  <td className="p-2 border-l border-slate-900 text-center font-extrabold text-slate-950">5 دقائق</td>
                                  <td className="p-2 border-l border-slate-900 font-bold text-emerald-900 text-xs bg-slate-50/10">1. التمهيد وإيقاد الرغبة صفيّاً</td>
                                  <td className="p-2 text-slate-700 text-xs font-sans font-medium leading-relaxed">{currentPlanObject?.steps.warmup}</td>
                                </tr>
                                <tr className="border-b border-slate-900 align-top text-slate-800 font-sans">
                                  <td className="p-2 border-l border-slate-900 text-center font-extrabold text-slate-950">20 دقيقة</td>
                                  <td className="p-2 border-l border-slate-900 font-bold text-emerald-900 text-xs bg-slate-50/10">2. الاستكشاف والعرض والضبط المنهجي</td>
                                  <td className="p-2 text-slate-700 text-xs font-sans font-medium leading-relaxed">{currentPlanObject?.steps.exploration}</td>
                                </tr>
                                <tr className="border-b border-slate-900 align-top text-slate-800 font-sans">
                                  <td className="p-2 border-l border-slate-900 text-center font-extrabold text-slate-950">10 دقائق</td>
                                  <td className="p-2 border-l border-slate-900 font-bold text-emerald-900 text-xs bg-slate-50/10">3. التدريب الموجه وإبراز التطبيق</td>
                                  <td className="p-2 text-slate-700 text-xs font-sans font-medium leading-relaxed">{currentPlanObject?.steps.practice}</td>
                                </tr>
                                <tr className="align-top text-slate-800 font-sans">
                                  <td className="p-2 border-l border-slate-900 text-center font-extrabold text-slate-950">5 دقائق</td>
                                  <td className="p-2 border-l border-slate-900 font-bold text-emerald-900 text-xs bg-slate-50/10">4. قياس الأثر والتقويم التكويني</td>
                                  <td className="p-2 text-slate-700 text-xs font-sans font-medium leading-relaxed">{currentPlanObject?.steps.assessment}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Table Panel 4: Assessment and Metric Questions */}
                          <div className="overflow-x-auto">
                            <table className="w-full border-2 border-slate-900 text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-100 font-extrabold border-b border-slate-900 text-right text-slate-900">
                                  <th className="p-2 text-emerald-950 font-extrabold text-xs">💬 أسئلة التقويم الختامي والتكويني والتحصيل الفوري (مدونة صفيّاً)</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="p-3 space-y-2">
                                    {currentPlanObject?.questions.map((q, idx) => (
                                      <div key={idx} className="flex items-start gap-2.5 text-slate-800 font-sans font-medium">
                                        <span className="font-extrabold text-emerald-950 text-xs bg-emerald-100 px-2 py-0.5 rounded leading-none shrink-0 border border-slate-350">{idx + 1}</span>
                                        <p className="font-bold text-xs leading-relaxed">{q}</p>
                                      </div>
                                    ))}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        /* Text block view */
                        <div className="space-y-4 text-slate-800 font-sans">
                          {generatedPlan.split("\n").map((line, lid) => {
                            if (line.startsWith("# ")) {
                              return <h2 key={lid} className="text-xl font-bold text-center text-emerald-950 mt-4 mb-2">{line.replace("# ", "")}</h2>;
                            } else if (line.startsWith("## ")) {
                              return <h3 key={lid} className="text-base font-bold text-emerald-900 border-b border-emerald-800/20 pb-1 mt-6 mb-2">{line.replace("## ", "")}</h3>;
                            } else if (line.startsWith("### ")) {
                              return <h4 key={lid} className="text-sm font-bold text-amber-700 mt-4 mb-1">{line.replace("### ", "")}</h4>;
                            } else if (line.startsWith("* ")) {
                              return <p key={lid} className="text-xs list-item list-inside pr-2 text-slate-700 my-1">{line.replace("* ", "")}</p>;
                            } else if (line.trim() === "---") {
                              return <hr key={lid} className="border-slate-300 my-4" />;
                            } else if (line.startsWith("|") && generatedPlan.includes("الخطوة الزمنية")) {
                              if (line.includes("الخطوة") || line.includes("---")) return null;
                              const cells = line.split("|").filter(c => c.trim() !== "");
                              if (cells.length < 2) return null;
                              return (
                                <div key={lid} className="bg-slate-50 p-2.5 rounded border border-slate-200 my-1 flex gap-4 text-xs font-sans">
                                  <span className="font-bold text-emerald-900 whitespace-nowrap shrink-0">{cells[0]?.trim()}</span>
                                  <span className="font-medium text-slate-700">{cells[1]?.trim() || ""} - {cells[2]?.trim() || ""}</span>
                                </div>
                              );
                            } else if (line.trim() !== "") {
                              return <p key={lid} className="text-xs my-1 text-slate-700 leading-relaxed font-semibold">{line}</p>;
                            }
                            return null;
                          })}
                        </div>
                      )}

                      {/* Official Signature block for the principal / directory supervisor */}
                      <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs">
                        <div>
                          <span className="block font-semibold text-slate-700 mb-6">توقيع وملاحظات معلم المادة:</span>
                          <span className="block text-slate-400">...................................</span>
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700 mb-6">توقيع الموجه الفني الزائر:</span>
                          <span className="block text-slate-400">...................................</span>
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700 mb-6">مدير ومصادقة إدارة المدرسة:</span>
                          <span className="block text-slate-400">...................................</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 flex-grow flex flex-col items-center justify-center p-8 text-center">
                  <div className="bg-emerald-50 text-emerald-800 p-4 rounded-full mb-4">
                    <FileText className="h-10 w-10" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">جاهز لصياغة الخطة اليومية المتميزة</h3>
                  <p className="text-slate-500 text-xs max-w-md mx-auto mt-2">
                    قم بتعديل وتحرير الخيارات في الجانب الأيمن ثم انقر على زر الصياغة الذكية لإنتاج خطة درس غنية بالتوجيهات واستراتيجيات لغتي العربية ومستويات بلوم المعرفية.
                  </p>

                  <div className="mt-8 p-4 bg-emerald-50 text-emerald-950 border border-emerald-200 rounded-lg text-xs flex items-start gap-2.5 max-w-lg text-right">
                    <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <strong>توجيه تلقائي من منهجي:</strong> يمكنك الضغط مباشرة على زر <strong>&quot;إنشاء خِطّة تحضير رقمية&quot;</strong> بجانب أي فرع أو درس في جدول توزيع الفصل الدراسي ليتم تعبئة البيانات تلقائياً وتجهيز الخطة في ملمح البصر!
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div></div>
        )}

        {/* TAB 3: CURRICULUM PROGRESS & ANALYTICS */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* Navigation back bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-205 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print shadow-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("master-plan")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 rounded-lg text-xs font-bold transition-all border border-emerald-200 cursor-pointer shadow-xs"
                >
                  <ChevronRight className="h-4 w-4" />
                  رجوع لخطّة توزيع المنهج الفصلية
                </button>
                <div className="h-4 w-px bg-slate-250 bg-slate-300"></div>
                <span className="text-xs text-slate-500 font-bold">النافذة الحالية: إحصاءات التقدم والتوجيه</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">متابعة إثبات وموثوقية الأداء التعليمي الفصلي</span>
            </div>
            
            {/* General progress view */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Grade 7 Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-900">تقدم المنهج - الصف السابع</h4>
                    <span className="bg-cyan-100 text-cyan-800 font-bold text-xs px-2.5 py-0.5 rounded-full">
                      {statsG7.percent}% منجز
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-cyan-600 rounded-full" style={{ width: `${statsG7.percent}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>الدروس المنجزة: {statsG7.completed}</span>
                    <span>الإجمالي المقترح: {statsG7.total}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 mt-4 text-xs flex justify-between text-slate-600">
                  <span>أسبوع المراجعة القادم:</span>
                  <span className="font-semibold text-slate-900">الأسبوع 4 (التقويم الشهري)</span>
                </div>
              </div>

              {/* Grade 8 Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-900">تقدم المنهج - الصف الثامن</h4>
                    <span className="bg-emerald-100 text-emerald-800 font-bold text-xs px-2.5 py-0.5 rounded-full">
                      {statsG8.percent}% منجز
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${statsG8.percent}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>الدروس المنجزة: {statsG8.completed}</span>
                    <span>الإجمالي المقترح: {statsG8.total}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 mt-4 text-xs flex justify-between text-slate-600">
                  <span>أسبوع المراجعة القادم:</span>
                  <span className="font-semibold text-slate-900">الأسبوع 4 (التقويم الشهري)</span>
                </div>
              </div>

              {/* Grade 9 Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-900">تقدم المنهج - الصف التاسع</h4>
                    <span className="bg-amber-100 text-amber-800 font-bold text-xs px-2.5 py-0.5 rounded-full">
                      {statsG9.percent}% منجز
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${statsG9.percent}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>الدروس المنجزة: {statsG9.completed}</span>
                    <span>الإجمالي المقترح: {statsG9.total}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 mt-4 text-xs flex justify-between text-slate-600">
                  <span>أسبوع المراجعة القادم:</span>
                  <span className="font-semibold text-slate-900">الأسبوع 4 (التقويم الشهري)</span>
                </div>
              </div>

            </div>

            {/* Sana'a school calendar integration details */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-emerald-700" />
                هيكل التقويم الدراسي المعتمد - الفصل الأول (أمانة العاصمة صنعاء)
              </h3>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block font-bold text-emerald-800 mb-1">الربع الأول (الأسابيع 1-4)</span>
                    <p className="text-slate-600">الوقوف على الوحدات التمهيدية وتأسيس النحو، والختام بأسبوع مراجعة واختبارات لغوية لشهر محرم.</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block font-bold text-emerald-800 mb-1">الربع الثاني (الأسابيع 5-8)</span>
                    <p className="text-slate-600">التعمق في النواسخ والصرف التطبيقي والبيئة الزراعية، تليها مراجعة شاملة واختبارات شهر صفر.</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block font-bold text-emerald-800 mb-1">الربع الثالث (الأسابيع 9-12)</span>
                    <p className="text-slate-600">يتضمن سير عظماء الصحابة، التكنولوجيا والمستقبل، ثم التقويم الشامل والامتحان الشهري الثالث لربيع أول.</p>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block font-bold text-emerald-800 mb-1">الامتحانات النهائية (13-16)</span>
                    <p className="text-slate-600">مراجعة عامة وتجميع مهارات لغتي الخالدة وموضوعاتها، وختام الفصل الأول بالاختبار الوزاري والمدرسي الشامل.</p>
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 text-emerald-950 rounded-lg border border-emerald-200">
                  <h4 className="font-bold text-sm mb-1">📊 مؤشر الإنجاز والفائدة التربوية:</h4>
                  <p className="text-slate-700 leading-relaxed">
                    من خلال تمييز الدروس المكتملة في التبويب الأول (توزيع خطة الفصل)، يقوم النظام بحساب الفاقد التعليمي المتبقي وعرضه تلقائياً لمكتب التوجيه التربوي لمطابقته مع دفتر الحضور الصفي الفعلي للمعلم. هذا التخطيط يحمي المنهج الدراسي كهدف تحصيلي أساسي ويلتزم بعدم تفويت أي درس لتلاميذنا الأحباء.
                  </p>
                </div>
              </div>
            </div>

            {/* Custom Notes Organizer */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Bookmark className="h-5 w-5 text-amber-500" />
                دفتر ملاحظات المعلم والتوجيه الفني
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                دون ملاحظاتك السريعة لبيئة الفصول والتقويم الفردي أو توجيهات الموجه الزائر المدرسية، ويتم الاحتفاظ بها تلقائياً في متصفحك.
              </p>

              {activeNoteKey ? (
                <div className="space-y-3 p-4 bg-amber-50/20 border border-amber-300 rounded-lg">
                  <h4 className="text-xs font-bold text-slate-700">تعديل الملاحظة لـ: {activeNoteKey.replace(/-/g, " | ")}</h4>
                  <textarea
                    value={currentEditNote}
                    onChange={(e) => setCurrentEditNote(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-700 focus:outline-none h-24"
                    placeholder="اكتب توجيهات الموجه الفني، أو خطتك لتعديل التدريس لجيل ألفا..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveNote}
                      className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs px-4 py-1.5 rounded"
                    >
                      حفظ الملاحظة
                    </button>
                    <button
                      onClick={() => setActiveNoteKey(null)}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-4 py-1.5 rounded"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[7, 8, 9].map((g) => (
                    <div key={g} className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 mb-2">الصف {g === 7 ? 'السابع' : g === 8 ? 'الثامن' : 'التاسع'} الأساسي</h4>
                        <p className="text-xs text-slate-600 line-clamp-3 italic">
                          {teacherNotes[`notes-grade-${g}`] || "لا توجد ملاحظات عامة مدونة بعد. انقر لإضافة ملحوظة تنافس مستويات بلوم وجيل ألفا."}
                        </p>
                      </div>
                      <button
                        onClick={() => handleOpenNote(`notes-grade-${g}`)}
                        className="text-emerald-700 hover:text-emerald-900 text-xs font-bold self-start mt-3"
                      >
                        {teacherNotes[`notes-grade-${g}`] ? "تعديل الملاحظة" : "+ إضافة ملاحظة وتوجيه تربوي"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Footer Branding of AI Studio */}
      <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 text-center text-xs mt-12 no-print">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© {new Date().getFullYear()} منهجي - جميع الحقوق محفوظة لدى وزارة التربية والتعليم بالجمهورية اليمنية.</p>
          <p className="text-slate-500">تم التطوير لتسهيل تمكين المعلمين الأجلاء من تحضير لغتي العربية بكفاءة وتقنيات ذكية متطورة.</p>
        </div>
      </footer>
    </div>
  );
}
