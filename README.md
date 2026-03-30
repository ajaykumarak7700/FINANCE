# ₹ Banani Jai – Personal Finance Tracker

> A mobile-first PWA for tracking Borrowed, Lent, Spent & Income — synced to your private GitHub repo.

## 🚀 Quick Start

### Step 1: Create a Private GitHub Repo for Data
```
github.com → New repository
Name: banani-jai-data
✅ Private
→ Create repository (No README needed)
```

### Step 2: Generate a Personal Access Token (PAT)
```
GitHub → Settings → Developer settings
→ Personal access tokens → Tokens (classic)
→ Generate new token (classic)
→ Scopes: ✅ repo (full control)
→ Generate Token → Copy it
```

### Step 3: Open the App
Open `index.html` in your browser, then enter:
- **Token**: Your PAT (e.g. `ghp_xxxxxxxxxxxx`)
- **Repository**: `your-username/banani-jai-data`
- **File path**: `data.json` (default)

Click **Connect & Load Data** ✅

---

## 📁 Files
| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `style.css` | Dark fintech styles |
| `app.js` | GitHub API logic + all features |
| `manifest.json` | PWA installable config |
| `sw.js` | Service worker (offline) |
| `icon.svg` | Browser tab icon |

---

## ✨ Features
| Feature | Status |
|---------|--------|
| 2×2 Dashboard cards (Borrowed/Lent/Spent/Income) | ✅ |
| Net Balance (Income − Spent) | ✅ |
| Add / Edit / Delete entries | ✅ |
| GitHub JSON auto-sync (read + write) | ✅ |
| Monthly Reports with bar chart | ✅ |
| Filter by type & month | ✅ |
| Reminders with due dates | ✅ |
| Offline support (Service Worker) | ✅ |
| PWA installable | ✅ |
| Dark fintech UI | ✅ |
| Export JSON | ✅ |

---

## 🌐 Host on GitHub Pages

```bash
cd FINANCE

git init
git add .
git commit -m "Banani Jai app"
git remote add origin https://github.com/USERNAME/banani-jai.git
git push -u origin main

# → GitHub repo → Settings → Pages → main branch → Save
# URL: https://username.github.io/banani-jai/
```

---

## 🔒 Security Notes
> [!CAUTION]
> Your PAT is stored in **session memory only** — it is cleared when you close the tab. Never commit your token to any public repo.

> [!TIP]
> Use a **private** repository for data storage. Set token expiry to 90 days and regenerate regularly.
