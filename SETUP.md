# Google Calendar & Tasks Setup

To enable the Google Calendar and Google Tasks widgets you need a free Google Cloud project with an OAuth 2.0 Client ID.

## Step-by-step

### 1. Load the extension first (get your Extension ID)

1. Open `chrome://extensions` in Brave/Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `newtab/` folder
4. Copy the **Extension ID** shown under the extension name (looks like `abcdefghijklmnopqrstuvwxyzabcdef`)

### 2. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown → **New Project** → name it anything → **Create**

### 3. Enable the APIs

1. In the left menu: **APIs & Services → Library**
2. Search for **Google Calendar API** → **Enable**
3. Search for **Tasks API** → **Enable**

### 4. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in App name (anything) and your email → **Save and Continue**
4. Scopes: skip → **Save and Continue**
5. Test users: click **Add users** → add your Gmail address → **Save and Continue**
6. Back to Dashboard

### 5. Create the OAuth Client ID

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Chrome Extension**
3. Item ID: paste your **Extension ID** from Step 1
4. Click **Create**
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`)

### 6. Add the Client ID to the extension

Open `manifest.json` and replace `YOUR_CLIENT_ID.apps.googleusercontent.com`:

```json
"oauth2": {
  "client_id": "YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/tasks.readonly"
  ]
}
```

### 7. Reload the extension

1. Go back to `chrome://extensions`
2. Click the **↺ reload** button on the extension
3. Open a new tab → click **Connect Google Calendar** / **Connect Google Tasks**

That's it! The OAuth flow is handled automatically by Chrome.
