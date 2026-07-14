const STORAGE_KEY = "applyPilotWeb.v1";
const SUPABASE_URL = "https://yjxnksqyegdhaqewjwzq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_I0m_yKybpKfTL29-rtDbXw_4YN6R7DM";

const defaultDashboardGoals = {
  savedWeekly: 10,
  appliedWeekly: 5,
  followUpsWeekly: 5,
  connectionsWeekly: 5,
  interviewsMonthly: 2
};

const state = loadState();
let currentView = "dashboard";
let latestDraft = null;
let currentUser = null;
let supabaseClient = null;
let cloudSaveTimer = null;

const app = document.querySelector("#app");
const dialog = document.querySelector("#editorDialog");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogFields = document.querySelector("#dialogFields");
const editorForm = document.querySelector("#editorForm");
const importFile = document.querySelector("#importFile");
const resumeFile = document.querySelector("#resumeFile");

const statuses = ["Saved", "Applying", "Applied", "Networking", "Interview", "Rejected", "Offer"];
const contactStatuses = ["Target", "Requested", "Connected", "Messaged", "Replied"];
const docKinds = ["Master Resume", "Tailored Resume", "Cover Letter", "LinkedIn Message", "Follow-up Email", "Interview Prep", "Message Template", "Notes"];
const interviewStatuses = ["Availability requested", "Scheduled", "Completed", "Thank-you sent", "Follow-up needed", "Offer", "Closed"];
const reminderWindowMs = 1000 * 60 * 60 * 24;

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

resumeFile.addEventListener("change", handleResumeUpload);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

render();
initSupabase();
scheduleReminderChecks();

function render() {
  const views = {
    dashboard: renderDashboard,
    jobs: renderJobs,
    contacts: renderNetwork,
    assistant: renderAssistant,
    interviews: renderInterviews,
    settings: renderMore
  };
  app.innerHTML = views[currentView]();
  bindViewActions();
}

function renderDashboard() {
  const activeJobs = state.jobs.filter((job) => !["Rejected", "Offer"].includes(job.status));
  const interviews = state.interviews.filter((interview) => !["Closed", "Offer"].includes(interview.status)).length;
  const avgFit = state.jobs.length ? Math.round(state.jobs.reduce((sum, job) => sum + Number(job.fitScore || 0), 0) / state.jobs.length) : 0;
  const appliedCount = state.jobs.filter((job) => ["Applied", "Networking", "Interview", "Offer", "Rejected"].includes(job.status)).length;
  const followUpCount = upcomingReminders().filter((reminder) => ["job", "contact", "interview-followup"].includes(reminder.type)).length;
  const connectionCount = state.contacts.filter((contact) => ["Connected", "Messaged", "Replied"].includes(contact.status)).length;
  const followUps = upcomingReminders().slice(0, 5);
  const nextStep = focusList();

  return `
    <section class="stack">
      <section class="dashboard-hero">
        <div>
          <p class="eyebrow">Command center</p>
          <h2>Keep every application moving.</h2>
          <p class="muted">Track targets, tailor documents, and follow up with a weekly pace you can actually see.</p>
        </div>
        <button class="primary-button" data-action="add-job" type="button">Add job</button>
      </section>
      <div class="grid metric-grid">
        ${metric("Active", activeJobs.length)}
        ${metric("Applied", appliedCount)}
        ${metric("Follow-ups", followUpCount)}
        ${metric("Connections", connectionCount)}
        ${metric("Interviews", interviews)}
        ${metric("Avg fit", `${avgFit}%`)}
      </div>
      <section class="panel stack">
        <div class="toolbar">
          <h2>Search Dashboard</h2>
          <button class="secondary-button" data-action="edit-goals" type="button">Edit goals</button>
        </div>
        ${dashboardBars()}
      </section>
      <div class="wide-grid">
        <section class="panel stack">
          <div class="toolbar">
            <h2>Upcoming follow-ups</h2>
            <button class="primary-button" data-action="add-job" type="button">Add job</button>
          </div>
          ${followUps.length ? followUps.map(reminderItem).join("") : empty("No follow-ups yet. Add a follow-up date or interview reminder.")}
        </section>
        <section class="panel stack">
          <h2>Today's focus</h2>
          ${nextStep}
        </section>
      </div>
    </section>
  `;
}

function dashboardBars() {
  const goals = dashboardGoals();
  const data = [
    ["Jobs saved", "This week", countThisWeek(state.jobs, "dateFound"), goals.savedWeekly],
    ["Applied", "This week", countAppliedThisWeek(), goals.appliedWeekly],
    ["Follow-ups", "This week", upcomingReminders().filter((reminder) => isThisWeek(reminder.date)).length, goals.followUpsWeekly],
    ["Connections", "This week", countConnectionsThisWeek(), goals.connectionsWeekly],
    ["Interviews", "This month", state.interviews.filter((interview) => isThisMonth(interview.date)).length, goals.interviewsMonthly]
  ];

  return `
    <div class="chart-list">
      ${data.map(([label, period, value, target]) => {
        const width = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
        return `
          <div class="chart-row">
            <div class="chart-label">
              <span>${escapeHtml(label)} <small>${escapeHtml(period)}</small></span>
              <b>${value}/${target}</b>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="pipeline-grid">
      ${statuses.map((status) => {
        const count = state.jobs.filter((job) => job.status === status).length;
        return `<div class="pipeline-pill"><span>${escapeHtml(status)}</span><b>${count}</b></div>`;
      }).join("")}
    </div>
  `;
}

function renderJobs() {
  return `
    <section class="stack">
      <div class="toolbar">
        <h2>Jobs</h2>
        <button class="primary-button" data-action="add-job" type="button">Add job</button>
      </div>
      <div class="info-strip">
        Fit score is an estimate based on job-description keywords, your saved Master Resume text, and role detail. It is not pulled from an employer or job board.
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

function renderInterviews() {
  const scheduled = state.interviews.filter((interview) => interview.status === "Scheduled").length;
  const needsFollowUp = state.interviews.filter((interview) => interview.status === "Follow-up needed" || interview.followUpDate).length;
  const thankYous = state.interviews.filter((interview) => interview.thankYouDate).length;

  return `
    <section class="stack">
      <div class="interview-hero">
        <div>
          <p class="eyebrow">Track conversations</p>
          <h2>Interview Tracker</h2>
          <p class="muted">Keep interview dates, prep notes, questions, thank-you notes, and follow-ups in one place.</p>
        </div>
        <button class="primary-button" data-action="add-interview" type="button">Add interview</button>
      </div>
      <div class="grid">
        ${metric("Scheduled", scheduled)}
        ${metric("Follow-ups", needsFollowUp)}
        ${metric("Thank-yous", thankYous)}
        ${metric("Total", state.interviews.length)}
      </div>
      ${state.interviews.length ? state.interviews.map(interviewItem).join("") : empty("Track phone screens, recruiter calls, panel interviews, thank-you notes, and follow-ups.")}
    </section>
  `;
}

function renderAssistant() {
  const selectedJob = state.jobs[0];
  const selectedId = selectedJob?.id || "";
  return `
    <section class="stack">
      <div class="panel stack">
        <h2>Create Documents</h2>
        <p class="muted">Choose a job, then create tailored resume notes, cover letters, outreach messages, follow-ups, and interview prep. Save useful drafts into Documents.</p>
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
        <div class="split-actions">
          <button class="primary-button" data-action="generate-draft" type="button">Generate</button>
          <button class="secondary-button" data-action="save-draft" type="button">Save draft</button>
        </div>
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
      <section class="panel stack">
        <h2>Master Resume</h2>
        <p class="muted">Upload a text, markdown, or RTF resume to fill your Master Resume document. PDF and Word files can be stored as a reference, but paste the resume text too for better tailoring.</p>
        <div class="split-actions">
          <button class="primary-button" data-action="upload-resume" type="button">Upload resume</button>
          <button class="secondary-button" data-action="recalculate-fit" type="button">Refresh fit scores</button>
        </div>
      </section>
      ${state.documents.length ? state.documents.map(docItem).join("") : empty("Store your master resume, tailored versions, cover letters, and notes.")}
      <section class="panel stack">
        <h2>Dashboard Goals</h2>
        <p class="muted">Set your weekly search pace for saved jobs, applications, follow-ups, and connections. Interviews use a monthly goal.</p>
        <div class="goal-summary">
          ${goalSummary()}
        </div>
        <button class="primary-button" data-action="edit-goals" type="button">Edit goals</button>
      </section>
      <section class="panel stack">
        <h2>Reminders</h2>
        <p class="muted">Notifications depend on your iPhone/Safari settings. They work best after adding ApplyPilot to your Home Screen.</p>
        <button class="primary-button" data-action="enable-notifications" type="button">Enable notifications</button>
      </section>
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
      <section class="panel stack">
        <h2>Sign In</h2>
        ${authPanel()}
      </section>
    </section>
  `;
}

function authPanel() {
  if (currentUser) {
    return `
      <p class="muted">Signed in as ${escapeHtml(currentUser.email || "your account")}. Changes save to this device and sync to Supabase.</p>
      <div class="split-actions">
        <button class="primary-button" data-action="sync-cloud" type="button">Sync now</button>
        <button class="secondary-button" data-action="sign-out" type="button">Sign out</button>
      </div>
    `;
  }

  return `
    <p class="muted">Sign in to sync ApplyPilot between your iPhone and Dell. If this is your first time, use Sign up.</p>
    <label>Email
      <input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com">
    </label>
    <label>Password
      <input id="authPassword" type="password" autocomplete="current-password" placeholder="At least 6 characters">
    </label>
    <div class="split-actions">
      <button class="primary-button" data-action="sign-in" type="button">Sign in</button>
      <button class="secondary-button" data-action="sign-up" type="button">Sign up</button>
    </div>
    <p class="muted">You may need to confirm your email before signing in, depending on your Supabase Auth settings.</p>
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
    "add-interview": () => openInterviewEditor(),
    "edit-interview": () => openInterviewEditor(state.interviews.find((interview) => interview.id === id)),
    "delete-interview": () => removeItem("interviews", id),
    "add-doc": () => openDocEditor(),
    "edit-doc": () => openDocEditor(state.documents.find((doc) => doc.id === id)),
    "delete-doc": () => removeItem("documents", id),
    "generate-draft": generateDraft,
    "save-draft": saveLatestDraft,
    "upload-resume": () => resumeFile.click(),
    "recalculate-fit": recalculateFitScores,
    "edit-goals": () => openGoalEditor(),
    "enable-notifications": enableNotifications,
    "sign-in": signIn,
    "sign-up": signUp,
    "sign-out": signOut,
    "sync-cloud": syncToCloud,
    "export": exportBackup,
    "import": () => importFile.click()
  };
  maps[action]?.();
}

function openJobEditor(job = {}) {
  const profile = masterResumeText();
  openEditor(job.id ? "Edit job" : "Add job", [
    field("title", "Role title", job.title),
    field("company", "Company", job.company),
    field("location", "Location", job.location),
    field("jobLink", "Job link", job.jobLink, "url"),
    selectField("status", "Status", statuses, job.status || "Saved"),
    field("fitScore", "Fit score", job.fitScore || estimatedFit(job.jobDescription, profile), "number"),
    field("dateFound", "Date found", job.dateFound || today(), "date"),
    field("dateApplied", "Date applied", job.dateApplied || "", "date"),
    field("followUpDate", "Follow-up date", job.followUpDate || "", "date"),
    textField("jobDescription", "Job description", job.jobDescription),
    textField("notes", "Notes", job.notes)
  ], (values) => {
    const record = { ...job, ...values, fitScore: Number(values.fitScore || estimatedFit(values.jobDescription, profile)), id: job.id || newId() };
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

function openInterviewEditor(interview = {}) {
  openEditor(interview.id ? "Edit interview" : "Add interview", [
    field("company", "Company", interview.company),
    field("role", "Role", interview.role),
    field("interviewer", "Interviewer / panel", interview.interviewer),
    selectField("status", "Status", interviewStatuses, interview.status || "Availability requested"),
    clearableDateField("date", "Interview date (if scheduled)", interview.date || ""),
    field("time", "Interview time", interview.time || "", "time"),
    field("location", "Location or video link", interview.location),
    field("thankYouDate", "Thank-you sent date", interview.thankYouDate || "", "date"),
    field("followUpDate", "Follow-up date", interview.followUpDate || "", "date"),
    textField("prepNotes", "Prep notes", interview.prepNotes),
    textField("questions", "Questions to ask", interview.questions),
    textField("notes", "Interview notes", interview.notes)
  ], (values) => upsert("interviews", { ...interview, ...values, id: interview.id || newId() }));
}

function openGoalEditor() {
  const goals = dashboardGoals();
  openEditor("Dashboard goals", [
    field("savedWeekly", "Jobs saved per week", goals.savedWeekly, "number"),
    field("appliedWeekly", "Applications per week", goals.appliedWeekly, "number"),
    field("followUpsWeekly", "Follow-ups per week", goals.followUpsWeekly, "number"),
    field("connectionsWeekly", "Connections per week", goals.connectionsWeekly, "number"),
    field("interviewsMonthly", "Interviews per month", goals.interviewsMonthly, "number")
  ], (values) => {
    state.settings.dashboardGoals = {
      savedWeekly: cleanGoal(values.savedWeekly),
      appliedWeekly: cleanGoal(values.appliedWeekly),
      followUpsWeekly: cleanGoal(values.followUpsWeekly),
      connectionsWeekly: cleanGoal(values.connectionsWeekly),
      interviewsMonthly: cleanGoal(values.interviewsMonthly)
    };
  });
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
  dialogFields.querySelectorAll("[data-clear-field]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = dialogFields.querySelector(`[name="${button.dataset.clearField}"]`);
      if (input) input.value = "";
    });
  });
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

async function generateDraft() {
  const job = state.jobs.find((item) => item.id === document.querySelector("#assistantJob").value);
  const task = document.querySelector("#assistantTask").value;
  const profile = state.documents.find((doc) => doc.kind === "Master Resume")?.body || "";
  const output = document.querySelector("#draftOutput");
  if (!job) {
    output.textContent = "Add a job first.";
    latestDraft = null;
    return;
  }

  output.textContent = "Generating draft...";
  let body = "";
  try {
    body = await generateDraftWithAI(task, job, profile);
  } catch (error) {
    body = `AI generation is not connected yet, so this is a local starter draft.\n\n${draftFor(task, job, profile)}\n\nSetup note: ${error.message}`;
  }
  latestDraft = job ? { task, job, body } : null;
  output.textContent = body;
}

async function generateDraftWithAI(task, job, profile) {
  if (!supabaseClient || !currentUser) {
    throw new Error("Sign in under More, then try Generate again.");
  }

  const { data, error } = await supabaseClient.functions.invoke("generate-documents", {
    body: {
      task,
      masterResume: profile,
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        jobDescription: job.jobDescription,
        notes: job.notes,
        fitScore: job.fitScore
      }
    }
  });

  if (error) {
    throw new Error(error.message || "Supabase Edge Function failed.");
  }
  if (!data?.body) {
    throw new Error(data?.error || "No AI draft came back.");
  }
  return data.body;
}

function saveLatestDraft() {
  if (!latestDraft) {
    alert("Generate a draft first.");
    return;
  }
  const kindMap = {
    "Resume Suggestions": "Tailored Resume",
    "Cover Letter": "Cover Letter",
    "LinkedIn Message": "LinkedIn Message",
    "Follow-up Email": "Follow-up Email",
    "Interview Prep": "Interview Prep",
    "Job Fit Review": "Notes"
  };
  state.documents.unshift({
    id: newId(),
    title: `${latestDraft.task} - ${latestDraft.job.company}`,
    kind: kindMap[latestDraft.task] || "Notes",
    relatedCompany: latestDraft.job.company,
    relatedRole: latestDraft.job.title,
    body: latestDraft.body,
    updatedAt: new Date().toISOString()
  });
  saveState();
  alert("Draft saved to Documents.");
  render();
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
          <span class="muted">${escapeHtml(job.company)}${job.location ? ` - ${escapeHtml(job.location)}` : ""}</span>
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

function interviewItem(interview) {
  return `
    <article class="item">
      <div class="item-head">
        <div class="item-title">
          <strong>${escapeHtml(interview.company || "Interview")}</strong>
          <span class="muted">${escapeHtml(interview.role || "Role not set")}${interview.date ? ` - ${formatDate(interview.date)}` : ""}</span>
        </div>
        <span class="score">${escapeHtml(interview.status || "Scheduled")}</span>
      </div>
      <div class="chips">
        ${interview.time ? `<span class="chip">${escapeHtml(interview.time)}</span>` : ""}
        ${interview.followUpDate ? `<span class="chip">Follow up ${formatDate(interview.followUpDate)}</span>` : ""}
      </div>
      <p class="meta">${escapeHtml(truncate(interview.prepNotes || interview.questions || interview.notes || "No prep notes yet.", 130))}</p>
      <div class="row-actions">
        <button class="secondary-button" data-action="edit-interview" data-id="${interview.id}" type="button">Edit</button>
        <button class="danger-button" data-action="delete-interview" data-id="${interview.id}" type="button">Delete</button>
      </div>
    </article>
  `;
}

function reminderItem(reminder) {
  return `
    <article class="item">
      <div class="item-title">
        <strong>${escapeHtml(reminder.title)}</strong>
        <span class="muted">${escapeHtml(reminder.detail)}</span>
      </div>
      <div class="chips"><span class="chip">${formatDate(reminder.date)}</span></div>
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
  const nextInterview = state.interviews.find((interview) => interview.status === "Scheduled");
  if (networkingJob) suggestions.push(`Send one follow-up or LinkedIn message for ${networkingJob.company}.`);
  if (nextInterview) suggestions.push(`Prep for ${nextInterview.company} interview and save three questions to ask.`);
  if (!state.documents.some((doc) => doc.kind === "Master Resume")) suggestions.push("Upload or paste your master resume into Documents.");
  if (state.contacts.length < state.companies.length) suggestions.push("Add one contact for a target company.");
  if (!suggestions.length) suggestions.push("Review high-fit jobs and pick the next application to tailor.");
  return suggestions.map((item) => `<article class="item"><p>${escapeHtml(item)}</p></article>`).join("");
}

function field(name, labelText, value = "", type = "text") {
  return `<label>${labelText}<input name="${name}" type="${type}" value="${escapeAttr(value || "")}"></label>`;
}

function clearableDateField(name, labelText, value = "") {
  return `
    <label>${labelText}
      <input name="${name}" type="date" value="${escapeAttr(value || "")}">
      <button class="secondary-button clear-field-button" data-clear-field="${escapeAttr(name)}" type="button">Clear date</button>
    </label>
  `;
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

function goalSummary() {
  const goals = dashboardGoals();
  return [
    ["Saved", `${goals.savedWeekly}/week`],
    ["Applied", `${goals.appliedWeekly}/week`],
    ["Follow-ups", `${goals.followUpsWeekly}/week`],
    ["Connections", `${goals.connectionsWeekly}/week`],
    ["Interviews", `${goals.interviewsMonthly}/month`]
  ].map(([label, value]) => `<div class="pipeline-pill"><span>${label}</span><b>${value}</b></div>`).join("");
}

function dashboardGoals() {
  return {
    ...defaultDashboardGoals,
    ...(state.settings?.dashboardGoals || {})
  };
}

function cleanGoal(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 1;
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

async function initSupabase() {
  if (!window.supabase?.createClient) return;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) await loadCloudState();
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await loadCloudState();
    render();
  });
  render();
}

async function signUp() {
  const credentials = authCredentials();
  if (!credentials) return;
  const { error } = await supabaseClient.auth.signUp(credentials);
  if (error) {
    alert(error.message);
    return;
  }
  alert("Account created. Check your email if Supabase asks for confirmation, then sign in.");
}

async function signIn() {
  const credentials = authCredentials();
  if (!credentials) return;
  const { data, error } = await supabaseClient.auth.signInWithPassword(credentials);
  if (error) {
    alert(error.message);
    return;
  }
  currentUser = data.user;
  await loadCloudState();
  render();
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  render();
}

function authCredentials() {
  if (!supabaseClient) {
    alert("Supabase is not loaded yet. Refresh and try again.");
    return null;
  }
  const email = document.querySelector("#authEmail")?.value.trim();
  const password = document.querySelector("#authPassword")?.value;
  if (!email || !password) {
    alert("Enter an email and password.");
    return null;
  }
  return { email, password };
}

async function loadCloudState() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from("applypilot_workspaces")
    .select("data")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    alert(`Cloud load failed: ${error.message}`);
    return;
  }

  if (data?.data) {
    Object.assign(state, normalizeState(data.data));
    saveStateLocalOnly();
  } else {
    await syncToCloud(false);
  }
}

function queueCloudSave() {
  if (!supabaseClient || !currentUser) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => syncToCloud(false), 700);
}

async function syncToCloud(showAlert = true) {
  if (!supabaseClient || !currentUser) {
    if (showAlert) alert("Sign in first.");
    return;
  }
  const payload = {
    user_id: currentUser.id,
    data: normalizeState(state),
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseClient
    .from("applypilot_workspaces")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    if (showAlert) alert(`Cloud sync failed: ${error.message}`);
    return;
  }
  if (showAlert) alert("Synced to Supabase.");
}

function normalizeState(value) {
  const settings = {
    notificationsEnabled: false,
    notified: {},
    ...(value.settings || {})
  };
  settings.dashboardGoals = {
    ...defaultDashboardGoals,
    ...(settings.dashboardGoals || {})
  };
  return {
    jobs: Array.isArray(value.jobs) ? value.jobs : [],
    companies: Array.isArray(value.companies) ? value.companies : [],
    contacts: Array.isArray(value.contacts) ? value.contacts : [],
    interviews: Array.isArray(value.interviews) ? value.interviews : [],
    documents: Array.isArray(value.documents) ? value.documents : [],
    settings
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
}

function saveStateLocalOnly() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function handleResumeUpload() {
  const file = resumeFile.files[0];
  if (!file) return;

  const lowerName = file.name.toLowerCase();
  const textLike = lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".rtf") || file.type.startsWith("text/");
  let body = "";

  if (textLike) {
    body = await file.text();
  } else {
    body = `Uploaded file: ${file.name}\n\nFor best resume tailoring, paste the text from this resume here. This web version can store the file name, but PDF and Word text extraction is limited without a larger document parser.`;
  }

  const existing = state.documents.find((doc) => doc.kind === "Master Resume");
  const record = {
    id: existing?.id || newId(),
    title: "Master Resume",
    kind: "Master Resume",
    relatedCompany: "",
    relatedRole: "",
    body,
    fileName: file.name,
    updatedAt: new Date().toISOString()
  };

  if (existing) Object.assign(existing, record);
  else state.documents.unshift(record);

  recalculateFitScores(false);
  saveState();
  resumeFile.value = "";
  alert(textLike ? "Master Resume uploaded." : "Resume reference saved. Paste resume text into the Master Resume document for better tailoring.");
  render();
}

function recalculateFitScores(showAlert = true) {
  const profile = masterResumeText();
  state.jobs.forEach((job) => {
    job.fitScore = estimatedFit(job.jobDescription, profile);
  });
  saveState();
  if (showAlert) {
    alert("Fit scores refreshed.");
    render();
  }
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
    interviews: [{
      id: newId(),
      company: "Northstar Bio",
      role: "Director, Patient Advocacy",
      interviewer: "Recruiter screen",
      status: "Scheduled",
      date: addDays(6),
      time: "10:00",
      location: "Video call",
      thankYouDate: "",
      followUpDate: addDays(7),
      prepNotes: "Prepare examples for advocacy strategy, stakeholder management, and cross-functional leadership.",
      questions: "What would success look like in the first 90 days?",
      notes: ""
    }],
    documents: [{
      id: newId(),
      title: "Master Resume",
      kind: "Master Resume",
      relatedCompany: "",
      relatedRole: "",
      body: "Paste your master resume here.",
      updatedAt: new Date().toISOString()
    }],
    settings: {
      notificationsEnabled: false,
      notified: {},
      dashboardGoals: defaultDashboardGoals
    }
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

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }
  const permission = await Notification.requestPermission();
  state.settings.notificationsEnabled = permission === "granted";
  saveState();
  alert(permission === "granted" ? "Notifications enabled. They work best from the Home Screen app." : "Notifications were not enabled.");
  scheduleReminderChecks();
}

function scheduleReminderChecks() {
  notifyDueReminders();
  window.setInterval(notifyDueReminders, 1000 * 60 * 30);
}

function notifyDueReminders() {
  if (!state.settings?.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const notified = state.settings.notified || {};
  const due = upcomingReminders().filter((reminder) => {
    const time = new Date(`${reminder.date}T12:00:00`).getTime();
    const diff = time - Date.now();
    return diff > -reminderWindowMs && diff < reminderWindowMs;
  });

  due.forEach((reminder) => {
    const key = `${reminder.type}-${reminder.id}-${reminder.date}`;
    if (notified[key]) return;
    new Notification("ApplyPilot reminder", { body: `${reminder.title}: ${reminder.detail}` });
    notified[key] = true;
  });
  state.settings.notified = notified;
  saveState();
}

function upcomingReminders() {
  const jobReminders = state.jobs
    .filter((job) => job.followUpDate)
    .map((job) => ({
      id: job.id,
      type: "job",
      date: job.followUpDate,
      title: `Follow up with ${job.company}`,
      detail: job.title
    }));
  const contactReminders = state.contacts
    .filter((contact) => contact.followUpDate)
    .map((contact) => ({
      id: contact.id,
      type: "contact",
      date: contact.followUpDate,
      title: `Follow up with ${contact.name}`,
      detail: contact.company || contact.role || "Networking contact"
    }));
  const interviewReminders = state.interviews
    .filter((interview) => interview.date || interview.followUpDate)
    .flatMap((interview) => {
      const items = [];
      if (interview.date) {
        items.push({
          id: interview.id,
          type: "interview",
          date: interview.date,
          title: `Interview: ${interview.company}`,
          detail: interview.role || interview.interviewer || "Scheduled interview"
        });
      }
      if (interview.followUpDate) {
        items.push({
          id: interview.id,
          type: "interview-followup",
          date: interview.followUpDate,
          title: `Interview follow-up: ${interview.company}`,
          detail: interview.role || "Send follow-up"
        });
      }
      return items;
    });

  return [...jobReminders, ...contactReminders, ...interviewReminders]
    .sort((a, b) => a.date.localeCompare(b.date));
}

function countThisWeek(items, fieldName) {
  return items.filter((item) => isThisWeek(item[fieldName])).length;
}

function countAppliedThisWeek() {
  return state.jobs.filter((job) => isThisWeek(job.dateApplied)).length;
}

function countConnectionsThisWeek() {
  return state.contacts.filter((contact) =>
    ["Connected", "Messaged", "Replied"].includes(contact.status) && isThisWeek(contact.lastTouchDate)
  ).length;
}

function isThisWeek(value) {
  const date = parseLocalDate(value);
  if (!date) return false;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const start = new Date(todayDate);
  start.setDate(todayDate.getDate() - todayDate.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function isThisMonth(value) {
  const date = parseLocalDate(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function estimatedFit(description = "", profile = masterResumeText()) {
  const jobKeywords = extractKeywords(description, 16);
  const profileWords = new Set(tokenize(profile));
  const overlap = jobKeywords.filter((word) => profileWords.has(word)).length;
  const detailBoost = Math.min(14, Math.floor(tokenize(description).length / 18));
  const resumeBoost = profile.trim().length > 80 ? Math.min(22, overlap * 4) : 0;
  const hasProfilePenalty = profile.trim().length > 80 ? 0 : -8;
  return Math.max(38, Math.min(96, 52 + detailBoost + resumeBoost + hasProfilePenalty));
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function masterResumeText() {
  return state.documents.find((doc) => doc.kind === "Master Resume")?.body || "";
}

function tokenize(text = "") {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4 && !["their", "there", "about", "which", "would", "could", "should", "with", "from", "this", "that"].includes(word));
}

function extractKeywords(text = "", limit = 6) {
  const words = tokenize(text).filter((word) => word.length > 6);
  const counts = words.reduce((map, word) => map.set(word, (map.get(word) || 0) + 1), new Map());
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
  return ranked.slice(0, limit).length ? ranked.slice(0, limit) : ["leadership", "strategy", "communication"];
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
