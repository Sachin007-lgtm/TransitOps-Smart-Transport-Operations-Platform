# TransitOps: Smart Transport Operations Platform

TransitOps is a fleet management and transport operations platform. It contains a Vite and React client for the user interface and a Node.js and Express server connecting to a PostgreSQL database.

## Project Structure

- `client/`: React frontend application built with Vite.
- `server/`: Express API backend application.

## Prerequisites

- Node.js (version 18 or higher)
- PostgreSQL database instance (local or hosted, such as Neon Postgres)

## Environment Configuration

### Backend Configuration
Create a `.env` file in the `server/` directory using the provided `server/.env.example` template:

```env
PORT=5001
DATABASE_URL=your_postgresql_database_url
JWT_SECRET=your_jwt_signing_secret
```

### Frontend Configuration
Create a `.env` file in the `client/` directory:

```env
VITE_API_URL=http://localhost:5001/api
```

## Database Setup

Initialize the schema and seed initial role and user data. Run the following command inside the `server/` directory:

```bash
cd server
npm install
npm run db:migrate
```

This runs the migration SQL scripts and inserts the default roles, users, vehicles, and drivers into the database.

## Running the Application

### 1. Start the Backend API
Run this command from the `server/` directory:

```bash
npm run dev
```
The server will run on http://localhost:5001.

### 2. Start the Frontend client
Run these commands from the `client/` directory:

```bash
npm install
npm run dev
```
The client will run on http://localhost:5173.

