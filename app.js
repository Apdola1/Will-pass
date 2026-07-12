// ===== سيمضي — Firebase Auth + Firestore =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGaV40VsWuEiherUOslcu51p6Gg9YsoGA",
  authDomain: "will-pass-ab.firebaseapp.com",
  projectId: "will-pass-ab",
  storageBucket: "will-pass-ab.firebasestorage.app",
  messagingSenderId: "954447894011",
  appId: "1:954447894011:web:6bead340ea7facfded675e"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ---------- عناصر الواجهة ----------
const grid       = document.getElementById("eventsGrid");
const emptyState = document.getElementById("emptyState");
const overlay    = document.getElementById("modalOverlay");
const form       = document.getElementById("eventForm");
const titleInput = document.getElementById("titleInput");
const startInput = document.getElementById("startInput");
const endInput   = document.getElementById("endInput");
const formError  = document.getElementById("formError");
const modalTitle = document.getElementById("modalTitle");
const cardTpl    = document.getElementById("cardTemplate");

const authScreen    = document.getElementById("authScreen");
const authForm      = document.getElementById("authForm");
const emailInput    = document.getElementById("emailInput");
const passInput     = document.getElementById("passInput");
const authError     = document.getElementById("authError");
const authHint      = document.getElementById("authHint");
const authSubmit    = document.getElementById("authSubmit");
const authToggleBtn = document.getElementById("authToggleBtn");
const authToggleText= document.getElementById("authToggleText");
const userBar       = document.getElementById("userBar");
const userEmail     = document.getElementById("userEmail");
const signOutBtn    = document.getElementById("signOutBtn");
const themeToggle   = document.getElementById("themeToggle");

// ---------- الحالة ----------
let events = [];
let editingId = null;
const cardRefs = new Map();
let currentUser = null;
let unsubEvents = null;

// ================= النمط (فاتح / ليلي) =================
const THEME_KEY = "willpass.theme";
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  themeToggle.textContent = t === "dark" ? "☀️" : "🌙";
}
let theme = localStorage.getItem(THEME_KEY) || "light";
applyTheme(theme);
themeToggle.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

// ================= المصادقة =================
let mode = "login";
function setMode(m) {
  mode = m;
  authError.hidden = true;
  if (m === "login") {
    authHint.textContent = "سجّل دخولك للمتابعة";
    authSubmit.textContent = "دخول";
    authToggleText.textContent = "ما عندك حساب؟";
    authToggleBtn.textContent = "أنشئ حساب";
    passInput.autocomplete = "current-password";
  } else {
    authHint.textContent = "أنشئ حسابًا جديدًا";
    authSubmit.textContent = "إنشاء حساب";
    authToggleText.textContent = "عندك حساب؟";
    authToggleBtn.textContent = "سجّل دخول";
    passInput.autocomplete = "new-password";
  }
}
authToggleBtn.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

function authErrorMessage(code) {
  switch (code) {
    case "auth/invalid-email":        return "البريد الإلكتروني غير صحيح.";
    case "auth/email-already-in-use": return "هذا البريد مسجّل مسبقًا — سجّل دخولك.";
    case "auth/weak-password":        return "كلمة المرور ضعيفة (٦ أحرف على الأقل).";
    case "auth/missing-password":     return "اكتب كلمة المرور.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":       return "البريد أو كلمة المرور غير صحيحة.";
    case "auth/too-many-requests":    return "محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة.";
    case "auth/network-request-failed": return "تعذّر الاتصال بالشبكة.";
    default:                          return "حدث خطأ، حاول مرة أخرى.";
  }
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  authSubmit.disabled = true;
  const email = emailInput.value.trim();
  const pass  = passInput.value;
  try {
    if (mode === "signup") await createUserWithEmailAndPassword(auth, email, pass);
    else                   await signInWithEmailAndPassword(auth, email, pass);
    passInput.value = "";
  } catch (err) {
    authError.textContent = authErrorMessage(err.code);
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
  }
});

signOutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    authScreen.hidden = true;
    userBar.hidden = false;
    userEmail.textContent = user.email;
    startListening(user.uid);
  } else {
    authScreen.hidden = false;
    userBar.hidden = true;
    stopListening();
    events = [];
    render();
    setMode("login");
    setTimeout(() => emailInput.focus(), 60);
  }
});

// ================= Firestore =================
function eventsCol(uid) { return collection(db, "users", uid, "events"); }

function startListening(uid) {
  stopListening();
  const q = query(eventsCol(uid), orderBy("end", "asc"));
  unsubEvents = onSnapshot(q, (snap) => {
    events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    console.error("Firestore error:", err);
    emptyState.style.display = "block";
    emptyState.querySelector("h2").textContent = "تعذّر تحميل البيانات";
    emptyState.querySelector("p").textContent =
      "تأكّد من تفعيل Firestore وقواعد الأمان في مشروع Firebase.";
  });
}
function stopListening() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
}

async function saveEvent(data) {
  if (!currentUser) return;
  const id = editingId || doc(eventsCol(currentUser.uid)).id;
  await setDoc(doc(db, "users", currentUser.uid, "events", id), data, { merge: true });
}
async function deleteEvent(id) {
  if (!currentUser) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "events", id));
}

// ================= التواريخ =================
// البداية: تاريخ فقط (بداية اليوم). النهاية: تاريخ + وقت محدّد.
function startISOFromDate(str) { return new Date(str + "T00:00:00").toISOString(); }
function endISOFromDateTime(str) { return new Date(str).toISOString(); }
function toLocal(iso, len) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, len);
}
const toDateInput     = (iso) => toLocal(iso, 10); // YYYY-MM-DD
const toDateTimeInput = (iso) => toLocal(iso, 16); // YYYY-MM-DDTHH:mm

// ================= النافذة المنبثقة =================
function openModal(ev = null) {
  editingId = ev ? ev.id : null;
  modalTitle.textContent = ev ? "تعديل الحدث" : "حدث جديد";
  titleInput.value = ev ? ev.title : "";
  startInput.value = ev && ev.start ? toDateInput(ev.start) : "";
  endInput.value   = ev ? toDateTimeInput(ev.end) : "";
  formError.hidden = true;
  overlay.hidden = false;
  setTimeout(() => titleInput.focus(), 50);
}
function closeModal() { overlay.hidden = true; editingId = null; }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const start = startInput.value ? startISOFromDate(startInput.value) : null;
  const end   = endInput.value ? endISOFromDateTime(endInput.value) : null;

  if (!title) return showError("اكتب عنوانًا للحدث.");
  if (!end)   return showError("حدّد تاريخ النهاية.");
  if (start && new Date(end) <= new Date(start))
    return showError("تاريخ النهاية لازم يكون بعد تاريخ البداية.");

  try {
    const data = { title, start, end };
    if (!editingId) data.createdAt = new Date().toISOString();
    await saveEvent(data);
    closeModal();
  } catch (err) {
    showError("تعذّر الحفظ — تحقّق من اتصالك وقواعد Firestore.");
    console.error(err);
  }
});
function showError(msg) { formError.textContent = msg; formError.hidden = false; }

// ================= الرسم ================
function render() {
  grid.innerHTML = "";
  cardRefs.clear();
  emptyState.style.display = events.length ? "none" : "block";
  if (!events.length && currentUser) {
    emptyState.querySelector("h2").textContent = "لا توجد أحداث بعد";
    emptyState.querySelector("p").textContent = "ابدأ بإضافة أول حدث، وسيتكفّل العدّاد بالباقي.";
  }

  events.forEach((ev) => {
    const node = cardTpl.content.firstElementChild.cloneNode(true);
    const refs = {
      card:    node,
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
    node.querySelector(".edit-btn").addEventListener("click", () => openModal(ev));
    node.querySelector(".delete-btn").addEventListener("click", () => remove(ev.id));

    grid.appendChild(node);
    cardRefs.set(ev.id, refs);
  });
  tick();
}

async function remove(id) {
  if (!confirm("حذف هذا الحدث؟")) return;
  try { await deleteEvent(id); }
  catch (err) { console.error(err); alert("تعذّر الحذف."); }
}

// ================= العدّاد التنازلي =================
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

    const end   = new Date(ev.end).getTime();
    const start = ev.start ? new Date(ev.start).getTime() : null;
    // مرجع البداية للنسبة: البداية إن وُجدت، وإلا وقت الإنشاء
    const effStart = start != null ? start
                   : (ev.createdAt ? new Date(ev.createdAt).getTime() : null);

    let status, statusClass, remainingMs, progress = null;
    if (start && now < start) {
      remainingMs = start - now;                 // العد حتى البداية
      status = "يبدأ بعد"; statusClass = "soon";
      refs.card.classList.remove("is-finished");
    } else if (now >= end) {
      remainingMs = 0; progress = 100;
      status = "انتهى ✓"; statusClass = "ended";
      refs.card.classList.add("is-finished");
    } else {
      remainingMs = end - now;
      status = start ? "جارٍ الآن" : "المتبقّي"; statusClass = "live";
      refs.card.classList.remove("is-finished");
      if (effStart != null && end > effStart)
        progress = ((now - effStart) / (end - effStart)) * 100;
    }

    refs.status.textContent = status;
    refs.status.className = "card-status " + statusClass;

    const s = Math.floor(remainingMs / 1000);
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

// ================= أحداث عامة =================
document.getElementById("addBtn").addEventListener("click", () => openModal());
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelBtn").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeModal(); });

setInterval(tick, 1000);
