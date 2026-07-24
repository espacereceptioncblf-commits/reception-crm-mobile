// ========================================================================
//  GESTION RECEPTION — PWA (équivalent mobile de reception_crm.py)
//  Backend : Supabase (auth + base de données, synchronisé multi-appareils)
// ========================================================================

// ---- 1) CONFIGURATION : à remplacer par tes propres identifiants ----
// Supabase > Project Settings > API
const SUPABASE_URL = "https://fmstfqzmahhidvyespwk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtc3RmcXptYWhoaWR2eWVzcHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODg4OTEsImV4cCI6MjEwMDQ2NDg5MX0.ObX6Xpg_ugP70d8Jf6WJNhsXezXUS8j7qIAo6ZQIqg4";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 2) CONSTANTES (identiques à reception_crm.py) ----
const TYPES_EVENEMENT = ["Mariage", "Anniversaire", "Baptême", "Séminaire", "Autre"];
const STATUTS_PROSPECT = ["Nouveau", "Contacté", "Qualifié", "Devis envoyé", "Converti", "Perdu"];
const STATUTS_DEVIS = ["Brouillon", "Envoyé", "Accepté", "Refusé", "Expiré"];
const STATUTS_EVENEMENT = ["Option", "Confirmé", "Terminé", "Annulé"];
const STATUTS_TODO = ["À faire", "En cours", "Terminé"];
const PRIORITES = ["Basse", "Normale", "Haute", "Urgente"];
const SOURCES_PROSPECT = ["Site web", "Téléphone", "Bouche à oreille", "Réseaux sociaux", "Salon", "Recommandation", "Autre"];

const STATUT_COLORS = {
  "Nouveau": "var(--info)", "Contacté": "var(--warning)", "Qualifié": "var(--accent)",
  "Devis envoyé": "var(--warning)", "Converti": "var(--success)", "Perdu": "var(--danger)",
  "Brouillon": "var(--muted)", "Envoyé": "var(--warning)", "Accepté": "var(--success)",
  "Refusé": "var(--danger)", "Expiré": "var(--muted)",
  "Option": "var(--warning)", "Confirmé": "var(--success)", "Terminé": "var(--muted)", "Annulé": "var(--danger)",
  "À faire": "var(--info)", "En cours": "var(--warning)",
};

// ---- 3) ETAT LOCAL (cache en mémoire, resynchronisé à chaque page) ----
let currentUser = null;
let cache = { contacts: [], prospects: [], devis: [], evenements: [], todos: [] };
let currentPage = "dashboard";
let modalContext = null; // { table, id, onSaved }
let calState = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, selected: null };

// ---- 4) HELPERS ----
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function nowStr() {
  const d = new Date();
  return d.toISOString().slice(0, 16).replace("T", " ");
}
function fmtDateFR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function badge(text, color) {
  if (!text) return "";
  return `<span class="badge" style="background:${color || "var(--muted)"}">${text}</span>`;
}
function contactLabel(c) {
  if (!c) return "—";
  return [c.prenom, c.nom].filter(Boolean).join(" ") || c.societe || "Sans nom";
}
function findContact(id) { return cache.contacts.find(c => c.id === id); }
function findDevis(id) { return cache.devis.find(d => d.id === id); }

// ---- 5) SUPABASE CRUD GENERIQUE ----
async function fetchAll(table, orderCol = "id", ascending = false) {
  const { data, error } = await sb.from(table).select("*").order(orderCol, { ascending });
  if (error) { showToast("Erreur chargement " + table); console.error(error); return []; }
  return data;
}
async function insertRow(table, values) {
  values.user_id = currentUser.id;
  values.date_creation = values.date_creation || nowStr();
  const { data, error } = await sb.from(table).insert(values).select().single();
  if (error) { showToast("Erreur enregistrement"); console.error(error); return null; }
  return data;
}
async function updateRow(table, id, values) {
  const { data, error } = await sb.from(table).update(values).eq("id", id).select().single();
  if (error) { showToast("Erreur mise à jour"); console.error(error); return null; }
  return data;
}
async function deleteRow(table, id) {
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) { showToast("Erreur suppression"); console.error(error); return false; }
  return true;
}
async function refreshCache() {
  const [contacts, prospects, devisRows, evenements, todos] = await Promise.all([
    fetchAll("contacts", "nom", true),
    fetchAll("prospects"),
    fetchAll("devis"),
    fetchAll("evenements"),
    fetchAll("todos"),
  ]);
  cache = { contacts, prospects, devis: devisRows, evenements, todos };
}

// ========================================================================
//  AUTHENTIFICATION
// ========================================================================
let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById("auth-title");
  const sub = document.getElementById("auth-sub");
  const submit = document.getElementById("auth-submit");
  const switchText = document.getElementById("auth-switch-text");
  const switchLink = document.getElementById("auth-switch-link");
  document.getElementById("auth-error").style.display = "none";
  if (mode === "login") {
    title.textContent = "Connexion";
    sub.textContent = "Gestion Réception — accède à ton compte";
    submit.textContent = "Se connecter";
    switchText.textContent = "Pas encore de compte ?";
    switchLink.textContent = "Créer un compte";
  } else {
    title.textContent = "Créer un compte";
    sub.textContent = "Gestion Réception — synchronise tes données";
    submit.textContent = "Créer mon compte";
    switchText.textContent = "Déjà un compte ?";
    switchLink.textContent = "Se connecter";
  }
}

function authError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.style.display = "block";
}

async function handleAuthSubmit() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || !password) { authError("Renseigne un email et un mot de passe."); return; }

  if (authMode === "login") {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { authError(error.message); return; }
    onLoggedIn(data.user);
  } else {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) { authError(error.message); return; }
    if (data.user && !data.session) {
      authError("Compte créé — vérifie ta boîte mail pour confirmer, puis connecte-toi.");
      setAuthMode("login");
    } else if (data.user) {
      onLoggedIn(data.user);
    }
  }
}

async function onLoggedIn(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById("user-email-lbl").textContent = user.email;
  await refreshCache();
  showPage("dashboard");
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("auth-email").value = "";
  document.getElementById("auth-password").value = "";
}

// ========================================================================
//  NAVIGATION
// ========================================================================
function showPage(key) {
  currentPage = key;
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === key);
  });
  document.querySelectorAll(".page").forEach(el => {
    el.classList.toggle("active", el.id === "page-" + key);
  });
  renderPage(key);
}

function renderPage(key) {
  if (key === "dashboard") renderDashboard();
  else if (key === "todo") renderTodo();
  else if (key === "prospects") renderProspects();
  else if (key === "devis") renderDevis();
  else if (key === "contacts") renderContacts();
  else if (key === "evenements") renderEvenements();
  else if (key === "calendrier") renderCalendrier();
}

async function refreshAll() {
  await refreshCache();
  renderPage(currentPage);
}

// ========================================================================
//  DASHBOARD
// ========================================================================
function renderDashboard() {
  const today = todayStr();
  const nbContacts = cache.contacts.length;
  const prospectsActifs = cache.prospects.filter(p => !["Converti", "Perdu"].includes(p.statut)).length;
  const devisEnAttente = cache.devis.filter(d => d.statut === "Envoyé").length;
  const evenementsAvenir = cache.evenements.filter(e => e.date_evenement >= today).length;
  const todosOuvertes = cache.todos.filter(t => t.statut !== "Terminé").length;

  const cardsHtml = [
    ["👤", nbContacts, "Contacts"],
    ["🎯", prospectsActifs, "Prospects actifs"],
    ["📄", devisEnAttente, "Devis en attente"],
    ["🎉", evenementsAvenir, "Évènements à venir"],
    ["✅", todosOuvertes, "Tâches en cours"],
  ].map(([icon, num, label]) => `
    <div class="stat-card">
      <div style="font-size:20px;">${icon}</div>
      <div class="num">${num}</div>
      <div class="label">${label}</div>
    </div>`).join("");
  document.getElementById("dash-cards").innerHTML = cardsHtml;

  const activity = [];
  cache.contacts.forEach(c => activity.push({ date: c.date_creation || "", type: "Contact", detail: contactLabel(c) }));
  cache.evenements.forEach(e => activity.push({ date: e.date_creation || "", type: "Évènement", detail: e.titre || "" }));
  cache.devis.forEach(d => activity.push({ date: d.date_creation || "", type: "Devis", detail: d.numero || "" }));
  cache.todos.forEach(t => activity.push({ date: t.date_creation || "", type: "Tâche", detail: t.titre || "" }));
  activity.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const tbody = document.getElementById("dash-activity");
  const top = activity.slice(0, 8);
  tbody.innerHTML = top.length ? top.map(a => `
    <tr><td>${a.date || "—"}</td><td>${a.type}</td><td>${a.detail}</td></tr>
  `).join("") : `<tr class="empty-row"><td colspan="3">Aucune activité pour l'instant</td></tr>`;
}

// ========================================================================
//  TODO
// ========================================================================
function ensureFilterOptions(selectId, options) {
  const sel = document.getElementById(selectId);
  if (sel.dataset.filled) return;
  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o; opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.dataset.filled = "1";
  sel.addEventListener("change", () => renderPage(currentPage));
}

function renderTodo() {
  ensureFilterOptions("todo-filter-statut", STATUTS_TODO);
  const filter = document.getElementById("todo-filter-statut").value;
  let rows = [...cache.todos].sort((a, b) => (a.date_echeance || "9999").localeCompare(b.date_echeance || "9999"));
  if (filter) rows = rows.filter(t => t.statut === filter);

  const tbody = document.getElementById("todo-tbody");
  tbody.innerHTML = rows.length ? rows.map(t => `
    <tr>
      <td>${t.titre}</td>
      <td>${t.categorie || "—"}</td>
      <td>${badge(t.priorite, t.priorite === "Urgente" ? "var(--danger)" : t.priorite === "Haute" ? "var(--warning)" : "var(--muted)")}</td>
      <td>${fmtDateFR(t.date_echeance)}</td>
      <td>${badge(t.statut, STATUT_COLORS[t.statut])}</td>
      <td class="row-actions">
        <button onclick="openTodoDialog(${t.id})">✎</button>
        <button onclick="confirmDelete('todos', ${t.id}, renderTodo)">🗑</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="6">Aucune tâche</td></tr>`;
}

function openTodoDialog(id) {
  const row = id ? cache.todos.find(t => t.id === id) : {};
  openModal({
    title: id ? "Modifier la tâche" : "Nouvelle tâche",
    table: "todos",
    id: id,
    fields: [
      { key: "titre", label: "Titre", type: "text", required: true, value: row.titre },
      { key: "description", label: "Description", type: "textarea", value: row.description },
      { key: "categorie", label: "Catégorie", type: "text", value: row.categorie },
      { key: "priorite", label: "Priorité", type: "select", options: PRIORITES, value: row.priorite || "Normale" },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_TODO, value: row.statut || "À faire" },
      { key: "date_echeance", label: "Échéance", type: "date", value: row.date_echeance },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  PROSPECTS
// ========================================================================
function contactOptionsHtml(selectedId) {
  return cache.contacts.map(c => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${contactLabel(c)}</option>`).join("");
}

function renderProspects() {
  ensureFilterOptions("prospect-filter-statut", STATUTS_PROSPECT);
  const filter = document.getElementById("prospect-filter-statut").value;
  let rows = [...cache.prospects];
  if (filter) rows = rows.filter(p => p.statut === filter);

  const tbody = document.getElementById("prospect-tbody");
  tbody.innerHTML = rows.length ? rows.map(p => `
    <tr>
      <td>${contactLabel(findContact(p.contact_id))}</td>
      <td>${badge(p.statut, STATUT_COLORS[p.statut])}</td>
      <td>${p.source || "—"}</td>
      <td>${p.budget_estime ? p.budget_estime + " €" : "—"}</td>
      <td>${fmtDateFR(p.date_evenement_souhaite)}</td>
      <td>${fmtDateFR(p.prochaine_relance)}</td>
      <td class="row-actions">
        <button onclick="openProspectDialog(${p.id})">✎</button>
        <button onclick="confirmDelete('prospects', ${p.id}, renderProspects)">🗑</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="7">Aucun prospect</td></tr>`;
}

function openProspectDialog(id) {
  const row = id ? cache.prospects.find(p => p.id === id) : {};
  openModal({
    title: id ? "Modifier le prospect" : "Nouveau prospect",
    table: "prospects",
    id: id,
    fields: [
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_PROSPECT, value: row.statut || "Nouveau" },
      { key: "source", label: "Source", type: "select", options: SOURCES_PROSPECT, value: row.source },
      { key: "budget_estime", label: "Budget estimé (€)", type: "number", value: row.budget_estime },
      { key: "date_evenement_souhaite", label: "Date évènement souhaitée", type: "date", value: row.date_evenement_souhaite },
      { key: "prochaine_relance", label: "Prochaine relance", type: "date", value: row.prochaine_relance },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  DEVIS
// ========================================================================
function renderDevis() {
  ensureFilterOptions("devis-filter-statut", STATUTS_DEVIS);
  const filter = document.getElementById("devis-filter-statut").value;
  let rows = [...cache.devis].sort((a, b) => (b.date_creation || "").localeCompare(a.date_creation || ""));
  if (filter) rows = rows.filter(d => d.statut === filter);

  const tbody = document.getElementById("devis-tbody");
  tbody.innerHTML = rows.length ? rows.map(d => `
    <tr>
      <td>${d.numero || "—"}</td>
      <td>${contactLabel(findContact(d.contact_id))}</td>
      <td>${d.type_evenement || "—"}</td>
      <td>${fmtDateFR(d.date_evenement)}</td>
      <td>${d.montant_ttc ? d.montant_ttc + " €" : "—"}</td>
      <td>${badge(d.statut, STATUT_COLORS[d.statut])}</td>
      <td class="row-actions">
        <button onclick="openDevisDialog(${d.id})">✎</button>
        <button onclick="confirmDelete('devis', ${d.id}, renderDevis)">🗑</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="7">Aucun devis</td></tr>`;
}

function openDevisDialog(id) {
  const row = id ? cache.devis.find(d => d.id === id) : {};
  openModal({
    title: id ? "Modifier le devis" : "Nouveau devis",
    table: "devis",
    id: id,
    fields: [
      { key: "numero", label: "Numéro", type: "text", value: row.numero },
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "type_evenement", label: "Type d'évènement", type: "select", options: TYPES_EVENEMENT, value: row.type_evenement },
      { key: "date_evenement", label: "Date évènement", type: "date", value: row.date_evenement },
      { key: "nb_invites", label: "Nombre d'invités", type: "number", value: row.nb_invites },
      { key: "montant_ht", label: "Montant HT (€)", type: "number", value: row.montant_ht },
      { key: "montant_ttc", label: "Montant TTC (€)", type: "number", value: row.montant_ttc },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_DEVIS, value: row.statut || "Brouillon" },
      { key: "date_validite", label: "Date de validité", type: "date", value: row.date_validite },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  CONTACTS
// ========================================================================
function renderContacts() {
  const search = (document.getElementById("contact-search").value || "").toLowerCase();
  if (!document.getElementById("contact-search").dataset.bound) {
    document.getElementById("contact-search").addEventListener("input", renderContacts);
    document.getElementById("contact-search").dataset.bound = "1";
  }
  let rows = [...cache.contacts];
  if (search) {
    rows = rows.filter(c => (contactLabel(c) + " " + (c.societe || "") + " " + (c.email || "")).toLowerCase().includes(search));
  }
  const tbody = document.getElementById("contact-tbody");
  tbody.innerHTML = rows.length ? rows.map(c => `
    <tr>
      <td>${contactLabel(c)}</td>
      <td>${c.societe || "—"}</td>
      <td>${c.email || "—"}</td>
      <td>${c.telephone || "—"}</td>
      <td>${c.type_evenement_interet || "—"}</td>
      <td class="row-actions">
        <button onclick="openContactDialog(${c.id})">✎</button>
        <button onclick="confirmDelete('contacts', ${c.id}, renderContacts)">🗑</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="6">Aucun contact</td></tr>`;
}

function openContactDialog(id) {
  const row = id ? cache.contacts.find(c => c.id === id) : {};
  openModal({
    title: id ? "Modifier le contact" : "Nouveau contact",
    table: "contacts",
    id: id,
    fields: [
      { key: "nom", label: "Nom", type: "text", required: true, value: row.nom },
      { key: "prenom", label: "Prénom", type: "text", value: row.prenom },
      { key: "societe", label: "Société", type: "text", value: row.societe },
      { key: "email", label: "Email", type: "text", value: row.email },
      { key: "telephone", label: "Téléphone", type: "text", value: row.telephone },
      { key: "adresse", label: "Adresse", type: "textarea", value: row.adresse },
      { key: "type_evenement_interet", label: "Type d'évènement d'intérêt", type: "select", options: TYPES_EVENEMENT, value: row.type_evenement_interet },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  EVENEMENTS
// ========================================================================
function renderEvenements() {
  ensureFilterOptions("evenement-filter-statut", STATUTS_EVENEMENT);
  const filter = document.getElementById("evenement-filter-statut").value;
  let rows = [...cache.evenements].sort((a, b) => (a.date_evenement || "9999").localeCompare(b.date_evenement || "9999"));
  if (filter) rows = rows.filter(e => e.statut === filter);

  const tbody = document.getElementById("evenement-tbody");
  tbody.innerHTML = rows.length ? rows.map(e => `
    <tr>
      <td>${e.titre || "—"}</td>
      <td>${e.type_evenement || "—"}</td>
      <td>${fmtDateFR(e.date_evenement)}</td>
      <td>${(e.heure_debut || "—") + (e.heure_fin ? " – " + e.heure_fin : "")}</td>
      <td>${e.nb_invites ?? "—"}</td>
      <td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
      <td class="row-actions">
        <button onclick="openEvenementDialog(${e.id})">✎</button>
        <button onclick="confirmDelete('evenements', ${e.id}, renderEvenements)">🗑</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="7">Aucun évènement</td></tr>`;
}

function devisOptionsHtml(selectedId) {
  return cache.devis.map(d => `<option value="${d.id}" ${d.id === selectedId ? "selected" : ""}>${d.numero || ("Devis #" + d.id)}</option>`).join("");
}

function openEvenementDialog(id, defaultDate) {
  const row = id ? cache.evenements.find(e => e.id === id) : {};
  openModal({
    title: id ? "Modifier l'évènement" : "Nouvel évènement",
    table: "evenements",
    id: id,
    fields: [
      { key: "titre", label: "Titre", type: "text", required: true, value: row.titre },
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "devis_id", label: "Devis lié", type: "select-raw", optionsHtml: `<option value="">—</option>` + devisOptionsHtml(row.devis_id), value: row.devis_id, numeric: true },
      { key: "type_evenement", label: "Type d'évènement", type: "select", options: TYPES_EVENEMENT, value: row.type_evenement },
      { key: "date_evenement", label: "Date", type: "date", value: row.date_evenement || defaultDate },
      { key: "heure_debut", label: "Heure début", type: "time", value: row.heure_debut },
      { key: "heure_fin", label: "Heure fin", type: "time", value: row.heure_fin },
      { key: "nb_invites", label: "Nombre d'invités", type: "number", value: row.nb_invites },
      { key: "lieu", label: "Lieu", type: "text", value: row.lieu },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_EVENEMENT, value: row.statut || "Option" },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  CALENDRIER
// ========================================================================
const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DOW_FR = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

function renderCalendrier() {
  const { year, month } = calState;
  document.getElementById("cal-month-lbl").textContent = `${MOIS_FR[month - 1]} ${year}`;

  const eventsByDay = {};
  cache.evenements.forEach(e => {
    if (!e.date_evenement) return;
    const [y, m, d] = e.date_evenement.split("-").map(Number);
    if (y === year && m === month) {
      (eventsByDay[d] = eventsByDay[d] || []).push(e);
    }
  });

  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7; // lundi=0
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayIso = todayStr();

  let html = DOW_FR.map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = iso === todayIso;
    const isSelected = iso === calState.selected;
    const n = eventsByDay[day] ? eventsByDay[day].length : 0;
    html += `<div class="cal-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" onclick="selectCalDay('${iso}')">
      <div>${day}</div>
      ${n ? `<div class="evt-dot">● ${n} évt</div>` : ""}
    </div>`;
  }
  document.getElementById("cal-grid").innerHTML = html;

  if (!calState.selected || !calState.selected.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
    calState.selected = (month === new Date().getMonth() + 1 && year === new Date().getFullYear()) ? todayIso : null;
  }
  renderCalDay();
}

function selectCalDay(iso) {
  calState.selected = iso;
  renderCalendrier();
}

function renderCalDay() {
  const lbl = document.getElementById("cal-day-lbl");
  const tbody = document.getElementById("cal-day-tbody");
  if (!calState.selected) {
    lbl.textContent = "Évènements du jour";
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Sélectionne un jour</td></tr>`;
    return;
  }
  lbl.textContent = "Évènements du " + fmtDateFR(calState.selected);
  const rows = cache.evenements.filter(e => e.date_evenement === calState.selected)
    .sort((a, b) => (a.heure_debut || "").localeCompare(b.heure_debut || ""));
  tbody.innerHTML = rows.length ? rows.map(e => `
    <tr onclick="openEvenementDialog(${e.id})" style="cursor:pointer;">
      <td>${e.heure_debut || "—"}</td><td>${e.titre}</td><td>${e.type_evenement || ""}</td><td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="4">Aucun évènement — clique pour en ajouter un</td></tr>`;
}

// ========================================================================
//  MODAL GENERIQUE
// ========================================================================
function openModal({ title, table, id, fields, onSaved }) {
  modalContext = { table, id, fields, onSaved };
  document.getElementById("modal-title").textContent = title;
  const form = document.getElementById("modal-form");
  form.innerHTML = fields.map(f => {
    let input;
    if (f.type === "select") {
      input = `<select name="${f.key}">${(f.options || []).map(o => `<option value="${o}" ${o === f.value ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    } else if (f.type === "select-raw") {
      input = `<select name="${f.key}">${f.optionsHtml}</select>`;
    } else if (f.type === "textarea") {
      input = `<textarea name="${f.key}">${f.value || ""}</textarea>`;
    } else {
      input = `<input type="${f.type}" name="${f.key}" value="${f.value != null ? f.value : ""}" ${f.required ? "required" : ""}>`;
    }
    return `<div class="field"><label>${f.label}${f.required ? " *" : ""}</label>${input}</div>`;
  }).join("");
  document.getElementById("modal-delete").style.display = id ? "inline-block" : "none";
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  modalContext = null;
}

async function saveModal() {
  if (!modalContext) return;
  const { table, id, fields, onSaved } = modalContext;
  const form = document.getElementById("modal-form");
  const values = {};
  let missingRequired = false;
  fields.forEach(f => {
    const el = form.elements[f.key];
    let val = el.value;
    if (f.required && !val) missingRequired = true;
    if (val === "") val = null;
    if (val !== null && (f.type === "number" || f.numeric)) val = Number(val);
    values[f.key] = val;
  });
  if (missingRequired) { showToast("Merci de remplir les champs obligatoires"); return; }

  if (id) {
    await updateRow(table, id, values);
    showToast("Modifications enregistrées");
  } else {
    await insertRow(table, values);
    showToast("Ajouté avec succès");
  }
  closeModal();
  if (onSaved) await onSaved();
}

function confirmDelete(table, id, afterFn) {
  if (!confirm("Supprimer cet élément ? Cette action est irréversible.")) return;
  deleteRow(table, id).then(async ok => {
    if (ok) {
      showToast("Supprimé");
      await refreshCache();
      if (afterFn) afterFn();
      else renderPage(currentPage);
    }
  });
}

// ========================================================================
//  RACCOURCIS / BOUTONS
// ========================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Auth
  document.getElementById("auth-submit").addEventListener("click", handleAuthSubmit);
  document.getElementById("auth-switch-link").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
  document.getElementById("auth-password").addEventListener("keydown", e => { if (e.key === "Enter") handleAuthSubmit(); });
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Nav
  document.querySelectorAll(".nav-item").forEach(el => {
    el.addEventListener("click", () => showPage(el.dataset.page));
  });

  // Shortcuts (toolbar + boutons de page)
  document.getElementById("sc-devis").addEventListener("click", () => openDevisDialog(null));
  document.getElementById("sc-contact").addEventListener("click", () => openContactDialog(null));
  document.getElementById("sc-evenement").addEventListener("click", () => openEvenementDialog(null));
  document.getElementById("sc-todo").addEventListener("click", () => openTodoDialog(null));
  document.getElementById("btn-new-todo").addEventListener("click", () => openTodoDialog(null));
  document.getElementById("btn-new-prospect").addEventListener("click", () => openProspectDialog(null));
  document.getElementById("btn-new-devis").addEventListener("click", () => openDevisDialog(null));
  document.getElementById("btn-new-contact").addEventListener("click", () => openContactDialog(null));
  document.getElementById("btn-new-evenement").addEventListener("click", () => openEvenementDialog(null));

  // Modal
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-save").addEventListener("click", saveModal);
  document.getElementById("modal-delete").addEventListener("click", () => {
    if (modalContext && modalContext.id) {
      confirmDelete(modalContext.table, modalContext.id, () => renderPage(currentPage));
      closeModal();
    }
  });
  document.getElementById("modal-overlay").addEventListener("click", e => { if (e.target.id === "modal-overlay") closeModal(); });

  // Calendrier
  document.getElementById("cal-prev").addEventListener("click", () => {
    calState.month--; if (calState.month < 1) { calState.month = 12; calState.year--; }
    calState.selected = null;
    renderCalendrier();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    calState.month++; if (calState.month > 12) { calState.month = 1; calState.year++; }
    calState.selected = null;
    renderCalendrier();
  });

  // Clavier (raccourcis identiques à la version Python)
  document.addEventListener("keydown", e => {
    if (!currentUser) return;
    if (e.ctrlKey && e.key === "d") { e.preventDefault(); openDevisDialog(null); }
    if (e.ctrlKey && e.key === "k") { e.preventDefault(); openContactDialog(null); }
    if (e.ctrlKey && e.key === "e") { e.preventDefault(); openEvenementDialog(null); }
    if (e.ctrlKey && e.key === "t") { e.preventDefault(); openTodoDialog(null); }
  });

  // Session existante ?
  sb.auth.getSession().then(({ data }) => {
    if (data.session) onLoggedIn(data.session.user);
  });

  // Service worker (PWA)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});
