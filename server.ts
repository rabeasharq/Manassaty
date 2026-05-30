import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API router / endpoints
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", time: new Date().toISOString() });
  });

  // AI Planner endpoint
  app.post("/api/generate-lesson", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({ 
          error: "API_KEY_MISSING",
          message: "مفتاح الوصول غير مهيأ. يرجى تهيئة مفتاح جيميناي (GEMINI_API_KEY) في لوحة الأسرار." 
        });
      }

      const { 
        grade, 
        week, 
        lessonName, 
        type, 
        customInstruction, 
        contextData,
        studentReadiness,
        classroomEnvironment,
        selectedStrategy 
      } = req.body;

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const promptHtmlPrompt = `
        صفتك خبير تربوي وموجه لمادة اللغة العربية للمناهج اليمنية وبمواصفات تخدم جيل ألفا (الجيل الرقمي التفاعلي).
        أريد منك إعداد درس يومي نموذجي متكامل للصف ${grade === 7 ? 'السابع' : grade === 8 ? 'الثامن' : 'التاسع'} من مرحلة التعليم الأساسي في اليمن.
        الأسبوع في الخطة: ${week}
        اسم الدرس: "${lessonName}"
        نوع الدرس: "${type}"
        بيانات الدرس الأصلية للتوجيه: ${JSON.stringify(contextData || {})}
        
        مستوى استعداد الطلاب في الصف: "${studentReadiness || 'متوسط'}"
        بيئة المدرسة والإمكانيات المتوفرة: "${classroomEnvironment || 'حضرية نموذجية'}"
        الاستراتيجية البيداغوجية المفضلة لجيل ألفا: "${selectedStrategy || 'الاستراتيجية الافتراضية المقترحة بالأسبوع'}"

        طلب خاص إضافي من المعلم لتعديل الدرس: ${customInstruction || "لا يوجد طلبات خاصة إضافية"}

        يرجى صياغة مكونات خطة الدرس اليومية متضمنة ما يلي وباللغة العربية الفصحى الأنيقة:
        1. الأهداف السلوكية الإجرائية (وفق تصنيف بلوم مع تكييفها لمستوى الطلاب "${studentReadiness || 'متوسط'}": التذكر والفهم، التطبيق، مستويات التفكير العليا كالتحليل والابتكار البناء).
        2. استراتيجيات التدريس المقترحة لجيل ألفا (التعلم النشط المختار: "${selectedStrategy || 'الاستراتيجية الافتراضية'}").
        3. التوجيهات والأنشطة والوسائط لجيل ألفا (مع تكييفها تماماً لنوع بيئة وإمكانيات المدرسة: "${classroomEnvironment || 'حضرية نموذجية'}" - إذا كانت ريفية، تجنب طلب عرض بروجيكتور أو استخدام إنترنت تفاعلي صفي مباشر واعتمد على البدائل والأوراق الملموسة).
        4. سير الحصة الدراسية (التمهيد وإثارة الدافعية 5 دقائق، العرض والتفاعل 20 دقيقة المعتمد على استنباط الأفكار من كتاب المنهج اليمني، التطبيق والتغذية الراجعة 10 دقائق، التقويم الختامي والواجب المنزلي 5 دقائق).
        5. أسئلة التقويم المقترحة (الموجهة لقياس الفهم الفعلي للدرس).
        
        اكتب الخطة بتنسيق ماركداون (Markdown) منظم جداً مع تفاصيل غنية حتى يستفيد المعلم مباشرة في طباعتها.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptHtmlPrompt,
        config: {
          temperature: 0.7,
        }
      });

      const resultText = response.text || "لم يتمكن النموذج من تقديم استجابة.";
      res.json({ success: true, text: resultText });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ 
        error: "SERVER_GEN_ERROR", 
        message: error?.message || "حدث خطأ غير متوقع أثناء تخطيط الحصة" 
      });
    }
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
