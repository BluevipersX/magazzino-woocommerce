# Magazzino WooCommerce

App Windows semplice per modificare da WooCommerce:

- prezzo normale
- prezzo scontato
- quantita di magazzino
- ricerca prodotti live mentre scrivi

## Avvio

Installa le dipendenze:

```powershell
npm.cmd install
```

Avvia l'app:

```powershell
npm.cmd start
```

## Collegamento a WooCommerce

In WordPress apri:

`WooCommerce > Impostazioni > Avanzate > REST API`

Crea una chiave con permessi `Lettura/Scrittura`, poi inserisci nell'app:

- URL negozio, esempio `https://iltuonegozio.it`
- Consumer Key
- Consumer Secret

Premi `Salva`, poi `Test`.

## Creare l'installer Windows

Dopo `npm.cmd install`, puoi creare un installer `.exe`:

```powershell
npm.cmd run dist
```

Il programma verra generato in `release`.

L'installer principale avra un nome simile a:

`Magazzino-WooCommerce-Setup-0.1.23.exe`

L'utente dovra solo aprire quell'eseguibile e seguire l'installazione.

## Repository GitHub

Repository previsto:

`https://github.com/BluevipersX/magazzino-woocommerce`

## Aggiornamenti remoti con GitHub Releases

L'app controlla gli aggiornamenti all'avvio e anche dal pulsante `Aggiornamenti`.

Gli aggiornamenti sono configurati per usare GitHub Releases.

Per pubblicare una nuova versione:

1. aumenta il campo `version` in `package.json`, per esempio da `0.1.1` a `0.1.2`
2. crea un tag Git con la stessa versione:

```powershell
git add .
git commit -m "Release 0.1.2"
git tag v0.1.2
git push
git push origin v0.1.2
```

3. GitHub Actions creera automaticamente l'installer e lo carichera nella sezione Releases

Nota: per aggiornamenti automatici verso altri PC, il repository GitHub deve essere pubblico oppure bisogna usare un sistema con token privati. La soluzione piu semplice e rendere pubblico questo repository o usare un repository pubblico separato solo per le release.

La workflow si trova in `.github/workflows/release.yml`.

Puoi anche creare e pubblicare una release dal tuo PC con:

```powershell
npm.cmd run release
```

In quel caso serve un token GitHub disponibile nella variabile ambiente `GH_TOKEN`.
