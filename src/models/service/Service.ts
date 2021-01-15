import mongoose, { Schema, Document } from "mongoose";

export interface IService extends Document {
  uid: string;
  verified: boolean;
}

export const ServiceSchema: Schema = new Schema({
  uid: {
    type: String,
    required: true,
  },
  verified: {
    type: Boolean,
    required: false,
    default: false,
  }
});

export default mongoose.model<IService>("Service", ServiceSchema);
