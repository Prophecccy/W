export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { code, code_verifier, redirect_uri, refresh_token, grant_type } = body || {};

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "736056822803-7ik27j05kjdqtseuc1eujdbaahmrn21l.apps.googleusercontent.com";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.VITE_GOOGLE_CLIENT_SECRET;

    if (!clientSecret) {
      console.error("[api/token] GOOGLE_CLIENT_SECRET environment variable is missing on server.");
      return res.status(500).json({
        error: "server_configuration_error",
        error_description: "GOOGLE_CLIENT_SECRET is not configured in Vercel environment variables.",
      });
    }

    const params: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
    };

    if (grant_type === "refresh_token") {
      if (!refresh_token) {
        return res.status(400).json({
          error: "missing_refresh_token",
          error_description: "refresh_token is required for refresh_token grant",
        });
      }
      params.grant_type = "refresh_token";
      params.refresh_token = refresh_token;
    } else {
      if (!code || !code_verifier || !redirect_uri) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "code, code_verifier, and redirect_uri are required for authorization_code grant",
        });
      }
      params.grant_type = "authorization_code";
      params.code = code;
      params.code_verifier = code_verifier;
      params.redirect_uri = redirect_uri;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    const data = await tokenRes.json();
    return res.status(tokenRes.status).json(data);
  } catch (err: any) {
    console.error("[api/token] Token proxy execution error:", err);
    return res.status(500).json({
      error: "internal_error",
      error_description: err?.message || "Internal token proxy error",
    });
  }
}
