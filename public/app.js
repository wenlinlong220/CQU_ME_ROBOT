const state = {
  colleges: [],
  selectedCollegeId: "",
  selectedCollege: null,
  search: "",
  isAdmin: false,
  adminPassword: sessionStorage.getItem("adminPassword") || ""
};

const collegeRows = document.querySelector("#collegeRows");
const collegeDetail = document.querySelector("#collegeDetail");
const summaryText = document.querySelector("#summaryText");
const searchInput = document.querySelector("#searchInput");
const adminButton = document.querySelector("#adminButton");

const formatDate = (value) => {
  if (!value) return "未填写";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(`${value}T00:00:00`));
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
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

async function loadColleges(selectFirst = true) {
  state.colleges = await api("/api/colleges");
  if (selectFirst && !state.selectedCollegeId && state.colleges.length) {
    state.selectedCollegeId = state.colleges[0].id;
  }
  renderCollegeRows();
  if (state.selectedCollegeId) {
    const exists = state.colleges.some((college) => college.id === state.selectedCollegeId);
    if (exists) {
      await loadCollegeDetail(state.selectedCollegeId);
    } else {
      state.selectedCollegeId = state.colleges[0]?.id || "";
      state.selectedCollege = null;
      if (state.selectedCollegeId) await loadCollegeDetail(state.selectedCollegeId);
      else renderEmptyDetail();
    }
  } else {
    renderEmptyDetail();
  }
}

async function loadCollegeDetail(collegeId) {
  state.selectedCollegeId = collegeId;
  state.selectedCollege = await api(`/api/colleges/${collegeId}`);
  renderCollegeRows();
  renderCollegeDetail();
}

function filteredColleges() {
  const keyword = state.search.trim().toLowerCase();
  if (!keyword) return state.colleges;
  return state.colleges.filter((college) => {
    const haystack = [
      college.school,
      college.college,
      college.campName,
      college.courses,
      college.reviewMaterials,
      college.notes,
      college.relatedLink,
      college.directions?.join(" ")
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

function renderCollegeRows() {
  const rows = filteredColleges();
  summaryText.textContent = `${state.colleges.length} 个学院，${state.colleges.reduce(
    (sum, college) => sum + college.mentorCount,
    0
  )} 位导师，${state.colleges.reduce((sum, college) => sum + college.intentionCount, 0)} 条意向`;

  collegeRows.innerHTML = rows
    .map((college) => {
      const daysLeft = Math.ceil(
        (new Date(`${college.deadline}T23:59:59`) - new Date()) / 86400000
      );
      const deadlineClass = daysLeft >= 0 && daysLeft <= 7 ? "deadline soon" : "deadline";
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
                .map((item) => `<span class="tag">${escapeHtml(item.studentName)} → ${escapeHtml(item.mentorName)}</span>`)
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

function renderCollegeDetail() {
  const college = state.selectedCollege;
  if (!college) return renderEmptyDetail();

  collegeDetail.className = "detail-content";
  collegeDetail.innerHTML = `
    <div class="detail-heading">
      <div class="text-block">
        <h2>${escapeHtml(college.school)} ${escapeHtml(college.college)}</h2>
        <p class="meta">${escapeHtml(college.campName)} · 截止 ${formatDate(college.deadline)}</p>
      </div>
      <div class="button-row">
        ${state.isAdmin ? `<button class="secondary-button" data-edit-college="${college.id}">编辑学院</button>` : ""}
        ${state.isAdmin ? `<button class="danger-button" data-delete-college="${college.id}">删除学院</button>` : ""}
        <button class="secondary-button" data-add-mentor="${college.id}">新增导师</button>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <span>专业课</span>
        <strong class="text-block">${escapeHtml(college.courses || "待补充")}</strong>
      </div>
      <div class="info-box">
        <span>面试复习资料</span>
        <strong class="text-block">${escapeHtml(college.reviewMaterials || "待补充")}</strong>
      </div>
      <div class="info-box">
        <span>相关链接</span>
        <strong class="text-block">${relatedLinkHtml(college.relatedLink, "打开学院通知")}</strong>
      </div>
      <div class="info-box">
        <span>学院汇总意向</span>
        <strong>${college.mentors.reduce((sum, mentor) => sum + mentor.intentions.length, 0)} 条</strong>
      </div>
      <div class="info-box wide-box">
        <span>备注</span>
        <strong class="text-block">${escapeHtml(college.notes || "暂无")}</strong>
      </div>
    </div>

    <div class="mentor-list">
      ${
        college.mentors.length
          ? college.mentors.map(renderMentorCard).join("")
          : '<div class="empty-state"><h2>暂无导师</h2><p>可以先新增导师方向和期刊信息。</p></div>'
      }
    </div>
  `;
}

function renderMentorCard(mentor) {
  const students = mentor.intentions.length
    ? mentor.intentions
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
    <article class="mentor-card">
      <div class="mentor-head">
        <div class="text-block">
          <h3>${escapeHtml(mentor.name)} ${mentor.title ? `<span class="muted">${escapeHtml(mentor.title)}</span>` : ""}</h3>
          <p class="meta">${mentor.intentions.length} 位同学有意向</p>
        </div>
        <div class="button-row">
          ${state.isAdmin ? `<button class="secondary-button" data-edit-mentor="${mentor.id}">编辑导师</button>` : ""}
          ${state.isAdmin ? `<button class="danger-button" data-delete-mentor="${mentor.id}">删除导师</button>` : ""}
          <button class="primary-button" data-intent-college="${mentor.collegeId}" data-intent-mentor="${mentor.id}" data-intent-name="${escapeHtml(mentor.name)}">填报意向</button>
        </div>
      </div>
      <div class="mentor-body">
        <div class="text-block"><strong>方向：</strong>${escapeHtml(mentor.direction)}</div>
        <div class="text-block"><strong>期刊：</strong>${escapeHtml(mentor.journals || "待补充")}</div>
        <div class="text-block"><strong>介绍：</strong>${escapeHtml(mentor.profile || "待补充")}</div>
        <div>
          <strong>当前意向同学：</strong>
          <ul class="student-list">${students}</ul>
        </div>
      </div>
    </article>
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

function updateAdminUi() {
  adminButton.textContent = state.isAdmin ? "退出管理模式" : "管理模式";
  adminButton.classList.toggle("active", state.isAdmin);
  if (state.selectedCollege) renderCollegeDetail();
}

function openCollegeCreateForm() {
  const form = document.querySelector("#collegeForm");
  form.reset();
  form.elements.collegeId.value = "";
  document.querySelector("#collegeModalTitle").textContent = "新增学校学院";
  document.querySelector("#collegeSubmitButton").textContent = "保存学院";
  document.querySelector("#collegeModal").showModal();
}

function openCollegeEditForm(college) {
  const form = document.querySelector("#collegeForm");
  form.reset();
  form.elements.collegeId.value = college.id;
  form.elements.school.value = college.school || "";
  form.elements.college.value = college.college || "";
  form.elements.campName.value = college.campName || "";
  form.elements.deadline.value = college.deadline || "";
  form.elements.courses.value = college.courses || "";
  form.elements.reviewMaterials.value = college.reviewMaterials || "";
  form.elements.relatedLink.value = college.relatedLink || "";
  form.elements.notes.value = college.notes || "";
  document.querySelector("#collegeModalTitle").textContent = "编辑学校学院";
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
  await api("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  state.adminPassword = password;
  state.isAdmin = true;
  sessionStorage.setItem("adminPassword", password);
  updateAdminUi();
}

async function deleteCollege(collegeId) {
  const college = state.selectedCollege;
  if (!college || college.id !== collegeId) return;
  const ok = window.confirm(`确定删除「${college.school} ${college.college}」吗？该学院下的导师和意向也会一起删除。`);
  if (!ok) return;
  await api(`/api/colleges/${collegeId}`, { method: "DELETE" });
  state.selectedCollegeId = "";
  state.selectedCollege = null;
  await loadColleges();
  showToast("学院已删除");
}

async function deleteMentor(mentorId) {
  const mentor = state.selectedCollege?.mentors.find((item) => item.id === mentorId);
  if (!mentor) return;
  const ok = window.confirm(`确定删除导师「${mentor.name}」吗？该导师下的意向会保留为未指定导师。`);
  if (!ok) return;
  await api(`/api/colleges/${state.selectedCollege.id}/mentors/${mentorId}`, { method: "DELETE" });
  await loadColleges(false);
  showToast("导师已删除");
}

async function deleteIntention(intentionId) {
  const ok = window.confirm("确定删除这条意向填报吗？");
  if (!ok) return;
  await api(`/api/colleges/${state.selectedCollege.id}/intentions/${intentionId}`, { method: "DELETE" });
  await loadColleges(false);
  showToast("意向已删除");
}

document.addEventListener("click", async (event) => {
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
  if (editCollegeId && state.selectedCollege?.id === editCollegeId) {
    openCollegeEditForm(state.selectedCollege);
    return;
  }

  const deleteCollegeId = event.target.dataset.deleteCollege;
  if (deleteCollegeId) {
    await deleteCollege(deleteCollegeId);
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

  const mentorId = event.target.dataset.intentMentor;
  if (mentorId) {
    const form = document.querySelector("#intentionForm");
    form.reset();
    form.elements.collegeId.value = event.target.dataset.intentCollege;
    form.elements.mentorId.value = mentorId;
    form.elements.mentorName.value = event.target.dataset.intentName;
    document.querySelector("#intentionModal").showModal();
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
    sessionStorage.removeItem("adminPassword");
    updateAdminUi();
    showToast("已退出管理模式");
    return;
  }
  document.querySelector("#adminModal").showModal();
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderCollegeRows();
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
  delete payload.collegeId;

  try {
    const college = collegeId
      ? await api(`/api/colleges/${collegeId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        })
      : await api("/api/colleges", {
          method: "POST",
          body: JSON.stringify(payload)
        });

    form.reset();
    document.querySelector("#collegeModal").close();
    state.selectedCollegeId = college.id;
    await loadColleges(false);
    showToast(collegeId ? "学院信息已修改" : "学院已新增");
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
      ? api(`/api/colleges/${collegeId}/mentors/${mentorId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        })
      : api(`/api/colleges/${collegeId}/mentors`, {
          method: "POST",
          body: JSON.stringify(payload)
        }));

    form.reset();
    document.querySelector("#mentorModal").close();
    await loadColleges(false);
    showToast(mentorId ? "导师信息已修改" : "导师已新增");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#intentionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToJson(form);

  try {
    await api(`/api/colleges/${payload.collegeId}/intentions`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    document.querySelector("#intentionModal").close();
    await loadColleges(false);
    showToast("意向已提交，并汇总到学院总表");
  } catch (error) {
    showToast(error.message);
  }
});

(async function init() {
  if (state.adminPassword) {
    try {
      await loginAsAdmin(state.adminPassword);
    } catch {
      state.adminPassword = "";
      state.isAdmin = false;
      sessionStorage.removeItem("adminPassword");
    }
  }
  updateAdminUi();
  await loadColleges();
})().catch((error) => {
  collegeRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
});
