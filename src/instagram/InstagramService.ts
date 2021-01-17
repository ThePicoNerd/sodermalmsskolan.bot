import { Message } from "discord.js";
import { AccountRepositoryLoginResponseLogged_in_user, DirectThreadEntity, IgApiClient, UserRepositoryInfoResponseUser } from "instagram-private-api";
import { TypedEmitter } from "tiny-typed-emitter";
import got from "got";
import jwt from "jsonwebtoken";

export type InstagramUID = string;

export type InstagramDirectRecipients = InstagramUID[];

export interface InstagramServiceEvents {
  login: (response: AccountRepositoryLoginResponseLogged_in_user) => void;
}

export interface InstagramDirectMessage {
  text?: string;
  images?: Buffer[];
}

export interface InstagramVerificationPayload extends Record<string, unknown> {
  internalUid: string;
  instagramUid: InstagramUID;
}

export default class InstagramService extends TypedEmitter<InstagramServiceEvents> {
  private client: IgApiClient;

  private jwtSecret: string;

  constructor(jwtSecret: string) {
    super();
    this.client = new IgApiClient();
    this.jwtSecret = jwtSecret;
  }

  public async login(username: string, password: string): Promise<void> {
    this.client.state.generateDevice(username);
    await this.client.simulate.preLoginFlow();
    const response = await this.client.account.login(username, password);

    this.emit("login", response);
  }

  public async getUidFromUsername(username: string): Promise<InstagramUID> {
    const userId = await this.client.user.getIdByUsername(username);

    return userId.toString(); // No sane person stores their IDs as numbers.
  }

  public async getUserInfo(uid: InstagramUID): Promise<UserRepositoryInfoResponseUser> {
    return this.client.user.info(uid);
  }

  public getDirectThread(recipients: InstagramDirectRecipients): DirectThreadEntity {
    return this.client.entity.directThread(recipients);
  }

  public async dm(recipients: InstagramDirectRecipients, { text, images }: InstagramDirectMessage): Promise<void> {
    const thread = this.getDirectThread(recipients);

    await Promise.all(images?.map((buffer) => thread.broadcastPhoto({
      file: buffer,
    })));

    if (typeof text === "string") {
      await thread.broadcastText(text);
    }
  }

  public static async getDirectMessageFromDiscord(
    { attachments, content }: Message,
  ): Promise<InstagramDirectMessage> {
    const images = await Promise.all(
      attachments.map((attachment) => got.get(attachment.url).buffer()),
    );

    return {
      images,
      text: content,
    }
  }

  public async broadcastDiscordMessage(threads: InstagramDirectRecipients[], discordMessage: Message): Promise<void> {
    const message = await InstagramService.getDirectMessageFromDiscord(discordMessage);

    await Promise.all(threads.map((recipients) => this.dm(recipients, message)));
  }

  public async sendVerificationMessage({
    username,
    internalUid,
    getUrl,
  }: {
    username: string, internalUid: string, getUrl: (token: string) => string
  }): Promise<void> {
    const uid = await this.getUidFromUsername(username);

    const payload: InstagramVerificationPayload = {
      instagramUid: uid,
      internalUid: internalUid,
    }

    const token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: 86400 // 24 hours
    });

    const thread = this.getDirectThread([uid]);

    await thread.broadcastText(`Klicka på länken för att slutföra registreringen: ${getUrl(token)}`);
  }

  public verifyToken(token: string): InstagramVerificationPayload {
    return jwt.verify(token, this.jwtSecret) as InstagramVerificationPayload;
  }
}
