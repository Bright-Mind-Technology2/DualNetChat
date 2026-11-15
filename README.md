<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/73561ceb-b39c-4a02-a321-558f3b6ae882

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Friends, direct messages, and video calls

In the Friends section, enter at least two characters of an account username and press Enter or the search button. Review the matching accounts, then press the separate add-friend button on the account you want. Adding creates a two-way friendship; only friends can exchange direct messages or start a video call. Direct messages are stored locally in `data/direct-messages.json` and are available when the recipient returns online.

Press and hold a message to open its reaction, reply, and pin actions. You can also delete your own messages from this menu.

New channels are private. The creator selects which mutual friends to invite; only the creator and invited friends can see, join, and use that channel.

Video calls are peer-to-peer over the local network and require both friends to be online. `localhost` supports calls without extra setup. LAN devices must use HTTPS with a certificate trusted by each device, then grant camera/microphone permission.

### Enable HTTPS for LAN video calls on Windows

1. Install [mkcert](https://github.com/FiloSottile/mkcert) and create a local certificate authority:
   ```powershell
   winget install FiloSottile.mkcert
   mkcert -install
   ```
2. Find the Wi-Fi IPv4 address shown by Bright Mind's QR/connect panel. Create a certificate for that IP (replace the example address):
   ```powershell
   New-Item -ItemType Directory -Force certs
   mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem localhost 127.0.0.1 192.168.1.128
   ```
3. Restart Bright Mind with HTTPS enabled:
   ```powershell
   $env:HTTPS_CERT_FILE = ".\certs\lan.pem"
   $env:HTTPS_KEY_FILE = ".\certs\lan-key.pem"
   npm run dev
   ```
   The QR/connect panel will now show an `https://` LAN link.
4. To trust the certificate on phones/tablets, securely copy only `rootCA.pem` from the directory printed by `mkcert -CAROOT` to each device and install/trust it as a user CA certificate. Never copy or share `rootCA-key.pem`. Recreate the LAN certificate if the host's Wi-Fi IP changes.

Without HTTPS, camera/microphone calls over an IP address are blocked by browsers; regular HTTP chat still works.

## Host Bright Mind

Bright Mind needs a Node.js host that supports long-lived Socket.IO/WebSocket connections. Build and start it with:

```sh
npm ci
npm run build
npm run start
```

Set `PORT` to the port supplied by the host. For deployment, configure a persistent volume mounted at `/data` and set `DATA_DIR=/data`. Bright Mind stores accounts, direct messages, channels, channel messages, and uploaded files under that directory. Without a persistent volume, data stored on the host's temporary filesystem may be lost during restarts or redeploys.

Run a single server instance: connected-user and Socket.IO session state is held in memory and is not shared between multiple instances. Use HTTPS on the host for camera and microphone access.
