function getBrowser() {
  if (typeof browser === "undefined") return chrome;
  return browser;
}

class FirebaseAnalyticsManager {
  constructor() {
    if (FirebaseAnalyticsManager._instance) {
      throw new Error("Firebase Analytics Manager Have been instantiated");
    }
    this.GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";
    this.MEASUREMENT_ID = `G-CLFR1EQEHX`;
    this.API_SECRET = `1S-gP2C3SvmIOe93kgGEQg`;
    this.SESSION_EXPIRATION_IN_MIN = 30;
    this.enableAnalytics = false;
    this.browser = getBrowser();
  }

  async getOrCreateClientId() {
    if (!this.enableAnalytics) return;
    const result = await this.browser.storage.local.get("clientId");
    let clientId = result.clientId;
    if (!clientId) {
      clientId = self.crypto.randomUUID();
      await this.browser.storage.local.set({ clientId });
    }
    return clientId;
  }

  async fireModifiedButtonClickedEvent(id, buttonType, buttonName) {
    if (!this.enableAnalytics) return;
    fetch(
      `${this.GA_ENDPOINT}?measurement_id=${this.MEASUREMENT_ID}&api_secret=${this.API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: await this.getOrCreateClientId(),
          events: [
            {
              name: "button_clicked",
              params: {
                id: id,
                type: buttonType,
                name: buttonName,
              },
            },
          ],
        }),
      }
    );
  }

  async fireUnlockedDataEvent(dataType) {
    if (!this.enableAnalytics) return;
    fetch(
      `${this.GA_ENDPOINT}?measurement_id=${this.MEASUREMENT_ID}&api_secret=${this.API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: await this.getOrCreateClientId(),
          events: [
            {
              name: "data_unlocked",
              params: {
                type: dataType,
              },
            },
          ],
        }),
      }
    );
  }

  async fireErrorEvent(url, error, unlocker) {
    if (!this.enableAnalytics) return;
    fetch(
      `${this.GA_ENDPOINT}?measurement_id=${this.MEASUREMENT_ID}&api_secret=${this.API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: await this.getOrCreateClientId(),
          events: [
            {
              name: "unlock_error",
              params: {
                error_type: error,
                url: url,
                unlocker_name: unlocker,
              },
            },
          ],
        }),
      }
    );
  }
}

let analyticsManager = new FirebaseAnalyticsManager();
export { analyticsManager };
