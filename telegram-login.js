// One-time interactive Telegram login, driven as discrete non-interactive steps
// (rather than a live TTY prompt) so it can be run from a scripted environment:
//
//   node telegram-login.js phone "+46736768430"
//   node telegram-login.js code "12345"          # code Telegram just sent you
//   node telegram-login.js password "hunter2"    # only if 2FA is enabled on the account
//
// State is carried between steps in DATA_DIR/telegram_login_state.json. On success the
// final step writes DATA_DIR/session.txt, which is all the main service needs.

import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { TelegramClient, Api, password as passwordModule } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const { TELEGRAM_API_ID, TELEGRAM_API_HASH, DATA_DIR = "./data" } = process.env;
const apiId = Number(TELEGRAM_API_ID);
const apiHash = TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.");
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });

const statePath = join(DATA_DIR, "telegram_login_state.json");
const sessionPath = join(DATA_DIR, "session.txt");

const [, , step, value] = process.argv;

function loadState() {
  if (!existsSync(statePath)) {
    console.error(`No login in progress. Start with: node telegram-login.js phone "+46..."`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function saveState(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function withClient(sessionString, fn) {
  const client = new TelegramClient(new StringSession(sessionString || ""), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

if (step === "phone") {
  if (!value) {
    console.error(`Usage: node telegram-login.js phone "+46736768430"`);
    process.exit(1);
  }
  await withClient("", async (client) => {
    const result = await client.sendCode({ apiId, apiHash }, value);
    saveState({
      phoneNumber: value,
      phoneCodeHash: result.phoneCodeHash,
      sessionString: client.session.save(),
    });
    console.log(`Code sent (${result.isCodeViaApp ? "via Telegram app" : "via SMS"}).`);
    console.log(`Next: node telegram-login.js code "12345"`);
  });
} else if (step === "code") {
  if (!value) {
    console.error(`Usage: node telegram-login.js code "12345"`);
    process.exit(1);
  }
  const state = loadState();
  await withClient(state.sessionString, async (client) => {
    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: state.phoneNumber,
          phoneCodeHash: state.phoneCodeHash,
          phoneCode: value,
        })
      );
      writeFileSync(sessionPath, client.session.save(), "utf8");
      unlinkSync(statePath);
      console.log(`Logged in as ${result.user.firstName || result.user.username || "you"}.`);
      console.log(`Session saved to ${sessionPath}. No further steps needed.`);
    } catch (err) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        saveState({ ...state, sessionString: client.session.save() });
        console.log("This account has 2FA enabled.");
        console.log(`Next: node telegram-login.js password "your2FApassword"`);
      } else {
        throw err;
      }
    }
  });
} else if (step === "password") {
  if (!value) {
    console.error(`Usage: node telegram-login.js password "your2FApassword"`);
    process.exit(1);
  }
  const state = loadState();
  await withClient(state.sessionString, async (client) => {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const passwordSrpCheck = await passwordModule.computeCheck(passwordInfo, value);
    await client.invoke(new Api.auth.CheckPassword({ password: passwordSrpCheck }));
    writeFileSync(sessionPath, client.session.save(), "utf8");
    unlinkSync(statePath);
    console.log(`Logged in with 2FA. Session saved to ${sessionPath}. No further steps needed.`);
  });
} else {
  console.error(`Usage:
  node telegram-login.js phone "+46736768430"
  node telegram-login.js code "12345"
  node telegram-login.js password "your2FApassword"   (only if prompted)`);
  process.exit(1);
}
