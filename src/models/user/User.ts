import mongoose, { Schema, Document } from "mongoose";
import { IService, ServiceSchema } from "../service/Service";

export interface IUser extends Document {
  uid: string;
  instagram?: IService;
}

export const UserSchema: Schema = new Schema({
  uid: {
    type: String,
    required: true,
    unique: true,
  },
  instagram: {
    type: ServiceSchema,
    required: false,
  }
});

export default mongoose.model<IUser>("User", UserSchema);
