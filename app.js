// ========================================================================
//  GESTION RECEPTION — PWA
//  Backend : Supabase (auth + base de données, synchronisé multi-appareils)
// ========================================================================

// ---- 1) CONFIGURATION ----
const SUPABASE_URL = "https://fmstfqzmahhidvyespwk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtc3RmcXptYWhoaWR2eWVzcHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODg4OTEsImV4cCI6MjEwMDQ2NDg5MX0.ObX6Xpg_ugP70d8Jf6WJNhsXezXUS8j7qIAo6ZQIqg4";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 2) CONSTANTES ----
const TYPES_EVENEMENT = ["Mariage", "Anniversaire", "Baptême", "Séminaire"];
const STATUTS_PROSPECT = ["Nouveau", "Contacté", "Qualifié", "Devis envoyé", "Converti", "Perdu"];
const STATUTS_DEVIS = ["En attente", "Envoyé", "Accepté", "Refusé", "Expiré"];
const STATUTS_FACTURE = ["Brouillon", "Envoyée", "Payée", "Partiellement payée", "En retard", "Annulée"];
const STATUTS_EVENEMENT = ["Premier contact", "Option", "Confirmé", "Passé", "Annulé"];
const STATUTS_TODO = ["À faire", "En cours", "Terminé"];
const STATUTS_RDV = ["Prévu", "Confirmé", "Effectué", "Annulé"];
const STATUTS_COMMANDE = ["À commander", "Commandé", "Reçu"];
const PRIORITES = ["Basse", "Normale", "Haute", "Urgente"];
const SOURCES_PROSPECT = ["Site web", "Téléphone", "Bouche à oreille", "Réseaux sociaux", "Salon", "Recommandation", "Autre"];
const CATEGORIES_CONTACT = ["Client", "Prospect", "Fournisseur", "Prestataire", "Autre"];
const PROVENANCES = ["mariage.net", "sms", "mail", "site internet", "1001salles", "contact direct"];
const TYPES_PRESTATION = ["Location", "Clés en main prestataires", "Clés en main nous"];
const FORMULES = ["Clef en main", "Location salle"];
const TVA_RATES = [0, 5.5, 8, 10, 20];
const SAISONS = ["Toute l'année", "Haute saison", "Basse saison"];
const TVA_DEVIS = [10, 20];
const CGV_OPTIONS = [
  "Paiement du solde à la date de l'événement.",
  "30% d'acompte à la réservation.",
  "30% : 1 mois avant la date de l'événement.",
  "Paiement du solde à réception de la facture qui sera envoyée 7 jours avant la date de l'événement.",
];

const EMETTEUR = {
  nom: "SAS CLF",
  adresse: "5580 route de Grisolles, 31620 Fronton",
  siret: "SIRET 944 891 332 00016",
  email: "espacereceptioncblf@gmail.com",
  telephone: "07 43 01 54 64",
};

const STATUT_COLORS = {
  "Nouveau": "var(--info)", "Contacté": "var(--warning)", "Qualifié": "var(--accent)",
  "Devis envoyé": "var(--warning)", "Converti": "var(--success)", "Perdu": "var(--danger)",
  "En attente": "var(--muted)", "Envoyé": "var(--warning)", "Accepté": "var(--success)",
  "Refusé": "var(--danger)", "Expiré": "var(--danger)",
  "Premier contact": "var(--info)", "Option": "var(--warning)", "Confirmé": "var(--success)",
  "Terminé": "var(--muted)", "Passé": "var(--muted)", "Annulé": "var(--danger)",
  "À faire": "var(--info)", "En cours": "var(--warning)",
  "Prévu": "var(--info)", "Effectué": "var(--success)",
  "Client": "var(--success)", "Prospect": "var(--info)", "Prestataire": "var(--accent)",
  "Fournisseur": "var(--warning)", "Autre": "var(--muted)",
  "Envoyée": "var(--warning)", "Payée": "var(--success)", "Partiellement payée": "var(--info)",
  "En retard": "var(--danger)", "Annulée": "var(--danger)",
  "À commander": "var(--warning)", "Commandé": "var(--info)", "Reçu": "var(--success)",
  "Basse": "var(--muted)", "Normale": "var(--muted)", "Haute": "var(--warning)", "Urgente": "var(--danger)",
};

// ---- 3) ETAT LOCAL ----
let currentUser = null;
let cache = { contacts: [], prospects: [], devis: [], evenements: [], todos: [], grille_tarifaire: [], rdv: [], factures: [], commandes: [] };
let currentPage = "dashboard";
let modalContext = null;
let calState = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, selected: null, view: "month" };
let edState = { id: null, lignes: [] };

// ---- 4) HELPERS ----
function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowStr() { const d = new Date(); return d.toISOString().slice(0, 16).replace("T", " "); }
function fmtDateFR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function fmtMoisFR(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${MOIS_FR[Number(m) - 1]} ${y}`;
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function addDaysISO(iso, days) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonthsISO(iso, months) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00"); d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function daysUntil(iso) {
  if (!iso) return Infinity;
  const a = new Date(iso + "T00:00:00"), b = new Date(todayStr() + "T00:00:00");
  return Math.round((a - b) / 86400000);
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
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
function findFacture(id) { return cache.factures.find(f => f.id === id); }
function findGrille(id) { return cache.grille_tarifaire.find(g => g.id === id); }

// Résolution des infos d'un devis via l'évènement lié
function devisEvent(d) { return d && d.evenement_id ? findEvenement(d.evenement_id) : null; }
function devisContact(d) {
  const e = devisEvent(d);
  const cid = (e && e.contact_id) || (d && d.contact_id);
  return findContact(cid);
}
function devisDateEvt(d) { const e = devisEvent(d); return (e && e.date_evenement) || (d && d.date_evenement) || null; }
function devisNbInvites(d) { const e = devisEvent(d); return (e && e.nb_invites != null) ? e.nb_invites : (d && d.nb_invites); }
function seasonForDate(iso) {
  if (!iso) return null;
  const m = Number(iso.slice(5, 7));
  return (m >= 4 && m <= 9) ? "Haute saison" : "Basse saison";
}

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
  if (error) { showToast("Échec enregistrement : " + (error.message || error.hint || "erreur inconnue")); console.error(error); return null; }
  return data;
}
async function updateRow(table, id, values) {
  const { data, error } = await sb.from(table).update(values).eq("id", id).select().single();
  if (error) { showToast("Échec mise à jour : " + (error.message || error.hint || "erreur inconnue")); console.error(error); return null; }
  return data;
}
async function deleteRow(table, id) {
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) { showToast("Erreur suppression"); console.error(error); return false; }
  return true;
}
async function refreshCache() {
  const [contacts, prospects, devisRows, evenements, todos, grille, rdv, factures, commandes] = await Promise.all([
    fetchAll("contacts", "nom", true),
    fetchAll("prospects"),
    fetchAll("devis"),
    fetchAll("evenements"),
    fetchAll("todos"),
    fetchAll("grille_tarifaire", "nom_presta", true),
    fetchAll("rdv"),
    fetchAll("factures"),
    fetchAll("commandes", "article", true),
  ]);
  cache = { contacts, prospects, devis: devisRows, evenements, todos, grille_tarifaire: grille, rdv, factures, commandes };
}

// ========================================================================
//  AUTHENTIFICATION
// ========================================================================
let authMode = "login";
function setAuthMode(mode) {
  authMode = mode;
  const t = document.getElementById("auth-title"), s = document.getElementById("auth-sub");
  const sub = document.getElementById("auth-submit"), st = document.getElementById("auth-switch-text"), sl = document.getElementById("auth-switch-link");
  document.getElementById("auth-error").style.display = "none";
  if (mode === "login") { t.textContent = "Connexion"; s.textContent = "Gestion Réception — accède à ton compte"; sub.textContent = "Se connecter"; st.textContent = "Pas encore de compte ?"; sl.textContent = "Créer un compte"; }
  else { t.textContent = "Créer un compte"; s.textContent = "Gestion Réception — synchronise tes données"; sub.textContent = "Créer mon compte"; st.textContent = "Déjà un compte ?"; sl.textContent = "Se connecter"; }
}
function authError(msg) { const el = document.getElementById("auth-error"); el.textContent = msg; el.style.display = "block"; }
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
    if (data.user && !data.session) { authError("Compte créé — vérifie ta boîte mail pour confirmer, puis connecte-toi."); setAuthMode("login"); }
    else if (data.user) onLoggedIn(data.user);
  }
}
async function onLoggedIn(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById("user-email-lbl").textContent = user.email;
  await refreshCache();
  await autoExpireDevis();
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
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === key));
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === "page-" + key));
  renderPage(key);
  closeMobileMenu();
}
function openMobileMenu() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("open");
}
function closeMobileMenu() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}
function renderPage(key) {
  if (key === "dashboard") renderDashboard();
  else if (key === "todo") { renderTodo(); renderRdv(); }
  else if (key === "prospects") renderSuivi();
  else if (key === "contacts") renderContacts();
  else if (key === "devis") renderDevis();
  else if (key === "factures") renderFactures();
  else if (key === "evenements") renderEvenements();
  else if (key === "calendrier") renderCalendrier();
  else if (key === "tarification") renderGrille();
  else if (key === "commande") renderCommande();
}
async function refreshAll() { await refreshCache(); renderPage(currentPage); }
function goToFilter(page, selectId, value) {
  showPage(page);
  const sel = document.getElementById(selectId);
  if (sel) { sel.value = value; renderPage(page); }
}

// ========================================================================
//  DASHBOARD
// ========================================================================
function effectivePriorite(t) {
  if (t.statut !== "Terminé" && t.date_echeance && daysUntil(t.date_echeance) <= 7) return "Urgente";
  return t.priorite || "Normale";
}
function todoLieALabel(t) {
  if (t.evenement_id) { const e = findEvenement(t.evenement_id); return e ? "🎉 " + (eventLabel(e)) : "—"; }
  if (t.contact_id) { const c = findContact(t.contact_id); return c ? "👤 " + contactLabel(c) : "—"; }
  if (t.commande_id) { const c = findCommande(t.commande_id); return c ? "📦 " + (c.article || ("Commande #" + c.id)) : "—"; }
  return t.categorie || "—";
}
function eventDateLabel(e) {
  if (e.date_flexible) return fmtMoisFR(e.mois_seul);
  if (e.date_fin && e.date_fin !== e.date_evenement) return fmtDateFR(e.date_evenement) + " → " + fmtDateFR(e.date_fin);
  return fmtDateFR(e.date_evenement);
}
function eventLabel(e) {
  const c = findContact(e.contact_id);
  const d = eventDateLabel(e);
  return [d, contactLabel(c)].filter(x => x && x !== "—").join(" · ") || (e.type_evenement || "Évènement");
}

function renderDashboard() {
  const today = todayStr();
  const prospectsActifs = cache.contacts.filter(c => c.categorie === "Prospect").length;
  const devisEnAttente = cache.devis.filter(d => d.statut === "En attente").length;
  const facturesImpayees = cache.factures.filter(f => ["Envoyée", "En retard", "Partiellement payée"].includes(f.statut)).length;
  const rdvAvenir = cache.rdv.filter(r => (r.date_rdv || "") >= today && r.statut !== "Annulé").length;
  const evenementsAvenir = cache.evenements.filter(e => (e.date_evenement || "") >= today).length;
  const todosOuvertes = cache.todos.filter(t => t.statut !== "Terminé").length;

  const cards = [
    ["🎯", prospectsActifs, "Prospects actifs", () => goToFilter("contacts", "contact-filter-categorie", "Prospect")],
    ["📄", devisEnAttente, "Devis en attente", () => goToFilter("devis", "devis-filter-statut", "En attente")],
    ["🧾", facturesImpayees, "Factures impayées", () => goToFilter("factures", "facture-filter-statut", "Envoyée")],
    ["🤝", rdvAvenir, "RDV à venir", () => showPage("todo")],
    ["🎉", evenementsAvenir, "Évènements à venir", () => showPage("evenements")],
    ["✅", todosOuvertes, "Tâches en cours", () => showPage("todo")],
  ];
  const wrap = document.getElementById("dash-cards");
  wrap.innerHTML = cards.map((c, i) => `
    <div class="stat-card clickable" data-i="${i}">
      <div style="font-size:20px;">${c[0]}</div>
      <div class="num">${c[1]}</div>
      <div class="label">${c[2]}</div>
    </div>`).join("");
  wrap.querySelectorAll(".stat-card").forEach(el => el.addEventListener("click", () => cards[Number(el.dataset.i)][3]()));

  // Aperçu des tâches (échéance du jour en rouge)
  const todos = cache.todos.filter(t => t.statut !== "Terminé")
    .sort((a, b) => (a.date_echeance || "9999").localeCompare(b.date_echeance || "9999")).slice(0, 8);
  document.getElementById("dash-todos").innerHTML = todos.length ? todos.map(t => {
    const p = effectivePriorite(t);
    const echClass = t.date_echeance && daysUntil(t.date_echeance) <= 0 ? "due-today" : "";
    return `<tr onclick="openTodoDialog(${t.id})" style="cursor:pointer;">
      <td>${t.titre}</td><td>${todoLieALabel(t)}</td>
      <td>${badge(p, STATUT_COLORS[p])}</td>
      <td class="${echClass}">${fmtDateFR(t.date_echeance) || "—"}</td>
      <td>${badge(t.statut, STATUT_COLORS[t.statut])}</td></tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="5">Aucune tâche en cours</td></tr>`;

  // À venir : RDV + évènements + tâches datées, triés par date
  const items = [];
  cache.rdv.filter(r => (r.date_rdv || "") >= today && r.statut !== "Annulé")
    .forEach(r => items.push({ date: r.date_rdv, type: "RDV", detail: (r.heure ? r.heure + " · " : "") + (r.objet || "") + " — " + contactLabel(findContact(r.contact_id)), statut: r.statut, fn: `openRdvDialog(${r.id})` }));
  cache.evenements.filter(e => (e.date_evenement || "") >= today)
    .forEach(e => items.push({ date: e.date_evenement, type: "Évènement", detail: eventLabel(e), statut: e.statut, fn: `openEvenementDialog(${e.id})` }));
  cache.todos.filter(t => t.statut !== "Terminé" && t.date_echeance && t.date_echeance >= today)
    .forEach(t => items.push({ date: t.date_echeance, type: "Tâche", detail: t.titre, statut: effectivePriorite(t), fn: `openTodoDialog(${t.id})` }));
  items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const top = items.slice(0, 12);
  document.getElementById("dash-dates").innerHTML = top.length ? top.map(it => {
    const cls = daysUntil(it.date) <= 0 ? "due-today" : "";
    return `<tr onclick="${it.fn}" style="cursor:pointer;">
      <td class="${cls}">${fmtDateFR(it.date)}</td><td>${it.type}</td><td>${it.detail}</td>
      <td>${badge(it.statut, STATUT_COLORS[it.statut])}</td></tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="4">Rien à venir</td></tr>`;
}

// ========================================================================
//  FILTRES
// ========================================================================
function ensureFilterOptions(selectId, options) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.dataset.filled) return;
  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.value !== undefined ? o.value : o;
    opt.textContent = o.label !== undefined ? o.label : o;
    sel.appendChild(opt);
  });
  sel.dataset.filled = "1";
  sel.addEventListener("change", () => renderPage(currentPage));
}
function bindSearch(id, fn) {
  const el = document.getElementById(id);
  if (el && !el.dataset.bound) { el.addEventListener("input", fn); el.dataset.bound = "1"; }
}

// ========================================================================
//  TODO
// ========================================================================
function contactOptionsHtml(selectedId) {
  return cache.contacts.map(c => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${contactLabel(c)}</option>`).join("");
}
function devisOptionsHtml(selectedId) {
  return cache.devis.map(d => `<option value="${d.id}" ${d.id === selectedId ? "selected" : ""}>${d.numero || ("Devis #" + d.id)}</option>`).join("");
}
function evenementOptionsHtml(selectedId) {
  return cache.evenements.map(e => `<option value="${e.id}" ${e.id === selectedId ? "selected" : ""}>${eventLabel(e)}</option>`).join("");
}
function factureOptionsHtml(selectedId) {
  return cache.factures.map(f => `<option value="${f.id}" ${f.id === selectedId ? "selected" : ""}>${f.numero || ("Facture #" + f.id)}</option>`).join("");
}
function findCommande(id) { return cache.commandes.find(c => c.id === id); }
function commandeOptionsHtml(selectedId) {
  return cache.commandes.map(c => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.article || ("Commande #" + c.id)}</option>`).join("");
}

function renderTodo() {
  ensureFilterOptions("todo-filter-statut", STATUTS_TODO);
  ensureFilterOptions("todo-filter-priorite", PRIORITES);
  const sortSel = document.getElementById("todo-sort");
  if (!sortSel.dataset.bound) { sortSel.addEventListener("change", renderTodo); sortSel.dataset.bound = "1"; }
  const fStatut = document.getElementById("todo-filter-statut").value;
  const fPrio = document.getElementById("todo-filter-priorite").value;
  const sort = sortSel.value;

  let rows = [...cache.todos];
  if (fStatut) rows = rows.filter(t => t.statut === fStatut);
  if (fPrio) rows = rows.filter(t => effectivePriorite(t) === fPrio);
  const prioRank = { "Urgente": 0, "Haute": 1, "Normale": 2, "Basse": 3 };
  const statutRank = { "À faire": 0, "En cours": 1, "Terminé": 2 };
  rows.sort((a, b) => {
    if (sort === "priorite") return prioRank[effectivePriorite(a)] - prioRank[effectivePriorite(b)];
    if (sort === "statut") return (statutRank[a.statut] ?? 9) - (statutRank[b.statut] ?? 9);
    return (a.date_echeance || "9999").localeCompare(b.date_echeance || "9999");
  });

  const tbody = document.getElementById("todo-tbody");
  tbody.innerHTML = rows.length ? rows.map(t => {
    const p = effectivePriorite(t);
    const echClass = t.date_echeance && daysUntil(t.date_echeance) <= 0 && t.statut !== "Terminé" ? "due-today" : "";
    return `<tr>
      <td>${t.titre}</td>
      <td>${todoLieALabel(t)}</td>
      <td>${badge(p, STATUT_COLORS[p])}</td>
      <td class="${echClass}">${fmtDateFR(t.date_echeance) || "—"}</td>
      <td>${badge(t.statut, STATUT_COLORS[t.statut])}</td>
      <td class="row-actions">
        <button onclick="openTodoDialog(${t.id})">✎</button>
        <button onclick="confirmDelete('todos', ${t.id}, renderTodo)">🗑</button>
      </td></tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="6">Aucune tâche</td></tr>`;

  const done = [...cache.todos].filter(t => t.statut === "Terminé")
    .sort((a, b) => (b.date_echeance || "").localeCompare(a.date_echeance || ""));
  const doneTbody = document.getElementById("todo-done-tbody");
  doneTbody.innerHTML = done.length ? done.map(t => `<tr>
      <td>${t.titre}</td>
      <td>${todoLieALabel(t)}</td>
      <td>${badge(effectivePriorite(t), STATUT_COLORS[effectivePriorite(t)])}</td>
      <td>${fmtDateFR(t.date_echeance) || "—"}</td>
      <td class="row-actions">
        <button onclick="openTodoDialog(${t.id})">✎</button>
        <button onclick="confirmDelete('todos', ${t.id}, renderTodo)">🗑</button>
      </td></tr>`).join("") : `<tr class="empty-row"><td colspan="5">Aucune tâche terminée</td></tr>`;
}

function openTodoDialog(id) {
  const row = id ? cache.todos.find(t => t.id === id) : {};
  openModal({
    title: id ? "Modifier la tâche" : "Nouvelle tâche",
    table: "todos", id,
    fields: [
      { key: "titre", label: "Titre", type: "text", required: true, value: row.titre },
      { key: "description", label: "Description", type: "textarea", value: row.description },
      { key: "evenement_id", label: "Lié à un évènement", type: "select-raw", optionsHtml: `<option value="">— Aucun —</option>` + evenementOptionsHtml(row.evenement_id), value: row.evenement_id, numeric: true },
      { key: "contact_id", label: "Ou lié à un contact", type: "select-raw", optionsHtml: `<option value="">— Aucun —</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "commande_id", label: "Ou lié à une commande", type: "select-raw", optionsHtml: `<option value="">— Aucun —</option>` + commandeOptionsHtml(row.commande_id), value: row.commande_id, numeric: true },
      { key: "priorite", label: "Priorité", type: "select", options: PRIORITES, value: row.priorite || "Normale" },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_TODO, value: row.statut || "À faire" },
      { key: "date_echeance", label: "Échéance", type: "date", value: row.date_echeance },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  SUIVI CLIENTS  (une ligne par évènement/dossier)
// ========================================================================
function renderSuivi() {
  ensureFilterOptions("prospect-filter-statut", STATUTS_EVENEMENT);
  const filter = document.getElementById("prospect-filter-statut").value;
  let rows = [...cache.evenements].sort((a, b) => (a.date_evenement || "9999").localeCompare(b.date_evenement || "9999"));
  if (filter) rows = rows.filter(e => e.statut === filter);

  const tbody = document.getElementById("prospect-tbody");
  tbody.innerHTML = rows.length ? rows.map(e => {
    const dev = cache.devis.find(d => d.evenement_id === e.id);
    const fac = cache.factures.find(f => (e.facture_id && f.id === e.facture_id) || (dev && f.devis_id === dev.id));
    const tache = cache.todos.find(t => t.evenement_id === e.id && t.statut !== "Terminé");
    const dateTxt = e.date_flexible ? (fmtMoisFR(e.mois_seul) + " (flex.)") : fmtDateFR(e.date_evenement);
    return `<tr>
      <td>${contactLabel(findContact(e.contact_id))}</td>
      <td>${dateTxt || "—"}</td>
      <td>${e.derniere_action || "—"}</td>
      <td>${tache ? tache.titre : "—"}</td>
      <td class="row-actions"><button title="Fiche récap" onclick="openEventRecap(${e.id})">📋</button></td>
      <td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
      <td>${dev ? badge(dev.statut, STATUT_COLORS[dev.statut]) : "—"}</td>
      <td>${fac ? badge(fac.statut, STATUT_COLORS[fac.statut]) : "—"}</td>
      <td class="row-actions"><button onclick="openEvenementDialog(${e.id})">✎</button></td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="9">Aucun dossier — crée un évènement</td></tr>`;
}

function openEventRecap(id) {
  const e = findEvenement(id);
  if (!e) return;
  const c = findContact(e.contact_id);
  const dev = cache.devis.find(d => d.evenement_id === e.id);
  const fac = cache.factures.find(f => (e.facture_id && f.id === e.facture_id) || (dev && f.devis_id === dev.id));
  const taches = cache.todos.filter(t => t.evenement_id === e.id);
  const dateTxt = eventDateLabel(e);

  // Historique = entrées manuelles + RDV liés déjà passés, fusionnés et triés
  const today = todayStr();
  const manuel = (e.historique || []).map(h => ({ date: h.date, texte: h.texte }));
  const rdvPasses = cache.rdv.filter(r => r.evenement_id === e.id && r.date_rdv && r.date_rdv < today)
    .map(r => ({ date: r.date_rdv, texte: "🤝 RDV" + (r.objet ? " — " + r.objet : "") + (r.notes ? " (" + r.notes + ")" : "") }));
  const historique = [...manuel, ...rdvPasses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const line = (l, v) => `<tr><td style="color:var(--muted);width:42%;">${l}</td><td>${v || "—"}</td></tr>`;
  const html = `
    <table class="data" style="margin-bottom:16px;"><tbody>
      ${line("Date", dateTxt)}
      ${line("Contact", contactLabel(c))}
      ${line("Téléphone", c && c.telephone)}
      ${line("Email", c && c.email)}
      ${line("Provenance", c && c.provenance)}
      ${line("Type d'évènement", e.type_evenement)}
      ${line("Type de prestation", e.type_prestation)}
      ${line("Invités", (e.nb_invites != null ? e.nb_invites : "—") + (e.nb_precision ? " (" + e.nb_precision + ")" : ""))}
      ${line("Budget", e.budget ? e.budget + " €" : "")}
      ${line("Statut", e.statut)}
      ${line("Devis", dev ? (dev.numero + " · " + dev.statut) : "—")}
      ${line("Facture", fac ? (fac.numero + " · " + fac.statut) : "—")}
      ${line("Acompte reçu", e.acompte_recu === "Oui" ? "Oui" + (e.montant_acompte_recu ? " — " + e.montant_acompte_recu + " €" : "") : "Non")}
      ${line("Prochain RDV", fmtDateFR(e.prochain_rdv))}
    </tbody></table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px;">
      <h3 style="font-size:14px;margin:0;">🕓 Historique des actions</h3>
      <button class="btn secondary" type="button" onclick="addHistoriqueEntry(${e.id})">＋ Ajouter</button>
    </div>
    <table class="data" style="margin-bottom:16px;"><tbody>${historique.length ? historique.map(h => `<tr><td style="white-space:nowrap;color:var(--muted);width:110px;">${fmtDateFR(h.date)}</td><td>${h.texte}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">Aucune entrée</td></tr>`}</tbody></table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;">
      <h3 style="font-size:14px;margin:0;">📝 Notes</h3>
      <button class="btn secondary" type="button" onclick="openNotesPanel('Notes — ' + '${(contactLabel(c) || 'évènement').replace(/'/g, "\\'")}', 'evenements', ${e.id}, ${JSON.stringify(e.notes || "")}, () => openEventRecap(${e.id}))">✎ Ouvrir en grand</button>
    </div>
    <div style="font-size:14px;line-height:1.5;white-space:pre-wrap;background:#FAFAF8;border:1px solid var(--border);border-radius:8px;padding:12px;min-height:50px;">${e.notes || "—"}</div>
    <h3 style="font-size:14px;margin:16px 0 8px;">✅ Tâches liées</h3>
    <table class="data"><tbody>${taches.length ? taches.map(t => `<tr><td>${t.titre}</td><td>${badge(t.statut, STATUT_COLORS[t.statut])}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">Aucune</td></tr>`}</tbody></table>`;
  showInfoModal("Fiche récap évènement", html);
  const oldBtn = document.getElementById("modal-print-btn");
  if (oldBtn) oldBtn.remove();
  const printBtn = document.createElement("button");
  printBtn.id = "modal-print-btn";
  printBtn.className = "btn secondary"; printBtn.type = "button"; printBtn.textContent = "🖨 Imprimer";
  printBtn.onclick = () => printEventRecap(e.id);
  document.getElementById("modal-cancel").insertAdjacentElement("beforebegin", printBtn);
}

async function addHistoriqueEntry(eventId) {
  const texte = prompt("Nouvelle entrée d'historique :");
  if (!texte) return;
  const e = findEvenement(eventId);
  const historique = [...(e.historique || []), { date: todayStr(), texte }];
  const saved = await updateRow("evenements", eventId, { historique });
  if (saved) { await refreshCache(); openEventRecap(eventId); }
}

function printEventRecap(id) {
  const e = findEvenement(id);
  if (!e) return;
  const c = findContact(e.contact_id);
  const w = window.open("", "_blank");
  if (!w) { showToast("Autorise les pop-ups pour imprimer"); return; }
  const line = (l, v) => `<tr><td style="color:#8A8F98;width:40%;padding:6px 0;">${l}</td><td style="padding:6px 0;">${v || "—"}</td></tr>`;
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche récap — ${eventLabel(e)}</title>
    <style>body{font-family:Helvetica,Arial,sans-serif;padding:36px;max-width:720px;margin:0 auto;color:#20222A;}
    table{width:100%;border-collapse:collapse;} h1{font-size:20px;} h2{font-size:14px;margin-top:26px;}</style></head><body>
    <h1>Fiche récap évènement</h1>
    <table>
      ${line("Date", eventDateLabel(e))}
      ${line("Contact", contactLabel(c))}
      ${line("Téléphone", c && c.telephone)}
      ${line("Email", c && c.email)}
      ${line("Type d'évènement", e.type_evenement)}
      ${line("Invités", e.nb_invites)}
      ${line("Statut", e.statut)}
      ${line("Acompte reçu", e.acompte_recu === "Oui" ? "Oui" + (e.montant_acompte_recu ? " — " + e.montant_acompte_recu + " €" : "") : "Non")}
    </table>
    <h2>Notes</h2><p style="white-space:pre-wrap;">${e.notes || "—"}</p>
    </body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

// ========================================================================
//  CONTACTS
// ========================================================================
function renderContacts() {
  ensureFilterOptions("contact-filter-categorie", CATEGORIES_CONTACT);
  bindSearch("contact-search", renderContacts);
  const search = (document.getElementById("contact-search").value || "").toLowerCase();
  const fCat = document.getElementById("contact-filter-categorie").value;
  let rows = [...cache.contacts];
  if (fCat) rows = rows.filter(c => c.categorie === fCat);
  if (search) rows = rows.filter(c => (contactLabel(c) + " " + (c.societe || "") + " " + (c.email || "")).toLowerCase().includes(search));

  const tbody = document.getElementById("contact-tbody");
  tbody.innerHTML = rows.length ? rows.map(c => `
    <tr>
      <td>${contactLabel(c)}</td>
      <td>${badge(c.categorie, STATUT_COLORS[c.categorie])}</td>
      <td>${c.societe || "—"}${c.poste ? " · " + c.poste : ""}</td>
      <td>${c.email || "—"}</td>
      <td>${c.telephone || "—"}</td>
      <td>${c.provenance || "—"}</td>
      <td class="row-actions">
        <button title="Historique devis / factures" onclick="openContactHistory(${c.id})">📁</button>
        <button onclick="openContactDialog(${c.id})">✎</button>
        <button onclick="confirmDelete('contacts', ${c.id}, renderContacts)">🗑</button>
        <button title="Fiche contact" onclick="openContactFiche(${c.id})">⋯</button>
      </td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="7">Aucun contact</td></tr>`;
}

function openContactFiche(id) {
  const c = cache.contacts.find(x => x.id === id);
  if (!c) return;
  const line = (l, v) => `<tr><td style="color:var(--muted);width:42%;">${l}</td><td>${v || "—"}</td></tr>`;
  const html = `
    <table class="data"><tbody>
      ${line("Nom complet", contactLabel(c))}
      ${line("Catégorie", c.categorie)}
      ${line("Société", c.societe)}
      ${line("Poste", c.poste)}
      ${line("Email", c.email)}
      ${line("Téléphone", c.telephone)}
      ${line("Adresse", c.adresse)}
      ${line("Provenance", c.provenance)}
      ${line("Type d'évènement d'intérêt", c.type_evenement_interet)}
    </tbody></table>
    <h3 style="font-size:14px;margin:16px 0 8px;">📝 Notes</h3>
    <div style="font-size:14px;line-height:1.5;white-space:pre-wrap;background:#FAFAF8;border:1px solid var(--border);border-radius:8px;padding:12px;min-height:50px;">${c.notes || "—"}</div>`;
  showInfoModal("Fiche contact", html);
}

function openContactDialog(id) {
  const row = id ? cache.contacts.find(c => c.id === id) : {};
  openModal({
    title: id ? "Modifier le contact" : "Nouveau contact",
    table: "contacts", id,
    fields: [
      { key: "nom", label: "Nom", type: "text", value: row.nom },
      { key: "prenom", label: "Prénom", type: "text", value: row.prenom },
      { key: "categorie", label: "Catégorie de personne", type: "select-other", options: CATEGORIES_CONTACT, value: row.categorie || "Client", allowEmpty: false },
      { key: "societe", label: "Société / entreprise", type: "text", value: row.societe },
      { key: "poste", label: "Poste (si entreprise)", type: "text", value: row.poste },
      { key: "email", label: "Email", type: "text", value: row.email },
      { key: "telephone", label: "Téléphone", type: "text", value: row.telephone },
      { key: "adresse", label: "Adresse", type: "textarea", value: row.adresse },
      { key: "provenance", label: "Provenance", type: "select-other", options: PROVENANCES, value: row.provenance, allowEmpty: true },
      { key: "type_evenement_interet", label: "Type d'évènement d'intérêt", type: "select-other", options: TYPES_EVENEMENT, value: row.type_evenement_interet, allowEmpty: true },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  DEVIS
// ========================================================================
async function autoExpireDevis() {
  const today = todayStr();
  const expiring = cache.devis.filter(d => {
    if (!["En attente", "Envoyé"].includes(d.statut)) return false;
    const val = d.date_validite || (d.date_creation ? addDaysISO(d.date_creation.slice(0, 10), 30) : null);
    return val && val < today;
  });
  if (!expiring.length) return [];
  for (const d of expiring) await updateRow("devis", d.id, { statut: "Expiré" });
  await refreshCache();
  return expiring;
}
function nextDevisNumero() {
  let max = 0;
  cache.devis.forEach(d => { const m = (d.numero || "").match(/\d+/g); if (m) { const n = parseInt(m[m.length - 1], 10); if (n > max) max = n; } });
  return "DEV-" + String(max + 1).padStart(3, "0");
}
function lastDevisNumero() {
  if (!cache.devis.length) return null;
  return [...cache.devis].sort((a, b) => (b.date_creation || "").localeCompare(a.date_creation || ""))[0].numero;
}

function renderDevis() {
  ensureFilterOptions("devis-filter-statut", STATUTS_DEVIS);
  bindSearch("devis-search", renderDevis);
  const last = lastDevisNumero();
  document.getElementById("devis-last").innerHTML = last ? `Dernier devis créé : <strong>${last}</strong>` : "Aucun devis pour l'instant.";
  const expiredCount = cache.devis.filter(d => d.statut === "Expiré").length;
  document.getElementById("devis-warn").innerHTML = expiredCount
    ? `<div class="warn-banner">⚠️ ${expiredCount} devis ${expiredCount > 1 ? "sont expirés" : "est expiré"} (date de validité dépassée). Pense à les relancer ou les renouveler.</div>` : "";

  const search = (document.getElementById("devis-search").value || "").toLowerCase();
  const filter = document.getElementById("devis-filter-statut").value;
  let rows = [...cache.devis].sort((a, b) => (b.date_creation || "").localeCompare(a.date_creation || ""));
  if (filter) rows = rows.filter(d => d.statut === filter);
  if (search) rows = rows.filter(d => (contactLabel(devisContact(d)) + " " + (d.numero || "")).toLowerCase().includes(search));

  const tbody = document.getElementById("devis-tbody");
  tbody.innerHTML = rows.length ? rows.map(d => {
    const e = devisEvent(d);
    return `<tr>
      <td>${d.numero || "—"}${d.finalise ? " ✅" : ""}</td>
      <td>${e ? eventLabel(e) : "—"}</td>
      <td><input type="date" value="${(d.date_creation || "").slice(0, 10)}" onchange="updateDevisDateCreation(${d.id}, this.value)" style="border:1px solid var(--border);border-radius:5px;padding:4px 6px;font-size:12px;"></td>
      <td>${d.montant_ttc ? d.montant_ttc + " €" : "—"}</td>
      <td>${badge(d.statut, STATUT_COLORS[d.statut])}</td>
      <td class="row-actions">
        <button title="Aperçu rapide" onclick="generateDevisPDF(${d.id}, true)">👁</button>
        <button title="Éditer le devis" onclick="openDevisEditor(${d.id})">✎</button>
        <button title="Télécharger le PDF" onclick="generateDevisPDF(${d.id})">⬇</button>
        <button title="Créer une facture" onclick="createFactureFromDevis(${d.id})">🧾</button>
        <button onclick="confirmDelete('devis', ${d.id}, renderDevis)">🗑</button>
      </td></tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="6">Aucun devis</td></tr>`;
}
async function updateDevisDateCreation(id, val) {
  if (!val) return;
  const saved = await updateRow("devis", id, { date_creation: val });
  if (saved) { showToast("Date de création mise à jour"); await refreshCache(); }
}

// Nouveau devis : mini-dialogue (numéro, évènement, statut) puis éditeur
function openDevisDialog(id) {
  const row = id ? findDevis(id) : {};
  if (id) { openDevisEditor(id); return; }
  openModal({
    title: "Nouveau devis",
    table: "devis", id: null,
    fields: [
      { key: "numero", label: "Numéro", type: "text", value: nextDevisNumero() },
      { key: "evenement_id", label: "Évènement concerné", type: "select-raw", optionsHtml: `<option value="">— Sélectionner —</option>` + evenementOptionsHtml(row.evenement_id), value: row.evenement_id, numeric: true },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_DEVIS, value: "En attente" },
    ],
    beforeSave: (v) => {
      v.date_validite = addDaysISO(todayStr(), 30);
      v.lignes = [];
    },
    onSaved: async (saved) => {
      await refreshCache();
      renderPage("devis");
      if (saved) openDevisEditor(saved.id);
    },
  });
}

// ---- Éditeur de devis (A4) ----
function openDevisEditor(id) {
  const d = findDevis(id);
  if (!d) return;
  edState = { id, lignes: Array.isArray(d.lignes) ? JSON.parse(JSON.stringify(d.lignes)) : [] };
  if (!edState.lignes.length) edState.lignes.push({ designation: "", qte: 1, pu_ttc: "", remise: 0, tva: 20 });

  const e = devisEvent(d);
  const c = devisContact(d);
  document.getElementById("ed-numero").innerHTML =
    `N° <strong>${d.numero || "—"}</strong> · Date ${fmtDateFR((d.date_creation || todayStr()).slice(0, 10))} · Valable jusqu'au ${fmtDateFR(d.date_validite || addDaysISO(todayStr(), 30))}`;
  document.getElementById("ed-client").innerHTML =
    `<strong>Client :</strong> ${contactLabel(c)}${c && c.telephone ? " · " + c.telephone : ""}${c && c.email ? " · " + c.email : ""}<br>` +
    `<strong>Évènement :</strong> ${e ? eventLabel(e) : "—"}${devisNbInvites(d) != null ? " · " + devisNbInvites(d) + " invités" : ""}` +
    `<div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
      <span><label style="font-size:12px;color:var(--muted);">Statut : </label>
      <select id="ed-statut" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;">
      ${STATUTS_DEVIS.map(s => `<option value="${s}" ${s === d.statut ? "selected" : ""}>${s}</option>`).join("")}</select></span>
      <span><label style="font-size:12px;color:var(--muted);">Acompte reçu : </label>
      <select id="ed-acompte" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;">
      <option value="Non" ${!d.acompte ? "selected" : ""}>Non</option>
      <option value="Oui" ${d.acompte ? "selected" : ""}>Oui</option></select></span>
      <span><label style="font-size:12px;color:var(--muted);">Montant (€) : </label>
      <input id="ed-montant-acompte" type="number" step="0.01" value="${d.montant_acompte != null ? d.montant_acompte : ""}" style="width:90px;padding:5px 8px;border:1px solid var(--border);border-radius:5px;"></span>
    </div>`;
  document.getElementById("ed-emetteur").innerHTML =
    `<strong>${EMETTEUR.nom}</strong><br>${EMETTEUR.adresse}<br>${EMETTEUR.siret}<br>${EMETTEUR.email}<br>Tél : ${EMETTEUR.telephone}`;

  // datalist des désignations (depuis la tarification, filtrée par saison de l'évènement)
  let dl = document.getElementById("ed-desig");
  if (!dl) { dl = document.createElement("datalist"); dl.id = "ed-desig"; document.body.appendChild(dl); }
  const season = seasonForDate(devisDateEvt(d));
  const grilleFiltree = season ? cache.grille_tarifaire.filter(g => !g.saison || g.saison === "Toute l'année" || g.saison === season) : cache.grille_tarifaire;
  dl.innerHTML = grilleFiltree.map(g => `<option value="${(g.nom_presta || "").replace(/"/g, "&quot;")}">`).join("");

  renderEditorLines();
  renderCgvPreview(d);
  document.getElementById("devis-editor").classList.add("open");
}

function renderEditorLines() {
  const tb = document.getElementById("ed-lines");
  tb.innerHTML = edState.lignes.map((l, i) => `
    <tr data-i="${i}">
      <td><input list="ed-desig" data-k="designation" value="${(l.designation || "").replace(/"/g, "&quot;")}"></td>
      <td><input type="number" data-k="qte" min="0" step="1" value="${l.qte != null ? l.qte : 1}" style="width:60px;"></td>
      <td><input type="number" data-k="pu_ttc" min="0" step="0.01" value="${l.pu_ttc != null ? l.pu_ttc : ""}" style="width:80px;"></td>
      <td><input type="number" data-k="remise" min="0" max="100" step="1" value="${l.remise != null ? l.remise : 0}" style="width:60px;"></td>
      <td class="ro" data-ro="ht"></td>
      <td><select data-k="tva">${TVA_DEVIS.map(t => `<option value="${t}" ${Number(l.tva) === t ? "selected" : ""}>${t}%</option>`).join("")}</select></td>
      <td class="ro" data-ro="tva"></td>
      <td class="ro" data-ro="ttc"></td>
      <td><button class="del" title="Supprimer" onclick="removeEditorLine(${i})">✕</button></td>
    </tr>`).join("");
  recomputeEditor();
}
function readEditorToState() {
  document.querySelectorAll("#ed-lines tr").forEach(tr => {
    const i = Number(tr.dataset.i);
    const l = edState.lignes[i]; if (!l) return;
    tr.querySelectorAll("[data-k]").forEach(inp => {
      const k = inp.dataset.k;
      l[k] = (inp.type === "number") ? (inp.value === "" ? "" : Number(inp.value)) : inp.value;
    });
  });
}
function computeLine(l) {
  const qte = Number(l.qte || 0), pu = Number(l.pu_ttc || 0), remise = Number(l.remise || 0), tva = Number(l.tva || 0);
  const ttc = round2(pu * qte * (1 - remise / 100));
  const ht = round2(ttc / (1 + tva / 100));
  return { ht, tva: round2(ttc - ht), ttc };
}
function recomputeEditor() {
  let tHT = 0, tTVA = 0, tTTC = 0;
  document.querySelectorAll("#ed-lines tr").forEach(tr => {
    const i = Number(tr.dataset.i);
    const l = edState.lignes[i]; if (!l) return;
    const r = computeLine(l);
    tr.querySelector('[data-ro="ht"]').textContent = r.ht.toFixed(2) + " €";
    tr.querySelector('[data-ro="tva"]').textContent = r.tva.toFixed(2) + " €";
    tr.querySelector('[data-ro="ttc"]').textContent = r.ttc.toFixed(2) + " €";
    tHT += r.ht; tTVA += r.tva; tTTC += r.ttc;
  });
  document.getElementById("ed-totaux").innerHTML =
    `Total HT : <strong>${round2(tHT).toFixed(2)} €</strong><br>` +
    `Total TVA : <strong>${round2(tTVA).toFixed(2)} €</strong><br>` +
    `<span class="grand">Total TTC : ${round2(tTTC).toFixed(2)} €</span>`;
}
function removeEditorLine(i) { readEditorToState(); edState.lignes.splice(i, 1); if (!edState.lignes.length) edState.lignes.push({ designation: "", qte: 1, pu_ttc: "", remise: 0, tva: 20 }); renderEditorLines(); }
function addEditorLine() { readEditorToState(); edState.lignes.push({ designation: "", qte: 1, pu_ttc: "", remise: 0, tva: 20 }); renderEditorLines(); }
function editorTotals() {
  let tHT = 0, tTVA = 0, tTTC = 0;
  edState.lignes.forEach(l => { const r = computeLine(l); tHT += r.ht; tTVA += r.tva; tTTC += r.ttc; });
  return { ht: round2(tHT), tva: round2(tTVA), ttc: round2(tTTC) };
}
async function saveDevisEditor(closeAfter) {
  readEditorToState();
  const d = findDevis(edState.id); if (!d) return;
  const tot = editorTotals();
  const newStatut = document.getElementById("ed-statut") ? document.getElementById("ed-statut").value : d.statut;
  const acompteRecu = document.getElementById("ed-acompte") ? document.getElementById("ed-acompte").value : d.acompte;
  const montantAcompteRecu = document.getElementById("ed-montant-acompte") ? document.getElementById("ed-montant-acompte").value : d.montant_acompte;
  const statutChanged = newStatut !== d.statut;
  await updateRow("devis", edState.id, {
    lignes: edState.lignes, montant_ht: tot.ht, tva: null, montant_ttc: tot.ttc, statut: newStatut,
    acompte: acompteRecu === "Oui", montant_acompte: montantAcompteRecu === "" ? null : Number(montantAcompteRecu),
  });
  await refreshCache();
  const updated = findDevis(edState.id);
  if (statutChanged && ["Envoyé", "Accepté"].includes(newStatut)) await createDevisReminders(updated);
  showToast("Devis enregistré");
  if (closeAfter) closeDevisEditor(); else { renderCgvPreview(updated); }
  renderPage(currentPage === "devis" ? "devis" : currentPage);
}
function closeDevisEditor() { document.getElementById("devis-editor").classList.remove("open"); }

function renderCgvPreview(d) {
  const el = document.getElementById("ed-cgv-preview");
  if (d && Array.isArray(d.cgv) && d.cgv.length) {
    el.innerHTML = "<strong>Conditions générales de vente :</strong><br>" + d.cgv.map((c, i) => `${i + 1}. ${c}`).join("<br>");
  } else { el.innerHTML = "<em>Aucune condition sélectionnée — clique sur « Finaliser (CGV) ».</em>"; }
}

// Sélection ordonnée des CGV
function openCgvPicker() {
  readEditorToState();
  const d = findDevis(edState.id);
  const already = (d && Array.isArray(d.cgv)) ? d.cgv.slice() : [];
  const html = `<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;">Coche les conditions dans l'ordre où elles doivent apparaître sur le devis.</p>
    <div class="cgv-list" id="cgv-list">${CGV_OPTIONS.map((c, i) => {
      const pos = already.indexOf(c);
      return `<label><span class="cgv-order" data-cgv="${i}">${pos >= 0 ? (pos + 1) : ""}</span>
        <input type="checkbox" data-cgv-cb="${i}" ${pos >= 0 ? "checked" : ""}> ${c}</label>`;
    }).join("")}</div>`;
  openRawModal("Conditions générales de vente", html, async () => {
    // recueille l'ordre de sélection
    const order = window._cgvOrder || already.map(c => CGV_OPTIONS.indexOf(c)).filter(x => x >= 0);
    const chosen = order.map(i => CGV_OPTIONS[i]);
    await updateRow("devis", edState.id, { cgv: chosen, finalise: true });
    await refreshCache();
    closeModal();
    const upd = findDevis(edState.id);
    if (["Envoyé", "Accepté"].includes(upd.statut)) await createDevisReminders(upd);
    renderCgvPreview(upd);
    showToast("Devis finalisé");
    generateDevisPDF(edState.id);
  });
  // gestion de l'ordre de clic
  window._cgvOrder = already.map(c => CGV_OPTIONS.indexOf(c)).filter(x => x >= 0);
  document.querySelectorAll("[data-cgv-cb]").forEach(cb => {
    cb.addEventListener("change", () => {
      const i = Number(cb.dataset.cgvCb);
      if (cb.checked) { if (!window._cgvOrder.includes(i)) window._cgvOrder.push(i); }
      else { window._cgvOrder = window._cgvOrder.filter(x => x !== i); }
      window._cgvOrder.forEach((idx, pos) => { const s = document.querySelector(`[data-cgv="${idx}"]`); if (s) s.textContent = pos + 1; });
      document.querySelectorAll("[data-cgv]").forEach(s => { if (!window._cgvOrder.includes(Number(s.dataset.cgv))) s.textContent = ""; });
    });
  });
}

// Rappels automatiques ajoutés à la to-do quand un devis passe en "Envoyé"
async function createDevisReminders(d) {
  const cgv = Array.isArray(d.cgv) ? d.cgv : [];
  if (!cgv.length) return;
  const e = devisEvent(d);
  const evDate = e ? e.date_evenement : null;
  const num = d.numero || ("#" + d.id);
  const evId = e ? e.id : null;
  const toCreate = [];
  if (cgv.includes("30% d'acompte à la réservation.")) {
    toCreate.push({ titre: `Acompte de devis ${num}`, priorite: "Haute" });
    toCreate.push({ titre: `Envoyer facture d'acompte du devis ${num}`, priorite: "Haute" });
  }
  if (cgv.includes("30% : 1 mois avant la date de l'événement.")) {
    toCreate.push({ titre: `Demander 2e acompte 30% (devis ${num})`, priorite: "Haute", date_echeance: addMonthsISO(evDate, -1) });
  }
  if (cgv.includes("Paiement du solde à réception de la facture qui sera envoyée 7 jours avant la date de l'événement.")) {
    toCreate.push({ titre: `Envoyer facture montant final devis ${num}`, priorite: "Haute", date_echeance: addDaysISO(evDate, -7) });
  }
  for (const t of toCreate) {
    const exists = cache.todos.some(x => x.titre === t.titre && x.evenement_id === evId);
    if (exists) continue;
    await insertRow("todos", { titre: t.titre, priorite: t.priorite, statut: "À faire", evenement_id: evId, date_echeance: t.date_echeance || null });
  }
  await refreshCache();
  if (toCreate.length) showToast(toCreate.length + " rappel(s) ajouté(s) à la To Do List");
}

// ---- PDF devis ----
function drawEmetteur(doc) {
  doc.setFontSize(10);
  let y = 16;
  [EMETTEUR.nom, EMETTEUR.adresse, EMETTEUR.siret, EMETTEUR.email, "Tél : " + EMETTEUR.telephone].forEach(l => { doc.text(l, 200, y, { align: "right" }); y += 5; });
  doc.setFontSize(11);
}
function drawFooter(doc) {
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(120);
  const legal = `${EMETTEUR.nom} — ${EMETTEUR.adresse} — ${EMETTEUR.siret} — ${EMETTEUR.email} — Tél : ${EMETTEUR.telephone}`;
  doc.text(doc.splitTextToSize(legal, 175), 105, h - 12, { align: "center" });
  doc.setTextColor(0); doc.setFontSize(11);
}
function generateDevisPDF(id, preview) {
  const d = findDevis(id);
  if (!d) return;
  if (!window.jspdf) { showToast("Générateur PDF indisponible (hors-ligne)"); return; }
  const c = devisContact(d), e = devisEvent(d);
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  drawEmetteur(doc);
  doc.setFontSize(20); doc.text("DEVIS", 20, 22);
  doc.setFontSize(11);
  doc.text("N° : " + (d.numero || "—"), 20, 34);
  doc.text("Date : " + fmtDateFR((d.date_creation || todayStr()).slice(0, 10)), 20, 41);
  doc.text("Valable jusqu'au : " + fmtDateFR(d.date_validite || addDaysISO(todayStr(), 30)), 20, 48);

  doc.setFontSize(12); doc.text("Client", 20, 62); doc.setFontSize(11);
  let y = 69;
  [contactLabel(c), c && c.societe, c && c.email, c && c.telephone, c && c.adresse, e ? ("Évènement : " + eventLabel(e)) : ""]
    .filter(Boolean).forEach(l => { doc.text(String(l), 20, y); y += 7; });

  y += 4;
  // en-têtes tableau
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text("Désignation", 20, y); doc.text("Qté", 108, y); doc.text("PU TTC", 122, y);
  doc.text("Rem.", 142, y); doc.text("TVA", 158, y); doc.text("Total TTC", 176, y);
  doc.setTextColor(0); doc.setFontSize(10); y += 3;
  doc.line(20, y, 195, y); y += 6;
  let tHT = 0, tTVA = 0, tTTC = 0;
  lignes.forEach(l => {
    const r = computeLine(l); tHT += r.ht; tTVA += r.tva; tTTC += r.ttc;
    const desig = doc.splitTextToSize(l.designation || "—", 82);
    doc.text(desig, 20, y);
    doc.text(String(l.qte ?? ""), 108, y);
    doc.text(Number(l.pu_ttc || 0).toFixed(2), 122, y);
    doc.text((l.remise ? l.remise + "%" : "—"), 142, y);
    doc.text((l.tva || 0) + "%", 158, y);
    doc.text(r.ttc.toFixed(2) + " €", 176, y);
    y += Math.max(7, desig.length * 5);
    if (y > 250) { doc.addPage(); y = 20; }
  });
  y += 2; doc.line(20, y, 195, y); y += 8;
  doc.setFontSize(11);
  doc.text("Total HT : " + round2(tHT).toFixed(2) + " €", 130, y); y += 6;
  doc.text("Total TVA : " + round2(tTVA).toFixed(2) + " €", 130, y); y += 6;
  doc.setFontSize(13); doc.text("TOTAL TTC : " + round2(tTTC).toFixed(2) + " €", 130, y); y += 12;

  if (Array.isArray(d.cgv) && d.cgv.length) {
    doc.setFontSize(11); doc.text("Conditions générales de vente :", 20, y); y += 6;
    doc.setFontSize(10);
    d.cgv.forEach((c2, i) => { const t = doc.splitTextToSize((i + 1) + ". " + c2, 175); doc.text(t, 20, y); y += t.length * 5 + 1; if (y > 255) { doc.addPage(); y = 20; } });
  }
  drawFooter(doc);
  if (preview) window.open(doc.output("bloburl"), "_blank");
  else doc.save((d.numero || "devis").replace(/\s+/g, "_") + ".pdf");
}

// ========================================================================
//  FACTURATION
// ========================================================================
function nextFactureNumero() {
  let max = 0;
  cache.factures.forEach(f => { const m = (f.numero || "").match(/\d+/g); if (m) { const n = parseInt(m[m.length - 1], 10); if (n > max) max = n; } });
  return "FAC-" + String(max + 1).padStart(3, "0");
}
function renderFactures() {
  ensureFilterOptions("facture-filter-statut", STATUTS_FACTURE);
  bindSearch("facture-search", renderFactures);
  const search = (document.getElementById("facture-search").value || "").toLowerCase();
  const filter = document.getElementById("facture-filter-statut").value;
  let rows = [...cache.factures].sort((a, b) => (b.date_creation || "").localeCompare(a.date_creation || ""));
  if (filter) rows = rows.filter(f => f.statut === filter);
  if (search) rows = rows.filter(f => (contactLabel(findContact(f.contact_id)) + " " + (f.numero || "")).toLowerCase().includes(search));

  const tbody = document.getElementById("facture-tbody");
  tbody.innerHTML = rows.length ? rows.map(f => {
    const dev = f.devis_id ? findDevis(f.devis_id) : null;
    const pdfBtn = f.pdf_path ? `<button title="Voir le PDF joint" onclick="downloadAttachment(findFacture(${f.id}).pdf_path)">📎</button>` : "";
    return `<tr>
      <td>${f.numero || "—"}</td>
      <td>${contactLabel(findContact(f.contact_id))}</td>
      <td>${dev ? (dev.numero || ("Devis #" + dev.id)) : "—"}</td>
      <td>${fmtDateFR(f.date_facture)}</td>
      <td>${f.montant_ttc ? f.montant_ttc + " €" : "—"}</td>
      <td>${badge(f.statut, STATUT_COLORS[f.statut])}</td>
      <td class="row-actions">
        <button title="Télécharger la facture (PDF)" onclick="generateFacturePDF(${f.id})">⬇</button>
        ${pdfBtn}
        <button onclick="openFactureDialog(${f.id})">✎</button>
        <button onclick="confirmDelete('factures', ${f.id}, renderFactures)">🗑</button>
      </td></tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="7">Aucune facture — crée-la ici ou depuis un devis (🧾)</td></tr>`;
}
function factureFields(row) {
  return [
    { key: "numero", label: "Numéro", type: "text", value: row.numero != null ? row.numero : nextFactureNumero() },
    { key: "contact_id", label: "Client / contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
    { key: "devis_id", label: "Devis lié", type: "select-raw", optionsHtml: `<option value="">— Aucun —</option>` + devisOptionsHtml(row.devis_id), value: row.devis_id, numeric: true },
    { key: "type_evenement", label: "Type d'évènement", type: "select-other", options: TYPES_EVENEMENT, value: row.type_evenement, allowEmpty: true },
    { key: "date_evenement", label: "Date de l'évènement", type: "date", value: row.date_evenement },
    { key: "date_facture", label: "Date de la facture", type: "date", value: row.date_facture || todayStr() },
    { key: "date_echeance", label: "Date d'échéance", type: "date", value: row.date_echeance },
    { key: "montant_ht", label: "Montant HT (€)", type: "number", value: row.montant_ht },
    { key: "tva", label: "TVA (%)", type: "select", options: TVA_RATES, value: row.tva != null ? row.tva : 20 },
    { key: "montant_ttc", label: "Montant TTC (€) — calculé", type: "computed", value: row.montant_ttc },
    { key: "montant_acompte", label: "Acompte déjà versé (€)", type: "number", value: row.montant_acompte },
    { key: "statut", label: "Statut", type: "select", options: STATUTS_FACTURE, value: row.statut || "Brouillon" },
    { key: "pdf_signe_file", label: "Joindre un PDF (facture signée / preuve)", type: "file", accept: "application/pdf" },
    { key: "notes", label: "Notes", type: "textarea", value: row.notes },
  ];
}
function factureOnRender(form) {
  const calc = () => { const ht = Number(form.elements["montant_ht"].value || 0); const tva = Number(form.elements["tva"].value || 0); form.elements["montant_ttc"].value = ht ? round2(ht * (1 + tva / 100)) : ""; };
  form.elements["montant_ht"].addEventListener("input", calc);
  form.elements["tva"].addEventListener("change", calc);
  form.elements["devis_id"].addEventListener("change", () => {
    const d = findDevis(Number(form.elements["devis_id"].value)); if (!d) return;
    const c = devisContact(d);
    if (!form.elements["contact_id"].value && c) form.elements["contact_id"].value = c.id;
    if (!form.elements["montant_ht"].value && d.montant_ht != null) form.elements["montant_ht"].value = d.montant_ht;
    calc();
  });
  calc();
}
function openFactureDialog(id, prefill) {
  const row = id ? (findFacture(id) || {}) : (prefill || {});
  openModal({ title: id ? "Modifier la facture" : "Nouvelle facture", table: "factures", id, fields: factureFields(row), onRender: factureOnRender, onSaved: refreshAll });
}
function createFactureFromDevis(devisId) {
  const d = findDevis(devisId); if (!d) return;
  const c = devisContact(d);
  openFactureDialog(null, {
    devis_id: d.id, contact_id: c ? c.id : null, date_evenement: devisDateEvt(d),
    montant_ht: d.montant_ht, montant_ttc: d.montant_ttc, notes: d.notes,
  });
  showToast("Facture pré-remplie depuis " + (d.numero || "le devis"));
}
function generateFacturePDF(id) {
  const f = findFacture(id); if (!f) return;
  if (!window.jspdf) { showToast("Générateur PDF indisponible (hors-ligne)"); return; }
  const c = findContact(f.contact_id), dev = f.devis_id ? findDevis(f.devis_id) : null;
  const { jsPDF } = window.jspdf; const doc = new jsPDF();
  const ht = Number(f.montant_ht || 0), tva = Number(f.tva != null ? f.tva : 20);
  const mtva = round2(ht * tva / 100), ttc = f.montant_ttc != null ? Number(f.montant_ttc) : round2(ht + mtva);
  const acompte = Number(f.montant_acompte || 0), net = round2(ttc - acompte);
  drawEmetteur(doc);
  doc.setFontSize(20); doc.text("FACTURE", 20, 22); doc.setFontSize(11);
  doc.text("N° : " + (f.numero || "—"), 20, 34);
  doc.text("Date : " + fmtDateFR(f.date_facture || todayStr()), 20, 41);
  if (f.date_echeance) doc.text("Échéance : " + fmtDateFR(f.date_echeance), 20, 48);
  if (dev) doc.text("Réf. devis : " + (dev.numero || ("#" + dev.id)), 20, 55);
  doc.setFontSize(12); doc.text("Facturé à", 20, 68); doc.setFontSize(11);
  let y = 75;
  [contactLabel(c), c && c.societe, c && c.email, c && c.telephone, c && c.adresse].filter(Boolean).forEach(l => { doc.text(String(l), 20, y); y += 7; });
  y += 6; doc.setFontSize(12); doc.text("Détail", 20, y); y += 9; doc.setFontSize(11);
  const rows = [["Type d'évènement", f.type_evenement || "—"], ["Date de l'évènement", fmtDateFR(f.date_evenement) || "—"], ["Montant HT", ht ? ht.toFixed(2) + " €" : "—"], ["TVA (" + tva + "%)", mtva.toFixed(2) + " €"], ["Montant TTC", ttc.toFixed(2) + " €"]];
  if (acompte) rows.push(["Acompte déjà versé", "- " + acompte.toFixed(2) + " €"]);
  rows.forEach(([k, v]) => { doc.text(k, 20, y); doc.text(v, 130, y); y += 7; });
  y += 6; doc.setFontSize(13); doc.text("NET À PAYER : " + net.toFixed(2) + " €", 20, y);
  if (f.notes) { y += 12; doc.setFontSize(10); doc.text(doc.splitTextToSize("Notes : " + f.notes, 170), 20, y); }
  drawFooter(doc);
  doc.save((f.numero || "facture").replace(/\s+/g, "_") + ".pdf");
}

async function downloadAttachment(pdf_path) {
  if (!pdf_path) { showToast("Aucun PDF joint"); return; }
  const { data, error } = await sb.storage.from("devis-signes").createSignedUrl(pdf_path, 60);
  if (error) { showToast("PDF introuvable"); console.error(error); return; }
  window.open(data.signedUrl, "_blank");
}

function openContactHistory(contactId) {
  const c = findContact(contactId);
  const devs = cache.devis.filter(d => { const cc = devisContact(d); return cc && cc.id === contactId; });
  const facs = cache.factures.filter(f => f.contact_id === contactId);
  const devHtml = devs.length ? devs.map(d => `<tr><td>${d.numero || "—"}</td><td>${fmtDateFR(devisDateEvt(d))}</td><td>${d.montant_ttc ? d.montant_ttc + " €" : "—"}</td><td>${badge(d.statut, STATUT_COLORS[d.statut])}</td><td class="row-actions"><button onclick="generateDevisPDF(${d.id})">⬇</button></td></tr>`).join("") : `<tr class="empty-row"><td colspan="5">Aucun devis</td></tr>`;
  const facHtml = facs.length ? facs.map(f => `<tr><td>${f.numero || "—"}</td><td>${fmtDateFR(f.date_facture)}</td><td>${f.montant_ttc ? f.montant_ttc + " €" : "—"}</td><td>${badge(f.statut, STATUT_COLORS[f.statut])}</td><td class="row-actions"><button onclick="generateFacturePDF(${f.id})">⬇</button></td></tr>`).join("") : `<tr class="empty-row"><td colspan="5">Aucune facture</td></tr>`;
  showInfoModal("Historique client", `
    <p style="margin:0 0 14px;color:var(--muted);font-size:13px;">Contact : <strong>${contactLabel(c)}</strong></p>
    <h3 style="font-size:14px;margin:0 0 8px;">📄 Devis</h3>
    <table class="data" style="margin-bottom:18px;"><thead><tr><th>N°</th><th>Date évt</th><th>TTC</th><th>Statut</th><th></th></tr></thead><tbody>${devHtml}</tbody></table>
    <h3 style="font-size:14px;margin:0 0 8px;">🧾 Factures</h3>
    <table class="data"><thead><tr><th>N°</th><th>Date</th><th>TTC</th><th>Statut</th><th></th></tr></thead><tbody>${facHtml}</tbody></table>`);
}

// ========================================================================
//  EVENEMENTS
// ========================================================================
function renderEvenements() {
  ensureFilterOptions("evenement-filter-type", TYPES_EVENEMENT);
  ensureFilterOptions("evenement-filter-statut", STATUTS_EVENEMENT);
  ensureFilterOptions("evenement-filter-mois", MOIS_FR.map((m, i) => ({ value: String(i + 1).padStart(2, "0"), label: m })));
  const annees = [...new Set(cache.evenements.map(e => (e.date_evenement || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  ensureFilterOptions("evenement-filter-annee", annees);
  const fType = document.getElementById("evenement-filter-type").value;
  const fMois = document.getElementById("evenement-filter-mois").value;
  const fAnnee = document.getElementById("evenement-filter-annee").value;
  const fStatut = document.getElementById("evenement-filter-statut").value;

  let rows = [...cache.evenements].sort((a, b) => (a.date_evenement || "9999").localeCompare(b.date_evenement || "9999"));
  if (fType) rows = rows.filter(e => e.type_evenement === fType);
  if (fStatut) rows = rows.filter(e => e.statut === fStatut);
  if (fMois) rows = rows.filter(e => ((e.date_evenement || e.mois_seul || "") + "").slice(5, 7) === fMois);
  if (fAnnee) rows = rows.filter(e => ((e.date_evenement || e.mois_seul || "") + "").slice(0, 4) === fAnnee);

  const tbody = document.getElementById("evenement-tbody");
  tbody.innerHTML = rows.length ? rows.map(e => {
    const c = findContact(e.contact_id);
    const dev = cache.devis.find(d => d.evenement_id === e.id);
    const fac = cache.factures.find(f => (e.facture_id && f.id === e.facture_id) || (dev && f.devis_id === dev.id));
    const dateTxt = eventDateLabel(e);
    const nb = (e.nb_invites != null ? e.nb_invites : "—") + (e.nb_precision === "Approximatif" ? " ~" : "");
    return `<tr>
      <td>${dateTxt || "—"}</td>
      <td>${contactLabel(c)}</td>
      <td>${(c && c.provenance) || "—"}</td>
      <td>${e.type_evenement || "—"}</td>
      <td>${e.type_prestation || "—"}</td>
      <td>${nb}</td>
      <td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
      <td>${dev ? badge(dev.statut, STATUT_COLORS[dev.statut]) : "—"}</td>
      <td>${fac ? badge(fac.statut, STATUT_COLORS[fac.statut]) : "—"}</td>
      <td>${e.derniere_action || "—"}</td>
      <td class="row-actions">
        <button title="Fiche récap" onclick="openEventRecap(${e.id})">📋</button>
        <button onclick="openEvenementDialog(${e.id})">✎</button>
        <button onclick="confirmDelete('evenements', ${e.id}, renderEvenements)">🗑</button>
      </td></tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="11">Aucun évènement</td></tr>`;
}

function openEvenementDialog(id, defaultDate) {
  const row = id ? cache.evenements.find(e => e.id === id) : {};
  let adefinirFlag = false;
  openModal({
    title: id ? "Modifier l'évènement" : "Nouvel évènement",
    table: "evenements", id,
    fields: [
      { key: "date_evenement", label: "Date", type: "date", value: row.date_evenement || defaultDate },
      { key: "plusieurs_jours", label: "Sur plusieurs jours", type: "checkbox", value: !!row.date_fin },
      { key: "date_fin", label: "Date de fin", type: "date", value: row.date_fin },
      { key: "date_flexible", label: "Date flexible", type: "checkbox", value: row.date_flexible },
      { key: "mois_seul", label: "Mois (si date flexible)", type: "month", value: row.mois_seul },
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "provenance", label: "Provenance (reprise du contact)", type: "text", value: row.provenance },
      { key: "type_evenement", label: "Type d'évènement", type: "select-other", options: TYPES_EVENEMENT, value: row.type_evenement, allowEmpty: true },
      { key: "type_prestation", label: "Type de prestation", type: "select", options: TYPES_PRESTATION, value: row.type_prestation },
      { key: "nb_adultes", label: "Nombre d'adultes", type: "number", value: row.nb_adultes },
      { key: "nb_enfants", label: "Nombre d'enfants", type: "number", value: row.nb_enfants },
      { key: "nb_invites", label: "Total invités — calculé", type: "computed", value: row.nb_invites },
      { key: "nb_precision", label: "Précision du nombre", type: "radioset", options: ["Exact", "Approximatif"], value: row.nb_precision },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_EVENEMENT, value: row.statut || "Premier contact" },
      { key: "devis_id", label: "Devis lié", type: "select-raw", optionsHtml: `<option value="">—</option>` + devisOptionsHtml(row.devis_id), value: row.devis_id, numeric: true },
      { key: "facture_id", label: "Facture liée", type: "select-raw", optionsHtml: `<option value="">—</option>` + factureOptionsHtml(row.facture_id), value: row.facture_id, numeric: true },
      { key: "acompte_recu", label: "Acompte reçu", type: "select", options: ["Non", "Oui"], value: row.acompte_recu || "Non" },
      { key: "montant_acompte_recu", label: "Montant acompte reçu (€)", type: "number", value: row.montant_acompte_recu },
      { key: "budget", label: "Budget (€)", type: "number", value: row.budget },
      { key: "derniere_action", label: "Dernière action", type: "text", value: row.derniere_action },
      { key: "prochain_rdv", label: "Prochain RDV", type: "date", value: row.prochain_rdv },
      { key: "prochain_rdv_adefinir", label: "Prochain RDV à définir (crée une tâche « Prendre rendez-vous »)", type: "checkbox", value: false },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onRender: (form) => {
      const calc = () => { const a = Number(form.elements["nb_adultes"].value || 0); const en = Number(form.elements["nb_enfants"].value || 0); form.elements["nb_invites"].value = (a || en) ? (a + en) : ""; };
      form.elements["nb_adultes"].addEventListener("input", calc);
      form.elements["nb_enfants"].addEventListener("input", calc);
      form.elements["contact_id"].addEventListener("change", () => { const c = findContact(Number(form.elements["contact_id"].value)); if (c && c.provenance && !form.elements["provenance"].value) form.elements["provenance"].value = c.provenance; });
      const toggleDateFin = () => { form.elements["date_fin"].closest(".field").style.display = form.elements["plusieurs_jours"].checked ? "" : "none"; };
      form.elements["plusieurs_jours"].addEventListener("change", toggleDateFin);
      toggleDateFin();
      calc();
    },
    beforeSave: (values) => {
      adefinirFlag = !!values.prochain_rdv_adefinir;
      delete values.prochain_rdv_adefinir;
      if (!values.plusieurs_jours) values.date_fin = null;
      delete values.plusieurs_jours;
    },
    onSaved: async (saved) => {
      if (adefinirFlag) {
        await insertRow("todos", { titre: "Prendre rendez-vous", evenement_id: saved.id, priorite: "Basse", statut: "À faire" });
      }
      await refreshAll();
    },
  });
}

// ========================================================================
//  RDV
// ========================================================================
function renderRdv() {
  ensureFilterOptions("rdv-filter-statut", STATUTS_RDV);
  const filter = document.getElementById("rdv-filter-statut").value;
  const today = todayStr();
  let rows = [...cache.rdv];
  if (filter) rows = rows.filter(r => r.statut === filter);

  const rowHtml = r => `
    <tr>
      <td>${fmtDateFR(r.date_rdv)}</td><td>${r.heure || "—"}</td><td>${r.objet || "—"}</td>
      <td>${contactLabel(findContact(r.contact_id))}</td><td>${badge(r.statut, STATUT_COLORS[r.statut])}</td>
      <td>${r.notes || "—"}</td>
      <td class="row-actions"><button onclick="openRdvDialog(${r.id})">✎</button><button onclick="confirmDelete('rdv', ${r.id}, renderRdv)">🗑</button></td>
    </tr>`;

  const upcoming = rows.filter(r => !r.date_rdv || r.date_rdv >= today)
    .sort((a, b) => ((a.date_rdv || "9999") + (a.heure || "")).localeCompare((b.date_rdv || "9999") + (b.heure || "")));
  const past = rows.filter(r => r.date_rdv && r.date_rdv < today)
    .sort((a, b) => ((b.date_rdv || "") + (b.heure || "")).localeCompare((a.date_rdv || "") + (a.heure || "")));

  document.getElementById("rdv-tbody").innerHTML = upcoming.length ? upcoming.map(rowHtml).join("") : `<tr class="empty-row"><td colspan="7">Aucun rendez-vous à venir</td></tr>`;
  document.getElementById("rdv-past-tbody").innerHTML = past.length ? past.map(rowHtml).join("") : `<tr class="empty-row"><td colspan="7">Aucun rendez-vous passé</td></tr>`;
}
function openRdvDialog(id) {
  const row = id ? cache.rdv.find(r => r.id === id) : {};
  openModal({
    title: id ? "Modifier le RDV" : "Nouveau RDV", table: "rdv", id,
    fields: [
      { key: "objet", label: "Objet", type: "text", value: row.objet },
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id), value: row.contact_id, numeric: true },
      { key: "evenement_id", label: "Lié à un évènement", type: "select-raw", optionsHtml: `<option value="">—</option>` + evenementOptionsHtml(row.evenement_id), value: row.evenement_id, numeric: true },
      { key: "date_rdv", label: "Date", type: "date", value: row.date_rdv },
      { key: "heure", label: "Heure", type: "time", value: row.heure },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_RDV, value: row.statut || "Prévu" },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onSaved: refreshAll,
  });
}

// ========================================================================
//  TARIFICATION (grille tarifaire)
// ========================================================================
function renderGrille() {
  bindSearch("grille-search", renderGrille);
  ensureFilterOptions("grille-filter-saison", SAISONS);
  const search = (document.getElementById("grille-search").value || "").toLowerCase();
  const fSaison = document.getElementById("grille-filter-saison").value;
  let rows = [...cache.grille_tarifaire];
  if (search) rows = rows.filter(g => ((g.nom_presta || "") + " " + (g.details || "")).toLowerCase().includes(search));
  if (fSaison) rows = rows.filter(g => (g.saison || "Toute l'année") === fSaison);
  const tbody = document.getElementById("grille-tbody");
  tbody.innerHTML = rows.length ? rows.map(g => `
    <tr>
      <td>${g.nom_presta || "—"}</td><td>${g.details || "—"}</td><td>${g.saison || "Toute l'année"}</td>
      <td><strong>${g.pu_ttc != null ? g.pu_ttc + " €" : "—"}</strong></td><td>${g.tva != null ? g.tva + " %" : "—"}</td>
      <td>${g.montant_tva != null ? g.montant_tva + " €" : "—"}</td><td>${g.pu_ht != null ? g.pu_ht + " €" : "—"}</td>
      <td class="row-actions"><button onclick="openGrilleDialog(${g.id})">✎</button><button onclick="confirmDelete('grille_tarifaire', ${g.id}, renderGrille)">🗑</button></td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="8">Aucune prestation — ajoute ta première ligne</td></tr>`;
}
function openGrilleDialog(id) {
  const row = id ? findGrille(id) : {};
  openModal({
    title: id ? "Modifier la prestation" : "Nouvelle prestation", table: "grille_tarifaire", id,
    fields: [
      { key: "nom_presta", label: "Nom de la prestation", type: "text", required: true, value: row.nom_presta },
      { key: "details", label: "Détails", type: "textarea", value: row.details },
      { key: "saison", label: "Saison", type: "select", options: SAISONS, value: row.saison || "Toute l'année" },
      { key: "pu_ttc", label: "PU TTC (€)", type: "number", value: row.pu_ttc },
      { key: "tva", label: "TVA (%)", type: "select", options: TVA_RATES, value: row.tva != null ? row.tva : 20 },
      { key: "montant_tva", label: "Montant TVA (€) — calculé", type: "computed", value: row.montant_tva },
      { key: "pu_ht", label: "PU HT (€) — calculé", type: "computed", value: row.pu_ht },
    ],
    onRender: (form) => {
      const calc = () => { const ttc = Number(form.elements["pu_ttc"].value || 0); const tva = Number(form.elements["tva"].value || 0); const ht = round2(ttc / (1 + tva / 100)); form.elements["pu_ht"].value = ttc ? ht : ""; form.elements["montant_tva"].value = ttc ? round2(ttc - ht) : ""; };
      form.elements["pu_ttc"].addEventListener("input", calc);
      form.elements["tva"].addEventListener("change", calc);
      calc();
    },
    onSaved: refreshAll,
  });
}

// ========================================================================
//  COMMANDE (articles réutilisables)
// ========================================================================
function renderCommande() {
  ensureFilterOptions("commande-filter-statut", STATUTS_COMMANDE);
  bindSearch("commande-search", renderCommande);
  const search = (document.getElementById("commande-search").value || "").toLowerCase();
  const filter = document.getElementById("commande-filter-statut").value;
  let rows = [...cache.commandes];
  if (filter) rows = rows.filter(c => c.statut === filter);
  if (search) rows = rows.filter(c => ((c.article || "") + " " + (c.fournisseur || "") + " " + (c.categorie || "")).toLowerCase().includes(search));

  // datalists réutilisables (articles + fournisseurs déjà saisis)
  const arts = [...new Set(cache.commandes.map(c => c.article).filter(Boolean))];
  const fours = [...new Set(cache.commandes.map(c => c.fournisseur).filter(Boolean))];
  document.getElementById("commande-articles").innerHTML = arts.map(a => `<option value="${a.replace(/"/g, "&quot;")}">`).join("");
  document.getElementById("commande-fournisseurs").innerHTML = fours.map(a => `<option value="${a.replace(/"/g, "&quot;")}">`).join("");

  const tbody = document.getElementById("commande-tbody");
  tbody.innerHTML = rows.length ? rows.map(c => {
    const e = c.evenement_id ? findEvenement(c.evenement_id) : null;
    return `<tr>
      <td>${c.article || "—"}</td><td>${c.quantite != null ? c.quantite : "—"}</td>
      <td>${c.fournisseur || "—"}</td>
      <td>${e ? eventLabel(e) : "—"}</td>
      <td>${e ? eventDateLabel(e) : "—"}</td>
      <td>${fmtDateFR(c.date_commande) || "—"}</td>
      <td>${badge(c.statut, STATUT_COLORS[c.statut])}</td><td>${c.notes || "—"}</td>
      <td class="row-actions"><button onclick="openCommandeDialog(${c.id})">✎</button><button onclick="confirmDelete('commandes', ${c.id}, renderCommande)">🗑</button></td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="9">Aucune commande — ajoute ta première commande</td></tr>`;
}
function openCommandeDialog(id) {
  const row = id ? cache.commandes.find(c => c.id === id) : {};
  openModal({
    title: id ? "Modifier la commande" : "Nouvelle commande", table: "commandes", id,
    fields: [
      { key: "article", label: "Article", type: "text", required: true, value: row.article, list: "commande-articles" },
      { key: "quantite", label: "Quantité", type: "number", value: row.quantite },
      { key: "fournisseur", label: "Fournisseur", type: "text", value: row.fournisseur, list: "commande-fournisseurs" },
      { key: "categorie", label: "Catégorie", type: "text", value: row.categorie },
      { key: "evenement_id", label: "Évènement lié (facultatif)", type: "select-raw", optionsHtml: `<option value="">— Aucun —</option>` + evenementOptionsHtml(row.evenement_id), value: row.evenement_id, numeric: true },
      { key: "date_commande", label: "Date de commande", type: "date", value: row.date_commande },
      { key: "statut", label: "Statut", type: "select", options: STATUTS_COMMANDE, value: row.statut || "À commander" },
      { key: "notes", label: "Description", type: "textarea", value: row.notes },
    ],
    onSaved: async (saved) => {
      if (saved.date_commande) {
        const existing = cache.todos.find(t => t.commande_id === saved.id && t.titre === "Passer commande");
        if (existing) {
          if (existing.date_echeance !== saved.date_commande) await updateRow("todos", existing.id, { date_echeance: saved.date_commande });
        } else {
          await insertRow("todos", { titre: "Passer commande", description: saved.article ? "Article : " + saved.article : null, commande_id: saved.id, date_echeance: saved.date_commande, statut: "À faire", priorite: "Normale" });
        }
      }
      await refreshAll();
    },
  });
}

// ========================================================================
//  CALENDRIER
// ========================================================================
const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DOW_FR = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
function renderCalendrier() {
  document.getElementById("cal-grid").style.display = calState.view === "month" ? "grid" : "none";
  document.getElementById("cal-year-grid").style.display = calState.view === "year" ? "grid" : "none";
  document.getElementById("cal-view-select").value = calState.view;
  if (calState.view === "year") { renderCalendrierYear(); return; }
  renderCalendrierMonth();
}
function renderCalendrierYear() {
  const { year } = calState;
  document.getElementById("cal-month-lbl").textContent = String(year);
  const eventsByMonth = {};
  cache.evenements.forEach(e => {
    if (!e.date_evenement) return;
    const [y, m] = e.date_evenement.split("-").map(Number);
    if (y === year) (eventsByMonth[m] = eventsByMonth[m] || []).push(e);
  });
  document.getElementById("cal-year-grid").innerHTML = MOIS_FR.map((mLabel, i) => {
    const m = i + 1;
    const evts = (eventsByMonth[m] || []).sort((a, b) => (a.date_evenement || "").localeCompare(b.date_evenement || ""));
    const items = evts.slice(0, 4).map(e => `<div class="yc-item">${e.date_evenement.slice(8, 10)} — ${contactLabel(findContact(e.contact_id))}</div>`).join("");
    return `<div class="cal-year-month" onclick="goToCalMonth(${year},${m})">
      <h4>${mLabel}</h4>
      <div class="yc-count">${evts.length} évènement${evts.length > 1 ? "s" : ""}</div>
      ${items}${evts.length > 4 ? `<div class="yc-item">+ ${evts.length - 4} autre(s)</div>` : ""}
    </div>`;
  }).join("");
  document.getElementById("cal-day-lbl").textContent = "Évènements du jour";
  document.getElementById("cal-day-tbody").innerHTML = `<tr class="empty-row"><td colspan="4">Clique sur un mois pour le détailler</td></tr>`;
}
function goToCalMonth(year, month) { calState.year = year; calState.month = month; calState.view = "month"; calState.selected = null; renderCalendrier(); }
function renderCalendrierMonth() {
  const { year, month } = calState;
  document.getElementById("cal-month-lbl").textContent = `${MOIS_FR[month - 1]} ${year}`;
  const eventsByDay = {};
  cache.evenements.forEach(e => {
    if (!e.date_evenement) return;
    const [y, m, d] = e.date_evenement.split("-").map(Number);
    if (y === year && m === month) (eventsByDay[d] = eventsByDay[d] || []).push(e);
  });
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayIso = todayStr();
  let html = DOW_FR.map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = iso === todayIso, isSelected = iso === calState.selected;
    const n = eventsByDay[day] ? eventsByDay[day].length : 0;
    html += `<div class="cal-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" onclick="selectCalDay('${iso}')"><div>${day}</div>${n ? `<div class="evt-dot">● ${n} évt</div>` : ""}</div>`;
  }
  document.getElementById("cal-grid").innerHTML = html;
  if (!calState.selected || !calState.selected.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
    calState.selected = (month === new Date().getMonth() + 1 && year === new Date().getFullYear()) ? todayIso : null;
  }
  renderCalDay();
}
function selectCalDay(iso) { calState.selected = iso; renderCalendrier(); }
function renderCalDay() {
  const lbl = document.getElementById("cal-day-lbl"), tbody = document.getElementById("cal-day-tbody");
  if (!calState.selected) { lbl.textContent = "Évènements du jour"; tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Sélectionne un jour</td></tr>`; return; }
  lbl.textContent = "Évènements du " + fmtDateFR(calState.selected);
  const rows = cache.evenements.filter(e => e.date_evenement === calState.selected).sort((a, b) => (a.heure_debut || "").localeCompare(b.heure_debut || ""));
  tbody.innerHTML = rows.length ? rows.map(e => `<tr onclick="openEvenementDialog(${e.id})" style="cursor:pointer;"><td>${e.heure_debut || "—"}</td><td>${eventLabel(e)}</td><td>${e.type_evenement || ""}</td><td>${badge(e.statut, STATUT_COLORS[e.statut])}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="4">Aucun évènement — clique pour en ajouter un</td></tr>`;
}

// ========================================================================
//  MODAL GENERIQUE
// ========================================================================
function escapeAttr(v) { return String(v).replace(/"/g, "&quot;"); }

// Filtres/recherches par table — remis à zéro après une création pour
// garantir que le nouvel élément soit visible (sinon un filtre actif,
// ex. "Envoyée", masquerait une nouvelle facture "Brouillon").
const PAGE_FILTERS = {
  factures: ["facture-filter-statut", "facture-search"],
  devis: ["devis-filter-statut", "devis-search"],
  contacts: ["contact-filter-categorie", "contact-search"],
  evenements: ["evenement-filter-type", "evenement-filter-mois", "evenement-filter-statut"],
  todos: ["todo-filter-statut", "todo-filter-priorite"],
  rdv: ["rdv-filter-statut"],
  commandes: ["commande-filter-statut", "commande-search"],
  grille_tarifaire: ["grille-search"],
  prospects: ["prospect-filter-statut"],
};
function clearTableFilters(table) {
  (PAGE_FILTERS[table] || []).forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
}
function openNotesPanel(title, table, id, value, onSaved) {
  document.getElementById("notes-panel-title").textContent = title;
  document.getElementById("notes-panel-textarea").value = value || "";
  document.getElementById("notes-panel").classList.add("open");
  document.getElementById("notes-panel-overlay").classList.add("open");
  document.getElementById("notes-panel-save").onclick = async () => {
    const val = document.getElementById("notes-panel-textarea").value;
    const saved = await updateRow(table, id, { notes: val });
    if (saved) { showToast("Notes enregistrées"); closeNotesPanel(); if (onSaved) await onSaved(); }
  };
}
function closeNotesPanel() {
  document.getElementById("notes-panel").classList.remove("open");
  document.getElementById("notes-panel-overlay").classList.remove("open");
}

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
    } else if (f.type === "select-other") {
      const opts = f.options || [];
      const isOther = f.value != null && f.value !== "" && !opts.includes(f.value);
      input = `<select name="${f.key}__sel">` +
        (f.allowEmpty !== false ? `<option value="">—</option>` : ``) +
        opts.map(o => `<option value="${escapeAttr(o)}" ${o === f.value ? "selected" : ""}>${o}</option>`).join("") +
        `<option value="__other__" ${isOther ? "selected" : ""}>Autre…</option></select>` +
        `<input name="${f.key}__txt" placeholder="Préciser…" value="${isOther ? escapeAttr(f.value) : ""}" style="margin-top:6px;${isOther ? "" : "display:none;"}">`;
    } else if (f.type === "radioset") {
      input = `<div class="inline-checks">` + (f.options || []).map(o => `<label><input type="checkbox" data-radio="${f.key}" name="${f.key}__${o}" ${f.value === o ? "checked" : ""}>${o}</label>`).join("") + `</div>`;
    } else if (f.type === "textarea") {
      input = `<textarea name="${f.key}">${f.value || ""}</textarea>`;
    } else if (f.type === "checkbox") {
      input = `<input type="checkbox" name="${f.key}" ${f.value ? "checked" : ""} style="width:auto;">`;
    } else if (f.type === "file") {
      input = `<input type="file" name="${f.key}" accept="${f.accept || "*"}">`;
    } else if (f.type === "computed") {
      input = `<input type="number" name="${f.key}" value="${f.value != null ? escapeAttr(f.value) : ""}" readonly style="background:#F3F2EE;color:var(--muted);">`;
    } else {
      input = `<input type="${f.type}" name="${f.key}" ${f.list ? `list="${f.list}"` : ""} value="${f.value != null ? escapeAttr(f.value) : ""}" ${f.required ? "required" : ""}>`;
    }
    return `<div class="field"><label>${f.label}${f.required ? " *" : ""}</label>${input}</div>`;
  }).join("");

  // select-other : bascule du champ texte
  form.querySelectorAll('select[name$="__sel"]').forEach(sel => {
    sel.addEventListener("change", () => {
      const txt = form.elements[sel.name.replace("__sel", "__txt")];
      if (txt) txt.style.display = sel.value === "__other__" ? "" : "none";
    });
  });
  // radioset : comportement bouton radio
  form.querySelectorAll('input[data-radio]').forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) form.querySelectorAll(`input[data-radio="${cb.dataset.radio}"]`).forEach(o => { if (o !== cb) o.checked = false; });
    });
  });

  document.getElementById("modal-save").style.display = "inline-block";
  document.getElementById("modal-save").onclick = saveModal;
  document.getElementById("modal-cancel").textContent = "Annuler";
  document.getElementById("modal-delete").style.display = id ? "inline-block" : "none";
  document.getElementById("modal-overlay").classList.add("open");
  if (onRender) onRender(form);
}
// Modal "brut" avec html custom + un bouton de confirmation
function openRawModal(title, html, onConfirm) {
  modalContext = null;
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-form").innerHTML = html;
  document.getElementById("modal-delete").style.display = "none";
  document.getElementById("modal-cancel").textContent = "Annuler";
  const save = document.getElementById("modal-save");
  save.style.display = "inline-block"; save.textContent = "Valider"; save.onclick = onConfirm;
  document.getElementById("modal-overlay").classList.add("open");
}
function showInfoModal(title, html) {
  modalContext = null;
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-form").innerHTML = html;
  document.getElementById("modal-save").style.display = "none";
  document.getElementById("modal-delete").style.display = "none";
  document.getElementById("modal-cancel").textContent = "Fermer";
  document.getElementById("modal-overlay").classList.add("open");
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.getElementById("modal-save").textContent = "Enregistrer";
  document.getElementById("modal-save").onclick = saveModal;
  const oldBtn = document.getElementById("modal-print-btn");
  if (oldBtn) oldBtn.remove();
  modalContext = null;
}
async function saveModal() {
  if (!modalContext) return;
  const { table, id, fields, onSaved, beforeSave } = modalContext;
  const form = document.getElementById("modal-form");
  const values = {}; const fileFields = []; let missingRequired = false;
  fields.forEach(f => {
    if (f.type === "file") { fileFields.push({ f, el: form.elements[f.key] }); return; }
    if (f.type === "select-other") {
      const sel = form.elements[f.key + "__sel"], txt = form.elements[f.key + "__txt"];
      values[f.key] = sel.value === "__other__" ? (txt.value || null) : (sel.value || null);
      return;
    }
    if (f.type === "radioset") {
      let picked = null; (f.options || []).forEach(o => { const el = form.elements[f.key + "__" + o]; if (el && el.checked) picked = o; });
      values[f.key] = picked; return;
    }
    const el = form.elements[f.key]; if (!el) return;
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
  if (id) saved = await updateRow(table, id, values);
  else saved = await insertRow(table, values);

  // Échec : l'erreur réelle a déjà été affichée ; on garde le formulaire ouvert.
  if (!saved) return;

  // Après une création, on enlève les filtres actifs pour que le nouvel élément soit visible
  if (!id) clearTableFilters(table);

  for (const { f, el } of fileFields) {
    if (el && el.files && el.files[0]) {
      const path = `${currentUser.id}/${table}-${saved.id}.pdf`;
      const { error } = await sb.storage.from("devis-signes").upload(path, el.files[0], { upsert: true, contentType: "application/pdf" });
      if (error) { showToast("Erreur envoi PDF"); console.error(error); }
      else await updateRow(table, saved.id, { pdf_path: path });
    }
  }
  showToast(id ? "Modifications enregistrées" : "Ajouté avec succès");
  closeModal();
  if (onSaved) await onSaved(saved);
}
function confirmDelete(table, id, afterFn) {
  if (!confirm("Supprimer cet élément ? Cette action est irréversible.")) return;
  deleteRow(table, id).then(async ok => {
    if (ok) { showToast("Supprimé"); await refreshCache(); if (afterFn) afterFn(); else renderPage(currentPage); }
  });
}

// ========================================================================
//  INIT
// ========================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("auth-submit").addEventListener("click", handleAuthSubmit);
  document.getElementById("auth-switch-link").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
  document.getElementById("auth-password").addEventListener("keydown", e => { if (e.key === "Enter") handleAuthSubmit(); });
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("menu-toggle-btn").addEventListener("click", openMobileMenu);
  document.getElementById("sidebar-overlay").addEventListener("click", closeMobileMenu);
  document.getElementById("notes-panel-close").addEventListener("click", closeNotesPanel);
  document.getElementById("notes-panel-cancel").addEventListener("click", closeNotesPanel);
  document.getElementById("notes-panel-overlay").addEventListener("click", closeNotesPanel);

  document.querySelectorAll(".nav-item").forEach(el => el.addEventListener("click", () => showPage(el.dataset.page)));

  document.getElementById("sc-devis").addEventListener("click", () => openDevisDialog(null));
  document.getElementById("sc-facture").addEventListener("click", () => openFactureDialog(null));
  document.getElementById("sc-contact").addEventListener("click", () => openContactDialog(null));
  document.getElementById("sc-evenement").addEventListener("click", () => openEvenementDialog(null));
  document.getElementById("sc-rdv").addEventListener("click", () => openRdvDialog(null));
  document.getElementById("sc-todo").addEventListener("click", () => openTodoDialog(null));

  document.getElementById("btn-new-todo").addEventListener("click", () => openTodoDialog(null));
  document.getElementById("btn-new-prospect").addEventListener("click", () => openEvenementDialog(null));
  document.getElementById("btn-new-devis").addEventListener("click", () => openDevisDialog(null));
  document.getElementById("btn-new-facture").addEventListener("click", () => openFactureDialog(null));
  document.getElementById("btn-new-contact").addEventListener("click", () => openContactDialog(null));
  document.getElementById("btn-new-evenement").addEventListener("click", () => openEvenementDialog(null));
  document.getElementById("btn-new-rdv").addEventListener("click", () => openRdvDialog(null));
  document.getElementById("btn-new-grille").addEventListener("click", () => openGrilleDialog(null));
  document.getElementById("btn-new-commande").addEventListener("click", () => openCommandeDialog(null));

  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  // NB : le bouton "Enregistrer" utilise la propriété onclick (définie dans openModal/
  // openRawModal) pour pouvoir changer d'action selon le contexte — pas d'addEventListener ici.
  document.getElementById("modal-delete").addEventListener("click", () => {
    if (modalContext && modalContext.id) { confirmDelete(modalContext.table, modalContext.id, () => renderPage(currentPage)); closeModal(); }
  });
  document.getElementById("modal-overlay").addEventListener("click", e => { if (e.target.id === "modal-overlay") closeModal(); });

  // éditeur de devis
  document.getElementById("ed-add-line").addEventListener("click", addEditorLine);
  document.getElementById("ed-close").addEventListener("click", closeDevisEditor);
  document.getElementById("ed-save").addEventListener("click", () => saveDevisEditor(false));
  document.getElementById("ed-pdf").addEventListener("click", () => { readEditorToState(); generateDevisPDF(edState.id); });
  document.getElementById("ed-finaliser").addEventListener("click", openCgvPicker);
  document.getElementById("ed-lines").addEventListener("input", () => { readEditorToState(); recomputeEditor(); });
  document.getElementById("ed-lines").addEventListener("change", (e) => {
    if (e.target.dataset.k === "designation") {
      const tr = e.target.closest("tr"); const i = Number(tr.dataset.i);
      const g = cache.grille_tarifaire.find(x => (x.nom_presta || "").toLowerCase() === e.target.value.toLowerCase());
      if (g && g.pu_ttc != null) { edState.lignes[i].pu_ttc = g.pu_ttc; if ([10, 20].includes(Number(g.tva))) edState.lignes[i].tva = Number(g.tva); renderEditorLines(); }
    }
  });

  document.getElementById("cal-prev").addEventListener("click", () => {
    if (calState.view === "year") { calState.year--; renderCalendrier(); return; }
    calState.month--; if (calState.month < 1) { calState.month = 12; calState.year--; } calState.selected = null; renderCalendrier();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    if (calState.view === "year") { calState.year++; renderCalendrier(); return; }
    calState.month++; if (calState.month > 12) { calState.month = 1; calState.year++; } calState.selected = null; renderCalendrier();
  });
  document.getElementById("cal-view-select").addEventListener("change", (e) => { calState.view = e.target.value; renderCalendrier(); });

  document.addEventListener("keydown", e => {
    if (!currentUser) return;
    if (e.ctrlKey && e.key === "d") { e.preventDefault(); openDevisDialog(null); }
    if (e.ctrlKey && e.key === "k") { e.preventDefault(); openContactDialog(null); }
    if (e.ctrlKey && e.key === "e") { e.preventDefault(); openEvenementDialog(null); }
    if (e.ctrlKey && e.key === "t") { e.preventDefault(); openTodoDialog(null); }
  });

  sb.auth.getSession().then(({ data }) => { if (data.session) onLoggedIn(data.session.user); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
});
