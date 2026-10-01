(() => {
  "use strict";

  const STORE_KEY = "focus-productivity.data.v2";
  const LEGACY_KEY = "my-todo-list.tasks.v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = () => localDate();
  const completionDate = (value) => {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : localDate(date);
  };
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeText = (value, limit = 180) => typeof value === "string" ? value.trim().slice(0, limit) : "";
  const validDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && localDate(date) === value;
  };

  function readData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved && saved.schemaVersion === 2 && Array.isArray(saved.tasks) && Array.isArray(saved.notes)) {
        return {
          schemaVersion: 2,
          tasks: saved.tasks.filter((task) => task && typeof task.id === "string" && typeof task.title === "string").map(normalizeTask),
          notes: saved.notes.filter((note) => note && typeof note.id === "string").map(normalizeNote),
          preferences: { theme: saved.preferences?.theme === "dark" ? "dark" : "light", view: ["list", "kanban"].includes(saved.preferences?.view) ? saved.preferences.view : "list", filter: ["all", "active", "completed"].includes(saved.preferences?.filter) ? saved.preferences.filter : "all", reminders: saved.preferences?.reminders === true },
          metadata: { createdAt: saved.metadata?.createdAt || new Date().toISOString(), updatedAt: saved.metadata?.updatedAt || new Date().toISOString() }
        };
      }
    } catch { /* A malformed current file falls through to safe legacy recovery. */ }
    try {
      const previous = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      const tasks = Array.isArray(previous) ? previous.filter((task) => task && typeof task.id === "string" && typeof task.text === "string").map((task) => normalizeTask({ ...task, title: task.text, status: task.completed ? "completed" : "todo", priority: "medium", category: "", description: "", dueDate: "", pinned: false, createdAt: task.createdAt || new Date().toISOString(), completedAt: task.completed ? today() : "" })) : [];
      return freshData(tasks);
    } catch { return freshData(); }
  }

  function freshData(tasks = []) {
    return { schemaVersion: 2, tasks, notes: [], preferences: { theme: "light", view: "list", filter: "all", reminders: false }, metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
  }

  function normalizeTask(task) {
    const status = ["todo", "progress", "completed"].includes(task.status) ? task.status : task.completed ? "completed" : "todo";
    return { id: String(task.id), title: safeText(task.title || task.text), description: safeText(task.description, 1200), status, priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium", dueDate: validDate(task.dueDate) ? task.dueDate : "", category: safeText(task.category, 36), pinned: task.pinned === true, createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(), completedAt: status === "completed" ? (typeof task.completedAt === "string" && task.completedAt ? task.completedAt : today()) : "", notifiedFor: typeof task.notifiedFor === "string" ? task.notifiedFor : "" };
  }

  function normalizeNote(note) {
    return { id: String(note.id), title: safeText(note.title, 100), content: safeText(note.content, 2000), color: ["yellow", "pink", "blue", "green", "lavender"].includes(note.color) ? note.color : "yellow", pinned: note.pinned === true, createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date().toISOString(), updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : new Date().toISOString() };
  }

  let data = readData();
  let activeView = "dashboard";
  let searchQuery = "";
  let priorityFilter = "all";
  let categoryFilter = "all";
  let sortMode = "manual";
  let draggedTaskId = "";
  let draggedNoteId = "";
  let toastTimer;

  const els = {
    taskList: $("#task-list"), taskEmpty: $("#task-empty"), taskForm: $("#task-form"), taskTitle: $("#task-title"),
    taskDialog: $("#task-dialog"), noteDialog: $("#note-dialog"), noteForm: $("#note-detail-form"), taskDetailForm: $("#task-detail-form"),
    globalSearch: $("#global-search"), listView: $("#list-view"), kanbanView: $("#kanban-view"), notesGrid: $("#notes-grid"), toast: $("#toast")
  };

  function save() {
    data.metadata.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
    catch { notify("Could not save. Your browser storage may be full or disabled.", "error"); }
  }

  function notify(text, kind = "success") {
    els.toast.textContent = text;
    els.toast.className = `toast is-visible ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.className = "toast"; }, 2800);
  }

  function isOverdue(task) { return task.status !== "completed" && task.dueDate && task.dueDate < today(); }
  function taskMatchesSearch(task) { const haystack = `${task.title} ${task.description} ${task.category}`.toLocaleLowerCase(); return haystack.includes(searchQuery); }
  function noteMatchesSearch(note) { return `${note.title} ${note.content}`.toLocaleLowerCase().includes(searchQuery); }

  function filteredTasks() {
    const filter = $(".filter-button.is-active")?.dataset.filter || data.preferences.filter;
    const list = data.tasks.filter((task) => (filter === "all" || (filter === "active" && task.status !== "completed") || (filter === "completed" && task.status === "completed")) && (priorityFilter === "all" || task.priority === priorityFilter) && (categoryFilter === "all" || task.category === categoryFilter) && taskMatchesSearch(task));
    const pinned = (a, b) => Number(b.pinned) - Number(a.pinned);
    list.sort((a, b) => pinned(a, b) || (sortMode === "due" ? (a.dueDate || "9999").localeCompare(b.dueDate || "9999") : sortMode === "priority" ? ["high", "medium", "low"].indexOf(a.priority) - ["high", "medium", "low"].indexOf(b.priority) : sortMode === "created" ? b.createdAt.localeCompare(a.createdAt) : 0));
    return list;
  }

  function iconButton(label, glyph, action, className = "") {
    const button = document.createElement("button");
    button.type = "button"; button.className = `icon-button ${className}`; button.setAttribute("aria-label", label); button.title = label; button.textContent = glyph;
    button.addEventListener("click", action);
    return button;
  }

  function taskCard(task, kanban = false) {
    const card = document.createElement(kanban ? "article" : "li");
    card.className = `task-card ${task.status === "completed" ? "is-completed" : ""} ${isOverdue(task) ? "is-overdue" : ""}`;
    card.dataset.taskId = task.id;
    card.draggable = true;
    card.addEventListener("dragstart", (event) => { draggedTaskId = task.id; event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; card.classList.add("is-dragging"); });
    card.addEventListener("dragend", () => { card.classList.remove("is-dragging"); draggedTaskId = ""; });

    const check = document.createElement("button"); check.type = "button"; check.className = "task-check"; check.setAttribute("aria-label", task.status === "completed" ? "Mark incomplete" : "Mark complete"); check.setAttribute("aria-pressed", String(task.status === "completed")); check.textContent = task.status === "completed" ? "✓" : "";
    check.addEventListener("click", () => { const complete = task.status !== "completed"; task.status = complete ? "completed" : "todo"; task.completedAt = complete ? new Date().toISOString() : ""; save(); render(); });
    const body = document.createElement("div"); body.className = "task-body";
    const titleLine = document.createElement("div"); titleLine.className = "task-title-line";
    const title = document.createElement("span"); title.className = "task-title"; title.textContent = task.title;
    titleLine.append(title);
    if (task.pinned) { const pin = document.createElement("span"); pin.className = "pin-mark"; pin.textContent = "◆"; pin.title = "Pinned"; titleLine.append(pin); }
    if (task.description) { const desc = document.createElement("p"); desc.className = "task-description"; desc.textContent = task.description; body.append(titleLine, desc); } else body.append(titleLine);
    const meta = document.createElement("div"); meta.className = "task-meta";
    const priority = document.createElement("span"); priority.className = `priority-pill ${task.priority}`; priority.textContent = `${task.priority} priority`; meta.append(priority);
    if (task.category) { const cat = document.createElement("span"); cat.className = "category-pill"; cat.textContent = task.category; meta.append(cat); }
    if (task.dueDate) { const due = document.createElement("span"); due.className = `due-label ${isOverdue(task) ? "overdue" : task.dueDate === today() ? "due-today" : ""}`; due.textContent = `${isOverdue(task) ? "Overdue · " : task.dueDate === today() ? "Today · " : "Due · "}${new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`; meta.append(due); }
    body.append(meta);
    const actions = document.createElement("div"); actions.className = "task-actions";
    actions.append(iconButton(task.pinned ? "Unpin task" : "Pin task", task.pinned ? "◆" : "◇", () => { task.pinned = !task.pinned; save(); render(); }, "pin-action"), iconButton("Edit task", "✎", () => openTaskDialog(task)), iconButton("Delete task", "×", () => { if (!confirm(`Delete “${task.title}”?`)) return; data.tasks = data.tasks.filter((item) => item.id !== task.id); save(); render(); notify("Task deleted."); }, "delete-action"));
    card.append(check, body, actions);
    return card;
  }

  function renderTasks() {
    renderCategories();
    const visible = filteredTasks();
    els.taskList.replaceChildren(...visible.map((task) => taskCard(task)));
    const active = data.tasks.filter((task) => task.status !== "completed").length;
    const completed = data.tasks.length - active;
    $("#filter-all-count").textContent = data.tasks.length; $("#filter-active-count").textContent = active; $("#filter-completed-count").textContent = completed;
    $("#nav-active-count").textContent = active;
    $("#task-summary").textContent = `${active} ${active === 1 ? "task" : "tasks"} left`;
    $("#clear-completed").disabled = completed === 0;
    els.taskEmpty.hidden = visible.length !== 0;
    $("#task-empty-title").textContent = searchQuery ? "No matching tasks" : "A clear start";
    $("#task-empty-copy").textContent = searchQuery ? "Try another search or adjust your filters." : "Your list is quiet. Add a task to get going.";
    $("#search-status").textContent = searchQuery ? `${visible.length} task${visible.length === 1 ? "" : "s"} match “${els.globalSearch.value}”` : "";
    renderKanban();
  }

  function renderKanban() {
    $$(".kanban-dropzone").forEach((zone) => {
      const status = zone.dataset.status;
      const cards = filteredTasks().filter((task) => task.status === status);
      zone.replaceChildren(...cards.map((task) => taskCard(task, true)));
      zone.closest(".kanban-column").querySelector(".column-count").textContent = cards.length;
      zone.ondragover = (event) => { event.preventDefault(); zone.classList.add("is-drop-target"); };
      zone.ondragleave = () => zone.classList.remove("is-drop-target");
      zone.ondrop = (event) => { event.preventDefault(); zone.classList.remove("is-drop-target"); const id = event.dataTransfer.getData("text/plain") || draggedTaskId; const task = data.tasks.find((item) => item.id === id); if (task && task.status !== status) { task.status = status; task.completedAt = status === "completed" ? new Date().toISOString() : ""; save(); render(); } };
    });
  }

  function renderCategories() {
    const select = $("#category-filter"); const previous = categoryFilter;
    const categories = [...new Set(data.tasks.map((task) => task.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.replaceChildren(new Option("All categories", "all"), ...categories.map((category) => new Option(category, category)));
    select.value = categories.includes(previous) ? previous : "all";
    if (!categories.includes(previous)) categoryFilter = "all";
  }

  function dateRangeLast7() {
    return Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); return date; });
  }
  function renderDashboard() {
    const completed = data.tasks.filter((task) => task.status === "completed");
    const active = data.tasks.filter((task) => task.status !== "completed");
    const overdue = active.filter(isOverdue);
    const doneToday = completed.filter((task) => completionDate(task.completedAt) === today()).length;
    const percent = data.tasks.length ? Math.round(completed.length / data.tasks.length * 100) : 0;
    $("#today-label").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
    $("#stat-total").textContent = data.tasks.length; $("#stat-completed").textContent = completed.length; $("#stat-active").textContent = active.length; $("#stat-overdue").textContent = overdue.length;
    $("#completed-today").textContent = doneToday; $("#completion-label").textContent = `${percent}%`; $("#completion-bar").style.width = `${percent}%`;
    const days = dateRangeLast7();
    const values = days.map((date) => completed.filter((task) => completionDate(task.completedAt) === localDate(date)).length);
    const max = Math.max(...values, 1); $("#week-total").textContent = `${values.reduce((sum, value) => sum + value, 0)} this week`;
    const chart = $("#weekly-chart"); chart.setAttribute("aria-label", `Weekly chart: ${values.reduce((sum, value) => sum + value, 0)} tasks completed over the last seven days`);
    chart.replaceChildren(...days.map((date, index) => { const col = document.createElement("div"); col.className = "chart-day"; const value = document.createElement("span"); value.className = "chart-value"; value.textContent = values[index] || ""; const track = document.createElement("div"); track.className = "bar-track"; const bar = document.createElement("span"); bar.className = "bar-fill"; bar.style.height = `${values[index] ? Math.max(10, values[index] / max * 100) : 4}%`; track.append(bar); const label = document.createElement("small"); label.textContent = date.toLocaleDateString(undefined, { weekday: "short" }); col.append(value, track, label); return col; }));
    const streakDates = new Set(completed.map((task) => completionDate(task.completedAt)).filter(Boolean)); let streak = 0; const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    if (!streakDates.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (streakDates.has(localDate(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    $("#streak-count").textContent = streak; $("#streak-caption").textContent = streak ? "You’ve been showing up. Keep it going." : "Complete a task today to start a streak.";
    const coming = active.filter((task) => task.dueDate && task.dueDate >= today()).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
    const upcoming = $("#upcoming-list");
    if (!coming.length) { const blank = document.createElement("p"); blank.className = "subtle-empty"; blank.textContent = active.length ? "No due dates coming up. Your schedule has room." : "No tasks yet. Add one when you are ready."; upcoming.replaceChildren(blank); }
    else upcoming.replaceChildren(...coming.map((task) => { const row = document.createElement("div"); row.className = "upcoming-item"; const dot = document.createElement("span"); dot.className = `priority-dot ${task.priority}`; const title = document.createElement("span"); title.textContent = task.title; const due = document.createElement("time"); due.textContent = task.dueDate === today() ? "Today" : new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }); row.append(dot, title, due); return row; }));
  }

  function renderNotes() {
    const notes = data.notes.filter(noteMatchesSearch).sort((a, b) => Number(b.pinned) - Number(a.pinned));
    $("#note-count-label").textContent = `${data.notes.length} ${data.notes.length === 1 ? "note" : "notes"}`;
    $("#notes-empty").hidden = notes.length > 0;
    els.notesGrid.replaceChildren(...notes.map((note) => {
      const card = document.createElement("article"); card.className = `note-card ${note.color}`; card.dataset.noteId = note.id; card.draggable = true;
      card.addEventListener("dragstart", (event) => { draggedNoteId = note.id; event.dataTransfer.setData("text/plain", note.id); card.classList.add("is-dragging"); }); card.addEventListener("dragend", () => { card.classList.remove("is-dragging"); draggedNoteId = ""; });
      const head = document.createElement("header"); const title = document.createElement("h2"); title.textContent = note.title || "Untitled note"; const tools = document.createElement("div"); tools.className = "note-actions";
      tools.append(iconButton(note.pinned ? "Unpin note" : "Pin note", note.pinned ? "◆" : "◇", () => { note.pinned = !note.pinned; save(); renderNotes(); }, "pin-action"), iconButton("Edit note", "✎", () => openNoteDialog(note)), iconButton("Delete note", "×", () => { if (!confirm("Delete this sticky note?")) return; data.notes = data.notes.filter((item) => item.id !== note.id); save(); renderNotes(); notify("Note deleted."); }, "delete-action"));
      head.append(title, tools); const content = document.createElement("p"); content.textContent = note.content || "This note is empty."; const date = document.createElement("time"); date.textContent = new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }); card.append(head, content, date);
      card.addEventListener("dragover", (event) => event.preventDefault()); card.addEventListener("drop", (event) => { event.preventDefault(); const source = data.notes.findIndex((item) => item.id === (event.dataTransfer.getData("text/plain") || draggedNoteId)); const target = data.notes.findIndex((item) => item.id === note.id); if (source >= 0 && target >= 0 && source !== target) { const [moved] = data.notes.splice(source, 1); data.notes.splice(target, 0, moved); save(); renderNotes(); } });
      return card;
    }));
  }

  function render() { renderTasks(); renderDashboard(); renderNotes(); }
  function openDialog(dialog) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); }
  function closeDialog(dialog) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
  function openTaskDialog(task = null) {
    $("#task-dialog-heading").textContent = task ? "Edit task" : "Create a task";
    $("#edit-task-id").value = task?.id || ""; $("#detail-title").value = task?.title || ""; $("#detail-description").value = task?.description || "";
    $("#detail-priority").value = task?.priority || "medium"; $("#detail-due").value = task?.dueDate || ""; $("#detail-category").value = task?.category || ""; $("#detail-status").value = task?.status || "todo";
    openDialog(els.taskDialog); setTimeout(() => $("#detail-title").focus(), 0);
  }
  function openNoteDialog(note = null) {
    $("#note-dialog-heading").textContent = note ? "Edit note" : "Create a note"; $("#edit-note-id").value = note?.id || "";
    $("#note-title").value = note?.title || ""; $("#note-content").value = note?.content || ""; $("#note-color").value = note?.color || "yellow"; $("#note-pinned").checked = note?.pinned || false;
    openDialog(els.noteDialog); setTimeout(() => $("#note-title").focus(), 0);
  }

  function setView(view) {
    activeView = view; $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
    $$(".nav-link").forEach((button) => button.classList.toggle("is-current", button.dataset.view === view));
    const labels = { dashboard: "Overview", tasks: "My tasks", notes: "Sticky notes", settings: "Settings & data" };
    $("#breadcrumb").innerHTML = `Workspace <span>/</span> ${labels[view]}`;
    if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  }

  function setTheme(theme) { data.preferences.theme = theme === "dark" ? "dark" : "light"; document.documentElement.dataset.theme = data.preferences.theme; $("#theme-toggle").setAttribute("aria-label", `Switch to ${data.preferences.theme === "dark" ? "light" : "dark"} mode`); $("#dark-mode-setting").checked = data.preferences.theme === "dark"; save(); }

  function validateBackup(parsed) {
    if (!parsed || parsed.schemaVersion !== 2 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.notes) || parsed.tasks.length > 10000 || parsed.notes.length > 10000) return null;
    if (!parsed.tasks.every((task) => task && typeof task.id === "string" && typeof task.title === "string" && ["todo", "progress", "completed"].includes(task.status) && ["high", "medium", "low"].includes(task.priority))) return null;
    if (!parsed.notes.every((note) => note && typeof note.id === "string" && typeof note.content === "string" && ["yellow", "pink", "blue", "green", "lavender"].includes(note.color))) return null;
    const preferences = parsed.preferences || {};
    return { schemaVersion: 2, tasks: parsed.tasks.map(normalizeTask), notes: parsed.notes.map(normalizeNote), preferences: { theme: preferences.theme === "dark" ? "dark" : "light", view: ["list", "kanban"].includes(preferences.view) ? preferences.view : "list", filter: ["all", "active", "completed"].includes(preferences.filter) ? preferences.filter : "all", reminders: preferences.reminders === true }, metadata: { createdAt: parsed.metadata?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } };
  }

  function setReminderSetting(enabled) {
    if (!enabled) { data.preferences.reminders = false; $("#reminder-status").textContent = "Off"; save(); return; }
    if (!("Notification" in window)) { $("#reminder-setting").checked = false; notify("Notifications are not supported in this browser.", "error"); return; }
    if (Notification.permission === "granted") { data.preferences.reminders = true; $("#reminder-status").textContent = "On"; save(); checkReminders(); return; }
    if (Notification.permission === "denied") { $("#reminder-setting").checked = false; notify("Notifications are blocked in browser settings.", "error"); return; }
    Notification.requestPermission().then((permission) => { data.preferences.reminders = permission === "granted"; $("#reminder-setting").checked = data.preferences.reminders; $("#reminder-status").textContent = data.preferences.reminders ? "On" : "Permission not granted"; save(); if (data.preferences.reminders) checkReminders(); else notify("Reminder permission was not granted.", "error"); }).catch(() => { data.preferences.reminders = false; $("#reminder-setting").checked = false; notify("The browser could not enable notifications.", "error"); });
  }

  function checkReminders() {
    if (!data.preferences.reminders || !("Notification" in window) || Notification.permission !== "granted") return;
    for (const task of data.tasks) if (task.status !== "completed" && task.dueDate === today() && task.notifiedFor !== today()) {
      try { new Notification("Task due today", { body: task.title }); task.notifiedFor = today(); save(); } catch { /* Notifications may be unavailable in file origins. */ }
    }
  }

  els.taskForm.addEventListener("submit", (event) => { event.preventDefault(); const title = safeText(els.taskTitle.value); if (!title) { els.taskTitle.focus(); return; } data.tasks.unshift(normalizeTask({ id: uid(), title, priority: "medium", status: "todo", createdAt: new Date().toISOString() })); els.taskTitle.value = ""; save(); render(); notify("Task added."); });
  $("#task-detail-form").addEventListener("submit", (event) => { event.preventDefault(); const id = $("#edit-task-id").value; const values = { title: safeText($("#detail-title").value), description: safeText($("#detail-description").value, 1200), priority: $("#detail-priority").value, dueDate: validDate($("#detail-due").value) ? $("#detail-due").value : "", category: safeText($("#detail-category").value, 36), status: $("#detail-status").value }; if (!values.title) return; const existing = data.tasks.find((task) => task.id === id); if (existing) { Object.assign(existing, values); if (existing.status === "completed" && !existing.completedAt) existing.completedAt = new Date().toISOString(); if (existing.status !== "completed") existing.completedAt = ""; } else data.tasks.unshift(normalizeTask({ ...values, id: uid(), createdAt: new Date().toISOString() })); save(); closeDialog(els.taskDialog); render(); notify(existing ? "Task updated." : "Task created."); });
  els.noteForm.addEventListener("submit", (event) => { event.preventDefault(); const id = $("#edit-note-id").value; const values = { title: safeText($("#note-title").value, 100), content: safeText($("#note-content").value, 2000), color: $("#note-color").value, pinned: $("#note-pinned").checked }; if (!values.title && !values.content) { $("#note-title").focus(); notify("Add a title or some note content.", "error"); return; } const existing = data.notes.find((note) => note.id === id); if (existing) Object.assign(existing, values, { updatedAt: new Date().toISOString() }); else data.notes.unshift({ ...values, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); save(); closeDialog(els.noteDialog); renderNotes(); notify(existing ? "Note updated." : "Note saved."); });

  $$("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));
  $("#dashboard-add").addEventListener("click", () => openTaskDialog()); $("#new-task").addEventListener("click", () => openTaskDialog()); $("#new-note").addEventListener("click", () => openNoteDialog());
  $$("[data-action='new-note']").forEach((button) => button.addEventListener("click", () => openNoteDialog()));
  $$("[data-close]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
  [els.taskDialog, els.noteDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(dialog); });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });
  });
  $("#global-search").addEventListener("input", () => { searchQuery = els.globalSearch.value.trim().toLocaleLowerCase(); renderTasks(); renderNotes(); if (searchQuery && activeView === "dashboard") setView("tasks"); });
  $$(".filter-button").forEach((button) => button.addEventListener("click", () => { $$(".filter-button").forEach((item) => { item.classList.toggle("is-active", item === button); item.setAttribute("aria-pressed", String(item === button)); }); data.preferences.filter = button.dataset.filter; save(); renderTasks(); }));
  $("#priority-filter").addEventListener("change", (event) => { priorityFilter = event.target.value; renderTasks(); });
  $("#category-filter").addEventListener("change", (event) => { categoryFilter = event.target.value; renderTasks(); });
  $("#sort-tasks").addEventListener("change", (event) => { sortMode = event.target.value; renderTasks(); });
  $("#list-view-button").addEventListener("click", () => { data.preferences.view = "list"; els.listView.hidden = false; els.kanbanView.hidden = true; $("#list-view-button").classList.add("is-selected"); $("#kanban-view-button").classList.remove("is-selected"); $("#list-view-button").setAttribute("aria-pressed", "true"); $("#kanban-view-button").setAttribute("aria-pressed", "false"); save(); });
  $("#kanban-view-button").addEventListener("click", () => { data.preferences.view = "kanban"; els.listView.hidden = true; els.kanbanView.hidden = false; $("#kanban-view-button").classList.add("is-selected"); $("#list-view-button").classList.remove("is-selected"); $("#kanban-view-button").setAttribute("aria-pressed", "true"); $("#list-view-button").setAttribute("aria-pressed", "false"); save(); renderKanban(); });
  els.taskList.addEventListener("dragover", (event) => { if (sortMode === "manual") event.preventDefault(); });
  els.taskList.addEventListener("drop", (event) => { event.preventDefault(); const target = event.target.closest("[data-task-id]"); const from = data.tasks.findIndex((task) => task.id === (event.dataTransfer.getData("text/plain") || draggedTaskId)); const to = target ? data.tasks.findIndex((task) => task.id === target.dataset.taskId) : data.tasks.length - 1; if (from >= 0 && to >= 0 && from !== to) { const [moved] = data.tasks.splice(from, 1); data.tasks.splice(to, 0, moved); save(); renderTasks(); } });
  $("#clear-completed").addEventListener("click", () => { if (!confirm("Permanently remove all completed tasks?")) return; data.tasks = data.tasks.filter((task) => task.status !== "completed"); save(); render(); notify("Completed tasks cleared."); });
  $("#theme-toggle").addEventListener("click", () => setTheme(data.preferences.theme === "dark" ? "light" : "dark")); $("#dark-mode-setting").addEventListener("change", (event) => setTheme(event.target.checked ? "dark" : "light"));
  $("#reminder-setting").addEventListener("change", (event) => setReminderSetting(event.target.checked));
  $("#save-quick-note").addEventListener("click", () => { const content = safeText($("#quick-note").value, 2000); if (!content) { notify("Write something before saving your note.", "error"); return; } data.notes.unshift({ id: uid(), title: "Quick note", content, color: "yellow", pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); $("#quick-note").value = ""; save(); renderNotes(); notify("Note saved."); });
  $("#export-data").addEventListener("click", () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `focus-backup-${today()}.json`; anchor.click(); URL.revokeObjectURL(url); notify("Workspace backup exported."); });
  $("#import-data").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const backup = validateBackup(parsed);
      if (!backup) throw new Error("This file is not a compatible Focus backup.");
      if (!confirm(`Replace your current ${data.tasks.length} tasks and ${data.notes.length} notes with ${backup.tasks.length} tasks and ${backup.notes.length} notes from this backup?`)) return;

      data = backup;
      if (!("Notification" in window) || Notification.permission !== "granted") data.preferences.reminders = false;
      $$(".filter-button").forEach((button) => {
        const selected = button.dataset.filter === data.preferences.filter;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      priorityFilter = "all";
      categoryFilter = "all";
      $("#priority-filter").value = "all";
      $("#sort-tasks").value = "manual";
      els.listView.hidden = data.preferences.view !== "list";
      els.kanbanView.hidden = data.preferences.view !== "kanban";
      $("#list-view-button").classList.toggle("is-selected", data.preferences.view === "list");
      $("#kanban-view-button").classList.toggle("is-selected", data.preferences.view === "kanban");
      $("#list-view-button").setAttribute("aria-pressed", String(data.preferences.view === "list"));
      $("#kanban-view-button").setAttribute("aria-pressed", String(data.preferences.view === "kanban"));
      $("#reminder-setting").checked = data.preferences.reminders;
      $("#reminder-status").textContent = data.preferences.reminders ? "On" : "Off";
      save();
      setTheme(data.preferences.theme);
      render();
      notify("Backup restored.");
    } catch (error) {
      notify(error instanceof SyntaxError ? "That file is not valid JSON." : error.message || "Could not import this file.", "error");
    } finally {
      event.target.value = "";
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.code === "Escape") {
      event.preventDefault();
      const openDialog = [els.noteDialog, els.taskDialog].find((dialog) => dialog.open);
      if (openDialog) closeDialog(openDialog);
      return;
    }
    const editing = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']");
    if (editing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === "n") { event.preventDefault(); setView("tasks"); els.taskTitle.focus(); }
    if (event.key.toLowerCase() === "s") { event.preventDefault(); els.globalSearch.focus(); }
    if (event.key.toLowerCase() === "d") { event.preventDefault(); setTheme(data.preferences.theme === "dark" ? "light" : "dark"); }
  });

  $$(".filter-button").forEach((button) => { const selected = button.dataset.filter === data.preferences.filter; button.classList.toggle("is-active", selected); button.setAttribute("aria-pressed", String(selected)); });
  if (!("Notification" in window) || Notification.permission !== "granted") data.preferences.reminders = false;
  setTheme(data.preferences.theme);
  $("#reminder-setting").checked = data.preferences.reminders;
  $("#reminder-status").textContent = data.preferences.reminders ? "On" : ("Notification" in window && Notification.permission === "denied" ? "Blocked in browser settings" : "Off");
  if (data.preferences.view === "kanban") $("#kanban-view-button").click();
  const requestedView = location.hash.slice(1); if (["dashboard", "tasks", "notes", "settings"].includes(requestedView)) setView(requestedView);
  render(); checkReminders(); setInterval(checkReminders, 60_000);
})();
