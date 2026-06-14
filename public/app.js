const STATIC_DATA_STORAGE_KEY = "cqu_me_robot_static_data_v6";
const ADMIN_PASSWORD_STORAGE_KEY = "adminPassword";
const STATIC_ADMIN_PASSWORD = "admin123";
const GENERATED_SOURCE = "mentor-evaluation-2025";
const DIRECTORY_PROGRAM_TYPE = "学院目录";

const state = {
  colleges: [],
  admissions: [],
  selectedCollegeId: "",
  selectedCollege: null,
  selectedAdmissionId: "",
  selectedAdmission: null,
  search: "",
  typeFilter: "all",
  activeView: "colleges",
  selectedGroupKey: "",
  selectedGroup: null,
  isAdmin: false,
  adminPassword: sessionStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || "",
  usingBackend: false,
  expandedSchools: new Set()
};

let staticData = null;

const collegeRows = document.querySelector("#collegeRows");
const collegeDetail = document.querySelector("#collegeDetail");
const summaryText = document.querySelector("#summaryText");
const searchInput = document.querySelector("#searchInput");
const typeFilter = document.querySelector("#typeFilter");
const tableHead = document.querySelector("#tableHead");
const adminButton = document.querySelector("#adminButton");

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeData(data) {
  return {
    colleges: Array.isArray(data?.colleges) ? data.colleges.map(normalizeCollege) : [],
    mentors: Array.isArray(data?.mentors) ? data.mentors : [],
    intentions: Array.isArray(data?.intentions) ? data.intentions : [],
    admissions: Array.isArray(data?.admissions) ? data.admissions : []
  };
}

function normalizeCollege(college) {
  const campName = college?.campName || "";
  return {
    ...college,
    programType: college?.programType || (campName ? (campName.includes("预推免") ? "预推免" : "夏令营") : DIRECTORY_PROGRAM_TYPE)
  };
}

function deadlineTime(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function programRank(type) {
  return { 学院目录: 0, 夏令营: 1, 预推免: 2, 导师评价: 3 }[type] || 9;
}

function isDirectoryRecord(college) {
  return college?.programType === DIRECTORY_PROGRAM_TYPE;
}

function isMentorEvaluation(college) {
  return college?.programType === "导师评价" || college?.source === "mentor-evaluation-2025";
}

function isNoticeRecord(college) {
  return !isDirectoryRecord(college) && !isMentorEvaluation(college);
}

function sourceLabel(college) {
  if (college?.schoolLevel) return college.schoolLevel;
  if (college?.school?.includes("中国科学院") || college?.school?.includes("中科院")) return "中科院";
  return "";
}

function badgeHtml(text, tone = "") {
  if (!text) return "";
  return `<span class="category-badge ${tone}">${escapeHtml(text)}</span>`;
}

function formatRating(value) {
  return typeof value === "number" ? value.toFixed(2).replace(/\.?0+$/, "") : "";
}

const formatDate = (value) => {
  if (!value) return "未填写";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function requiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} 不能为空`);
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
    // Keep the user-facing validation message consistent.
  }

  throw new Error(`${fieldName} 必须是 http:// 或 https:// 开头的网址`);
}

function buildCollegeSummary(data) {
  return data.colleges
    .map((college) => {
      const mentors = data.mentors.filter((mentor) => mentor.collegeId === college.id);
      const intentions = data.intentions.filter((item) => item.collegeId === college.id);
      const directionKeywords = mentors.flatMap((mentor) => mentor.keywords || []);

      return {
        ...college,
        mentorCount: mentors.length,
        intentionCount: intentions.length,
        directions: [
          ...new Set([
            ...(Array.isArray(college.keywords) ? college.keywords : []),
            ...directionKeywords,
            ...mentors.map((mentor) => mentor.direction).filter(Boolean)
          ])
        ],
        mentorNames: mentors.map((mentor) => mentor.name).filter(Boolean),
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
    .sort(
      (a, b) =>
        a.school.localeCompare(b.school, "zh-CN") ||
        a.college.localeCompare(b.college, "zh-CN") ||
        programRank(a.programType) - programRank(b.programType) ||
        deadlineTime(a.deadline) - deadlineTime(b.deadline)
    );
}

function getCollegeDetail(data, collegeId) {
  const college = data.colleges.find((item) => item.id === collegeId);
  if (!college) throw new Error("学院不存在");

  const mentors = data.mentors
    .filter((mentor) => mentor.collegeId === college.id)
    .map((mentor) => ({
      ...mentor,
      intentions: data.intentions.filter((item) => item.mentorId === mentor.id)
    }));

  return {
    ...college,
    mentors,
    unassignedIntentions: data.intentions.filter(
      (item) => item.collegeId === college.id && !item.mentorId
    )
  };
}

async function requestBackend(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  if (state.adminPassword) {
    headers["X-Admin-Password"] = state.adminPassword;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }
  return payload;
}

async function loadStaticData() {
  if (staticData) return staticData;

  const stored = localStorage.getItem(STATIC_DATA_STORAGE_KEY);
  if (stored) {
    staticData = normalizeData(JSON.parse(stored));
    return staticData;
  }

  const response = await fetch("data.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("静态数据加载失败");
  }
  staticData = normalizeData(await response.json());
  return staticData;
}

function saveStaticData() {
  localStorage.setItem(STATIC_DATA_STORAGE_KEY, JSON.stringify(staticData));
}

function routeParts(path) {
  const url = new URL(path, window.location.href);
  const parts = url.pathname.split("/").filter(Boolean);
  const apiIndex = parts.lastIndexOf("api");
  return apiIndex >= 0 ? parts.slice(apiIndex + 1) : parts;
}

async function localApi(path, options = {}) {
  const data = await loadStaticData();
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const parts = routeParts(path);

  if (parts[0] === "admin" && parts[1] === "login" && method === "POST") {
    if ((body.password || "") !== STATIC_ADMIN_PASSWORD) {
      throw new Error("管理员密码错误");
    }
    return { ok: true };
  }

  if (parts[0] === "admissions" && parts.length === 1 && method === "GET") {
    return clone(data.admissions || []);
  }

  if (parts[0] !== "colleges") {
    throw new Error("请求地址不存在");
  }

  if (parts.length === 1 && method === "GET") {
    return clone(buildCollegeSummary(data));
  }

  if (parts.length === 1 && method === "POST") {
    const now = new Date().toISOString();
    const programType = optionalString(body.programType) || DIRECTORY_PROGRAM_TYPE;
    const college = {
      id: id("college"),
      school: requiredString(body.school, "学校"),
      college: requiredString(body.college, "学院"),
      programType,
      campName: optionalString(body.campName),
      deadline: optionalString(body.deadline),
      courses: optionalString(body.courses),
      reviewMaterials: optionalString(body.reviewMaterials),
      notes: optionalString(body.notes),
      relatedLink: optionalUrl(body.relatedLink),
      createdAt: now,
      updatedAt: now
    };
    data.colleges.push(college);
    saveStaticData();
    return clone(college);
  }

  const collegeId = parts[1];
  const college = data.colleges.find((item) => item.id === collegeId);
  if (!college) throw new Error("学院不存在");

  if (parts.length === 2 && method === "GET") {
    return clone(getCollegeDetail(data, collegeId));
  }

  if (parts.length === 2 && method === "PUT") {
    college.school = requiredString(body.school, "学校");
    college.college = requiredString(body.college, "学院");
    college.programType = optionalString(body.programType) || college.programType || DIRECTORY_PROGRAM_TYPE;
    college.campName = optionalString(body.campName);
    college.deadline = optionalString(body.deadline);
    college.courses = optionalString(body.courses);
    college.reviewMaterials = optionalString(body.reviewMaterials);
    college.notes = optionalString(body.notes);
    college.relatedLink = optionalUrl(body.relatedLink);
    college.updatedAt = new Date().toISOString();
    saveStaticData();
    return clone(college);
  }

  if (parts.length === 2 && method === "DELETE") {
    data.colleges = data.colleges.filter((item) => item.id !== collegeId);
    data.mentors = data.mentors.filter((item) => item.collegeId !== collegeId);
    data.intentions = data.intentions.filter((item) => item.collegeId !== collegeId);
    staticData = data;
    saveStaticData();
    return { ok: true };
  }

  if (parts[2] === "mentors" && parts.length === 3 && method === "POST") {
    const now = new Date().toISOString();
    const mentor = {
      id: id("mentor"),
      collegeId,
      name: requiredString(body.name, "导师姓名"),
      title: optionalString(body.title),
      direction: requiredString(body.direction, "研究方向"),
      journals: optionalString(body.journals),
      profile: optionalString(body.profile),
      createdAt: now,
      updatedAt: now
    };
    data.mentors.push(mentor);
    college.updatedAt = now;
    saveStaticData();
    return clone(mentor);
  }

  if (parts[2] === "mentors" && parts.length === 4) {
    const mentorId = parts[3];
    const mentor = data.mentors.find((item) => item.id === mentorId && item.collegeId === collegeId);
    if (!mentor) throw new Error("导师不存在");

    if (method === "PUT") {
      mentor.name = requiredString(body.name, "导师姓名");
      mentor.title = optionalString(body.title);
      mentor.direction = requiredString(body.direction, "研究方向");
      mentor.journals = optionalString(body.journals);
      mentor.profile = optionalString(body.profile);
      mentor.updatedAt = new Date().toISOString();
      college.updatedAt = mentor.updatedAt;
      saveStaticData();
      return clone(mentor);
    }

    if (method === "DELETE") {
      data.mentors = data.mentors.filter((item) => item.id !== mentorId);
      data.intentions = data.intentions.map((item) =>
        item.mentorId === mentorId ? { ...item, mentorId: "" } : item
      );
      staticData = data;
      college.updatedAt = new Date().toISOString();
      saveStaticData();
      return { ok: true };
    }
  }

  if (parts[2] === "intentions" && parts.length === 3 && method === "POST") {
    const mentorId = optionalString(body.mentorId);
    if (mentorId && !data.mentors.some((mentor) => mentor.id === mentorId && mentor.collegeId === collegeId)) {
      throw new Error("导师不属于当前学院");
    }

    const intention = {
      id: id("intent"),
      collegeId,
      mentorId,
      studentName: requiredString(body.studentName, "学生姓名"),
      major: optionalString(body.major),
      gradeRank: optionalString(body.gradeRank),
      contact: optionalString(body.contact),
      note: optionalString(body.note),
      createdAt: new Date().toISOString()
    };
    data.intentions.push(intention);
    saveStaticData();
    return clone(intention);
  }

  if (parts[2] === "intentions" && parts.length === 4 && method === "DELETE") {
    const intentionId = parts[3];
    const beforeCount = data.intentions.length;
    data.intentions = data.intentions.filter(
      (item) => !(item.id === intentionId && item.collegeId === collegeId)
    );
    if (data.intentions.length === beforeCount) {
      throw new Error("意向不存在");
    }
    staticData = data;
    saveStaticData();
    return { ok: true };
  }

  throw new Error("请求地址不存在");
}

async function api(path, options = {}) {
  if (state.usingBackend) {
    return requestBackend(path, options);
  }
  return localApi(path, options);
}

async function initializeDataSource() {
  try {
    await requestBackend("api/colleges");
    state.usingBackend = true;
  } catch {
    state.usingBackend = false;
    await loadStaticData();
  }
}

async function loadColleges(selectFirst = true) {
  state.colleges = await api("api/colleges");
  state.admissions = await api("api/admissions").catch(() => []);
  if (state.activeView === "admissions") {
    renderAdmissionsView();
    return;
  }
  const groups = buildCollegeGroups();
  if (selectFirst && !state.selectedGroupKey && groups.length) {
    state.selectedGroupKey = groups[0].key;
  }
  const selectedGroup = groups.find((group) => group.key === state.selectedGroupKey);
  if (selectedGroup) {
    state.expandedSchools.add(selectedGroup.school);
    renderCollegeRows();
    await loadCollegeGroup(selectedGroup.key, false);
  } else {
    state.selectedGroupKey = "";
    state.selectedGroup = null;
    state.selectedCollegeId = "";
    state.selectedCollege = null;
    renderCollegeRows();
    renderEmptyDetail();
  }
}

async function loadCollegeDetail(collegeId) {
  state.selectedCollegeId = collegeId;
  state.selectedCollege = await api(`api/colleges/${collegeId}`);
  if (state.selectedCollege?.school) {
    state.expandedSchools.add(state.selectedCollege.school);
  }
  renderCollegeRows();
  renderCollegeDetail();
}

async function loadCollegeGroup(groupKey, rerenderRows = true) {
  const group = buildCollegeGroups().find((item) => item.key === groupKey);
  if (!group) {
    state.selectedGroupKey = "";
    state.selectedGroup = null;
    state.selectedCollegeId = "";
    state.selectedCollege = null;
    renderCollegeRows();
    renderEmptyDetail();
    return;
  }

  state.selectedGroupKey = group.key;
  state.expandedSchools.add(group.school);
  const records = await Promise.all(group.records.map((record) => api(`api/colleges/${record.id}`)));
  state.selectedGroup = { ...group, records };
  state.selectedCollege = records[0] || null;
  state.selectedCollegeId = records[0]?.id || "";
  if (rerenderRows) renderCollegeRows();
  renderCollegeGroupDetail();
}

function filteredColleges() {
  const keyword = state.search.trim().toLowerCase();
  return state.colleges.filter((college) => {
    if (state.typeFilter === "notice" && !isNoticeRecord(college)) return false;
    if (state.typeFilter !== "all" && state.typeFilter !== "notice" && college.programType !== state.typeFilter) return false;
    if (!keyword) return true;
    const haystack = [
      college.school,
      college.college,
      college.campName,
      college.courses,
      college.reviewMaterials,
      college.notes,
      college.relatedLink,
      college.programType,
      college.schoolLevel,
      college.directions?.join(" "),
      college.mentorNames?.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });
}

function relatedLinkHtml(link, text = "相关链接") {
  if (!link) return '<span class="muted">暂无链接</span>';
  return `<a class="link-pill" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

function groupKeyFor(school, college) {
  return `${school}|||${college}`;
}

function groupKeyForCollege(college) {
  return groupKeyFor(college.school, college.college);
}

function buildCollegeGroups(colleges = state.colleges) {
  const groups = new Map();
  for (const college of colleges) {
    const key = groupKeyForCollege(college);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        school: college.school,
        college: college.college,
        records: [],
        mentorCount: 0,
        intentionCount: 0,
        evaluationRecordCount: 0,
        keywords: [],
        mentorNames: [],
        schoolLevel: sourceLabel(college)
      });
    }
    const group = groups.get(key);
    group.records.push(college);
    group.mentorCount += college.mentorCount || 0;
    group.intentionCount += college.intentionCount || 0;
    group.evaluationRecordCount += isMentorEvaluation(college) ? college.recordCount || 0 : 0;
    group.keywords.push(...(college.keywords || []), ...(college.directions || []));
    group.mentorNames.push(...(college.mentorNames || []));
    if (!group.schoolLevel) group.schoolLevel = sourceLabel(college);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      records: group.records.sort(
        (a, b) => programRank(a.programType) - programRank(b.programType) || deadlineTime(a.deadline) - deadlineTime(b.deadline)
      ),
      notices: group.records.filter(isNoticeRecord),
      evaluations: group.records.filter(isMentorEvaluation),
      keywords: [...new Set(group.keywords.filter(Boolean))],
      mentorNames: [...new Set(group.mentorNames.filter(Boolean))]
    }))
    .sort(
      (a, b) =>
        a.school.localeCompare(b.school, "zh-CN") ||
        a.college.localeCompare(b.college, "zh-CN")
    );
}

function toggleSchool(school) {
  if (state.expandedSchools.has(school)) {
    state.expandedSchools.delete(school);
  } else {
    state.expandedSchools.add(school);
  }
  renderCollegeRows();
}

function renderCollegeRows() {
  tableHead.innerHTML = `
    <tr>
      <th>学院 / 类型</th>
      <th>项目</th>
      <th>时间 / 规模</th>
      <th>关键词 / 资料</th>
      <th>导师 / 数据</th>
    </tr>
  `;
  typeFilter.hidden = false;
  const rows = filteredColleges();
  const mentorCount = state.colleges.reduce((sum, college) => sum + college.mentorCount, 0);
  const intentionCount = state.colleges.reduce((sum, college) => sum + college.intentionCount, 0);
  const schoolCount = new Set(state.colleges.map((college) => college.school)).size;
  const schoolCollegeCount = new Set(state.colleges.map((college) => `${college.school}|${college.college}`)).size;
  summaryText.textContent = `${schoolCount} 所学校，${schoolCollegeCount} 个学院，${mentorCount} 位导师，${intentionCount} 条意向`;
  const isSearching = Boolean(state.search.trim());

  const collegeGroups = buildCollegeGroups(rows);
  const schoolGroups = collegeGroups.reduce((groups, group) => {
    if (!groups.has(group.school)) groups.set(group.school, []);
    groups.get(group.school).push(group);
    return groups;
  }, new Map());

  collegeRows.innerHTML = [...schoolGroups.entries()]
    .map(([school, groups]) => {
      const schoolMentorCount = groups.reduce((sum, group) => sum + group.mentorCount, 0);
      const noticeCount = groups.reduce((sum, group) => sum + group.notices.length, 0);
      const evaluationCount = groups.reduce((sum, group) => sum + group.evaluations.length, 0);
      const schoolLevel = groups.map((group) => group.schoolLevel).find(Boolean);
      const expanded = isSearching || state.expandedSchools.has(school);
      const schoolHeader = `
        <tr class="school-row ${expanded ? "expanded" : ""}" data-school="${escapeHtml(school)}">
          <td colspan="5">
            <div class="school-row-content">
              <span class="school-toggle">${expanded ? "−" : "+"}</span>
              <strong>${escapeHtml(school)}</strong>
              <span>${groups.length} 个学院 · ${noticeCount} 条通知 · ${evaluationCount} 个导师评价入口 · ${schoolMentorCount} 位导师</span>
              ${badgeHtml(schoolLevel, "school-level")}
            </div>
          </td>
        </tr>
      `;

      if (!expanded) return schoolHeader;

      const groupRowsHtml = groups.map((group) => {
        const notices = group.notices.map((record) => record.programType).join(" / ");
        const nextDeadline = group.notices
          .map((record) => record.deadline)
          .filter(Boolean)
          .sort()[0];
        const keywordTags = group.keywords.slice(0, 5);
        const active = group.key === state.selectedGroupKey;
        return `
          <tr class="college-directory-row ${active ? "active" : ""}" data-group-key="${escapeHtml(group.key)}">
            <td>
              <div class="college-name">
                <strong>${escapeHtml(group.college)}</strong>
                <div class="badge-row">
                  ${group.notices.length ? badgeHtml(`${notices}通知`, "notice") : ""}
                  ${group.evaluations.length ? badgeHtml("导师评价", "evaluation") : ""}
                  ${badgeHtml(group.schoolLevel, "school-level")}
                </div>
              </div>
            </td>
            <td>
              <strong>${group.notices.length ? `${group.notices.length} 条通知` : "暂无通知"}</strong>
              <div class="muted">${group.evaluations.length ? `${group.evaluations.length} 个导师评价入口` : "暂无导师评价入口"}</div>
            </td>
            <td>
              ${nextDeadline ? `<span class="deadline">${formatDate(nextDeadline)}</span>` : `<span class="deadline neutral">${group.evaluationRecordCount || 0} 条记录</span>`}
            </td>
            <td>
              <strong>${keywordTags.length ? "关键词" : "待补充"}</strong>
              <div class="tag-list">
                ${keywordTags.map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}
              </div>
            </td>
            <td>
              <strong>${group.mentorCount} 位导师</strong>
              <div class="muted">${group.intentionCount} 条意向填报</div>
              <div class="tag-list">
                ${group.mentorNames.slice(0, 4).map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("")}
              </div>
            </td>
          </tr>
        `;
      }).join("");

      return schoolHeader + groupRowsHtml;
    })
    .join("");
}

function filteredAdmissions() {
  const keyword = state.search.trim().toLowerCase();
  return state.admissions.filter((entry) => {
    if (!keyword) return true;
    return [
      entry.cohort,
      entry.undergraduateCollege,
      entry.undergraduateMajor,
      entry.recommendationType,
      entry.destinationSchool,
      entry.destinationCollege,
      entry.destinationMajor,
      entry.majorCode
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
}

function countBy(items, key) {
  return items.reduce((counter, item) => {
    const value = item[key] || "未填写";
    counter.set(value, (counter.get(value) || 0) + 1);
    return counter;
  }, new Map());
}

function topCountTags(items, key, limit = 10) {
  return [...countBy(items, key).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit)
    .map(([name, count]) => `<span class="tag">${escapeHtml(name)} · ${count}</span>`)
    .join("");
}

function renderAdmissionsView() {
  renderAdmissionRows();
  const selected = state.admissions.find((entry) => entry.id === state.selectedAdmissionId);
  if (selected) {
    renderAdmissionDetail(selected);
  } else {
    renderAdmissionOverview();
  }
}

function renderAdmissionRows() {
  typeFilter.hidden = true;
  tableHead.innerHTML = `
    <tr>
      <th>本科专业</th>
      <th>去向院校</th>
      <th>去向学院</th>
      <th>拟录取专业</th>
      <th>年级 / 类型</th>
    </tr>
  `;

  const rows = filteredAdmissions().sort(
    (a, b) =>
      (a.undergraduateMajor || "").localeCompare(b.undergraduateMajor || "", "zh-CN") ||
      (a.destinationSchool || "").localeCompare(b.destinationSchool || "", "zh-CN") ||
      (a.destinationCollege || "").localeCompare(b.destinationCollege || "", "zh-CN")
  );
  const majorCount = new Set(state.admissions.map((entry) => entry.undergraduateMajor).filter(Boolean)).size;
  const schoolCount = new Set(state.admissions.map((entry) => entry.destinationSchool).filter(Boolean)).size;
  summaryText.textContent = `${state.admissions.length} 条保研去向，${majorCount} 个本科专业，${schoolCount} 个去向院校`;

  collegeRows.innerHTML = rows.length
    ? rows
        .map(
          (entry) => `
            <tr class="admission-row ${entry.id === state.selectedAdmissionId ? "active" : ""}" data-admission-id="${escapeHtml(entry.id)}">
              <td>
                <strong>${escapeHtml(entry.undergraduateMajor || "未填写")}</strong>
                <div class="muted">${escapeHtml(entry.undergraduateCollege || "未填写学院")}</div>
              </td>
              <td><strong>${escapeHtml(entry.destinationSchool || "未填写")}</strong></td>
              <td>${escapeHtml(entry.destinationCollege || "未填写")}</td>
              <td>
                <strong>${escapeHtml(entry.destinationMajor || "未填写")}</strong>
                ${entry.majorCode ? `<div class="muted">${escapeHtml(entry.majorCode)}</div>` : ""}
              </td>
              <td>
                <strong>${escapeHtml(entry.cohort || "往年")}</strong>
                <div class="muted">${escapeHtml(entry.recommendationType || "未标注")}</div>
              </td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="5">没有匹配的往年保研记录。</td></tr>';
}

function renderAdmissionOverview() {
  const rows = filteredAdmissions();
  collegeDetail.className = "detail-content";
  collegeDetail.innerHTML = `
    <div class="detail-heading">
      <div class="text-block">
        <h2>往年保研情况</h2>
        <p class="meta">${rows.length} 条当前筛选结果 · 数据来自 21 级保研去向表</p>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-box">
        <span>总记录</span>
        <strong>${state.admissions.length} 条</strong>
      </div>
      <div class="info-box">
        <span>本科专业</span>
        <strong>${new Set(state.admissions.map((entry) => entry.undergraduateMajor).filter(Boolean)).size} 个</strong>
      </div>
      <div class="info-box">
        <span>去向院校</span>
        <strong>${new Set(state.admissions.map((entry) => entry.destinationSchool).filter(Boolean)).size} 所</strong>
      </div>
      <div class="info-box">
        <span>去向年份</span>
        <strong>${[...new Set(state.admissions.map((entry) => entry.admissionYear).filter(Boolean))].join("、") || "未标注"}</strong>
      </div>
    </div>
    <section class="detail-section">
      <div class="section-heading">
        <h3>本科专业分布</h3>
        <span>按人数</span>
      </div>
      <div class="tag-list">${topCountTags(rows, "undergraduateMajor", 14)}</div>
    </section>
    <section class="detail-section">
      <div class="section-heading">
        <h3>去向院校分布</h3>
        <span>按人数</span>
      </div>
      <div class="tag-list">${topCountTags(rows, "destinationSchool", 14)}</div>
    </section>
  `;
}

function renderAdmissionDetail(entry) {
  collegeDetail.className = "detail-content";
  collegeDetail.innerHTML = `
    <div class="detail-heading">
      <div class="text-block">
        <h2>${escapeHtml(entry.destinationSchool || "未填写去向院校")}</h2>
        <p class="meta">${escapeHtml(entry.cohort || "往年")} · ${escapeHtml(entry.undergraduateMajor || "未填写本科专业")}</p>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-box">
        <span>本科学院</span>
        <strong>${escapeHtml(entry.undergraduateCollege || "未填写")}</strong>
      </div>
      <div class="info-box">
        <span>本科专业</span>
        <strong>${escapeHtml(entry.undergraduateMajor || "未填写")}</strong>
      </div>
      <div class="info-box">
        <span>拟录取学院</span>
        <strong>${escapeHtml(entry.destinationCollege || "未填写")}</strong>
      </div>
      <div class="info-box">
        <span>拟录取专业</span>
        <strong>${escapeHtml(entry.destinationMajor || "未填写")}</strong>
      </div>
      <div class="info-box">
        <span>专业代码</span>
        <strong>${escapeHtml(entry.majorCode || "未填写")}</strong>
      </div>
      <div class="info-box">
        <span>推荐类型</span>
        <strong>${escapeHtml(entry.recommendationType || "未标注")}</strong>
      </div>
      <div class="info-box wide-box">
        <span>来源</span>
        <strong class="text-block">${escapeHtml(entry.sourceFile || "未知文件")} · ${escapeHtml(entry.sourceSheet || "未知工作表")} 第 ${entry.sourceRow || "-"} 行</strong>
      </div>
    </div>
  `;
}

function updateViewTabs() {
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewMode === state.activeView);
  });
}

function renderCurrentView() {
  updateViewTabs();
  if (state.activeView === "admissions") {
    renderAdmissionsView();
    return;
  }
  renderCollegeRows();
  if (state.selectedGroup) {
    renderCollegeGroupDetail();
  } else if (state.selectedCollege) {
    renderCollegeDetail();
  } else {
    renderEmptyDetail();
  }
}

function loadAdmissionDetail(admissionId) {
  const admission = state.admissions.find((entry) => entry.id === admissionId);
  if (!admission) return;
  state.selectedAdmissionId = admissionId;
  state.selectedAdmission = admission;
  renderAdmissionRows();
  renderAdmissionDetail(admission);
}

function renderLegacyCollegeRows() {
  const rows = filteredColleges();
  collegeRows.innerHTML = rows
    .map((college) => {
      const deadline = new Date(`${college.deadline}T23:59:59`);
      const daysLeft = Math.ceil((deadline - new Date()) / 86400000);
      const deadlineClass = !Number.isNaN(daysLeft) && daysLeft >= 0 && daysLeft <= 7 ? "deadline soon" : "deadline";
      return `
        <tr class="college-row ${college.id === state.selectedCollegeId ? "active" : ""}" data-id="${college.id}">
          <td>
            <div class="college-name">
              <strong>${escapeHtml(college.school)}</strong>
              <span class="muted">${escapeHtml(college.college)}</span>
              <div>${relatedLinkHtml(college.relatedLink, "打开通知")}</div>
            </div>
          </td>
          <td>${escapeHtml(college.campName)}</td>
          <td><span class="${deadlineClass}">${formatDate(college.deadline)}</span></td>
          <td>
            <strong>${escapeHtml(college.courses || "待补充")}</strong>
            <div class="muted text-block">${escapeHtml(college.reviewMaterials || "待补充")}</div>
          </td>
          <td>
            <strong>${college.mentorCount} 位导师</strong>
            <div class="muted">${college.intentionCount} 条意向填报</div>
            <div class="tag-list">
              ${(college.interestedStudents || [])
                .slice(0, 4)
                .map((item) => `<span class="tag">${escapeHtml(item.studentName)} -> ${escapeHtml(item.mentorName)}</span>`)
                .join("")}
              ${
                college.intentionCount > 4
                  ? `<span class="tag">另 ${college.intentionCount - 4} 条</span>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderEmptyDetail() {
  collegeDetail.className = "empty-state";
  collegeDetail.innerHTML = `
    <h2>选择一个学院查看详情</h2>
    <p>详情页会列出不同方向导师、期刊信息，并支持同学填报意向。</p>
  `;
}

function renderUnassignedIntentions(college) {
  if (!college.unassignedIntentions?.length) return "";

  return `
    <article class="mentor-card">
      <div class="mentor-head">
        <div class="text-block">
          <h3>未指定导师</h3>
          <p class="meta">${college.unassignedIntentions.length} 位同学有意向</p>
        </div>
      </div>
      <div class="mentor-body">
        <ul class="student-list">
          ${college.unassignedIntentions
            .map(
              (item) => `
                <li>
                  <div>
                    <strong>${escapeHtml(item.studentName)} ${item.major ? `· ${escapeHtml(item.major)}` : ""}</strong>
                    <span class="muted text-block">${escapeHtml([item.gradeRank, item.note].filter(Boolean).join(" · ") || "暂无备注")}</span>
                  </div>
                  ${state.isAdmin ? `<button class="text-button danger-text" data-delete-intention="${item.id}">删除</button>` : ""}
                </li>
              `
            )
            .join("")}
        </ul>
      </div>
    </article>
  `;
}

function renderNoticeCard(record) {
  return `
    <article class="notice-card">
      <div class="mentor-head">
        <div class="text-block">
          <h3>${escapeHtml(record.programType || "通知")}：${escapeHtml(record.campName || "未命名项目")}</h3>
          <p class="meta">截止 ${formatDate(record.deadline)} · ${record.unassignedIntentions?.length || 0} 条报考意向</p>
        </div>
        <div class="button-row">
          ${state.isAdmin ? `<button class="secondary-button" data-edit-college="${record.id}">编辑通知</button>` : ""}
          ${state.isAdmin ? `<button class="danger-button" data-delete-college="${record.id}">删除通知</button>` : ""}
          <button class="primary-button" data-intent-college="${record.id}" data-intent-mentor="" data-intent-name="${escapeHtml(record.programType || "报考")}报考意向">填报意向</button>
        </div>
      </div>
      <div class="mentor-body">
        <div class="text-block"><strong>专业课 / 要求：</strong>${escapeHtml(record.courses || "待补充")}</div>
        <div class="text-block"><strong>复习资料 / 情况：</strong>${escapeHtml(record.reviewMaterials || "待补充")}</div>
        <div class="text-block"><strong>通知链接：</strong>${relatedLinkHtml(record.relatedLink, "打开通知")}</div>
        <div class="text-block"><strong>备注：</strong>${escapeHtml(record.notes || "暂无")}</div>
        ${renderUnassignedIntentions(record)}
      </div>
    </article>
  `;
}

function renderCollegeGroupDetail() {
  const group = state.selectedGroup;
  if (!group) return renderEmptyDetail();

  const notices = group.records.filter(isNoticeRecord);
  const summerNotices = notices.filter((record) => record.programType === "夏令营");
  const preAdmissionNotices = notices.filter((record) => record.programType === "预推免");
  const evaluationRecords = group.records.filter(isMentorEvaluation);
  const mentors = group.records.flatMap((record) => record.mentors || []);
  const keywords = [...new Set(group.records.flatMap((record) => record.keywords || record.directions || []))].slice(0, 12);
  const evaluationRecordCount = evaluationRecords.reduce((sum, record) => sum + (record.recordCount || 0), 0);
  const baseRecord = group.records.find(isDirectoryRecord) || group.records.find(isNoticeRecord) || group.records[0];

  collegeDetail.className = "detail-content";
  collegeDetail.innerHTML = `
    <div class="detail-heading">
      <div class="text-block">
        <h2>${escapeHtml(group.school)} ${escapeHtml(group.college)}</h2>
        <p class="meta">${notices.length} 条通知 · ${mentors.length} 位导师 · ${evaluationRecordCount} 条导师评价记录</p>
        <div class="badge-row">
          ${summerNotices.length ? badgeHtml("夏令营通知", "notice") : ""}
          ${preAdmissionNotices.length ? badgeHtml("预推免通知", "notice") : ""}
          ${evaluationRecords.length ? badgeHtml("导师评价", "evaluation") : ""}
          ${badgeHtml(group.schoolLevel, "school-level")}
        </div>
      </div>
      <div class="button-row">
        ${state.isAdmin ? `<button class="secondary-button" data-add-notice="夏令营">新增夏令营通知</button>` : ""}
        ${state.isAdmin ? `<button class="secondary-button" data-add-notice="预推免">新增预推免通知</button>` : ""}
        ${state.isAdmin && baseRecord ? `<button class="secondary-button" data-add-mentor="${baseRecord.id}">新增导师</button>` : ""}
        ${state.isAdmin ? `<button class="danger-button" data-delete-group="${escapeHtml(group.key)}">删除学院</button>` : ""}
      </div>
    </div>

    <section class="detail-section">
      <div class="section-heading">
        <h3>夏令营通知</h3>
        <span>${summerNotices.length || "暂无"}</span>
      </div>
      <div class="section-list">
        ${summerNotices.length ? summerNotices.map(renderNoticeCard).join("") : '<div class="empty-inline">这个学院暂未录入夏令营通知。</div>'}
      </div>
    </section>

    <section class="detail-section">
      <div class="section-heading">
        <h3>预推免通知</h3>
        <span>${preAdmissionNotices.length || "暂无"}</span>
      </div>
      <div class="section-list">
        ${preAdmissionNotices.length ? preAdmissionNotices.map(renderNoticeCard).join("") : '<div class="empty-inline">这个学院暂未录入预推免通知。</div>'}
      </div>
    </section>

    <section class="detail-section">
      <div class="section-heading">
        <h3>导师评价</h3>
        <span>${mentors.length} 位导师</span>
      </div>
      <div class="tag-list">${keywords.map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>
      <div class="mentor-list">
        ${mentors.length ? mentors.map(renderMentorCard).join("") : '<div class="empty-inline">这个学院暂未匹配到导师评价。</div>'}
      </div>
    </section>
  `;
}

function renderCollegeDetail() {
  const college = state.selectedCollege;
  if (!college) return renderEmptyDetail();
  const evaluation = isMentorEvaluation(college);
  const keywords = (college.keywords || college.directions || []).slice(0, 10);
  const averageRating = formatRating(college.averageRating);
  const recordCount = college.recordCount || college.mentors.reduce((sum, mentor) => sum + mentor.intentions.length, 0);

  collegeDetail.className = "detail-content";
  collegeDetail.innerHTML = `
    <div class="detail-heading">
      <div class="text-block">
        <h2>${escapeHtml(college.school)} ${escapeHtml(college.college)}</h2>
        <p class="meta">
          ${escapeHtml(college.programType || "夏令营")} · ${escapeHtml(college.campName)}
          ${evaluation ? ` · ${recordCount} 条记录${averageRating ? ` · 平均 ${averageRating}` : ""}` : ` · 截止 ${formatDate(college.deadline)}`}
        </p>
      </div>
      <div class="button-row">
        ${!evaluation && state.isAdmin ? `<button class="secondary-button" data-edit-college="${college.id}">编辑学院</button>` : ""}
        ${state.isAdmin ? `<button class="danger-button" data-delete-college="${college.id}">删除学院</button>` : ""}
        ${!evaluation ? `<button class="secondary-button" data-add-mentor="${college.id}">新增导师</button>` : ""}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <span>${evaluation ? "命中关键词" : "专业课"}</span>
        <strong class="text-block">${escapeHtml(college.courses || "待补充")}</strong>
      </div>
      <div class="info-box">
        <span>${evaluation ? "学校层级" : "面试复习资料"}</span>
        <strong class="text-block">${escapeHtml(college.reviewMaterials || "待补充")}</strong>
      </div>
      <div class="info-box">
        <span>${evaluation ? "记录规模" : "相关链接"}</span>
        <strong class="text-block">${evaluation ? `${recordCount} 条记录` : relatedLinkHtml(college.relatedLink, "打开学院通知")}</strong>
      </div>
      <div class="info-box">
        <span>${evaluation ? "平均评分" : "学院汇总意向"}</span>
        <strong>${evaluation ? (averageRating || "暂无") : `${college.mentors.reduce((sum, mentor) => sum + mentor.intentions.length, 0) + (college.unassignedIntentions?.length || 0)} 条`}</strong>
      </div>
      <div class="info-box wide-box">
        <span>${evaluation ? "来源 / 备注" : "备注"}</span>
        <strong class="text-block">${escapeHtml(college.notes || "暂无")}</strong>
      </div>
    </div>

    ${
      evaluation
        ? `<div class="tag-list">${keywords.map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>`
        : ""
    }

    <div class="mentor-list">
      ${college.mentors.length ? college.mentors.map(renderMentorCard).join("") : ""}
      ${!evaluation ? renderUnassignedIntentions(college) : ""}
      ${
        !college.mentors.length && !college.unassignedIntentions?.length && !evaluation
          ? '<div class="empty-state"><h2>暂无导师</h2><p>可以先新增导师方向和期刊信息。</p></div>'
          : evaluation && !college.mentors.length
            ? '<div class="empty-state"><h2>暂无导师记录</h2><p>这个学院暂时没有匹配到导师评价条目。</p></div>'
          : ""
      }
    </div>
  `;
}

function sheetLabel(sheetName) {
  return {
    Sheet1: "分项评价",
    Sheet2: "评分评价",
    黑名单: "风险反馈",
    五星推荐: "五星推荐"
  }[sheetName] || sheetName || "来源未知";
}

function hasNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function renderSourceSheets(sourceSheets = {}) {
  const entries = Object.entries(sourceSheets).filter(([, count]) => count);
  if (!entries.length) return '<span class="muted">暂无来源统计</span>';
  return entries
    .map(
      ([sheet, count]) => `
        <span class="source-chip">
          <strong>${escapeHtml(sheetLabel(sheet))}</strong>
          <span>${count} 条</span>
        </span>
      `
    )
    .join("");
}

function renderEvaluationEntry(entry, index) {
  const sections = Array.isArray(entry.sections) ? entry.sections.filter((item) => item?.text) : [];
  const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
  const rating = hasNumber(entry.rating) ? `评分 ${formatRating(entry.rating)}` : "无单条评分";
  const body = sections.length
    ? `
        <div class="evaluation-section-list">
          ${sections
            .map(
              (section) => `
                <div class="evaluation-section">
                  <span class="evaluation-section-label">${escapeHtml(section.label || "评价")}</span>
                  <p class="evaluation-section-text">${escapeHtml(section.text)}</p>
                </div>
              `
            )
            .join("")}
        </div>
      `
    : `<p class="evaluation-text">${escapeHtml(entry.text || "暂无评价正文")}</p>`;

  return `
    <article class="evaluation-entry">
      <div class="evaluation-entry-head">
        <strong>${index + 1}. ${escapeHtml(sheetLabel(entry.sourceSheet))}</strong>
        <span>${rating}</span>
      </div>
      ${keywords.length ? `<div class="tag-list compact-tags">${keywords.map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>` : ""}
      ${body}
    </article>
  `;
}

function renderEvaluationPanel(mentor) {
  const entries = Array.isArray(mentor.evaluationEntries) ? mentor.evaluationEntries : [];
  const keywords = Array.isArray(mentor.keywords) ? mentor.keywords : [];
  const averageRating = hasNumber(mentor.averageRating) ? formatRating(mentor.averageRating) : "暂无";

  return `
    <div class="evaluation-dashboard">
      <div class="metric-card">
        <span>平均评分</span>
        <strong>${averageRating}</strong>
      </div>
      <div class="metric-card">
        <span>评价记录</span>
        <strong>${mentor.recordCount || entries.length || 0} 条</strong>
      </div>
      <div class="metric-card">
        <span>保留正文</span>
        <strong>${entries.length} 条</strong>
      </div>
    </div>
    ${keywords.length ? `<div class="tag-list">${keywords.map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>` : ""}
    <div class="source-chip-row">${renderSourceSheets(mentor.sourceSheets)}</div>
    <div class="text-block"><strong>说明：</strong>${escapeHtml(mentor.profile || "来自 2025 年导师评价表。")}</div>
    <div class="evaluation-feed">
      <div class="subsection-title">
        <strong>评价内容</strong>
        <span>${entries.length ? `${entries.length} 条` : "暂无"}</span>
      </div>
      ${entries.length ? entries.map(renderEvaluationEntry).join("") : '<div class="empty-inline">暂未抽取到评价正文。</div>'}
    </div>
  `;
}

function renderMentorCard(mentor) {
  const evaluation = mentor.source === GENERATED_SOURCE || mentor.source === "mentor-evaluation-2025";
  const intentions = mentor.intentions || [];
  const averageRating = hasNumber(mentor.averageRating) ? formatRating(mentor.averageRating) : "";
  const students = intentions.length
    ? intentions
        .map(
          (item) => `
            <li>
              <div>
                <strong>${escapeHtml(item.studentName)} ${item.major ? `· ${escapeHtml(item.major)}` : ""}</strong>
                <span class="muted text-block">${escapeHtml([item.gradeRank, item.note].filter(Boolean).join(" · ") || "暂无备注")}</span>
              </div>
              ${state.isAdmin ? `<button class="text-button danger-text" data-delete-intention="${item.id}">删除</button>` : ""}
            </li>
          `
        )
        .join("")
    : '<li><span class="muted">暂无同学填报</span></li>';

  return `
    <details class="mentor-card">
      <summary class="mentor-head">
        <div class="text-block">
          <h3>${escapeHtml(mentor.name)} ${mentor.title ? `<span class="muted">${escapeHtml(mentor.title)}</span>` : ""}</h3>
          <p class="meta">
            ${
              evaluation
                ? `${mentor.recordCount || 0} 条记录${averageRating ? ` · 平均 ${averageRating}` : " · 暂无评分"}`
                : `${intentions.length} 位同学有意向`
            }
          </p>
        </div>
        <div class="button-row">
          ${!evaluation && state.isAdmin ? `<button class="secondary-button" data-edit-mentor="${mentor.id}">编辑导师</button>` : ""}
          ${state.isAdmin ? `<button class="danger-button" data-delete-mentor="${mentor.id}">删除导师</button>` : ""}
          <button class="primary-button" data-intent-college="${mentor.collegeId}" data-intent-mentor="${mentor.id}" data-intent-name="${escapeHtml(mentor.name)}">填报意向</button>
        </div>
      </summary>
      <div class="mentor-body">
        ${
          evaluation
            ? renderEvaluationPanel(mentor)
            : `
              <div class="text-block"><strong>方向：</strong>${escapeHtml(mentor.direction)}</div>
              <div class="text-block"><strong>期刊：</strong>${escapeHtml(mentor.journals || "待补充")}</div>
              <div class="text-block"><strong>介绍：</strong>${escapeHtml(mentor.profile || "待补充")}</div>
            `
        }
        <div><strong>当前意向同学：</strong><ul class="student-list">${students}</ul></div>
      </div>
    </details>
  `;
}

function formToJson(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function saveMessage(message) {
  return state.usingBackend ? message : `${message}（已保存到本机浏览器）`;
}

function updateAdminUi() {
  adminButton.textContent = state.isAdmin ? "退出管理模式" : "管理模式";
  adminButton.classList.toggle("active", state.isAdmin);
  if (state.selectedGroup) {
    renderCollegeGroupDetail();
  } else if (state.selectedCollege) {
    renderCollegeDetail();
  }
}

function setCollegeFormMode(mode, programType = "夏令营") {
  const form = document.querySelector("#collegeForm");
  const isNotice = mode === "notice";
  form.elements.recordMode.value = mode;
  form.querySelectorAll(".notice-only").forEach((element) => {
    element.hidden = !isNotice;
  });
  form.elements.programType.value = isNotice ? programType : DIRECTORY_PROGRAM_TYPE;
}

function openCollegeCreateForm() {
  const form = document.querySelector("#collegeForm");
  form.reset();
  setCollegeFormMode("directory");
  form.elements.collegeId.value = "";
  document.querySelector("#collegeModalTitle").textContent = "新增学院目录";
  document.querySelector("#collegeSubmitButton").textContent = "保存学院";
  document.querySelector("#collegeModal").showModal();
}

function openNoticeCreateForm(group, programType) {
  const directoryRecord = group.records.find(isDirectoryRecord);
  const sourceRecord = directoryRecord || group.records[0] || group;
  const form = document.querySelector("#collegeForm");
  form.reset();
  setCollegeFormMode("notice", programType);
  form.elements.collegeId.value = "";
  form.elements.school.value = sourceRecord.school || "";
  form.elements.college.value = sourceRecord.college || "";
  document.querySelector("#collegeModalTitle").textContent = `新增${programType}通知`;
  document.querySelector("#collegeSubmitButton").textContent = "保存通知";
  document.querySelector("#collegeModal").showModal();
}

function openCollegeEditForm(college) {
  const form = document.querySelector("#collegeForm");
  form.reset();
  setCollegeFormMode(isDirectoryRecord(college) ? "directory" : "notice", college.programType || "夏令营");
  form.elements.collegeId.value = college.id;
  form.elements.school.value = college.school || "";
  form.elements.college.value = college.college || "";
  form.elements.programType.value = isDirectoryRecord(college) ? DIRECTORY_PROGRAM_TYPE : college.programType || "夏令营";
  form.elements.campName.value = college.campName || "";
  form.elements.deadline.value = college.deadline || "";
  form.elements.courses.value = college.courses || "";
  form.elements.reviewMaterials.value = college.reviewMaterials || "";
  form.elements.relatedLink.value = college.relatedLink || "";
  form.elements.notes.value = college.notes || "";
  document.querySelector("#collegeModalTitle").textContent = isDirectoryRecord(college) ? "编辑学院目录" : "编辑通知";
  document.querySelector("#collegeSubmitButton").textContent = "保存修改";
  document.querySelector("#collegeModal").showModal();
}

function openMentorCreateForm(collegeId) {
  const form = document.querySelector("#mentorForm");
  form.reset();
  form.elements.collegeId.value = collegeId;
  form.elements.mentorId.value = "";
  document.querySelector("#mentorModalTitle").textContent = "新增导师";
  document.querySelector("#mentorSubmitButton").textContent = "保存导师";
  document.querySelector("#mentorModal").showModal();
}

function openMentorEditForm(mentor) {
  const form = document.querySelector("#mentorForm");
  form.reset();
  form.elements.collegeId.value = mentor.collegeId;
  form.elements.mentorId.value = mentor.id;
  form.elements.name.value = mentor.name || "";
  form.elements.title.value = mentor.title || "";
  form.elements.direction.value = mentor.direction || "";
  form.elements.journals.value = mentor.journals || "";
  form.elements.profile.value = mentor.profile || "";
  document.querySelector("#mentorModalTitle").textContent = "编辑导师";
  document.querySelector("#mentorSubmitButton").textContent = "保存修改";
  document.querySelector("#mentorModal").showModal();
}

async function loginAsAdmin(password) {
  await api("api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  state.adminPassword = password;
  state.isAdmin = true;
  sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
  updateAdminUi();
}

function currentRecords() {
  return state.selectedGroup?.records || (state.selectedCollege ? [state.selectedCollege] : []);
}

function findCollegeRecord(collegeId) {
  return currentRecords().find((record) => record.id === collegeId) || state.colleges.find((record) => record.id === collegeId);
}

function findMentorContext(mentorId) {
  for (const record of currentRecords()) {
    const mentor = record.mentors?.find((item) => item.id === mentorId);
    if (mentor) return { record, mentor };
  }
  return null;
}

function findIntentionContext(intentionId) {
  for (const record of currentRecords()) {
    const unassigned = record.unassignedIntentions?.find((item) => item.id === intentionId);
    if (unassigned) return { record, intention: unassigned };
    for (const mentor of record.mentors || []) {
      const intention = mentor.intentions?.find((item) => item.id === intentionId);
      if (intention) return { record, mentor, intention };
    }
  }
  return null;
}

async function deleteCollege(collegeId) {
  const college = findCollegeRecord(collegeId);
  if (!college) return;
  const label = isDirectoryRecord(college)
    ? "学院目录"
    : isMentorEvaluation(college)
      ? "导师评价入口"
      : `${college.programType || "项目"}通知`;
  const ok = window.confirm(`确定删除“${college.school} ${college.college}”下的${label}吗？关联导师和意向也会一起删除。`);
  if (!ok) return;
  await api(`api/colleges/${collegeId}`, { method: "DELETE" });
  await loadColleges(false);
  showToast(saveMessage("已删除"));
}

async function deleteCollegeGroup(groupKey) {
  const group = state.selectedGroup?.key === groupKey ? state.selectedGroup : buildCollegeGroups().find((item) => item.key === groupKey);
  if (!group) return;
  const recordCount = group.records.length;
  const ok = window.confirm(`确定删除“${group.school} ${group.college}”整个学院吗？将删除 ${recordCount} 个入口，以及其下导师和意向。`);
  if (!ok) return;
  for (const record of group.records) {
    await api(`api/colleges/${record.id}`, { method: "DELETE" });
  }
  state.selectedGroupKey = "";
  state.selectedGroup = null;
  state.selectedCollegeId = "";
  state.selectedCollege = null;
  await loadColleges(true);
  showToast(saveMessage("学院已删除"));
}

async function deleteMentor(mentorId) {
  const context = findMentorContext(mentorId);
  if (!context) return;
  const { record, mentor } = context;
  const ok = window.confirm(`确定删除导师“${mentor.name}”吗？该导师下的意向会保留为未指定导师。`);
  if (!ok) return;
  await api(`api/colleges/${record.id}/mentors/${mentorId}`, { method: "DELETE" });
  await loadColleges(false);
  showToast(saveMessage("导师已删除"));
}

async function deleteIntention(intentionId) {
  const context = findIntentionContext(intentionId);
  if (!context) return;
  const ok = window.confirm("确定删除这条意向填报吗？");
  if (!ok) return;
  await api(`api/colleges/${context.record.id}/intentions/${intentionId}`, { method: "DELETE" });
  await loadColleges(false);
  showToast(saveMessage("意向已删除"));
}

document.addEventListener("click", async (event) => {
  const viewMode = event.target.dataset.viewMode;
  if (viewMode) {
    state.activeView = viewMode;
    state.selectedAdmissionId = "";
    state.selectedAdmission = null;
    renderCurrentView();
    return;
  }

  const modalId = event.target.dataset.openModal;
  if (modalId === "collegeModal") {
    openCollegeCreateForm();
    return;
  }

  if (modalId) {
    document.querySelector(`#${modalId}`).showModal();
    return;
  }

  const closeModalId = event.target.dataset.closeModal;
  if (closeModalId) {
    document.querySelector(`#${closeModalId}`).close();
    return;
  }

  const editCollegeId = event.target.dataset.editCollege;
  if (editCollegeId) {
    const college = findCollegeRecord(editCollegeId);
    if (college) openCollegeEditForm(college);
    return;
  }

  const deleteCollegeId = event.target.dataset.deleteCollege;
  if (deleteCollegeId) {
    await deleteCollege(deleteCollegeId);
    return;
  }

  const addNoticeType = event.target.dataset.addNotice;
  if (addNoticeType) {
    if (state.selectedGroup) openNoticeCreateForm(state.selectedGroup, addNoticeType);
    return;
  }

  const deleteGroupKey = event.target.dataset.deleteGroup;
  if (deleteGroupKey) {
    await deleteCollegeGroup(deleteGroupKey);
    return;
  }

  const editMentorId = event.target.dataset.editMentor;
  if (editMentorId) {
    const mentor = state.selectedCollege?.mentors.find((item) => item.id === editMentorId);
    if (mentor) openMentorEditForm(mentor);
    return;
  }

  const deleteMentorId = event.target.dataset.deleteMentor;
  if (deleteMentorId) {
    await deleteMentor(deleteMentorId);
    return;
  }

  const deleteIntentionId = event.target.dataset.deleteIntention;
  if (deleteIntentionId) {
    await deleteIntention(deleteIntentionId);
    return;
  }

  const collegeId = event.target.dataset.addMentor;
  if (collegeId) {
    openMentorCreateForm(collegeId);
    return;
  }

  const intentCollegeId = event.target.dataset.intentCollege;
  if (intentCollegeId !== undefined) {
    const form = document.querySelector("#intentionForm");
    form.reset();
    form.elements.collegeId.value = intentCollegeId;
    form.elements.mentorId.value = event.target.dataset.intentMentor || "";
    form.elements.mentorName.value = event.target.dataset.intentName;
    document.querySelector("#intentionModal").showModal();
    return;
  }

  const schoolRow = event.target.closest(".school-row");
  if (schoolRow) {
    toggleSchool(schoolRow.dataset.school);
    return;
  }

  const groupRow = event.target.closest(".college-directory-row");
  if (groupRow) {
    await loadCollegeGroup(groupRow.dataset.groupKey);
    return;
  }

  const admissionRow = event.target.closest(".admission-row");
  if (admissionRow) {
    loadAdmissionDetail(admissionRow.dataset.admissionId);
    return;
  }

  const row = event.target.closest(".college-row");
  if (row) {
    await loadCollegeDetail(row.dataset.id);
  }
});

adminButton.addEventListener("click", () => {
  if (state.isAdmin) {
    state.isAdmin = false;
    state.adminPassword = "";
    sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
    updateAdminUi();
    showToast("已退出管理模式");
    return;
  }
  document.querySelector("#adminModal").showModal();
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderCurrentView();
});

typeFilter.addEventListener("change", (event) => {
  state.typeFilter = event.target.value;
  renderCurrentView();
});

document.querySelector("#adminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await loginAsAdmin(form.elements.password.value);
    form.reset();
    document.querySelector("#adminModal").close();
    showToast("已进入管理模式");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#collegeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToJson(form);
  const collegeId = payload.collegeId;
  const recordMode = payload.recordMode;
  delete payload.collegeId;
  delete payload.recordMode;

  if (recordMode === "directory") {
    payload.programType = DIRECTORY_PROGRAM_TYPE;
    payload.campName = "";
    payload.deadline = "";
    payload.courses = "";
    payload.reviewMaterials = "";
    payload.relatedLink = "";
    payload.notes = "";
  } else {
    payload.programType = payload.programType || "夏令营";
  }

  try {
    const college = collegeId
      ? await api(`api/colleges/${collegeId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        })
      : await api("api/colleges", {
          method: "POST",
          body: JSON.stringify(payload)
        });

    form.reset();
    document.querySelector("#collegeModal").close();
    state.selectedCollegeId = college.id;
    state.selectedGroupKey = groupKeyForCollege(college);
    await loadColleges(false);
    showToast(saveMessage(collegeId ? "学院信息已修改" : "学院已新增"));
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#mentorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToJson(form);
  const { collegeId, mentorId } = payload;
  delete payload.collegeId;
  delete payload.mentorId;

  try {
    await (mentorId
      ? api(`api/colleges/${collegeId}/mentors/${mentorId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        })
      : api(`api/colleges/${collegeId}/mentors`, {
          method: "POST",
          body: JSON.stringify(payload)
        }));

    form.reset();
    document.querySelector("#mentorModal").close();
    await loadColleges(false);
    showToast(saveMessage(mentorId ? "导师信息已修改" : "导师已新增"));
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#intentionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToJson(form);

  try {
    await api(`api/colleges/${payload.collegeId}/intentions`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    document.querySelector("#intentionModal").close();
    await loadColleges(false);
    showToast(saveMessage("意向已提交"));
  } catch (error) {
    showToast(error.message);
  }
});

(async function init() {
  await initializeDataSource();
  if (state.adminPassword) {
    try {
      await loginAsAdmin(state.adminPassword);
    } catch {
      state.adminPassword = "";
      state.isAdmin = false;
      sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
    }
  }
  updateAdminUi();
  await loadColleges();
})().catch((error) => {
  collegeRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
});
