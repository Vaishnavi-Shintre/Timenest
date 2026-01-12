(() => {
  const API = window.location.origin + '/api';
  const FOCUS_STORAGE_KEY = 'timenest_focus_tools_v1';

  async function jsonFetch(url, options = {}) {
    const token = window.TimeNestAuth?.getToken?.();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers, ...options });
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  async function listTasks() {
    return jsonFetch(`${API}/tasks/`);
  }

  async function createTask(payload) {
    return jsonFetch(`${API}/tasks/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function updateTask(id, updates) {
    return jsonFetch(`${API}/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  const FOCUS_TOOLS = [
    {
      id: 'pomodoro',
      name: 'Pomodoro (25 / 5)',
      description: 'Work for 25 minutes, then take a 5 minute break.',
      defaultMinutes: 25,
    },
    {
      id: 'deep-focus',
      name: 'Deep Focus Mode',
      description: 'Block distractions for a solid deep work session.',
      defaultMinutes: 45,
    },
    {
      id: 'break-reminders',
      name: 'Break Reminders',
      description: 'Gentle nudges to stand, stretch, and reset.',
      defaultMinutes: 10,
    },
    {
      id: 'ambient-sounds',
      name: 'Ambient Sounds',
      description: 'Rain, white noise, or café sounds to stay in flow.',
      defaultMinutes: 20,
    },
  ];

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadFocusState() {
    try {
      return JSON.parse(localStorage.getItem(FOCUS_STORAGE_KEY)) || { tools: {}, history: {} };
    } catch {
      return { tools: {}, history: {} };
    }
  }

  function saveFocusState(state) {
    localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(state));
  }

  function applyFocusAction(toolId, action) {
    const tool = FOCUS_TOOLS.find(t => t.id === toolId);
    if (!tool) return;
    let state = loadFocusState();
    const existing = state.tools[toolId] || { accumulatedMs: 0, startedAt: null };
    const now = Date.now();

    if (action === 'start' || action === 'resume') {
      state.tools[toolId] = {
        ...existing,
        startedAt: now,
      };
    } else if (action === 'pause') {
      if (existing.startedAt) {
        const elapsed = now - existing.startedAt;
        state.tools[toolId] = {
          ...existing,
          startedAt: null,
          accumulatedMs: (existing.accumulatedMs || 0) + elapsed,
        };
      }
    } else if (action === 'stop') {
      let totalMs = existing.accumulatedMs || 0;
      if (existing.startedAt) {
        totalMs += now - existing.startedAt;
      }
      const minutes = Math.max(1, Math.round(totalMs / 60000));
      if (minutes > 0) {
        updateFocusHistory(state, toolId, minutes);
        state.lastCompleted = {
          toolId,
          minutes,
          key: todayKey(),
          finishedAt: new Date().toISOString(),
        };
      }
      state.tools[toolId] = { startedAt: null, accumulatedMs: 0 };
    }

    saveFocusState(state);
    renderFocusSummary(state);
    renderCurrentSession(state);
    renderFocusTools();
  }

  function updateFocusHistory(state, toolId, minutes) {
    const key = todayKey();
    if (!state.history[key]) state.history[key] = { totalMinutes: 0, byTool: {} };
    state.history[key].totalMinutes += minutes;
    state.history[key].byTool[toolId] = (state.history[key].byTool[toolId] || 0) + minutes;
  }

  function getTodayFocusMinutes(state) {
    const key = todayKey();
    return state.history[key]?.totalMinutes || 0;
  }

  function getLastCompletedToday(state) {
    const last = state.lastCompleted;
    if (!last) return null;
    if (last.key !== todayKey()) return null;
    return last;
  }

  function getStreakDays(state) {
    const keys = Object.keys(state.history).sort();
    if (!keys.length) return 0;
    let streak = 0;
    let current = new Date(todayKey());
    while (true) {
      const key = current.toISOString().slice(0, 10);
      const minutes = state.history[key]?.totalMinutes || 0;
      if (minutes >= 25) {
        streak += 1;
        current.setDate(current.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function renderFocusSummary(state) {
    const minutes = getTodayFocusMinutes(state);
    const streak = getStreakDays(state);
    const timeEl = document.getElementById('focus-time-today');
    const streakEl = document.getElementById('focus-streak');
    const msgEl = document.getElementById('focus-message');

    if (timeEl) timeEl.textContent = `${minutes}m`;
    if (streakEl) streakEl.textContent = `${streak} day${streak === 1 ? '' : 's'}`;

    if (!msgEl) return;
    if (minutes === 0) {
      msgEl.textContent = 'Start a focus session to begin building your streak.';
    } else if (streak >= 3) {
      msgEl.textContent = `Nice! Youre on a ${streak}-day streak. Keep it going ✨`;
    } else {
      msgEl.textContent = 'Great start. A little focus every day adds up.';
    }
  }

  let focusTimerInterval = null;

  function getRunningTool(state) {
    return FOCUS_TOOLS.find(tool => state.tools[tool.id]?.startedAt);
  }

  function startFocusTimer(startedAt, accumulatedMs = 0, runningToolId = null, totalMs = null, onComplete = null, stateRef = null) {
    const timerEl = document.getElementById('focus-session-timer');
    if (!timerEl) return;

    if (focusTimerInterval) {
      clearInterval(focusTimerInterval);
      focusTimerInterval = null;
    }

    if (!startedAt) {
      timerEl.textContent = '00:00';
      return;
    }

    const update = () => {
      const elapsedMs = Date.now() - startedAt + (accumulatedMs || 0);
      let displayMs = elapsedMs;
      let finished = false;

      if (totalMs) {
        const remainingMs = Math.max(0, totalMs - elapsedMs);
        displayMs = remainingMs;
        if (remainingMs <= 0) finished = true;
      }

      const totalSeconds = Math.max(0, Math.floor(displayMs / 1000));
      const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;

      if (runningToolId) {
        const cardTimer = document.querySelector(`.focus-card-timer[data-tool-id="${runningToolId}"]`);
        if (cardTimer) {
          cardTimer.textContent = `${m}:${s}`;
        }
      }

      if (finished) {
        clearInterval(focusTimerInterval);
        focusTimerInterval = null;
        if (onComplete && stateRef && runningToolId) {
          onComplete(stateRef, runningToolId, elapsedMs);
        }
      }
    };

    update();
    focusTimerInterval = setInterval(update, 1000);
  }

  function renderCurrentSession(state) {
    const panel = document.getElementById('focus-session-detail');
    const nameEl = document.getElementById('focus-session-name');
    const metaEl = document.getElementById('focus-session-meta');
    if (!panel || !nameEl || !metaEl) return;

    panel.classList.remove('focus-session--idle', 'focus-session--running', 'focus-session--completed');

    const runningTool = getRunningTool(state);
    const lastCompleted = getLastCompletedToday(state);

    if (!runningTool && !lastCompleted) {
      panel.style.opacity = '0.9';
      panel.classList.add('focus-session--idle');
      nameEl.textContent = 'No session running';
      metaEl.textContent = 'Start a focus tool below to get into deep work.';
      startFocusTimer(null);
      document.body.classList.remove('focus-mode-active');
      return;
    }

    if (!runningTool && lastCompleted) {
      panel.style.opacity = '1';
      panel.classList.add('focus-session--completed');
      const toolName = (FOCUS_TOOLS.find(t => t.id === lastCompleted.toolId) || {}).name || 'Focus session';
      nameEl.textContent = 'Session completed';
      metaEl.textContent = `You focused for ${lastCompleted.minutes}m with ${toolName} today. Great job!`;
      startFocusTimer(null);
      document.body.classList.remove('focus-mode-active');
      return;
    }

    // Running
    const toolState = state.tools[runningTool.id] || {};
    const startedAt = toolState.startedAt || Date.now();
    const accumulatedMs = toolState.accumulatedMs || 0;
    const tool = FOCUS_TOOLS.find(t => t.id === runningTool.id) || runningTool;
    const targetMs = (toolState.targetMs != null ? toolState.targetMs : (tool.defaultMinutes || 25) * 60000);

    state.tools[runningTool.id] = { ...toolState, targetMs };
    saveFocusState(state);

    panel.style.opacity = '1';
    panel.classList.add('focus-session--running');
    nameEl.textContent = tool.name;
    metaEl.textContent = '';
    document.body.classList.add('focus-mode-active');

    const handleAutoComplete = (currentState, toolId, elapsedMs) => {
      const useState = currentState || loadFocusState();
      const nowKey = todayKey();
      const totalMs = Math.min(targetMs, elapsedMs);
      const minutes = Math.max(1, Math.round(totalMs / 60000));
      updateFocusHistory(useState, toolId, minutes);
      useState.tools[toolId] = { startedAt: null, accumulatedMs: 0 };
      useState.lastCompleted = {
        toolId,
        minutes,
        key: nowKey,
        finishedAt: new Date().toISOString(),
      };
      saveFocusState(useState);
      renderFocusSummary(useState);
      renderCurrentSession(useState);
      renderFocusTools();
    };

    startFocusTimer(startedAt, accumulatedMs, runningTool.id, targetMs, handleAutoComplete, state);
  }

  function renderFocusTools() {
    const container = document.getElementById('focus-tools');
    if (!container) return;

    const state = loadFocusState();

    container.innerHTML = FOCUS_TOOLS.map(tool => {
      const key = todayKey();
      const minutesToday = state.history[key]?.byTool?.[tool.id] || 0;
      const toolState = state.tools[tool.id] || {};
      const running = !!toolState.startedAt;
      const paused = !toolState.startedAt && (toolState.accumulatedMs || 0) > 0;

      const baseHeader = `
        <div class="focus-tool-header">
          <h4>${tool.name}</h4>
          <span class="badge badge-soft focus-tool-badge">${minutesToday}m today</span>
        </div>`;

      if (running || paused) {
        return `
          <div class="focus-tool-card focus-tool-card-active" data-tool-id="${tool.id}">
            ${baseHeader}
            <div class="focus-card-session">
              <div class="focus-card-timer" data-tool-id="${tool.id}">00:00</div>
              <div class="focus-card-controls">
                ${running
                  ? '<button class="ghost-btn focus-tool-btn" data-tool-action="pause">Pause</button>'
                  : '<button class="ghost-btn focus-tool-btn" data-tool-action="resume">Resume</button>'}
                <button class="secondary focus-tool-btn" data-tool-action="stop">Stop</button>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="focus-tool-card" data-tool-id="${tool.id}">
          ${baseHeader}
          <p class="muted focus-tool-description">${tool.description}</p>
          <button class="focus-tool-btn focus-primary-btn mt-1" data-tool-action="start">Start Focus</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.focus-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-tool-action');
        const card = btn.closest('[data-tool-id]');
        const toolId = card.getAttribute('data-tool-id');
        applyFocusAction(toolId, action);
      });
    });
  }

  function initFocusSessionControls() {
    const pauseBtn = document.getElementById('focus-session-pause');
    const stopBtn = document.getElementById('focus-session-stop');
    if (!pauseBtn || !stopBtn) return;

    pauseBtn.addEventListener('click', () => {
      const state = loadFocusState();
      const running = getRunningTool(state);
      if (!running) return;
      applyFocusAction(running.id, 'pause');
    });

    stopBtn.addEventListener('click', () => {
      const state = loadFocusState();
      const running = getRunningTool(state);
      if (!running) return;
      applyFocusAction(running.id, 'stop');
    });
  }

  function getLocalTimeLabel() {
    return new Date().toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  let dashboardFeedbackTimeout = null;

  function setDashboardFeedback(message) {
    const el = document.getElementById('dashboard-task-feedback');
    if (!el) return;
    el.textContent = message;
    el.style.opacity = '1';
    if (dashboardFeedbackTimeout) {
      clearTimeout(dashboardFeedbackTimeout);
    }
    dashboardFeedbackTimeout = setTimeout(() => {
      el.style.opacity = '0.7';
    }, 4000);
  }

  async function renderTasksAndStats() {
    const res = await listTasks();
    const items = res.ok ? (res.data?.items || []) : [];

    // Stats
    const total = items.length;
    const completed = items.filter(t => t.completed).length;
    const inProgress = total - completed;
    const rate = total ? Math.round((completed / total) * 100) : 0;

    const totalEl = document.getElementById('stat-total-tasks');
    const completedEl = document.getElementById('stat-completed-tasks');
    const inProgressEl = document.getElementById('stat-inprogress-tasks');
    const rateEl = document.getElementById('stat-completion-rate');
    if (totalEl) totalEl.textContent = total;
    if (completedEl) completedEl.textContent = completed;
    if (inProgressEl) inProgressEl.textContent = inProgress;
    if (rateEl) rateEl.textContent = `${rate}%`;

    // Daily To-Do: tasks due today or without due date
    const today = new Date().toISOString().slice(0, 10);
    const nowMs = Date.now();
    const dailyCandidates = items.filter(t => {
      if (!t.due_date) return true;
      const d = (t.due_date || '').slice(0, 10);
      return d === today;
    });

    const listEl = document.getElementById('dashboard-todo-list');
    const emptyEl = document.getElementById('dashboard-empty-state');
    if (!listEl) return;

    if (!dailyCandidates.length) {
      listEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        listEl.appendChild(emptyEl);
      }
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const priorityOrder = { high: 3, medium: 2, low: 1, '': 0 };
    const sorted = [...dailyCandidates].sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));

    const active = sorted.filter(t => !t.completed);
    const completedDaily = sorted.filter(t => t.completed);

    let html = '';

    html += active.map(t => {
      const priority = t.priority || '';
      const pillClass = priority ? `pill-priority pill-${priority}` : '';
      const dueMs = t.due_date ? new Date(t.due_date).getTime() : null;
      const isOverdue = dueMs && dueMs < nowMs;
      return `
        <div class="todo-item" data-id="${t.id}">
          <label class="todo-main">
            <input type="checkbox" class="todo-checkbox" ${t.completed ? 'checked' : ''} />
            <span class="todo-title">${t.title}</span>
          </label>
          <div class="todo-meta">
            ${priority ? `<span class="${pillClass}">${priority}</span>` : ''}
            ${isOverdue ? '<span class="pill-overdue">Overdue</span>' : ''}
            <button class="ghost-btn todo-delete" type="button">✕</button>
          </div>
        </div>
      `;
    }).join('');

    if (completedDaily.length) {
      html += `
        <div class="todo-divider">Completed</div>
      `;

      html += completedDaily.map(t => {
        const priority = t.priority || '';
        const pillClass = priority ? `pill-priority pill-${priority}` : '';
        const dueMs = t.due_date ? new Date(t.due_date).getTime() : null;
        const isOverdue = dueMs && dueMs < nowMs;
        return `
          <div class="todo-item todo-item--completed" data-id="${t.id}">
            <label class="todo-main">
              <input type="checkbox" class="todo-checkbox" ${t.completed ? 'checked' : ''} />
              <span class="todo-title">${t.title}</span>
            </label>
            <div class="todo-meta">
              ${priority ? `<span class="${pillClass}">${priority}</span>` : ''}
              ${isOverdue ? '<span class="pill-overdue">Overdue</span>' : ''}
              <button class="ghost-btn todo-delete" type="button">✕</button>
            </div>
          </div>
        `;
      }).join('');
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.todo-checkbox').forEach(cb => {
      cb.addEventListener('change', async e => {
        const item = e.target.closest('.todo-item');
        const id = item.getAttribute('data-id');
        const checked = e.target.checked;
        const res = await updateTask(id, { completed: checked });
        if (!res.ok) {
          e.target.checked = !checked;
          alert(res.data?.error || `Update failed (${res.status})`);
        } else {
          setDashboardFeedback(checked
            ? `Task completed at ${getLocalTimeLabel()}.`
            : `Task reopened at ${getLocalTimeLabel()}.`);
          renderTasksAndStats();
        }
      });
    });

    listEl.querySelectorAll('.todo-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        const item = e.target.closest('.todo-item');
        const id = item.getAttribute('data-id');
        if (!confirm('Delete this task?')) return;
        const res = await jsonFetch(`${API}/tasks/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          alert(res.data?.error || `Delete failed (${res.status})`);
        } else {
          setDashboardFeedback('Task deleted.');
          renderTasksAndStats();
        }
      });
    });
  }

  function initDashboardForm() {
    const form = document.getElementById('dashboard-task-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const titleInput = document.getElementById('dash-task-title');
      const prioritySelect = document.getElementById('dash-task-priority');
      const title = titleInput.value.trim();
      const priority = prioritySelect.value;
      if (!title) return;

      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        title,
        priority: priority || undefined,
        due_date: new Date(today).toISOString(),
      };

      const res = await createTask(payload);
      if (!res.ok) {
        alert(res.data?.error || `Create failed (${res.status})`);
        return;
      }

      titleInput.value = '';
      prioritySelect.value = '';
      setDashboardFeedback(`Task added for today at ${getLocalTimeLabel()}.`);
      renderTasksAndStats();
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    initDashboardForm();
    renderTasksAndStats();
    const state = loadFocusState();
    renderFocusSummary(state);
    renderCurrentSession(state);
    renderFocusTools();
    initFocusSessionControls();
  });
})();
