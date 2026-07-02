const STORAGE_KEY = "applyPilotWeb.v1";

const state = loadState();
let currentView = "dashboard";

const app = document.querySelector("#app");
const dialog = document.querySelector("#editorDialog");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogFields = document.querySelector("#dialogFields");
const editorForm = document.querySelector("#editorForm");
const importFile = document.querySelector("#importFile");

const statuses = ["Saved", "Applying", "Applied", "Networking", "Interview", "Rejected", "Offer"];
const contactStatuses = ["Target", "Requested", "Connected", "Messaged", "Replied"];
const docKinds = ["Master Resume", "Tailored Resume", "Cover Letter", "Message Template", "Notes"];

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    currentView = tab.dataset.view;
    document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("is-active", button === tab));
    render();
  });
});

document.querySelector("#backupButton").addEventListener("click", exportBackup);

editorForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
});

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = JSON.parse(text);
    Object.assign(state, normalizeState(imported));
    saveState();
    render();
  } catch {
    alert("That backup file could not be read.");
  } finally {
    importFile.value = "";
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

render();

function render() {
  const views = {
    dashboard: renderDashboard,
    jobs: renderJobs,
    contacts: renderNetwork,
    assistant: renderAssistant,
    settings: renderMore
  };
  app.innerHTML = views[currentView]();
  bindViewActions();
}

function renderDashboard() {
  const activeJobs = state.jobs.filter((job) => !["Rejected", "Offer"].includes(job.status));
  const interviews = state.jobs.filter((job) => job.status === "Interview").length;
  const avgFit = state.jobs.length ? Math.round(state.jobs.reduce((sum, job) => sum + Number(job.fitScore || 0), 0) / state.jobs.length) : 0;
  const followUps = [...state.jobs]
    .filter((job) => job.followUpDate)
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))
    .slice(0, 4);

  return `
    <section class="stack">
      <div class="grid">
        ${metric("Active", activeJobs.length)}
        ${metric("Interviews", interviews)}
        ${metric("Contacts", state.contacts.length)}
        ${metric("Avg fit", `${avgFit}%`)}
      </div>
      <div class="wide-grid">
        <section class="panel stack">
          <div class="toolbar">
            <h2>Upcoming follow-ups</h2>
            <button class="primary-button" data-action="add-job" type="button">Add job</button>
          </div>
          ${followUps.length ? followUps.map(jobItem).join("") : empty("No follow-ups yet. Add a follow-up date to a job you want to keep moving.")}
        </section>
        <section class="panel stack">
          <h2>Today’s focus</h2>
          ${focusList()}
        </section>
      </div>
    </section>
  `;
}

function renderJobs() {
  return `
    <section class="stack">
      <div class="toolbar">
        <h2>Jobs</h2>
        <button class="primary-button" data-action="add-job" type="button">Add job</button>
      </div>
      ${state.jobs.length ? state.jobs.map(jobItem).join("") : empty("Paste your first job description to score, tailor, and track it.")}
    </section>
  `;
}

function renderNetwork() {
  return `
    <section class="stack">
      <div class="toolbar">
        <h2>Companies</h2>
        <button class="primary-button" data-action="add-company" type="button">Add company</button>
      </div>
      ${state.companies.length ? state.companies.map(companyItem).join("") : empty("Add target companies and why they matter.")}
      <div class="toolbar">
        <h2>Contacts</h2>
        <button class="primary-button" data-action="add-contact" type="button">Add contact</button>
      </div>
      ${state.contacts.length ? state.contacts.map(contactItem).join("") : empty("Save recruiters, hiring managers, and warm contacts.")}
    </section>
  `;
}

function renderAssistant() {
  const selectedJob = state.jobs[0];
  const selectedId = selectedJob?.id || "";
  return `
    <section class="stack">
      <div class="panel stack">
        <h2>Draft Assistant</h2>
        <label>Job
          <select id="assistantJob">
            ${state.jobs.map((job) => `<option value="${job.id}" ${job.id === selectedId ? "selected" : ""}>${escapeHtml(job.company)}: ${escapeHtml(job.title)}</option>`).join("")}
          </select>
        </label>
        <label>Draft type
          <select id="assistantTask">
            <option>Job Fit Review</option>
            <option>Resume Suggestions</option>
            <option>Cover Letter</option>
            <option>LinkedIn Message</option>
            <option>Follow-up Email</option>
            <option>Interview Prep</option>
          </select>
        </label>
        <button class="primary-button" data-action="generate-draft" type="button">Generate draft</button>
      </div>
      <div class="draft-box" id="draftOutput">${state.jobs.length ? "Choose a draft type and generate the next step." : "Add a job first, then drafts will appear here."}</div>
    </section>
  `;
}

function renderMore() {
  return `
    <section class="stack">
      <div class="toolbar">
        <h2>Documents</h2>
        <button class="primary-button" data-action="add-doc" type="button">Add doc</button>
      </div>
      ${state.documents.length ? state.documents.map(docItem).join("") : empty("Store your master resume, tailored versions, cover letters, and notes.")}
      <section class="panel stack">
        <h2>Backup</h2>
        <p class="muted">Export your data before switching phones or clearing Safari data. Import restores a previous ApplyPilot backup.</p>
        <div class="split-actions">
          <button class="secondary-button" data-action="export" type="button">Export</button>
          <button class="secondary-button" data-action="import" type="button">Import</button>
        </div>
      </section>
      <section class="panel stack">
        <h2>Home Screen</h2>
        <p class="muted">On iPhone, open this page in Safari, tap Share, then choose Add to Home Screen.</p>
      </section>
    </section>
  `;
}

function bindViewActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
  });
}

function handleAction(action, id) {
  const maps = {
    "add-job": () => openJobEditor(),
    "edit-job": () => openJobEditor(state.jobs.find((job) => job.id === id)),
    "delete-job": () => removeItem("jobs", id),
    "add-company": () => openCompanyEditor(),
    "edit-company": () => openCompanyEditor(state.companies.find((company) => company.id === id)),
    "delete-company": () => removeItem("companies", id),
    "add-contact": () => openContactEditor(),
    "edit-contact": () => openContactEditor(state.contacts.find((contact) => contact.id === id)),
    "delete-contact": () => removeItem("contacts", id),
    "add-doc": () => openDocEditor(),
    "edit-doc": () => openDocEditor(state.documents.find((doc) => doc.id === id)),
    "delete-doc": () => removeItem("documents", id),
    "generate-draft": generateDraft,
    "export": exportBackup,
    "import": () => importFile.click()
  };
  maps[action]?.();
}

function openJobEditor(job = {}) {
  openEditor(job.id ? "Edit job" : "Add job", [
    field("title", "Role title", job.title),
    field("company", "Company", job.company),
    field("location", "Location", job.location),
    field("jobLink", "Job link", job.jobLink, "url"),
    selectField("status", "Status", statuses, job.status || "Saved"),
    field("fitScore", "Fit score", job.fitScore || estimatedFit(job.jobDescription), "number"),
    field("dateFound", "Date found", job.dateFound || today(), "date"),
    field("dateApplied", "Date applied", job.dateApplied || "", "date"),
    field("followUpDate", "Follow-up date", job.followUpDate || "", "date"),
    textField("jobDescription", "Job description", job.jobDescription),
    textField("notes", "Notes", job.notes)
  ], (values) => {
    const record = { ...job, ...values, fitScore: Number(values.fitScore || estimatedFit(values.jobDescription)), id: job.id || newId() };
    upsert("jobs", record);
  });
}

function openCompanyEditor(company = {}) {
  openEditor(company.id ? "Edit company" : "Add company", [
    field("name", "Company", company.name),
    field("industry", "Industry", company.industry),
    field("priority", "Priority 1-5", company.priority || 3, "number"),
    field("careersURL", "Careers URL", company.careersURL, "url"),
    textField("whyTarget", "Why this company", company.whyTarget),
    textField("notes", "Notes", company.notes)
  ], (values) => upsert("companies", { ...company, ...values, priority: Number(values.priority || 3), id: company.id || newId() }));
}

function openContactEditor(contact = {}) {
  openEditor(contact.id ? "Edit contact" : "Add contact", [
    field("name", "Name", contact.name),
    field("company", "Company", contact.company),
    field("role", "Role", contact.role),
    field("linkedInURL", "LinkedIn URL", contact.linkedInURL, "url"),
    field("email", "Email", contact.email, "email"),
    selectField("status", "Status", contactStatuses, contact.status || "Target"),
    field("lastTouchDate", "Last touch", contact.lastTouchDate || "", "date"),
    field("followUpDate", "Follow-up date", contact.followUpDate || "", "date"),
    textField("notes", "Notes", contact.notes)
  ], (values) => upsert("contacts", { ...contact, ...values, id: contact.id || newId() }));
}

function openDocEditor(doc = {}) {
  openEditor(doc.id ? "Edit document" : "Add document", [
    field("title", "Title", doc.title),
    selectField("kind", "Kind", docKinds, doc.kind || "Master Resume"),
    field("relatedCompany", "Related company", doc.relatedCompany),
    field("relatedRole", "Related role", doc.relatedRole),
    textField("body", "Body", doc.body)
  ], (values) => upsert("documents", { ...doc, ...values, updatedAt: new Date().toISOString(), id: doc.id || newId() }));
}

function openEditor(title, fields, onSave) {
  dialogTitle.textContent = title;
  dialogFields.innerHTML = fields.join("");
  editorForm.onsubmit = (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(editorForm).entries());
    onSave(values);
    dialog.close();
    saveState();
    render();
  };
  dialog.showModal();
}

function upsert(collection, record) {
  const index = state[collection].findIndex((item) => item.id === record.id);
  if (index >= 0) state[collection][index] = record;
  else state[collection].unshift(record);
}

function removeItem(collection, id) {
  if (!confirm("Delete this item?")) return;
  state[collection] = state[collection].filter((item) => item.id !== id);
  saveState();
  render();
}

function generateDraft() {
  const job = state.jobs.find((item) => item.id === document.querySelector("#assistantJob").value);
  const task = document.querySelector("#assistantTask").value;
  const profile = state.documents.find((doc) => doc.kind === "Master Resume")?.body || "";
  document.querySelector("#draftOutput").textContent = draftFor(task, job, profile);
}

function draftFor(task, job, profile) {
  if (!job) return "Add a job first.";
  const keywords = extractKeywords(job.jobDescription).join(", ");
  const drafts = {
    "Job Fit Review": `Recommended action: ${Number(job.fitScore) >= 75 ? "Apply and network" : "Review carefully before applying"}\n\nStrong matches to emphasize:\n- Leadership, communication, and cross-functional work that is already true in your background.\n- Posting language: ${keywords}.\n- Why ${job.company} fits your target search.\n\nCheck honestly:\n- Required credentials or direct experience you do not have.\n- Any salary, travel, location, or work arrangement concerns.\n\nNext step:\nTailor the resume summary and top bullets, then send one warm outreach message.`,
    "Resume Suggestions": `Suggested direction for ${job.title} at ${job.company}:\n\n1. Rewrite the headline toward the target role and strongest true specialty.\n2. Move the most relevant achievements into the top half of the resume.\n3. Mirror accurate keywords from the post: ${keywords}.\n4. Use measurable outcomes where you have them.\n5. Keep this honest: translate real experience, do not invent qualifications.\n\nMaster resume notes found:\n${profile || "No master resume pasted yet."}`,
    "Cover Letter": `Dear Hiring Team,\n\nI am excited to apply for the ${job.title} role at ${job.company}. The opportunity stood out because it combines meaningful work, strategic execution, and clear communication.\n\nMy background has prepared me to manage complex priorities, build relationships, and translate goals into practical action. I was especially drawn to the role's focus on ${keywords}.\n\nI would welcome the opportunity to discuss how my experience can support your team.\n\nSincerely,`,
    "LinkedIn Message": `Hi [Name], I saw the ${job.title} opening at ${job.company} and was drawn to the role's focus on ${keywords}. I am exploring roles where my background could be a strong fit and would be grateful to connect.`,
    "Follow-up Email": `Subject: Following up on ${job.title} application\n\nHi [Name],\n\nI recently applied for the ${job.title} role at ${job.company} and wanted to briefly reiterate my interest. The opportunity aligns well with my experience in relationship building, communication, and strategic execution.\n\nI would be grateful for any update you are able to share and would welcome the chance to speak.\n\nBest,`,
    "Interview Prep": `Interview prep for ${job.company}:\n\nPrepare examples for:\n- A time you influenced without authority.\n- A time you managed competing priorities.\n- A measurable result connected to ${keywords}.\n- Why this company and why this role now.\n\nQuestions to ask:\n- What would success look like in the first 90 days?\n- Which stakeholders are most important for this role?\n- What problem is the team most eager for this hire to solve?`
  };
  return drafts[task];
}

function jobItem(job) {
  const low = Number(job.fitScore) < 75 ? " low" : "";
  return `
    <article class="item">
      <div class="item-head">
        <div class="item-title">
          <strong>${escapeHtml(job.title)}</strong>
          <span class="muted">${escapeHtml(job.company)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</span>
        </div>
        <span class="score${low}">${Number(job.fitScore || 0)}%</span>
      </div>
      <div class="chips">
        <span class="chip">${escapeHtml(job.status || "Saved")}</span>
        ${job.followUpDate ? `<span class="chip">Follow up ${formatDate(job.followUpDate)}</span>` : ""}
      </div>
      <p class="meta">${escapeHtml(truncate(job.notes || job.jobDescription || "No notes yet.", 130))}</p>
      <div class="row-actions">
        <button class="secondary-button" data-action="edit-job" data-id="${job.id}" type="button">Edit</button>
        <button class="danger-button" data-action="delete-job" data-id="${job.id}" type="button">Delete</button>
      </div>
    </article>
  `;
}

function companyItem(company) {
  return `
    <article class="item">
      <div class="item-title">
        <strong>${escapeHtml(company.name)}</strong>
        <span class="muted">${escapeHtml(company.industry || "Target company")}</span>
      </div>
      <div class="chips"><span class="chip">Priority ${company.priority || 3}</span></div>
      <p class="meta">${escapeHtml(truncate(company.whyTarget || company.notes || "No notes yet.", 120))}</p>
      <div class="row-actions">
        <button class="secondary-button" data-action="edit-company" data-id="${company.id}" type="button">Edit</button>
        <button class="danger-button" data-action="delete-company" data-id="${company.id}" type="button">Delete</button>
      </div>
    </article>
  `;
}

function contactItem(contact) {
  return `
    <article class="item">
      <div class="item-title">
        <strong>${escapeHtml(contact.name)}</strong>
        <span class="muted">${escapeHtml([contact.role, contact.company].filter(Boolean).join(", ") || "Networking contact")}</span>
      </div>
      <div class="chips">
        <span class="chip">${escapeHtml(contact.status || "Target")}</span>
        ${contact.followUpDate ? `<span class="chip">Follow up ${formatDate(contact.followUpDate)}</span>` : ""}
      </div>
      <p class="meta">${escapeHtml(truncate(contact.notes || contact.email || contact.linkedInURL || "No notes yet.", 120))}</p>
      <div class="row-actions">
        <button class="secondary-button" data-action="edit-contact" data-id="${contact.id}" type="button">Edit</button>
        <button class="danger-button" data-action="delete-contact" data-id="${contact.id}" type="button">Delete</button>
      </div>
    </article>
  `;
}

function docItem(doc) {
  return `
    <article class="item">
      <div class="item-title">
        <strong>${escapeHtml(doc.title)}</strong>
        <span class="muted">${escapeHtml(doc.kind || "Notes")}</span>
      </div>
      <p class="meta">${escapeHtml(truncate(doc.body || "Empty document.", 140))}</p>
      <div class="row-actions">
        <button class="secondary-button" data-action="edit-doc" data-id="${doc.id}" type="button">Edit</button>
        <button class="danger-button" data-action="delete-doc" data-id="${doc.id}" type="button">Delete</button>
      </div>
    </article>
  `;
}

function focusList() {
  const suggestions = [];
  const networkingJob = state.jobs.find((job) => job.status === "Applied" || job.status === "Networking");
  if (networkingJob) suggestions.push(`Send one follow-up or LinkedIn message for ${networkingJob.company}.`);
  if (!state.documents.some((doc) => doc.kind === "Master Resume")) suggestions.push("Paste your master resume into Documents.");
  if (state.contacts.length < state.companies.length) suggestions.push("Add one contact for a target company.");
  if (!suggestions.length) suggestions.push("Review high-fit jobs and pick the next application to tailor.");
  return suggestions.map((item) => `<article class="item"><p>${escapeHtml(item)}</p></article>`).join("");
}

function field(name, labelText, value = "", type = "text") {
  return `<label>${labelText}<input name="${name}" type="${type}" value="${escapeAttr(value || "")}"></label>`;
}

function textField(name, labelText, value = "") {
  return `<label>${labelText}<textarea name="${name}">${escapeHtml(value || "")}</textarea></label>`;
}

function selectField(name, labelText, options, selected) {
  return `<label>${labelText}<select name="${name}">${options.map((option) => `<option ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><b>${value}</b></div>`;
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return normalizeState(seedState());
}

function normalizeState(value) {
  return {
    jobs: Array.isArray(value.jobs) ? value.jobs : [],
    companies: Array.isArray(value.companies) ? value.companies : [],
    contacts: Array.isArray(value.contacts) ? value.contacts : [],
    documents: Array.isArray(value.documents) ? value.documents : []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedState() {
  return {
    jobs: [{
      id: newId(),
      title: "Director, Patient Advocacy",
      company: "Northstar Bio",
      location: "Remote",
      jobLink: "",
      status: "Networking",
      fitScore: 84,
      dateFound: today(),
      dateApplied: "",
      followUpDate: addDays(3),
      jobDescription: "Lead patient advocacy strategy, cross-functional engagement, rare disease programming, advisory boards, and external partnerships.",
      notes: "Strong mission fit. Find talent acquisition and advocacy leader contacts."
    }],
    companies: [{
      id: newId(),
      name: "Northstar Bio",
      industry: "Biotech",
      priority: 5,
      careersURL: "",
      whyTarget: "Rare disease pipeline and patient-centered mission.",
      notes: ""
    }],
    contacts: [{
      id: newId(),
      name: "Avery Johnson",
      company: "Northstar Bio",
      role: "Talent Acquisition Lead",
      linkedInURL: "",
      email: "",
      status: "Connected",
      lastTouchDate: today(),
      followUpDate: addDays(4),
      notes: "Commented on hiring post."
    }],
    documents: [{
      id: newId(),
      title: "Master Resume",
      kind: "Master Resume",
      relatedCompany: "",
      relatedRole: "",
      body: "Paste your master resume here.",
      updatedAt: new Date().toISOString()
    }]
  };
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `applypilot-backup-${today()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function estimatedFit(description = "") {
  const count = description.split(/\s+/).filter((word) => word.length > 6).length;
  return Math.min(92, Math.max(55, 58 + Math.round(count / 7)));
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractKeywords(text = "") {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 6);
  const counts = words.reduce((map, word) => map.set(word, (map.get(word) || 0) + 1), new Map());
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
  return ranked.slice(0, 6).length ? ranked.slice(0, 6) : ["leadership", "strategy", "communication"];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}
