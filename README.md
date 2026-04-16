# Dashboard — New Tab

A personal dashboard Chrome/Brave extension that replaces the new tab page. Built with vanilla JS, no build step required.

![Dashboard Preview](https://img.shields.io/badge/version-2026.04.15-blue) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)

<img width="1206" height="948" alt="image" src="https://github.com/user-attachments/assets/012f21d6-9b79-42a6-9e3a-08ae9c539904" />


## Features

- **RSS Feeds** — Configurable feeds (Hacker News, The Verge, TechCrunch + any custom URL). Favicons, thumbnails, relative timestamps, HN upvote/comment counts, and read/unread tracking that persists across sessions.
- **Google Calendar** — OAuth-connected, shows the next 7 days across multiple calendars. Each event has a colored dot matching its calendar color and links directly to the event. The next upcoming event is highlighted with a live countdown ("Starting in 23m").
- **Google Tasks** — Shows your task list with the ability to add new tasks inline and mark tasks as done with a single click.
- **Quick Links** — Grouped bookmarks with emoji icons, editable directly on the dashboard.
- **Currency Converter** — Live USD → BRL rates with a real-time conversion input.
- **Quote of the Day** — Daily quote via ZenQuotes, cached for 24 hours.
- **Sun Arc** — Visual sun-position arc in the topbar showing where you are in the day, with a live greeting (Good morning / Good afternoon / Good evening).

## Dashboard UX

- **Drag & drop** — Reorder any widget across the 4-column grid; layout is saved automatically.
- **Collapsible widgets** — Every card has a chevron to collapse it to just the header row; state persists.
- **Show / hide widgets** — "✎ Edit" mode lets you remove cards from the dashboard and add them back via a slide-up panel.
- **Read / unread RSS** — Clicked headlines fade to muted gray so fresh stories stand out on every glance.

## Setup

### 1. Load as unpacked extension

1. Clone or download this repo
2. Open `brave://extensions` or `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the project folder
5. Copy the **Extension ID** shown on the card

### 2. Google Calendar & Tasks (optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project
2. Enable **Google Calendar API** and **Google Tasks API**
3. Configure the **OAuth consent screen** (External; add your Gmail as a test user)
4. Create an **OAuth 2.0 Client ID** → Application type: **Web application**
5. Under **Authorized redirect URIs**, add:
   ```
   https://<YOUR_EXTENSION_ID>.chromiumapp.org/
   ```
6. Copy the **Client ID** into both:
   - `js/widgets/calendar.js` → `CLIENT_ID`
   - `js/widgets/tasks.js` → `CLIENT_ID`
7. Reload the extension

### 3. Add RSS feeds

Open a new tab → click **⚙ Settings** → **RSS Feeds** → add any feed URL. The widget appears automatically on the next new tab.

## File structure

```
newtab/
├── manifest.json          # MV3 manifest
├── newtab.html            # Dashboard page
├── settings.html          # Settings page
├── css/
│   ├── styles.css         # Dashboard styles
│   └── settings.css       # Settings page styles
├── js/
│   ├── storage.js         # chrome.storage wrappers
│   ├── app.js             # Bootstrap & widget manager
│   ├── drag.js            # Drag-and-drop + layout persistence
│   ├── settings.js        # Settings page logic
│   └── widgets/
│       ├── quote.js       # Quote of the Day + shared utilities
│       ├── currency.js    # Currency converter
│       ├── quicklinks.js  # Quick Links (inline editable)
│       ├── rss.js         # RSS / Atom reader
│       ├── calendar.js    # Google Calendar (OAuth)
│       └── tasks.js       # Google Tasks (OAuth)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Tech

- Vanilla JS — no frameworks, no build step
- Chrome Extension Manifest V3
- `chrome.identity.launchWebAuthFlow` for OAuth (works in both Chrome and Brave)
- `chrome.storage.sync` for layout, links, feed config
- `chrome.storage.local` for caches and OAuth tokens
- HTML5 Drag and Drop API with MutationObserver for dynamic handle injection
