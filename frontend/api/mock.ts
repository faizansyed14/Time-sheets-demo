import type { IncomingMessage, ServerResponse } from "http";
import { mockMiddleware } from "../mock/router";

/** Vercel Hobby serverless — same mock as Vite middleware (free tier, no paid server). */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  mockMiddleware(req, res, () => {
    if (!res.headersSent) {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
};
