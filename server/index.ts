import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { startSyncScheduler } from "./services/mailboxSyncScheduler";
import { createServer } from "http";
import { storage } from "./storage";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function seedTypeLabels() {
  const existing = await storage.getTypeLabels();
  if (existing.length > 0) return;
  const defaults = [
    { category: "issue_type", name: "Maintenance", sortOrder: 0 },
    { category: "issue_type", name: "Violation", sortOrder: 1 },
    { category: "issue_type", name: "Request", sortOrder: 2 },
    { category: "issue_type", name: "Billing", sortOrder: 3 },
    { category: "issue_type", name: "General", sortOrder: 4 },
    { category: "task_type", name: "Follow-up", sortOrder: 0 },
    { category: "task_type", name: "Inspection", sortOrder: 1 },
    { category: "task_type", name: "Repair", sortOrder: 2 },
    { category: "task_type", name: "Administrative", sortOrder: 3 },
    { category: "task_type", name: "Communication", sortOrder: 4 },
    { category: "task_type", name: "General", sortOrder: 5 },
  ];
  for (const d of defaults) {
    await storage.createTypeLabel({ ...d, isActive: true });
  }
  console.log("[seed] type_labels seeded with defaults");
}

(async () => {
  await registerRoutes(httpServer, app);
  await seedTypeLabels();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  startSyncScheduler();

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
