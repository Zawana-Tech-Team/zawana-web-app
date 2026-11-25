# Coach management

The Admin coach route uses a dedicated roster and profile editor. Cards emphasize coach name, photo/initials, coaching area, contact details and active/inactive profile status. Promotional copy, repeated department labels and unconditional availability claims are removed. Search, status filtering and visible 12-profile pagination support finding a coach. The navigation entry is labelled Coaches.

Create and Edit share responsive dialogs with a fixed Cancel/Save footer, explicit account/name/phone/area/status labels and a visible profile image uploader. Creating a profile links an existing active Coach account and prefills its name/phone. Manage accounts and the empty-account helper retain access to account creation. All coach-account pages are read for the picker; unavailable accounts are excluded for new links. Existing custom coaching areas and current linked emails remain visible during edits.

Saves retain the existing coach APIs, department assignment, validation and image storage. An unchanged email is omitted from edits so contact/image/status updates do not unnecessarily relink the account. Busy/upload guards prevent accidental closing and repeated submissions. Save errors remain in the dialog with the draft retained. Successful mutations close before refreshing; refresh failures offer Retry without repeating the mutation.

Deletion retains an explicit confirmation and the existing permanent profile-delete endpoint. The account is managed separately in User Management. Court management uses its previous component; this change adds no schema, booking or scheduling rules.

The isolated coach-management browser journey covers real profile creation/edit/deletion, active-account linking, duplicate-submit protection, failure/retry, retained form input, image upload/preservation/removal, search/status/pagination, existing booking/course preservation and 320/390/768/1440px views. It is included in CI and the stabilization browser runner. Frontend build and stabilization lint also pass.
