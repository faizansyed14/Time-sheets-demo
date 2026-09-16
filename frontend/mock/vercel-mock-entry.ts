import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runMockOnVercel } from "./vercelHandler";

export default function handler(req: VercelRequest, res: VercelResponse) {
  runMockOnVercel(req, res);
}

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};
