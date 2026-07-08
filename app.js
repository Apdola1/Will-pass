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

const COLORS = ["#ffffff", "#d0d0d0", "#a0a0a0", "#e8e8e8", "#b8b8b8", "#787878"];

// ---------- عناصر الواجهة ----------
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

// عناصر المصادقة
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

// ---------- الحالة ----------
let events = [];
let editingId = null;
let selectedColor = COLORS[0];
const cardRefs = new Map();
let currentUser = null;
let unsubEvents = null;

// ================= المصادقة =================
let mode = "login"; // login | signup

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
    if (mode === "signup") {
      await createUserWithEmailAndPassword(auth, email, pass);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
    passInput.value = "";
  } catch (err) {
    authError.textContent = authErrorMessage(err.code);
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
  }
});

signOutBtn.addEventListener("click", () => signOut(auth));

// تغيّر حالة تسجيل الدخول
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

// ================= النافذة المنبثقة =================
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
function closeModal() { overlay.hidden = true; editingId = null; }

function toLocalInput(iso) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 16);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const start = startInput.value ? new Date(startInput.value).toISOString() : null;
  const end   = endInput.value ? new Date(endInput.value).toISOString() : null;

  if (!title) return showError("اكتب عنوانًا للحدث.");
  if (!end)   return showError("حدّد تاريخ النهاية.");
  if (start && new Date(end) <= new Date(start))
    return showError("تاريخ النهاية لازم يكون بعد تاريخ البداية.");

  try {
    await saveEvent({ title, start, end, color: selectedColor });
    closeModal();
  } catch (err) {
    showError("تعذّر الحفظ — تحقّق من اتصالك وقواعد Firestore.");
    console.error(err);
  }
});

function showError(msg) { formError.textContent = msg; formError.hidden = false; }

// ================= الرسم =================
function render() {
  grid.innerHTML = "";
  cardRefs.clear();
  emptyState.style.display = events.length ? "none" : "block";
  // إعادة نص الحالة الفارغة الافتراضي
  if (!events.length && currentUser) {
    emptyState.querySelector("h2").textContent = "لا توجد أحداث بعد";
    emptyState.querySelector("p").textContent = "ابدأ بإضافة أول حدث، وسيتكفّل العدّاد بالباقي.";
  }

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

    const end = new Date(ev.end).getTime();
    const start = ev.start ? new Date(ev.start).getTime() : null;
    let remaining, status, statusClass, progress = null;

    if (start && now < start) {
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

// ================= أحداث عامة =================
document.getElementById("addBtn").addEventListener("click", () => openModal());
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelBtn").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeModal(); });

setInterval(tick, 1000);
