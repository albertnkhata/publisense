# Publisense Platform Migration & Unified Brand Renaming

Comprehensive status report and architectural migration specification for transitioning the platform identity to **Publisense** across the application codebase, build metadata, default administrative personas, and external platforms (Google Cloud Platform, Firebase, and GitHub).

## Execution Status: Codebase 100% Complete · Build Verified · Console Sync Ready

> [!NOTE]
> All application codebase migration tasks, HTML and OpenGraph metadata, package naming, dual-read storage backward compatibility, system notifications, and default organization records have been fully implemented and verified via TypeScript linting and production build compilation. External platform display names in GCP, Firebase, and GitHub are ready to be finalized via their web consoles.

---

## Platform Migration Status Matrix

| Platform / Surface | Target Name | Status | Type | Implementation Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Codebase Package** | `publisense` | **Completed** | Codebase | Updated in `package.json` from generic placeholder to `publisense` |
| **HTML & OpenGraph** | `Publisense` | **Completed** | Client Head | Full `<title>`, `meta description`, `og:title`, and `og:site_name` configured |
| **Applet Metadata** | `Publisense` | **Completed** | Studio Config | Synced in `metadata.json` with product description |
| **Storage Engine** | `publisense_*` | **Completed** | Client LocalStorage | Dual-read fallback active (`publisense_settings` + `crowdpulse_settings`) |
| **Default Platform Org** | `Publisense` (`@publisense`) | **Completed** | Data & Auth | Reserved handle `@publisense`, admin domain `@publisense.dev`, fallback company |
| **System Toasts & Notifications** | `Publisense` | **Completed** | Notification Layer | Replaced legacy actors with `Publisense` across toasts and alerts |
| **Account Deletion Flow** | Danger Zone | **Completed** | User Settings | Permanent account deletion with post/comment anonymization & phrase verification |
| **TypeScript Compilation** | `tsc --noEmit` | **Completed** | Validation | Clean build with 0 type errors or missing imports |
| **Production Build** | `npm run build` | **Completed** | Validation | Vite client distribution compiled successfully |
| **Google Cloud Platform (GCP)** | `Publisense` | **Action Required** | Cloud Console | Project display name update in IAM & Admin Settings |
| **Firebase Console** | `Publisense` | **Action Required** | Cloud Console | Inherits GCP project display name automatically |
| **GitHub Repository** | `publisense` | **Action Required** | GitHub Console | Repository name rename in Settings > General |

---

## User Review & Critical Platform Invariants

> [!IMPORTANT]
> **Cloud & Platform Technical Invariants:**
> - **GCP & Firebase Project ID**: In Google Cloud and Firebase, the underlying globally unique **Project ID** (`ai-studio-signalpulsepubli-2db5709d-d45c-4831-b6b4-1dc3a434ca31`) and Firestore database ID are immutable infrastructure identifiers established upon provisioning. They cannot be altered in-place by any API or CLI without recreating cloud infrastructure and losing live database connections.
> - **GCP & Firebase Display Name**: The user-visible **Project Name** in the Google Cloud Console and Firebase Console *can* be renamed to **Publisense** directly in the GCP Resource Settings console without affecting running databases or authentication.
> - **GitHub Repository**: GitHub repositories can be renamed instantly in Repository Settings -> General. GitHub automatically maintains URL redirection from previous URLs to the new repository name.
> - **Zero Disruption for Existing Users**: Automatic dual-storage read fallbacks ensure that users with existing theme preferences or cached profiles seamlessly migrate to the new `publisense_*` storage namespace without losing settings or experiencing logged-out states.

---

## 1. Overview & Core Concept

- **What It Delivers**: Unifies the platform branding under **Publisense** across all application layers, configuration files, default administrative personas, and external platform touchpoints.
- **Target Audience / Persona**: Platform administrators, product teams, and community members interacting with product feedback and community sensing.
- **Key Value**: Delivers complete brand consistency across the browser tab, OpenGraph social sharing, system alert notifications, repository metadata, and cloud resource consoles.

---

## 2. User Experience & Visual Design

### Key User Flows & Visual Touchpoints

1. **Browser & Metadata**:
   - The browser tab and OpenGraph preview display: `Publisense — Product Feedback Intelligence & Community Sensing`.
   - Favicon and branding reflect the clean violet and neutral aesthetic of Publisense.

2. **System Alert Toasts**:
   - When actions take place (e.g., organization claim verification, sign out, account deletion, feedback submission), system toast messages reflect the sender name: `Publisense`.

3. **Platform Default Organization**:
   - The default platform organization and administrator profiles reflect `Publisense` (`@publisense`, `comp-crowdpulse` company record), with automated fallback migration so existing claims and user sessions transition without error.

4. **Account Deletion & Data Privacy**:
   - Fully operational Danger Zone in Settings allows users to permanently delete accounts while maintaining community discussions by anonymizing feedback posts and comments to `Deleted User`.

---

## 3. System Architecture & Migration Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                      PUBLISENSE UNIFIED BRANDING                       │
└────────────────────────────────────────────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
[Codebase & Applet]         [GCP / Firebase]                 [GitHub]
- package.json: [DONE]       - Project ID:                    - Repo Name:
  "name": "publisense"         ai-studio-signalpulsepubli...    Settings -> General
- HTML & Head: [DONE]          (Immutable resource ID)        - Package Name: [DONE]
  Publisense — Meta/OG       - Display Name: [Ready]            "publisense"
- System Toasts: [DONE]        Update to "Publisense"         - Redirects:
  actorName: 'Publisense'      in GCP Cloud Console             Preserved by GitHub
- Storage Fallback: [DONE]   - Firebase Console: [Ready]
  publisense_ / crowdpulse_    Inherits GCP project title
- Account Deletion: [DONE]
  Settings Danger Zone
```

---

## 4. Verification & Operational Health

- **TypeScript Compilation**: `npm run lint` (`tsc --noEmit`) — **Passed (0 errors)**.
- **Vite Production Build**: `npm run build` (`vite build`) — **Passed (Built in 1.15s)**.
- **Dev Server Status**: Running on port 3000 with clean HMR.
- **Data Integrity**: Backward compatibility verified for theme preferences and profile caching.

---

## 5. External Platform Instructions (Web Consoles)

Follow these concise steps to update the external platform titles to match the codebase:

### 1. Google Cloud Platform (GCP)
1. Navigate to [Google Cloud IAM & Admin Settings](https://console.cloud.google.com/iam-admin/settings).
2. Ensure project `ai-studio-signalpulsepubli-2db5709d-d45c-4831-b6b4-1dc3a434ca31` is selected in the project picker.
3. In the **Project name** field, edit the name to **`Publisense`**.
4. Click **Save**.

### 2. Firebase Console
1. Open the [Firebase Console](https://console.firebase.google.com).
2. Select your project.
3. Click the gear icon (⚙️) next to Project Overview -> **Project settings**.
4. The project name will reflect the updated GCP name **`Publisense`** (or you may click the edit pencil to adjust it directly).

### 3. GitHub Repository
1. Navigate to your repository on [GitHub](https://github.com).
2. Click the **Settings** tab.
3. Under **General** > **Repository name**, enter **`publisense`**.
4. Click **Rename**. GitHub will immediately rename the repository and preserve redirect routes.
