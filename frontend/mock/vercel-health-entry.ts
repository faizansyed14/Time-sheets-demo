import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runMockOnVercel } from "./vercelHandler";

export default function handler(req: VercelRequest, res: VercelResponse) {
  (req as VercelRequest & { url?: string }).url = "/health";
  runMockOnVercel(req, res);
}

export const config = {
  api: { bodyParser: false },
};
