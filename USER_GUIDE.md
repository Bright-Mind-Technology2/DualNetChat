# Bright Mind User Guide

Bright Mind is a browser-based chat app for people connected to the same Wi-Fi network or hotspot. Core LAN chat does not require internet access.

## 1. Start Bright Mind

On the computer that will host the chat:

1. Install Node.js.
2. Open a terminal in the Bright Mind project folder.
3. Install dependencies if they are not installed:
   ```sh
   npm install
   ```
4. Start the server:
   ```sh
   npm run dev
   ```
5. Keep the terminal and server running while people use the app.

By default, the server uses port `3000`. On the host computer, open `http://localhost:3000`.

## 2. Connect another device

1. Connect the host and client devices to the same Wi-Fi network or hotspot.
2. In Bright Mind, open the **QR** connection panel.
3. If more than one LAN address is listed, choose the host's Wi-Fi address.
4. Scan the QR code with the other device's camera, or copy/open the displayed LAN URL in its browser.
5. If the page does not load, check that the host is still running and that its firewall allows incoming connections on the app's port.

The host's LAN IP can change when it reconnects to a network. Use the current address shown in the QR panel. To keep it stable, ask the network administrator to configure a DHCP reservation on the router.

## 3. Create an account and choose a language

Use the sign-up form to create an account, or sign in with an existing account on this Bright Mind server. Use the language toggle to switch between Khmer and English.

Accounts and chat data belong to the server you connected to. They are not automatically shared with a different Bright Mind server.

## 4. Find friends and send direct messages

1. In the **Friends** section, enter at least two characters of a username and search.
2. Review the matching accounts and select the add-friend button for the person you want.
3. Select that friend in the friends list to open a direct message.
4. Type a message and press **Enter** to send. Use **Shift+Enter** for a new line.

Only friends can exchange direct messages or start a video call. Direct messages are saved by the server and can be available when the recipient returns, provided the server retains its data.

## 5. Create and use a private channel

1. Select the add-channel control beside **Channels**.
2. Enter the channel details and invite the friends you want.
3. Select the channel to open its conversation.

Channels are private: only the creator and invited friends can see and use them. A channel member can open the shared whiteboard from the channel conversation.

## 6. Share files and voice clips

- Use the attachment control in a conversation to upload a file. The current per-file limit is **50 MB**.
- Use the voice-recording control to record and send an audio clip. Allow microphone access when the browser asks.
- Recipients can open supported attachments from the conversation.

Uploaded files are stored by the server. They may be lost if the server uses temporary storage or its data is removed.

## 7. Use message actions and search

- Press and hold a message to open its actions, including reply, reaction, and pin. You can delete your own messages from this menu.
- Use the conversation search control (or **Ctrl+F** / **Cmd+F**) to search messages and filter by content type.
- Use the pinned-message control to view pinned messages.

## 8. Make a video call

Both friends must be online. On `localhost`, browsers allow camera and microphone access without additional certificate setup. For calls from another device using a LAN IP address, the server must use HTTPS and the certificate must be trusted by that device.

Allow camera and microphone access in the browser when prompted. For Windows HTTPS setup, certificate trust, and restart instructions, see the **Enable HTTPS for LAN video calls on Windows** section in [README.md](./README.md).

Regular chat can work over HTTP even when LAN video calls cannot.

## 9. Data and privacy notes

- Bright Mind is served by one host. Keep that computer and the server available while users are chatting.
- The server stores accounts, direct messages, channels, channel messages, and uploaded files in its data storage.
- For a hosted deployment, configure persistent storage if data must survive restarts or redeployments. See [README.md](./README.md) for deployment details.
- Use only on a network and with people you trust. Do not expose the server to the public internet unless it has been separately configured and reviewed for that use.

## Troubleshooting

| Problem | What to check |
|---|---|
| The page does not open on another device | Confirm both devices are on the same Wi-Fi/hotspot, the server is running, the displayed LAN address is current, and the host firewall allows the app port. |
| The connection panel shows multiple IP addresses | Select the address belonging to the host's active Wi-Fi network. Avoid VPN or virtual-adapter addresses. |
| Bright Mind shows offline | Check the host process and network connection, then reload the page. |
| A friend cannot be found | Search using at least two username characters and confirm that the account exists on this server. |
| A video call cannot access the camera or microphone | Grant browser permissions. For LAN devices, use HTTPS with a trusted certificate. |
| A file upload fails | Confirm the file is no larger than 50 MB and that the server is reachable and has storage available. |
| Data disappears after a restart | Check whether the server is using temporary storage; configure durable storage for deployments that need persistence. |
