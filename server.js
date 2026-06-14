const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 20;
const IS_PUBLIC_RUNTIME = Boolean(process.env.RENDER || process.env.NODE_ENV === "production");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PUBLIC_RUNTIME ? "" : "admin123");
const BUNDLED_DATA_FILE = path.join(__dirname, "data.json");
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(process.env.DATA_DIR || __dirname, "data.json");
let dataMutationQueue = Promise.resolve();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const data = normalizeData(JSON.parse(raw));
    if (!data.colleges?.length && !data.mentors?.length && !data.intentions?.length) {
      const seed = await loadInitialData();
      await writeData(seed);
      return seed;
    }
    return data;
  } catch (error) {
    if (error.code === "ENOENT") {
      const seed = await loadInitialData();
      await writeData(seed);
      return seed;
    }
    throw error;
  }
}

async function writeData(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(normalizeData(data), null, 2)}\n`, "utf8");
  await fs.rename(tempFile, DATA_FILE);
}

function updateData(mutator) {
  const run = dataMutationQueue.then(async () => {
    const data = await readData();
    const result = await mutator(data);
    await writeData(data);
    return result;
  });
  dataMutationQueue = run.catch(() => {});
  return run;
}

function normalizeData(data) {
  return {
    colleges: Array.isArray(data?.colleges) ? data.colleges.map(normalizeCollege) : [],
    mentors: Array.isArray(data?.mentors) ? data.mentors : [],
    intentions: Array.isArray(data?.intentions) ? data.intentions : []
  };
}

function normalizeCollege(college) {
  const campName = college?.campName || "";
  return {
    ...college,
    programType: college?.programType || (campName.includes("预推免") ? "预推免" : "夏令营")
  };
}

async function loadInitialData() {
  if (path.resolve(DATA_FILE) !== path.resolve(BUNDLED_DATA_FILE)) {
    try {
      const raw = await fs.readFile(BUNDLED_DATA_FILE, "utf8");
      return normalizeData(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return createSeedData();
}

function createSeedData() {
  const now = new Date().toISOString();
  return {
    colleges: [
      {
        id: "college_xjtu_me",
        school: "西安交通大学",
        college: "机械工程学院",
        campName: "优秀大学生夏令营",
        deadline: "2026-06-30",
        courses: "机械设计基础、控制工程基础、材料力学",
        reviewMaterials: "历年面试经验、机械设计基础重点、英文自我介绍模板",
        notes: "请以学院官网通知为准。",
        relatedLink: "",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "college_xjtu_auto",
        school: "西安交通大学",
        college: "自动化科学与工程学院",
        campName: "优秀大学生夏令营",
        deadline: "2026-07-02",
        courses: "自动控制原理、现代控制理论、信号与系统",
        reviewMaterials: "控制原理题库、科研项目问答、专业英语词汇",
        notes: "适合机器人、控制、智能系统方向同学关注。",
        relatedLink: "",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "college_zju_me",
        school: "浙江大学",
        college: "机械工程学院",
        campName: "优秀大学生夏令营",
        deadline: "2026-06-25",
        courses: "机械原理、机械设计、工程力学",
        reviewMaterials: "导师组介绍、面试问题清单、简历准备清单",
        notes: "方向覆盖智能制造、机器人、机电系统。",
        relatedLink: "http://me.zju.edu.cn/mecn/2026/0601/c6202a3168458/page.htm",
        createdAt: now,
        updatedAt: now
      }
    ],
    mentors: [
      {
        id: "mentor_xjtu_me_1",
        collegeId: "college_xjtu_me",
        name: "张老师",
        title: "教授",
        direction: "机器人机构学、智能装备设计",
        journals: "IEEE T-RO、Mechanism and Machine Theory",
        profile: "关注机器人机构创新设计与高端装备应用。",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "mentor_xjtu_me_2",
        collegeId: "college_xjtu_me",
        name: "李老师",
        title: "副教授",
        direction: "精密传动、智能制造系统",
        journals: "Robotics and Computer-Integrated Manufacturing、机械工程学报",
        profile: "研究智能制造装备、传动系统建模与优化。",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "mentor_xjtu_auto_1",
        collegeId: "college_xjtu_auto",
        name: "王老师",
        title: "教授",
        direction: "机器人控制、强化学习、智能感知",
        journals: "Automatica、IEEE TAC、IEEE T-ASE",
        profile: "面向机器人自主控制与智能系统决策。",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "mentor_zju_me_1",
        collegeId: "college_zju_me",
        name: "陈老师",
        title: "教授",
        direction: "智能机器人、软体机器人、机电一体化",
        journals: "Science Robotics、IEEE Robotics and Automation Letters",
        profile: "研究新型机器人系统设计与智能交互。",
        createdAt: now,
        updatedAt: now
      }
    ],
    intentions: [
      {
        id: "intent_1",
        collegeId: "college_xjtu_me",
        mentorId: "mentor_xjtu_me_1",
        studentName: "示例同学",
        major: "机器人工程",
        gradeRank: "前 10%",
        contact: "example@example.com",
        note: "想了解机构学和机器人设计方向。",
        createdAt: now
      }
    ]
  };
}

function requiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${fieldName} 不能为空`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalUrl(value, fieldName = "相关链接") {
  const url = optionalString(value);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Fall through to a consistent validation message.
  }

  const error = new Error(`${fieldName} 必须是 http:// 或 https:// 开头的网址`);
  error.status = 400;
  throw error;
}

function requireAdmin(req, res, next) {
  const password = req.get("x-admin-password") || req.body?.adminPassword || "";
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "管理员密码错误或未登录" });
  }
  next();
}

function buildCollegeSummary(data) {
  return data.colleges
    .map((college) => {
      const mentors = data.mentors.filter((mentor) => mentor.collegeId === college.id);
      const intentions = data.intentions.filter((item) => item.collegeId === college.id);
      return {
        ...college,
        mentorCount: mentors.length,
        intentionCount: intentions.length,
        directions: [...new Set(mentors.map((mentor) => mentor.direction).filter(Boolean))],
        interestedStudents: intentions.map((item) => ({
          studentName: item.studentName,
          mentorId: item.mentorId,
          mentorName: mentors.find((mentor) => mentor.id === item.mentorId)?.name || "未指定导师",
          major: item.major,
          gradeRank: item.gradeRank,
          note: item.note,
          createdAt: item.createdAt
        }))
      };
    })
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

app.get("/api/colleges", async (_req, res, next) => {
  try {
    const data = await readData();
    res.json(buildCollegeSummary(data));
  } catch (error) {
    next(error);
  }
});

app.get("/api/colleges/:collegeId", async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    const mentors = data.mentors
      .filter((mentor) => mentor.collegeId === college.id)
      .map((mentor) => ({
        ...mentor,
        intentions: data.intentions.filter((item) => item.mentorId === mentor.id)
      }));

    res.json({
      ...college,
      mentors,
      unassignedIntentions: data.intentions.filter(
        (item) => item.collegeId === college.id && !item.mentorId
      )
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", (req, res) => {
  if ((req.body?.password || "") !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "管理员密码错误" });
  }
  res.json({ ok: true });
});

app.post("/api/colleges", async (req, res, next) => {
  try {
    const data = await readData();
    const now = new Date().toISOString();
    const college = {
      id: id("college"),
      school: requiredString(req.body.school, "学校"),
      college: requiredString(req.body.college, "学院"),
      programType: optionalString(req.body.programType) || "夏令营",
      campName: requiredString(req.body.campName, "夏令营名称"),
      deadline: requiredString(req.body.deadline, "截止时间"),
      courses: optionalString(req.body.courses),
      reviewMaterials: optionalString(req.body.reviewMaterials),
      notes: optionalString(req.body.notes),
      relatedLink: optionalUrl(req.body.relatedLink),
      createdAt: now,
      updatedAt: now
    };
    data.colleges.push(college);
    await writeData(data);
    res.status(201).json(college);
  } catch (error) {
    next(error);
  }
});

app.put("/api/colleges/:collegeId", requireAdmin, async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    college.school = requiredString(req.body.school, "学校");
    college.college = requiredString(req.body.college, "学院");
    college.programType = optionalString(req.body.programType) || college.programType || "夏令营";
    college.campName = requiredString(req.body.campName, "夏令营名称");
    college.deadline = requiredString(req.body.deadline, "截止时间");
    college.courses = optionalString(req.body.courses);
    college.reviewMaterials = optionalString(req.body.reviewMaterials);
    college.notes = optionalString(req.body.notes);
    college.relatedLink = optionalUrl(req.body.relatedLink);
    college.updatedAt = new Date().toISOString();

    await writeData(data);
    res.json(college);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/colleges/:collegeId", requireAdmin, async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    data.colleges = data.colleges.filter((item) => item.id !== college.id);
    data.mentors = data.mentors.filter((item) => item.collegeId !== college.id);
    data.intentions = data.intentions.filter((item) => item.collegeId !== college.id);

    await writeData(data);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/colleges/:collegeId/mentors", async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    const now = new Date().toISOString();
    const mentor = {
      id: id("mentor"),
      collegeId: college.id,
      name: requiredString(req.body.name, "导师姓名"),
      title: (req.body.title || "").trim(),
      direction: requiredString(req.body.direction, "研究方向"),
      journals: (req.body.journals || "").trim(),
      profile: (req.body.profile || "").trim(),
      createdAt: now,
      updatedAt: now
    };
    data.mentors.push(mentor);
    college.updatedAt = now;
    await writeData(data);
    res.status(201).json(mentor);
  } catch (error) {
    next(error);
  }
});

app.put("/api/colleges/:collegeId/mentors/:mentorId", requireAdmin, async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    const mentor = data.mentors.find(
      (item) => item.id === req.params.mentorId && item.collegeId === college.id
    );
    if (!mentor) return res.status(404).json({ message: "导师不存在" });

    mentor.name = requiredString(req.body.name, "导师姓名");
    mentor.title = optionalString(req.body.title);
    mentor.direction = requiredString(req.body.direction, "研究方向");
    mentor.journals = optionalString(req.body.journals);
    mentor.profile = optionalString(req.body.profile);
    mentor.updatedAt = new Date().toISOString();
    college.updatedAt = mentor.updatedAt;

    await writeData(data);
    res.json(mentor);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/colleges/:collegeId/mentors/:mentorId", requireAdmin, async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    const mentor = data.mentors.find(
      (item) => item.id === req.params.mentorId && item.collegeId === college.id
    );
    if (!mentor) return res.status(404).json({ message: "导师不存在" });

    data.mentors = data.mentors.filter((item) => item.id !== mentor.id);
    data.intentions = data.intentions.map((item) =>
      item.mentorId === mentor.id ? { ...item, mentorId: "" } : item
    );
    college.updatedAt = new Date().toISOString();

    await writeData(data);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/colleges/:collegeId/intentions", async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    const mentorId = (req.body.mentorId || "").trim();
    if (mentorId && !data.mentors.some((mentor) => mentor.id === mentorId && mentor.collegeId === college.id)) {
      return res.status(400).json({ message: "导师不属于当前学院" });
    }

    const intention = {
      id: id("intent"),
      collegeId: college.id,
      mentorId,
      studentName: requiredString(req.body.studentName, "学生姓名"),
      major: (req.body.major || "").trim(),
      gradeRank: (req.body.gradeRank || "").trim(),
      contact: (req.body.contact || "").trim(),
      note: (req.body.note || "").trim(),
      createdAt: new Date().toISOString()
    };
    data.intentions.push(intention);
    await writeData(data);
    res.status(201).json(intention);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/colleges/:collegeId/intentions/:intentionId", requireAdmin, async (req, res, next) => {
  try {
    const data = await readData();
    const college = data.colleges.find((item) => item.id === req.params.collegeId);
    if (!college) return res.status(404).json({ message: "学院不存在" });

    const beforeCount = data.intentions.length;
    data.intentions = data.intentions.filter(
      (item) => !(item.id === req.params.intentionId && item.collegeId === college.id)
    );
    if (data.intentions.length === beforeCount) {
      return res.status(404).json({ message: "意向不存在" });
    }

    await writeData(data);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({ message: error.message || "服务器错误" });
});

function startServer(port, attemptsLeft = MAX_PORT_ATTEMPTS) {
  const server = app.listen(port, () => {
    const actualPort = server.address().port;
    console.log(`推免辅助系统已启动：http://localhost:${actualPort}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log("当前使用默认管理员密码 admin123，公开部署前请设置 ADMIN_PASSWORD。");
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT && attemptsLeft > 0) {
      console.log(`端口 ${port} 已被占用，正在尝试 ${port + 1}。`);
      startServer(port + 1, attemptsLeft - 1);
      return;
    }

    if (error.code === "EADDRINUSE") {
      console.error(`端口 ${port} 已被占用。请关闭占用进程，或指定其他端口后重试。`);
      console.error("PowerShell 示例：$env:PORT=3001; npm start");
      process.exit(1);
    }

    throw error;
  });
}

startServer(DEFAULT_PORT);
