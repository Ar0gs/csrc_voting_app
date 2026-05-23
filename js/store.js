/**
 * Live session storage via Firebase Realtime Database.
 */
(function (global) {
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function generateCode(length = 6) {
    let code = "";
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    for (let i = 0; i < length; i++) {
      code += CHARSET[arr[i] % CHARSET.length];
    }
    return code;
  }

  function normalizeCode(code) {
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function normalizeMatric(matric) {
    return String(matric || "")
      .trim()
      .toUpperCase()
      // FIX: remove ALL characters that are illegal as Firebase path segments.
      // Forward slashes are path separators in RTDB — keeping them turns
      // "CSC/2021/056" into three nested nodes instead of one key, which
      // breaks the security rules and causes permission_denied.
      .replace(/[\/\\.#$\[\]\s]/g, "");
  }

  function emptySession(overrides) {
    return {
      code: "",
      title: "",
      motion: "",
      status: "pending",
      createdAt: Date.now(),
      votes: {},
      ...overrides,
    };
  }

  function tally(votes) {
    const counts = { yes: 0, no: 0, abstain: 0 };
    Object.values(votes || {}).forEach((v) => {
      if (counts[v.vote] !== undefined) counts[v.vote]++;
    });
    return counts;
  }

  function isConfigValid(cfg) {
    return (
      cfg &&
      cfg.enabled === true &&
      cfg.apiKey &&
      cfg.databaseURL &&
      cfg.projectId &&
      !String(cfg.apiKey).includes("YOUR_")
    );
  }

  const FirebaseStore = {
    mode: "live",
    _ref(code) {
      return global.firebase.database().ref("sessions/" + code);
    },
    subscribe(code, cb) {
      const ref = this._ref(code);
      const handler = (snap) => cb(snap.exists() ? snap.val() : null);
      ref.on("value", handler);
      return () => ref.off("value", handler);
    },
    async createSession({ motion, title }) {
      let code;
      let attempts = 0;
      do {
        code = generateCode();
        const snap = await this._ref(code).once("value");
        if (!snap.exists()) break;
        attempts++;
      } while (attempts < 20);
      const session = emptySession({ code, motion, title });
      await this._ref(code).set(session);
      return session;
    },
    async updateSession(code, patch) {
      await this._ref(code).update(patch);
      const snap = await this._ref(code).once("value");
      return snap.val();
    },
    async getSession(code) {
      const snap = await this._ref(code).once("value");
      return snap.exists() ? snap.val() : null;
    },
    async castVote(code, matric, name, vote) {
      const session = await this.getSession(code);
      if (!session) throw new Error("Invalid session code.");
      if (session.status !== "open") throw new Error("Voting is not open.");
      // normalizeMatric strips slashes — safe to use directly as a RTDB key
      const id = normalizeMatric(matric);
      if (!id) throw new Error("Matric number is required.");
      const entry = {
        vote,
        name: String(name || "").trim(),
        matric: id,          // stored as clean key e.g. "CSC2021056"
        matricRaw: String(matric || "").trim().toUpperCase(), // human-readable original
        at: Date.now(),
      };
      await this._ref(code).child("votes").child(id).set(entry);
      return entry;
    },
  };

  function initStore() {
    const cfg = global.FIREBASE_CONFIG;

    if (!isConfigValid(cfg)) {
      return null;
    }

    if (!global.firebase) {
      console.error("Firebase SDK not loaded.");
      return null;
    }

    try {
      if (!global.firebase.apps.length) {
        global.firebase.initializeApp({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain,
          databaseURL: cfg.databaseURL,
          projectId: cfg.projectId,
          storageBucket: cfg.storageBucket,
          messagingSenderId: cfg.messagingSenderId,
          appId: cfg.appId,
        });
      }
    } catch (err) {
      console.error("Firebase initialization failed:", err);
      return null;
    }

    return FirebaseStore;
  }

  global.CSRCStore = {
    init: initStore,
    isConfigValid,
    generateCode,
    normalizeCode,
    normalizeMatric,
    tally,
    emptySession,
  };
})(window);
