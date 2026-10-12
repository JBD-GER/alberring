const labels = {
  iosAppStoreUrl: "iPhone / iPad",
  androidPlayStoreUrl: "Android",
};

export function validateStoreLinks(config) {
  if (config.iosDistribution !== "unlisted")
    throw new Error("Alberring iOS distribution must remain unlisted.");
  for (const field of Object.keys(labels)) {
    const value = config[field];
    if (value === null) continue;
    if (typeof value !== "string" || !value || /[\s<>"'{}]/.test(value))
      throw new Error(`${field}: use a verified store URL or null.`);
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      throw new Error(`${field}: only a direct HTTPS store URL is allowed.`);
    if (field === "iosAppStoreUrl") {
      if (
        url.hostname !== "apps.apple.com" ||
        !/^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id[0-9]+$/.test(url.pathname) ||
        url.search
      )
        throw new Error(
          "iOS: use the actual Apple app URL without tracking or authentication parameters.",
        );
    } else if (
      url.hostname !== "play.google.com" ||
      url.pathname !== "/store/apps/details" ||
      url.search !== "?id=de.alberring.connect"
    ) {
      throw new Error(
        "Android: use the verified Play Store URL for de.alberring.connect without extra parameters.",
      );
    }
  }
  return config;
}

export function storeLinksHtml(config) {
  validateStoreLinks(config);
  return `<!-- MOBILE_STORE_LINKS:START -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 24px; border-top: 1px solid #dfe8e7">
<tr><td style="padding: 20px 0 6px">
<h2 style="margin: 0 0 8px; color: #1d2b2e; font-size: 20px; line-height: 28px">Ein Konto für Web, Android und iPhone</h2>
<p style="margin: 0; color: #526063; font-size: 15px; line-height: 23px">Legen Sie über den persönlichen Link oben Ihr Passwort fest. Bei einer neuen Einladung erscheint nach der Aktivierung die Geräteauswahl. Dort können Sie Alberring im Browser öffnen oder eine verfügbare App installieren. Auf allen Geräten gelten dieselben Zugangsdaten.</p>
</td></tr>
<tr><td style="padding: 12px 0"><a href="https://app.alberring.de/installation" style="display: block; padding: 12px 16px; border: 1px solid #075a5e; border-radius: 8px; color: #075a5e; font-size: 16px; line-height: 24px; font-weight: 700; text-decoration: none; text-align: center">Geschützte Geräteauswahl öffnen</a></td></tr>
<tr><td><p style="margin: 0; color: #526063; font-size: 13px; line-height: 20px">Nur aktive Mitarbeiterkonten können den Installationsbereich öffnen. Ein weitergeleiteter Link allein gewährt keinen Zugang. Bereits aktivierte Konten melden sich einfach mit dem bestehenden Passwort an.</p></td></tr>
</table>
<!-- MOBILE_STORE_LINKS:END -->`;
}
