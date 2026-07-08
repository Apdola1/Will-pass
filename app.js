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

// ================= التواريخ (تاريخ فقط) =================
// البداية = بداية اليوم، النهاية = نهاية اليوم
function startISOFromDate(str) { return new Date(str + "T00:00:00").toISOString(); }
function endISOFromDate(str)   { return new Date(str + "T23:59:59.999").toISOString(); }
function toDateInput(iso) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

// ================= النافذة المنبثقة =================
function openModal(ev = null) {
  editingId = ev ? ev.id : null;
  modalTitle.textContent = ev ? "تعديل الحدث" : "حدث جديد";
  titleInput.value = ev ? ev.title : "";
  startInput.value = ev && ev.start ? toDateInput(ev.start) : "";
  endInput.value   = ev ? toDateInput(ev.end) : "";
  formError.hidden = true;
  overlay.hidden = false;
  setTimeout(() => titleInput.focus(), 50);
}
function closeModal() { overlay.hidden = true; editingId = null; }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const start = startInput.value ? startISOFromDate(startInput.value) : null;
  const end   = endInput.value ? endISOFromDate(endInput.value) : null;

  if (!title) return showError("اكتب عنوانًا للحدث.");
  if (!end)   return showError("حدّد تاريخ النهاية.");
  if (start && new Date(end) <= new Date(start))
    return showError("تاريخ النهاية لازم يكون بعد تاريخ البداية.");

  try {
    await saveEvent({ title, start, end });
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
      dots:    node.querySelector(".dot-grid"),
      days:    node.querySelector(".cd-days"),
      clock:   node.querySelector(".cd-clock"),
      lastDots: -1,
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

// ================= شبكة النقاط =================
const DAY = 86400000;
const MAX_DOTS = 100;

function buildDots(container, totalDays, remainingDays, finished) {
  let perDot = totalDays > MAX_DOTS ? Math.ceil(totalDays / MAX_DOTS) : 1;
  const totalDots = Math.max(1, Math.ceil(totalDays / perDot));
  const leftDots  = finished ? 0 : Math.min(totalDots, Math.max(0, Math.ceil(remainingDays / perDot)));
  const spentDots = totalDots - leftDots;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < totalDots; i++) {
    const d = document.createElement("span");
    d.className = "dot";
    // النقاط المنقضية باهتة، والمتبقّية مضيئة
    if (i >= spentDots) d.classList.add("left");
    frag.appendChild(d);
  }
  container.innerHTML = "";
  container.appendChild(frag);
}

// ================= العدّاد التنازلي =================
const pad = (n) => String(n).padStart(2, "0");

function tick() {
  const now = Date.now();
  events.forEach((ev) => {
    const refs = cardRefs.get(ev.id);
    if (!refs) return;

    const end = new Date(ev.end).getTime();
    const start = ev.start ? new Date(ev.start).getTime() : null;

    let status, statusClass, finished = false, remainingMs;
    if (start && now < start) {
      remainingMs = start - now; // العد حتى البداية
      status = "يبدأ بعد"; statusClass = "soon";
    } else if (now >= end) {
      remainingMs = 0; finished = true;
      status = "انتهى ✓"; statusClass = "ended";
      refs.card.classList.add("is-finished");
    } else {
      remainingMs = end - now;
      status = start ? "جارٍ الآن" : "المتبقّي"; statusClass = "live";
      refs.card.classList.remove("is-finished");
    }
    refs.status.textContent = status;
    refs.status.className = "card-status " + statusClass;

    // العدّاد الحي
    const s = Math.floor(remainingMs / 1000);
    const days = Math.floor(s / 86400);
    const hh = Math.floor((s % 86400) / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    refs.days.textContent = days;
    refs.clock.textContent = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

    // شبكة النقاط (تُعاد فقط عند تغيّر عدد الأيام)
    const remainingDays = Math.ceil(remainingMs / DAY);
    let totalDays;
    if (start) totalDays = Math.max(1, Math.ceil((end - start) / DAY));
    else totalDays = Math.max(1, remainingDays);

    const sig = finished ? -1 : remainingDays;
    if (refs.lastDots !== sig || (finished && refs.lastDots !== -1)) {
      buildDots(refs.dots, totalDays, remainingDays, finished);
      refs.lastDots = sig;
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
