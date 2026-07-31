# Motiva Backend — NestJS REST API

The server-side layer for Motiva Admin & Subscriber Portal.
Stack: **NestJS · TypeScript · MongoDB (Mongoose) · Cloudinary · Pusher · JWT**

---

## Quick start

```bash
cd motiva-backend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, CLOUDINARY_*, PUSHER_* in .env

# 3. Run in development
npm run start:dev          # hot-reload on http://localhost:4000/api

# 4. Build for production
npm run build
npm run start:prod
```

The frontend reads `VITE_API_BASE_URL` — add this to the frontend's `.env`:
```
VITE_API_BASE_URL=http://localhost:4000/api
```

---

## Folder structure

```
motiva-backend/src/
  main.ts                      Entry point (Helmet, CORS, ValidationPipe, cookie-parser)
  app.module.ts                Root module

  auth/                        JWT auth — login, refresh, logout, 2FA, change password
    strategies/jwt.strategy.ts
    dto/
    auth.service.ts
    auth.controller.ts
    auth.module.ts

  users/                       User CRUD (SUPER_ADMIN only)
  clients/                     Client CRM + KYC Cloudinary upload + bulk import
  subscriptions/               Subscription CRUD + installment tracking
  payments/                    Payment recording + reversal + subscription amountPaid sync
  enquiries/                   Enquiry inbox + public POST (no auth, from website form)
  documents/                   Subscriber document upload (Cloudinary) + portal access
  project-updates/             Project progress updates + photo upload (Cloudinary)
  audit-log/                   Write-through audit trail on all mutations
  dashboard/                   Aggregated stats endpoint
  cloudinary/                  Global Cloudinary service with folder routing by category
  pusher/                      Global Pusher service + channel auth endpoint

  common/
    schemas/                   Mongoose schemas (User, Client, Subscription, Payment,
                               Enquiry, SubscriberDocument, ProjectUpdate, AuditLog)
    guards/                    JwtAuthGuard, RolesGuard, CapabilitiesGuard
    decorators/                @CurrentUser, @Roles, @Can
```

---

## API endpoints

### Auth  `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | — | Email + password → `{ user, accessToken }` + sets `motiva_rt` HttpOnly cookie |
| POST | `/register` | SUPER_ADMIN | Create a new user account |
| POST | `/refresh` | cookie | Rotate access + refresh tokens |
| POST | `/logout` | JWT | Clear refresh token |
| GET  | `/me` | JWT | Current user profile |
| PATCH | `/password` | JWT | Change password |
| POST | `/2fa/setup` | JWT | Generate TOTP secret + otpauth URL |
| POST | `/2fa/enable` | JWT | Verify TOTP token and enable 2FA |

### Users  `/api/users`
All routes require `users.manage` capability (SUPER_ADMIN).
`GET / GET :id / POST / PATCH :id / DELETE :id`

### Clients  `/api/clients`
Requires `clients.manage`.
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all clients (supports `?q=` search, `?status=`) |
| GET | `/:id` | Get single client |
| POST | `/` | Create client |
| PATCH | `/:id` | Update client |
| DELETE | `/:id` | Delete client |
| POST | `/import` | Bulk import `{ rows: Client[] }` |
| POST | `/:id/kyc/:field` | Upload KYC file (multipart `file`) — field: `idDocumentUrl`, `utilityBillUrl`, `passportPhotoUrl` |

### Subscriptions  `/api/subscriptions`
`GET / GET :id` — any authenticated user  
`POST / PATCH :id / DELETE :id` — requires `subscriptions.manage`  
Query filters: `?clientId= &status= &projectRef=`

### Payments  `/api/payments`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All non-reversed payments |
| GET | `/by-client/:clientId` | Payments for a client |
| GET | `/by-subscription/:id` | Payments for a subscription |
| POST | `/` | Record a payment (auto-advances `nextDueDate`) |
| POST | `/:id/reverse` | Reverse a payment (deducts from `amountPaid`) |

### Enquiries  `/api/enquiries`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/public` | — | Website contact form submission |
| GET | `/` | `enquiries.assign` | List enquiries (`?status= &assignedToId=`) |
| PATCH | `/:id` | `enquiries.assign` | Update status / assignee |
| DELETE | `/:id` | `clients.manage` | Delete enquiry |

### Documents  `/api/documents`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | `subscriptions.manage` | List all documents |
| GET | `/for-subscription/:id` | JWT | Documents for one subscription |
| GET | `/for-client/:id` | `clients.manage` | All docs for a client |
| POST | `/upload` | `subscriptions.manage` | Multipart upload → Cloudinary |
| DELETE | `/:id` | `subscriptions.manage` | Delete doc + remove from Cloudinary |
| GET | `/portal/my-documents` | SUBSCRIBER | Visibility-filtered document list |
| GET | `/portal/:id/download` | SUBSCRIBER | 1-hour signed Cloudinary URL |

### Project Updates  `/api/project-updates`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | All updates (`?projectRef=`) |
| GET | `/for-project/:ref` | — | Updates for a project ref |
| GET | `/for-client` | SUBSCRIBER | Updates for subscriber's subscribed projects |
| POST | `/` | `content.create` | Create update + upload photos (multipart `photos[]`) |
| POST | `/:id/photos` | `content.create` | Add photos to existing update |
| DELETE | `/:id` | `content.create` | Delete update + Cloudinary photos |

### Audit Log  `/api/audit-log`
`GET /` — requires `audit.view` — supports `?entityType= &entityId= &actorId=`

### Dashboard  `/api/dashboard/stats`
`GET /` — JWT — returns aggregated CRM stats.

### Pusher channel auth  `/api/pusher/auth`
`POST /` — JWT — authenticate Pusher private channels.

---

## Cloudinary folder structure

All files are uploaded under `motiva/{environment}/`:

| Category | Cloudinary folder | Resource type |
|----------|-------------------|---------------|
| `receipt` | `documents/receipts` | raw (PDF) |
| `offer_letter` | `documents/offer-letters` | raw |
| `title_deed` | `documents/title-deeds` | raw |
| `allocation` | `documents/allocations` | raw |
| `survey` | `documents/surveys` | raw |
| `kyc_id` | `kyc/id-documents` | auto |
| `kyc_utility` | `kyc/utility-bills` | auto |
| `kyc_photo` | `kyc/passport-photos` | image |
| `update_photo` | `updates/photos` | image |
| `video` | `updates/videos` | video |
| `other` | `other` | raw |

Every uploaded asset is tagged with `motiva`, `{category}`, and `{environment}` for easy filtering in the Cloudinary Media Library.

---

## Pusher channels

| Channel | Who subscribes | Events |
|---------|---------------|--------|
| `private-admin` | All admin users | Every entity event |
| `private-admin-clients` | Admin | `client.created/updated/deleted` |
| `private-admin-subscriptions` | Admin | `subscription.created/updated/deleted` |
| `private-admin-payments` | Admin | `payment.recorded/reversed` |
| `private-admin-enquiries` | Admin | `enquiry.created/updated/deleted` |
| `private-portal-{clientId}` | Subscriber | `payment.recorded`, `document.uploaded`, `subscription.updated` |
| `private-project-{projectRef}` | Admin + Subscribers | `update.posted/deleted` |

The Pusher auth endpoint (`POST /api/pusher/auth`) enforces role-based channel access.

---

## Environment variables

See `.env.example` for all required variables. Never commit `.env` to version control.

---

## Notes

- Sanity content resources (projects, properties, gallery, etc.) are **not** touched by this backend — they remain served directly from Sanity as before.
- The `documents.upload` endpoint requires `multipart/form-data` with field names: `file`, `subscriptionId`, `label`, `visibility`, `category`.
- The `project-updates` POST endpoint accepts `multipart/form-data` with `projectRef`, `projectRefType`, `text`, and optional `photos[]` files.
- Client KYC upload: `POST /api/clients/:id/kyc/:field` accepts `multipart/form-data` with a single `file` field.
