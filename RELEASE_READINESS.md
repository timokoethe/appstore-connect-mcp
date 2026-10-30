# Release-Readiness-Review

Stand: 30. Oktober 2026

CLI-Einstieg und Paket-Build sind umgesetzt. Sowohl der lokale Build als auch das
installierte Paket wurden vom Maintainer erfolgreich in Codex mit Apple-Zugriff
getestet. Es wurde in dieser Arbeit nichts auf npm veröffentlicht.

## Erledigt

- [x] `bin`-Eintrag und Node-Shebang für `appstoreconnect-mcp` ergänzt.
- [x] `prepack` bereinigt `build/` und baut anschließend neu.
- [x] Paketinhalt über `files` auf Build, Dokumentation und Security Policy begrenzt;
  README, LICENSE und package.json werden ebenfalls gepackt.
- [x] Paket isoliert installiert und CLI über MCP mit synthetischem Schlüssel geprüft
  (Initialisierung und Erkennung aller 14 Tools, ohne Apple-Anfragen).
- [x] Entfernung veralteter Build-Artefakte beim Packen geprüft.
- [x] Node-Mindestversion 20 in `engines`, README und CONTRIBUTING festgehalten.
- [x] MIT-Lizenzangabe ergänzt und Lockfile aktualisiert.
- [x] Lokalen Build und installiertes Paket in Codex mit Apple-Zugriff manuell getestet
  (vom Maintainer bestätigt).
- [x] Beide Codex-Installationswege und Testschritte in der README dokumentiert.
- [x] GitHub-Actions-Workflow für Node 20, 22, 24 und 26 eingerichtet.
- [x] Automatisierten Offline-Paket-Smoke-Test ergänzt und in CI eingebunden.
- [x] PR-CI auf allen vier Node-Versionen erfolgreich (vom Maintainer bestätigt).
- [x] Dependency-Audit gegen die aktuelle npm-Advisory-Datenbank durchgeführt:
  keine bekannten Sicherheitslücken.
- [x] Aktuellen Repository-Arbeitsstand und gesamte lokal erreichbare Git-Historie
  mit Gitleaks geprüft: keine Secret-Treffer.

Der CLI-Einstieg für eine spätere npm-/npx-Verteilung ist vorhanden. Ein Aufruf aus
der öffentlichen npm-Registry wurde hier nicht geprüft.

## Noch offen vor dem öffentlichen Release

- [ ] Release-Tag auf dem vorgesehenen Commit pushen und automatisch erstellte
  Release Notes prüfen. Der Workflow und der Abgleich mit `package.json.version`
  sind eingerichtet; npm-Veröffentlichung erfolgt separat.

## Nach Version 1.0.0 zurückgestellt

Claude-Code-Installation testen und konkret dokumentieren. Für Version 1.0.0
ist der bestätigte Codex-Ablauf maßgeblich; Claude Code ist kein Release-Blocker.

Mehr Tool-Abdeckung ist für den ersten Release nicht erforderlich. Der
Funktionsumfang bleibt auf lesenden Zugriff begrenzt.

## Durchgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm run typecheck` | Erfolgreich |
| `npm run build` | Erfolgreich |
| `npm test` | 215 Tests erfolgreich, keine Fehler |
| `npm run test:package` | Offline-Installation und CLI-Smoke-Test erfolgreich |
| Paketprüfung | CLI und Dokumentation enthalten; alte Build-Artefakte entfernt |
| Isolierte Paketinstallation und CLI-Start | MCP-Initialisierung und Erkennung aller 14 Tools erfolgreich |
| Codex mit Apple-Zugriff | Lokaler Build und installiertes Paket laut Maintainer erfolgreich |

Die lokalen automatisierten Prüfungen liefen unter Node 26.13.0 und verwenden
synthetische Daten ohne Netzwerkzugriffe. Beim manuellen Installationstest wurden
Paketabhängigkeiten über npm geladen. Die manuellen Apple-Tests belegen den
getesteten Ablauf, nicht alle Tools, Plattformen oder Rollenberechtigungen.

## Dependency-Audit und Secret-Scan

Geprüfter Commit: `8081bb3`, am 30. Oktober 2026.

- `npm audit --json` gegen die npm-Registry: 0 bekannte Sicherheitslücken,
  einschließlich Entwicklungsabhängigkeiten. Keine Dependency-Änderungen nötig.
- Gitleaks 8.30.1 aus dem offiziellen GitHub-Release; Archiv gegen die veröffentlichte
  SHA-256-Prüfsumme geprüft. Standardregeln, vollständige Redaktion und keine
  Unterdrückung durch `gitleaks:allow`-Kommentare verwendet.
- Git-Scan mit `--log-opts='--all --full-history -m'`: keine Treffer.
- Ergänzend alle 195 erreichbaren Blob-Inhalte und 30 Commit-Objekte separat
  gescannt, einschließlich früherer Dateistände und Commit-Nachrichten: keine Treffer.
- 76 versionierte bzw. nicht ignorierte Dateien des Arbeitsstands gescannt:
  keine Treffer. In der Historie außerdem keine `.p8`-, `.pem`-, `.key`- oder
  `.env`-Dateipfade gefunden.

Der Checkout ist nicht shallow. Der Scan umfasst alle lokal vorhandenen Git-Refs;
nicht erreichbare Objekte, nur remote vorhandene Refs und absichtlich ignorierte
lokale Dateien sind nicht Teil dieser Aussage. Secret-Erkennung beruht auf Mustern
und ist kein Beweis, dass beliebige geheime Daten ausgeschlossen sind.
Scan-Berichte und Scanner wurden außerhalb des Repositorys temporär abgelegt.

Ein vollständiger Security-Audit wurde nicht durchgeführt.
Bei der bisherigen Code-Durchsicht wurde kein konkreter
Release-Blocker in Authentifizierung oder GET-only-Transport gefunden; das ersetzt
keinen vollständigen Security-Audit.
