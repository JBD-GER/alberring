# Capacitor-Vorbereitung

Die Web-App ist für einen späteren Capacitor-Wrapper vorbereitet:

- responsive App-Shell mit fester mobiler Bottom-Navigation;
- Safe-Area-Abstände für iPhone und Android-Geräte mit Gestenleiste;
- Standalone-PWA-Manifest mit 192px-, 512px- und Apple-Touch-Icon;
- helle Statusleiste und einheitliche Alberring-CI;
- Touch-Ziele und Formulare ohne automatischen iOS-Zoom;
- Business-Logik bleibt im Web-Layer.

Kamera, Dateiauswahl, Push, Secure Storage, Deep Links und Lifecycle werden über
Interfaces in `src/services/platform` gekapselt. So lassen sich später native
Implementierungen ergänzen, ohne die Fachmodule umzubauen.

Vor dem ersten Store-Build sind noch festzulegen und auf realen Geräten zu
testen:

1. Bundle-ID und App-Name für iOS und Android.
2. Universal Links beziehungsweise Android App Links.
3. Push-Zertifikate und datensparsame Sperrbildschirm-Texte.
4. Secure Storage für Auth-Tokens.
5. Kamera- und Dateiberechtigungen für Nachweise und Chat-Anhänge.
6. Offline-, Cache- und Sitzungsverhalten.
7. Datenschutzangaben, Store-Texte und finale native App-Icons.
