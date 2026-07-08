// ===== سيمرّ — منطق التطبيق =====
(() => {
  "use strict";

  const STORE_KEY = "willpass.events.v1";
  const COLORS = ["#f0873b", "#4c7dff", "#57cc99", "#ef5f63", "#9b5cff", "#ffd166"];

  // عناصر الواجهة
  const grid       = document.getElementById("eventsGrid");
  const emptyState = document.getElementById("emptyState");
  const overlay    = document.getElementById("modalOverlay");
  const form       = document.getElementById("eventForm");
  const titleInput = document.getElementById("titleInput");
  const startInput = document.getElementById("startInput");
  const endInput   = document.getElementById("endInput");
  const colorPicker= document.getElementById("colorPicker");
  const formError  = document.getElementById("formError");
  const modalTitle = document.getElementById("modalTitle");
  const cardTpl    = document.getElementById("cardTemplate");

  let events = load();
  let editingId = null;
  let selectedColor = COLORS[0];
  const cardRefs = new Map(); // id -> { el, refs }

  // ---------- التخزين ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(events));
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- النافذة المنبثقة ----------
  function buildColorPicker() {
    colorPicker.innerHTML = "";
    COLORS.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.background = c;
      b.classList.toggle("selected", c === selectedColor);
      b.addEventListener("click", () => {
        selectedColor = c;
        [...colorPicker.children].forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
      });
      colorPicker.appendChild(b);
    });
  }

  function openModal(ev = null) {
    editingId = ev ? ev.id : null;
    modalTitle.textContent = ev ? "تعديل الحدث" : "حدث جديد";
    titleInput.value = ev ? ev.title : "";
    startInput.value = ev && ev.start ? toLocalInput(ev.start) : "";
    endInput.value   = ev ? toLocalInput(ev.end) : "";
    selectedColor    = ev ? ev.color : COLORS[0];
    formError.hidden = true;
    buildColorPicker();
    overlay.hidden = false;
    setTimeout(() => titleInput.focus(), 50);
  }
  function closeModal() {
    overlay.hidden = true;
    editingId = null;
  }

  // تحويل تاريخ ISO ↔ قيمة datetime-local (بالتوقيت المحلي)
  function toLocalInput(iso) {
    const d = new Date(iso);
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d - off).toISOString().slice(0, 16);
  }

  // ---------- الحفظ من النموذج ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const start = startInput.value ? new Date(startInput.value).toISOString() : null;
    const end   = endInput.value ? new Date(endInput.value).toISOString() : null;

    if (!title) return showError("اكتب عنوانًا للحدث.");
    if (!end)   return showError("حدّد تاريخ النهاية.");
    if (start && new Date(end) <= new Date(start))
      return showError("تاريخ النهاية لازم يكون بعد تاريخ البداية.");

    if (editingId) {
      const ev = events.find((x) => x.id === editingId);
      if (ev) Object.assign(ev, { title, start, end, color: selectedColor });
    } else {
      events.push({ id: uid(), title, start, end, color: selectedColor });
    }
    save();
    render();
    closeModal();
  });

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  // ---------- الرسم ----------
  function render() {
    grid.innerHTML = "";
    cardRefs.clear();
    emptyState.style.display = events.length ? "none" : "block";

    events.forEach((ev) => {
      const node = cardTpl.content.firstElementChild.cloneNode(true);
      const refs = {
        card:    node,
        accent:  node.querySelector(".card-accent"),
        title:   node.querySelector(".card-title"),
        status:  node.querySelector(".card-status"),
        days:    node.querySelector(".days"),
        hours:   node.querySelector(".hours"),
        minutes: node.querySelector(".minutes"),
        seconds: node.querySelector(".seconds"),
        bar:     node.querySelector(".progress-bar"),
        label:   node.querySelector(".progress-label"),
      };
      refs.title.textContent = ev.title;
      refs.accent.style.background = ev.color;
      refs.bar.style.background = `linear-gradient(90deg, ${ev.color}, #ffffffaa)`;

      node.querySelector(".edit-btn").addEventListener("click", () => openModal(ev));
      node.querySelector(".delete-btn").addEventListener("click", () => remove(ev.id));

      grid.appendChild(node);
      cardRefs.set(ev.id, refs);
    });
    tick();
  }

  function remove(id) {
    if (!confirm("حذف هذا الحدث؟")) return;
    events = events.filter((x) => x.id !== id);
    save();
    render();
  }

  // ---------- العدّاد التنازلي ----------
  const pad = (n) => String(n).padStart(2, "0");

  function setUnit(el, val) {
    const v = pad(val);
    if (el.textContent !== v) {
      el.textContent = v;
      el.classList.add("tick");
      setTimeout(() => el.classList.remove("tick"), 200);
    }
  }

  function tick() {
    const now = Date.now();
    events.forEach((ev) => {
      const refs = cardRefs.get(ev.id);
      if (!refs) return;

      const end = new Date(ev.end).getTime();
      const start = ev.start ? new Date(ev.start).getTime() : null;
      let remaining, status, statusClass, progress = null;

      if (start && now < start) {
        // لم يبدأ بعد — نعدّ حتى البداية
        remaining = start - now;
        status = "يبدأ بعد";
        statusClass = "soon";
      } else if (now >= end) {
        remaining = 0;
        status = "انتهى ✓";
        statusClass = "ended";
        refs.card.classList.add("is-finished");
        progress = 100;
      } else {
        remaining = end - now;
        status = start ? "جارٍ الآن" : "المتبقّي";
        statusClass = "live";
        refs.card.classList.remove("is-finished");
        if (start) progress = ((now - start) / (end - start)) * 100;
      }

      refs.status.textContent = status;
      refs.status.className = "card-status " + statusClass;

      const s = Math.floor(remaining / 1000);
      setUnit(refs.days,    Math.floor(s / 86400));
      setUnit(refs.hours,   Math.floor((s % 86400) / 3600));
      setUnit(refs.minutes, Math.floor((s % 3600) / 60));
      setUnit(refs.seconds, s % 60);

      if (progress === null) {
        refs.bar.parentElement.style.display = "none";
        refs.label.style.display = "none";
      } else {
        refs.bar.parentElement.style.display = "";
        refs.label.style.display = "";
        const p = Math.min(100, Math.max(0, progress));
        refs.bar.style.width = p.toFixed(1) + "%";
        refs.label.textContent = now >= end ? "اكتمل" : `مضى ${p.toFixed(0)}٪`;
      }
    });
  }

  // ---------- الأحداث العامة ----------
  document.getElementById("addBtn").addEventListener("click", () => openModal());
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeModal(); });

  render();
  setInterval(tick, 1000);
})();
