const serverless = require("serverless-http");
const { createApp } = require("../backend/dist/app.js");

const app = createApp();
const run = serverless(app);

module.exports = async (req, res) => {
  const raw = req.url || "/";
  const stripped = raw.startsWith("/api") ? raw.slice(4) || "/" : raw;
  req.url = stripped;
  return run(req, res);
};
