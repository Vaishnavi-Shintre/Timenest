(() => {
  const API = window.location.origin + '/api';

  async function jsonFetch(url, options = {}) {
    const token = window.TimeNestAuth?.getToken?.();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers, ...options });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { status: res.status, ok: res.ok, data: body };
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

  async function init() {
    const container = document.getElementById('tasks');
    const form = document.getElementById('task-form');
    const errorEl = document.getElementById('tasks-error');
    let currentFilter = 'all';
    
    const setError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg || '';
    };

    const render = async () => {
      const res = await listTasks();
      if (!res.ok) {
        container.textContent = res.data?.error || `Failed to load tasks (${res.status})`;
        setError('Could not load tasks. Please try again.');
        return;
      }
      setError('');
      let items = res.data?.items || [];
      
      // Apply filter
      if (currentFilter === 'active') {
        items = items.filter(t => !t.completed);
      } else if (currentFilter === 'completed') {
        items = items.filter(t => t.completed);
      }
      
      // Sort by priority
      const priorityOrder = { high: 3, medium: 2, low: 1, '': 0 };
      items.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
      
      container.innerHTML = items.map(t => {
        const priorityBadge = t.priority ? `<span class="badge badge-${t.priority}">${t.priority}</span>` : '';
        const hasDue = !!t.due_date;
        const dueDate = hasDue ? new Date(t.due_date).toLocaleDateString() : 'No due date';
        const dueTime = t.due_time || '';
        const dueLabel = hasDue
          ? (dueTime ? `${dueDate} • ${dueTime}` : dueDate)
          : 'No due date';
        return `
        <div class="task-item ${t.completed ? 'completed' : ''}" data-id="${t.id}">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem;">
            <strong>${t.title}</strong>
            ${priorityBadge}
          </div>
          ${t.description ? `<div class="muted" style="margin-bottom:0.5rem;">${t.description}</div>` : ''}
          <div class="muted" style="font-size:0.85rem;">Due: ${dueLabel}</div>
          <div class="btn-group">
            <button class="${t.completed ? 'secondary' : 'success'}" data-action="toggle" data-id="${t.id}">
              ${t.completed ? '↩️ Reopen' : '✓ Complete'}
            </button>
            <button class="danger" data-action="delete" data-id="${t.id}">🗑️ Delete</button>
          </div>
        </div>
      `}).join('');
      
      // attach events
      container.querySelectorAll('button[data-action="toggle"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const card = e.currentTarget.closest('[data-id]');
          const isCompleted = card.classList.contains('completed');
          const res = await jsonFetch(`${API}/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ completed: !isCompleted }),
          });
          if (res.ok) {
            card.classList.add('task-anim-complete');
            setTimeout(render, 200);
          } else {
            setError(res.data?.error || `Update failed (${res.status})`);
          }
        });
      });
      container.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if (!confirm('Delete this task?')) return;
          const id = e.currentTarget.getAttribute('data-id');
          const card = e.currentTarget.closest('[data-id]');
          const res = await jsonFetch(`${API}/tasks/${id}`, { method: 'DELETE' });
          if (res.ok) {
            if (card) card.classList.add('task-anim-delete');
            setTimeout(render, 220);
          } else {
            setError(res.data?.error || `Delete failed (${res.status})`);
          }
        });
      });
    };

    // Filter buttons
    document.querySelectorAll('.filters button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentFilter = e.currentTarget.getAttribute('data-filter');
        render();
      });
    });

    const dateInput = document.getElementById('t-due');
    const timeInput = document.getElementById('t-due-time');
    const reminderHint = document.getElementById('t-reminder-hint');

    const updateReminderHint = () => {
      if (!reminderHint) return;
      const hasDate = !!(dateInput && dateInput.value);
      const hasTime = !!(timeInput && timeInput.value);
      if (!hasDate && !hasTime) {
        reminderHint.textContent = 'Add a due date and time to receive reminders for this task.';
      } else if (hasDate && !hasTime) {
        reminderHint.textContent = 'Add a time to receive reminders for this task.';
      } else if (hasDate && hasTime) {
        reminderHint.textContent = 'This task will send reminders before and at the due time.';
      } else {
        reminderHint.textContent = 'Reminders are sent only for tasks with a due date and time.';
      }
    };

    if (dateInput) dateInput.addEventListener('change', updateReminderHint);
    if (timeInput) timeInput.addEventListener('change', updateReminderHint);
    updateReminderHint();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('t-title').value;
      const description = document.getElementById('t-desc').value;
      const priority = document.getElementById('t-priority').value;
      const dueDate = document.getElementById('t-due').value;
      const dueTime = document.getElementById('t-due-time').value;
      const payload = {
        title,
        description: description || undefined,
        priority: priority || undefined,
        // Send date and time separately so the backend can combine them
        due_date: dueDate || undefined,
        due_time: dueTime || undefined,
      };
      const res = await createTask(payload);
      if (res.ok) {
        (e.target).reset();
        await render();
      } else {
        setError(res.data?.error || `Could not create task (${res.status}).`);
      }
    });

    await render();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
