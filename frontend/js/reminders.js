(() => {
  // Smart Task Reminder System for TimeNest
  // - Runs in the background on authenticated pages
  // - Uses Browser Notifications + optional Web Speech API voice reminders
  // - Does not mutate existing UI or backend behaviour

  const CHECK_INTERVAL_MS = 30_000; // 30 seconds
  const VOICE_SETTING_KEY = 'timenest_voice_reminders_enabled';
  const NOTIFICATION_SETTING_KEY = 'timenest_notifications_enabled';
  const SESSION_SENT = new Set(); // Tracks notifications sent in this tab session

  const API = window.location.origin + '/api';

  const hasNotification = typeof window.Notification !== 'undefined';
  const hasSpeech = typeof window.speechSynthesis !== 'undefined' &&
                    typeof window.SpeechSynthesisUtterance !== 'undefined';

  let intervalId = null;
  let voiceEnabled = loadVoiceSetting();
  let notificationsEnabled = loadNotificationSetting();
  let permissionRequested = false;

  function loadVoiceSetting() {
    try {
      return localStorage.getItem(VOICE_SETTING_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function saveVoiceSetting(on) {
    voiceEnabled = !!on;
    try {
      localStorage.setItem(VOICE_SETTING_KEY, voiceEnabled ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  function loadNotificationSetting() {
    try {
      const raw = localStorage.getItem(NOTIFICATION_SETTING_KEY);
      if (raw === null) return true; // default: enabled
      return raw === 'true';
    } catch {
      return true;
    }
  }

  function saveNotificationSetting(on) {
    notificationsEnabled = !!on;
    try {
      localStorage.setItem(NOTIFICATION_SETTING_KEY, notificationsEnabled ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  function getAuthToken() {
    try {
      return window.TimeNestAuth?.getToken?.() || null;
    } catch {
      return null;
    }
  }

  async function fetchTasks() {
    const token = getAuthToken();
    if (!token) return [];

    try {
      const res = await fetch(`${API}/tasks/`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) return [];
      const body = await res.json().catch(() => null);
      return Array.isArray(body?.items) ? body.items : [];
    } catch {
      return [];
    }
  }

  async function ensureNotificationPermission() {
    if (!hasNotification) return 'unsupported';
    const current = Notification.permission;
    if (current === 'granted' || current === 'denied') return current;
    if (permissionRequested) return current;

    permissionRequested = true;
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return Notification.permission;
    }
  }

  async function showNotification(title, options = {}) {
    if (!hasNotification || !notificationsEnabled) return;

    const perm = await ensureNotificationPermission();
    if (perm !== 'granted') return;

    try {
      new Notification(title, options);
    } catch {
      // Some environments (e.g. iframes) may still block; fail silently
    }
  }

  function describeDueDateTime(dueMs, nowMs) {
    const due = new Date(dueMs);
    const now = new Date(nowMs);

    const keyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const todayKey = keyOf(now);
    const dueKey = keyOf(due);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = keyOf(tomorrow);

    let dayWord = null;
    if (dueKey === todayKey) dayWord = 'Today';
    else if (dueKey === tomorrowKey) dayWord = 'Tomorrow';

    const timeLabel = due.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });

    const dateLabel = due.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return { dayWord, dateLabel, timeLabel };
  }

  function speak(text) {
    if (!voiceEnabled || !hasSpeech) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // fail silently
    }
  }

  function makeKey(taskId, kind) {
    return `${taskId || ''}:${kind}`;
  }

  function markSent(taskId, kind) {
    SESSION_SENT.add(makeKey(taskId, kind));
  }

  function wasSent(taskId, kind) {
    return SESSION_SENT.has(makeKey(taskId, kind));
  }

  function isUpcomingOrRecent(dueMs, nowMs) {
    // Only consider tasks due within +/- 24h to avoid scanning far history/future
    const diffHours = Math.abs(dueMs - nowMs) / 3_600_000;
    return diffHours <= 24;
  }

  async function checkReminders() {
    const token = getAuthToken();
    if (!token) return; // not authenticated; do nothing

    const tasks = await fetchTasks();
    if (!tasks.length) return;

    const now = Date.now();

    for (const task of tasks) {
      // Do not remind for tasks that are already completed
      if (task.completed) continue;

      if (!task.due_date || !task.id) continue;
      const dueMs = new Date(task.due_date).getTime();
      if (!Number.isFinite(dueMs)) continue;
      // Reminders are only enabled when both a due date and a
      // specific due time are present.
      if (!task.due_date || !task.due_time || !task.id) continue;

      const diffMs = dueMs - now; // positive: future, negative: past

      // 15 and 5 minute pre‑due reminders
      const thresholds = [
        { kind: 'due-15', minutes: 15 },
        { kind: 'due-5', minutes: 5 },
      ];

      for (const t of thresholds) {
        const thresholdMs = t.minutes * 60_000;
        if (diffMs <= thresholdMs && diffMs > thresholdMs - CHECK_INTERVAL_MS) {
          if (!wasSent(task.id, t.kind)) {
            markSent(task.id, t.kind);
            const { dayWord, dateLabel, timeLabel } = describeDueDateTime(dueMs, now);
            const dayPart = dayWord || dateLabel;
            const title = task.title || 'Task';
            showNotification('📌 Task due soon', {
              body: `Task "${title}" is due ${dayPart} at ${timeLabel}.`,
              tag: makeKey(task.id, t.kind),
            });
              // Optional spoken reminder before the task is due
              if (voiceEnabled) {
                const minutesText = t.minutes === 1 ? '1 minute' : `${t.minutes} minutes`;
                speak(`Your task ${title} is remaining. It is due in ${minutesText}.`);
              }
          }
        }
      }

      // At due time (0 window)
      if (diffMs <= 0 && diffMs > -CHECK_INTERVAL_MS) {
        if (!wasSent(task.id, 'due-now')) {
          markSent(task.id, 'due-now');
          const { dayWord, dateLabel, timeLabel } = describeDueDateTime(dueMs, now);
          const dayPart = dayWord || dateLabel;
          const title = task.title || 'Task';
          const body = `Task "${title}" is due ${dayPart} at ${timeLabel}.`;
          showNotification('⏰ Task due now', {
            body,
            tag: makeKey(task.id, 'due-now'),
          });
          speak(`Your task ${title} is due at ${timeLabel}.`);
        }
      }
    }
  }

  function start() {
    if (intervalId !== null) return;
    if (!hasNotification && !hasSpeech) return; // nothing useful to do
    intervalId = window.setInterval(checkReminders, CHECK_INTERVAL_MS);
    // Run an initial check shortly after load
    window.setTimeout(checkReminders, 3_000);
  }

  function stop() {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  function toggleVoiceReminders(on) {
    saveVoiceSetting(!!on);
  }

  async function testNotification() {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });

    await showNotification('⏰ TimeNest test reminder', {
      body: `This is a test reminder at ${timeLabel}.`,
    });

    if (voiceEnabled) {
      speak(`This is a TimeNest test reminder at ${timeLabel}.`);
    }
  }

  function getStatus() {
    return {
      notificationsSupported: hasNotification,
      permission: hasNotification ? Notification.permission : 'unsupported',
      voiceSupported: hasSpeech,
      voiceEnabled,
      notificationsEnabled,
    };
  }

  function toggleNotifications(on) {
    saveNotificationSetting(!!on);
  }

  // Expose a minimal API for future UI controls
  window.TimeNestReminders = {
    toggleVoiceReminders,
    toggleNotifications,
    testNotification,
    getStatus,
  };

  // Start background checks on load and clean up on unload
  window.addEventListener('load', start);
  window.addEventListener('beforeunload', stop);
  window.addEventListener('unload', stop);
})();
