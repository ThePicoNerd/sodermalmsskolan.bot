import User, { IUser } from "./User";
import admin from "../../firebase/admin";

const findUserByToken = async (token: string): Promise<IUser> => {
  if (typeof token === "undefined") {
    return undefined;
  }

  const { uid } = await admin.auth().verifyIdToken(token);

  const user = await User.findOne({
    uid,
  }).exec();

  if (!user) {
    return User.create({
      uid,
    });
  }

  return user;
}

export default findUserByToken;
