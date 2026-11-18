# Bright Mind Project Charter

**Status:** Draft for stakeholder review
**Version:** 1.0
**Project:** Bright Mind — Local Offline Wi-Fi Chat

## 1. Project purpose

Bright Mind provides real-time messaging and collaboration for people using the same local network. Its purpose is to let users communicate and share content over Wi-Fi without relying on an internet connection or a third-party chat service for core LAN chat functionality.

## 2. Problem and opportunity

Internet-dependent messaging may be unavailable, undesirable, or impractical in local settings. Bright Mind offers a self-hosted alternative that can serve nearby users from one Node.js server and can be accessed by devices on the host's LAN.

## 3. Objectives

- Allow users to register, sign in, and communicate with accounts on the same Bright Mind server.
- Support friend discovery, direct messages, and private channels with invited members.
- Support sharing supported message content and uploaded files on the LAN.
- Provide real-time presence and collaboration features, including a shared whiteboard and peer-to-peer video calls where browser and HTTPS requirements are met.
- Persist application data when the host is configured with durable storage.
- Provide a usable interface in Khmer and English.

## 4. Scope

### In scope

- A browser-based application served by a Node.js/Express server.
- Real-time communication using Socket.IO.
- Account registration and login, friend management, direct messages, and private channels.
- Text, file, audio, and sketch-related chat content supported by the application.
- LAN connection information and device access over the host's network.
- Video calls between online friends on the LAN, subject to browser permissions and secure-context requirements.
- Local data storage, with persistent-volume configuration for hosted deployments.
- Khmer and English user-interface translations.

### Out of scope for this charter

- Public internet messaging, federation, or operation as a multi-server service.
- A guarantee of uninterrupted service, a defined maximum user count, or a formal service-level agreement.
- Managed cloud hosting, backups, or account recovery unless separately planned.
- Production security certification or regulatory compliance; these require separate requirements and review.
- Gemini/AI functionality as a release commitment. It is not included in the baseline until its implementation, data handling, and operating requirements are confirmed.

## 5. Key deliverables

1. A runnable Bright Mind web application and LAN server.
2. User authentication, friend management, direct messaging, and private channels.
3. Supported file-sharing and collaboration features.
4. Khmer and English user-interface text.
5. Setup and deployment guidance covering LAN access, HTTPS for LAN video calls, and persistent storage.
6. Verification of the agreed acceptance criteria before release.

## 6. Stakeholders and roles

| Role | Responsibility |
|---|---|
| Project sponsor / product owner | Confirm goals, priorities, scope, and release approval. **To be assigned.** |
| Project lead | Coordinate delivery, risks, decisions, and stakeholder communication. **To be assigned.** |
| Engineering | Implement, test, document, and maintain the application. |
| Host administrator | Configure the server, network access, HTTPS, and persistent storage. |
| End users | Validate usability and expected behavior on supported devices and browsers. |

## 7. Assumptions and constraints

- Users can reach the host over a shared LAN; the host firewall and router permit the configured port.
- A single server instance is used. Connected-user and Socket.IO session state is held in memory and is not shared across instances.
- Core LAN chat does not require internet access, but installation, external hosting, and any separately enabled external integrations may require it.
- Camera and microphone access on LAN devices requires HTTPS and a certificate trusted by those devices. `localhost` has different browser secure-context handling.
- LAN IP addresses may change when the network assigns a new address. A router DHCP reservation can provide a stable address.
- Data durability depends on the host's storage configuration; deployments using temporary storage may lose data on restart or redeployment.
- Supported browser versions, device requirements, deployment environment, capacity targets, and recovery objectives remain to be confirmed.

## 8. Risks and responses

| Risk | Response |
|---|---|
| Host LAN IP changes or clients cannot reach the server | Document network prerequisites and recommend DHCP reservation; provide a clear connection workflow. |
| Browser blocks camera/microphone on an insecure LAN origin | Document HTTPS setup and certificate trust requirements; test on representative client devices. |
| Data is lost after a restart or redeployment | Require durable storage for deployments where persistence is expected; document backup ownership. |
| A single host or server failure interrupts service | Make the single-instance limitation explicit and define an operational recovery approach before production use. |
| Scope or capacity expectations are unclear | Confirm user count, supported devices, performance, security, and availability targets with the sponsor before release commitments. |

## 9. Milestones

The dates below are not set. Sequence and estimates should be agreed after a project owner confirms priorities and release criteria.

1. **Charter approval:** Confirm sponsor, users, scope, risks, and acceptance criteria.
2. **Requirements and deployment decisions:** Agree supported environments, capacity, security expectations, persistence, and backup needs.
3. **Implementation and stabilization:** Complete prioritized features and resolve release-blocking defects.
4. **Pilot validation:** Test LAN access, account flows, messaging, file sharing, persistence, and HTTPS video calling on agreed devices.
5. **Release and handover:** Publish setup guidance, operational ownership, and support process.

## 10. Acceptance criteria

The project is ready for an initial release when stakeholders confirm that:

- The application starts using the documented setup and can be opened by a client on the same LAN.
- Users can register or sign in and communicate through direct messages and invited private channels.
- Supported files and messages can be sent and received between authorized clients.
- Expected data remains available after a server restart when durable storage is configured.
- The agreed collaboration features work on the selected browsers and devices, with HTTPS configured for LAN camera/microphone use.
- Khmer and English interfaces are reviewed for the agreed user flows.
- Known limitations, deployment requirements, and recovery responsibilities are documented.

## 11. Success measures

At pilot completion, measure:

- Successful completion of the agreed user flows by representative LAN clients.
- Number and severity of unresolved release-blocking defects.
- Message and file availability after reconnect and restart with the approved storage setup.
- User feedback on setup clarity, connection reliability, and Khmer/English usability.

Numeric targets, pilot size, and measurement period must be agreed by the project sponsor.

## 12. Governance and approval

Changes to objectives, scope, release commitments, or acceptance criteria require approval from the project sponsor/product owner. Technical risks and blockers should be raised with the project lead and recorded before release decisions.

| Approver | Name | Approval / date |
|---|---|---|
| Sponsor / product owner | To be assigned | Pending |
| Project lead | To be assigned | Pending |
