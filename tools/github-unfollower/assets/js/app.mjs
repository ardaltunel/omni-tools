import { GitHubApiError, GitHubClient } from "./github-api.mjs";

const SESSION_TOKEN_KEY = "github-unfollower-token";
const PAGE_SIZE = 50;
const root = document.querySelector("#github-unfollower");
const byId = (suffix) => root?.querySelector("#github-unfollower-" + suffix);

const elements = {
  tokenForm: byId("token-form"),
  token: byId("token"),
  tokenError: byId("token-error"),
  rememberToken: byId("remember-token"),
  toggleToken: byId("toggle-token"),
  clearToken: byId("clear-token"),
  analyzeButton: byId("analyze-button"),
  cancelButton: byId("cancel-button"),
  activityPanel: byId("activity-panel"),
  activityTitle: byId("activity-title"),
  activityDetail: byId("activity-detail"),
  activityPercent: byId("activity-percent"),
  progressTrack: byId("progress-track"),
  results: byId("results"),
  accountAvatar: byId("account-avatar"),
  accountLogin: byId("account-login"),
  rateLimit: byId("rate-limit"),
  disconnectButton: byId("disconnect-button"),
  followersCount: byId("followers-count"),
  followingCount: byId("following-count"),
  nonFollowersCount: byId("non-followers-count"),
  resultsDescription: byId("results-description"),
  selectedBadge: byId("selected-badge"),
  userSearch: byId("user-search"),
  selectAll: byId("select-all"),
  clearSelection: byId("clear-selection"),
  userList: byId("user-list"),
  emptyResults: byId("empty-results"),
  emptyResultsTitle: byId("empty-results-title"),
  emptyResultsCopy: byId("empty-results-copy"),
  pagination: byId("pagination"),
  previousPage: byId("previous-page"),
  nextPage: byId("next-page"),
  pageLabel: byId("page-label"),
  dangerZone: byId("danger-zone"),
  unfollowButton: byId("unfollow-button"),
  confirmDialog: byId("confirm-dialog"),
  confirmCount: byId("confirm-count"),
  confirmInput: byId("confirm-input"),
  confirmUnfollow: byId("confirm-unfollow"),
  toast: byId("toast"),
  toastIcon: byId("toast-icon"),
  toastMessage: byId("toast-message"),
};

const state = {
  account: null,
  followers: [],
  following: [],
  nonFollowers: [],
  selected: new Set(),
  search: "",
  page: 1,
  running: false,
  controller: null,
  activeOperation: "",
  toastTimer: null,
};

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(value || 0);
}

function safeSessionGet() {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function safeSessionSet(value) {
  try {
    if (value) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, value);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    showToast("Tarayıcınız sekme depolamasını engelledi. Token yalnızca bellekte tutulacak.", "error");
  }
}

function currentToken() {
  return elements.token.value.trim();
}

function showTokenError(message = "") {
  elements.tokenError.textContent = message;
  elements.tokenError.hidden = !message;
  elements.token.setAttribute("aria-invalid", message ? "true" : "false");
}

function showToast(message, tone = "success") {
  globalThis.clearTimeout(state.toastTimer);
  elements.toastMessage.textContent = message;
  elements.toastIcon.textContent = tone === "error" ? "!" : "✓";
  elements.toast.classList.toggle("is-error", tone === "error");
  elements.toast.hidden = false;
  state.toastTimer = globalThis.setTimeout(() => {
    elements.toast.hidden = true;
  }, 5_500);
}

function setActivity({
  title,
  detail,
  percent,
  tone = "running",
}) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  elements.activityPanel.hidden = false;
  elements.activityPanel.classList.toggle("is-complete", tone === "complete");
  elements.activityPanel.classList.toggle("is-error", tone === "error");
  elements.activityTitle.textContent = title;
  elements.activityDetail.textContent = detail;
  elements.activityPercent.textContent = safePercent + "%";
  elements.progressTrack.value = safePercent;
  elements.progressTrack.textContent = safePercent + "%";
}

function setRunning(running, operation = "") {
  state.running = running;
  state.activeOperation = operation;
  elements.token.disabled = running;
  elements.rememberToken.disabled = running;
  elements.toggleToken.disabled = running;
  elements.clearToken.disabled = running;
  elements.analyzeButton.disabled = running;
  elements.cancelButton.hidden = !running;
  elements.disconnectButton.disabled = running;
  elements.userSearch.disabled = running;
  elements.selectAll.disabled = running;
  elements.clearSelection.disabled = running;
  updateSelectionSummary();
  renderVisibleCheckboxState();
}

function renderVisibleCheckboxState() {
  for (const checkbox of elements.userList.querySelectorAll(".ghu-user-checkbox")) {
    checkbox.disabled = state.running;
  }
}

function updateRateDisplay(rate) {
  const hasRemaining = Number.isFinite(rate.remaining);
  const hasLimit = Number.isFinite(rate.limit);
  if (hasRemaining && hasLimit) {
    elements.rateLimit.textContent = formatNumber(rate.remaining) + " / " + formatNumber(rate.limit) + " kaldı";
  } else if (hasRemaining) {
    elements.rateLimit.textContent = formatNumber(rate.remaining) + " istek kaldı";
  }
}

function formatWait(seconds) {
  if (seconds < 60) {
    return seconds + " saniye";
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes + " dakika";
}

function handleClientWait(wait) {
  const reason = wait.type === "rate-limit"
    ? "GitHub hız limitine ulaşıldı"
    : wait.type === "server"
      ? "GitHub geçici olarak kullanılamıyor"
      : "Bağlantı kesildi";
  setActivity({
    title: reason,
    detail: formatWait(wait.seconds) + " beklenecek, ardından " + wait.attempt + ". kez yeniden denenecek…",
    percent: Number(elements.progressTrack.value || 0),
  });
}

function createClient() {
  return new GitHubClient({
    getToken: currentToken,
    onRateUpdate: updateRateDisplay,
    onWait: handleClientWait,
  });
}

function normalizeUser(user) {
  return {
    login: String(user.login || ""),
    avatarUrl: String(user.avatar_url || ""),
    profileUrl: String(user.html_url || ("https://github.com/" + user.login)),
  };
}

async function fetchAllUsers(client, path, total, stage, signal) {
  if (total === 0) {
    setActivity({
      title: stage.title,
      detail: "İndirilecek kullanıcı bulunmuyor.",
      percent: stage.end,
    });
    return [];
  }

  const users = [];
  let page = 1;

  while (true) {
    setActivity({
      title: stage.title,
      detail: page + ". sayfa indiriliyor · Yaklaşık " + formatNumber(total) + " kullanıcının " + formatNumber(users.length) + " kadarı tamamlandı",
      percent: stage.start + ((Math.min(users.length, total) / total) * (stage.end - stage.start)),
    });

    const separator = path.includes("?") ? "&" : "?";
    const result = await client.request(
      path + separator + "per_page=100&page=" + page,
      { signal },
    );

    if (!Array.isArray(result.data)) {
      throw new GitHubApiError("GitHub beklenmeyen bir kullanıcı listesi yanıtı döndürdü.");
    }

    const pageUsers = result.data.map(normalizeUser).filter((user) => user.login);
    users.push(...pageUsers);

    setActivity({
      title: stage.title,
      detail: formatNumber(users.length) + " kullanıcı indirildi.",
      percent: stage.start + ((Math.min(users.length, total) / total) * (stage.end - stage.start)),
    });

    if (pageUsers.length < 100) {
      break;
    }
    page += 1;
  }

  return users;
}

function findNonFollowers(followers, following) {
  const followerLogins = new Set(followers.map((user) => user.login.toLowerCase()));
  return following.filter((user) => !followerLogins.has(user.login.toLowerCase()));
}

function renderAccount() {
  if (!state.account) {
    return;
  }

  elements.accountAvatar.src = state.account.avatar_url;
  elements.accountAvatar.alt = state.account.login + " profil fotoğrafı";
  elements.accountLogin.textContent = "@" + state.account.login;
  elements.accountLogin.href = state.account.html_url;
  renderStats();
}

function renderStats() {
  elements.followersCount.textContent = formatNumber(state.followers.length);
  elements.followingCount.textContent = formatNumber(state.following.length);
  elements.nonFollowersCount.textContent = formatNumber(state.nonFollowers.length);
}

function filteredUsers() {
  const query = state.search.trim().toLowerCase();
  if (!query) {
    return state.nonFollowers;
  }
  return state.nonFollowers.filter((user) => user.login.toLowerCase().includes(query));
}

function createUserRow(user) {
  const row = document.createElement("li");
  row.className = "ghu-user-row";

  const checkbox = document.createElement("input");
  checkbox.className = "ghu-user-checkbox";
  checkbox.type = "checkbox";
  checkbox.checked = state.selected.has(user.login);
  checkbox.disabled = state.running;
  checkbox.dataset.login = user.login;
  checkbox.setAttribute("aria-label", "@" + user.login + " hesabını seç");

  const identity = document.createElement("div");
  identity.className = "ghu-user-identity";

  const avatar = document.createElement("img");
  avatar.src = user.avatarUrl;
  avatar.alt = "";
  avatar.width = 39;
  avatar.height = 39;
  avatar.loading = "lazy";
  avatar.referrerPolicy = "no-referrer";

  const names = document.createElement("div");
  const username = document.createElement("strong");
  username.textContent = "@" + user.login;
  const note = document.createElement("span");
  note.textContent = "Sizi geri takip etmiyor";
  names.append(username, note);
  identity.append(avatar, names);

  const profile = document.createElement("a");
  profile.className = "ghu-profile-link";
  profile.href = user.profileUrl;
  profile.target = "_blank";
  profile.rel = "noreferrer";
  profile.textContent = "Profili görüntüle ↗";
  profile.setAttribute("aria-label", "@" + user.login + " GitHub profilini aç");

  row.append(checkbox, identity, profile);
  return row;
}

function updateSelectionSummary() {
  const count = state.selected.size;
  elements.selectedBadge.textContent = formatNumber(count) + " seçildi";
  elements.unfollowButton.textContent = count
    ? "Seçilen " + formatNumber(count) + " hesabı takipten çıkar"
    : "Seçilenleri takipten çıkar";
  elements.unfollowButton.disabled = state.running || count === 0;
}

function renderResults() {
  const users = filteredUsers();
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const start = (state.page - 1) * PAGE_SIZE;
  const pageUsers = users.slice(start, start + PAGE_SIZE);

  elements.userList.replaceChildren(...pageUsers.map(createUserRow));
  const hasAny = state.nonFollowers.length > 0;
  const hasFiltered = users.length > 0;

  elements.userList.hidden = !hasFiltered;
  elements.emptyResults.hidden = hasFiltered;
  elements.dangerZone.hidden = !hasAny;

  if (!hasAny) {
    elements.emptyResultsTitle.textContent = "Herkes sizi geri takip ediyor";
    elements.emptyResultsCopy.textContent = "İncelenecek hesap bulunmuyor.";
    elements.resultsDescription.textContent = "Herhangi bir işlem yapmanız gerekmiyor.";
  } else if (!hasFiltered) {
    elements.emptyResultsTitle.textContent = "Eşleşen kullanıcı bulunamadı";
    elements.emptyResultsCopy.textContent = "Farklı bir kullanıcı adı deneyin.";
  } else {
    elements.resultsDescription.textContent = "Tespit edilen tüm hesaplar varsayılan olarak seçilidir. Devam etmeden önce inceleyin.";
  }

  elements.pagination.hidden = users.length <= PAGE_SIZE;
  elements.pageLabel.textContent = "Sayfa " + state.page + " / " + totalPages;
  elements.previousPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= totalPages;
  updateSelectionSummary();
}

function clearAnalysis() {
  state.account = null;
  state.followers = [];
  state.following = [];
  state.nonFollowers = [];
  state.selected = new Set();
  state.search = "";
  state.page = 1;
  elements.userSearch.value = "";
  elements.results.hidden = true;
  elements.activityPanel.hidden = true;
  elements.rateLimit.textContent = "—";
  elements.userList.replaceChildren();
  updateSelectionSummary();
}

function saveTokenPreference() {
  if (elements.rememberToken.checked) {
    safeSessionSet(currentToken());
  } else {
    safeSessionSet("");
  }
}

function formatError(error) {
  if (error instanceof GitHubApiError) {
    return error.message;
  }
  if (error?.name === "TimeoutError") {
    return "GitHub zamanında yanıt vermedi. Daha sonra yeniden deneyin.";
  }
  if (error instanceof TypeError) {
    return "Tarayıcı GitHub'a ulaşamadı. Bağlantınızı kontrol edip yeniden deneyin.";
  }
  return "Beklenmeyen bir hata oluştu.";
}

async function analyzeAccount(event) {
  event.preventDefault();
  showTokenError();

  if (!currentToken()) {
    showTokenError("GitHub kişisel erişim tokeninizi girin.");
    elements.token.focus();
    return;
  }

  saveTokenPreference();
  clearAnalysis();
  state.controller = new AbortController();
  setRunning(true, "analysis");
  setActivity({
    title: "GitHub'a bağlanılıyor",
    detail: "Tokeniniz ve hesabınız kontrol ediliyor…",
    percent: 2,
  });

  const client = createClient();

  try {
    const accountResult = await client.request("/user", {
      signal: state.controller.signal,
    });
    state.account = accountResult.data;
    renderAccount();

    state.followers = await fetchAllUsers(
      client,
      "/user/followers",
      Number(state.account.followers || 0),
      { title: "Takipçiler indiriliyor", start: 5, end: 45 },
      state.controller.signal,
    );

    state.following = await fetchAllUsers(
      client,
      "/user/following",
      Number(state.account.following || 0),
      { title: "Takip edilenler indiriliyor", start: 45, end: 88 },
      state.controller.signal,
    );

    setActivity({
      title: "Bağlantılar karşılaştırılıyor",
      detail: "Sizi geri takip etmeyen hesaplar bulunuyor…",
      percent: 94,
    });

    state.nonFollowers = findNonFollowers(state.followers, state.following);
    state.selected = new Set(state.nonFollowers.map((user) => user.login));
    renderAccount();
    renderResults();
    elements.results.hidden = false;

    setActivity({
      title: "Analiz tamamlandı",
      detail: formatNumber(state.nonFollowers.length) + " hesap incelemenizi bekliyor.",
      percent: 100,
      tone: "complete",
    });
    showToast("Analiz tamamlandı. Devam etmeden önce seçilen hesapları inceleyin.");
    elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (error?.name === "AbortError") {
      setActivity({
        title: "Analiz iptal edildi",
        detail: "GitHub hesabınızda herhangi bir değişiklik yapılmadı.",
        percent: 0,
        tone: "error",
      });
      showToast("Analiz iptal edildi.", "error");
    } else {
      const message = formatError(error);
      setActivity({
        title: "Analiz başarısız oldu",
        detail: message,
        percent: 0,
        tone: "error",
      });
      showToast(message, "error");
    }
  } finally {
    state.controller = null;
    setRunning(false);
  }
}

function applyRemovedUsers(removedLogins) {
  if (!removedLogins.size) {
    return;
  }

  state.nonFollowers = state.nonFollowers.filter((user) => !removedLogins.has(user.login));
  state.following = state.following.filter((user) => !removedLogins.has(user.login));
  state.selected = new Set(
    Array.from(state.selected).filter((login) => !removedLogins.has(login)),
  );
  renderStats();
  renderResults();
}

async function unfollowSelected() {
  const targets = state.nonFollowers.filter((user) => state.selected.has(user.login));
  if (!targets.length || state.running) {
    return;
  }

  state.controller = new AbortController();
  setRunning(true, "unfollow");
  const client = createClient();
  const removed = new Set();
  const skipped = [];
  let processed = 0;

  setActivity({
    title: "Seçilen hesaplar takipten çıkarılıyor",
    detail: formatNumber(targets.length) + " istek hazırlanıyor…",
    percent: 0,
  });

  try {
    for (const user of targets) {
      setActivity({
        title: "Seçilen hesaplar takipten çıkarılıyor",
        detail: "@" + user.login + " işleniyor · " + formatNumber(processed) + " / " + formatNumber(targets.length),
        percent: (processed / targets.length) * 100,
      });

      const result = await client.request(
        "/user/following/" + encodeURIComponent(user.login),
        {
          method: "DELETE",
          mutation: true,
          signal: state.controller.signal,
          allowStatuses: [404, 422],
        },
      );

      if (result.response.status === 204) {
        removed.add(user.login);
      } else {
        skipped.push({ login: user.login, status: result.response.status });
      }
      processed += 1;
    }

    applyRemovedUsers(removed);
    const skippedText = skipped.length
      ? " Erişilemeyen " + formatNumber(skipped.length) + " hesap atlandı."
      : "";
    setActivity({
      title: "Temizleme tamamlandı",
      detail: formatNumber(removed.size) + " hesap takipten çıkarıldı." + skippedText,
      percent: 100,
      tone: "complete",
    });
    showToast(formatNumber(removed.size) + " hesap başarıyla takipten çıkarıldı.");
  } catch (error) {
    applyRemovedUsers(removed);
    if (error?.name === "AbortError") {
      setActivity({
        title: "Temizleme iptal edildi",
        detail: formatNumber(removed.size) + " tamamlandı · " + formatNumber(targets.length - processed) + " işlenmedi.",
        percent: (processed / targets.length) * 100,
        tone: "error",
      });
      showToast("Temizleme iptal edildi. Tamamlanan işlemler korundu.", "error");
    } else {
      const message = formatError(error);
      setActivity({
        title: "Temizleme durduruldu",
        detail: "Hatadan önce " + formatNumber(removed.size) + " işlem tamamlandı. " + message,
        percent: (processed / targets.length) * 100,
        tone: "error",
      });
      showToast(message, "error");
    }
  } finally {
    state.controller = null;
    setRunning(false);
  }
}

function openConfirmation() {
  const count = state.selected.size;
  if (!count || state.running) {
    return;
  }

  elements.confirmCount.textContent = formatNumber(count) + " hesabı";
  elements.confirmInput.value = "";
  elements.confirmUnfollow.disabled = true;
  elements.confirmDialog.returnValue = "";
  elements.confirmDialog.showModal();
  elements.confirmInput.focus();
}

function disconnect() {
  state.controller?.abort();
  safeSessionSet("");
  elements.rememberToken.checked = false;
  elements.token.value = "";
  elements.token.type = "password";
  elements.toggleToken.textContent = "Göster";
  elements.toggleToken.setAttribute("aria-label", "Tokeni göster");
  showTokenError();
  clearAnalysis();
  setRunning(false);
  elements.token.focus();
  showToast("Token ve hesap verileri bu sekmeden temizlendi.");
}

function initialize() {
  const savedToken = safeSessionGet();
  if (savedToken) {
    elements.token.value = savedToken;
    elements.rememberToken.checked = true;
  }

  elements.tokenForm.addEventListener("submit", analyzeAccount);
  elements.cancelButton.addEventListener("click", () => state.controller?.abort());
  elements.disconnectButton.addEventListener("click", disconnect);
  elements.clearToken.addEventListener("click", disconnect);

  elements.toggleToken.addEventListener("click", () => {
    const show = elements.token.type === "password";
    elements.token.type = show ? "text" : "password";
    elements.toggleToken.textContent = show ? "Gizle" : "Göster";
    elements.toggleToken.setAttribute("aria-label", show ? "Tokeni gizle" : "Tokeni göster");
  });

  elements.token.addEventListener("input", () => {
    if (currentToken()) {
      showTokenError();
    }
  });

  elements.userSearch.addEventListener("input", () => {
    state.search = elements.userSearch.value;
    state.page = 1;
    renderResults();
  });

  elements.userList.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".ghu-user-checkbox");
    if (!checkbox || state.running) {
      return;
    }
    if (checkbox.checked) {
      state.selected.add(checkbox.dataset.login);
    } else {
      state.selected.delete(checkbox.dataset.login);
    }
    updateSelectionSummary();
  });

  elements.selectAll.addEventListener("click", () => {
    state.selected = new Set(state.nonFollowers.map((user) => user.login));
    renderResults();
  });

  elements.clearSelection.addEventListener("click", () => {
    state.selected.clear();
    renderResults();
  });

  elements.previousPage.addEventListener("click", () => {
    state.page -= 1;
    renderResults();
  });

  elements.nextPage.addEventListener("click", () => {
    state.page += 1;
    renderResults();
  });

  elements.unfollowButton.addEventListener("click", openConfirmation);
  elements.confirmInput.addEventListener("input", () => {
    elements.confirmUnfollow.disabled = elements.confirmInput.value !== "TAKİPTEN ÇIKAR";
  });

  elements.confirmDialog.addEventListener("close", () => {
    if (elements.confirmDialog.returnValue === "confirm") {
      void unfollowSelected();
    }
  });
}

if (root) {
  initialize();
}
