// ========================================================================
//  GESTION RECEPTION — PWA
//  Backend : Supabase (auth + base de données, synchronisé multi-appareils)
// ========================================================================

// ---- 1) CONFIGURATION ----
const SUPABASE_URL = "https://fmstfqzmahhidvyespwk.supabase.co";
// Client ID Google (public par nature, sans risque à exposer côté front —
// le Client Secret, lui, ne vit que côté serveur dans les Edge Functions).
const GOOGLE_CLIENT_ID = "497117069759-kaoespvo17tbkt6tsk3btgl9bd3ep7pd.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtc3RmcXptYWhoaWR2eWVzcHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODg4OTEsImV4cCI6MjEwMDQ2NDg5MX0.ObX6Xpg_ugP70d8Jf6WJNhsXezXUS8j7qIAo6ZQIqg4";
let rememberMe = true;
const dynamicAuthStorage = {
  getItem: (key) => { try { return localStorage.getItem(key) || sessionStorage.getItem(key); } catch (e) { return null; } },
  setItem: (key, value) => {
    try {
      if (rememberMe) { localStorage.setItem(key, value); sessionStorage.removeItem(key); }
      else { sessionStorage.setItem(key, value); localStorage.removeItem(key); }
    } catch (e) {}
  },
  removeItem: (key) => { try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch (e) {} },
};
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: dynamicAuthStorage, persistSession: true, autoRefreshToken: true },
});

// ---- Connexion Google (Calendrier + Gmail) ----
const FUNCTIONS_URL = SUPABASE_URL.replace(".supabase.co", ".supabase.co/functions/v1");
let googleConnected = false;
let googleEmail = "";

async function callGoogleFunction(name, payload) {
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData && sessionData.session ? sessionData.session.access_token : null;
  if (!token) throw new Error("Session expirée");
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

async function checkGoogleConnection() {
  try {
    const { data, error } = await sb.from("google_auth").select("google_email").maybeSingle();
    googleConnected = !!(data && data.google_email);
    googleEmail = (data && data.google_email) || "";
  } catch (e) { googleConnected = false; }
  updateGoogleStatusUI();
}
function updateGoogleStatusUI() {
  const el = document.getElementById("google-status-label");
  if (el) el.textContent = googleConnected ? `Connecté (${googleEmail})` : "Non connecté";
  const btn = document.getElementById("btn-connect-google");
  if (btn) btn.textContent = googleConnected ? "Reconnecter Google" : "Connecter Google";
}
async function connectGoogle() {
  try {
    const data = await callGoogleFunction("google-oauth-start", { returnUrl: window.location.href });
    window.location.href = data.url;
  } catch (e) {
    showToast("Erreur : " + e.message);
  }
}

// ---- Synchronisation Google Agenda pour un évènement ----
async function syncEventToGoogle(ev) {
  if (!googleConnected) return;
  try {
    const c = findContact(ev.contact_id);
    const summary = `${ev.type_evenement || "Évènement"} — ${contactLabel(c)}`;
    const payload = {
      action: ev.google_event_id ? "update" : "create",
      googleEventId: ev.google_event_id || null,
      event: {
        summary,
        description: ev.notes || "",
        date_debut: ev.date_evenement,
        date_fin: ev.date_fin || ev.date_evenement,
        heure_debut: ev.heure_debut || null,
        heure_fin: ev.heure_fin || null,
      },
    };
    const res = await callGoogleFunction("google-calendar-sync", payload);
    if (res.googleEventId && res.googleEventId !== ev.google_event_id) {
      await updateRow("evenements", ev.id, { google_event_id: res.googleEventId, google_synced: true });
    }
  } catch (e) {
    showToast("Synchro Google Agenda échouée : " + e.message);
  }
}
async function deleteEventFromGoogle(ev) {
  if (!googleConnected || !ev.google_event_id) return;
  try { await callGoogleFunction("google-calendar-sync", { action: "delete", googleEventId: ev.google_event_id }); } catch (e) { /* silencieux */ }
}

// ---- Envoi d'une relance par Gmail ----
async function sendGoogleMail(to, subject, body) {
  if (!googleConnected) { showToast("Connecte d'abord ton compte Google (bas de la sidebar)."); return false; }
  try {
    await callGoogleFunction("google-send-mail", { to, subject, body });
    showToast("Relance envoyée");
    return true;
  } catch (e) {
    showToast("Erreur d'envoi : " + e.message);
    return false;
  }
}

// ---- Jeu d'icônes SVG (style trait fin, remplace les emojis) ----
const ICON_PATHS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M9 22V12h6v10"/>',
  "check-square": '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  "calendar-days": '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  receipt: '<path d="M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/>',
  tag: '<path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  "more-horizontal": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
};
// ---- Intégration Google (Gmail + Agenda) ----
// Déjà géré plus haut par callGoogleFunction / checkGoogleConnection / connectGoogle
// / syncEventToGoogle / sendGoogleMail — voir tête de fichier.

function icon(name, size) {
  size = size || 16;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;">${ICON_PATHS[name] || ""}</svg>`;
}

// ---- Thème clair / sombre ----
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("crm-theme", theme); } catch (e) {}
  const lbl = document.getElementById("theme-toggle-label");
  if (lbl) lbl.textContent = theme === "dark" ? "Mode clair" : "Mode sombre";
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) btn.querySelector("svg").innerHTML = theme === "dark"
    ? ICON_PATHS.sun
    : ICON_PATHS.moon;
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("crm-theme"); } catch (e) {}
  if (!saved) saved = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  applyTheme(saved);
}
initTheme();

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
const TYPES_PRESTATAIRE = ["Traiteur", "Décorateur", "Animateur", "Fleuriste", "DJ", "Chanteur/Musicien", "Photographe", "Hébergement", "Organisateur"];
const TVA_DEVIS = [10, 20];
const CGV_OPTIONS_DEFAUT = [
  "Paiement du solde à la date de l'événement.",
  "30% d'acompte à la réservation.",
  "30% : 1 mois avant la date de l'événement.",
  "Paiement du solde à réception de la facture qui sera envoyée 7 jours avant la date de l'événement.",
];
function getCgvTexts() {
  return cache.cgv_options.length ? cache.cgv_options.map(c => c.texte) : CGV_OPTIONS_DEFAUT;
}

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
let cache = { contacts: [], prospects: [], devis: [], evenements: [], todos: [], grille_tarifaire: [], rdv: [], factures: [], commandes: [], prestataires: [], notes: [], note_categories: [], cgv_options: [], types_facture: [] };
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
function showToast(msg, type) {
  if (!type) type = /erreur|échec|obligatoire|introuvable|indisponible|impossible/i.test(msg) ? "error" : "success";
  const t = document.getElementById("toast");
  t.innerHTML = `<span class="toast-icon">${icon(type === "error" ? "alert-triangle" : "check", 16)}</span><span>${msg}</span>`;
  t.className = "toast toast-" + type + " show";
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function badge(text, color) {
  if (!text) return "";
  const c = color || "var(--muted)";
  return `<span class="badge" style="background:color-mix(in srgb, ${c} 16%, var(--card));color:${c};border:1px solid color-mix(in srgb, ${c} 35%, transparent);">${text}</span>`;
}
// ---- Export comptable CSV ----
function exportCSV(filename, headers, rows) {
  const esc = v => { const s = (v == null ? "" : String(v)).replace(/"/g, '""'); return /[",;\n]/.test(s) ? `"${s}"` : s; };
  const lines = [headers.map(esc).join(";"), ...rows.map(r => r.map(esc).join(";"))];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Export CSV téléchargé");
}
function exportDevisCSV() {
  const rows = cache.devis.map(d => {
    const e = devisEvent(d), c = devisContact(d);
    return [d.numero || "", contactLabel(c), e ? eventLabel(e) : "", fmtDateFR((d.date_creation || "").slice(0, 10)), d.montant_ht ?? "", d.montant_ttc ?? "", d.statut || ""];
  });
  exportCSV("export_devis.csv", ["Numéro", "Contact", "Évènement", "Date création", "Montant HT", "Montant TTC", "Statut"], rows);
}
function exportFacturesCSV() {
  const rows = cache.factures.map(f => {
    const c = findContact(f.contact_id), dev = f.devis_id ? findDevis(f.devis_id) : null;
    return [f.numero || "", contactLabel(c), dev ? (dev.numero || "") : "", fmtDateFR(f.date_facture), f.montant_ht ?? "", f.montant_ttc ?? "", f.statut || ""];
  });
  exportCSV("export_factures.csv", ["Numéro", "Contact", "Devis lié", "Date facture", "Montant HT", "Montant TTC", "Statut"], rows);
}

// ---- Recherche globale (Ctrl/Cmd+K) ----
function openGlobalSearch() {
  document.getElementById("gsearch-overlay").classList.add("open");
  const input = document.getElementById("gsearch-input");
  input.value = "";
  renderGlobalSearchResults("");
  setTimeout(() => input.focus(), 30);
}
function closeGlobalSearch() { document.getElementById("gsearch-overlay").classList.remove("open"); }
function renderGlobalSearchResults(qRaw) {
  const q = (qRaw || "").trim().toLowerCase();
  const wrap = document.getElementById("gsearch-results");
  if (!q) { wrap.innerHTML = `<div class="gsearch-empty">Tape pour rechercher parmi tes contacts, devis et évènements.</div>`; return; }

  const contactsRes = cache.contacts.filter(c => (contactLabel(c) + " " + (c.societe || "") + " " + (c.email || "")).toLowerCase().includes(q)).slice(0, 6);
  const devisRes = cache.devis.filter(d => ((d.numero || "") + " " + contactLabel(devisContact(d))).toLowerCase().includes(q)).slice(0, 6);
  const eventsRes = cache.evenements.filter(e => (contactLabel(findContact(e.contact_id)) + " " + (e.type_evenement || "")).toLowerCase().includes(q)).slice(0, 6);

  const groups = [
    { label: "Contacts", ic: "user", items: contactsRes.map(c => ({ title: contactLabel(c), sub: c.societe || c.email || "", onclick: `closeGlobalSearch();showPage('contacts');openContactDialog(${c.id})` })) },
    { label: "Devis", ic: "file-text", items: devisRes.map(d => ({ title: d.numero || "Devis", sub: contactLabel(devisContact(d)) + (d.statut ? " · " + d.statut : ""), onclick: `closeGlobalSearch();showPage('devis');openDevisEditor(${d.id})` })) },
    { label: "Évènements", ic: "calendar", items: eventsRes.map(e => ({ title: eventLabel(e), sub: e.type_evenement || "", onclick: `closeGlobalSearch();showPage('evenements');openEventRecap(${e.id})` })) },
  ];
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  if (!total) { wrap.innerHTML = `<div class="gsearch-empty">Aucun résultat pour « ${qRaw} ».</div>`; return; }

  wrap.innerHTML = groups.filter(g => g.items.length).map(g => `
    <div class="gsearch-group-label">${g.label}</div>
    ${g.items.map(it => `<div class="gsearch-item" onclick="${it.onclick}">
      <span class="gi-icon">${icon(g.ic, 16)}</span>
      <span><div>${it.title}</div><div class="gi-sub">${it.sub || ""}</div></span>
    </div>`).join("")}`).join("");
}

// ---- Centre de notifications ----
function computeAlerts() {
  const alerts = [];
  const today = todayStr();
  const in3days = addDaysISO(today, 3);
  const in2days = addDaysISO(today, 2);

  cache.devis.forEach(d => {
    if (d.statut === "Expiré") {
      alerts.push({ id: `devis-exp-${d.id}`, level: "danger", ic: "file-text", msg: `Devis ${d.numero || d.id} expiré`, onclick: `showPage('devis');openDevisEditor(${d.id})` });
    } else if ((d.statut === "Envoyé" || d.statut === "En attente") && d.date_validite && d.date_validite >= today && d.date_validite <= in3days) {
      alerts.push({ id: `devis-soon-${d.id}`, level: "warning", ic: "file-text", msg: `Devis ${d.numero || d.id} expire le ${fmtDateFR(d.date_validite)}`, onclick: `showPage('devis');openDevisEditor(${d.id})` });
    }
  });

  cache.factures.forEach(f => {
    if (!["Payée", "Annulée"].includes(f.statut) && f.date_echeance && f.date_echeance < today) {
      alerts.push({ id: `facture-late-${f.id}`, level: "danger", ic: "receipt", msg: `Facture ${f.numero || f.id} en retard de paiement`, onclick: `showPage('factures');openFactureDialog(${f.id})` });
    }
  });

  cache.todos.forEach(t => {
    if (t.statut === "Terminé" || !t.date_echeance) return;
    if (t.date_echeance < today) alerts.push({ id: `todo-late-${t.id}`, level: "danger", ic: "check-square", msg: `Tâche en retard : ${t.titre}`, onclick: `showPage('todo')` });
    else if (t.date_echeance <= in3days) alerts.push({ id: `todo-soon-${t.id}`, level: "warning", ic: "check-square", msg: `Tâche bientôt due : ${t.titre} (${fmtDateFR(t.date_echeance)})`, onclick: `showPage('todo')` });
  });

  cache.rdv.forEach(r => {
    if (r.statut === "Annulé" || !r.date_rdv) return;
    if (r.date_rdv >= today && r.date_rdv <= in2days) alerts.push({ id: `rdv-soon-${r.id}`, level: "info", ic: "users", msg: `RDV proche : ${r.objet || "RDV"} le ${fmtDateFR(r.date_rdv)}`, onclick: `showPage('todo')` });
  });

  cache.commandes.forEach(c => {
    if (["Commandé", "Reçu"].includes(c.statut) || !c.date_commande) return;
    if (c.date_commande >= today && c.date_commande <= in3days) alerts.push({ id: `commande-soon-${c.id}`, level: "warning", ic: "package", msg: `Commande à passer bientôt : ${c.article || "article"}`, onclick: `showPage('commande')` });
    else if (c.date_commande < today) alerts.push({ id: `commande-late-${c.id}`, level: "danger", ic: "package", msg: `Commande en retard : ${c.article || "article"}`, onclick: `showPage('commande')` });
  });

  const order = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

function renderNotifPanel() {
  const alerts = computeAlerts();
  const countEl = document.getElementById("notif-bell-count");
  if (alerts.length) { countEl.textContent = alerts.length > 9 ? "9+" : alerts.length; countEl.style.display = "flex"; }
  else countEl.style.display = "none";

  const enableBtn = document.getElementById("notif-enable-btn");
  if ("Notification" in window) {
    if (Notification.permission === "granted") { enableBtn.textContent = "Alertes navigateur activées"; enableBtn.disabled = true; }
    else if (Notification.permission === "denied") { enableBtn.textContent = "Alertes bloquées par le navigateur"; enableBtn.disabled = true; }
    else { enableBtn.textContent = "Activer les alertes navigateur"; enableBtn.disabled = false; }
  } else { enableBtn.style.display = "none"; }

  const levelColor = { danger: "var(--danger)", warning: "var(--warning)", info: "var(--info)" };
  document.getElementById("notif-list").innerHTML = alerts.length ? alerts.map(a => `
    <div class="notif-item" onclick="closeNotifPanel();${a.onclick}">
      <span class="ni-icon" style="color:${levelColor[a.level]};">${icon(a.ic, 16)}</span>
      <span>${a.msg}</span>
    </div>`).join("") : `<div class="notif-empty">Aucune alerte pour le moment — tout est à jour.</div>`;

  maybeSendBrowserNotifications(alerts);
  return alerts;
}
function toggleNotifPanel() {
  const panel = document.getElementById("notif-panel");
  if (panel.classList.contains("open")) { closeNotifPanel(); return; }
  renderNotifPanel();
  panel.classList.add("open");
}
function closeNotifPanel() { document.getElementById("notif-panel").classList.remove("open"); }

function getNotifiedIds() {
  try { return new Set(JSON.parse(localStorage.getItem("crm-notified-ids") || "[]")); } catch (e) { return new Set(); }
}
function saveNotifiedIds(set) {
  try { localStorage.setItem("crm-notified-ids", JSON.stringify([...set])); } catch (e) {}
}
function maybeSendBrowserNotifications(alerts) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notified = getNotifiedIds();
  const fresh = alerts.filter(a => !notified.has(a.id));
  fresh.slice(0, 5).forEach(a => {
    try { new Notification("CRM CBLF", { body: a.msg, icon: "logo.png" }); } catch (e) {}
    notified.add(a.id);
  });
  if (fresh.length) saveNotifiedIds(notified);
}
async function enableBrowserNotifications() {
  if (!("Notification" in window)) { showToast("Ton navigateur ne supporte pas les notifications."); return; }
  const perm = await Notification.requestPermission();
  if (perm === "granted") { showToast("Alertes navigateur activées !"); renderNotifPanel(); }
  else showToast("Autorisation refusée — active-la dans les réglages du navigateur si tu changes d'avis.");
}

function inlineStatusSelect(table, id, field, options, current, renderFnName) {
  const color = STATUT_COLORS[current] || "var(--muted)";
  return `<select onclick="event.stopPropagation()" onchange="event.stopPropagation();updateInlineStatus('${table}',${id},'${field}',this.value,'${renderFnName}')" style="background:color-mix(in srgb, ${color} 16%, var(--card));color:${color};border:1px solid color-mix(in srgb, ${color} 35%, transparent);border-radius:999px;padding:3px 20px 3px 8px;font-size:11px;font-weight:bold;">
    ${options.map(o => `<option value="${o.replace(/"/g, "&quot;")}" ${o === current ? "selected" : ""}>${o}</option>`).join("")}
  </select>`;
}
async function updateInlineStatus(table, id, field, value, renderFnName) {
  const saved = await updateRow(table, id, { [field]: value });
  if (saved) { showToast("Mis à jour : " + value); await refreshCache(); if (window[renderFnName]) window[renderFnName](); }
}

function emptyState(colspan, message, ctaLabel, ctaOnclick) {
  return `<tr class="empty-row"><td colspan="${colspan}">
    <div class="empty-state">
      ${icon("inbox", 30)}
      <div class="es-msg">${message}</div>
      ${ctaOnclick ? `<button class="btn" onclick="${ctaOnclick}">${icon("plus", 14)} ${ctaLabel}</button>` : ""}
    </div>
  </td></tr>`;
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
  const [contacts, prospects, devisRows, evenements, todos, grille, rdv, factures, commandes, prestataires, notes, noteCategories, cgvOptions, typesFacture] = await Promise.all([
    fetchAll("contacts", "nom", true),
    fetchAll("prospects"),
    fetchAll("devis"),
    fetchAll("evenements"),
    fetchAll("todos"),
    fetchAll("grille_tarifaire", "nom_presta", true),
    fetchAll("rdv"),
    fetchAll("factures"),
    fetchAll("commandes", "article", true),
    fetchAll("prestataires"),
    fetchAll("notes"),
    fetchAll("note_categories", "nom", true),
    fetchAll("cgv_options", "ordre", true),
    fetchAll("types_facture", "designation", true),
  ]);
  cache = { contacts, prospects, devis: devisRows, evenements, todos, grille_tarifaire: grille, rdv, factures, commandes, prestataires, notes, note_categories: noteCategories, cgv_options: cgvOptions, types_facture: typesFacture };
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
  if (mode === "login") { t.textContent = "Connexion"; s.textContent = "Gestion Réception — accède à ton compte"; sub.textContent = "Se connecter"; st.textContent = "Pas encore de compte ?"; sl.textContent = "Créer un compte"; document.getElementById("auth-remember-row").style.display = "flex"; }
  else { t.textContent = "Créer un compte"; s.textContent = "Gestion Réception — synchronise tes données"; sub.textContent = "Créer mon compte"; st.textContent = "Déjà un compte ?"; sl.textContent = "Se connecter"; document.getElementById("auth-remember-row").style.display = "none"; }
}
function authError(msg) { const el = document.getElementById("auth-error"); el.textContent = msg; el.style.display = "block"; }
async function handleAuthSubmit() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || !password) { authError("Renseigne un email et un mot de passe."); return; }
  if (authMode === "login") {
    rememberMe = document.getElementById("auth-remember").checked;
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
  document.getElementById("app-loading").classList.add("open");
  document.getElementById("user-email-lbl").textContent = user.email;
  await refreshCache();
  await autoExpireDevis();
  showPage("dashboard");
  document.getElementById("app-loading").classList.remove("open");
  renderNotifPanel();
  clearInterval(window._notifInterval);
  window._notifInterval = setInterval(async () => { await refreshCache(); renderNotifPanel(); }, 5 * 60 * 1000);
  checkGoogleConnection();
  handleGoogleOAuthReturn();
}
function handleGoogleOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("google_connected")) {
    showToast("Compte Google connecté !");
    checkGoogleConnection();
  } else if (params.get("google_error")) {
    showToast("Erreur : connexion Google échouée (" + params.get("google_error") + ")");
  } else {
    return;
  }
  params.delete("google_connected");
  params.delete("google_error");
  const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
  window.history.replaceState({}, "", clean);
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
  else if (key === "prestataire") renderPrestataire();
  else if (key === "notes") renderNotes();
  else if (key === "relance") renderRelance();
}
// ========================================================================
//  RELANCE
// ========================================================================
function renderRelance() {
  const today = todayStr();
  const facturesRetard = cache.factures.filter(f => !["Payée", "Annulée"].includes(f.statut) && f.date_echeance && f.date_echeance < today);
  const devisAttente = cache.devis.filter(d => ["Envoyé", "En attente"].includes(d.statut));

  document.getElementById("relance-factures-tbody").innerHTML = facturesRetard.length ? facturesRetard.map(f => {
    const c = findContact(f.contact_id);
    return `<tr>
      <td>${f.numero || "—"}</td><td>${contactLabel(c)}</td><td>${f.montant_ttc ? f.montant_ttc + " €" : "—"}</td>
      <td>${fmtDateFR(f.date_echeance)}</td><td>${fmtDateFR(f.derniere_relance) || "—"}</td>
      <td class="row-actions"><button class="btn secondary" ${c && c.email ? "" : "disabled"} onclick="openRelanceCompose('facture', ${f.id})">${icon("mic",13)} Envoyer relance</button></td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="6">Aucune facture en retard 🎉</td></tr>`;

  document.getElementById("relance-devis-tbody").innerHTML = devisAttente.length ? devisAttente.map(d => {
    const c = devisContact(d);
    return `<tr>
      <td>${d.numero || "—"}</td><td>${contactLabel(c)}</td><td>${d.montant_ttc ? d.montant_ttc + " €" : "—"}</td>
      <td>${fmtDateFR((d.date_creation || "").slice(0, 10))}</td><td>${fmtDateFR(d.derniere_relance) || "—"}</td>
      <td class="row-actions"><button class="btn secondary" ${c && c.email ? "" : "disabled"} onclick="openRelanceCompose('devis', ${d.id})">${icon("mic",13)} Envoyer relance</button></td>
    </tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="6">Aucun devis en attente</td></tr>`;
}

function openRelanceCompose(type, id) {
  const item = type === "facture" ? findFacture(id) : findDevis(id);
  const c = type === "facture" ? findContact(item.contact_id) : devisContact(item);
  if (!c || !c.email) { showToast("Ce contact n'a pas d'adresse email"); return; }

  const subject = type === "facture"
    ? `Relance — Facture ${item.numero || ""} en attente de règlement`
    : `Relance — Votre devis ${item.numero || ""}`;
  const body = type === "facture"
    ? `Bonjour ${c.prenom || ""},\n\nNous n'avons pas encore reçu le règlement de la facture ${item.numero || ""} d'un montant de ${item.montant_ttc || ""} €, échue le ${fmtDateFR(item.date_echeance)}.\n\nMerci de bien vouloir procéder au paiement dans les meilleurs délais.\n\nCordialement,\n${EMETTEUR.nom}`
    : `Bonjour ${c.prenom || ""},\n\nNous revenons vers vous concernant le devis ${item.numero || ""} qui vous a été envoyé. N'hésitez pas à nous faire part de vos questions ou à nous confirmer votre accord.\n\nCordialement,\n${EMETTEUR.nom}`;

  const html = `
    <div class="field"><label>Destinataire</label><input value="${escapeAttr(c.email)}" disabled></div>
    <div class="field"><label>Objet</label><input id="relance-subject" value="${escapeAttr(subject)}"></div>
    <div class="field"><label>Message</label><textarea id="relance-body" style="min-height:220px;">${body}</textarea></div>`;
  openRawModal("Envoyer une relance", html, async () => {
    const ok = await sendGoogleMail(c.email, document.getElementById("relance-subject").value, document.getElementById("relance-body").value);
    if (ok) {
      await updateRow(type === "facture" ? "factures" : "devis", id, { derniere_relance: todayStr() });
      closeModal();
      await refreshAll();
    }
  });
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
  if (t.evenement_id) { const e = findEvenement(t.evenement_id); return e ? (icon("calendar",13) + " " + eventLabel(e)) : "—"; }
  if (t.contact_id) { const c = findContact(t.contact_id); return c ? (icon("user",13) + " " + contactLabel(c)) : "—"; }
  if (t.commande_id) { const c = findCommande(t.commande_id); return c ? (icon("package", 13) + " " + (c.article || ("Commande #" + c.id))) : "—"; }
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
  const h = new Date().getHours();
  const salut = (h >= 5 && h < 18) ? "Bonjour" : "Bonsoir";
  let dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  document.getElementById("dash-greeting-title").textContent = `${salut} CBLF !`;
  document.getElementById("dash-greeting").textContent = dateStr;
  const prospectsActifs = cache.contacts.filter(c => c.categorie === "Prospect").length;
  const devisEnAttente = cache.devis.filter(d => d.statut === "En attente").length;
  const facturesImpayees = cache.factures.filter(f => ["Envoyée", "En retard", "Partiellement payée"].includes(f.statut)).length;
  const rdvAvenir = cache.rdv.filter(r => (r.date_rdv || "") >= today && r.statut !== "Annulé").length;
  const evenementsAvenir = cache.evenements.filter(e => (e.date_evenement || "") >= today).length;
  const todosOuvertes = cache.todos.filter(t => t.statut !== "Terminé").length;

  const cards = [
    ["target", prospectsActifs, "Prospects actifs", "var(--info)", () => goToFilter("contacts", "contact-filter-categorie", "Prospect")],
    ["file-text", devisEnAttente, "Devis en attente", "var(--accent)", () => goToFilter("devis", "devis-filter-statut", "En attente")],
    ["receipt", facturesImpayees, "Factures impayées", "var(--warning)", () => goToFilter("factures", "facture-filter-statut", "Envoyée")],
    ["check-square", rdvAvenir, "RDV à venir", "var(--success)", () => showPage("todo")],
    ["calendar", evenementsAvenir, "Évènements à venir", "var(--info)", () => showPage("evenements")],
    ["check", todosOuvertes, "Tâches en cours", "var(--success)", () => showPage("todo")],
  ];
  const wrap = document.getElementById("dash-cards");
  wrap.innerHTML = cards.map((c, i) => `
    <div class="stat-card clickable" data-i="${i}">
      <div class="icon-badge" style="background:${c[3]};">${icon(c[0], 18)}</div>
      <div class="num">${c[1]}</div>
      <div class="label">${c[2]}</div>
    </div>`).join("");
  wrap.querySelectorAll(".stat-card").forEach(el => el.addEventListener("click", () => cards[Number(el.dataset.i)][4]()));

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
function contactOptionsHtml(selectedId, categories) {
  const list = categories ? cache.contacts.filter(c => categories.includes(c.categorie)) : cache.contacts;
  return list.map(c => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${contactLabel(c)}</option>`).join("");
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
  else rows = rows.filter(t => t.statut !== "Terminé");
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
      <td>${inlineStatusSelect("todos", t.id, "priorite", PRIORITES, t.priorite || p, "renderTodo")}</td>
      <td class="${echClass}">${fmtDateFR(t.date_echeance) || "—"}</td>
      <td>${inlineStatusSelect("todos", t.id, "statut", STATUTS_TODO, t.statut, "renderTodo")}</td>
      <td class="row-actions">
        <button onclick="openTodoDialog(${t.id})">${icon("edit",14)}</button>
        <button onclick="confirmDelete('todos', ${t.id}, renderTodo)">${icon("trash",14)}</button>
      </td></tr>`;
  }).join("") : emptyState(6, "Aucune tâche pour l'instant", "Ajouter ta première tâche", "openTodoDialog(null)");

  const done = [...cache.todos].filter(t => t.statut === "Terminé")
    .sort((a, b) => (b.date_echeance || "").localeCompare(a.date_echeance || ""));
  const doneTbody = document.getElementById("todo-done-tbody");
  doneTbody.innerHTML = done.length ? done.map(t => `<tr>
      <td>${t.titre}</td>
      <td>${todoLieALabel(t)}</td>
      <td>${badge(effectivePriorite(t), STATUT_COLORS[effectivePriorite(t)])}</td>
      <td>${fmtDateFR(t.date_echeance) || "—"}</td>
      <td class="row-actions">
        <button onclick="openTodoDialog(${t.id})">${icon("edit",14)}</button>
        <button onclick="confirmDelete('todos', ${t.id}, renderTodo)">${icon("trash",14)}</button>
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
let prospectView = "table";
function renderSuivi() {
  ensureFilterOptions("prospect-filter-statut", STATUTS_EVENEMENT);
  const filter = document.getElementById("prospect-filter-statut").value;
  let rows = [...cache.evenements].sort((a, b) => (a.date_evenement || "9999").localeCompare(b.date_evenement || "9999"));
  if (filter) rows = rows.filter(e => e.statut === filter);

  document.getElementById("prospect-view-select").value = prospectView;
  document.getElementById("prospect-table-view").style.display = prospectView === "table" ? "table" : "none";
  document.getElementById("prospect-kanban").style.display = prospectView === "kanban" ? "flex" : "none";

  if (prospectView === "kanban") { renderSuiviKanban(rows); return; }

  const tbody = document.getElementById("prospect-tbody");
  tbody.innerHTML = rows.length ? rows.map(e => {
    const dev = cache.devis.find(d => d.evenement_id === e.id);
    const facs = cache.factures.filter(f => (e.facture_id && f.id === e.facture_id) || (dev && f.devis_id === dev.id));
    const fac = facs[0];
    const tache = cache.todos.find(t => t.evenement_id === e.id && t.statut !== "Terminé");
    const today = todayStr();
    const nextRdv = cache.rdv.filter(r => r.contact_id === e.contact_id && r.date_rdv && r.date_rdv >= today).sort((a, b) => a.date_rdv.localeCompare(b.date_rdv))[0];
    const dateTxt = e.date_flexible ? (fmtMoisFR(e.mois_seul) + " (flex.)") : fmtDateFR(e.date_evenement);
    const totalFacture = facs.reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0);
    const totalPaye = facs.filter(f => f.statut === "Payée").reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0);
    const paiementTxt = totalFacture ? `${totalPaye} € / ${totalFacture} €` : "—";
    const paiementColor = totalFacture && totalPaye >= totalFacture ? "var(--success)" : (totalPaye > 0 ? "var(--warning)" : "var(--muted)");
    return `<tr>
      <td>${contactLabel(findContact(e.contact_id))}</td>
      <td>${dateTxt || "—"}</td>
      <td>${tache ? "✓ " + tache.titre : "—"}${nextRdv ? `<br><span style="color:var(--muted);font-size:11px;">RDV : ${fmtDateFR(nextRdv.date_rdv)}</span>` : ""}</td>
      <td class="row-actions"><button title="Fiche récap" onclick="openEventRecap(${e.id})">${icon("clipboard",14)}</button></td>
      <td>${inlineStatusSelect("evenements", e.id, "statut", STATUTS_EVENEMENT, e.statut, "renderSuivi")}</td>
      <td>${dev ? badge(dev.statut, STATUT_COLORS[dev.statut]) : "—"}</td>
      <td>${fac ? badge(fac.statut, STATUT_COLORS[fac.statut]) : "—"}</td>
      <td><span style="color:${paiementColor};font-weight:bold;font-size:12px;">${paiementTxt}</span></td>
      <td class="row-actions"><button onclick="openEvenementDialog(${e.id})">${icon("edit",14)}</button></td>
    </tr>`;
  }).join("") : emptyState(9, "Aucun dossier pour l'instant", "Créer un évènement", "openEvenementDialog(null)");
}

function renderSuiviKanban(rows) {
  const board = document.getElementById("prospect-kanban");
  board.innerHTML = STATUTS_EVENEMENT.map(statut => {
    const items = rows.filter(e => e.statut === statut);
    const cards = items.map(e => {
      const dev = cache.devis.find(d => d.evenement_id === e.id);
      const dateTxt = e.date_flexible ? (fmtMoisFR(e.mois_seul) + " (flex.)") : fmtDateFR(e.date_evenement);
      return `<div class="kanban-card" draggable="true" data-id="${e.id}" onclick="openEventRecap(${e.id})">
        <div class="kc-name">${contactLabel(findContact(e.contact_id))}</div>
        <div class="kc-date">${dateTxt || "—"}${e.type_evenement ? " · " + e.type_evenement : ""}</div>
        ${dev ? `<div class="kc-badges">${badge(dev.statut, STATUT_COLORS[dev.statut])}</div>` : ""}
      </div>`;
    }).join("");
    return `<div class="kanban-col" data-statut="${statut}">
      <h4>${statut} <span>${items.length}</span></h4>
      ${cards}
    </div>`;
  }).join("");

  board.querySelectorAll(".kanban-card").forEach(card => {
    card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", card.dataset.id); e.dataTransfer.effectAllowed = "move"; });
  });
  board.querySelectorAll(".kanban-col").forEach(col => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      const newStatut = col.dataset.statut;
      const ev = findEvenement(id);
      if (!ev || ev.statut === newStatut) return;
      const saved = await updateRow("evenements", id, { statut: newStatut });
      if (saved) { showToast("Statut mis à jour : " + newStatut); await refreshCache(); renderSuivi(); }
    });
  });
}

function openEventNotesFromRecap(eventId) {
  const e = findEvenement(eventId);
  if (!e) return;
  const c = findContact(e.contact_id);
  openNotesPanel("Notes — " + (contactLabel(c) || "évènement"), "evenements", eventId, e.notes || "", () => openEventRecap(eventId));
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
    .map(r => ({ date: r.date_rdv, texte: (icon("users",13) + " RDV") + (r.objet ? " — " + r.objet : "") + (r.notes ? " (" + r.notes + ")" : "") }));
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
      ${line("Prochain RDV", (fmtDateFR(e.prochain_rdv) || "—") + (e.prochain_rdv_adefinir ? " · à définir" : ""))}
      ${line("À relancer", e.arelancer ? "Oui" : "Non")}
    </tbody></table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px;">
      <h3 style="font-size:14px;margin:0;">${icon("clock",14)} Historique des actions</h3>
      <button class="btn secondary" type="button" onclick="addHistoriqueEntry(${e.id})">${icon("plus",13)} Ajouter</button>
    </div>
    <table class="data" style="margin-bottom:16px;"><tbody>${historique.length ? historique.map(h => `<tr><td style="white-space:nowrap;color:var(--muted);width:110px;">${fmtDateFR(h.date)}</td><td>${h.texte}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">Aucune entrée</td></tr>`}</tbody></table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;">
      <h3 style="font-size:14px;margin:0;">${icon("edit",14)} Notes</h3>
      <button class="btn secondary" type="button" onclick="openEventNotesFromRecap(${e.id})">${icon("edit",13)} Ouvrir en grand</button>
    </div>
    <div style="font-size:14px;line-height:1.5;white-space:pre-wrap;background:#FAFAF8;border:1px solid var(--border);border-radius:8px;padding:12px;min-height:50px;">${e.notes || "—"}</div>
    <h3 style="font-size:14px;margin:16px 0 8px;">${icon("check-square",14)} Tâches liées</h3>
    <table class="data"><tbody>${taches.length ? taches.map(t => `<tr><td>${t.titre}</td><td>${badge(t.statut, STATUT_COLORS[t.statut])}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="2">Aucune</td></tr>`}</tbody></table>`;
  showInfoModal("Fiche récap évènement", html);
  const oldBtn = document.getElementById("modal-print-btn");
  if (oldBtn) oldBtn.remove();
  const printBtn = document.createElement("button");
  printBtn.id = "modal-print-btn";
  printBtn.className = "btn secondary"; printBtn.type = "button"; printBtn.innerHTML = icon("printer", 14) + " Imprimer";
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
let contactView = "table";
function renderContacts() {
  ensureFilterOptions("contact-filter-categorie", CATEGORIES_CONTACT);
  bindSearch("contact-search", renderContacts);
  const search = (document.getElementById("contact-search").value || "").toLowerCase();
  const fCat = document.getElementById("contact-filter-categorie").value;
  let rows = [...cache.contacts].sort((a, b) => contactLabel(a).localeCompare(contactLabel(b), "fr"));
  if (fCat) rows = rows.filter(c => c.categorie === fCat);
  if (search) rows = rows.filter(c => (contactLabel(c) + " " + (c.societe || "") + " " + (c.email || "")).toLowerCase().includes(search));

  document.getElementById("contact-view-select").value = contactView;
  document.getElementById("contact-table-view").style.display = contactView === "table" ? "block" : "none";
  document.getElementById("contact-kanban").style.display = contactView === "kanban" ? "flex" : "none";
  if (contactView === "kanban") { renderContactsKanban(rows); return; }

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
        <button title="Historique" onclick="openContactTimeline(${c.id})">${icon("activity",14)}</button>
        <button onclick="openContactDialog(${c.id})">${icon("edit",14)}</button>
        <button onclick="confirmDelete('contacts', ${c.id}, renderContacts)">${icon("trash",14)}</button>
        <button title="Fiche contact" onclick="openContactFiche(${c.id})">${icon("more-horizontal",14)}</button>
      </td>
    </tr>`).join("") : emptyState(7, "Aucun contact pour l'instant", "Ajouter ton premier contact", "openContactDialog(null)");
}

function renderContactsKanban(rows) {
  const board = document.getElementById("contact-kanban");
  board.innerHTML = CATEGORIES_CONTACT.map(cat => {
    const color = STATUT_COLORS[cat] || "var(--muted)";
    const items = rows.filter(c => c.categorie === cat);
    const cards = items.map(c => `
      <div class="kanban-card" draggable="true" data-id="${c.id}" onclick="openContactFiche(${c.id})" style="border-left:3px solid ${color};">
        <div class="kc-name">${contactLabel(c)}</div>
        <div class="kc-date">${c.societe || c.email || c.telephone || "—"}</div>
        ${c.provenance ? `<div class="kc-badges"><span class="badge" style="background:color-mix(in srgb, var(--muted) 16%, var(--card));color:var(--muted);">${c.provenance}</span></div>` : ""}
      </div>`).join("");
    return `<div class="kanban-col" data-cat="${cat}" style="border-top:3px solid ${color};">
      <h4><span style="display:inline-flex;align-items:center;gap:6px;"><i style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></i>${cat}</span> <span>${items.length}</span></h4>
      ${cards}
    </div>`;
  }).join("");

  board.querySelectorAll(".kanban-card").forEach(card => {
    card.addEventListener("dragstart", (e) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", card.dataset.id); e.dataTransfer.effectAllowed = "move"; });
  });
  board.querySelectorAll(".kanban-col").forEach(col => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      const newCat = col.dataset.cat;
      const c = cache.contacts.find(x => x.id === id);
      if (!c || c.categorie === newCat) return;
      const saved = await updateRow("contacts", id, { categorie: newCat });
      if (saved) { showToast("Catégorie mise à jour : " + newCat); await refreshCache(); renderContacts(); }
    });
  });
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
    <h3 style="font-size:14px;margin:16px 0 8px;">${icon("edit",14)} Notes</h3>
    <div style="font-size:14px;line-height:1.5;white-space:pre-wrap;background:#FAFAF8;border:1px solid var(--border);border-radius:8px;padding:12px;min-height:50px;">${c.notes || "—"}</div>
    ${Array.isArray(c.autres_personnes) && c.autres_personnes.length ? `
    <h3 style="font-size:14px;margin:16px 0 8px;">${icon("users",14)} Autres personnes liées</h3>
    <table class="data"><tbody>${c.autres_personnes.map(p => `<tr><td style="width:42%;color:var(--muted);">${[p.prenom, p.nom].filter(Boolean).join(" ") || "—"}</td><td>${[p.email, p.telephone, p.adresse].filter(Boolean).join(" · ") || "—"}</td></tr>`).join("")}</tbody></table>` : ""}`;
  showInfoModal("Fiche contact", html);
}

let contactPersonnesState = [];
const BLANK_PERSONNE = () => ({ nom: "", prenom: "", email: "", telephone: "", adresse: "" });

function openContactDialog(id) {
  const row = id ? cache.contacts.find(c => c.id === id) : {};
  contactPersonnesState = Array.isArray(row.autres_personnes) && row.autres_personnes.length ? JSON.parse(JSON.stringify(row.autres_personnes)) : [];

  const html = `
    <div class="field"><label>Nom</label><input name="nom" value="${escapeAttr(row.nom || "")}"></div>
    <div class="field"><label>Prénom</label><input name="prenom" value="${escapeAttr(row.prenom || "")}"></div>
    <div class="field"><label>Catégorie de personne</label>
      <select name="categorie">${CATEGORIES_CONTACT.map(c => `<option value="${c}" ${c === (row.categorie || "Client") ? "selected" : ""}>${c}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Société / entreprise</label><input name="societe" value="${escapeAttr(row.societe || "")}"></div>
    <div class="field"><label>Poste (si entreprise)</label><input name="poste" value="${escapeAttr(row.poste || "")}"></div>
    <div class="field"><label>Email</label><input name="email" value="${escapeAttr(row.email || "")}"></div>
    <div class="field"><label>Téléphone</label><input name="telephone" value="${escapeAttr(row.telephone || "")}"></div>
    <div class="field"><label>Adresse</label><textarea name="adresse">${row.adresse || ""}</textarea></div>
    <div class="field"><label>Provenance</label><input name="provenance" list="contact-provenance-list" value="${escapeAttr(row.provenance || "")}"></div>
    <datalist id="contact-provenance-list">${PROVENANCES.map(p => `<option value="${escapeAttr(p)}">`).join("")}</datalist>
    <div class="field"><label>Type d'évènement d'intérêt</label><input name="type_evenement_interet" list="contact-typeevt-list" value="${escapeAttr(row.type_evenement_interet || "")}"></div>
    <datalist id="contact-typeevt-list">${TYPES_EVENEMENT.map(t => `<option value="${escapeAttr(t)}">`).join("")}</datalist>
    <div class="field"><label>Notes</label><textarea name="notes">${row.notes || ""}</textarea></div>
    <div class="field"><label>Autres personnes liées (ex : mariage à deux)</label>
      <div id="contact-personnes-list"></div>
      <button type="button" class="btn secondary" id="contact-add-personne">${icon("plus", 13)} Ajouter une personne</button>
    </div>`;

  openRawModal(id ? "Modifier le contact" : "Nouveau contact", html, () => saveContactDialog(id));
  document.getElementById("modal-delete").style.display = id ? "inline-block" : "none";
  if (id) document.getElementById("modal-delete").onclick = () => { closeModal(); confirmDelete("contacts", id, renderContacts); };

  renderContactPersonnes();
  document.getElementById("contact-add-personne").addEventListener("click", () => { contactPersonnesState.push(BLANK_PERSONNE()); renderContactPersonnes(); });
}

function renderContactPersonnes() {
  const c = document.getElementById("contact-personnes-list");
  c.innerHTML = contactPersonnesState.map((p, i) => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <input data-pi="${i}" data-pk="nom" placeholder="Nom" value="${escapeAttr(p.nom || "")}" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input data-pi="${i}" data-pk="prenom" placeholder="Prénom" value="${escapeAttr(p.prenom || "")}" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input data-pi="${i}" data-pk="email" placeholder="Email" value="${escapeAttr(p.email || "")}" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input data-pi="${i}" data-pk="telephone" placeholder="Téléphone" value="${escapeAttr(p.telephone || "")}" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input data-pi="${i}" data-pk="adresse" placeholder="Adresse" value="${escapeAttr(p.adresse || "")}" style="grid-column:1 / -1;padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <button type="button" onclick="removeContactPersonne(${i})" style="grid-column:1 / -1;background:none;border:none;color:var(--danger);font-size:12px;text-align:left;">${icon("trash",13)} Retirer cette personne</button>
    </div>`).join("");
  c.querySelectorAll("[data-pi]").forEach(el => el.addEventListener("input", (e) => {
    contactPersonnesState[Number(e.target.dataset.pi)][e.target.dataset.pk] = e.target.value;
  }));
}
function removeContactPersonne(i) { contactPersonnesState.splice(i, 1); renderContactPersonnes(); }

async function saveContactDialog(id) {
  const form = document.getElementById("modal-form");
  const values = {
    nom: form.elements["nom"].value || null,
    prenom: form.elements["prenom"].value || null,
    categorie: form.elements["categorie"].value,
    societe: form.elements["societe"].value || null,
    poste: form.elements["poste"].value || null,
    email: form.elements["email"].value || null,
    telephone: form.elements["telephone"].value || null,
    adresse: form.elements["adresse"].value || null,
    provenance: form.elements["provenance"].value || null,
    type_evenement_interet: form.elements["type_evenement_interet"].value || null,
    notes: form.elements["notes"].value || null,
    autres_personnes: contactPersonnesState.filter(p => p.nom || p.prenom),
  };
  const saved = id ? await updateRow("contacts", id, values) : await insertRow("contacts", values);
  if (!saved) return;
  showToast(id ? "Contact mis à jour" : "Contact ajouté");
  closeModal();
  await refreshAll();
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
  if (expiring.length) { for (const d of expiring) await updateRow("devis", d.id, { statut: "Expiré" }); await refreshCache(); }

  const passing = cache.evenements.filter(e => {
    if (["Passé", "Annulé"].includes(e.statut)) return false;
    const endDate = e.date_fin || e.date_evenement;
    return endDate && endDate < today;
  });
  if (passing.length) { for (const e of passing) await updateRow("evenements", e.id, { statut: "Passé" }); await refreshCache(); }

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
    ? `<div class="warn-banner">${icon("alert-triangle",14)} ${expiredCount} devis ${expiredCount > 1 ? "sont expirés" : "est expiré"} (date de validité dépassée). Pense à les relancer ou les renouveler.</div>` : "";

  const search = (document.getElementById("devis-search").value || "").toLowerCase();
  const filter = document.getElementById("devis-filter-statut").value;
  let rows = [...cache.devis].sort((a, b) => (b.date_creation || "").localeCompare(a.date_creation || ""));
  if (filter) rows = rows.filter(d => d.statut === filter);
  if (search) rows = rows.filter(d => (contactLabel(devisContact(d)) + " " + (d.numero || "")).toLowerCase().includes(search));

  const tbody = document.getElementById("devis-tbody");
  tbody.innerHTML = rows.length ? rows.map(d => {
    const e = devisEvent(d);
    return `<tr>
      <td>${d.numero || "—"}${d.finalise ? " " + icon("check", 12) : ""}</td>
      <td>${e ? eventLabel(e) : "—"}</td>
      <td><input type="date" value="${(d.date_creation || "").slice(0, 10)}" onchange="updateDevisDateCreation(${d.id}, this.value)" style="border:1px solid var(--border);border-radius:5px;padding:4px 6px;font-size:12px;"></td>
      <td>${d.montant_ttc ? d.montant_ttc + " €" : "—"}</td>
      <td>${inlineStatusSelect("devis", d.id, "statut", STATUTS_DEVIS, d.statut, "renderDevis")}</td>
      <td class="row-actions">
        <button title="Aperçu rapide" onclick="generateDevisPDF(${d.id}, true)">${icon("eye",14)}</button>
        <button title="Éditer le devis" onclick="openDevisEditor(${d.id})">${icon("edit",14)}</button>
        <button title="Télécharger le PDF" onclick="generateDevisPDF(${d.id})">${icon("download",14)}</button>
        <button title="Créer une facture" onclick="createFactureFromDevis(${d.id})">${icon("receipt",14)}</button>
        <button onclick="confirmDelete('devis', ${d.id}, renderDevis)">${icon("trash",14)}</button>
      </td></tr>`;
  }).join("") : emptyState(6, "Aucun devis pour l'instant", "Créer ton premier devis", "openDevisDialog(null)");
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
      <td><input list="ed-desig" data-k="designation" value="${(l.designation || "").replace(/"/g, "&quot;")}">
        <button type="button" title="Détail (facultatif, imprimé en note de bas de tableau)" onclick="editLigneDetail(${i})" style="background:none;border:none;color:${l.detail ? "var(--accent)" : "var(--muted)"};font-size:11px;padding:2px 0;">${icon("edit", 11)} Détail${l.detail ? " ✓" : ""}</button>
      </td>
      <td><input type="number" data-k="qte" min="0" step="1" value="${l.qte != null ? l.qte : 1}" style="width:60px;"></td>
      <td><input type="number" data-k="pu_ttc" min="0" step="0.01" value="${l.pu_ttc != null ? l.pu_ttc : ""}" style="width:80px;"></td>
      <td><input type="number" data-k="remise" min="0" max="100" step="1" value="${l.remise != null ? l.remise : 0}" style="width:60px;"></td>
      <td class="ro" data-ro="ht"></td>
      <td><select data-k="tva">${TVA_DEVIS.map(t => `<option value="${t}" ${Number(l.tva) === t ? "selected" : ""}>${t}%</option>`).join("")}</select></td>
      <td class="ro" data-ro="tva"></td>
      <td class="ro" data-ro="ttc"></td>
      <td><button class="del" title="Supprimer" onclick="removeEditorLine(${i})">${icon("x",13)}</button></td>
    </tr>`).join("");
  tb.querySelectorAll('[data-k="designation"]').forEach(inp => {
    inp.addEventListener("change", () => {
      const i = Number(inp.closest("tr").dataset.i);
      if (!edState.lignes[i].detail) {
        const match = cache.grille_tarifaire.find(g => g.nom_presta === inp.value);
        if (match && match.details) { edState.lignes[i].detail = match.details; readEditorToState(); renderEditorLines(); }
      }
    });
  });
  recomputeEditor();
}
function editLigneDetail(i) {
  readEditorToState();
  const current = edState.lignes[i].detail || "";
  const val = prompt("Détail de cette prestation (affiché en note de bas de tableau sur le devis) :", current);
  if (val === null) return;
  edState.lignes[i].detail = val;
  renderEditorLines();
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
  const CGV_LIST = getCgvTexts();
  const html = `<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;">Coche les conditions dans l'ordre où elles doivent apparaître sur le devis.</p>
    <div class="cgv-list" id="cgv-list">${CGV_LIST.map((c, i) => {
      const pos = already.indexOf(c);
      return `<label><span class="cgv-order" data-cgv="${i}">${pos >= 0 ? (pos + 1) : ""}</span>
        <input type="checkbox" data-cgv-cb="${i}" ${pos >= 0 ? "checked" : ""}> ${c}</label>`;
    }).join("")}</div>`;
  openRawModal("Conditions générales de vente", html, async () => {
    // recueille l'ordre de sélection
    const order = window._cgvOrder || already.map(c => CGV_LIST.indexOf(c)).filter(x => x >= 0);
    const chosen = order.map(i => CGV_LIST[i]);
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
  window._cgvOrder = already.map(c => CGV_LIST.indexOf(c)).filter(x => x >= 0);
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
  const footnotes = [];
  lignes.forEach(l => {
    const r = computeLine(l); tHT += r.ht; tTVA += r.tva; tTTC += r.ttc;
    let designationTxt = l.designation || "—";
    if (l.detail) { footnotes.push(l.detail); designationTxt += ` (*${footnotes.length})`; }
    const desig = doc.splitTextToSize(designationTxt, 82);
    doc.text(desig, 20, y);
    doc.text(String(l.qte ?? ""), 108, y);
    doc.text(Number(l.pu_ttc || 0).toFixed(2), 122, y);
    doc.text((l.remise ? l.remise + "%" : "—"), 142, y);
    doc.text((l.tva || 0) + "%", 158, y);
    doc.text(r.ttc.toFixed(2) + " €", 176, y);
    y += Math.max(7, desig.length * 5);
    if (y > 250) { doc.addPage(); y = 20; }
  });
  if (footnotes.length) {
    doc.setFontSize(8.5); doc.setTextColor(90);
    footnotes.forEach((f, i) => { const t = doc.splitTextToSize(`*${i + 1} ${f}`, 175); doc.text(t, 20, y); y += t.length * 4; });
    doc.setTextColor(0); y += 3;
  }
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
  if (preview) openPdfPreview(d.numero || "Devis", doc.output("bloburl"));
  else doc.save((d.numero || "devis").replace(/\s+/g, "_") + ".pdf");
}
function openPdfPreview(title, blobUrl) {
  document.getElementById("pdf-preview-title").textContent = title;
  document.getElementById("pdf-preview-iframe").src = blobUrl;
  document.getElementById("pdf-preview-overlay").classList.add("open");
}
function closePdfPreview() {
  document.getElementById("pdf-preview-overlay").classList.remove("open");
  document.getElementById("pdf-preview-iframe").src = "about:blank";
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
  const byContact = {};
  rows.forEach(f => { const key = f.contact_id || "none"; (byContact[key] = byContact[key] || []).push(f); });
  const groupKeys = Object.keys(byContact).sort((a, b) => contactLabel(findContact(Number(a))).localeCompare(contactLabel(findContact(Number(b))), "fr"));

  tbody.innerHTML = rows.length ? groupKeys.map(key => {
    const group = byContact[key];
    const totalTTC = group.reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0);
    const groupHeader = `<tr style="background:#EFEEE9;"><td colspan="7" style="font-weight:bold;padding:8px 14px;">${contactLabel(findContact(Number(key)))} — ${group.length} facture${group.length > 1 ? "s" : ""} · ${totalTTC} € au total</td></tr>`;
    const groupRows = group.map(f => {
      const dev = f.devis_id ? findDevis(f.devis_id) : null;
      const pdfBtn = f.pdf_path ? `<button title="Voir le PDF joint" onclick="downloadAttachment(findFacture(${f.id}).pdf_path)">${icon("paperclip", 14)}</button>` : "";
      return `<tr>
      <td>${f.numero || "—"}</td>
      <td></td>
      <td>${dev ? (dev.numero || ("Devis #" + dev.id)) : "—"}</td>
      <td>${fmtDateFR(f.date_facture)}</td>
      <td>${f.montant_ttc ? f.montant_ttc + " €" : "—"}</td>
      <td>${inlineStatusSelect("factures", f.id, "statut", STATUTS_FACTURE, f.statut, "renderFactures")}</td>
      <td class="row-actions">
        <button title="Télécharger la facture (PDF)" onclick="generateFacturePDF(${f.id})">${icon("download",14)}</button>
        ${pdfBtn}
        <button onclick="openFactureDialog(${f.id})">${icon("edit",14)}</button>
        <button onclick="confirmDelete('factures', ${f.id}, renderFactures)">${icon("trash",14)}</button>
      </td></tr>`;
    }).join("");
    return groupHeader + groupRows;
  }).join("") : emptyState(7, "Aucune facture pour l'instant", "Créer une facture", "openFactureDialog(null)");
}
let factureLignesState = [];
function openFactureDialog(id, prefill) {
  const row = id ? (findFacture(id) || {}) : (prefill || {});
  factureLignesState = Array.isArray(row.lignes) && row.lignes.length ? JSON.parse(JSON.stringify(row.lignes)) : [{ designation: "", qte: 1, pu_ttc: "" }];
  const dev = row.devis_id ? findDevis(row.devis_id) : null;

  const html = `
    <div class="field"><label>Numéro</label><input name="numero" value="${escapeAttr(row.numero != null ? row.numero : nextFactureNumero())}"></div>
    <div class="field"><label>Client / contact</label><select name="contact_id">${`<option value="">—</option>` + contactOptionsHtml(row.contact_id)}</select></div>
    <div class="field"><label>Devis lié</label><select name="devis_id">${`<option value="">— Aucun —</option>` + devisOptionsHtml(row.devis_id)}</select></div>
    <div class="field"><label>Date de l'évènement</label><input type="date" name="date_evenement" value="${row.date_evenement || ""}"></div>
    <div class="field"><label>Type facture</label>
      <select name="type_facture_id" id="fac-type-select">
        <option value="">— Choisir —</option>
        ${cache.types_facture.map(t => `<option value="${t.id}" ${row.type_facture_id === t.id ? "selected" : ""}>${t.designation}</option>`).join("")}
        <option value="SOLDE" ${row.type_facture_id === "SOLDE" ? "selected" : ""}>Solde</option>
        <option value="MANUEL" ${row.type_facture_id === "MANUEL" || !row.type_facture_id ? "selected" : ""}>Facture manuelle</option>
      </select>
    </div>
    <div class="field"><label>Date de la facture</label><input type="date" name="date_facture" value="${row.date_facture || todayStr()}"></div>
    <div class="field"><label>Date d'échéance</label><input type="date" name="date_echeance" value="${row.date_echeance || ""}"></div>
    <div id="fac-solde-info" style="display:none;font-size:12.5px;color:var(--muted);background:#FAFAF8;border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:12px;"></div>
    <div id="fac-manuel-zone" class="field" style="display:none;">
      <label>Lignes de la facture</label>
      <div id="fac-lignes-list"></div>
      <button type="button" class="btn secondary" id="fac-add-ligne">${icon("plus",13)} Ajouter une ligne</button>
    </div>
    <div class="field"><label>Montant TTC (€)${row.type_facture_id && row.type_facture_id !== "MANUEL" ? " — calculé automatiquement" : ""}</label><input type="number" name="montant_ttc" value="${row.montant_ttc != null ? row.montant_ttc : ""}"></div>
    <div class="field"><label>Statut</label>
      <select name="statut" id="fac-statut-select">${STATUTS_FACTURE.map(s => `<option value="${s}" ${s === (row.statut || "Brouillon") ? "selected" : ""}>${s}</option>`).join("")}</select>
    </div>
    <div class="field" id="fac-datepaiement-field" style="display:none;"><label>Date de paiement</label><input type="date" name="date_paiement" value="${row.date_paiement || ""}"></div>
    <div class="field"><label>Joindre un PDF (facture signée / preuve)</label><input type="file" id="fac-pdf" accept="application/pdf">
      ${row.pdf_path ? `<div style="margin-top:6px;"><button type="button" class="btn secondary" onclick="downloadAttachment('${row.pdf_path}')">${icon("paperclip",13)} Voir le PDF actuel</button></div>` : ""}
    </div>
    <div class="field"><label>Notes</label><textarea name="notes">${row.notes || ""}</textarea></div>`;

  openRawModal(id ? "Modifier la facture" : "Nouvelle facture", html, () => saveFactureDialog(id));
  document.getElementById("modal-delete").style.display = id ? "inline-block" : "none";
  if (id) document.getElementById("modal-delete").onclick = () => { closeModal(); confirmDelete("factures", id, renderFactures); };

  const form = document.getElementById("modal-form");
  const applyType = () => {
    const typeVal = form.elements["type_facture_id"].value;
    const devisId = Number(form.elements["devis_id"].value) || null;
    const d = devisId ? findDevis(devisId) : null;
    const contactId = Number(form.elements["contact_id"].value) || null;
    const dateEvt = form.elements["date_evenement"].value;

    document.getElementById("fac-manuel-zone").style.display = typeVal === "MANUEL" ? "block" : "none";
    document.getElementById("fac-solde-info").style.display = typeVal === "SOLDE" ? "block" : "none";

    if (typeVal === "SOLDE" && d) {
      const acomptes = cache.factures.filter(f => f.devis_id === d.id && f.statut === "Payée" && f.id !== id);
      const totalPaye = acomptes.reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0);
      const solde = round2((Number(d.montant_ttc) || 0) - totalPaye);
      form.elements["montant_ttc"].value = solde;
      document.getElementById("fac-solde-info").innerHTML = acomptes.length
        ? "Acomptes déjà réglés :<br>" + acomptes.map(f => `• ${f.numero || "Facture"} — ${f.montant_ttc} € le ${fmtDateFR(f.date_paiement) || "date inconnue"}`).join("<br>") + `<br><strong>Solde restant : ${solde} €</strong>`
        : `Aucun acompte réglé enregistré. Solde total : ${solde} €`;
    } else if (typeVal && typeVal !== "MANUEL") {
      const t = cache.types_facture.find(x => String(x.id) === typeVal);
      if (t && d) {
        const montant = round2((Number(d.montant_ttc) || 0) * (Number(t.pourcentage) || 0) / 100);
        form.elements["montant_ttc"].value = montant;
      }
      if (t && t.echeance_nombre != null && dateEvt) {
        const eche = t.echeance_unite === "mois" ? addMonthsISO(dateEvt, -t.echeance_nombre) : addDaysISO(dateEvt, -t.echeance_nombre);
        form.elements["date_echeance"].value = eche;
      }
    }
    if (!contactId && d) { const c = devisContact(d); if (c) form.elements["contact_id"].value = c.id; }
    if (!dateEvt && d) { const dd = devisDateEvt(d); if (dd) form.elements["date_evenement"].value = dd; }
  };
  form.elements["type_facture_id"].addEventListener("change", applyType);
  form.elements["devis_id"].addEventListener("change", applyType);
  applyType();

  const togglePaiement = () => { document.getElementById("fac-datepaiement-field").style.display = form.elements["statut"].value === "Payée" ? "block" : "none"; };
  form.elements["statut"].addEventListener("change", togglePaiement);
  togglePaiement();

  renderFactureLignes();
  document.getElementById("fac-add-ligne").addEventListener("click", () => { factureLignesState.push({ designation: "", qte: 1, pu_ttc: "" }); renderFactureLignes(); });
}
function renderFactureLignes() {
  const c = document.getElementById("fac-lignes-list");
  c.innerHTML = factureLignesState.map((l, i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px;">
      <input data-fi="${i}" data-fk="designation" placeholder="Désignation" value="${escapeAttr(l.designation || "")}" style="flex:1;padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input type="number" data-fi="${i}" data-fk="qte" placeholder="Qté" value="${l.qte != null ? l.qte : 1}" style="width:60px;padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input type="number" data-fi="${i}" data-fk="pu_ttc" placeholder="PU TTC" value="${l.pu_ttc != null ? l.pu_ttc : ""}" style="width:90px;padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <button type="button" onclick="removeFactureLigne(${i})" style="background:none;border:none;color:var(--danger);">${icon("x",13)}</button>
    </div>`).join("");
  c.querySelectorAll("[data-fi]").forEach(el => el.addEventListener("input", (e) => {
    const i = Number(e.target.dataset.fi), k = e.target.dataset.fk;
    factureLignesState[i][k] = k === "designation" ? e.target.value : (e.target.value === "" ? "" : Number(e.target.value));
    if (k !== "designation") {
      const total = round2(factureLignesState.reduce((s, l) => s + (Number(l.qte) || 0) * (Number(l.pu_ttc) || 0), 0));
      document.querySelector('[name="montant_ttc"]').value = total;
    }
  }));
}
function removeFactureLigne(i) { factureLignesState.splice(i, 1); if (!factureLignesState.length) factureLignesState.push({ designation: "", qte: 1, pu_ttc: "" }); renderFactureLignes(); }

async function saveFactureDialog(id) {
  const form = document.getElementById("modal-form");
  const typeVal = form.elements["type_facture_id"].value;
  const values = {
    numero: form.elements["numero"].value || null,
    contact_id: Number(form.elements["contact_id"].value) || null,
    devis_id: Number(form.elements["devis_id"].value) || null,
    date_evenement: form.elements["date_evenement"].value || null,
    type_facture_id: typeVal === "SOLDE" || typeVal === "MANUEL" ? typeVal : (Number(typeVal) || null),
    date_facture: form.elements["date_facture"].value || null,
    date_echeance: form.elements["date_echeance"].value || null,
    montant_ttc: form.elements["montant_ttc"].value === "" ? null : Number(form.elements["montant_ttc"].value),
    statut: form.elements["statut"].value,
    date_paiement: form.elements["date_paiement"] ? (form.elements["date_paiement"].value || null) : null,
    notes: form.elements["notes"].value || null,
    lignes: typeVal === "MANUEL" ? factureLignesState.filter(l => l.designation) : [],
  };
  let saved = id ? await updateRow("factures", id, values) : await insertRow("factures", values);
  if (!saved) return;
  const fileEl = document.getElementById("fac-pdf");
  if (fileEl && fileEl.files && fileEl.files[0]) {
    const path = `${currentUser.id}/factures-${saved.id}.pdf`;
    const { error } = await sb.storage.from("devis-signes").upload(path, fileEl.files[0], { upsert: true, contentType: "application/pdf" });
    if (!error) await updateRow("factures", saved.id, { pdf_path: path });
  }
  showToast(id ? "Facture mise à jour" : "Facture créée");
  closeModal();
  await refreshAll();
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
  const ttc = Number(f.montant_ttc || 0);
  const typeLabel = f.type_facture_id === "SOLDE" ? "Solde" : f.type_facture_id === "MANUEL" ? "Facture manuelle" : (cache.types_facture.find(t => t.id === f.type_facture_id) || {}).designation;
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

  if (Array.isArray(f.lignes) && f.lignes.length) {
    f.lignes.forEach(l => { doc.text(`${l.designation} (x${l.qte || 1})`, 20, y); doc.text(round2((Number(l.qte) || 0) * (Number(l.pu_ttc) || 0)).toFixed(2) + " €", 150, y); y += 7; });
  } else {
    const rows = [[typeLabel || "Type d'évènement", f.type_evenement || ""], ["Date de l'évènement", fmtDateFR(f.date_evenement) || "—"]].filter(r => r[1]);
    rows.forEach(([k, v]) => { doc.text(k, 20, y); doc.text(v, 130, y); y += 7; });
  }
  y += 4; doc.setFontSize(13); doc.text("MONTANT TTC : " + ttc.toFixed(2) + " €", 20, y);
  if (f.date_paiement) { y += 9; doc.setFontSize(10); doc.text("Payée le " + fmtDateFR(f.date_paiement), 20, y); }
  if (f.notes) { y += 12; doc.setFontSize(10); doc.text(doc.splitTextToSize("Notes : " + f.notes, 170), 20, y); }
  drawFooter(doc);
  doc.save((f.numero || "facture").replace(/\s+/g, "_") + ".pdf");
}

async function downloadAttachment(pdf_path) {
  if (!pdf_path) { showToast("Aucun PDF joint"); return; }
  const { data, error } = await sb.storage.from("devis-signes").createSignedUrl(pdf_path, 300);
  if (error) { showToast("PDF introuvable"); console.error(error); return; }
  const name = pdf_path.split("/").pop();
  openPdfPreview(name, data.signedUrl);
}

function openContactTimeline(contactId) {
  const c = findContact(contactId);
  if (!c) return;

  const items = [];
  cache.devis.forEach(d => {
    const cc = devisContact(d);
    if (cc && cc.id === contactId) items.push({ date: d.date_creation, type: "Devis", ic: "file-text", color: STATUT_COLORS[d.statut], label: `${d.numero || "Devis"} — ${d.statut || ""}`, onclick: `openDevisEditor(${d.id})` });
  });
  cache.factures.forEach(f => {
    if (f.contact_id === contactId) items.push({ date: f.date_facture || f.date_creation, type: "Facture", ic: "receipt", color: STATUT_COLORS[f.statut], label: `${f.numero || "Facture"} — ${f.statut || ""}`, onclick: `openFactureDialog(${f.id})` });
  });
  cache.todos.forEach(t => {
    const viaEvent = t.evenement_id && findEvenement(t.evenement_id) && findEvenement(t.evenement_id).contact_id === contactId;
    if (t.contact_id === contactId || viaEvent) items.push({ date: t.date_echeance || t.date_creation, type: "Tâche", ic: "check-square", color: STATUT_COLORS[t.statut], label: `${t.titre} — ${t.statut || ""}`, onclick: `openTodoDialog(${t.id})` });
  });
  cache.rdv.forEach(r => {
    if (r.contact_id === contactId) items.push({ date: r.date_rdv || r.date_creation, type: "RDV", ic: "users", color: STATUT_COLORS[r.statut], label: `${r.objet || "RDV"} — ${r.statut || ""}`, onclick: `openRdvDialog(${r.id})` });
  });
  cache.notes.forEach(n => {
    if (n.contact_id === contactId) items.push({ date: (n.date_modif || n.date_creation), type: "Note", ic: "book", color: "var(--muted)", label: n.titre, onclick: `openNoteEditor(${n.id})` });
  });
  cache.evenements.filter(e => e.contact_id === contactId).forEach(e => {
    (e.historique || []).forEach(h => items.push({ date: h.date, type: "Historique évènement", ic: "clock", color: "var(--muted)", label: h.texte, onclick: `openEventRecap(${e.id})` }));
  });

  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const rowsHtml = items.length ? items.map(it => `
    <div style="display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--border);cursor:pointer;" onclick="closeModal();${it.onclick}">
      <div style="color:${it.color || "var(--muted)"};flex-shrink:0;margin-top:2px;">${icon(it.ic, 16)}</div>
      <div style="flex:1;">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;">${it.type} · ${fmtDateFR((it.date || "").slice(0, 10)) || "—"}</div>
        <div style="font-size:13.5px;">${it.label}</div>
      </div>
    </div>`).join("") : `<p style="color:var(--muted);font-size:13px;padding:14px 0;">Aucune activité enregistrée pour ce contact.</p>`;

  showInfoModal("Historique — " + contactLabel(c), `
    <p style="margin:0 0 6px;color:var(--muted);font-size:13px;">${c.email || ""}${c.telephone ? " · " + c.telephone : ""}</p>
    <div>${rowsHtml}</div>`);
}

// ========================================================================
//  EVENEMENTS
// ========================================================================
let evenementPastShowAll = false;
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

  const today = todayStr();
  const upcoming = rows.filter(e => e.statut !== "Passé");
  const past = rows.filter(e => e.statut === "Passé").sort((a, b) => (b.date_evenement || "").localeCompare(a.date_evenement || ""));
  const oneMonthAgo = addDaysISO(today, -31);
  const pastVisible = evenementPastShowAll ? past : past.filter(e => (e.date_evenement || "") >= oneMonthAgo);

  const tbody = document.getElementById("evenement-tbody");
  tbody.innerHTML = upcoming.length ? upcoming.map(e => {
    const c = findContact(e.contact_id);
    const dev = cache.devis.find(d => d.evenement_id === e.id);
    const fac = cache.factures.find(f => (e.facture_id && f.id === e.facture_id) || (dev && f.devis_id === dev.id));
    const dateTxt = eventDateLabel(e);
    const nb = (e.nb_invites != null ? e.nb_invites : "—") + (e.nb_precision === "Approximatif" ? " ~" : "");
    return `<tr>
      <td>${dateTxt || "—"}${e.statut !== "Confirmé" && e.statut !== "Passé" && e.statut !== "Annulé" ? " ❓" : ""}</td>
      <td>${contactLabel(c)}</td>
      <td>${(c && c.provenance) || "—"}</td>
      <td>${e.type_evenement || "—"}</td>
      <td>${e.type_prestation || "—"}</td>
      <td>${nb}</td>
      <td>${inlineStatusSelect("evenements", e.id, "statut", STATUTS_EVENEMENT, e.statut, "renderEvenements")}</td>
      <td>${dev ? badge(dev.statut, STATUT_COLORS[dev.statut]) : "—"}</td>
      <td>${fac ? badge(fac.statut, STATUT_COLORS[fac.statut]) : "—"}</td>
      <td class="row-actions">
        <button title="Fiche récap" onclick="openEventRecap(${e.id})">${icon("clipboard",14)}</button>
        <button onclick="openEvenementDialog(${e.id})">${icon("edit",14)}</button>
        <button onclick="confirmDelete('evenements', ${e.id}, renderEvenements)">${icon("trash",14)}</button>
      </td></tr>`;
  }).join("") : emptyState(9, "Aucun évènement pour l'instant", "Ajouter ton premier évènement", "openEvenementDialog(null)");

  document.getElementById("evenement-past-tbody").innerHTML = pastVisible.length ? pastVisible.map(e => `<tr>
      <td>${eventDateLabel(e)}</td><td>${contactLabel(findContact(e.contact_id))}</td><td>${e.type_evenement || "—"}</td>
      <td>${badge(e.statut, STATUT_COLORS[e.statut])}</td>
      <td class="row-actions"><button title="Fiche récap" onclick="openEventRecap(${e.id})">${icon("clipboard",14)}</button></td>
    </tr>`).join("") : `<tr class="empty-row"><td colspan="5">Aucun évènement passé</td></tr>`;
  document.getElementById("evenement-past-more-wrap").style.display = (!evenementPastShowAll && past.length > pastVisible.length) ? "block" : "none";
}

function openEvenementDialog(id, defaultDate) {
  const row = id ? cache.evenements.find(e => e.id === id) : {};
  let adefinirFlag = false, arelancerFlag = false;
  openModal({
    title: id ? "Modifier l'évènement" : "Nouvel évènement",
    table: "evenements", id,
    fields: [
      { key: "date_evenement", label: "Date (début)", type: "date", value: row.date_evenement || defaultDate },
      { key: "date_fin", label: "Date de fin (si sur plusieurs jours)", type: "date", value: row.date_fin },
      { key: "date_flexible", label: "Date flexible", type: "checkbox", value: row.date_flexible },
      { key: "mois_seul", label: "Mois (si date flexible)", type: "month", value: row.mois_seul },
      { key: "contact_id", label: "Contact", type: "select-raw", optionsHtml: `<option value="">—</option>` + contactOptionsHtml(row.contact_id, ["Client", "Prospect"]), value: row.contact_id, numeric: true },
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
      { key: "prochain_rdv_adefinir", label: "Prochain RDV à définir (crée une tâche « Prendre rendez-vous »)", type: "checkbox", value: !!row.prochain_rdv_adefinir },
      { key: "arelancer", label: "À relancer (crée une tâche « Relancer »)", type: "checkbox", value: !!row.arelancer },
      { key: "notes", label: "Notes", type: "textarea", value: row.notes },
    ],
    onRender: (form) => {
      const calc = () => { const a = Number(form.elements["nb_adultes"].value || 0); const en = Number(form.elements["nb_enfants"].value || 0); form.elements["nb_invites"].value = (a || en) ? (a + en) : ""; };
      form.elements["nb_adultes"].addEventListener("input", calc);
      form.elements["nb_enfants"].addEventListener("input", calc);
      form.elements["contact_id"].addEventListener("change", () => { const c = findContact(Number(form.elements["contact_id"].value)); if (c && c.provenance && !form.elements["provenance"].value) form.elements["provenance"].value = c.provenance; });
      calc();
      // Bouton "Prendre RDV" à côté du champ prochain RDV
      const rdvField = form.elements["prochain_rdv"].closest(".field");
      const rdvBtn = document.createElement("button");
      rdvBtn.type = "button"; rdvBtn.className = "btn secondary"; rdvBtn.style.marginTop = "6px";
      rdvBtn.innerHTML = icon("users", 13) + " Prendre RDV directement";
      rdvBtn.onclick = () => {
        const contactId = Number(form.elements["contact_id"].value) || null;
        openRdvDialog(null, { evenement_id: id || null, contact_id: contactId });
      };
      rdvField.appendChild(rdvBtn);
      // Bouton "Ouvrir en grand" pour les notes, aussi accessible en édition
      if (id) {
        const notesField = form.elements["notes"].closest(".field");
        const notesBtn = document.createElement("button");
        notesBtn.type = "button"; notesBtn.className = "btn secondary"; notesBtn.style.marginBottom = "6px";
        notesBtn.innerHTML = icon("edit", 13) + " Ouvrir en grand";
        notesBtn.onclick = () => openNotesPanel("Notes — évènement", "evenements", id, form.elements["notes"].value, async () => {
          const fresh = findEvenement(id);
          form.elements["notes"].value = (fresh && fresh.notes) || "";
        });
        notesField.insertBefore(notesBtn, form.elements["notes"]);
      }
    },
    beforeSave: (values) => {
      adefinirFlag = !!values.prochain_rdv_adefinir && !row.prochain_rdv_adefinir;
      arelancerFlag = !!values.arelancer && !row.arelancer;
    },
    onSaved: async (saved) => {
      if (adefinirFlag) await insertRow("todos", { titre: "Prendre rendez-vous", evenement_id: saved.id, priorite: "Basse", statut: "À faire" });
      if (arelancerFlag) await insertRow("todos", { titre: "Relancer", evenement_id: saved.id, priorite: "Basse", statut: "À faire" });
      // Passage automatique Prospect -> Client quand l'évènement est confirmé
      if (saved.statut === "Confirmé" && saved.contact_id) {
        const c = findContact(saved.contact_id);
        if (c && c.categorie === "Prospect") await updateRow("contacts", c.id, { categorie: "Client" });
      }
      await syncEventToGoogle(saved);
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
      <td>${contactLabel(findContact(r.contact_id))}</td><td>${inlineStatusSelect("rdv", r.id, "statut", STATUTS_RDV, r.statut, "renderRdv")}</td>
      <td>${r.notes || "—"}</td>
      <td class="row-actions"><button onclick="openRdvDialog(${r.id})">${icon("edit",14)}</button><button onclick="confirmDelete('rdv', ${r.id}, renderRdv)">${icon("trash",14)}</button></td>
    </tr>`;

  const upcoming = rows.filter(r => !r.date_rdv || r.date_rdv >= today)
    .sort((a, b) => ((a.date_rdv || "9999") + (a.heure || "")).localeCompare((b.date_rdv || "9999") + (b.heure || "")));
  const past = rows.filter(r => r.date_rdv && r.date_rdv < today)
    .sort((a, b) => ((b.date_rdv || "") + (b.heure || "")).localeCompare((a.date_rdv || "") + (a.heure || "")));

  document.getElementById("rdv-tbody").innerHTML = upcoming.length ? upcoming.map(rowHtml).join("") : `<tr class="empty-row"><td colspan="7">Aucun rendez-vous à venir</td></tr>`;
  document.getElementById("rdv-past-tbody").innerHTML = past.length ? past.map(rowHtml).join("") : `<tr class="empty-row"><td colspan="7">Aucun rendez-vous passé</td></tr>`;
}
function openRdvDialog(id, presetValues) {
  const row = id ? cache.rdv.find(r => r.id === id) : (presetValues || {});
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
    onRender: (form) => {
      form.elements["evenement_id"].addEventListener("change", () => {
        const ev = findEvenement(Number(form.elements["evenement_id"].value));
        if (ev && ev.contact_id) form.elements["contact_id"].value = ev.contact_id;
      });
    },
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
      <td class="row-actions"><button onclick="openGrilleDialog(${g.id})">${icon("edit",14)}</button><button onclick="confirmDelete('grille_tarifaire', ${g.id}, renderGrille)">${icon("trash",14)}</button></td>
    </tr>`).join("") : emptyState(8, "Ta grille tarifaire est vide", "Ajouter ta première prestation", "openGrilleDialog(null)");
}
function openGrilleDialog(id, dupFrom) {
  const row = id ? findGrille(id) : (dupFrom ? { nom_presta: dupFrom.nom_presta, details: dupFrom.details, notes_internes: dupFrom.notes_internes } : {});
  openModal({
    title: id ? "Modifier la prestation" : "Nouvelle prestation", table: "grille_tarifaire", id,
    fields: [
      { key: "nom_presta", label: "Nom de la prestation", type: "text", required: true, value: row.nom_presta },
      { key: "details", label: "Détails (affichés dans le devis si sélectionné)", type: "textarea", value: row.details },
      { key: "saison", label: "Saison", type: "select", options: SAISONS, value: row.saison || "Toute l'année" },
      { key: "pu_ttc", label: "PU TTC (€)", type: "number", value: row.pu_ttc },
      { key: "tva", label: "TVA (%)", type: "select", options: TVA_RATES, value: row.tva != null ? row.tva : 20 },
      { key: "montant_tva", label: "Montant TVA (€) — calculé", type: "computed", value: row.montant_tva },
      { key: "pu_ht", label: "PU HT (€) — calculé", type: "computed", value: row.pu_ht },
      { key: "notes_internes", label: "Notes internes (jamais affichées dans le devis)", type: "textarea", value: row.notes_internes },
    ],
    onRender: (form) => {
      const calc = () => { const ttc = Number(form.elements["pu_ttc"].value || 0); const tva = Number(form.elements["tva"].value || 0); const ht = round2(ttc / (1 + tva / 100)); form.elements["pu_ht"].value = ttc ? ht : ""; form.elements["montant_tva"].value = ttc ? round2(ttc - ht) : ""; };
      form.elements["pu_ttc"].addEventListener("input", calc);
      form.elements["tva"].addEventListener("change", calc);
      calc();
      if (id) {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "btn secondary"; btn.style.marginTop = "6px";
        btn.innerHTML = icon("plus", 13) + " Dupliquer pour une autre saison";
        btn.onclick = () => { closeModal(); openGrilleDialog(null, row); };
        form.elements["saison"].closest(".field").appendChild(btn);
      }
    },
    onSaved: refreshAll,
  });
}

// ========================================================================
//  COMMANDE (articles réutilisables)
// ========================================================================
let commandeView = "table";
function renderCommande() {
  ensureFilterOptions("commande-filter-statut", STATUTS_COMMANDE);
  bindSearch("commande-search", renderCommande);
  const search = (document.getElementById("commande-search").value || "").toLowerCase();
  const filter = document.getElementById("commande-filter-statut").value;
  let rows = [...cache.commandes].sort((a, b) => (a.date_commande || "9999").localeCompare(b.date_commande || "9999"));
  if (filter) rows = rows.filter(c => c.statut === filter);
  if (search) rows = rows.filter(c => {
    const artText = (c.lignes || []).map(l => l.article).join(" ") + " " + (c.article || "");
    const fourn = c.fournisseur_contact_id ? contactLabel(findContact(c.fournisseur_contact_id)) : (c.fournisseur || "");
    return (artText + " " + fourn).toLowerCase().includes(search);
  });

  document.getElementById("commande-view-select").value = commandeView;
  document.getElementById("commande-table-view").style.display = commandeView === "table" ? "block" : "none";
  document.getElementById("commande-kanban").style.display = commandeView === "kanban" ? "flex" : "none";
  if (commandeView === "kanban") { renderCommandeKanban(rows); return; }

  const tbody = document.getElementById("commande-tbody");
  tbody.innerHTML = rows.length ? rows.map(c => {
    const e = c.evenement_id ? findEvenement(c.evenement_id) : null;
    const lignes = Array.isArray(c.lignes) && c.lignes.length ? c.lignes : (c.article ? [{ article: c.article, quantite: c.quantite }] : []);
    const articlesTxt = lignes.length ? lignes.map(l => `${l.article}${l.quantite ? " (" + l.quantite + ")" : ""}`).join(", ") : "—";
    const fournisseurTxt = c.fournisseur_contact_id ? contactLabel(findContact(c.fournisseur_contact_id)) : (c.fournisseur || "—");
    return `<tr>
      <td>${articlesTxt}</td>
      <td>${fournisseurTxt}</td>
      <td>${e ? eventLabel(e) : "—"}</td>
      <td>${e ? eventDateLabel(e) : "—"}</td>
      <td>${fmtDateFR(c.date_commande) || "—"}</td>
      <td>${inlineStatusSelect("commandes", c.id, "statut", STATUTS_COMMANDE, c.statut, "renderCommande")}</td>
      <td class="row-actions"><button onclick="openCommandeDialog(${c.id})">${icon("edit",14)}</button><button onclick="confirmDelete('commandes', ${c.id}, renderCommande)">${icon("trash",14)}</button></td>
    </tr>`;
  }).join("") : emptyState(7, "Aucune commande pour l'instant", "Ajouter ta première commande", "openCommandeDialog(null)");
}

function renderCommandeKanban(rows) {
  const board = document.getElementById("commande-kanban");
  board.innerHTML = STATUTS_COMMANDE.map(statut => {
    const items = rows.filter(c => c.statut === statut);
    const cards = items.map(c => {
      const lignes = Array.isArray(c.lignes) && c.lignes.length ? c.lignes : (c.article ? [{ article: c.article }] : []);
      const artTxt = lignes.length ? lignes.map(l => l.article).join(", ") : "—";
      const fournisseurTxt = c.fournisseur_contact_id ? contactLabel(findContact(c.fournisseur_contact_id)) : (c.fournisseur || "");
      return `<div class="kanban-card" draggable="true" data-id="${c.id}" onclick="openCommandeDialog(${c.id})">
        <div class="kc-name">${artTxt}</div>
        <div class="kc-date">${fmtDateFR(c.date_commande) || "—"}${fournisseurTxt ? " · " + fournisseurTxt : ""}</div>
      </div>`;
    }).join("");
    return `<div class="kanban-col" data-statut="${statut}"><h4>${statut} <span>${items.length}</span></h4>${cards}</div>`;
  }).join("");

  board.querySelectorAll(".kanban-card").forEach(card => {
    card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", card.dataset.id); e.dataTransfer.effectAllowed = "move"; });
  });
  board.querySelectorAll(".kanban-col").forEach(col => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault(); col.classList.remove("drag-over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      const newStatut = col.dataset.statut;
      const c = cache.commandes.find(x => x.id === id);
      if (!c || c.statut === newStatut) return;
      const saved = await updateRow("commandes", id, { statut: newStatut });
      if (saved) { showToast("Statut mis à jour : " + newStatut); await refreshCache(); renderCommande(); }
    });
  });
}

let commandeLignesState = [];
const BLANK_COMMANDE_LIGNE = () => ({ article: "", quantite: 1 });

function openCommandeDialog(id) {
  const row = id ? cache.commandes.find(c => c.id === id) : {};
  commandeLignesState = Array.isArray(row.lignes) && row.lignes.length ? JSON.parse(JSON.stringify(row.lignes)) : (row.article ? [{ article: row.article, quantite: row.quantite }] : [BLANK_COMMANDE_LIGNE()]);

  const html = `
    <div class="field"><label>Évènement lié (facultatif)</label>
      <select name="evenement_id">${`<option value="">— Aucun —</option>` + evenementOptionsHtml(row.evenement_id)}</select>
    </div>
    <div class="field"><label>Date de commande</label><input type="date" name="date_commande" value="${row.date_commande || ""}"></div>
    <div class="field"><label>Statut</label>
      <select name="statut">${STATUTS_COMMANDE.map(s => `<option value="${s}" ${s === (row.statut || "À commander") ? "selected" : ""}>${s}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Articles</label>
      <div id="commande-lignes-list"></div>
      <button type="button" class="btn secondary" id="commande-add-ligne">${icon("plus",13)} Ajouter une ligne</button>
    </div>
    <div class="field"><label>Fournisseur (facultatif, parmi tes contacts)</label>
      <select name="fournisseur_contact_id">${`<option value="">— Aucun —</option>` + contactOptionsHtml(row.fournisseur_contact_id, ["Fournisseur"])}</select>
    </div>`;

  openRawModal(id ? "Modifier la commande" : "Nouvelle commande", html, () => saveCommandeDialog(id, row));
  document.getElementById("modal-delete").style.display = id ? "inline-block" : "none";
  if (id) document.getElementById("modal-delete").onclick = () => { closeModal(); confirmDelete("commandes", id, renderCommande); };

  renderCommandeLignes();
  document.getElementById("commande-add-ligne").addEventListener("click", () => { commandeLignesState.push(BLANK_COMMANDE_LIGNE()); renderCommandeLignes(); });
}
function renderCommandeLignes() {
  const c = document.getElementById("commande-lignes-list");
  c.innerHTML = commandeLignesState.map((l, i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
      <input data-ci="${i}" data-ck="article" placeholder="Article" value="${escapeAttr(l.article || "")}" style="flex:1;padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input type="number" data-ci="${i}" data-ck="quantite" placeholder="Qté" value="${l.quantite != null ? l.quantite : ""}" style="width:70px;padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <button type="button" onclick="removeCommandeLigne(${i})" style="background:none;border:none;color:var(--danger);font-size:14px;">${icon("x",13)}</button>
    </div>`).join("");
  c.querySelectorAll("[data-ci]").forEach(el => el.addEventListener("input", (e) => {
    const i = Number(e.target.dataset.ci), k = e.target.dataset.ck;
    commandeLignesState[i][k] = k === "quantite" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value;
  }));
}
function removeCommandeLigne(i) {
  commandeLignesState.splice(i, 1);
  if (!commandeLignesState.length) commandeLignesState.push(BLANK_COMMANDE_LIGNE());
  renderCommandeLignes();
}
async function saveCommandeDialog(id, row) {
  const form = document.getElementById("modal-form");
  const lignes = commandeLignesState.filter(l => l.article);
  const values = {
    evenement_id: Number(form.elements["evenement_id"].value) || null,
    date_commande: form.elements["date_commande"].value || null,
    statut: form.elements["statut"].value,
    fournisseur_contact_id: Number(form.elements["fournisseur_contact_id"].value) || null,
    lignes,
    article: lignes[0] ? lignes[0].article : null,
    quantite: lignes[0] ? lignes[0].quantite : null,
  };
  const saved = id ? await updateRow("commandes", id, values) : await insertRow("commandes", values);
  if (!saved) return;
  if (saved.date_commande) {
    const existing = cache.todos.find(t => t.commande_id === saved.id && t.titre === "Passer commande");
    if (existing) { if (existing.date_echeance !== saved.date_commande) await updateRow("todos", existing.id, { date_echeance: saved.date_commande }); }
    else await insertRow("todos", { titre: "Passer commande", description: lignes.length ? "Articles : " + lignes.map(l => l.article).join(", ") : null, commande_id: saved.id, date_echeance: saved.date_commande, statut: "À faire", priorite: "Normale" });
  }
  showToast(id ? "Commande mise à jour" : "Commande ajoutée");
  closeModal();
  await refreshAll();
}

// ========================================================================
//  CALENDRIER
// ========================================================================
const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DOW_FR = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const TYPE_EVENEMENT_COLORS = {
  "Mariage": "#C97FA6", "Anniversaire": "#4F7FE0", "Baptême": "#3FA772", "Séminaire": "#D99A2B",
};
function eventTypeColor(e) { return TYPE_EVENEMENT_COLORS[e.type_evenement] || "#9297A3"; }
function calLegendHtml() {
  const items = [...TYPES_EVENEMENT, "Autre"];
  return items.map(t => `<span><i style="background:${TYPE_EVENEMENT_COLORS[t] || "#9297A3"};"></i>${t}</span>`).join("");
}
function renderCalendrier() {
  document.getElementById("cal-grid").style.display = calState.view === "month" ? "grid" : "none";
  document.getElementById("cal-year-grid").style.display = calState.view === "year" ? "grid" : "none";
  document.getElementById("cal-view-select").value = calState.view;
  document.getElementById("cal-legend").innerHTML = calLegendHtml();
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
    const items = evts.slice(0, 4).map(e => `<div class="yc-item"><i style="width:6px;height:6px;border-radius:50%;background:${eventTypeColor(e)};display:inline-block;margin-right:5px;"></i>${e.date_evenement.slice(8, 10)} — ${contactLabel(findContact(e.contact_id))}</div>`).join("");
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
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  cache.evenements.forEach(e => {
    if (e.date_flexible || !e.date_evenement) return;
    const start = e.date_evenement, end = e.date_fin || e.date_evenement;
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard < 62) {
      if (cursor.startsWith(monthPrefix)) {
        const d = Number(cursor.slice(8, 10));
        (eventsByDay[d] = eventsByDay[d] || []).push(e);
      }
      cursor = addDaysISO(cursor, 1);
      guard++;
    }
  });
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayIso = todayStr();
  let html = DOW_FR.map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    const isToday = iso === todayIso, isSelected = iso === calState.selected;
    const dayEvents = eventsByDay[day] || [];
    const dots = dayEvents.slice(0, 6).map(e => `<span style="background:${eventTypeColor(e)};"></span>`).join("");
    const hasUnconfirmed = dayEvents.some(e => !["Confirmé", "Passé", "Annulé"].includes(e.statut));
    html += `<div class="cal-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" onclick="selectCalDay('${iso}')"><div>${day}${hasUnconfirmed ? ' <span style="opacity:.7;">?</span>' : ""}</div>${dots ? `<div class="evt-dots">${dots}</div>` : ""}</div>`;
  }
  document.getElementById("cal-grid").innerHTML = html;
  if (!calState.selected || !calState.selected.startsWith(monthPrefix)) {
    calState.selected = (month === new Date().getMonth() + 1 && year === new Date().getFullYear()) ? todayIso : null;
  }
  renderCalDay();

  // Évènements à date flexible ce mois, listés en bas de page
  const flexEvents = cache.evenements.filter(e => e.date_flexible && (e.mois_seul || "").startsWith(monthPrefix));
  let flexWrap = document.getElementById("cal-flex-wrap");
  if (!flexWrap) {
    flexWrap = document.createElement("div");
    flexWrap.id = "cal-flex-wrap";
    flexWrap.className = "panel";
    flexWrap.style.marginTop = "16px";
    document.getElementById("cal-legend").insertAdjacentElement("afterend", flexWrap);
  }
  flexWrap.innerHTML = flexEvents.length
    ? `<h3 style="font-size:13px;margin:0 0 10px;">Dates flexibles ce mois-ci</h3>` + flexEvents.map(e => `<div style="padding:6px 0;border-top:1px solid var(--border);font-size:13px;cursor:pointer;" onclick="openEventRecap(${e.id})">${contactLabel(findContact(e.contact_id))} — ${e.type_evenement || "Évènement"}</div>`).join("")
    : "";
}
function selectCalDay(iso) { calState.selected = iso; renderCalendrier(); }
function renderCalDay() {
  const lbl = document.getElementById("cal-day-lbl"), tbody = document.getElementById("cal-day-tbody");
  if (!calState.selected) { lbl.textContent = "Évènements du jour"; tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Sélectionne un jour</td></tr>`; return; }
  lbl.textContent = "Évènements du " + fmtDateFR(calState.selected);
  const rows = cache.evenements.filter(e => e.date_evenement === calState.selected).sort((a, b) => (a.heure_debut || "").localeCompare(b.heure_debut || ""));
  tbody.innerHTML = rows.length ? rows.map(e => `<tr onclick="openEvenementDialog(${e.id})" style="cursor:pointer;"><td>${e.heure_debut || "—"}</td><td>${eventLabel(e)}</td><td><span style="display:inline-flex;align-items:center;gap:6px;"><i style="width:8px;height:8px;border-radius:50%;background:${eventTypeColor(e)};display:inline-block;"></i>${e.type_evenement || "—"}</span></td><td>${badge(e.statut, STATUT_COLORS[e.statut])}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="4">Aucun évènement — clique pour en ajouter un</td></tr>`;
}

// ========================================================================
//  PRESTATAIRE
// ========================================================================
function findPrestataire(id) { return cache.prestataires.find(p => p.id === id); }
function cityFromAddress(adresse) {
  if (!adresse) return null;
  const parts = adresse.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return parts[parts.length - 1].replace(/^\d{4,5}\s*/, "").trim() || null;
}
function prestataireTarifLabel(p) {
  const prix = (p.prestations || []).flatMap(pr => {
    if (pr.type_prix === "Fourchette") return [pr.prix_min, pr.prix_max].filter(x => x != null && x !== "").map(Number);
    return pr.prix_exact != null && pr.prix_exact !== "" ? [Number(pr.prix_exact)] : [];
  }).filter(x => !isNaN(x));
  if (!prix.length) return "—";
  const min = Math.min(...prix), max = Math.max(...prix);
  return min === max ? min + " €" : `entre ${min} € et ${max} €`;
}
let prestState = { id: null, lignes: [] };
const BLANK_PREST_LIGNE = () => ({ titre: "", description: "", type_prix: "Exact", prix_exact: "", prix_min: "", prix_max: "" });

function renderPrestataire() {
  ensureFilterOptions("prestataire-filter-type", TYPES_PRESTATAIRE);
  const filter = document.getElementById("prestataire-filter-type").value;
  let rows = [...cache.prestataires].sort((a, b) => contactLabel(findContact(a.contact_id)).localeCompare(contactLabel(findContact(b.contact_id)), "fr"));
  if (filter) rows = rows.filter(p => p.type_prestataire === filter);
  const tbody = document.getElementById("prestataire-tbody");
  tbody.innerHTML = rows.length ? rows.map(p => {
    const c = findContact(p.contact_id);
    return `<tr>
      <td>${contactLabel(c)}</td>
      <td>${p.type_prestataire || "—"}</td>
      <td>${p.pdf_path ? `<button title="Voir la fiche" onclick="downloadAttachment('${p.pdf_path}')">${icon("paperclip",14)} Voir</button>` : "—"}</td>
      <td>${prestataireTarifLabel(p)}</td>
      <td>${cityFromAddress(c && c.adresse) || "—"}</td>
      <td class="row-actions">
        <button title="Fiche récap" onclick="openPrestataireRecap(${p.id})">${icon("clipboard",14)}</button>
        <button onclick="openPrestataireDialog(${p.id})">${icon("edit",14)}</button>
        <button onclick="confirmDelete('prestataires', ${p.id}, renderPrestataire)">${icon("trash",14)}</button>
      </td>
    </tr>`;
  }).join("") : emptyState(6, "Aucun prestataire enregistré", "Créer ta première fiche", "openPrestataireDialog(null)");
}

function openPrestataireDialog(id) {
  const row = id ? findPrestataire(id) : {};
  prestState = { id: id || null, lignes: Array.isArray(row.prestations) && row.prestations.length ? JSON.parse(JSON.stringify(row.prestations)) : [BLANK_PREST_LIGNE()] };

  const html = `
    <div class="field"><label>Contact lié</label>
      <select id="prest-contact"><option value="">— Sélectionner —</option>${contactOptionsHtml(row.contact_id, ["Prestataire"])}</select>
    </div>
    <div id="prest-contact-info" style="font-size:12.5px;color:var(--muted);margin:-6px 0 12px;"></div>
    <div class="field"><label>Type de prestataire</label>
      <select id="prest-type">${TYPES_PRESTATAIRE.map(t => `<option value="${t}" ${t === row.type_prestataire ? "selected" : ""}>${t}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Fiche de présentation (PDF)</label>
      <input type="file" id="prest-pdf" accept="application/pdf">
      ${row.pdf_path ? `<div style="margin-top:6px;"><button type="button" class="btn secondary" onclick="downloadAttachment('${row.pdf_path}')">${icon("paperclip",14)} Voir la fiche actuelle</button></div>` : ""}
    </div>
    <div class="field"><label>Prestations</label>
      <div id="prest-lignes"></div>
      <button type="button" class="btn secondary" id="prest-add-ligne">${icon("plus",13)} Ajouter une prestation</button>
    </div>
    <div class="field"><label>Notes</label><textarea id="prest-notes">${row.notes || ""}</textarea></div>`;

  openRawModal(id ? "Modifier la fiche prestataire" : "Nouvelle fiche prestataire", html, savePrestataire);
  document.getElementById("modal-delete").style.display = id ? "inline-block" : "none";
  if (id) document.getElementById("modal-delete").onclick = () => { closeModal(); confirmDelete("prestataires", id, renderPrestataire); };

  renderPrestLignes();
  const contactSel = document.getElementById("prest-contact");
  const updateContactInfo = () => {
    const c = findContact(Number(contactSel.value));
    document.getElementById("prest-contact-info").innerHTML = c
      ? `${contactLabel(c)}${c.telephone ? " · " + c.telephone : ""}${c.email ? " · " + c.email : ""}${c.adresse ? "<br>" + c.adresse : ""}${c.provenance ? "<br>Provenance : " + c.provenance : ""}`
      : "";
  };
  contactSel.addEventListener("change", updateContactInfo);
  updateContactInfo();
  document.getElementById("prest-add-ligne").addEventListener("click", () => { prestState.lignes.push(BLANK_PREST_LIGNE()); renderPrestLignes(); });
}

function renderPrestLignes() {
  const c = document.getElementById("prest-lignes");
  c.innerHTML = prestState.lignes.map((l, i) => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;align-items:center;">
        <input data-pi="${i}" data-pk="titre" placeholder="Titre de la prestation" value="${escapeAttr(l.titre || "")}" style="flex:1;min-width:140px;padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
        <button type="button" onclick="removePrestLigne(${i})" style="background:none;border:none;color:var(--danger);font-size:15px;">${icon("x",13)}</button>
      </div>
      <textarea data-pi="${i}" data-pk="description" placeholder="Description" style="width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:5px;min-height:44px;margin-bottom:6px;">${l.description || ""}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <select data-pi="${i}" data-pk="type_prix" style="padding:6px 8px;border:1px solid var(--border);border-radius:5px;">
          <option value="Exact" ${l.type_prix === "Exact" ? "selected" : ""}>Prix exact</option>
          <option value="Fourchette" ${l.type_prix === "Fourchette" ? "selected" : ""}>Fourchette de prix</option>
          <option value="A_partir_de" ${l.type_prix === "A_partir_de" ? "selected" : ""}>À partir de</option>
        </select>
        ${l.type_prix === "Fourchette" ? `
          <input type="number" data-pi="${i}" data-pk="prix_min" placeholder="Min €" value="${l.prix_min != null ? l.prix_min : ""}" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:5px;">
          <input type="number" data-pi="${i}" data-pk="prix_max" placeholder="Max €" value="${l.prix_max != null ? l.prix_max : ""}" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:5px;">
        ` : `
          <input type="number" data-pi="${i}" data-pk="prix_exact" placeholder="${l.type_prix === "A_partir_de" ? "À partir de €" : "Prix €"}" value="${l.prix_exact != null ? l.prix_exact : ""}" style="width:120px;padding:6px 8px;border:1px solid var(--border);border-radius:5px;">
        `}
      </div>
    </div>`).join("");
  c.querySelectorAll("[data-pi]").forEach(el => { el.addEventListener("input", readPrestLigneField); el.addEventListener("change", readPrestLigneField); });
}
function readPrestLigneField(e) {
  const i = Number(e.target.dataset.pi), k = e.target.dataset.pk;
  prestState.lignes[i][k] = e.target.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value;
  if (k === "type_prix") renderPrestLignes();
}
function removePrestLigne(i) {
  prestState.lignes.splice(i, 1);
  if (!prestState.lignes.length) prestState.lignes.push(BLANK_PREST_LIGNE());
  renderPrestLignes();
}
async function savePrestataire() {
  const contact_id = Number(document.getElementById("prest-contact").value) || null;
  const type_prestataire = document.getElementById("prest-type").value;
  const fileEl = document.getElementById("prest-pdf");
  const values = { contact_id, type_prestataire, prestations: prestState.lignes.filter(l => l.titre), notes: document.getElementById("prest-notes").value || null };
  let saved = prestState.id ? await updateRow("prestataires", prestState.id, values) : await insertRow("prestataires", values);
  if (!saved) return;
  if (fileEl && fileEl.files && fileEl.files[0]) {
    const path = `${currentUser.id}/prestataires-${saved.id}.pdf`;
    const { error } = await sb.storage.from("devis-signes").upload(path, fileEl.files[0], { upsert: true, contentType: "application/pdf" });
    if (!error) await updateRow("prestataires", saved.id, { pdf_path: path });
    else showToast("Erreur envoi du PDF");
  }
  showToast(prestState.id ? "Fiche mise à jour" : "Fiche ajoutée");
  if (!prestState.id) clearTableFilters("prestataires");
  closeModal();
  await refreshAll();
}
function openPrestataireRecap(id) {
  const p = findPrestataire(id);
  if (!p) return;
  const c = findContact(p.contact_id);
  const line = (l, v) => `<tr><td style="color:var(--muted);width:42%;">${l}</td><td>${v || "—"}</td></tr>`;
  const prestHtml = (p.prestations || []).length ? p.prestations.map(pr => {
    const prix = pr.type_prix === "Fourchette" ? `${pr.prix_min ?? "?"} € – ${pr.prix_max ?? "?"} €`
      : pr.type_prix === "A_partir_de" ? (pr.prix_exact != null && pr.prix_exact !== "" ? "À partir de " + pr.prix_exact + " €" : "—")
      : (pr.prix_exact != null && pr.prix_exact !== "" ? pr.prix_exact + " €" : "—");
    return `<tr><td>${pr.titre || "—"}</td><td>${pr.description || "—"}</td><td>${prix}</td></tr>`;
  }).join("") : `<tr class="empty-row"><td colspan="3">Aucune prestation renseignée</td></tr>`;
  const html = `
    <table class="data" style="margin-bottom:16px;"><tbody>
      ${line("Contact", contactLabel(c))}
      ${line("Téléphone", c && c.telephone)}
      ${line("Email", c && c.email)}
      ${line("Adresse", c && c.adresse)}
      ${line("Provenance", c && c.provenance)}
      ${line("Type de prestataire", p.type_prestataire)}
      ${line("Tarifs", prestataireTarifLabel(p))}
      ${line("Localisation", cityFromAddress(c && c.adresse))}
    </tbody></table>
    <h3 style="font-size:14px;margin:0 0 8px;">${icon("mic",14)} Prestations</h3>
    <table class="data" style="margin-bottom:16px;"><thead><tr><th>Titre</th><th>Description</th><th>Prix</th></tr></thead><tbody>${prestHtml}</tbody></table>
    ${p.notes ? `<h3 style="font-size:14px;margin:16px 0 8px;">${icon("edit",14)} Notes</h3><div style="font-size:13.5px;white-space:pre-wrap;background:#FAFAF8;border:1px solid var(--border);border-radius:8px;padding:12px;">${p.notes}</div>` : ""}
    ${p.pdf_path ? `<button class="btn secondary" type="button" onclick="downloadAttachment('${p.pdf_path}')" style="margin-top:12px;">${icon("paperclip",14)} Voir la fiche de présentation</button>` : ""}`;
  showInfoModal("Fiche récap prestataire", html);
}

// ========================================================================
//  NOTES
// ========================================================================
function findNote(id) { return cache.notes.find(n => n.id === id); }
let noteState = { id: null, liens: [], newFiles: [] };

function renderNotes() {
  const catOptions = cache.note_categories.map(c => c.nom);
  ensureFilterOptions("notes-filter-categorie", catOptions);
  bindSearch("notes-search", renderNotes);
  const search = (document.getElementById("notes-search").value || "").toLowerCase();
  const fCat = document.getElementById("notes-filter-categorie").value;
  let rows = [...cache.notes].sort((a, b) => (b.date_modif || b.date_creation || "").localeCompare(a.date_modif || a.date_creation || ""));
  if (fCat) rows = rows.filter(n => n.categorie === fCat);
  if (search) rows = rows.filter(n => (n.titre || "").toLowerCase().includes(search));
  const tbody = document.getElementById("notes-tbody");
  tbody.innerHTML = rows.length ? rows.map(n => `
    <tr>
      <td>${n.titre || "—"}</td>
      <td>${n.categorie || "—"}</td>
      <td class="row-actions">
        <button title="Éditer" onclick="openNoteEditor(${n.id})">${icon("edit",14)}</button>
        <button title="Exporter en PDF" onclick="exportNotePDF(${n.id})">${icon("download",14)}</button>
        <button title="Voir les liens" onclick="openNoteLiens(${n.id})">${icon("link",14)}</button>
        <button title="Supprimer" onclick="confirmDelete('notes', ${n.id}, renderNotes)">${icon("trash",14)}</button>
      </td>
    </tr>`).join("") : emptyState(3, "Aucune note pour l'instant", "Créer ta première note", "openNoteEditor(null)");
}

function fillNoteCategorieSelect(selected) {
  const sel = document.getElementById("note-categorie");
  sel.innerHTML = `<option value="">— Sans catégorie —</option>` + cache.note_categories.map(c => `<option value="${escapeAttr(c.nom)}" ${c.nom === selected ? "selected" : ""}>${c.nom}</option>`).join("");
}
function renderNoteLiensList() {
  const el = document.getElementById("note-liens-list");
  const existing = noteState.liens.map((l, i) => `<span class="lien-chip">${icon("paperclip",12)} ${l.nom} <button type="button" onclick="removeNoteLien(${i})">${icon("x",13)}</button></span>`).join("");
  const pending = noteState.newFiles.map((f, i) => `<span class="lien-chip">${icon("plus",12)} ${f.name} <button type="button" onclick="removeNotePendingFile(${i})">${icon("x",13)}</button></span>`).join("");
  el.innerHTML = existing + pending || `<span style="font-size:12.5px;color:var(--muted);">Aucun fichier lié pour l'instant.</span>`;
}
function removeNoteLien(i) { noteState.liens.splice(i, 1); renderNoteLiensList(); }
function removeNotePendingFile(i) { noteState.newFiles.splice(i, 1); renderNoteLiensList(); }

function openNoteEditor(id) {
  const row = id ? findNote(id) : {};
  noteState = { id: id || null, liens: Array.isArray(row.liens) ? JSON.parse(JSON.stringify(row.liens)) : [], newFiles: [] };
  document.getElementById("note-titre").value = row.titre || "";
  fillNoteCategorieSelect(row.categorie);
  document.getElementById("note-contact").innerHTML = `<option value="">— Aucun contact lié —</option>` + contactOptionsHtml(row.contact_id);
  document.getElementById("note-contenu").value = row.contenu || "";
  document.getElementById("note-liens-input").value = "";
  renderNoteLiensList();
  document.getElementById("note-editor").classList.add("open");
}
function closeNoteEditor() { document.getElementById("note-editor").classList.remove("open"); }

async function saveNoteEditor() {
  const titre = document.getElementById("note-titre").value.trim();
  if (!titre) { showToast("Le titre est obligatoire"); return; }
  const categorie = document.getElementById("note-categorie").value || null;
  const contact_id = Number(document.getElementById("note-contact").value) || null;
  const contenu = document.getElementById("note-contenu").value;
  const values = { titre, categorie, contact_id, contenu, date_modif: nowStr() };
  let saved = noteState.id ? await updateRow("notes", noteState.id, { ...values, liens: noteState.liens }) : await insertRow("notes", { ...values, liens: noteState.liens });
  if (!saved) return;
  if (noteState.newFiles.length) {
    const liens = [...noteState.liens];
    for (const file of noteState.newFiles) {
      const path = `${currentUser.id}/notes-${saved.id}-${Date.now()}-${file.name}`;
      const { error } = await sb.storage.from("devis-signes").upload(path, file, { upsert: true });
      if (!error) liens.push({ nom: file.name, path }); else showToast("Erreur envoi fichier : " + file.name);
    }
    await updateRow("notes", saved.id, { liens });
  }
  showToast(noteState.id ? "Note enregistrée" : "Note créée");
  if (!noteState.id) clearTableFilters("notes");
  closeNoteEditor();
  await refreshAll();
}
function openNoteLiens(id) {
  const n = findNote(id);
  if (!n) return;
  const liens = Array.isArray(n.liens) ? n.liens : [];
  const html = liens.length
    ? `<table class="data"><tbody>${liens.map(l => `<tr><td>${l.nom}</td><td class="row-actions"><button onclick="downloadAttachment('${l.path}')">${icon("download",13)} Télécharger</button></td></tr>`).join("")}</tbody></table>`
    : `<p style="color:var(--muted);">Aucun fichier lié à cette note.</p>`;
  showInfoModal("Fichiers liés — " + (n.titre || ""), html);
}
function exportNotePDF(id) {
  const n = findNote(id);
  if (!n) return;
  if (!window.jspdf) { showToast("Générateur PDF indisponible (hors-ligne)"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text(n.titre || "Note", 20, 22);
  if (n.categorie) { doc.setFontSize(10); doc.setTextColor(120); doc.text("Catégorie : " + n.categorie, 20, 30); doc.setTextColor(0); }
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(n.contenu || "", 170);
  doc.text(lines, 20, 42);
  doc.save((n.titre || "note").replace(/\s+/g, "_") + ".pdf");
}

// ---- Gestion des catégories de notes ----
function openTypesFactureManager() {
  const html = `<p style="font-size:12.5px;color:var(--muted);margin:0 0 10px;">L'échéance correspond au nombre de jours/mois <strong>avant la date de l'évènement</strong>.</p>
    <div id="tf-mgr-list">${renderTypesFactureRows()}</div>
    <h4 style="font-size:12.5px;margin:16px 0 8px;">Nouveau type</h4>
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;align-items:center;">
      <input id="tf-new-designation" placeholder="Désignation (ex : Facture 1er acompte)" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input id="tf-new-pourcentage" type="number" placeholder="%" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <input id="tf-new-echeance-nb" type="number" placeholder="Nombre" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
      <select id="tf-new-echeance-unite" style="padding:7px 8px;border:1px solid var(--border);border-radius:5px;">
        <option value="jours">Jours avant</option>
        <option value="mois">Mois avant</option>
      </select>
    </div>
    <button type="button" class="btn secondary" id="tf-add-btn" style="margin-top:10px;">${icon("plus", 13)} Ajouter ce type</button>`;
  showInfoModal("Types de facture", html);
  document.getElementById("tf-add-btn").addEventListener("click", addTypeFacture);
}
function renderTypesFactureRows() {
  if (!cache.types_facture.length) return `<p style="color:var(--muted);font-size:13px;">Aucun type pour l'instant — "Solde" et "Facture manuelle" sont toujours disponibles par défaut.</p>`;
  return `<table class="data"><tbody>${cache.types_facture.map(t => `
    <tr>
      <td>${t.designation}</td>
      <td>${t.pourcentage != null ? t.pourcentage + " %" : "—"}</td>
      <td>${t.echeance_nombre != null ? t.echeance_nombre + " " + (t.echeance_unite || "jours") + " avant" : "—"}</td>
      <td class="row-actions"><button title="Supprimer" onclick="deleteTypeFacture(${t.id})">${icon("trash",13)}</button></td>
    </tr>`).join("")}</tbody></table>`;
}
async function addTypeFacture() {
  const designation = document.getElementById("tf-new-designation").value.trim();
  if (!designation) { showToast("La désignation est obligatoire"); return; }
  const values = {
    designation,
    pourcentage: Number(document.getElementById("tf-new-pourcentage").value) || null,
    echeance_nombre: Number(document.getElementById("tf-new-echeance-nb").value) || null,
    echeance_unite: document.getElementById("tf-new-echeance-unite").value,
  };
  const saved = await insertRow("types_facture", values);
  if (saved) { await refreshCache(); document.getElementById("tf-mgr-list").innerHTML = renderTypesFactureRows(); document.getElementById("tf-new-designation").value = ""; document.getElementById("tf-new-pourcentage").value = ""; document.getElementById("tf-new-echeance-nb").value = ""; showToast("Type ajouté"); }
}
async function deleteTypeFacture(id) {
  if (!confirm("Supprimer ce type de facture ?")) return;
  await deleteRow("types_facture", id);
  await refreshCache();
  document.getElementById("tf-mgr-list").innerHTML = renderTypesFactureRows();
}

function openCgvManager() {
  const html = `<div id="cgv-mgr-list">${renderCgvMgrRows()}</div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <input id="new-cgv-input" placeholder="Nouvelle condition…" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;">
      <button type="button" class="btn secondary" id="new-cgv-btn">${icon("plus", 13)} Ajouter</button>
    </div>`;
  showInfoModal("Conditions générales de vente — gestion", html);
  document.getElementById("new-cgv-btn").addEventListener("click", addCgvOption);
}
function renderCgvMgrRows() {
  const list = cache.cgv_options.length ? cache.cgv_options : CGV_OPTIONS_DEFAUT.map((t, i) => ({ id: null, texte: t, ordre: i }));
  if (!list.length) return `<p style="color:var(--muted);font-size:13px;">Aucune condition pour l'instant.</p>`;
  return `<table class="data"><tbody>${list.map(c => `
    <tr>
      <td><textarea data-cgv-id="${c.id || ""}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;min-height:44px;">${c.texte}</textarea></td>
      <td class="row-actions" style="width:90px;">
        ${c.id ? `<button title="Enregistrer" onclick="renameCgvOption(${c.id})">${icon("edit",13)}</button><button title="Supprimer" onclick="deleteCgvOption(${c.id})">${icon("trash",13)}</button>` : `<span style="font-size:11px;color:var(--muted);">Par défaut</span>`}
      </td>
    </tr>`).join("")}</tbody></table>`;
}
async function addCgvOption() {
  const input = document.getElementById("new-cgv-input");
  const texte = input.value.trim();
  if (!texte) return;
  const ordre = cache.cgv_options.length;
  const saved = await insertRow("cgv_options", { texte, ordre });
  if (saved) { await refreshCache(); input.value = ""; document.getElementById("cgv-mgr-list").innerHTML = renderCgvMgrRows(); }
}
async function renameCgvOption(id) {
  const textarea = document.querySelector(`[data-cgv-id="${id}"]`);
  const texte = textarea.value.trim();
  if (!texte) return;
  await updateRow("cgv_options", id, { texte });
  await refreshCache();
  showToast("Condition mise à jour");
}
async function deleteCgvOption(id) {
  if (!confirm("Supprimer cette condition ?")) return;
  await deleteRow("cgv_options", id);
  await refreshCache();
  document.getElementById("cgv-mgr-list").innerHTML = renderCgvMgrRows();
  showToast("Condition supprimée");
}

function openNoteCategoriesModal() {
  const html = `<div id="note-cat-list">${renderNoteCategoriesRows()}</div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <input id="new-cat-input" placeholder="Nouvelle catégorie…" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;">
      <button type="button" class="btn secondary" id="new-cat-btn">${icon("plus",13)} Ajouter</button>
    </div>`;
  showInfoModal("Catégories de notes", html);
  document.getElementById("new-cat-btn").addEventListener("click", addNoteCategory);
}
function renderNoteCategoriesRows() {
  if (!cache.note_categories.length) return `<p style="color:var(--muted);font-size:13px;">Aucune catégorie pour l'instant.</p>`;
  return `<table class="data"><tbody>${cache.note_categories.map(c => `
    <tr>
      <td><input value="${escapeAttr(c.nom)}" data-cat-id="${c.id}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;"></td>
      <td class="row-actions" style="width:90px;">
        <button title="Renommer" onclick="renameNoteCategory(${c.id})">${icon("edit",14)}</button>
        <button title="Supprimer" onclick="deleteNoteCategory(${c.id})">${icon("trash",14)}</button>
      </td>
    </tr>`).join("")}</tbody></table>`;
}
async function addNoteCategory() {
  const input = document.getElementById("new-cat-input");
  const nom = input.value.trim();
  if (!nom) return;
  const saved = await insertRow("note_categories", { nom });
  if (saved) { await refreshCache(); input.value = ""; document.getElementById("note-cat-list").innerHTML = renderNoteCategoriesRows(); renderNotes(); }
}
async function renameNoteCategory(id) {
  const input = document.querySelector(`[data-cat-id="${id}"]`);
  const nom = input.value.trim();
  if (!nom) return;
  const old = cache.note_categories.find(c => c.id === id);
  const saved = await updateRow("note_categories", id, { nom });
  if (saved && old && old.nom !== nom) {
    // met à jour les notes qui utilisaient l'ancien nom de catégorie
    const toUpdate = cache.notes.filter(n => n.categorie === old.nom);
    for (const n of toUpdate) await updateRow("notes", n.id, { categorie: nom });
  }
  await refreshCache();
  showToast("Catégorie renommée");
  document.getElementById("note-cat-list").innerHTML = renderNoteCategoriesRows();
  renderNotes();
}
async function deleteNoteCategory(id) {
  if (!confirm("Supprimer cette catégorie ? Les notes associées perdront leur catégorie.")) return;
  const old = cache.note_categories.find(c => c.id === id);
  await deleteRow("note_categories", id);
  if (old) {
    const toUpdate = cache.notes.filter(n => n.categorie === old.nom);
    for (const n of toUpdate) await updateRow("notes", n.id, { categorie: null });
  }
  await refreshCache();
  showToast("Catégorie supprimée");
  document.getElementById("note-cat-list").innerHTML = renderNoteCategoriesRows();
  renderNotes();
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
  prestataires: ["prestataire-filter-type"],
  notes: ["notes-filter-categorie", "notes-search"],
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
  const evForGoogle = table === "evenements" ? findEvenement(id) : null;
  deleteRow(table, id).then(async ok => {
    if (ok) {
      if (evForGoogle) await deleteEventFromGoogle(evForGoogle);
      showToast("Supprimé"); await refreshCache(); if (afterFn) afterFn(); else renderPage(currentPage);
    }
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
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);
  document.getElementById("btn-connect-google").addEventListener("click", connectGoogle);
  document.getElementById("menu-toggle-btn").addEventListener("click", openMobileMenu);
  document.getElementById("sidebar-overlay").addEventListener("click", closeMobileMenu);
  document.getElementById("global-search-btn").addEventListener("click", openGlobalSearch);
  document.getElementById("pdf-preview-close").addEventListener("click", closePdfPreview);
  document.getElementById("pdf-preview-overlay").addEventListener("click", (e) => { if (e.target.id === "pdf-preview-overlay") closePdfPreview(); });
  document.getElementById("notif-bell-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleNotifPanel(); });
  document.getElementById("notif-enable-btn").addEventListener("click", (e) => { e.stopPropagation(); enableBrowserNotifications(); });
  document.getElementById("notif-panel").addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", (e) => { if (!e.target.closest("#notif-panel") && !e.target.closest("#notif-bell-btn")) closeNotifPanel(); });
  document.getElementById("gsearch-close").addEventListener("click", closeGlobalSearch);
  document.getElementById("gsearch-overlay").addEventListener("click", (e) => { if (e.target.id === "gsearch-overlay") closeGlobalSearch(); });
  document.getElementById("gsearch-input").addEventListener("input", (e) => renderGlobalSearchResults(e.target.value));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openGlobalSearch(); }
    if (e.key === "Escape" && document.getElementById("gsearch-overlay").classList.contains("open")) closeGlobalSearch();
  });
  // Balayage tactile pour ouvrir/fermer le menu sur mobile
  let touchStartX = null, touchStartY = null;
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 60) {
      const isOpen = document.getElementById("sidebar").classList.contains("open");
      if (dx > 0 && !isOpen && touchStartX < 40) openMobileMenu();
      else if (dx < 0 && isOpen) closeMobileMenu();
    }
    touchStartX = null; touchStartY = null;
  }, { passive: true });
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
  document.getElementById("prospect-view-select").addEventListener("change", (e) => { prospectView = e.target.value; renderSuivi(); });
  document.getElementById("btn-new-devis").addEventListener("click", () => openDevisDialog(null));
  document.getElementById("btn-manage-cgv").addEventListener("click", openCgvManager);
  document.getElementById("btn-export-devis-csv").addEventListener("click", exportDevisCSV);
  document.getElementById("btn-new-facture").addEventListener("click", () => openFactureDialog(null));
  document.getElementById("btn-export-factures-csv").addEventListener("click", exportFacturesCSV);
  document.getElementById("btn-manage-types-facture").addEventListener("click", openTypesFactureManager);
  document.getElementById("btn-new-contact").addEventListener("click", () => openContactDialog(null));
  document.getElementById("contact-view-select").addEventListener("change", (e) => { contactView = e.target.value; renderContacts(); });
  document.getElementById("btn-new-evenement").addEventListener("click", () => openEvenementDialog(null));
  document.getElementById("btn-evenement-past-more").addEventListener("click", () => { evenementPastShowAll = true; renderEvenements(); });
  document.getElementById("btn-new-rdv").addEventListener("click", () => openRdvDialog(null));
  document.getElementById("btn-new-grille").addEventListener("click", () => openGrilleDialog(null));
  document.getElementById("btn-new-commande").addEventListener("click", () => openCommandeDialog(null));
  document.getElementById("commande-view-select").addEventListener("change", (e) => { commandeView = e.target.value; renderCommande(); });
  document.getElementById("btn-new-prestataire").addEventListener("click", () => openPrestataireDialog(null));
  document.getElementById("btn-new-note").addEventListener("click", () => openNoteEditor(null));
  document.getElementById("btn-note-categories").addEventListener("click", openNoteCategoriesModal);
  document.getElementById("note-close").addEventListener("click", closeNoteEditor);
  document.getElementById("note-save").addEventListener("click", saveNoteEditor);
  document.getElementById("note-liens-input").addEventListener("change", (e) => {
    noteState.newFiles.push(...Array.from(e.target.files));
    e.target.value = "";
    renderNoteLiensList();
  });

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
