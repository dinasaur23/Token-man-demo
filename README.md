# Token Manager Prototype

## 1. Project Overview

This web application is developed for a bachelor thesis. It is used to evaluate the interoperability of DTCG format and efficiency of manual and automated design-to-development workflows.

## 2. Prerequisites

VS code, Figma desktop, and Node.js are already installed

## 3. Enter the directory

```bash
cd Token-man-demo
```

## 4. Dependencies installation

This step requires two separate terminals, one for client and one for server.

### client:

```bash
cd client
npm install
```

### server:

```bash
cd server
npm install
```

## 5. Running the application

### client:

In the client directory, run this command:

```bash
npm run dev
```

### server:

In the server directory, run this command:

```bash
npm start
```

After running both client and server, open the localhost on the client side.

> [!NOTE]
> Example JSON files for testing the upload feature are located in `/client/src/tokens`.

## 6. Using the Figma plugin

1. Open the Figma desktop application.

2. Go to the main menu.

3. Go to "Plugin" and click "Development."

4. Choose the "Import plugin from manifest."

5. Then choose the manifest.json file from the figma-token-plugin folder.

6. You need to configure the plugin setting first before using it by logging into the plugin using the same email and password as the web app.

7. After login, choose the workspace you want to synchronise the tokens to (you should have already created the workspace in the web app).

8. Then save the setting, and you can now sync the tokens (syncing and setting are separated).

---

**P.S.** The server must be running before importing the plugin.
