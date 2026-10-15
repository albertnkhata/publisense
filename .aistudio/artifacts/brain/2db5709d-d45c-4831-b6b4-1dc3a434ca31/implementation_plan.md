# User Account Deletion & Content Anonymization

Provide users with the ability to permanently delete their account through a dedicated Danger Zone in Settings, protected by explicit confirmation requiring the user to type a confirmation phrase, while safely anonymizing their contributions to keep public community feedback and discussion threads coherent and intact.

## User Review & Critical Decisions

> [!IMPORTANT]
> In Phase 1, the user confirmed three fundamental architectural choices for account deletion:
> 1. **Content Handling**: Anonymize existing feedback items and comments (attributed to "Deleted User" with `@deleted` handle) rather than hard-purging them, keeping public threads and roadmap discussions intact.
> 2. **Placement**: Accessible within a dedicated "Danger Zone" in the **Settings** view with an explicit modal confirmation.
> 3. **Confirmation Gate**: High-friction confirmation requiring the user to type a designated confirmation phrase (`delete my account`) before enabling the deletion action.

- **Confirmed Decision 1**: Upon account deletion, the user's personal identity records (Firestore `users/{userId}` and Firebase Auth credentials) are permanently deleted.
- **Confirmed Decision 2**: All feedback submissions and comment replies authored by the user are transformed to display an anonymized "Deleted User" state, preserving community voting counts and discussion context.
- **Confirmed Decision 3**: The user is unlinked from any organization roles or claimed company rosters, all targeted notifications are cleared, and local browser session storage is completely reset.

---

## 1. Overview & Core Concept

- **What It Does**: Enables users to self-serve complete account deletion from the Settings page. Initiating deletion opens a safety dialog outlining the permanent consequences. The user must type the exact confirmation phrase to proceed. Upon execution, credentials and user records are deleted, contributions are anonymized, organizations are unlinked, and the session is cleared back to a clean guest state.
- **Target Audience / Persona**: Any registered user (standard contributors, team members, or company managers) who wishes to permanently remove their personal details, email, credentials, and profile from the platform in compliance with data privacy expectations.
- **Key Value**: Delivers complete data privacy control and account sovereignty while maintaining community integrity and preventing broken threads or orphan reference errors across the roadmap.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Navigating to Danger Zone**:
   - The user opens their **Settings** view (`/#settings`).
   - Below Theme Preferences and Notification Controls, a new **Danger Zone** section is presented with subtle warning aesthetics (subtle crimson hairline border, clear descriptive text).
   - A distinct "Delete Account" button opens the verification modal.

2. **Confirmation Modal Interaction**:
   - The modal reveals a prominent warning explaining that deletion is permanent and cannot be undone.
   - It enumerates what happens:
     - Profile details and login credentials will be permanently erased.
     - Notifications and personal interactions will be cleared.
     - Feedback posts and comments will remain readable but will be anonymized to "Deleted User".
   - The user is required to type the phrase: `delete my account` in a text input.
   - The "Permanently Delete Account" button remains disabled until the phrase matches exactly.

3. **Execution & Feedback**:
   - While processing, the button transitions into a loading spinner with progress indicator text ("Deleting account & anonymizing contributions...").
   - Upon completion, the modal closes, local session storage is cleared, the Firebase Auth session is terminated, and the user is redirected to the Home feed with a transient toast confirming successful deletion.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian, enterprise-grade dark/light styling consistent with the existing application theme tokens.
- **Color Palette & Accents**:
  - Danger Zone surface: Light theme uses crisp white with a subtle red hairline border (`border-red-200 dark:border-red-950/60`); dark theme uses deep zinc background with subdued red warning tones (`bg-red-500/5 dark:bg-red-950/10`).
  - Action button: Solid high-contrast destructive button (`bg-red-600 hover:bg-red-700 text-white`).
- **Typography & Hierarchy**:
  - Clear section title ("Danger Zone") with quiet metadata description.
  - The confirmation requirement displays the phrase in bold monospace (`font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-red-600 dark:text-red-400`).

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Anonymization vs Cascading Deletion
- **Chosen Approach**: Retain submitted feedback items and replies while replacing author details with a standardized anonymous entity (`name: 'Deleted User'`, `handle: '@deleted'`, neutral avatar).
- **Why**: Cascading deletion of entire feedback posts would break upvote counts, roadmap priority rankings, and threaded team replies on active company roadmaps. Anonymization respects personal privacy without destroying shared community value.
- **Alternatives Considered**: Hard-deleting all user items (leads to sudden disappearance of active feature requests and orphan replies).

### Decision 2: Phrase-Based Confirmation Input
- **Chosen Approach**: Require user to manually type `delete my account`.
- **Why**: Prevents accidental clicks or muscle-memory confirmation dialog dismissals for an irreversible action.
- **Alternatives Considered**: Simple checkbox or one-click alert (too prone to accidental clicks).

### Decision 3: Organization Role Disassociation
- **Chosen Approach**: If the deleting user is a verified member or claimant of a company, remove them from `verifiedMembers`. If they are the primary claimant, the claim is vacated so the organization can be reclaimed by authorized personnel.
- **Why**: Prevents deleted user IDs from lingering on company administrative rosters.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ACCOUNT DELETION PIPELINE                       │
└────────────────────────────────────────────────────────────────────────┘
                                   │
              User clicks "Delete Account" in Settings
                                   │
                                   ▼
              [DeleteAccountModal] phrase validation:
                       "delete my account"
                                   │ (confirmed)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        executeAccountDeletion()                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Anonymize Feedback Items:                                           │
│    - Scan feedback where author.id === user.id or handle === user.handle│
│    - Replace author with { name: 'Deleted User', handle: '@deleted' }  │
│                                                                        │
│ 2. Anonymize Comments:                                                 │
│    - Update comment author records on all feedback items               │
│                                                                        │
│ 3. Disassociate Organizations:                                         │
│    - Remove user from company verifiedMembers & claimant fields        │
│                                                                        │
│ 4. Clear User Notifications:                                           │
│    - Delete user notifications from Firestore collection               │
│                                                                        │
│ 5. Delete Firestore User Document:                                     │
│    - deleteDoc(doc(db, 'users', userId))                               │
│                                                                        │
│ 6. Delete Firebase Auth User:                                          │
│    - deleteUser(auth.currentUser) with fallback signOut                │
│                                                                        │
│ 7. Purge Client Storage & Session:                                     │
│    - Clear crowdpulse_* keys from localStorage                         │
│    - Dispatch crowdpulse_auth_state_change (null)                      │
│    - Navigate back to Home view with success toast                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Updates

- **Firestore Collections Mutated**:
  - `users/{userId}`: Document deleted via `deleteDoc`.
  - `feedback/{feedbackId}`: Author and comment author fields updated to anonymous profile.
  - `companies/{companyId}`: Removed from `verifiedMembers` and `claimedById`.
  - `notifications/{notificationId}`: Deleted for matching user.
- **Local Storage Keys Cleared**:
  - `crowdpulse_current_user`, `crowdpulse_active_handle`, `crowdpulse_profile_*`, `crowdpulse_upvoted_ids_*`, `crowdpulse_reposted_ids_*`, `crowdpulse_followed_products_*`, `crowdpulse_followed_users_*`.
- **UI Components Created/Modified**:
  - `src/components/DeleteAccountModal.tsx`: Dedicated modal with safety warnings, phrase validation input, progress indicator, and error messaging.
  - `src/components/SettingsPage.tsx`: Danger Zone card section with account deletion trigger.
  - `src/lib/authService.ts`: Core `deleteUserAccount` routine orchestrating Firestore mutations, Auth deletion, and session purge.
  - `src/App.tsx`: State connection handling completion toast and view reset.
