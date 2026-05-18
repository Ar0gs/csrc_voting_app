(function () {
  const $ = (id) => document.getElementById(id);
  const store = CSRCStore.init();

  if (!store) {
    document.body.classList.add("config-error");
    const banner = $("configBanner");
    if (banner) banner.hidden = false;
    const app = $("app");
    if (app) app.hidden = true;
    return;
  }
  const views = {
    home: $("viewHome"),
    officer: $("viewOfficer"),
    member: $("viewMember"),
  };

  let officerUnsub = null;
  let memberUnsub = null;
  let currentSessionCode = null;
  let memberMatric = null;
  let memberName = null;

  function showView(name) {
    Object.entries(views).forEach(([k, el]) => {
      const active = k === name;
      el.hidden = !active;
      el.classList.toggle("active", active);
      if (active) {
        el.classList.remove("view-enter");
        void el.offsetWidth;
        el.classList.add("view-enter");
      }
    });
  }

  function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      t.hidden = true;
    }, 2800);
  }

  function setSyncBadge() {
    const badge = $("syncBadge");
    const label = $("syncLabel");
    badge.hidden = false;
    badge.classList.remove("demo");
    label.textContent = "Live sync";
  }

  function updateModeHint() {
    const text = $("modeHint").querySelector(".mode-hint-text");
    if (!text) return;
    text.textContent =
      "Live mode: parliamentarians on any device can join with the session code shared by the presiding officer.";
  }

  function statusLabel(status) {
    if (status === "open") return "Voting open";
    if (status === "closed") return "Voting closed";
    return "Awaiting division";
  }

  function renderOfficer(session) {
    if (!session) return;
    $("sessionCode").textContent = session.code;
    $("displayMotion").textContent = session.motion;
    const pill = $("sessionStatus");
    pill.textContent = statusLabel(session.status);
    pill.className = "status-pill " + session.status;

    const votes = session.votes || {};
    const total = Object.keys(votes).length;
    $("voteCount").textContent = total + (total === 1 ? " vote cast" : " votes cast");

    const counts = CSRCStore.tally(votes);
    const max = Math.max(counts.yes, counts.no, counts.abstain, 1);
    $("barYes").style.width = (counts.yes / max) * 100 + "%";
    $("barNo").style.width = (counts.no / max) * 100 + "%";
    $("barAbstain").style.width = (counts.abstain / max) * 100 + "%";
    $("countYes").textContent = counts.yes;
    $("countNo").textContent = counts.no;
    $("countAbstain").textContent = counts.abstain;

    $("btnOpenVoting").disabled = session.status !== "pending";
    $("btnCloseVoting").disabled = session.status !== "open";

    const verdict = $("verdict");
    if (session.status === "closed") {
      verdict.hidden = false;
      if (counts.yes > counts.no) {
        verdict.textContent = "Motion CARRIED";
        verdict.className = "verdict carried";
      } else if (counts.no > counts.yes) {
        verdict.textContent = "Motion LOST";
        verdict.className = "verdict lost";
      } else {
        verdict.textContent = "TIE — Chair may cast deciding vote";
        verdict.className = "verdict tied";
      }
    } else {
      verdict.hidden = true;
    }

    const list = $("votesList");
    list.innerHTML = "";
    Object.values(votes)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((v) => {
        const li = document.createElement("li");
        li.textContent = `${v.name} (${v.matric}) — ${v.vote}`;
        list.appendChild(li);
      });
  }

  function renderMember(session) {
    if (!session) return;
    $("memberCodeChip").textContent = session.code;
    const pill = $("memberStatus");
    pill.textContent = statusLabel(session.status);
    pill.className = "status-pill " + session.status;
    $("memberMotion").textContent = session.motion;
    $("memberGreeting").innerHTML =
      `<span class="member-avatar" aria-hidden="true">${memberName.charAt(0).toUpperCase()}</span>` +
      `<span class="member-details"><strong>Hon. ${memberName}</strong><span>${memberMatric}</span></span>`;

    const myVote = session.votes && session.votes[memberMatric];
    const open = session.status === "open";
    const panel = $("votePanel");
    const confirmed = $("voteConfirmed");

    if (open) {
      panel.hidden = false;
      if (myVote) {
        confirmed.hidden = false;
        $("confirmedChoice").textContent = "You voted: " + myVote.vote;
      } else {
        confirmed.hidden = true;
      }
    } else if (session.status === "pending") {
      panel.hidden = true;
      confirmed.hidden = false;
      $("confirmedChoice").textContent = "Please wait for the presiding officer to open voting.";
    } else {
      panel.hidden = true;
      confirmed.hidden = false;
      if (myVote) {
        $("confirmedChoice").textContent = "Final vote: " + myVote.vote;
      } else {
        $("confirmedChoice").textContent = "You did not vote on this motion.";
      }
    }
  }

  function stopOfficerWatch() {
    if (officerUnsub) {
      officerUnsub();
      officerUnsub = null;
    }
  }

  function stopMemberWatch() {
    if (memberUnsub) {
      memberUnsub();
      memberUnsub = null;
    }
  }

  document.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.getAttribute("data-role");
      showView(role === "officer" ? "officer" : "member");
    });
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      stopOfficerWatch();
      stopMemberWatch();
      currentSessionCode = null;
      showView("home");
    });
  });

  $("btnCreateSession").addEventListener("click", async () => {
    const motion = $("motionInput").value.trim();
    if (!motion) {
      showToast("Enter the motion before the house.");
      return;
    }
    const title = $("sessionTitle").value.trim();
    try {
      const session = await store.createSession({ motion, title });
      currentSessionCode = session.code;
      $("officerSetup").hidden = true;
      $("officerActive").hidden = false;
      stopOfficerWatch();
      officerUnsub = store.subscribe(session.code, renderOfficer);
      renderOfficer(session);
      showToast("Session created. Share the code with members.");
    } catch (e) {
      showToast(e.message || "Could not create session.");
    }
  });

  $("btnCopyCode").addEventListener("click", async () => {
    const code = $("sessionCode").textContent;
    try {
      await navigator.clipboard.writeText(code);
      showToast("Code copied to clipboard.");
    } catch {
      showToast("Code: " + code);
    }
  });

  $("btnOpenVoting").addEventListener("click", async () => {
    if (!currentSessionCode) return;
    try {
      await store.updateSession(currentSessionCode, { status: "open" });
      showToast("Voting is now open.");
    } catch (e) {
      showToast(e.message);
    }
  });

  $("btnCloseVoting").addEventListener("click", async () => {
    if (!currentSessionCode) return;
    if (!confirm("Close voting on this motion? Members will no longer be able to vote.")) return;
    try {
      await store.updateSession(currentSessionCode, { status: "closed" });
      showToast("Voting closed.");
    } catch (e) {
      showToast(e.message);
    }
  });

  $("btnNewSession").addEventListener("click", () => {
    if (!confirm("Start a new motion? This will end the current dashboard view.")) return;
    stopOfficerWatch();
    currentSessionCode = null;
    $("motionInput").value = "";
    $("sessionTitle").value = "";
    $("officerSetup").hidden = false;
    $("officerActive").hidden = true;
  });

  $("codeInput").addEventListener("input", (e) => {
    e.target.value = CSRCStore.normalizeCode(e.target.value).slice(0, 6);
  });

  $("btnJoinSession").addEventListener("click", async () => {
    const code = CSRCStore.normalizeCode($("codeInput").value);
    memberMatric = CSRCStore.normalizeMatric($("matricInput").value);
    memberName = $("nameInput").value.trim();
    const err = $("joinError");
    err.hidden = true;

    if (code.length !== 6) {
      err.textContent = "Enter the 6-character session code from the presiding officer.";
      err.hidden = false;
      return;
    }
    if (!memberMatric || !memberName) {
      err.textContent = "Matric number and full name are required.";
      err.hidden = false;
      return;
    }

    const session = await store.getSession(code);
    if (!session) {
      err.textContent = "Invalid or expired session code.";
      err.hidden = false;
      return;
    }

    currentSessionCode = code;
    localStorage.setItem("csrc_member_matric", memberMatric);
    localStorage.setItem("csrc_member_name", memberName);

    $("memberJoin").hidden = true;
    $("memberVote").hidden = false;
    stopMemberWatch();
    memberUnsub = store.subscribe(code, renderMember);
    renderMember(session);
  });

  document.querySelectorAll("[data-vote]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const vote = btn.getAttribute("data-vote");
      const err = $("voteError");
      err.hidden = true;
      if (!currentSessionCode || !memberMatric) return;
      try {
        await store.castVote(currentSessionCode, memberMatric, memberName, vote);
        showToast("Vote recorded.");
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      }
    });
  });

  const savedMatric = localStorage.getItem("csrc_member_matric");
  const savedName = localStorage.getItem("csrc_member_name");
  if (savedMatric) $("matricInput").value = savedMatric;
  if (savedName) $("nameInput").value = savedName;

  setSyncBadge();
  updateModeHint();
})();
