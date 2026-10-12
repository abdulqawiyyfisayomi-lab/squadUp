(() => {
  const accountsKey = "sq2_local_accounts";
  const sessionKey = "sq2_local_session";
  const ranks = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Elite"];
  const passwordIterations = 310000;

  function readAccounts() {
    const raw = localStorage.getItem(accountsKey);
    if (!raw) return {};
    const accounts = JSON.parse(raw);
    if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) {
      throw new Error("Local account data is invalid. Clear this site's saved data and sign up again.");
    }
    return accounts;
  }

  function normalizeEmail(email) {
    return email.trim().toLowerCase();
  }

  function makeSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function randomRank() {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return ranks[value[0] % ranks.length];
  }

  async function hashPassword(password, salt) {
    if (!crypto.subtle) {
      throw new Error("Password protection is unavailable in this browser context. Open the site on localhost or HTTPS.");
    }
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const digest = await crypto.subtle.deriveBits({
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: passwordIterations
    }, key, 256);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function hashLegacyPassword(password, salt) {
    if (!crypto.subtle) {
      throw new Error("Password protection is unavailable in this browser context. Open the site on localhost or HTTPS.");
    }
    const bytes = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function publicAccount(account) {
    return { id: account.id, email: account.email, gamerTag: account.gamerTag };
  }

  function setSession(account) {
    localStorage.setItem(sessionKey, account.email);
    localStorage.setItem("sq2_name", account.gamerTag);
    const profile = { ...(account.profile || {}), tag: account.gamerTag };
    localStorage.setItem("sq2_profile", JSON.stringify(profile));
    return publicAccount(account);
  }

  async function signUp({ email, gamerTag, password }) {
    const normalizedEmail = normalizeEmail(email);
    const cleanTag = gamerTag.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !cleanTag || cleanTag.length > 20 || password.length < 8 || password.length > 128) {
      throw new Error("Enter a valid email, a gamer tag with 1–20 characters, and a password with 8–128 characters.");
    }
    const accounts = readAccounts();
    if (accounts[normalizedEmail]) throw new Error("An account with this email already exists in this browser.");
    if (Object.values(accounts).some(account => account.gamerTag.toLowerCase() === cleanTag.toLowerCase())) {
      throw new Error("That gamer tag is already in use in this browser.");
    }
    const salt = makeSalt();
    const account = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      gamerTag: cleanTag,
      profile: { tag: cleanTag, rank: randomRank() },
      salt,
      passwordAlgorithm: "PBKDF2-SHA256",
      passwordHash: await hashPassword(password, salt)
    };
    accounts[normalizedEmail] = account;
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
    return setSession(account);
  }

  async function signIn({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const account = readAccounts()[normalizedEmail];
    if (!account) {
      throw new Error("Email or password is incorrect, or this browser has no account for that email.");
    }
    const isLegacy = !account.passwordAlgorithm;
    const passwordHash = isLegacy
      ? await hashLegacyPassword(password, account.salt)
      : account.passwordAlgorithm === "PBKDF2-SHA256"
        ? await hashPassword(password, account.salt)
        : "";
    if (!passwordHash || passwordHash !== account.passwordHash) {
      throw new Error("Email or password is incorrect, or this browser has no account for that email.");
    }
    if (isLegacy) {
      account.salt = makeSalt();
      account.passwordAlgorithm = "PBKDF2-SHA256";
      account.passwordHash = await hashPassword(password, account.salt);
      const accounts = readAccounts();
      accounts[normalizedEmail] = account;
      localStorage.setItem(accountsKey, JSON.stringify(accounts));
    }
    return setSession(account);
  }

  async function resetPassword({ email, gamerTag, password }) {
    const normalizedEmail = normalizeEmail(email);
    const accounts = readAccounts();
    const account = accounts[normalizedEmail];
    if (!account || account.gamerTag.toLowerCase() !== gamerTag.trim().toLowerCase()) {
      throw new Error("Email and gamer tag do not match a local account in this browser.");
    }
    if (password.length < 8 || password.length > 128) throw new Error("Use a password between 8 and 128 characters.");
    const salt = makeSalt();
    account.salt = salt;
    account.passwordAlgorithm = "PBKDF2-SHA256";
    account.passwordHash = await hashPassword(password, salt);
    accounts[normalizedEmail] = account;
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
    localStorage.removeItem(sessionKey);
  }

  function getSession() {
    const email = localStorage.getItem(sessionKey);
    if (!email) return null;
    const account = readAccounts()[email];
    if (!account) {
      localStorage.removeItem(sessionKey);
      return null;
    }
    return publicAccount(account);
  }

  function getProfile() {
    const session = getSession();
    if (!session) return null;
    const accounts = readAccounts();
    const account = accounts[session.email];
    if (!ranks.includes(account.profile?.rank)) {
      account.profile = { ...(account.profile || {}), rank: randomRank() };
      accounts[session.email] = account;
      localStorage.setItem(accountsKey, JSON.stringify(accounts));
    }
    return { ...(account.profile || {}), tag: account.gamerTag };
  }

  function saveProfile(profile) {
    const email = localStorage.getItem(sessionKey);
    const accounts = readAccounts();
    const account = email && accounts[email];
    if (!account) throw new Error("Your local session has expired. Log in again to save your profile.");
    const gamerTag = String(profile.tag || "").trim();
    if (!gamerTag || gamerTag.length > 20) throw new Error("Enter a gamer tag between 1 and 20 characters.");
    if (Object.values(accounts).some(other => other.email !== email && other.gamerTag.toLowerCase() === gamerTag.toLowerCase())) {
      throw new Error("That gamer tag is already in use in this browser.");
    }
    account.gamerTag = gamerTag;
    account.profile = { ...profile, tag: gamerTag, rank: account.profile?.rank || randomRank() };
    accounts[email] = account;
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
    localStorage.setItem("sq2_name", gamerTag);
    localStorage.setItem("sq2_profile", JSON.stringify(account.profile));
    return publicAccount(account);
  }

  function getPlayers(query = "") {
    const current = getSession();
    if (!current) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return Object.values(readAccounts())
      .filter(account => account.id !== current.id && account.gamerTag.toLowerCase().includes(normalizedQuery))
      .map(account => ({
        id: account.id,
        gamer_tag: account.gamerTag,
        game: account.profile?.favoriteGame || "",
        platform: account.profile?.platform || "",
        region: account.profile?.region || "",
        avatar: account.profile?.avatar || "",
        rank: account.profile?.rank || "",
        mic: account.profile?.mic || "",
        skill: account.profile?.skill || "",
        bio: account.profile?.bio || ""
      }))
      .sort((a, b) => a.gamer_tag.localeCompare(b.gamer_tag));
  }

  function getPlayersByGame(game) {
    const normalizedGame = String(game || "").trim().toLowerCase();
    if (!normalizedGame) return [];
    const current = getSession();
    return Object.values(readAccounts())
      .filter(account => account.id !== current?.id &&
        String(account.profile?.favoriteGame || "").trim().toLowerCase() === normalizedGame)
      .map(account => ({
        id: account.id,
        gamer_tag: account.gamerTag,
        game: account.profile.favoriteGame,
        platform: account.profile.platform || "",
        region: account.profile.region || "",
        avatar: account.profile.avatar || "",
        rank: account.profile.rank || "",
        mic: account.profile.mic || "",
        skill: account.profile.skill || "",
        bio: account.profile.bio || ""
      }))
      .sort((a, b) => a.gamer_tag.localeCompare(b.gamer_tag));
  }

  function getMessages() {
    const messages = JSON.parse(localStorage.getItem("sq2_local_direct_messages") || "[]");
    if (!Array.isArray(messages)) throw new Error("Local messages are invalid. Clear this site's saved data to continue.");
    const current = getSession();
    if (!current) return [];
    return messages
      .filter(message => message.sender_id === current.id || message.recipient_id === current.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  function getUnreadMessages() {
    const current = getSession();
    if (!current) return [];
    const accounts = readAccounts();
    return getMessages()
      .filter(message => message.recipient_id === current.id && !message.read_at)
      .map(message => ({
        ...message,
        sender_name: Object.values(accounts).find(account => account.id === message.sender_id)?.gamerTag || "A player"
      }));
  }

  function sendMessage(recipientId, body, attachment = null) {
    const current = getSession();
    if (!current) throw new Error("Log in to send messages.");
    const recipient = Object.values(readAccounts()).find(account => account.id === recipientId);
    const text = String(body || "").trim();
    if (!recipient || recipient.id === current.id) throw new Error("Choose another local player to message.");
    if (!text && !attachment) throw new Error("Write a message or attach a photo or voice note.");
    if (text.length > 300) throw new Error("Messages must be 300 characters or fewer.");
    if (attachment) {
      const imageData = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/i.test(attachment.dataUrl || "");
      const audioData = /^data:audio\/(?:webm|ogg|mp4|mpeg|wav)(?:;codecs=[a-z0-9._-]+)?;base64,[A-Za-z0-9+/]+=*$/i.test(attachment.dataUrl || "");
      if ((attachment.type !== "image" || !imageData) && (attachment.type !== "audio" || !audioData)) {
        throw new Error("This photo or voice note format is not supported.");
      }
      if (attachment.dataUrl.length > 1500000) throw new Error("Attachments must be smaller than 1 MB.");
    }
    const messages = JSON.parse(localStorage.getItem("sq2_local_direct_messages") || "[]");
    if (!Array.isArray(messages)) throw new Error("Local messages are invalid. Clear this site's saved data to continue.");
    messages.push({
      id: crypto.randomUUID(),
      sender_id: current.id,
      recipient_id: recipient.id,
      body: text,
      attachment: attachment ? {
        type: attachment.type,
        name: String(attachment.name || (attachment.type === "image" ? "Photo" : "Voice note")).slice(0, 100),
        mime: String(attachment.mime || "").slice(0, 80),
        dataUrl: attachment.dataUrl
      } : null,
      created_at: new Date().toISOString(),
      read_at: null
    });
    localStorage.setItem("sq2_local_direct_messages", JSON.stringify(messages.slice(-2000)));
  }

  function markMessagesRead(senderId) {
    const current = getSession();
    if (!current) throw new Error("Log in to read messages.");
    const messages = JSON.parse(localStorage.getItem("sq2_local_direct_messages") || "[]");
    if (!Array.isArray(messages)) throw new Error("Local messages are invalid. Clear this site's saved data to continue.");
    const readAt = new Date().toISOString();
    for (const message of messages) {
      if (message.sender_id === senderId && message.recipient_id === current.id && !message.read_at) {
        message.read_at = readAt;
      }
    }
    localStorage.setItem("sq2_local_direct_messages", JSON.stringify(messages));
  }

  function signOut() {
    localStorage.removeItem(sessionKey);
  }

  function readArray(key, description) {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`Saved ${description} data is invalid. Clear this site's saved data and try again.`);
    }
    if (!Array.isArray(value)) {
      throw new Error(`Saved ${description} data is invalid. Clear this site's saved data and try again.`);
    }
    return value;
  }

  function deleteAccount() {
    const current = getSession();
    if (!current) throw new Error("Log in again before deleting this local account.");
    const accounts = readAccounts();
    const posts = readArray("sq2_posts", "squad request");
    const members = readArray("sq2_members", "squad member");
    const roomMessages = readArray("sq2_messages", "room message");
    const directMessages = readArray("sq2_local_direct_messages", "direct message");
    const savedPosts = readArray("sq2_saved_posts", "saved squad");
    const savedPlayers = readArray("sq2_saved_players", "saved player");
    const removedPostIds = new Set(posts.filter(post => post.uid === current.id).map(post => String(post.id)));

    delete accounts[current.email];
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
    localStorage.setItem("sq2_posts", JSON.stringify(posts.filter(post => post.uid !== current.id)));
    localStorage.setItem("sq2_members", JSON.stringify(members.filter(member =>
      member.uid !== current.id && !removedPostIds.has(String(member.pid))
    )));
    localStorage.setItem("sq2_messages", JSON.stringify(roomMessages.filter(message =>
      message.uid !== current.id && !removedPostIds.has(String(message.room || "").replace(/^post:/, ""))
    )));
    localStorage.setItem("sq2_local_direct_messages", JSON.stringify(directMessages.filter(message =>
      message.sender_id !== current.id && message.recipient_id !== current.id
    )));
    localStorage.setItem("sq2_saved_posts", JSON.stringify(savedPosts.filter(postId =>
      !removedPostIds.has(String(postId))
    )));
    localStorage.setItem("sq2_saved_players", JSON.stringify(savedPlayers.filter(player =>
      player && player.id !== current.id
    )));
    localStorage.removeItem(sessionKey);
    localStorage.removeItem("sq2_name");
    localStorage.removeItem("sq2_profile");
  }

  window.SquadUpLocalAuth = { signUp, signIn, resetPassword, getSession, getProfile, saveProfile, getPlayers, getPlayersByGame, getMessages, getUnreadMessages, sendMessage, markMessagesRead, signOut, deleteAccount };
})();
