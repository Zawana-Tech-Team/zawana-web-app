"""Regenerate database documentation from the project's Prisma schema (stdlib only)."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'backend/prisma/schema.prisma').read_text()
models = dict(re.findall(r'^model (\w+) \{\n(.*?)^\}', source, re.M | re.S))
enums = dict(re.findall(r'^enum (\w+) \{\n(.*?)^\}', source, re.M | re.S))
groups = {
    'Identity and authentication': 'User AuthIdentity AuthChallenge PendingRegistration AuthSession AuthRefreshToken AuthAbuseCounter AuthSecurityEvent',
    'Courts, bookings and attendance': 'Court CourtBlock CourtDateOverride HolidayRate Booking BookingSubmission BookingAttendance AttendanceModification BookingChangeHistory BookingCancellationRequest Coach PrivateCourse Class DeskMoveBatch PrivateRescheduleRequest BookingRescheduleRequest RescheduleRequestEvent',
    'Gym memberships and training': 'GymPackage GymPackageRevision GymEnrollment GymEnrollmentMember Membership MembershipPlan GymCheckIn PrivateTrainingSession GymSessionAttendance GymSessionDebit GymAuditLog',
    'Badminton packages and QR attendance': 'BadmintonPackageCategory BadmintonPackage BadmintonPackagePurchase BadmintonEnrollment BadmintonCheckIn BadmintonEntryQr BadmintonQrVisit BadmintonQrDeskSlot BadmintonQrRedemption PackageSecurityChallenge PackageSecurityAudit Student',
    'Payments and private course settlements': 'Transaction BookingRefund PaymentAttempt PrivateCoursePayment PrivateCourseSettlement PrivateCourseSettlementItem PrivateCourseAdjustment',
    'Clinic': 'Doctor Schedule Appointment',
    'Store and inventory': 'ProductCategory Product InventoryTransaction StoreOrder',
    'Cafe': 'CafeMenuItem CafeOrder CafeOrderItem',
    'Notifications and content': 'Notification NotificationRead ContentItem',
}
assigned = [n for names in groups.values() for n in names.split()]
assert len(assigned) == len(set(assigned)) and set(assigned) == set(models)
fields, relations = {}, []
for name, body in models.items():
    rows = []
    pk = set()
    for match in re.finditer(r'@@id\(\[([^]]+)\]', body):
        pk.update(x.strip() for x in match[1].split(','))
    fk = set()
    for line in body.splitlines():
        match = re.match(r'\s*(\w+)\s+(\w+)(\[\]|\?)?(.*)', line)
        if not match:
            continue
        field, typ, modifier, rest = match.groups()
        if typ in models:
            ref = re.search(r'fields:\s*\[([^]]+)\]', rest)
            if ref:
                keys = [x.strip() for x in ref[1].split(',')]
                fk.update(keys)
                unique = len(keys) == 1 and bool(re.search(r'^\s*' + keys[0] + r'\s+.*@(?:id|unique)\b', body, re.M))
                relations.append((typ, name, 'o|' if modifier == '?' else '||', 'o|' if unique else 'o{', ', '.join(keys)))
            continue
        rows.append((field, typ, modifier, rest))
    fields[name] = []
    for field, typ, modifier, rest in rows:
        tags = []
        if '@id' in rest or field in pk:
            tags.append('PK')
        if field in fk:
            tags.append('FK')
        if '@unique' in rest:
            tags.append('UK')
        comment = ' "nullable"' if modifier == '?' else ''
        fields[name].append(f'        {typ} {field}' + (' ' + ', '.join(tags) if tags else '') + comment)

# Prisma implements this relation with an implicit join table.
implicit = '    Coach }o--o{ PrivateCourse : "PrivateCourseCoaches (implicit join)"'
def diagram(selected, full=False):
    selected = set(selected)
    edges = [r for r in relations if full or r[0] in selected and r[1] in selected]
    if not full:
        # Include immediate external parents for context, without pulling in their other children.
        edges = [r for r in relations if r[1] in selected]
        selected.update(r[0] for r in edges)
    lines = ['erDiagram']
    for name in models:
        if name in selected:
            lines += ['    ' + name + ' {', *fields[name], '    }']
    lines += [f'    {a} {left}--{right} {b} : "{label}"' for a, b, left, right, label in edges]
    if {'Coach', 'PrivateCourse'} <= selected:
        lines.append(implicit)
    return '\n'.join(lines)

out = ROOT / 'docs/database'
out.mkdir(parents=True, exist_ok=True)
complete = diagram(models, True)
(out / 'complete-erd.mmd').write_text(complete + '\n')
doc = ['# Zawana database design', '',
       f'Generated from `backend/prisma/schema.prisma`: **{len(models)} models**, **{len(relations)} explicit relations**, and **1 implicit many-to-many relation**.', '',
       'The PostgreSQL schema has the same models as the SQLite schema; datasource configuration differs. This documents the declared design, rather than inspecting a live database.', '',
       '## Reading the diagrams', '',
       '- `PK`: primary key; `FK`: declared foreign key; `UK`: single-column unique key.',
       '- `||`: exactly one; `o|`: zero or one; `o{` / `}o`: zero or many.',
       '- Relationship labels name the child foreign-key column. Nullable columns are marked.',
       '- Each business-area diagram includes its models and immediate parent tables for context.',
       '- Composite primary keys are marked on every participating column. Composite unique constraints and indexes remain defined in the Prisma source.', '',
       '## Whole-project relationship map', '',
       'All models appear below, including standalone tables. For every scalar column, use [the complete ERD](complete-erd.mmd), or the business-area diagrams below. Open this Markdown in a Mermaid-enabled preview.', '', '```mermaid', 'erDiagram']
doc += ['    ' + name for name in models]
doc += [f'    {a} {left}--{right} {b} : "{label}"' for a, b, left, right, label in relations]
doc += [implicit, '```', '']
for title, names in groups.items():
    doc += ['## ' + title, '', '```mermaid', diagram(names.split()), '```', '']
doc += ['## References without declared foreign keys', '',
        'Only Prisma relations are drawn as edges. An `Id` suffix alone does not establish a foreign key. Examples:', '',
        '- `PaymentAttempt.resourceType/resourceId`, `Transaction.resourceType/resourceId`, notification entity references and audit entity references are generic references.',
        '- `Membership.packageId`, `BadmintonEnrollment.packageId/studentId`, and several staff, actor, creator and collector IDs are scalar values without declared relations.',
        '- `Booking` has no declared relation to `PrivateCourse` or `Class`. `MembershipPlan`, `Class`, `Student`, and `ContentItem` have no declared relations.',
        '- `StoreOrder.items` and `CafeOrder.items` store JSON; only cafe orders additionally declare normalized `CafeOrderItem` records.',
        '- `Coach` ↔ `PrivateCourse` uses the implicit Prisma join relation `PrivateCourseCoaches`; the generated join table is not an additional Prisma model.', '',
        '## Enum values', '', '| Enum | Values |', '| --- | --- |']
for name, body in enums.items():
    doc.append('| ' + name + ' | ' + ', '.join(body.split()) + ' |')
doc += ['', '## Regenerate', '', '```sh', 'python3 backend/scripts/generate-database-diagram.py', '```', '']
(out / 'README.md').write_text('\n'.join(doc))
print(f'Generated {len(models)} models, {len(relations)} explicit relations and 1 implicit relation.')
