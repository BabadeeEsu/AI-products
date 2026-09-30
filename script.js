(() => {
  "use strict";

  const STORAGE_KEY = "my-todo-list.tasks.v1";
  const form = document.querySelector("#add-form");
  const input = document.querySelector("#task-input");
  const list = document.querySelector("#task-list");
  const count = document.querySelector("#task-count");
  const emptyState = document.querySelector("#empty-state");
  const emptyTitle = document.querySelector("#empty-title");
  const emptyCopy = document.querySelector("#empty-copy");
  const message = document.querySelector("#form-message");
  const clearButton = document.querySelector("#clear-completed");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  let tasks = loadTasks();
  let currentFilter = "all";

  function loadTasks() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter((task) => task && typeof task.id === "string" && typeof task.text === "string" && typeof task.completed === "boolean");
    } catch {
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      message.textContent = "Your browser could not save changes on this device.";
    }
  }

  function makeIcon(pathData) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
    return svg;
  }

  function actionButton(label, className, icon, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `icon-button ${className}`;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(makeIcon(icon));
    button.addEventListener("click", handler);
    return button;
  }

  function render() {
    const visibleTasks = tasks.filter((task) => currentFilter === "all" || (currentFilter === "active" && !task.completed) || (currentFilter === "completed" && task.completed));
    list.replaceChildren();
    for (const task of visibleTasks) {
      const item = document.createElement("li");
      item.className = `task-item${task.completed ? " is-completed" : ""}`;
      const checkbox = document.createElement("button");
      checkbox.type = "button";
      checkbox.className = "check-button";
      checkbox.setAttribute("aria-label", `${task.completed ? "Mark as active" : "Mark as completed"}: ${task.text}`);
      checkbox.setAttribute("aria-pressed", String(task.completed));
      checkbox.append(makeIcon("m5 12 4 4L19 6"));
      checkbox.addEventListener("click", () => {
        task.completed = !task.completed;
        saveTasks();
        render();
      });

      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;
      item.append(checkbox, text);
      const actions = document.createElement("div");
      actions.className = "task-actions";
      actions.append(
        actionButton("Edit task", "edit-button", "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z", () => beginEdit(task, item)),
        actionButton("Delete task", "delete-button", "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6", () => {
          tasks = tasks.filter((entry) => entry.id !== task.id);
          saveTasks();
          render();
        })
      );
      item.append(actions);
      list.append(item);
    }

    const remaining = tasks.filter((task) => !task.completed).length;
    count.textContent = `${remaining} ${remaining === 1 ? "task" : "tasks"} left`;
    clearButton.disabled = !tasks.some((task) => task.completed);
    emptyState.hidden = visibleTasks.length > 0;
    if (tasks.length === 0) {
      emptyTitle.textContent = "A clear start";
      emptyCopy.textContent = "Your list is quiet. Add a task to get going.";
    } else if (visibleTasks.length === 0) {
      emptyTitle.textContent = currentFilter === "active" ? "All caught up" : "Nothing completed yet";
      emptyCopy.textContent = currentFilter === "active" ? "You have no active tasks. Enjoy the breathing room." : "Completed tasks will show up here.";
    }
  }

  function beginEdit(task, item) {
    const text = item.querySelector(".task-text");
    const editInput = document.createElement("input");
    editInput.className = "edit-input";
    editInput.type = "text";
    editInput.maxLength = 180;
    editInput.value = task.text;
    editInput.setAttribute("aria-label", "Edit task");
    text.replaceWith(editInput);
    const actions = item.querySelector(".task-actions");
    actions.replaceChildren(
      actionButton("Save task", "save-button", "m5 12 4 4L19 6", () => finishEdit(true)),
      actionButton("Cancel editing", "cancel-button", "M18 6 6 18M6 6l12 12", () => finishEdit(false))
    );
    editInput.focus();
    editInput.select();

    function finishEdit(save) {
      if (save) {
        const value = editInput.value.trim();
        if (!value) {
          message.textContent = "A task cannot be empty.";
          editInput.focus();
          return;
        }
        task.text = value;
        saveTasks();
      }
      message.textContent = "";
      render();
    }

    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finishEdit(true);
      if (event.key === "Escape") finishEdit(false);
    });
    editInput.addEventListener("blur", () => {
      if (item.isConnected) finishEdit(true);
    }, { once: true });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      message.textContent = "Please enter a task before adding it.";
      input.focus();
      return;
    }
    tasks.unshift({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, text: value, completed: false });
    input.value = "";
    message.textContent = "";
    saveTasks();
    render();
    input.focus();
  });

  filterButtons.forEach((button) => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle("is-active", selected);
      filter.setAttribute("aria-pressed", String(selected));
    });
    render();
  }));

  clearButton.addEventListener("click", () => {
    tasks = tasks.filter((task) => !task.completed);
    saveTasks();
    render();
  });

  render();
})();
