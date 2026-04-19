# NotarisOne Backend

This is the backend service for the NotarisOne platform, built with **Fastify.js**, **Prisma ORM**, and **TypeScript**.

## Prerequisites

- Node.js (v18+)
- MySQL or MariaDB Database
- Google Cloud Platform account (for OAuth, Cloud Storage, and Vision API if used)
- Xendit account (for payment gateway)
- Mailtrap account (for testing emails in development)

## Setup Instructions

### 1. Install Dependencies
Run the following command to install all required npm packages:
```bash
npm install
```

### 2. Environment Variables configuration
Create a `.env` file in the root of the `apps/backend` directory. You can copy the contents from `.env.example` if it exists. Your `.env` should include parameters like the following:

```env
# Database
DATABASE_URL="mysql://username:password@127.0.0.1:3306/notarisone"

# Authentication Secret (Used for JWT)
NEXTAUTH_SECRET="your-super-secret-string"

# Email Configuration (e.g., Mailtrap for testing)
SMTP_HOST="sandbox.smtp.mailtrap.io"
SMTP_PORT=2525
SMTP_USER="<your-mailtrap-user>"
SMTP_PASS="<your-mailtrap-pass>"
SMTP_FROM='"NotarisOne" <noreply@notarisone.com>'

# Google Workspace / OAuth Integration
GOOGLE_CLIENT_ID="<your-google-oauth-client-id>"
GOOGLE_CLIENT_SECRET="<your-google-oauth-client-secret>"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/callback/google"

# Xendit Payment Gateway
XENDIT_SECRET_KEY="<your-xendit-secret-key>"
XENDIT_WEBHOOK_TOKEN="<your-xendit-webhook-token>"
```

### 3. Database Setup

1. Make sure your MySQL/MariaDB database server is running.
2. Ensure you have created the `notarisone` database matching your `DATABASE_URL`.
3. Push the Prisma schema to sync your database structure:
```bash
npx prisma db push
```
4. (Optional) Run the database seed to populate initial data (like plans, roles, admin users):
```bash
npm run seed
# Note: Ensure you check the package.json seed script. It typically maps to `prisma/seed.ts`
```

### 4. Google Cloud Service Account
If your application uses Google Cloud Storage (for document repository) or Google Vision APIs:
Place your GCP credential JSON file at the workspace or backend root and ensure the relative path is accessible by the initialization logic. Make sure its details are kept secure and **not checked into version control**.

### 5. Running the API Server

#### Development
To start the Fastify server in development mode using `ts-node`:
```bash
npm run dev
```
The server usually runs on **http://localhost:3001** (or port specified in your code).

#### Production Build
To transcribe TypeScript code into standard JavaScript for production:
```bash
npm run build
```
This will compile the files using `tsc` to the output folder.

## Scripts Context
- `npm run dev` : Starts the app utilizing `ts-node` with memory allocation optimization (`--max-old-space-size=4096`) and path registrar.
- `npm run build` : Builds your TypeScript app into standard JS.

## Tech Stack Overview
- **Framework**: Fastify ^5.0
- **Database ORM**: Prisma 
- **Authentication**: JWT / bcryptjs
- **Emails**: Nodemailer
- **Payments**: Xendit Node SDK
- **File Uploads**: @fastify/multipart & Google Cloud Storage
