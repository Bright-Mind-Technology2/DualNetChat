# Bright Mind User Stories

**Status:** Draft backlog for review
**Source:** Bright Mind Project Charter
**Priority key:** P1 = essential for the initial LAN-chat experience; P2 = supporting collaboration or operations.

These stories describe intended outcomes. Their acceptance criteria should be validated on the agreed browsers, devices, and deployment setup before release.

## Account and connection

### US-01 — Create an account and sign in (P1)

As a person on the local network, I want to create an account and sign in, so that I can use Bright Mind as a recognized user.

**Acceptance criteria**

- Given valid registration details, when I submit them, then an account is created and I can enter the chat.
- Given invalid or already-used account details, when I submit them, then I see an error and no duplicate account is created.
- Given an existing account and valid credentials, when I sign in, then I enter the chat as that account.

### US-02 — Join from another device on the LAN (P1)

As a user, I want a connection link or QR code for the host, so that I can open Bright Mind from another device on the same network.

**Acceptance criteria**

- Given the server is running and reachable, when I view its connection information, then I can identify a LAN address and port to open.
- Given my device can reach that host, when I open the link, then the Bright Mind interface loads.
- Given the host's network address changes, then I can obtain the current connection information from the host.

## Friends and messaging

### US-03 — Find and add a friend (P1)

As a user, I want to search for another account and send a friend request/add them, so that we can communicate privately.

**Acceptance criteria**

- Given a search term that meets the minimum length, when I search, then matching accounts are shown.
- Given a matching account, when I choose to add that person, then the friendship is established according to the app's two-way friend behavior.
- Given an account that is already my friend, then the interface identifies it as a friend.

### US-04 — See who is available (P1)

As a user, I want to see friends' connection status, so that I know who is available to chat or call.

**Acceptance criteria**

- Given friends are connected or disconnected, then their displayed status reflects their current or last-seen state as provided by the service.
- Given a friend is offline, then I can distinguish that from an online friend.

### US-05 — Send a direct message (P1)

As a user, I want to send a private message to a friend, so that we can communicate one-to-one.

**Acceptance criteria**

- Given I have added a friend, when I send a message, then it is delivered to that friend when available.
- Given the recipient is offline, then the message remains available for them when they return, subject to the configured data storage.
- Given a user is not my friend, then I cannot use the friends-only direct-message flow with them.

### US-06 — Manage a message (P2)

As a user, I want to reply to, react to, pin, or delete my own message, so that I can organize the conversation and correct my posts.

**Acceptance criteria**

- Given a message, when I choose reply or reaction, then the conversation shows the reply context or selected reaction.
- Given a message I am allowed to pin, when I pin it, then its pinned state is visible in the conversation.
- Given a message I sent, when I delete it, then it is removed or marked deleted according to the app's behavior.
- I cannot delete another user's message through the own-message delete action.

## Channels and collaboration

### US-07 — Create a private channel and invite friends (P1)

As a user, I want to create a private channel and select friends to invite, so that I can have a focused group conversation.

**Acceptance criteria**

- Given I create a channel, then I can provide its name and choose eligible friends to invite.
- Given a channel is created, then it is visible and usable only to its creator and invited members.
- Given a user is not a member, then they cannot discover or join that private channel through the normal channel interface.

### US-08 — Chat in a channel (P1)

As a channel member, I want to exchange messages with other members, so that we can coordinate as a group.

**Acceptance criteria**

- Given I am a channel member, when I send a message, then other connected members of that channel receive it.
- Given I am not a member, then I cannot send messages to that channel.

### US-09 — Share supported content (P1)

As a user, I want to share supported files and audio in a conversation, so that I can exchange useful content with friends or channel members.

**Acceptance criteria**

- Given a supported file or audio item, when I send it to an authorized conversation, then recipients can see and access it.
- Given an upload cannot be accepted, then I receive a clear indication that it failed.
- Shared content remains accessible after reconnect when the server's storage retains the uploaded data.

### US-10 — Use the shared whiteboard (P2)

As a channel member, I want to draw on a shared whiteboard, so that I can explain ideas visually with other members.

**Acceptance criteria**

- Given I open the whiteboard for a channel, when I draw or clear it, then connected members viewing that channel receive the update.
- Given I am not a member of the channel, then I cannot use its whiteboard.

### US-11 — Start a video call with a friend (P2)

As a user, I want to call an online friend, so that we can talk face-to-face.

**Acceptance criteria**

- Given both friends are online and the browser supports the required media features, when one starts a call and the other accepts, then audio/video connects.
- Given camera or microphone permission is denied, the browser does not support the feature, or the connection is unavailable, then the user receives an appropriate failure or status indication.
- Given the call is made between LAN devices, the host uses HTTPS with a certificate trusted by the devices.

## Usability and operations

### US-12 — Use the interface in Khmer or English (P2)

As a user, I want to choose Khmer or English, so that I can use the chat in my preferred language.

**Acceptance criteria**

- Given either supported language is selected, then the main interface labels and supported messages appear in that language.
- Given I change the language, then the selection is retained in that browser according to the app's settings behavior.

### US-13 — Preserve data across server restarts (P1 for hosted deployments)

As a host administrator, I want application data stored on durable storage, so that accounts, messages, channels, and uploaded files are not lost on restart or redeployment.

**Acceptance criteria**

- Given the deployment mounts and configures persistent storage, when the server restarts, then retained application data remains available.
- Given storage is temporary or unavailable, then deployment documentation makes the data-loss risk clear.

## Release readiness

Before release, the project owner should confirm:

- Supported browsers, device types, expected LAN size, and performance targets.
- Which P2 collaboration features are required for the initial release.
- Data retention, backup, recovery, and account-support expectations.
- Whether any external or AI-integrated features belong in a later, separately scoped release.
