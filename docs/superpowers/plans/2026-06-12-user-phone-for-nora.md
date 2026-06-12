# User Phone for Nora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add normalized phone numbers to internal users so Nora can later identify users by WhatsApp phone.

**Architecture:** Store `phone` as nullable text on `User` for backward compatibility, while API/UI require international-format phone for admin-created or edited users. Extend the existing users module and `/users` page without changing login, JWT, or Nora runtime routing yet.

**Tech Stack:** Prisma schema/migrations/seed, NestJS DTO/service/controller tests, Next.js App Router, React client component, Jest/Supertest, Next build.

---

## File Structure

- Modify `apps/api/prisma/schema.prisma`: add nullable `phone` to `User`.
- Create `apps/api/prisma/migrations/20260612100000_user_phone_for_nora/migration.sql`: adds nullable `phone` column.
- Modify `apps/api/prisma/seed.ts`: adds demo phone values to seeded users.
- Modify `apps/api/src/modules/users/dto/create-user.dto.ts`: adds required phone validation.
- Modify `apps/api/src/modules/users/dto/update-user.dto.ts`: adds optional phone validation.
- Modify `apps/api/src/modules/users/users.service.ts`: selects, creates, and updates phone.
- Modify `apps/api/test/users.e2e-spec.ts`: covers phone list/create/update/invalid cases.
- Modify `apps/web/src/components/users/types.ts`: adds `phone`.
- Modify `apps/web/src/components/users/user-management-client.tsx`: adds create/edit/display phone UI.

---

### Task 1: Prisma Schema, Migration, and Seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260612100000_user_phone_for_nora/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: Add nullable phone to Prisma User**

In `apps/api/prisma/schema.prisma`, update the `User` model:

```prisma
model User {
  id                            String                     @id @default(cuid())
  name                          String
  email                         String                     @unique
  phone                         String?
  passwordHash                  String
  role                          UserRole
  active                        Boolean                    @default(true)
  createdAt                     DateTime                   @default(now())
  updatedAt                     DateTime                   @updatedAt
  assignedCustomers             Customer[]                 @relation("CustomerAssignedUser")
  assignedOrders                Order[]
  createdReports                ExecutiveReport[]
  lauraSessions                 LauraSession[]
  assignedWhatsAppConversations WhatsAppConversation[]     @relation("WhatsAppAssignedUser")
  whatsappMessages              WhatsAppMessage[]          @relation("WhatsAppMessageAuthor")
  whatsappInternalNotes         WhatsAppInternalNote[]
  noraActions                   NoraActionLog[]
  submittedCommercialExpenses   CommercialExpense[]        @relation("CommercialExpenseSubmitter")
  reviewedCommercialExpenses    CommercialExpense[]        @relation("CommercialExpenseReviewer")
  uploadedExpenseSupports       CommercialExpenseSupport[] @relation("CommercialExpenseSupportUploader")
  uploadedPaymentSupports       PaymentSupport[]
}
```

- [ ] **Step 2: Add migration**

Create `apps/api/prisma/migrations/20260612100000_user_phone_for_nora/migration.sql`:

```sql
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
```

- [ ] **Step 3: Add seed phone values**

In `apps/api/prisma/seed.ts`, update the `users` array so every object includes a valid `phone`:

```ts
const users = [
  { id: user_admin, name: "Administrador", email: "admin@norgtech.com", phone: "+573001000001", password: "Admin123!", role: UserRole.administrador },
  { id: user_director, name: "Carlos Mendoza", email: "director@norgtech.com", phone: "+573001000002", password: "Director123!", role: UserRole.director_comercial },
  { id: user_comercial, name: "Laura Torres", email: "comercial@norgtech.com", phone: "+573001000003", password: "Comercial123!", role: UserRole.comercial },
  { id: user_tecnico, name: "Andres Rojas", email: "tecnico@norgtech.com", phone: "+573001000004", password: "Tecnico123!", role: UserRole.tecnico },
  { id: user_facturacion, name: "Diana Vargas", email: "facturacion@norgtech.com", phone: "+573001000005", password: "Facturacion123!", role: UserRole.facturacion },
  { id: user_logistica, name: "Pedro Gomez", email: "logistica@norgtech.com", phone: "+573001000006", password: "Logistica123!", role: UserRole.logistica },
];
```

Update the `upsert` immediately below so `phone` is written on both update and create:

```ts
await prisma.user.upsert({
  where: { email: user.email },
  update: { name: user.name, phone: user.phone, passwordHash, role: user.role, active: true },
  create: { id: user.id, name: user.name, email: user.email, phone: user.phone, passwordHash, role: user.role, active: true },
});
```

- [ ] **Step 4: Run Prisma validation**

Run:

```bash
pnpm --filter @norgtech/api exec prisma validate --schema prisma/schema.prisma
```

Expected: schema validates successfully.

- [ ] **Step 5: Commit schema work**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260612100000_user_phone_for_nora/migration.sql apps/api/prisma/seed.ts
git commit -m "feat(api): add user phone field"
```

---

### Task 2: API Phone Validation and Tests

**Files:**
- Modify: `apps/api/src/modules/users/dto/create-user.dto.ts`
- Modify: `apps/api/src/modules/users/dto/update-user.dto.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`
- Modify: `apps/api/test/users.e2e-spec.ts`

- [ ] **Step 1: Update test mock type and public select**

In `apps/api/test/users.e2e-spec.ts`, add `phone` to `MockUser`:

```ts
type MockUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

Add `phone: true` to the test `publicUserSelect`:

```ts
const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies MockUserSelect;
```

Update `lastCreateArgs` data type:

```ts
data: { name: string; email: string; phone: string; passwordHash: string; role: UserRole; active: boolean };
```

Update the `create` mock data parameter similarly and include `phone: data.phone` in `created`.

Add phones to seeded mock users:

```ts
phone: "+573001000003",
```

for `commercial-id`, and:

```ts
phone: "+573001000001",
```

for `admin-id`.

- [ ] **Step 2: Update API tests for phone behavior**

In the list test, add phone assertions:

```ts
expect(response.body[0]).toMatchObject({
  email: "admin@norgtech.com",
  phone: "+573001000001",
  role: "administrador",
});
expect(response.body.every((user: { phone?: unknown }) => typeof user.phone === "string")).toBe(true);
```

In the create test payload, include phone:

```ts
.send({ name: "Diana Facturacion", email: "DIANA@NORGTECH.COM ", phone: " +573001000007 ", role: "facturacion" })
```

and assert:

```ts
expect(createResponse.body.user).toMatchObject({
  name: "Diana Facturacion",
  email: "diana@norgtech.com",
  phone: "+573001000007",
  role: "facturacion",
  active: true,
});
expect(lastCreateArgs?.data.phone).toBe("+573001000007");
```

In the successful update test, include phone:

```ts
.send({ name: "Comercial Senior", phone: "+573001000008", role: "director_comercial", active: false })
```

and assert:

```ts
expect(response.body).toMatchObject({
  id: "commercial-id",
  name: "Comercial Senior",
  phone: "+573001000008",
  role: "director_comercial",
  active: false,
});
expect(lastUpdateArgs?.data.phone).toBe("+573001000008");
```

Add invalid phone tests:

```ts
it("rejects invalid phone on create", async () => {
  const token = await login("admin@norgtech.com");

  await request(app.getHttpServer())
    .post("/users")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Invalid Phone", email: "invalid-phone@norgtech.com", phone: "3001000007", role: "comercial" })
    .expect(400);
});

it("rejects invalid phone on update", async () => {
  const token = await login("admin@norgtech.com");

  await request(app.getHttpServer())
    .patch("/users/commercial-id")
    .set("Authorization", `Bearer ${token}`)
    .send({ phone: "3001000008" })
    .expect(400);
});
```

- [ ] **Step 3: Run tests to verify they fail before implementation**

Run:

```bash
pnpm --filter @norgtech/api test -- users.e2e-spec.ts
```

Expected: FAIL because DTO/service do not accept or return `phone` yet.

- [ ] **Step 4: Update DTO validation**

In `apps/api/src/modules/users/dto/create-user.dto.ts`, add:

```ts
const internationalPhonePattern = /^\+[1-9]\d{9,14}$/;
```

and add to `CreateUserDto`:

```ts
@Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
@IsString()
@IsNotEmpty()
@Matches(internationalPhonePattern)
phone!: string;
```

In `apps/api/src/modules/users/dto/update-user.dto.ts`, import `Transform`, add the same pattern, and add:

```ts
@Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
@IsOptional()
@IsString()
@Matches(internationalPhonePattern)
phone?: string;
```

- [ ] **Step 5: Update users service**

In `apps/api/src/modules/users/users.service.ts`, add `phone` to `publicUserSelect`:

```ts
phone: true,
```

In `create`, include:

```ts
phone: dto.phone.trim(),
```

In `update`, include:

```ts
...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
```

- [ ] **Step 6: Run API tests**

Run:

```bash
pnpm --filter @norgtech/api test -- users.e2e-spec.ts auth.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit API phone behavior**

```bash
git add apps/api/src/modules/users/dto/create-user.dto.ts apps/api/src/modules/users/dto/update-user.dto.ts apps/api/src/modules/users/users.service.ts apps/api/test/users.e2e-spec.ts
git commit -m "feat(api): require phone for managed users"
```

---

### Task 3: Web User Phone UI

**Files:**
- Modify: `apps/web/src/components/users/types.ts`
- Modify: `apps/web/src/components/users/user-management-client.tsx`

- [ ] **Step 1: Update web type**

In `apps/web/src/components/users/types.ts`, add:

```ts
phone: string | null;
```

so the full interface is:

```ts
export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add create phone state and payload**

In `apps/web/src/components/users/user-management-client.tsx`, add state near `email`:

```ts
const [phone, setPhone] = useState("");
```

In `handleCreateUser`, include phone:

```ts
phone: phone.trim(),
```

After a successful create, reset:

```ts
setPhone("");
```

- [ ] **Step 3: Add draft phone state and sync**

Add state:

```ts
const [draftPhones, setDraftPhones] = useState<Record<string, string>>({});
```

Update the sync effect:

```ts
useEffect(() => {
  setDraftPhones(
    initialUsers.reduce<Record<string, string>>((acc, user) => {
      acc[user.id] = user.phone ?? "";
      return acc;
    }, {}),
  );
}, [initialUsers]);
```

When a user is created, add:

```ts
setDraftPhones((current) => ({
  ...current,
  [createdUser.id]: createdUser.phone ?? "",
}));
```

When `patchUser` returns `updatedUser`, add:

```ts
setDraftPhones((current) => ({
  ...current,
  [userId]: updatedUser.phone ?? "",
}));
```

- [ ] **Step 4: Allow patching phone**

Change `patchUser` body type to:

```ts
Partial<Pick<ManagedUser, "name" | "phone" | "role" | "active">>
```

Add handler:

```ts
async function handlePhoneBlur(user: ManagedUser) {
  if (isPending(user.id)) {
    return;
  }

  const draftValue = draftPhones[user.id] ?? user.phone ?? "";
  const trimmedPhone = draftValue.trim();

  if (!trimmedPhone) {
    setDraftPhones((current) => ({
      ...current,
      [user.id]: user.phone ?? "",
    }));
    return;
  }

  if (trimmedPhone === (user.phone ?? "")) {
    if (draftValue !== (user.phone ?? "")) {
      setDraftPhones((current) => ({
        ...current,
        [user.id]: user.phone ?? "",
      }));
    }
    return;
  }

  const updatedUser = await patchUser(user.id, { phone: trimmedPhone });
  if (!updatedUser) {
    setDraftPhones((current) => ({
      ...current,
      [user.id]: user.phone ?? "",
    }));
  }
}
```

- [ ] **Step 5: Add create phone input**

Change the create form grid from `md:grid-cols-3` to `md:grid-cols-4`.

Add this field between email and role:

```tsx
<div className="grid gap-1">
  <Label htmlFor="user-phone">Telefono</Label>
  <Input
    id="user-phone"
    name="phone"
    type="tel"
    value={phone}
    onChange={(event) => setPhone(event.target.value)}
    placeholder="+573001234567"
    pattern="^\\+[1-9]\\d{9,14}$"
    required
  />
</div>
```

- [ ] **Step 6: Add phone column to table**

In table header, add after Email:

```tsx
<TableHead>Telefono</TableHead>
```

In each row, add after the Email cell:

```tsx
<TableCell className="align-top">
  <Input
    value={draftPhones[user.id] ?? user.phone ?? ""}
    onChange={(event) =>
      setDraftPhones((current) => ({
        ...current,
        [user.id]: event.target.value,
      }))
    }
    onBlur={() => void handlePhoneBlur(user)}
    disabled={pending}
    placeholder="+573001234567"
    aria-label={`Telefono de ${user.email}`}
  />
</TableCell>
```

- [ ] **Step 7: Run web build**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 8: Commit web phone UI**

```bash
git add apps/web/src/components/users/types.ts apps/web/src/components/users/user-management-client.tsx
git commit -m "feat(web): manage user phone numbers"
```

---

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Validate Prisma schema**

Run:

```bash
pnpm --filter @norgtech/api exec prisma validate --schema prisma/schema.prisma
```

Expected: PASS.

- [ ] **Step 2: Run focused API tests**

Run:

```bash
pnpm --filter @norgtech/api test -- users.e2e-spec.ts auth.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run web build**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS and `/users` remains in route list.

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: only intentional changes committed. The unrelated untracked `GASTOS SEMANA 18-19 OTROS.xlsx` may remain.
