// Storage helpers available to content scripts.
// Content scripts cannot use ES module imports, so this file is loaded as a
// plain script before content.js via manifest.json content_scripts.
// It exposes getSeenPostIds() and markPostSeen() as globals on window.
// Logic must stay in sync with utils/storage.js.

(function () {
  const SEEN_POST_IDS_KEY = 'seen_post_ids';
  const SEEN_POST_IDS_CAP = 500;

  window.LeadSnapStorage = {
    getSeenPostIds() {
      return new Promise((resolve) =>
        chrome.storage.local.get(SEEN_POST_IDS_KEY, (d) =>
          resolve(d[SEEN_POST_IDS_KEY] || [])
        )
      );
    },

    async markPostSeen(postId) {
      const seen = await window.LeadSnapStorage.getSeenPostIds();
      const updated = [...new Set([...seen, postId])].slice(-SEEN_POST_IDS_CAP);
      return chrome.storage.local.set({ [SEEN_POST_IDS_KEY]: updated });
    },
  };
})();
