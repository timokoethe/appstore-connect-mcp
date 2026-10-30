# Release-Readiness-Review

Stand: 30. Oktober 2026

CLI-Einstieg und Paket-Build sind umgesetzt. Sowohl der lokale Build als auch das
installierte Paket wurden vom Maintainer erfolgreich in Codex mit Apple-Zugriff
getestet. Es wurde in dieser Arbeit nichts auf npm veröffentlicht.

## Erledigt

- [x] `bin`-Eintrag und Node-Shebang für `appstore-connect-mcp` ergänzt.
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

Der CLI-Einstieg für eine spätere npm-/npx-Verteilung ist vorhanden. Ein Aufruf aus
der öffentlichen npm-Registry wurde hier nicht geprüft.

## Noch offen vor dem öffentlichen Release

- [ ] CI mit `npm ci`, Typecheck, Build und Tests auf den unterstützten Node-Versionen.
- [ ] Automatisierter Paket-Smoke-Test in CI; bisher manuell geprüft.
- [ ] Kompatibilität mit der zugesagten Node-Mindestversion tatsächlich testen.
- [ ] Claude-Code-Installation testen und konkret dokumentieren; bisher ist dafür
  nur das generische `mcpServers`-JSON-Beispiel vorhanden.
- [ ] Dependency-Audit mit aktueller Advisory-Datenbank durchführen und bewerten.
- [ ] Git-Historie vollständig auf versehentlich eingecheckte Secrets prüfen.
- [ ] Release-Tag und kurze Release Notes vorbereiten.

Mehr Tool-Abdeckung ist für den ersten Release nicht erforderlich. Der
Funktionsumfang bleibt auf lesenden Zugriff begrenzt.

## Durchgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npm run typecheck` | Erfolgreich |
| `npm run build` | Erfolgreich |
| `npm test` | 215 Tests erfolgreich, keine Fehler |
| Paketprüfung | CLI und Dokumentation enthalten; alte Build-Artefakte entfernt |
| Isolierte Paketinstallation und CLI-Start | MCP-Initialisierung und Erkennung aller 14 Tools erfolgreich |
| Codex mit Apple-Zugriff | Lokaler Build und installiertes Paket laut Maintainer erfolgreich |

Die lokalen automatisierten Prüfungen liefen unter Node 26.13.0 und verwenden
synthetische Daten ohne Netzwerkzugriffe. Beim manuellen Installationstest wurden
Paketabhängigkeiten über npm geladen. Die manuellen Apple-Tests belegen den
getesteten Ablauf, nicht alle Tools, Plattformen oder Rollenberechtigungen.

Ein vollständiger Security-Audit und ein vollständiger Secret-Scan der Git-Historie
wurden nicht durchgeführt. Bei der bisherigen Code-Durchsicht wurde kein konkreter
Release-Blocker in Authentifizierung oder GET-only-Transport gefunden; das ersetzt
keinen vollständigen Security-Audit.
