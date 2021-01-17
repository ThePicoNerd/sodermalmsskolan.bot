import dotenv from "dotenv";
dotenv.config();

import InstagramService, { InstagramDirectRecipients, InstagramUID } from "./instagram/InstagramService";
import Discord from "discord.js";
import Listr from "listr";
import mongoose from "mongoose";
import User from "./models/user/User";
import Koa from "koa";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import findUserByToken from "./models/user/findUserByToken";
import Service from "./models/service/Service";

const { IG_USERNAME, IG_PASSWORD, DISCORD_TOKEN, MONGODB_URI, JWT_SECRET, DISCORD_GUILD, DISCORD_BROADCAST_ROLE, PORT = 8080 } = process.env;

const EXTERNAL_URL = process.env.EXTERNAL_URL || `http://localhost:${PORT}`;

const ig = new InstagramService(JWT_SECRET);
const discord = new Discord.Client();

let db: mongoose.Connection;

const preflightTasks = new Listr([
  {
    title: "Connect to database",
    task: () => new Promise<void>((resolve) => {
      mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

      db = mongoose.connection;

      db.once("open", resolve);
    }),
  },
  {
    title: "Log in to actions",
    task: () => new Listr([
      {
        title: "Instagram",
        task: () => ig.login(IG_USERNAME, IG_PASSWORD),
      }
    ], {
      concurrent: true,
    }),
  },
  {
    title: "Enable Discord bot",
    task: () => discord.login(DISCORD_TOKEN),
  }
]);

discord.on("message", async (msg) => {
  if (msg.author.bot) {
    return;
  }

  if (msg.channel.type === "dm") {
    const guild = await discord.guilds.fetch(DISCORD_GUILD);

    const member = await guild.members.fetch(msg.author.id);

    if (!member.roles.cache.has(DISCORD_BROADCAST_ROLE)) {
      return;
    }

    try {
      const users = await User.find();

      const instagramThreads: InstagramDirectRecipients[] = [];

      await Promise.all(users.map(async ({ instagram }) => {
        if (instagram?.verified) {
          instagramThreads.push([instagram.uid]);
        }
      }));

      await Promise.all([
        ig.broadcastDiscordMessage(instagramThreads, msg)
      ]);

      msg.react("📢");
    } catch (error) {
      msg.react("❌");
    }
  }
});

interface KoaState {
  authToken?: string;
}

const app = new Koa<KoaState>();
const router = new Router<KoaState>();

app.use(bodyParser());
app.use(cors());

app.use(async (ctx, next) => {
  ctx.state.authToken = ctx.get("authorization").split(" ")[1];

  await next();
});

router.get("/instagram/verify", async (ctx) => {
  const token: string = ctx.query.token?.toString();

  if (!token) {
    ctx.status = 400;
    return ctx.body = "`?token` must be set"
  }

  try {
    const { internalUid, instagramUid } = await ig.verifyToken(token);

    const user = await User.findOne({
      uid: internalUid,
    }).exec();

    if (!user?.instagram) {
      ctx.body = 500;
      return ctx.body = "oof";
    }

    if (user.instagram?.uid === instagramUid) {
      user.instagram.verified = true;
    } else {
      ctx.status = 403;
      return ctx.body = "invalid token";
    }

    await user.save();

    ctx.redirect("https://södermalmsskolan.com/konto/notiser");
  } catch (error) {
    ctx.status = 400;
    return ctx.body = "could not verify token (it might be invalid)";
  }
});

router.post("/instagram/subscribe", async (ctx) => {
  const username = ctx.request.body?.username;

  if (!username) {
    ctx.status = 400;
    return ctx.body = "`username` was not provided";
  }

  const user = await findUserByToken(ctx.state.authToken);

  let uid: InstagramUID;

  try {
    uid = await ig.getUidFromUsername(username);
  } catch (error) {
    ctx.status = 404;
    return ctx.body = "user not found";
  }

  user.instagram = new Service({
    uid,
    verified: false,
  })

  await user.save();

  await ig.sendVerificationMessage({
    username,
    internalUid: user.uid,
    getUrl: (token) => `${EXTERNAL_URL}/instagram/verify?token=${token}`,
  });

  ctx.body = "verification sent";
});

router.get("/instagram/status", async (ctx) => {
  const user = await findUserByToken(ctx.state.authToken);

  const uid = user.instagram?.uid;
  const verified = user.instagram?.verified;

  let username: string;

  if (uid) {
    const details = await ig.getUserInfo(uid);

    username = details.username;
  }

  return ctx.body = {
    uid,
    verified: typeof verified !== "undefined" ? verified : false,
    username,
  };
});

router.get("/health", (ctx) => {
  return ctx.body = "health ok";
});

app
  .use(router.routes())
  .use(router.allowedMethods());

preflightTasks.run().then(() => {
  app.listen(PORT, () => {
    console.info(`listening on :${PORT}`);
  });
});
