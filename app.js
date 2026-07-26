// ========================================================================
//  GESTION RECEPTION — PWA (équivalent mobile de reception_crm.py)
//  Backend : Supabase (auth + base de données, synchronisé multi-appareils)
// ========================================================================

// ---- 1) CONFIGURATION : à remplacer par tes propres identifiants ----
// Supabase > Project Settings > API
const SUPABASE_URL = "https://fmstfqzmahhidvyespwk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtc3RmcXptYWhoaWR2eWVzcHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODg4OTEsImV4cCI6MjEwMDQ2NDg5MX0.ObX6Xpg_ugP70d8Jf6WJNhsXezXUS8j7qIAo6ZQIqg4";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 2) CONSTANTES ----
const TYPES_EVENEMENT = ["Mariage", "Anniversaire", "Baptême", "Séminaire", "Autre"];
const STATUTS_PROSPECT = ["Nouveau", "Contacté", "Qualifié", "Devis envoyé", "Converti", "Perdu"];
const STATUTS_DEVIS = ["Brouillon", "Envoyé", "Accepté", "Refusé", "Expiré"];
const STATUTS_EVENEMENT = ["Option", "Confirmé", "Terminé", "Annulé"];
const STATUTS_TODO = ["À faire", "En cours", "Terminé"];
const STATUTS_RDV = ["Prévu", "Confirmé", "Effectué", "Annulé"];
const PRIORITES = ["Basse", "Normale", "Haute", "Urgente"];
const SOURCES_PROSPECT = ["Site web", "Téléphone", "Bouche à oreille", "Réseaux sociaux", "Salon", "Recommandation", "Autre"];
const CATEGORIES_CONTACT = ["Client", "Prospect", "Partenaire", "Fournisseur", "Traiteur"];
const FORMULES = ["Clef en main", "Location salle"];
const TVA_RATES = [0, 5.5, 8, 10, 20];

const STATUT_COLORS = {
  "Nouveau": "var(--info)", "Contacté": "var(--warning)", "Qualifié": "var(--accent)",
  "Devis envoyé": "var(--warning)", "Converti": "var(--success)", "Perdu": "var(--danger)",
  "Brouillon": "var(--muted)", "Envoyé": "var(--warning)", "Accepté": "var(--success)",
  "Refusé": "var(--danger)", "Expiré": "var(--muted)",
  "Option": "var(--warning)", "Confirmé": "var(--success)", "Terminé": "var(--muted)", "Annulé": "var(--danger)",
  "À faire": "var(--info)", "En cours": "var(--warning)",
  "Prévu": "var(--info)", "Effectué": "var(--success)",
  "Client": "var(--success)", "Prospect": "var(--info)", "Partenaire": "var(--accent)",
  "Fournisseur": "var(--warning)", "Traiteur": "var(--warning)",
};

// ---- 3) ETAT LOCAL ----
let currentUser = null;
let cache = { contacts: [], prospects: [], devis: [], evenements: [], todos: [], grille_tarifaire: [], rdv: [] };
let currentPage = "dashboard";
let modalContext = null; // { table, id, fields, onSaved, onRender, beforeSave }
let calState = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, selected: null };

// ---- 4) HELPERS ----
function todayStr() { return new Date().toISOString().slice(0, 10); }
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
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
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
function findEvenement(id) { return cache.evenements.find(e => e.id === id); }

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
  const [contacts, prospects, devisRows, evenements, todos, grille, rdv] = await Promise.all([
    fetchAll("contacts", "nom", true),
    fetchAll("prospects"),
    fetchAll("devis"),
    fetchAll("evenements"),
    fetchAll("todos"),
    fetchAll("grille_tarifaire", "nom_presta", true),
    fetchAll("rdv"),
  ]);
  cache = { contacts, prospects, devis: devisRows, evenements, todos, grille_tarifaire: grille, rdv };
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
  else if (key === "grille") renderGrille();
  else if (key === "contacts") renderContacts();
  else if (key === "evenements") renderEvenements();
  else if (key === "rdv") renderRdv();
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
  const rdvAvenir = cache.rdv.filter(r => (r.date_rdv || "") >= today && r.statut !== "Annulé").length;
  const todosOuvertes = cache.todos.filter(t => t.statut !== "Terminé").length;

  const cardsHtml = [
    ["👤", nbContacts, "Contacts"],
    ["🎯", prospectsActifs, "Prospects actifs"],
    ["📄", devisEnAttente, "Devis en attente"],
    ["🤝", rdvAvenir, "RDV à venir"],
    ["🎉", evenementsAvenir, "Évènements à venir"],
    ["✅", todosOuvertes, "Tâches en cours"],
  ].map(([icon, num, label]) => `
    <div class="stat-card">
      <div style="font-size:20px;">${icon}</div>
      <div class="num">${num}</div>
      <div class="label">${label}</div>
    </div>`).join("");
  document.getElementById("dash-cards").innerHTML = cardsHtml;

  // RDV à venir (triés par date + heure)
  const rdvRows = cache.rdv
    .filter(r => (r.date_rdv || "") >= today && r.statut !== "Annulé")
    .sort((a, b) => ((a.date_rdv || "") + (a.heure || "")).localeCompare((b.date_rdv || "") + (b.heure || "")))
    .slice(0, 8);
  document.getElementById("dash-rdv").innerHTML = rdvRows.length ? rdvRows.map(r => `
    <tr onclick="openRdvDialog(${r.id})" style="cursor:pointer;">
      <td>${fmtDateFR(r.date_rdv)}</td>
      <td>${r.heure || "—"}</td>
      <td>${r.objet || "—"}</td>
      <td>${contactLabel(findContact(r.contact_id))}</td>
      <td>${badge(r.statut, STATUT_COLORS[r.statut])}</td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="5">Aucun RDV à venir</td></tr>`;

  // Évènements à venir
  const evRows = cache.evenements
    .filter(e => (e.date_evenement || "") >= today)
    .sort((a, b) => (a.date_evenement || "").localeCompare(b.date_evenement || ""))
    .slice(0, 8);
  document.getElementById("dash-events").innerHTML = evRows.length ? evRows.map(e => `
    <tr onclick="openEvenementDialog(${e.id})" style="cursor:pointer;">
      <td>${fmtDateFR(e.date_evenement)}</td>
      <td>${e.titre || "—"}</td>
      <td>${e.type_evenement || "—"}</td>
      <td>${e.nb_invites ?? "—"}</td>
      <td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="5">Aucun évènement à venir</td></tr>`;

  // Activité récente (dernières actions manuelles)
  const activity = [];
  cache.contacts.forEach(c => activity.push({ date: c.date_creation || "", type: "Contact", detail: contactLabel(c) }));
  cache.evenements.forEach(e => activity.push({ date: e.date_creation || "", type: "Évènement", detail: e.titre || "" }));
  cache.devis.forEach(d => activity.push({ date: d.date_creation || "", type: "Devis", detail: d.numero || "" }));
  cache.rdv.forEach(r => activity.push({ date: r.date_creation || "", type: "RDV", detail: r.objet || "" }));
  cache.todos.forEach(t => activity.push({ date: t.date_creation || "", type: "Tâche", detail: t.titre || "" }));
  activity.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const tbody = document.getElementById("dash-activity");
  const top = activity.slice(0, 8);
  tbody.innerHTML = top.length ? top.map(a => `
    <tr><td>${a.date || "—"}</td><td>${a.type}</td><td>${a.detail}</td></tr>
  `).join("") : `<tr class="empty-row"><td colspan="3">Aucune activité pour l'instant</td></tr>`;
}

// ========================================================================
//  FILTRES
// ========================================================================
function ensureFilterOptions(selectId, options) {
  const sel = document.getElementById(selectId);
  if (sel.dataset.filled) return;
  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.value !== undefined ? o.value : o;
    opt.textContent = o.label !== undefined ? o.label : o;
    sel.appendChild(opt);
  });
  sel.dataset.filled = "1";
  sel.addEventListener("change", () => renderPage(currentPage));
}

// ========================================================================
//  TODO
// ========================================================================
function evenementOptionsHtml(selectedId) {
  return cache.evenements.map(e => `<option value="${e.id}" ${e.id === selectedId ? "selected" : ""}>${e.titre || ("Évènement #" + e.id)}</option>`).join("");
}

function renderTodo() {
  ensureFilterOptions("todo-filter-statut", STATUTS_TODO);
  const filter = document.getElementById("todo-filter-statut").value;
  let rows = [...cache.todos].sort((a, b) => (a.date_echeance || "9999").localeCompare(b.date_echeance || "9999"));
  if (filter) rows = rows.filter(t => t.statut === filter);

  const tbody = document.getElementById("todo-tbody");
  tbody.innerHTML = rows.length ? rows.map(t => {
    const ev = t.evenement_id ? findEvenement(t.evenement_id) : null;
    const cat = ev ? (ev.titre || "Évènement") : (t.categorie || "—");
    return `
    <tr>
      <td>${t.titre}</td>
      <td>${cat}</td>
      <td>${badge(t.priorite, t.priorite === "Urgente" ? "var(--danger)" : t.priorite === "Haute" ? "var(--warning)" : "var(--muted)")}</td>
      <td>${fmtDateFR(t.date_echeance)}</td>
      <td>${badge(t.statut, STATUT_COLORS[t.statut])}</td>
      <td class="row-actions">
        <button onclick="openTodoDialog(${t.id})">✎</button>
        <button onclick="confirmDelete('todos', ${t.id}, renderTodo)">🗑</button>
      </td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="6">Aucune tâche</td></tr>`;
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
      { key: "evenement_id", label: "Évènement lié", type: "select-raw", optionsHtml: `<option value="">— Aucun —</option>` + evenementOptionsHtml(row.evenement_id), value: row.evenement_id, numeric: true },
      { key: "categorie", label: "Catégorie (si pas d'évènement)", type: "text", value: row.categorie },
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
function devisOptionsHtml(selectedId) {
  return cache.devis.map(d => `<option value="${d.id}" ${d.id === selectedId ? "selected" : ""}>${d.numero || ("Devis #" + d.id)}</option>`).join("");
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
      { key: "source", label: "Source / provenance", type: "select", options: SOURCES_PROSPECT, value: row.source },
      { key: "type_evenement", label: "Type d'évènement", type: "select", options: TYPES_EVENEMENT, value: row.type_evenement },
      { key: "budget_estime", label: "Budget estimé (€)", type: "number", value: row.budget_estime },
      { key: "date_evenement_souhaite", label: "Date évènement souhaitée", type: "date", value: row.date_evenement_souhaite },
      { key: "date_rdv_prealable", label: "Date du RDV préalable", type: "date", value: row.date_rdv_prealable },
      { key: "prochaine_relance", label: "Prochaine relance", type: "date", value: row.prochaine_relance },
      { key: "devis_id", label: "Devis lié", type: "select-raw", optionsHtml: `<option value="">— Aucun —</option>` + devisOptionsHtml(row.devis_id), value: row.devis_id, numeric: true },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  DEVIS
// ========================================================================
function nextDevisNumero() {
  let max = 0;
  cache.devis.forEach(d => {
    const m = (d.numero || "").match(/\d+/g);
    if (m) { const n = parseInt(m[m.length - 1], 10); if (n > max) max = n; }
  });
  return "Devis " + String(max + 1).padStart(2, "0");
}

function renderDevis() {
  ensureFilterOptions("devis-filter-statut", STATUTS_DEVIS);
  const searchEl = document.getElementById("devis-search");
  if (!searchEl.dataset.bound) { searchEl.addEventListener("input", renderDevis); searchEl.dataset.bound = "1"; }
  const search = (searchEl.value || "").toLowerCase();
  const filter = document.getElementById("devis-filter-statut").value;

  let rows = [...cache.devis].sort((a, b) => {
    // signés d'abord, puis date de création décroissante
    if (!!b.signe !== !!a.signe) return b.signe ? 1 : -1;
    return (b.date_creation || "").localeCompare(a.date_creation || "");
  });
  if (filter) rows = rows.filter(d => d.statut === filter);
  if (search) rows = rows.filter(d => (contactLabel(findContact(d.contact_id)) + " " + (d.numero || "")).toLowerCase().includes(search));

  const tbody = document.getElementById("devis-tbody");
  tbody.innerHTML = rows.length ? rows.map(d => {
    const acompte = d.acompte ? (d.montant_acompte ? d.montant_acompte + " €" : "Oui") : "—";
    const pdfBtn = d.pdf_path ? `<button title="Voir le devis signé" onclick="downloadSignedDevis(${d.id})">📎</button>` : "";
    return `
    <tr>
      <td>${d.numero || "—"}${d.signe ? " ✅" : ""}</td>
      <td>${contactLabel(findContact(d.contact_id))}</td>
      <td>${d.type_evenement || "—"}</td>
      <td>${fmtDateFR(d.date_evenement)}</td>
      <td>${d.montant_ttc ? d.montant_ttc + " €" : "—"}</td>
      <td>${acompte}</td>
      <td>${badge(d.statut, STATUT_COLORS[d.statut])}</td>
      <td class="row-actions">
        <button title="Télécharger le PDF" onclick="generateDevisPDF(${d.id})">⬇</button>
        ${pdfBtn}
        <button onclick="openDevisDialog(${d.id})">✎</button>
        <button onclick="confirmDelete('devis', ${d.id}, renderDevis)">🗑</button>
      </td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="8">Aucun devis</td></tr>`;
}

function openDevisDialog(id) {
  const row = id ? cache.devis.find(d => d.id === id) : {};
  openModal({
    title: id ? "Modifier le devis" : "Nouveau devis",
    table: "devis",
    id: id,
    fields: [
      { key: "numero", label: "Numéro", type: "text", value: row.numero != null ? row.numero : nextDevisNumero() },
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "type_evenement", label: "Type d'évènement", type: "select", options: TYPES_EVENEMENT, value: row.type_evenement },
      { key: "date_evenement", label: "Date évènement", type: "date", value: row.date_evenement },
      { key: "nb_invites", label: "Nombre d'invités", type: "number", value: row.nb_invites },
      { key: "montant_ht", label: "Montant HT (€)", type: "number", value: row.montant_ht },
      { key: "tva", label: "TVA (%)", type: "select", options: TVA_RATES, value: row.tva != null ? row.tva : 20 },
      { key: "montant_ttc", label: "Montant TTC (€) — calculé", type: "computed", value: row.montant_ttc },
      { key: "acompte", label: "Acompte demandé ?", type: "checkbox", value: row.acompte },
      { key: "montant_acompte", label: "Montant acompte (€)", type: "number", value: row.montant_acompte },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_DEVIS, value: row.statut || "Brouillon" },
      { key: "signe", label: "Devis signé", type: "checkbox", value: row.signe },
      { key: "parent_devis_id", label: "Version précédente (si révision)", type: "select-raw", optionsHtml: `<option value="">— Aucune —</option>` + devisOptionsHtml(row.parent_devis_id), value: row.parent_devis_id, numeric: true },
      { key: "date_validite", label: "Date de validité", type: "date", value: row.date_validite },
      { key: "pdf_signe_file", label: "Joindre le devis signé (PDF)", type: "file", accept: "application/pdf" },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onRender: (form) => {
      const calc = () => {
        const ht = Number(form.elements["montant_ht"].value || 0);
        const tva = Number(form.elements["tva"].value || 0);
        form.elements["montant_ttc"].value = ht ? round2(ht * (1 + tva / 100)) : "";
      };
      form.elements["montant_ht"].addEventListener("input", calc);
      form.elements["tva"].addEventListener("change", calc);
      calc();
    },
    onSaved: refreshAll,
  });
}

async function downloadSignedDevis(id) {
  const d = findDevis(id);
  if (!d || !d.pdf_path) { showToast("Aucun PDF joint"); return; }
  const { data, error } = await sb.storage.from("devis-signes").createSignedUrl(d.pdf_path, 60);
  if (error) { showToast("PDF introuvable"); console.error(error); return; }
  window.open(data.signedUrl, "_blank");
}

function generateDevisPDF(id) {
  const d = findDevis(id);
  if (!d) return;
  if (!window.jspdf) { showToast("Générateur PDF indisponible (hors-ligne)"); return; }
  const c = findContact(d.contact_id);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const ht = Number(d.montant_ht || 0);
  const tva = Number(d.tva != null ? d.tva : 20);
  const mtva = round2(ht * tva / 100);
  const ttc = d.montant_ttc != null ? Number(d.montant_ttc) : round2(ht + mtva);

  doc.setFontSize(20); doc.text("DEVIS", 20, 22);
  doc.setFontSize(11);
  doc.text("N° : " + (d.numero || "—"), 20, 34);
  doc.text("Date : " + fmtDateFR(d.date_creation ? d.date_creation.slice(0, 10) : todayStr()), 20, 41);
  if (d.date_validite) doc.text("Valable jusqu'au : " + fmtDateFR(d.date_validite), 20, 48);

  doc.setFontSize(12); doc.text("Client", 20, 62);
  doc.setFontSize(11);
  let y = 69;
  const lines = [
    contactLabel(c),
    c && c.societe ? c.societe : "",
    c && c.email ? c.email : "",
    c && c.telephone ? c.telephone : "",
    c && c.adresse ? c.adresse : "",
  ].filter(Boolean);
  lines.forEach(l => { doc.text(l, 20, y); y += 7; });

  y += 6;
  doc.setFontSize(12); doc.text("Détail de la prestation", 20, y); y += 9;
  doc.setFontSize(11);
  const rows = [
    ["Type d'évènement", d.type_evenement || "—"],
    ["Date de l'évènement", fmtDateFR(d.date_evenement) || "—"],
    ["Nombre d'invités", d.nb_invites != null ? String(d.nb_invites) : "—"],
    ["Montant HT", ht ? ht.toFixed(2) + " €" : "—"],
    ["TVA (" + tva + "%)", mtva.toFixed(2) + " €"],
    ["Montant TTC", ttc.toFixed(2) + " €"],
  ];
  if (d.acompte) rows.push(["Acompte demandé", (d.montant_acompte ? Number(d.montant_acompte).toFixed(2) + " €" : "Oui")]);
  rows.forEach(([k, v]) => {
    doc.text(k, 20, y); doc.text(v, 130, y); y += 7;
  });

  y += 6;
  doc.setFontSize(13);
  doc.text("TOTAL TTC : " + ttc.toFixed(2) + " €", 20, y);
  if (d.notes) { y += 12; doc.setFontSize(10); doc.text(doc.splitTextToSize("Notes : " + d.notes, 170), 20, y); }

  doc.save((d.numero || "devis").replace(/\s+/g, "_") + ".pdf");
}

// ========================================================================
//  GRILLE TARIFAIRE
// ========================================================================
function renderGrille() {
  const searchEl = document.getElementById("grille-search");
  if (!searchEl.dataset.bound) { searchEl.addEventListener("input", renderGrille); searchEl.dataset.bound = "1"; }
  const search = (searchEl.value || "").toLowerCase();
  let rows = [...cache.grille_tarifaire];
  if (search) rows = rows.filter(g => ((g.nom_presta || "") + " " + (g.details || "")).toLowerCase().includes(search));

  const tbody = document.getElementById("grille-tbody");
  tbody.innerHTML = rows.length ? rows.map(g => `
    <tr>
      <td>${g.nom_presta || "—"}</td>
      <td>${g.details || "—"}</td>
      <td>${g.pu_ht != null ? g.pu_ht + " €" : "—"}</td>
      <td>${g.tva != null ? g.tva + " %" : "—"}</td>
      <td>${g.montant_tva != null ? g.montant_tva + " €" : "—"}</td>
      <td><strong>${g.pu_ttc != null ? g.pu_ttc + " €" : "—"}</strong></td>
      <td class="row-actions">
        <button onclick="openGrilleDialog(${g.id})">✎</button>
        <button onclick="confirmDelete('grille_tarifaire', ${g.id}, renderGrille)">🗑</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="7">Aucune prestation — ajoute ta première ligne</td></tr>`;
}

function openGrilleDialog(id) {
  const row = id ? cache.grille_tarifaire.find(g => g.id === id) : {};
  openModal({
    title: id ? "Modifier la prestation" : "Nouvelle prestation",
    table: "grille_tarifaire",
    id: id,
    fields: [
      { key: "nom_presta", label: "Nom de la prestation", type: "text", required: true, value: row.nom_presta },
      { key: "details", label: "Détails", type: "textarea", value: row.details },
      { key: "pu_ht", label: "PU HT (€)", type: "number", value: row.pu_ht },
      { key: "tva", label: "TVA (%)", type: "select", options: TVA_RATES, value: row.tva != null ? row.tva : 20 },
      { key: "montant_tva", label: "Montant TVA (€) — calculé", type: "computed", value: row.montant_tva },
      { key: "pu_ttc", label: "PU TTC (€) — calculé", type: "computed", value: row.pu_ttc },
    ],
    onRender: (form) => {
      const calc = () => {
        const ht = Number(form.elements["pu_ht"].value || 0);
        const tva = Number(form.elements["tva"].value || 0);
        const mtva = round2(ht * tva / 100);
        form.elements["montant_tva"].value = ht ? mtva : "";
        form.elements["pu_ttc"].value = ht ? round2(ht + mtva) : "";
      };
      form.elements["pu_ht"].addEventListener("input", calc);
      form.elements["tva"].addEventListener("change", calc);
      calc();
    },
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
    rows = rows.filter(c => (contactLabel(c) + " " + (c.societe || "") + " " + (c.email || "") + " " + (c.categorie || "")).toLowerCase().includes(search));
  }
  const tbody = document.getElementById("contact-tbody");
  tbody.innerHTML = rows.length ? rows.map(c => `
    <tr>
      <td>${contactLabel(c)}</td>
      <td>${c.societe || "—"}${c.poste ? " · " + c.poste : ""}</td>
      <td>${c.email || "—"}</td>
      <td>${c.telephone || "—"}</td>
      <td>${badge(c.categorie, STATUT_COLORS[c.categorie]) || (c.type_evenement_interet || "—")}</td>
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
      { key: "societe", label: "Société / entreprise", type: "text", value: row.societe },
      { key: "poste", label: "Poste (si entreprise)", type: "text", value: row.poste },
      { key: "categorie", label: "Catégorie", type: "select", options: CATEGORIES_CONTACT, value: row.categorie || "Client" },
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
  ensureFilterOptions("evenement-filter-type", TYPES_EVENEMENT);
  ensureFilterOptions("evenement-filter-statut", STATUTS_EVENEMENT);
  ensureFilterOptions("evenement-filter-mois", MOIS_FR.map((m, i) => ({ value: String(i + 1).padStart(2, "0"), label: m })));

  const fType = document.getElementById("evenement-filter-type").value;
  const fMois = document.getElementById("evenement-filter-mois").value;
  const fStatut = document.getElementById("evenement-filter-statut").value;

  let rows = [...cache.evenements].sort((a, b) => (a.date_evenement || "9999").localeCompare(b.date_evenement || "9999"));
  if (fType) rows = rows.filter(e => e.type_evenement === fType);
  if (fStatut) rows = rows.filter(e => e.statut === fStatut);
  if (fMois) rows = rows.filter(e => (e.date_evenement || "").slice(5, 7) === fMois);

  const tbody = document.getElementById("evenement-tbody");
  tbody.innerHTML = rows.length ? rows.map(e => {
    const dateTxt = fmtDateFR(e.date_evenement) + (e.date_fin && e.date_fin !== e.date_evenement ? " → " + fmtDateFR(e.date_fin) : "");
    return `
    <tr>
      <td>${e.titre || "—"}</td>
      <td>${e.type_evenement || "—"}</td>
      <td>${dateTxt || "—"}</td>
      <td>${e.nb_invites ?? "—"}</td>
      <td>${e.formule || "—"}</td>
      <td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
      <td class="row-actions">
        <button onclick="openEvenementDialog(${e.id})">✎</button>
        <button onclick="confirmDelete('evenements', ${e.id}, renderEvenements)">🗑</button>
      </td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="7">Aucun évènement</td></tr>`;
}

function openEvenementDialog(id, defaultDate) {
  const row = id ? cache.evenements.find(e => e.id === id) : {};
  openModal({
    title: id ? "Modifier l'évènement" : "Nouvel évènement",
    table: "evenements",
    id: id,
    fields: [
      { key: "titre", label: "Titre (auto : date + client si vide)", type: "text", value: row.titre },
      { key: "contact_id", label: "Client / contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "devis_id", label: "Devis lié", type: "select-raw", optionsHtml: `<option value="">—</option>` + devisOptionsHtml(row.devis_id), value: row.devis_id, numeric: true },
      { key: "type_evenement", label: "Type d'évènement", type: "select", options: TYPES_EVENEMENT, value: row.type_evenement },
      { key: "formule", label: "Formule", type: "select", options: FORMULES, value: row.formule },
      { key: "date_evenement", label: "Date (début)", type: "date", value: row.date_evenement || defaultDate },
      { key: "date_fin", label: "Date de fin (si plusieurs jours)", type: "date", value: row.date_fin },
      { key: "nb_adultes", label: "Nombre d'adultes", type: "number", value: row.nb_adultes },
      { key: "nb_enfants", label: "Nombre d'enfants", type: "number", value: row.nb_enfants },
      { key: "nb_invites", label: "Total invités — calculé", type: "computed", value: row.nb_invites },
      { key: "budget", label: "Budget (€)", type: "number", value: row.budget },
      { key: "provenance", label: "Provenance client", type: "select", options: SOURCES_PROSPECT, value: row.provenance },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_EVENEMENT, value: row.statut || "Option" },
      { key: "prochain_rdv", label: "Prochain RDV", type: "date", value: row.prochain_rdv },
      { key: "relance", label: "Relance", type: "date", value: row.relance },
      { key: "notes", label: "Description / notes", type: "textarea", value: row.notes },
    ],
    onRender: (form) => {
      const calc = () => {
        const a = Number(form.elements["nb_adultes"].value || 0);
        const e = Number(form.elements["nb_enfants"].value || 0);
        form.elements["nb_invites"].value = (a || e) ? (a + e) : "";
      };
      form.elements["nb_adultes"].addEventListener("input", calc);
      form.elements["nb_enfants"].addEventListener("input", calc);
      calc();
    },
    beforeSave: (v) => {
      if (!v.titre) {
        const c = findContact(v.contact_id);
        v.titre = [fmtDateFR(v.date_evenement), contactLabel(c)].filter(x => x && x !== "—").join(" – ") || "Évènement";
      }
    },
    onSaved: refreshAll,
  });
}

// ========================================================================
//  RDV
// ========================================================================
function renderRdv() {
  ensureFilterOptions("rdv-filter-statut", STATUTS_RDV);
  const filter = document.getElementById("rdv-filter-statut").value;
  let rows = [...cache.rdv].sort((a, b) => ((a.date_rdv || "9999") + (a.heure || "")).localeCompare((b.date_rdv || "9999") + (b.heure || "")));
  if (filter) rows = rows.filter(r => r.statut === filter);

  const tbody = document.getElementById("rdv-tbody");
  tbody.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${fmtDateFR(r.date_rdv)}</td>
      <td>${r.heure || "—"}</td>
      <td>${r.objet || "—"}</td>
      <td>${contactLabel(findContact(r.contact_id))}</td>
      <td>${badge(r.statut, STATUT_COLORS[r.statut])}</td>
      <td class="row-actions">
        <button onclick="openRdvDialog(${r.id})">✎</button>
        <button onclick="confirmDelete('rdv', ${r.id}, renderRdv)">🗑</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="6">Aucun rendez-vous</td></tr>`;
}

function openRdvDialog(id) {
  const row = id ? cache.rdv.find(r => r.id === id) : {};
  openModal({
    title: id ? "Modifier le RDV" : "Nouveau RDV",
    table: "rdv",
    id: id,
    fields: [
      { key: "objet", label: "Objet", type: "text", required: true, value: row.objet },
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "date_rdv", label: "Date", type: "date", value: row.date_rdv },
      { key: "heure", label: "Heure", type: "time", value: row.heure },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_RDV, value: row.statut || "Prévu" },
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
  const addDay = (day, e) => { (eventsByDay[day] = eventsByDay[day] || []).push(e); };
  cache.evenements.forEach(e => {
    if (!e.date_evenement) return;
    const start = e.date_evenement;
    const end = e.date_fin && e.date_fin >= start ? e.date_fin : start;
    // parcourt chaque jour de la plage qui tombe dans le mois affiché
    let cur = new Date(start + "T00:00:00");
    const last = new Date(end + "T00:00:00");
    let guard = 0;
    while (cur <= last && guard < 366) {
      if (cur.getFullYear() === year && (cur.getMonth() + 1) === month) addDay(cur.getDate(), e);
      cur.setDate(cur.getDate() + 1);
      guard++;
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
  const sel = calState.selected;
  const rows = cache.evenements.filter(e => {
    if (!e.date_evenement) return false;
    const end = e.date_fin && e.date_fin >= e.date_evenement ? e.date_fin : e.date_evenement;
    return sel >= e.date_evenement && sel <= end;
  }).sort((a, b) => (a.heure_debut || "").localeCompare(b.heure_debut || ""));
  tbody.innerHTML = rows.length ? rows.map(e => `
    <tr onclick="openEvenementDialog(${e.id})" style="cursor:pointer;">
      <td>${e.heure_debut || "—"}</td><td>${e.titre}</td><td>${e.type_evenement || ""}</td><td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="4">Aucun évènement — clique pour en ajouter un</td></tr>`;
}

// ========================================================================
//  MODAL GENERIQUE
// ========================================================================
function escapeAttr(v) { return String(v).replace(/"/g, "&quot;"); }

function openModal({ title, table, id, fields, onSaved, onRender, beforeSave }) {
  modalContext = { table, id, fields, onSaved, onRender, beforeSave };
  document.getElementById("modal-title").textContent = title;
  const form = document.getElementById("modal-form");
  form.innerHTML = fields.map(f => {
    let input;
    if (f.type === "select") {
      input = `<select name="${f.key}">${(f.options || []).map(o => `<option value="${o}" ${String(o) === String(f.value) ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    } else if (f.type === "select-raw") {
      input = `<select name="${f.key}">${f.optionsHtml}</select>`;
    } else if (f.type === "textarea") {
      input = `<textarea name="${f.key}">${f.value || ""}</textarea>`;
    } else if (f.type === "checkbox") {
      input = `<input type="checkbox" name="${f.key}" ${f.value ? "checked" : ""} style="width:auto;">`;
    } else if (f.type === "file") {
      input = `<input type="file" name="${f.key}" accept="${f.accept || "*"}">`;
    } else if (f.type === "computed") {
      input = `<input type="number" name="${f.key}" value="${f.value != null ? escapeAttr(f.value) : ""}" readonly style="background:#F3F2EE;color:var(--muted);">`;
    } else {
      input = `<input type="${f.type}" name="${f.key}" value="${f.value != null ? escapeAttr(f.value) : ""}" ${f.required ? "required" : ""}>`;
    }
    return `<div class="field"><label>${f.label}${f.required ? " *" : ""}</label>${input}</div>`;
  }).join("");
  document.getElementById("modal-delete").style.display = id ? "inline-block" : "none";
  document.getElementById("modal-overlay").classList.add("open");
  if (onRender) onRender(form);
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  modalContext = null;
}

async function saveModal() {
  if (!modalContext) return;
  const { table, id, fields, onSaved, beforeSave } = modalContext;
  const form = document.getElementById("modal-form");
  const values = {};
  const fileFields = [];
  let missingRequired = false;
  fields.forEach(f => {
    const el = form.elements[f.key];
    if (!el) return;
    if (f.type === "file") { fileFields.push({ f, el }); return; }
    if (f.type === "checkbox") { values[f.key] = el.checked; return; }
    let val = el.value;
    if (f.required && !val) missingRequired = true;
    if (val === "") val = null;
    if (val !== null && (f.type === "number" || f.type === "computed" || f.numeric)) val = Number(val);
    values[f.key] = val;
  });
  if (missingRequired) { showToast("Merci de remplir les champs obligatoires"); return; }
  if (beforeSave) beforeSave(values);

  let saved;
  if (id) {
    saved = await updateRow(table, id, values);
  } else {
    saved = await insertRow(table, values);
  }

  // Upload des fichiers joints (ex : devis signé)
  if (saved) {
    for (const { f, el } of fileFields) {
      if (el.files && el.files[0]) {
        const path = `${currentUser.id}/${table}-${saved.id}.pdf`;
        const { error } = await sb.storage.from("devis-signes").upload(path, el.files[0], { upsert: true, contentType: "application/pdf" });
        if (error) { showToast("Erreur envoi PDF"); console.error(error); }
        else { await updateRow(table, saved.id, { pdf_path: path }); }
      }
    }
  }

  showToast(id ? "Modifications enregistrées" : "Ajouté avec succès");
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

  // Raccourcis (toolbar)
  document.getElementById("sc-devis").addEventListener("click", () => openDevisDialog(null));
  document.getElementById("sc-contact").addEventListener("click", () => openContactDialog(null));
  document.getElementById("sc-evenement").addEventListener("click", () => openEvenementDialog(null));
  document.getElementById("sc-rdv").addEventListener("click", () => openRdvDialog(null));
  document.getElementById("sc-todo").addEventListener("click", () => openTodoDialog(null));

  // Boutons "+" de page
  document.getElementById("btn-new-todo").addEventListener("click", () => openTodoDialog(null));
  document.getElementById("btn-new-prospect").addEventListener("click", () => openProspectDialog(null));
  document.getElementById("btn-new-devis").addEventListener("click", () => openDevisDialog(null));
  document.getElementById("btn-new-grille").addEventListener("click", () => openGrilleDialog(null));
  document.getElementById("btn-new-contact").addEventListener("click", () => openContactDialog(null));
  document.getElementById("btn-new-evenement").addEventListener("click", () => openEvenementDialog(null));
  document.getElementById("btn-new-rdv").addEventListener("click", () => openRdvDialog(null));

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

  // Clavier
  document.addEventListener("keydown", e => {
    if (!currentUser) return;
    if (e.ctrlKey && e.key === "d") { e.preventDefault(); openDevisDialog(null); }
    if (e.ctrlKey && e.key === "k") { e.preventDefault(); openContactDialog(null); }
    if (e.ctrlKey && e.key === "e") { e.preventDefault(); openEvenementDialog(null); }
    if (e.ctrlKey && e.key === "t") { e.preventDefault(); openTodoDialog(null); }
    if (e.ctrlKey && e.key === "r") { e.preventDefault(); openRdvDialog(null); }
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
