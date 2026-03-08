# Property Management Application

A full-stack property management system with email integration, issue tracking, and task management.

## Features

- 📧 Email thread management with Microsoft Graph integration
- 🏢 Association and property management
- 👥 Contact management with import/export
- 📋 Issue and task tracking
- 📞 Call logging
- 🔐 User authentication with role-based access
- 📊 Activity logging and audit trails

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, Radix UI
- **Backend**: Node.js, Express 5, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with local and Microsoft strategies
- **Real-time**: WebSocket support

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- PostgreSQL 14.x or higher
- npm or yarn

### Installation

1. Clone the repository
   ```bash
   git clone <your-repo-url>
   cd property-management-app
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Set up the database
   ```bash
   # Create a PostgreSQL database
   createdb propertymanagement
   
   # Push schema to database
   npm run db:push
   ```

5. Start development server
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5000`

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes

### Project Structure

```
├── client/              # React frontend
│   └── src/
├── server/              # Express backend
│   ├── routes.ts        # API routes
│   ├── storage.ts       # Database layer
│   └── services/        # Business logic
├── shared/              # Shared types and schemas
│   └── schema.ts        # Database schema
├── infrastructure/      # Infrastructure as Code
│   └── terraform/       # Terraform configurations
└── dist/                # Production build output
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed AWS deployment instructions.

### Quick Deploy Options

1. **Elastic Beanstalk** (Easiest)
   - Push to main branch triggers automatic deployment
   - Managed scaling and load balancing

2. **ECS/Fargate** (Recommended for production)
   - Container-based deployment
   - Better isolation and scaling

3. **Docker**
   ```bash
   docker build -t property-management .
   docker run -p 5000:5000 -e DATABASE_URL=<url> property-management
   ```

## Environment Variables

See `.env.example` for all available configuration options.

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret key for session encryption

### Optional
- `MICROSOFT_TENANT_ID` - For Microsoft Graph integration
- `MICROSOFT_CLIENT_ID` - Microsoft app client ID
- `MICROSOFT_CLIENT_SECRET` - Microsoft app secret
- `ALLOWED_EMAIL_DOMAIN` - Restrict login to specific domain

## Database Schema

The application uses PostgreSQL with the following main entities:

- Users and authentication
- Mailboxes and email threads
- Associations, properties, and units
- Contacts with phones and emails
- Issues and tasks
- Activity logs

Run `npm run db:push` to sync schema changes to your database.

## API Documentation

API endpoints are available under `/api`:

- `/api/auth/*` - Authentication endpoints
- `/api/users/*` - User management
- `/api/contacts/*` - Contact management
- `/api/issues/*` - Issue tracking
- `/api/tasks/*` - Task management
- `/api/threads/*` - Email thread management

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open a GitHub issue.
