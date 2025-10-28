const spawn = require("child_process").spawn;
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

// Конфигурация репозиториев
const REPOSITORIES = require("./repository.json");

app.use(express.json());

// Middleware для логирования
app.use("/webhook", (req, res, next) => {
  console.log(`📨 Webhook received: ${req.method} ${req.path}`);
  console.log("🔑 X-Hub-Signature-256:", req.headers["x-hub-signature-256"]);
  console.log("🔑 X-Gogs-Signature:", req.headers["x-gogs-signature"]);
  console.log("🎯 GitHub Event:", req.headers["x-github-event"]);
  next();
});

// Функция проверки подписи SHA256
function verifySignature(secret, signature, payload) {
  if (!signature) {
    console.error("❌ No signature provided");
    return false;
  }

  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  console.log("🔐 Signature verification:");
  console.log("   Expected:", expectedSignature);
  console.log("   Received:", signature);

  // Сравниваем длины перед сравнением
  if (expectedSignature.length !== signature.length) {
    console.log("   Result: ❌ Invalid (length mismatch)");
    return false;
  }

  // Сравниваем подписи
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
    console.log("   Result:", isValid ? "✅ Valid" : "❌ Invalid");
    return isValid;
  } catch (error) {
    console.error("   Result: ❌ Invalid (comparison error)", error.message);
    return false;
  }
}

// Основной webhook endpoint с ручной проверкой
app.post("/webhook/:repository", (req, res) => {
  const repositoryParam = req.params.repository.replace("-", "/");

  console.log(`🔍 Processing webhook for: ${repositoryParam}`);

  // Находим конфигурацию репозитория
  const repoConfig = REPOSITORIES[repositoryParam];

  if (!repoConfig) {
    console.error(`❌ Repository not found: ${repositoryParam}`);
    return res.status(404).json({
      error: "Repository not found",
      availableRepositories: Object.keys(REPOSITORIES),
    });
  }

  console.log(`✅ Repository config found`);

  // Получаем подпись и тело запроса
  const signature =
    req.headers["x-hub-signature-256"] ?? req.headers["x-gogs-signature"];
  const rawBody = JSON.stringify(req.body);

  // Проверяем подпись
  if (repoConfig.verify) {
    if (!verifySignature(repoConfig.secret, signature, rawBody)) {
      console.error("❌ Signature verification failed");
      return res.status(401).json({
        error: "Signature verification failed",
        message: "X-Hub-Signature-256 or X-Gogs-Signature does not match",
      });
    }
    console.log("✅ Signature verified successfully");
  } else {
    console.log("✅ Signature verified skipped");
  }

  // Обрабатываем событие
  const event = req.headers["x-github-event"];

  switch (event) {
    case "push":
      console.log("🚀 Processing push event");
      handlePushEvent(req.body, repoConfig);
      break;
    case "ping":
      console.log("🏓 Processing ping event");
      return res
        .status(200)
        .json({ status: "pong", message: "Webhook is working" });
    default:
      console.log(`ℹ️  Ignoring event: ${event}`);
  }

  res.status(200).json({
    status: "success",
    message: "Webhook processed successfully",
    repository: repositoryParam,
    event: event,
  });
});

// Функция обработки push событий
function handlePushEvent(payload, repoConfig) {
  const repoName = payload.repository?.full_name || "unknown";
  const branch = payload.ref
    ? payload.ref.replace("refs/heads/", "")
    : "unknown";

  console.log(`🎯 Repository: ${repoName}`);
  console.log(`🌿 Branch: ${branch}`);
  console.log(`🎯 Target branch: ${repoConfig.branch}`);

  if (branch === repoConfig.branch) {
    console.log(`🚀 Starting deployment for ${repoConfig.projectName}...`);

    // Проверяем существование скрипта
    if (!fs.existsSync(repoConfig.deployScript)) {
      console.error(`❌ Deploy script not found: ${repoConfig.deployScript}`);
      return;
    }

    console.log(`📜 Executing script: ${repoConfig.deployScript}`);

    // Запускаем скрипт деплоя
    const deploy = spawn("bash", [repoConfig.deployScript], {
      env: {
        ...process.env,
        REPO_NAME: repoName,
        BRANCH: branch,
        PROJECT_NAME: repoConfig.projectName,
        DEPLOY_TIMESTAMP: Date.now().toString(),
        COMMIT_ID: payload.after || "unknown",
        COMMIT_MESSAGE: payload.head_commit?.message || "No message",
      },
    });

    deploy.stdout.on("data", (data) => {
      const output = data.toString().trim();
      console.log(`[${repoConfig.projectName}] 📝 ${output}`);
    });

    deploy.stderr.on("data", (data) => {
      const output = data.toString().trim();
      console.error(`[${repoConfig.projectName}] 💥 ${output}`);
    });

    deploy.on("close", (code) => {
      if (code === 0) {
        console.log(
          `[${repoConfig.projectName}] ✅ Deployment completed successfully`
        );

        // Логируем успешный деплой
        logDeployment(repoName, branch, "success", "Deployment completed");
      } else {
        console.error(
          `[${repoConfig.projectName}] ❌ Deployment failed with code ${code}`
        );
        logDeployment(
          repoName,
          branch,
          "failed",
          `Deployment script exited with code ${code}`
        );
      }
    });

    deploy.on("error", (error) => {
      console.error(
        `[${repoConfig.projectName}] 💣 Failed to start deploy script:`,
        error
      );
      logDeployment(repoName, branch, "error", error.message);
    });
  } else {
    console.log(
      `⏭️ Skipping deployment - branch ${branch} does not match ${repoConfig.branch}`
    );
  }
}

// Функция логирования деплоев
function logDeployment(repoName, branch, status, message) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    repository: repoName,
    branch: branch,
    status: status,
    message: message,
  };

  const logFile = "./deployments.log";

  try {
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n");
    console.log(`📊 Deployment logged: ${status}`);
  } catch (error) {
    console.error("❌ Failed to write deployment log:", error);
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    server: "GitHub Webhook Server",
    version: "1.0.0",
  });
});

// Endpoint для проверки конфигурации
app.get("/config", (req, res) => {
  const configInfo = Object.keys(REPOSITORIES).map((repo) => ({
    repository: repo,
    webhookPath: `/webhook/${repo.replace("/", "-")}`,
    hasSecret: !!REPOSITORIES[repo].secret,
    secretLength: REPOSITORIES[repo].secret.length,
    deployScript: REPOSITORIES[repo].deployScript,
    scriptExists: fs.existsSync(REPOSITORIES[repo].deployScript),
    branch: REPOSITORIES[repo].branch,
  }));

  res.json({
    status: "ok",
    repositories: configInfo,
  });
});

// Endpoint для тестирования подписи
app.post("/test-signature", (req, res) => {
  const { secret, signature, payload } = req.body;

  if (!secret || !signature || !payload) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ["secret", "signature", "payload"],
    });
  }

  const isValid = verifySignature(secret, signature, JSON.stringify(payload));

  res.json({
    valid: isValid,
    message: isValid ? "Signature is valid" : "Signature is invalid",
  });
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    availableRoutes: {
      GET: ["/health", "/config"],
      POST: [
        ...Object.keys(REPOSITORIES).map(
          (repo) => `/webhook/${repo.replace("/", "-")}`
        ),
        "/test-signature",
      ],
    },
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("💀 Server error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// Запуск сервера
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`🚀 GitHub Webhook Server started on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Config check: http://localhost:${PORT}/config`);
  console.log(`\n📋 Configured webhooks:`);

  Object.keys(REPOSITORIES).forEach((repo) => {
    const webhookPath = `/webhook/${repo.replace("/", "-")}`;
    console.log(`   POST http://localhost:${PORT}${webhookPath}`);
  });

  console.log(`\n🔧 Repository configuration:`);
  Object.keys(REPOSITORIES).forEach((repo) => {
    const config = REPOSITORIES[repo];
    console.log(`   📁 ${repo}`);
    console.log(`      Script: ${config.deployScript}`);
    console.log(`      Exists: ${fs.existsSync(config.deployScript)}`);
    console.log(`      Branch: ${config.branch}`);
    console.log(`      Secret: ${config.secret ? "✓ Set" : "✗ Missing"}`);
  });
});
